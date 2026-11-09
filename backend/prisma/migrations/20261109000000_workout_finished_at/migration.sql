ALTER TABLE "workout_logs" ADD COLUMN "finished_at" TIMESTAMP(3);

-- Existing structured executions used duration_minutes as their closure flag.
-- Preserve that history while allowing new closed sessions to have unknown duration.
UPDATE "workout_logs"
SET "finished_at" = "updated_at"
WHERE "structured_execution" = TRUE
  AND "duration_minutes" IS NOT NULL;
