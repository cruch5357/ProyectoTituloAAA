CREATE TYPE "WorkoutCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "workout_correction_requests" (
  "id" TEXT NOT NULL,
  "program_assignment_id" TEXT NOT NULL,
  "workout_log_id" TEXT,
  "session_id" TEXT NOT NULL,
  "session_exercise_id" TEXT NOT NULL,
  "set_number" INTEGER NOT NULL,
  "student_id" TEXT NOT NULL,
  "coach_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "session_name" TEXT NOT NULL,
  "exercise_name" TEXT NOT NULL,
  "scheduled_date" DATE NOT NULL,
  "original_status" TEXT NOT NULL,
  "original_load" DECIMAL(6,2),
  "original_reps" INTEGER,
  "original_rpe" DECIMAL(3,1),
  "proposed_load" DECIMAL(6,2),
  "proposed_reps" INTEGER,
  "proposed_rpe" DECIMAL(3,1),
  "proposed_fields" TEXT[] NOT NULL,
  "reason" TEXT,
  "status" "WorkoutCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workout_correction_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workout_correction_requests_set_number_check" CHECK ("set_number" > 0),
  CONSTRAINT "workout_correction_requests_values_check" CHECK (cardinality("proposed_fields") > 0)
);

CREATE UNIQUE INDEX "workout_correction_requests_message_id_key" ON "workout_correction_requests"("message_id");
CREATE UNIQUE INDEX "workout_correction_requests_pending_target_key"
  ON "workout_correction_requests"("program_assignment_id", "session_id", "session_exercise_id", "set_number")
  WHERE "status" = 'PENDING';
CREATE INDEX "workout_correction_requests_student_id_created_at_idx" ON "workout_correction_requests"("student_id", "created_at");
CREATE INDEX "workout_correction_requests_coach_id_status_created_at_idx" ON "workout_correction_requests"("coach_id", "status", "created_at");
CREATE INDEX "workout_correction_requests_program_assignment_id_session_id_idx" ON "workout_correction_requests"("program_assignment_id", "session_id");

ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_program_assignment_id_fkey" FOREIGN KEY ("program_assignment_id") REFERENCES "program_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_workout_log_id_fkey" FOREIGN KEY ("workout_log_id") REFERENCES "workout_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_correction_requests" ADD CONSTRAINT "workout_correction_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "training_session_dismissals" (
  "id" TEXT NOT NULL,
  "program_assignment_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_session_dismissals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_session_dismissals_program_assignment_id_session_id_key"
  ON "training_session_dismissals"("program_assignment_id", "session_id");
CREATE INDEX "training_session_dismissals_student_id_created_at_idx"
  ON "training_session_dismissals"("student_id", "created_at");

ALTER TABLE "training_session_dismissals" ADD CONSTRAINT "training_session_dismissals_program_assignment_id_fkey" FOREIGN KEY ("program_assignment_id") REFERENCES "program_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_session_dismissals" ADD CONSTRAINT "training_session_dismissals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_session_dismissals" ADD CONSTRAINT "training_session_dismissals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
