-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "is_assignment_snapshot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "session_exercises" ADD COLUMN     "frozen_exercise" JSONB;

-- AlterTable
ALTER TABLE "program_assignments" ADD COLUMN     "assigned_by_coach_id" TEXT,
ADD COLUMN     "snapshot_block_id" TEXT,
ADD COLUMN     "source_block_id" TEXT;

-- AlterTable
ALTER TABLE "workout_logs" ADD COLUMN     "omitted_sets" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "structured_execution" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_source_block_id_fkey" FOREIGN KEY ("source_block_id") REFERENCES "blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_snapshot_block_id_fkey" FOREIGN KEY ("snapshot_block_id") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_assigned_by_coach_id_fkey" FOREIGN KEY ("assigned_by_coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing assignments and workout identities are preserved. Only new block
-- assignments receive a private snapshot and the single-active-cycle rule.
CREATE UNIQUE INDEX "one_active_block_cycle" ON "program_assignments"("student_id") WHERE "status" = 'ACTIVE' AND "snapshot_block_id" IS NOT NULL;

CREATE FUNCTION enforce_block_cycle() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    PERFORM id FROM users WHERE id = NEW.student_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM program_assignments a WHERE a.student_id = NEW.student_id AND a.id <> NEW.id AND a.status = 'ACTIVE' AND (a.snapshot_block_id IS NOT NULL OR NEW.snapshot_block_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'El alumno ya tiene un ciclo activo' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER block_cycle_conflict BEFORE INSERT OR UPDATE OF status ON program_assignments FOR EACH ROW EXECUTE FUNCTION enforce_block_cycle();

CREATE FUNCTION check_prescribed_set_limit() RETURNS trigger AS $$
DECLARE structured boolean; allowed_count integer;
BEGIN
  SELECT structured_execution INTO structured FROM workout_logs WHERE id = NEW.workout_log_id;
  IF structured THEN
    SELECT COALESCE(se.target_sets, 0) INTO allowed_count FROM session_exercises se JOIN workout_logs l ON l.session_id = se.session_id WHERE se.id = NEW.session_exercise_id AND l.id = NEW.workout_log_id;
    IF allowed_count IS NULL OR NEW.set_number < 1 OR NEW.set_number > allowed_count THEN
      RAISE EXCEPTION 'Solo puedes registrar las series prescritas' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER prescribed_set_limit BEFORE INSERT OR UPDATE OF set_number, session_exercise_id, workout_log_id ON set_logs FOR EACH ROW EXECUTE FUNCTION check_prescribed_set_limit();
