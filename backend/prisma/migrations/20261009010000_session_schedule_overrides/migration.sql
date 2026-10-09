ALTER TYPE "NotificationType" ADD VALUE 'SESSION_RESCHEDULED';
CREATE TABLE "session_schedule_overrides" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "program_assignment_id" TEXT NOT NULL REFERENCES "program_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "session_id" TEXT NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "original_date" DATE NOT NULL,
  "scheduled_date" DATE NOT NULL,
  "reason" TEXT,
  "created_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "session_schedule_overrides_program_assignment_id_session_id_key" ON "session_schedule_overrides"("program_assignment_id", "session_id");
CREATE INDEX "session_schedule_overrides_session_id_idx" ON "session_schedule_overrides"("session_id");
CREATE INDEX "session_schedule_overrides_created_by_user_id_idx" ON "session_schedule_overrides"("created_by_user_id");
