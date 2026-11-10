ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_PLAN_WARNING';

CREATE TABLE "training_week_plans" (
    "id" TEXT NOT NULL,
    "program_assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "week_index" INTEGER NOT NULL,
    "training_dates" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_week_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_week_plans_week_index_check" CHECK ("week_index" >= 0),
    CONSTRAINT "training_week_plans_training_dates_check" CHECK (jsonb_typeof("training_dates") = 'array')
);

CREATE UNIQUE INDEX "training_week_plans_program_assignment_id_week_index_key"
ON "training_week_plans"("program_assignment_id", "week_index");

CREATE INDEX "training_week_plans_student_id_updated_at_idx"
ON "training_week_plans"("student_id", "updated_at");

ALTER TABLE "training_week_plans"
ADD CONSTRAINT "training_week_plans_program_assignment_id_fkey"
FOREIGN KEY ("program_assignment_id") REFERENCES "program_assignments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_week_plans"
ADD CONSTRAINT "training_week_plans_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
