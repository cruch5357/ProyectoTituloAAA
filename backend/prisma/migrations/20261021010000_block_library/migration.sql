-- CreateEnum
CREATE TYPE "SetPriority" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "blocks" ADD COLUMN     "coach_id" TEXT,
ADD COLUMN     "folder_id" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "program_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "session_exercises" ADD COLUMN     "modifiers" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "block_folders" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,

    CONSTRAINT "block_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_modifiers" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "exercise_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmed_sets" (
    "id" TEXT NOT NULL,
    "session_exercise_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "weight" DECIMAL(6,2),
    "reps" INTEGER,
    "rpe" DECIMAL(3,1),
    "priority" "SetPriority" NOT NULL DEFAULT 'low',

    CONSTRAINT "programmed_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "block_folders_coach_id_normalized_name_key" ON "block_folders"("coach_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_modifiers_coach_id_normalized_name_key" ON "exercise_modifiers"("coach_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "programmed_sets_session_exercise_id_order_key" ON "programmed_sets"("session_exercise_id", "order");

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "block_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_folders" ADD CONSTRAINT "block_folders_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_modifiers" ADD CONSTRAINT "exercise_modifiers_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmed_sets" ADD CONSTRAINT "programmed_sets_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blocks" ADD CONSTRAINT "block_owner" CHECK (("program_id" IS NOT NULL AND "coach_id" IS NULL) OR ("program_id" IS NULL AND "coach_id" IS NOT NULL));
CREATE INDEX "blocks_coach_id_idx" ON "blocks"("coach_id");
ALTER TABLE "programmed_sets" ADD CONSTRAINT "programmed_set_values" CHECK ("order" > 0 AND ("weight" IS NULL OR "weight" >= 0) AND ("reps" IS NULL OR "reps" BETWEEN 0 AND 10000) AND ("rpe" IS NULL OR "rpe" BETWEEN 0 AND 10));

-- Independent blocks use at most seven sessions, including direct SQL writes.
CREATE FUNCTION check_library_session_limit() RETURNS trigger AS $$
BEGIN
  PERFORM id FROM weeks WHERE id = NEW.week_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM weeks w JOIN blocks b ON b.id = w.block_id WHERE w.id = NEW.week_id AND b.program_id IS NULL)
     AND (SELECT count(*) FROM sessions WHERE week_id = NEW.week_id AND id <> NEW.id) >= 7 THEN
    RAISE EXCEPTION 'Máximo 7 días por semana' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER library_session_limit BEFORE INSERT OR UPDATE OF week_id ON sessions FOR EACH ROW EXECUTE FUNCTION check_library_session_limit();

