-- PROMPT 08: mismo patron que 20260923150000_exercises_soft_delete.
-- Agrega baja logica reversible a Program, consistente con
-- User.isActive (PROMPT 02) y Exercise.isActive (PROMPT 07). Nunca se
-- implementa un DELETE fisico de Program: la relacion
-- programs.coach_id -> users.id ya es RESTRICT y programs tiene
-- dependientes (blocks, program_assignments) que a su vez son la raiz de
-- toda la jerarquia de prescripcion.
ALTER TABLE "programs" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
