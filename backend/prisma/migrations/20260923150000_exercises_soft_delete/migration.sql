-- PROMPT 07: catalogo de ejercicios.
--
-- Agrega "is_active" a "exercises": permite dar de baja logica un ejercicio
-- del catalogo del coach sin eliminarlo fisicamente. La FK
-- session_exercises.exercise_id -> exercises.id ya es RESTRICT desde la
-- migracion inicial (docs/database.md, seccion 8.2), asi que un ejercicio
-- referenciado por alguna prescripcion nunca pudo borrarse fisicamente; lo
-- que faltaba era la columna para representar "desactivado" (mismo patron
-- ya usado en users.is_active, PROMPT 02/04).
--
-- Todas las filas existentes quedan activas por defecto (true), que es el
-- comportamiento actual implicito antes de que existiera esta columna.

ALTER TABLE "exercises" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
