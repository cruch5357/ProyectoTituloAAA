import type {
  TrainingWeekActualSession,
  TrainingWeekAssessment,
  TrainingWeekPendingSession,
  TrainingWeekPlan,
} from "../../api/training";

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const normalize = (group: string) => group.trim().toLocaleLowerCase("es-CL");

function maxConsecutive(dates: string[]) {
  const days = [...new Set(dates)].sort().map(dayNumber);
  let current = days.length ? 1 : 0;
  let maximum = current;
  for (let index = 1; index < days.length; index += 1) {
    current = days[index] - days[index - 1] === 1 ? current + 1 : 1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function overlap(left: string[], right: string[]) {
  const rightGroups = new Set(right.map(normalize));
  return left
    .map((group) => group.trim())
    .filter((group) => group && rightGroups.has(normalize(group)));
}

function uniqueGroups(groups: string[]) {
  return [
    ...new Map(
      groups.map((group) => [normalize(group), group.trim()]),
    ).values(),
  ];
}

function list(groups: string[]) {
  const values = uniqueGroups(groups);
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}

function isWork(session: TrainingWeekActualSession) {
  return (
    session.status !== "SKIPPED" &&
    session.recordedSets > 0 &&
    session.muscleGroups.length > 0
  );
}

function highEffort(session: TrainingWeekActualSession) {
  return (
    (session.overallRpe != null && session.overallRpe >= 8) ||
    (session.averageRpe != null && session.averageRpe >= 8) ||
    (session.averageRir != null && session.averageRir <= 2)
  );
}

function completionSummary(sessions: TrainingWeekActualSession[]) {
  const counts = sessions.reduce(
    (result, session) => {
      if (session.status === "COMPLETED") result.completed += 1;
      if (session.status === "PARTIAL") result.partial += 1;
      if (session.status === "SKIPPED") result.skipped += 1;
      return result;
    },
    { completed: 0, partial: 0, skipped: 0 },
  );
  return [
    counts.completed
      ? `${counts.completed} completada${counts.completed === 1 ? "" : "s"}`
      : null,
    counts.partial
      ? `${counts.partial} parcial${counts.partial === 1 ? "" : "es"}`
      : null,
    counts.skipped
      ? `${counts.skipped} omitida${counts.skipped === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
}

type DraftAssessment = TrainingWeekAssessment & {
  title: string;
  recommendation: string | null;
  basis: "CONFIRMED" | "POTENTIAL" | "INSUFFICIENT" | "GENERAL";
  showRecoveryContext: boolean;
  affectedMuscleGroups: string[];
};

/** Browser counterpart of backend/common/training/week-plan.ts for live edits. */
export function assessPlanDraft(
  plan: TrainingWeekPlan,
  plannedDates: string[],
): DraftAssessment {
  const actual = plan.actualSessions;
  const adjacent = plan.adjacentSessions ?? [];
  const pending = plan.pendingSessions ?? [];
  const dates = [
    ...actual.map((session) => session.actualDate),
    ...plannedDates,
  ];
  const organized = actual.length + plannedDates.length;
  const missing = Math.max(0, plan.prescribedSessions - organized);
  const consecutive = maxConsecutive(dates);
  const base = {
    plannedSessions: Math.min(plan.prescribedSessions, organized),
    prescribedSessions: plan.prescribedSessions,
    missingSessions: missing,
    maxConsecutiveDays: consecutive,
    notifyCoach: false,
  };
  const result = (
    value: Omit<
      DraftAssessment,
      | "plannedSessions"
      | "prescribedSessions"
      | "missingSessions"
      | "maxConsecutiveDays"
    >,
  ): DraftAssessment => ({ ...base, ...value });
  const worked = [...adjacent, ...actual]
    .filter(isWork)
    .sort((left, right) => left.actualDate.localeCompare(right.actualDate));
  const conflicts = worked.flatMap((session, index) =>
    worked.slice(index + 1).flatMap((candidate) => {
      const groups =
        Math.abs(
          dayNumber(candidate.actualDate) - dayNumber(session.actualDate),
        ) <= 1
          ? overlap(session.muscleGroups, candidate.muscleGroups)
          : [];
      return groups.length ? [{ session, candidate, groups }] : [];
    }),
  );
  if (conflicts.length) {
    const groups = uniqueGroups(
      conflicts.flatMap((conflict) => conflict.groups),
    );
    const demanding = conflicts.some(
      ({ session, candidate }) => highEffort(session) || highEffort(candidate),
    );
    const muscles = list(groups);
    return result({
      level: demanding ? "HIGH" : "CAUTION",
      code: demanding
        ? "CONFIRMED_HIGH_LOAD_CONFLICT"
        : "CONFIRMED_MUSCLE_CONFLICT",
      basis: "CONFIRMED",
      title: `Atención a la recuperación de ${muscles}`,
      message: `Trabajaste ${muscles} en días consecutivos${demanding ? " y el esfuerzo registrado fue alto" : ""}. ${demanding ? "Podrías necesitar más recuperación antes de repetir trabajo intenso." : "Si las sesiones fueron exigentes, podrías necesitar más recuperación."}`,
      recommendation: `Considera espaciar el próximo trabajo intenso de ${muscles} o reducir su carga según cómo te sientas.`,
      showRecoveryContext: true,
      affectedMuscleGroups: groups,
      notifyCoach: true,
    });
  }

  const knownPending = pending.filter((session) => session.muscleGroups.length);
  const potentials = worked.flatMap((session) =>
    plannedDates.flatMap((date) => {
      if (Math.abs(dayNumber(date) - dayNumber(session.actualDate)) > 1)
        return [];
      const matching = knownPending.filter(
        (candidate) =>
          overlap(session.muscleGroups, candidate.muscleGroups).length,
      );
      return matching.length ? [{ session, matching }] : [];
    }),
  );
  if (potentials.length) {
    const potential = potentials[0];
    const groups = uniqueGroups(
      potential.matching.flatMap((session) =>
        overlap(potential.session.muscleGroups, session.muscleGroups),
      ),
    );
    const compatible = knownPending.filter(
      (session) =>
        !overlap(potential.session.muscleGroups, session.muscleGroups).length,
    );
    const muscles = list(groups);
    return result({
      level: "CAUTION",
      code: "POTENTIAL_MUSCLE_CONFLICT",
      basis: "POTENTIAL",
      title: "Revisa qué sesión realizarás",
      message: `Si vuelves a entrenar ${muscles} en una fecha próxima, el descanso podría ser insuficiente tras una sesión exigente.`,
      recommendation: compatible.length
        ? `Puedes priorizar ${list(compatible[0].muscleGroups)} y dejar ${muscles} para otro día.`
        : `Si todavía sientes fatiga en ${muscles}, considera elegir otra fecha o ajustar la carga.`,
      showRecoveryContext: true,
      affectedMuscleGroups: groups,
      notifyCoach: true,
    });
  }

  const allRegistered =
    plan.prescribedSessions > 0 &&
    actual.length >= plan.prescribedSessions &&
    actual.every((session) => session.finished !== false);
  if (allRegistered) {
    const summary = completionSummary(actual);
    const last = [...actual]
      .filter(isWork)
      .sort((left, right) =>
        right.actualDate.localeCompare(left.actualDate),
      )[0];
    const endedOnSunday = Boolean(last && last.actualDate === plan.weekEnd);
    return result({
      level: "BALANCED",
      code: "WEEK_RECORDED",
      basis: "CONFIRMED",
      title: "Semana registrada",
      message: summary
        ? `Registraste todas las sesiones de la semana: ${summary}.`
        : "Registraste todas las sesiones de la semana.",
      recommendation:
        endedOnSunday && last.muscleGroups.length
          ? `Para comenzar la próxima semana, si vuelves a trabajar ${list(last.muscleGroups)} el lunes, ajusta la carga o elige otra sesión si aún sientes fatiga.`
          : null,
      showRecoveryContext: endedOnSunday,
      affectedMuscleGroups: [],
    });
  }
  if (!organized)
    return result({
      level: "UNPLANNED",
      code: "NO_PLAN",
      basis: "GENERAL",
      title: "Organiza tus sesiones",
      message:
        "Elige las fechas que te acomodan. Seguirás decidiendo qué sesión pendiente realizar cada día.",
      recommendation: null,
      showRecoveryContext: false,
      affectedMuscleGroups: [],
    });
  if (missing)
    return result({
      level: "UNPLANNED",
      code: "INCOMPLETE",
      basis: "GENERAL",
      title: `${missing} ${missing === 1 ? "sesión" : "sesiones"} por organizar`,
      message:
        "Todavía faltan sesiones por ubicar. Puedes distribuirlas entre los días disponibles sin fijar su orden.",
      recommendation: null,
      showRecoveryContext: false,
      affectedMuscleGroups: [],
    });
  if (plan.prescribedSessions === 7)
    return result({
      level: "CAUTION",
      code: "SEVEN_DAY_WEEK",
      basis: knownPending.length ? "POTENTIAL" : "INSUFFICIENT",
      title: "Semana sin días completos libres",
      message:
        "Organizaste una sesión cada día. Esto puede responder a una rutina dividida, pero no deja un día completo libre dentro de la semana.",
      recommendation:
        "Revisa la alternancia muscular, la carga total y tu recuperación con tu coach.",
      showRecoveryContext: true,
      affectedMuscleGroups: [],
      notifyCoach: true,
    });
  const confirmedCompatibleRun = maxConsecutive(
    actual.filter(isWork).map((session) => session.actualDate),
  );
  if (confirmedCompatibleRun >= 3 && consecutive === confirmedCompatibleRun)
    return result({
      level: "BALANCED",
      code: "COMPATIBLE_CONSECUTIVE",
      basis: "CONFIRMED",
      title: `${confirmedCompatibleRun} días consecutivos compatibles`,
      message:
        "Los registros muestran alternancia muscular entre los días consecutivos. La distribución puede ser adecuada si la carga total y tu recuperación se mantienen controladas.",
      recommendation:
        "Sigue observando el esfuerzo acumulado y ajusta la siguiente sesión si aparece fatiga.",
      showRecoveryContext: false,
      affectedMuscleGroups: [],
    });
  if (consecutive >= 3)
    return result({
      level: "CAUTION",
      code: "CONCENTRATED_DAYS",
      basis:
        pending.length === 0 || knownPending.length < pending.length
          ? "INSUFFICIENT"
          : "POTENTIAL",
      title: `${consecutive} días seguidos por revisar`,
      message:
        "Varios días consecutivos pueden funcionar si alternas músculos y controlas la carga; las fechas por sí solas no confirman un problema de recuperación.",
      recommendation:
        "Evita repetir trabajo intenso del mismo grupo si todavía notas fatiga.",
      showRecoveryContext: true,
      affectedMuscleGroups: [],
    });
  if (consecutive === 2) {
    const compatible = worked.some((session, index) =>
      worked
        .slice(index + 1)
        .some(
          (candidate) =>
            Math.abs(
              dayNumber(candidate.actualDate) - dayNumber(session.actualDate),
            ) === 1 &&
            !overlap(session.muscleGroups, candidate.muscleGroups).length,
        ),
    );
    return result({
      level: "BALANCED",
      code: compatible ? "COMPATIBLE_CONSECUTIVE" : "TWO_CONSECUTIVE",
      basis: compatible
        ? "CONFIRMED"
        : knownPending.length
          ? "POTENTIAL"
          : "INSUFFICIENT",
      title: compatible
        ? "Días consecutivos compatibles"
        : "Días consecutivos por revisar",
      message: compatible
        ? "Entrenar dos días seguidos puede funcionar cuando alternas grupos musculares. Revisa también la intensidad y evita acumular fatiga innecesaria."
        : "Dos días seguidos pueden ser adecuados según la sesión que elijas, la carga y tu recuperación.",
      recommendation: null,
      showRecoveryContext: false,
      affectedMuscleGroups: [],
    });
  }
  return result({
    level: "BALANCED",
    code: "BALANCED",
    basis: knownPending.length || worked.length ? "POTENTIAL" : "INSUFFICIENT",
    title: "Distribución favorable",
    message:
      "Has dejado días de recuperación entre tus sesiones. Esta distribución puede ayudarte a mantener un buen rendimiento durante la semana.",
    recommendation:
      plan.prescribedSessions >= 5
        ? "En una frecuencia alta, mantén la alternancia muscular y ajusta la carga según tu recuperación."
        : null,
    showRecoveryContext: false,
    affectedMuscleGroups: [],
  });
}

export function pendingMuscleCoverage(sessions: TrainingWeekPendingSession[]) {
  return sessions.filter((session) => session.muscleGroups.length).length;
}
