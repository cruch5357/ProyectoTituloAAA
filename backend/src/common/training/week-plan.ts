export type TrainingWeekPlanLevel =
  'UNPLANNED' | 'BALANCED' | 'CAUTION' | 'HIGH';

export type TrainingWeekAssessmentBasis =
  'CONFIRMED' | 'POTENTIAL' | 'INSUFFICIENT' | 'GENERAL';

export type TrainingWeekSession = {
  sessionId?: string;
  name?: string;
  actualDate: string;
  status?: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETED' | 'SKIPPED';
  finished?: boolean;
  recordedSets: number;
  totalSets: number;
  omittedSets?: number;
  muscleGroups: string[];
  averageRpe?: number | null;
  averageRir?: number | null;
  overallRpe?: number | null;
};

export type PendingTrainingSession = {
  sessionId?: string;
  name?: string;
  totalSets?: number;
  muscleGroups: string[];
};

export type TrainingWeekAssessmentContext = {
  actualSessions?: TrainingWeekSession[];
  adjacentSessions?: TrainingWeekSession[];
  pendingSessions?: PendingTrainingSession[];
  weekStart?: string;
  weekEnd?: string;
};

export type TrainingWeekAssessment = {
  level: TrainingWeekPlanLevel;
  code:
    | 'NO_PLAN'
    | 'BALANCED'
    | 'TWO_CONSECUTIVE'
    | 'COMPATIBLE_CONSECUTIVE'
    | 'INCOMPLETE'
    | 'POTENTIAL_MUSCLE_CONFLICT'
    | 'CONFIRMED_MUSCLE_CONFLICT'
    | 'CONFIRMED_HIGH_LOAD_CONFLICT'
    | 'CONCENTRATED_DAYS'
    | 'SEVEN_DAY_WEEK'
    | 'WEEK_RECORDED';
  basis: TrainingWeekAssessmentBasis;
  title: string;
  message: string;
  recommendation: string | null;
  showRecoveryContext: boolean;
  notifyCoach: boolean;
  plannedSessions: number;
  prescribedSessions: number;
  missingSessions: number;
  maxConsecutiveDays: number;
  affectedMuscleGroups: string[];
};

export type TrainingDateRecommendation = {
  dates: string[];
  quality: 'IMPROVED' | 'EQUIVALENT' | 'LIMITED';
  reason: string;
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

const normalizeGroup = (group: string) =>
  group.trim().toLocaleLowerCase('es-CL');

function groupMap(groups: string[]) {
  return new Map(
    groups
      .map((group) => group.trim())
      .filter(Boolean)
      .map((group) => [normalizeGroup(group), group] as const),
  );
}

function overlappingGroups(left: string[], right: string[]) {
  const a = groupMap(left);
  const b = groupMap(right);
  return [...a.keys()]
    .filter((group) => b.has(group))
    .map((group) => a.get(group)!);
}

function naturalList(values: string[]) {
  const unique = [...new Set(values)];
  if (unique.length <= 1) return unique[0] ?? '';
  return `${unique.slice(0, -1).join(', ')} y ${unique.at(-1)}`;
}

function hasHighEffort(session: TrainingWeekSession) {
  return (
    (session.overallRpe != null && session.overallRpe >= 8) ||
    (session.averageRpe != null && session.averageRpe >= 8) ||
    (session.averageRir != null && session.averageRir <= 2)
  );
}

function realWork(session: TrainingWeekSession) {
  return (
    session.status !== 'SKIPPED' &&
    session.recordedSets > 0 &&
    session.muscleGroups.length > 0
  );
}

function completionSummary(sessions: TrainingWeekSession[]) {
  const counts = sessions.reduce(
    (result, session) => {
      if (session.status === 'COMPLETED') result.completed += 1;
      if (session.status === 'PARTIAL') result.partial += 1;
      if (session.status === 'SKIPPED') result.skipped += 1;
      return result;
    },
    { completed: 0, partial: 0, skipped: 0 },
  );
  return [
    counts.completed
      ? `${counts.completed} completada${counts.completed === 1 ? '' : 's'}`
      : null,
    counts.partial
      ? `${counts.partial} parcial${counts.partial === 1 ? '' : 'es'}`
      : null,
    counts.skipped
      ? `${counts.skipped} omitida${counts.skipped === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Evaluates what is known without assigning a pending session to a future day.
 * Keep the browser evaluator in weekPlanAdvice.ts aligned with these rules.
 */
export function assessTrainingWeek(
  trainingDates: string[],
  prescribedSessions: number,
  organizedSessions = sortedUnique(trainingDates).length,
  context: TrainingWeekAssessmentContext = {},
): TrainingWeekAssessment {
  const actualSessions = context.actualSessions ?? [];
  const adjacentSessions = context.adjacentSessions ?? [];
  const pendingSessions = context.pendingSessions ?? [];
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
  const result = (
    value: Omit<
      TrainingWeekAssessment,
      | 'plannedSessions'
      | 'prescribedSessions'
      | 'missingSessions'
      | 'maxConsecutiveDays'
    >,
  ): TrainingWeekAssessment => ({ ...base, ...value });

  const worked = [...adjacentSessions, ...actualSessions]
    .filter(realWork)
    .sort((left, right) => left.actualDate.localeCompare(right.actualDate));
  const confirmed = worked.flatMap((session, index) =>
    worked.slice(index + 1).flatMap((candidate) => {
      const gap = Math.abs(
        dayNumber(candidate.actualDate) - dayNumber(session.actualDate),
      );
      const groups =
        gap <= 1
          ? overlappingGroups(session.muscleGroups, candidate.muscleGroups)
          : [];
      return groups.length ? [{ session, candidate, groups }] : [];
    }),
  );
  if (confirmed.length) {
    const groups = [
      ...new Map(
        confirmed
          .flatMap((conflict) => conflict.groups)
          .map((group) => [normalizeGroup(group), group]),
      ).values(),
    ];
    const highLoad = confirmed.some(
      ({ session, candidate }) =>
        hasHighEffort(session) || hasHighEffort(candidate),
    );
    const label = naturalList(groups);
    return result({
      level: highLoad ? 'HIGH' : 'CAUTION',
      code: highLoad
        ? 'CONFIRMED_HIGH_LOAD_CONFLICT'
        : 'CONFIRMED_MUSCLE_CONFLICT',
      basis: 'CONFIRMED',
      title: `Atención a la recuperación de ${label}`,
      message: `Trabajaste ${label} en días consecutivos${highLoad ? ' y el esfuerzo registrado fue alto' : ''}. ${highLoad ? 'Podrías necesitar más recuperación antes de repetir trabajo intenso.' : 'Si las sesiones fueron exigentes, podrías necesitar más recuperación.'}`,
      recommendation: `Considera espaciar el próximo trabajo intenso de ${label} o reducir su carga según cómo te sientas.`,
      showRecoveryContext: true,
      notifyCoach: true,
      affectedMuscleGroups: groups,
    });
  }

  const actualDates = new Set(
    actualSessions.map((session) => session.actualDate),
  );
  const futureDates = sortedUnique(trainingDates).filter(
    (date) => !actualDates.has(date),
  );
  const knownPending = pendingSessions.filter(
    (session) => session.muscleGroups.length > 0,
  );
  const potential = worked.flatMap((session) =>
    futureDates.flatMap((date) => {
      if (Math.abs(dayNumber(date) - dayNumber(session.actualDate)) > 1)
        return [];
      const matching = knownPending.filter(
        (pending) =>
          overlappingGroups(session.muscleGroups, pending.muscleGroups).length >
          0,
      );
      return matching.length ? [{ session, date, matching }] : [];
    }),
  );
  if (potential.length) {
    const conflict = potential[0];
    const groups = [
      ...new Map(
        conflict.matching
          .flatMap((session) =>
            overlappingGroups(
              conflict.session.muscleGroups,
              session.muscleGroups,
            ),
          )
          .map((group) => [normalizeGroup(group), group]),
      ).values(),
    ];
    const compatible = knownPending.filter(
      (pending) =>
        overlappingGroups(conflict.session.muscleGroups, pending.muscleGroups)
          .length === 0,
    );
    const label = naturalList(groups);
    return result({
      level: 'CAUTION',
      code: 'POTENTIAL_MUSCLE_CONFLICT',
      basis: 'POTENTIAL',
      title: 'Revisa qué sesión realizarás',
      message: `Si vuelves a entrenar ${label} en una fecha próxima, el descanso podría ser insuficiente tras una sesión exigente.`,
      recommendation: compatible.length
        ? `Puedes priorizar ${naturalList(compatible[0].muscleGroups)} y dejar ${label} para otro día.`
        : `Si todavía sientes fatiga en ${label}, considera elegir otra fecha o ajustar la carga.`,
      showRecoveryContext: true,
      notifyCoach: true,
      affectedMuscleGroups: groups,
    });
  }

  const allRegistered =
    prescribedSessions > 0 &&
    actualSessions.length >= prescribedSessions &&
    actualSessions.every((session) => session.finished !== false);
  if (allRegistered) {
    const summary = completionSummary(actualSessions);
    const last = [...actualSessions]
      .filter(realWork)
      .sort((left, right) =>
        right.actualDate.localeCompare(left.actualDate),
      )[0];
    const endedOnSunday = Boolean(last && context.weekEnd === last.actualDate);
    return result({
      level: 'BALANCED',
      code: 'WEEK_RECORDED',
      basis: 'CONFIRMED',
      title: 'Semana registrada',
      message: summary
        ? `Registraste todas las sesiones de la semana: ${summary}.`
        : 'Registraste todas las sesiones de la semana.',
      recommendation:
        endedOnSunday && last.muscleGroups.length
          ? `Para comenzar la próxima semana, si vuelves a trabajar ${naturalList(last.muscleGroups)} el lunes, ajusta la carga o elige otra sesión si aún sientes fatiga.`
          : null,
      showRecoveryContext: endedOnSunday,
      notifyCoach: false,
      affectedMuscleGroups: [],
    });
  }

  if (!plannedSessions) {
    return result({
      level: 'UNPLANNED',
      code: 'NO_PLAN',
      basis: 'GENERAL',
      title: 'Organiza tus sesiones',
      message:
        'Elige las fechas que te acomodan. Seguirás decidiendo qué sesión pendiente realizar cada día.',
      recommendation: null,
      showRecoveryContext: false,
      notifyCoach: false,
      affectedMuscleGroups: [],
    });
  }
  if (missingSessions) {
    return result({
      level: 'UNPLANNED',
      code: 'INCOMPLETE',
      basis: 'GENERAL',
      title: `${missingSessions} ${missingSessions === 1 ? 'sesión' : 'sesiones'} por organizar`,
      message:
        'Todavía faltan sesiones por ubicar. Puedes distribuirlas entre los días disponibles sin fijar su orden.',
      recommendation: null,
      showRecoveryContext: false,
      notifyCoach: false,
      affectedMuscleGroups: [],
    });
  }
  if (prescribedSessions === 7) {
    return result({
      level: 'CAUTION',
      code: 'SEVEN_DAY_WEEK',
      basis: knownPending.length ? 'POTENTIAL' : 'INSUFFICIENT',
      title: 'Semana sin días completos libres',
      message:
        'Organizaste una sesión cada día. Esto puede responder a una rutina dividida, pero no deja un día completo libre dentro de la semana.',
      recommendation:
        'Revisa la alternancia muscular, la carga total y tu recuperación con tu coach.',
      showRecoveryContext: true,
      notifyCoach: true,
      affectedMuscleGroups: [],
    });
  }
  const confirmedCompatibleRun = maxConsecutive(
    actualSessions.filter(realWork).map((session) => session.actualDate),
  );
  if (confirmedCompatibleRun >= 3 && consecutive === confirmedCompatibleRun) {
    return result({
      level: 'BALANCED',
      code: 'COMPATIBLE_CONSECUTIVE',
      basis: 'CONFIRMED',
      title: `${confirmedCompatibleRun} días consecutivos compatibles`,
      message:
        'Los registros muestran alternancia muscular entre los días consecutivos. La distribución puede ser adecuada si la carga total y tu recuperación se mantienen controladas.',
      recommendation:
        'Sigue observando el esfuerzo acumulado y ajusta la siguiente sesión si aparece fatiga.',
      showRecoveryContext: false,
      notifyCoach: false,
      affectedMuscleGroups: [],
    });
  }
  if (consecutive >= 3) {
    const informationMissing =
      pendingSessions.length === 0 ||
      knownPending.length < pendingSessions.length;
    return result({
      level: 'CAUTION',
      code: 'CONCENTRATED_DAYS',
      basis: informationMissing ? 'INSUFFICIENT' : 'POTENTIAL',
      title: `${consecutive} días seguidos por revisar`,
      message:
        'Varios días consecutivos pueden funcionar si alternas músculos y controlas la carga; las fechas por sí solas no confirman un problema de recuperación.',
      recommendation:
        'Evita repetir trabajo intenso del mismo grupo si todavía notas fatiga.',
      showRecoveryContext: true,
      notifyCoach: false,
      affectedMuscleGroups: [],
    });
  }
  if (consecutive === 2) {
    const realConsecutive = worked.some((session, index) =>
      worked.slice(index + 1).some((candidate) => {
        const gap = Math.abs(
          dayNumber(candidate.actualDate) - dayNumber(session.actualDate),
        );
        return (
          gap === 1 &&
          overlappingGroups(session.muscleGroups, candidate.muscleGroups)
            .length === 0
        );
      }),
    );
    return result({
      level: 'BALANCED',
      code: realConsecutive ? 'COMPATIBLE_CONSECUTIVE' : 'TWO_CONSECUTIVE',
      basis: realConsecutive
        ? 'CONFIRMED'
        : knownPending.length
          ? 'POTENTIAL'
          : 'INSUFFICIENT',
      title: realConsecutive
        ? 'Días consecutivos compatibles'
        : 'Días consecutivos por revisar',
      message: realConsecutive
        ? 'Entrenar dos días seguidos puede funcionar cuando alternas grupos musculares. Revisa también la intensidad y evita acumular fatiga innecesaria.'
        : 'Dos días seguidos pueden ser adecuados según la sesión que elijas, la carga y tu recuperación.',
      recommendation: null,
      showRecoveryContext: false,
      notifyCoach: false,
      affectedMuscleGroups: [],
    });
  }
  return result({
    level: 'BALANCED',
    code: 'BALANCED',
    basis: knownPending.length || worked.length ? 'POTENTIAL' : 'INSUFFICIENT',
    title: 'Distribución favorable',
    message:
      'Has dejado días de recuperación entre tus sesiones. Esta distribución puede ayudarte a mantener un buen rendimiento durante la semana.',
    recommendation:
      prescribedSessions >= 5
        ? 'En una frecuencia alta, mantén la alternancia muscular y ajusta la carga según tu recuperación.'
        : null,
    showRecoveryContext: false,
    notifyCoach: false,
    affectedMuscleGroups: [],
  });
}

function recoveryPenalty(
  candidate: number[],
  actualSessions: TrainingWeekSession[],
  pendingSessions: PendingTrainingSession[],
) {
  const pendingKnown = pendingSessions.filter(
    (session) => session.muscleGroups.length > 0,
  );
  if (!pendingKnown.length) return 0;
  return candidate.reduce((penalty, day) => {
    return (
      penalty +
      actualSessions.filter(realWork).reduce((subtotal, actual) => {
        if (Math.abs(day - dayNumber(actual.actualDate)) > 1) return subtotal;
        const overlaps = pendingKnown.filter(
          (pending) =>
            overlappingGroups(actual.muscleGroups, pending.muscleGroups)
              .length > 0,
        ).length;
        if (!overlaps) return subtotal;
        const allOverlap = overlaps === pendingKnown.length ? 2 : 1;
        return subtotal + allOverlap * (hasHighEffort(actual) ? 2 : 1);
      }, 0)
    );
  }, 0);
}

export function recommendTrainingPlan(
  availableFrom: string,
  weekEnd: string,
  sessionsToPlan: number,
  today: string,
  occupiedDates: string[] = [],
  context: Pick<
    TrainingWeekAssessmentContext,
    'actualSessions' | 'adjacentSessions' | 'pendingSessions'
  > = {},
): TrainingDateRecommendation {
  const first = Math.max(dayNumber(availableFrom), dayNumber(today));
  const last = dayNumber(weekEnd);
  const occupied = new Set(occupiedDates.map(dayNumber));
  const available = Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, index) => first + index,
  ).filter((day) => !occupied.has(day));
  const requested = Math.max(0, sessionsToPlan);
  const count = Math.min(requested, available.length);
  if (!count)
    return {
      dates: [],
      quality: requested ? 'LIMITED' : 'EQUIVALENT',
      reason: requested
        ? 'No quedan días disponibles para organizar las sesiones pendientes.'
        : 'No hay sesiones pendientes por distribuir.',
    };

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
    )
      visit(index + 1, [...current, available[index]]);
  };
  visit(0, []);
  const recoverySessions = [
    ...(context.adjacentSessions ?? []),
    ...(context.actualSessions ?? []),
  ];
  const pendingSessions = context.pendingSessions ?? [];
  const score = (candidate: number[]) => {
    const all = [...new Set([...occupied, ...candidate])].sort((a, b) => a - b);
    const gaps = all.slice(1).map((day, index) => day - all[index]);
    const minimumGap = gaps.length ? Math.min(...gaps) : 7;
    const consecutivePairs = gaps.filter((gap) => gap === 1).length;
    const spread = all.length > 1 ? all.at(-1)! - all[0] : 0;
    const recovery = recoveryPenalty(
      candidate,
      recoverySessions,
      pendingSessions,
    );
    return [recovery, minimumGap, -consecutivePairs, spread] as const;
  };
  combinations.sort((left, right) => {
    const a = score(left);
    const b = score(right);
    return (
      a[0] - b[0] ||
      b[1] - a[1] ||
      b[2] - a[2] ||
      b[3] - a[3] ||
      left.join(',').localeCompare(right.join(','))
    );
  });
  const best = combinations[0];
  const bestScore = score(best);
  const equallyGood = combinations.filter((candidate) => {
    const candidateScore = score(candidate);
    return candidateScore.every((value, index) => value === bestScore[index]);
  }).length;
  const hasMuscleContext =
    recoverySessions.some(realWork) &&
    pendingSessions.some((session) => session.muscleGroups.length > 0);
  const quality =
    count < requested
      ? 'LIMITED'
      : combinations.length === 1 || equallyGood === combinations.length
        ? 'EQUIVALENT'
        : 'IMPROVED';
  const reason =
    count < requested
      ? `Solo quedan ${count} ${count === 1 ? 'día disponible' : 'días disponibles'} para ${requested} sesiones pendientes.`
      : quality === 'EQUIVALENT'
        ? 'No existe una distribución claramente mejor con los días disponibles; puedes mantener tu elección si se ajusta a tu recuperación.'
        : hasMuscleContext && bestScore[0] === 0
          ? 'Se priorizaron fechas alejadas del último trabajo conocido de músculos que podrían repetirse.'
          : hasMuscleContext
            ? 'Se redujo la proximidad posible con músculos trabajados y se favoreció la separación entre fechas.'
            : 'Se priorizó la mejor separación posible; no hay información muscular suficiente para afinar la propuesta.';
  return {
    dates: best.map((day) => new Date(day * DAY_MS).toISOString().slice(0, 10)),
    quality,
    reason,
  };
}

export function recommendTrainingDates(
  availableFrom: string,
  weekEnd: string,
  sessionsToPlan: number,
  today: string,
  occupiedDates: string[] = [],
  context: Pick<
    TrainingWeekAssessmentContext,
    'actualSessions' | 'adjacentSessions' | 'pendingSessions'
  > = {},
) {
  return recommendTrainingPlan(
    availableFrom,
    weekEnd,
    sessionsToPlan,
    today,
    occupiedDates,
    context,
  ).dates;
}
