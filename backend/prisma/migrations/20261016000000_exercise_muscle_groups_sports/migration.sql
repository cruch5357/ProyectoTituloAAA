-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "muscle_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sports" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: los ejercicios existentes cuyo grupo muscular (texto libre) coincide
-- con uno de los 11 grupos del catalogo quedan clasificados automaticamente.
-- Los que no coinciden (ej. "Piernas") conservan su texto y el coach puede
-- reclasificarlos desde el formulario.
UPDATE "exercises" SET "muscle_groups" = ARRAY[m.key]
FROM (VALUES
  ('pecho', 'chest'), ('pectorales', 'chest'), ('pectoral', 'chest'),
  ('espalda', 'back'), ('dorsales', 'back'), ('dorsal', 'back'),
  ('hombros', 'shoulders'), ('hombro', 'shoulders'), ('deltoides', 'shoulders'),
  ('bíceps', 'biceps'), ('biceps', 'biceps'),
  ('tríceps', 'triceps'), ('triceps', 'triceps'),
  ('antebrazos', 'forearms'), ('antebrazo', 'forearms'),
  ('abdomen', 'abs'), ('abdominales', 'abs'), ('core', 'abs'),
  ('cuádriceps', 'quadriceps'), ('cuadriceps', 'quadriceps'),
  ('isquiotibiales', 'hamstrings'), ('isquios', 'hamstrings'), ('femoral', 'hamstrings'),
  ('glúteos', 'glutes'), ('gluteos', 'glutes'), ('glúteo', 'glutes'), ('gluteo', 'glutes'),
  ('pantorrillas', 'calves'), ('pantorrilla', 'calves'), ('gemelos', 'calves')
) AS m(name, key)
WHERE lower(trim("exercises"."muscle_group")) = m.name;
