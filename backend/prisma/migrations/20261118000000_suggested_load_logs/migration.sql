-- Predicciones del modelo de carga sugerida, para medir su acierto real.
-- CreateTable
CREATE TABLE "suggested_load_logs" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "last_session_date" DATE NOT NULL,
    "target_reps" INTEGER NOT NULL,
    "suggested_load_kg" DECIMAL(6,2) NOT NULL,
    "range_low_kg" DECIMAL(6,2),
    "range_high_kg" DECIMAL(6,2),
    "last_e1rm_kg" DECIMAL(6,2) NOT NULL,
    "predicted_e1rm_kg" DECIMAL(6,2) NOT NULL,
    "adjustments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggested_load_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suggested_load_logs_student_id_exercise_id_idx" ON "suggested_load_logs"("student_id", "exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "suggested_load_logs_student_id_exercise_id_last_session_dat_key" ON "suggested_load_logs"("student_id", "exercise_id", "last_session_date", "target_reps", "model_version");

-- AddForeignKey
ALTER TABLE "suggested_load_logs" ADD CONSTRAINT "suggested_load_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggested_load_logs" ADD CONSTRAINT "suggested_load_logs_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
