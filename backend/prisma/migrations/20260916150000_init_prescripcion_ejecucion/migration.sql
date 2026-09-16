-- CreateEnum
CREATE TYPE "Role" AS ENUM ('COACH', 'STUDENT');
CREATE TYPE "ProgramAssignmentStatus" AS ENUM ('ACTIVE', 'FINISHED');
CREATE TYPE "WorkoutCompletionStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'SKIPPED');
CREATE TYPE "ExcelImportStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED');
CREATE TYPE "ExcelImportRowStatus" AS ENUM ('VALID', 'INVALID');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "coachId" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT,
    "instructions" TEXT,
    "video_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_weeks" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weeks" (
    "id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weeks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "week_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session_exercises" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "target_sets" INTEGER,
    "target_reps_min" INTEGER,
    "target_reps_max" INTEGER,
    "target_rpe" DECIMAL(3,1),
    "target_rir" INTEGER,
    "rest_seconds" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "session_exercises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_assignments" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "ProgramAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "program_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workout_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion_status" "WorkoutCompletionStatus" NOT NULL,
    "overall_rpe" DECIMAL(3,1),
    "fatigue" INTEGER,
    "comments" TEXT,
    "duration_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "set_logs" (
    "id" TEXT NOT NULL,
    "workout_log_id" TEXT NOT NULL,
    "session_exercise_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "actual_reps" INTEGER,
    "actual_load" DECIMAL(6,2),
    "actual_rpe" DECIMAL(3,1),
    "actual_rir" INTEGER,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "set_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "excel_import_batches" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "status" "ExcelImportStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    CONSTRAINT "excel_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "excel_import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "status" "ExcelImportRowStatus" NOT NULL,
    "errors" JSONB,
    "result_session_exercise_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "excel_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "session_id" TEXT,
    "session_exercise_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique)
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "blocks_program_id_order_key" ON "blocks"("program_id", "order");
CREATE UNIQUE INDEX "weeks_block_id_order_key" ON "weeks"("block_id", "order");
CREATE UNIQUE INDEX "sessions_week_id_order_key" ON "sessions"("week_id", "order");
CREATE UNIQUE INDEX "session_exercises_session_id_order_key" ON "session_exercises"("session_id", "order");
CREATE UNIQUE INDEX "set_logs_workout_log_id_session_exercise_id_set_number_key" ON "set_logs"("workout_log_id", "session_exercise_id", "set_number");
CREATE UNIQUE INDEX "excel_import_rows_batch_id_row_number_key" ON "excel_import_rows"("batch_id", "row_number");

-- Indice unico PARCIAL: evita una asignacion ACTIVA duplicada del mismo
-- programa al mismo alumno, sin impedir reasignar el mismo programa una vez
-- finalizado (docs/database.md, seccion "Program Assignment"). Prisma no
-- expresa indices parciales en el DSL, por eso se agrega aqui a mano.
CREATE UNIQUE INDEX "program_assignments_active_unique"
    ON "program_assignments"("program_id", "student_id")
    WHERE "status" = 'ACTIVE';

-- CreateIndex (busqueda / FK)
CREATE INDEX "users_coachId_idx" ON "users"("coachId");
CREATE INDEX "exercises_coach_id_idx" ON "exercises"("coach_id");
CREATE INDEX "programs_coach_id_idx" ON "programs"("coach_id");
CREATE INDEX "blocks_program_id_idx" ON "blocks"("program_id");
CREATE INDEX "weeks_block_id_idx" ON "weeks"("block_id");
CREATE INDEX "sessions_week_id_idx" ON "sessions"("week_id");
CREATE INDEX "session_exercises_session_id_idx" ON "session_exercises"("session_id");
CREATE INDEX "program_assignments_student_id_idx" ON "program_assignments"("student_id");
CREATE INDEX "program_assignments_program_id_idx" ON "program_assignments"("program_id");
CREATE INDEX "workout_logs_student_id_performed_at_idx" ON "workout_logs"("student_id", "performed_at");
CREATE INDEX "workout_logs_session_id_idx" ON "workout_logs"("session_id");
CREATE INDEX "set_logs_session_exercise_id_idx" ON "set_logs"("session_exercise_id");
CREATE INDEX "excel_import_batches_coach_id_idx" ON "excel_import_batches"("coach_id");
CREATE INDEX "excel_import_rows_batch_id_idx" ON "excel_import_rows"("batch_id");
CREATE INDEX "messages_sender_id_receiver_id_created_at_idx" ON "messages"("sender_id", "receiver_id", "created_at");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "programs" ADD CONSTRAINT "programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_workout_log_id_fkey" FOREIGN KEY ("workout_log_id") REFERENCES "workout_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "excel_import_batches" ADD CONSTRAINT "excel_import_batches_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "excel_import_rows" ADD CONSTRAINT "excel_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "excel_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "excel_import_rows" ADD CONSTRAINT "excel_import_rows_result_session_exercise_id_fkey" FOREIGN KEY ("result_session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraints (docs/database.md, seccion "Integridad y constraints";
-- Prisma no expresa CHECK multi-columna de forma portable en el DSL, se
-- agregan aqui a mano).
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_target_rpe_range" CHECK ("target_rpe" IS NULL OR ("target_rpe" >= 0 AND "target_rpe" <= 10));
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_target_rir_nonneg" CHECK ("target_rir" IS NULL OR "target_rir" >= 0);
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_target_sets_positive" CHECK ("target_sets" IS NULL OR "target_sets" > 0);
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_target_reps_nonneg" CHECK ("target_reps_min" IS NULL OR "target_reps_min" >= 0);
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_target_reps_range" CHECK ("target_reps_max" IS NULL OR "target_reps_min" IS NULL OR "target_reps_max" >= "target_reps_min");
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_rest_seconds_nonneg" CHECK ("rest_seconds" IS NULL OR "rest_seconds" >= 0);

ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_overall_rpe_range" CHECK ("overall_rpe" IS NULL OR ("overall_rpe" >= 0 AND "overall_rpe" <= 10));
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_fatigue_range" CHECK ("fatigue" IS NULL OR ("fatigue" >= 0 AND "fatigue" <= 10));
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_duration_nonneg" CHECK ("duration_minutes" IS NULL OR "duration_minutes" >= 0);

ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_set_number_positive" CHECK ("set_number" > 0);
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_actual_reps_nonneg" CHECK ("actual_reps" IS NULL OR "actual_reps" >= 0);
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_actual_load_nonneg" CHECK ("actual_load" IS NULL OR "actual_load" >= 0);
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_actual_rpe_range" CHECK ("actual_rpe" IS NULL OR ("actual_rpe" >= 0 AND "actual_rpe" <= 10));
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_actual_rir_nonneg" CHECK ("actual_rir" IS NULL OR "actual_rir" >= 0);

ALTER TABLE "programs" ADD CONSTRAINT "programs_duration_weeks_positive" CHECK ("duration_weeks" IS NULL OR "duration_weeks" > 0);
ALTER TABLE "excel_import_rows" ADD CONSTRAINT "excel_import_rows_row_number_positive" CHECK ("row_number" > 0);
