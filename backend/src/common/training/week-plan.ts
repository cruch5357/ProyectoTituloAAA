export type TrainingWeekPlanLevel =
  'UNPLANNED' | 'BALANCED' | 'CAUTION' | 'HIGH';

export type TrainingWeekAssessment = {
  level: TrainingWeekPlanLevel;
  code:
    | 'NO_PLAN'
    | 'BALANCED'
    | 'TWO_CONSECUTIVE'
    | 'INCOMPLETE'
    | 'THREE_CONSECUTIVE'
    | 'FOUR_CONSECUTIVE'
    | 'HIGH_FREQUENCY';
  message: string;
  plannedSessions: number;
  prescribedSessions: number;
  missingSessions: number;
  maxConsecutiveDays: number;
  restDays: number;
  historicalAverageRestDays: number | null;
};

const DAY_MS = 86_400_000;

function dayNumber(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`) / DAY_MS;
}

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function maxConsecutive(values: string[]) {
  const days = sortedUnique(values).map(dayNumber);
  let current = days.length ? 1 : 0;
  let maximum = current;
  for (let index = 1; index < days.length; index += 1) {
    current = days[index] - days[index - 1] === 1 ? current + 1 : 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function averageRestDays(values: string[]) {
  const days = sortedUnique(values).map(dayNumber);
  if (days.length < 2) return null;
  const rests = days
    .slice(1)
    .map((day, index) => Math.max(0, day - days[index] - 1));
  return (
    Math.round(
      (rests.reduce((total, rest) => total + rest, 0) / rests.length) * 10,
    ) / 10
  );
}

export function assessTrainingWeek(
  trainingDates: string[],
  prescribedSessions: number,
  recentWorkoutDates: string[] = [],
): TrainingWeekAssessment {
  const plannedSessions = sortedUnique(trainingDates).length;
  const missingSessions = Math.max(0, prescribedSessions - plannedSessions);
  const consecutive = maxConsecutive(trainingDates);
  const base = {
    plannedSessions,
    prescribedSessions,
    missingSessions,
    maxConsecutiveDays: consecutive,
    restDays: Math.max(0, 7 - plannedSessions),
    historicalAverageRestDays: averageRestDays(recentWorkoutDates),
  };

  if (prescribedSessions >= 5) {
    return {
      ...base,
      level: 'HIGH',
      code: 'HIGH_FREQUENCY',
      message:
        'La prescripción concentra 5 o más entrenamientos esta semana. El coach debe revisar la carga y asegurar recuperación suficiente.',
    };
  }
  if (!plannedSessions) {
    return {
      ...base,
      level: 'UNPLANNED',
      code: 'NO_PLAN',
      message:
        'Organiza tus días para anticipar el descanso. Esta elección no limita qué sesión semanal puedes realizar.',
    };
  }
  if (consecutive >= 4) {
    return {
      ...base,
      level: 'HIGH',
      code: 'FOUR_CONSECUTIVE',
      message:
        'Hay 4 o más días de entrenamiento seguidos. Reorganiza la semana y descansa al menos un día.',
    };
  }
  if (consecutive >= 3) {
    return {
      ...base,
      level: 'CAUTION',
      code: 'THREE_CONSECUTIVE',
      message:
        'Planificaste 3 días de entrenamiento seguidos. Descansa al menos un día antes de volver a entrenar.',
    };
  }
  if (missingSessions) {
    return {
      ...base,
      level: 'CAUTION',
      code: 'INCOMPLETE',
      message: `Aún faltan ${missingSessions} día${missingSessions === 1 ? '' : 's'} por organizar esta semana.`,
    };
  }
  if (consecutive === 2) {
    return {
      ...base,
      level: 'BALANCED',
      code: 'TWO_CONSECUTIVE',
      message:
        'Dos días seguidos son razonables. Procura dejar un día de descanso antes del siguiente entrenamiento.',
    };
  }
  return {
    ...base,
    level: 'BALANCED',
    code: 'BALANCED',
    message:
      'La distribución alterna entrenamiento y descanso de forma equilibrada.',
  };
}

export function recommendTrainingDates(
  availableFrom: string,
  weekEnd: string,
  prescribedSessions: number,
  today: string,
) {
  const first = Math.max(dayNumber(availableFrom), dayNumber(today));
  const last = dayNumber(weekEnd);
  const available = Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, index) => first + index,
  );
  const count = Math.min(Math.max(0, prescribedSessions), available.length);
  if (!count) return [];
  return Array.from({ length: count }, (_, index) => {
    const position = Math.floor((index * available.length) / count);
    return new Date(available[position] * DAY_MS).toISOString().slice(0, 10);
  });
}
