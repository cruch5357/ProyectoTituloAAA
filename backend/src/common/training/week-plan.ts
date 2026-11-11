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

export function assessTrainingWeek(
  trainingDates: string[],
  prescribedSessions: number,
  organizedSessions = sortedUnique(trainingDates).length,
): TrainingWeekAssessment {
  const plannedSessions = Math.min(
    prescribedSessions,
    Math.max(0, organizedSessions),
  );
  const missingSessions = Math.max(0, prescribedSessions - organizedSessions);
  const consecutive = maxConsecutive(trainingDates);
  const base = {
    plannedSessions,
    prescribedSessions,
    missingSessions,
    maxConsecutiveDays: consecutive,
  };

  if (prescribedSessions >= 5) {
    return {
      ...base,
      level: 'HIGH',
      code: 'HIGH_FREQUENCY',
      message:
        'Esta semana incluye 5 o más sesiones. Distribúyelas según las indicaciones de tu coach y tu recuperación.',
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
        'Planificaste 4 o más días seguidos. Considera dejar un día de recuperación, especialmente si se repiten grupos musculares o cargas altas.',
    };
  }
  if (consecutive >= 3) {
    return {
      ...base,
      level: 'CAUTION',
      code: 'THREE_CONSECUTIVE',
      message:
        'Planificaste 3 días seguidos. Considera dejar un día de recuperación antes de volver a entrenar.',
    };
  }
  if (missingSessions) {
    return {
      ...base,
      level: 'CAUTION',
      code: 'INCOMPLETE',
      message:
        'Todavía tienes sesiones por organizar. Puedes distribuirlas entre los días disponibles.',
    };
  }
  if (consecutive === 2) {
    return {
      ...base,
      level: 'BALANCED',
      code: 'TWO_CONSECUTIVE',
      message:
        'Planificaste dos días seguidos. Puede ser adecuado si cambia el grupo muscular o la carga; revisa las indicaciones de tu coach.',
    };
  }
  return {
    ...base,
    level: 'BALANCED',
    code: 'BALANCED',
    message:
      'Buena distribución: dejaste días de recuperación entre tus entrenamientos.',
  };
}

export function recommendTrainingDates(
  availableFrom: string,
  weekEnd: string,
  sessionsToPlan: number,
  today: string,
  occupiedDates: string[] = [],
) {
  const first = Math.max(dayNumber(availableFrom), dayNumber(today));
  const last = dayNumber(weekEnd);
  const occupied = new Set(occupiedDates.map(dayNumber));
  const available = Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, index) => first + index,
  ).filter((day) => !occupied.has(day));
  const count = Math.min(Math.max(0, sessionsToPlan), available.length);
  if (!count) return [];

  // At most seven days are considered. Trying every valid combination keeps
  // the recommendation deterministic and lets real workouts participate in
  // the spacing without assigning a fictitious date to any pending session.
  const combinations: number[][] = [];
  const visit = (start: number, current: number[]) => {
    if (current.length === count) {
      combinations.push(current);
      return;
    }
    for (
      let index = start;
      index <= available.length - (count - current.length);
      index += 1
    ) {
      visit(index + 1, [...current, available[index]]);
    }
  };
  visit(0, []);
  const score = (candidate: number[]) => {
    const all = [...new Set([...occupied, ...candidate])].sort((a, b) => a - b);
    const gaps = all.slice(1).map((day, index) => day - all[index]);
    const minimumGap = gaps.length ? Math.min(...gaps) : 7;
    const consecutivePairs = gaps.filter((gap) => gap === 1).length;
    const spread = all.length > 1 ? all.at(-1)! - all[0] : 0;
    return [minimumGap, -consecutivePairs, spread] as const;
  };
  combinations.sort((left, right) => {
    const a = score(left);
    const b = score(right);
    return (
      b[0] - a[0] ||
      b[1] - a[1] ||
      b[2] - a[2] ||
      left.join(',').localeCompare(right.join(','))
    );
  });
  return combinations[0].map((day) =>
    new Date(day * DAY_MS).toISOString().slice(0, 10),
  );
}
