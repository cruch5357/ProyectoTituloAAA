-- New logs identify their assignment; legacy history remains NULL, without invented backfill.
ALTER TABLE "workout_logs" ADD COLUMN "program_assignment_id" TEXT;
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_program_assignment_id_fkey" FOREIGN KEY ("program_assignment_id") REFERENCES "program_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "workout_logs_program_assignment_id_session_id_idx" ON "workout_logs"("program_assignment_id", "session_id");
