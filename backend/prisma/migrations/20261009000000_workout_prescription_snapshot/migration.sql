-- Additive only: old workouts retain NULL, never backfill invented history.
ALTER TABLE "workout_logs" ADD COLUMN "prescription_captured_at" TIMESTAMP(3);
CREATE TABLE "workout_prescriptions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workout_log_id" TEXT NOT NULL REFERENCES "workout_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "session_exercise_id" TEXT NOT NULL REFERENCES "session_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "exercise_id" TEXT NOT NULL,
  "exercise_name" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "target_sets" INTEGER,
  "target_reps_min" INTEGER,
  "target_reps_max" INTEGER,
  "target_rpe" DECIMAL(3,1),
  "target_rir" INTEGER,
  "rest_seconds" INTEGER,
  "notes" TEXT
);
CREATE UNIQUE INDEX "workout_prescriptions_workout_log_id_session_exercise_id_key" ON "workout_prescriptions"("workout_log_id", "session_exercise_id");
CREATE INDEX "workout_prescriptions_session_exercise_id_idx" ON "workout_prescriptions"("session_exercise_id");
