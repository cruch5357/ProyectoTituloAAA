-- PROMPT 03: autenticacion y autorizacion.
-- Agrega las tablas de soporte para refresh tokens (rotacion + deteccion de
-- reuso) e invitaciones de alumnos, segun docs/security.md (puntos 1, 9, 12)
-- y docs/database.md (seccion "Estado de implementacion (PROMPT 03)").
--
-- No se agregan tipos ENUM nuevos: el estado de estas dos tablas se deriva
-- de columnas de fecha (`expires_at`, `revoked_at`, `used_at`) en vez de un
-- enum de estado, para no duplicar la fuente de verdad (ver schema.prisma).

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

CREATE UNIQUE INDEX "student_invitations_token_hash_key" ON "student_invitations"("token_hash");
CREATE INDEX "student_invitations_coach_id_idx" ON "student_invitations"("coach_id");
CREATE INDEX "student_invitations_email_idx" ON "student_invitations"("email");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_invitations" ADD CONSTRAINT "student_invitations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
