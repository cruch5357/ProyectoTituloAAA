import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrainingStatus, TrainingWeekPlan } from "../../api/training";
import { trainingLabels } from "../../api/training";
import { apiClient } from "../../lib/apiClient";
import { readableDate } from "../../lib/readableDate";

const DAY_MS = 86_400_000;

function weekDates(first: string, last: string) {
  const start = Date.parse(`${first}T00:00:00.000Z`);
  const end = Date.parse(`${last}T00:00:00.000Z`);
  return Array.from(
    { length: Math.floor((end - start) / DAY_MS) + 1 },
    (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function consecutiveDays(dates: string[]) {
  const sorted = [...new Set(dates)]
    .sort()
    .map((date) => Date.parse(`${date}T00:00:00Z`));
  let run = sorted.length ? 1 : 0;
  let maximum = run;
  for (let index = 1; index < sorted.length; index += 1) {
    run = sorted[index] - sorted[index - 1] === DAY_MS ? run + 1 : 1;
    maximum = Math.max(maximum, run);
  }
  return maximum;
}

function normalizedGroups(groups: string[]) {
  return new Set(groups.map((group) => group.trim().toLocaleLowerCase()));
}

function hasNearbySimilarMuscles(plan: TrainingWeekPlan) {
  const worked = plan.actualSessions.filter(
    (session) => session.recordedSets > 0 && session.status !== "SKIPPED",
  );
  return worked.some((session, index) => {
    const groups = normalizedGroups(session.muscleGroups);
    if (!groups.size) return false;
    return worked.slice(index + 1).some((candidate) => {
      const days =
        Math.abs(
          Date.parse(`${candidate.actualDate}T00:00:00Z`) -
            Date.parse(`${session.actualDate}T00:00:00Z`),
        ) / DAY_MS;
      return (
        days <= 1 &&
        candidate.muscleGroups.some((group) =>
          groups.has(group.trim().toLocaleLowerCase()),
        )
      );
    });
  });
}

type PlannerAdvice = {
  level: "UNPLANNED" | "BALANCED" | "CAUTION" | "HIGH";
  title: string;
  message: string;
};

function completionSummary(plan: TrainingWeekPlan) {
  const counts = plan.actualSessions.reduce<Record<TrainingStatus, number>>(
    (result, session) => {
      result[session.status] += 1;
      return result;
    },
    { NOT_STARTED: 0, PARTIAL: 0, COMPLETED: 0, SKIPPED: 0 },
  );
  const parts = [
    counts.COMPLETED
      ? `${counts.COMPLETED} completada${counts.COMPLETED === 1 ? "" : "s"}`
      : null,
    counts.PARTIAL
      ? `${counts.PARTIAL} parcial${counts.PARTIAL === 1 ? "" : "es"}`
      : null,
    counts.SKIPPED
      ? `${counts.SKIPPED} omitida${counts.SKIPPED === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.join(", ");
}

function plannerAdvice(
  plan: TrainingWeekPlan,
  plannedDates: string[],
): PlannerAdvice {
  const actualDates = plan.actualSessions.map((session) => session.actualDate);
  const organized = plan.actualSessions.length + plannedDates.length;
  const missing = Math.max(0, plan.prescribedSessions - organized);
  const distribution = [...actualDates, ...plannedDates];
  const consecutive = consecutiveDays(distribution);
  const allFinished =
    plan.actualSessions.length >= plan.prescribedSessions &&
    plan.actualSessions.every((session) => session.finished);

  if (allFinished) {
    const summary = completionSummary(plan);
    return {
      level: "BALANCED",
      title: "Semana completada",
      message: summary
        ? `Registraste todas las sesiones de la semana: ${summary}.`
        : "Registraste todas las sesiones de la semana.",
    };
  }
  if (plannedDates.length > plan.remainingSessions) {
    return {
      level: "CAUTION",
      title: "Revisa los días guardados",
      message:
        "Hay más días planificados que sesiones pendientes. Quita un día o aplica una nueva distribución antes de guardar.",
    };
  }
  if (missing > 0) {
    return {
      level: "UNPLANNED",
      title: `${missing} ${missing === 1 ? "sesión" : "sesiones"} por organizar`,
      message:
        "Todavía tienes sesiones por organizar. Puedes distribuirlas entre los días disponibles.",
    };
  }
  if (consecutive >= 3) {
    return {
      level: consecutive >= 4 ? "HIGH" : "CAUTION",
      title: `${consecutive} días consecutivos`,
      message: `Planificaste ${consecutive} días seguidos. Considera dejar un día de recuperación antes de volver a entrenar.`,
    };
  }
  if (hasNearbySimilarMuscles(plan)) {
    return {
      level: "CAUTION",
      title: "Recuperación muscular",
      message:
        "Registraste sesiones en días consecutivos que trabajan grupos musculares similares. Si fueron exigentes, considera separarlas para favorecer la recuperación.",
    };
  }
  if (consecutive === 2) {
    return {
      level: "BALANCED",
      title: "Dos días consecutivos",
      message:
        "Entrenar en días consecutivos puede ser adecuado si cambia el grupo muscular o la carga. Sigue las indicaciones de tu coach y ajusta según tu recuperación.",
    };
  }
  return {
    level: "BALANCED",
    title: "Distribución equilibrada",
    message:
      "Buena distribución: dejaste días de recuperación entre tus entrenamientos.",
  };
}

export function WeeklyTrainingPlanner({
  plan,
  today,
}: {
  plan: TrainingWeekPlan;
  today: string;
}) {
  const cache = useQueryClient();
  const actualDates = useMemo(
    () => [
      ...new Set(plan.actualSessions.map((session) => session.actualDate)),
    ],
    [plan.actualSessions],
  );
  const initialPlanned = plan.trainingDates.filter(
    (date) => !actualDates.includes(date),
  );
  const [selected, setSelected] = useState(initialPlanned);
  const [revision, setRevision] = useState(plan.revision);
  const [confirmingRecommendation, setConfirmingRecommendation] =
    useState(false);
  const futurePlanned = selected.filter((date) => date >= today);
  const organizedSessions = Math.min(
    plan.prescribedSessions,
    plan.actualSessions.length + futurePlanned.length,
  );
  const advice = plannerAdvice(plan, futurePlanned);
  const recommendationChangesPlan =
    [...futurePlanned].sort().join(",") !==
    [...plan.recommendedDates].sort().join(",");
  const hasSavedPlan = initialPlanned.length > 0;
  const canSave =
    futurePlanned.length <= plan.remainingSessions &&
    plan.actualSessions.length + futurePlanned.length ===
      plan.prescribedSessions;

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<TrainingWeekPlan>("/training/week-plan", {
        assignmentId: plan.assignmentId,
        weekIndex: plan.weekIndex,
        revision,
        trainingDates: [...new Set([...actualDates, ...futurePlanned])].sort(),
      }),
    onSuccess: ({ data }) => {
      setRevision(data.revision);
      setSelected(
        data.trainingDates.filter(
          (date) => !actualDates.includes(date) && date >= today,
        ),
      );
      setConfirmingRecommendation(false);
      void cache.invalidateQueries({ queryKey: ["training"] });
    },
  });

  const toggle = (date: string) => {
    if (actualDates.includes(date)) return;
    setConfirmingRecommendation(false);
    setSelected((current) => {
      if (current.includes(date))
        return current.filter((item) => item !== date);
      const currentFutureCount = current.filter((item) => item >= today).length;
      if (date < today || currentFutureCount >= plan.remainingSessions)
        return current;
      return [...current, date].sort();
    });
  };
  const applyRecommendation = () => {
    setSelected(plan.recommendedDates);
    setConfirmingRecommendation(false);
  };
  const requestRecommendation = () => {
    if (hasSavedPlan && recommendationChangesPlan) {
      setConfirmingRecommendation(true);
      return;
    }
    applyRecommendation();
  };

  return (
    <section className="training-week-plan" aria-labelledby="weekly-plan-title">
      <header className="training-week-plan__header">
        <div>
          <p className="eyebrow">Planificación flexible</p>
          <h2 id="weekly-plan-title">Organiza tus días</h2>
        </div>
        <strong className="training-week-plan__counter">
          {organizedSessions} de {plan.prescribedSessions}
          <span>sesiones organizadas</span>
        </strong>
      </header>
      <p className="training-week-plan__intro">
        Elige días para las sesiones que faltan. El orden sigue siendo flexible
        y se mantiene el máximo de un entrenamiento por día.
      </p>
      <div
        className="training-week-plan__legend"
        aria-label="Estados de los días"
      >
        <span className="training-week-plan__key training-week-plan__key--trained">
          Ya entrenado
        </span>
        <span className="training-week-plan__key training-week-plan__key--planned">
          Planificado
        </span>
        <span className="training-week-plan__key training-week-plan__key--available">
          Disponible
        </span>
      </div>
      <div className="training-week-plan__days">
        {weekDates(plan.weekStart, plan.weekEnd).map((date) => {
          const actual = plan.actualSessions.filter(
            (session) => session.actualDate === date,
          );
          const trained = actual.length > 0;
          const planned = selected.includes(date) && !trained;
          const unavailable =
            !trained && !planned && (date < plan.availableFrom || date < today);
          const state = trained
            ? actual.some((session) => session.status !== "SKIPPED")
              ? "Entrenado"
              : "Registrado · Omitido"
            : planned
              ? date < today
                ? "Plan vencido"
                : "Planificado"
              : unavailable
                ? "No disponible"
                : "Disponible";
          const actualDetails = actual
            .map(
              (session) =>
                `${session.name}: ${trainingLabels[session.status]}, ${session.recordedSets}/${session.totalSets} series`,
            )
            .join(". ");
          return (
            <button
              type="button"
              key={date}
              aria-label={`${readableDate(date, false)}. ${state}${actualDetails ? `. ${actualDetails}` : ""}`}
              aria-pressed={trained || planned}
              disabled={trained || unavailable}
              data-state={
                trained
                  ? "trained"
                  : planned
                    ? "planned"
                    : unavailable
                      ? "unavailable"
                      : "available"
              }
              onClick={() => toggle(date)}
            >
              <strong>{readableDate(date, false).split(",")[0]}</strong>
              <span>{date.slice(8, 10)}</span>
              <small>{state}</small>
            </button>
          );
        })}
      </div>
      <aside
        className={`training-week-plan__advice training-week-plan__advice--${advice.level.toLowerCase()}`}
        role={
          advice.level === "CAUTION" || advice.level === "HIGH"
            ? "alert"
            : "status"
        }
      >
        <strong>{advice.title}</strong>
        <span>{advice.message}</span>
        <small>
          Orientación general: tras fuerza intensa sobre el mismo grupo muscular
          suelen considerarse 48–72 horas de recuperación, según carga y
          contexto. Los días consecutivos no son por sí solos un problema si
          cambia el trabajo realizado.
        </small>
      </aside>
      <div className="training-week-plan__actions">
        <button
          type="button"
          className="button button--neutral"
          disabled={!plan.recommendedDates.length || save.isPending}
          onClick={requestRecommendation}
        >
          Usar distribución recomendada
        </button>
        <button
          type="button"
          className="button"
          disabled={save.isPending || !canSave}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Guardando…" : "Guardar organización"}
        </button>
      </div>
      {confirmingRecommendation && (
        <div
          className="training-week-plan__confirmation"
          role="alertdialog"
          aria-label="Confirmar distribución recomendada"
        >
          <p>
            La recomendación reemplazará los días planificados en el editor. Tus
            entrenamientos registrados no se modificarán y el cambio no se
            guardará hasta que presiones “Guardar organización”.
          </p>
          <div>
            <button
              type="button"
              className="button"
              onClick={applyRecommendation}
            >
              Confirmar distribución
            </button>
            <button
              type="button"
              className="button button--neutral"
              onClick={() => setConfirmingRecommendation(false)}
            >
              Mantener mi organización
            </button>
          </div>
        </div>
      )}
      {selected.some((date) => date < today) && (
        <p className="training-week-plan__stale" role="status">
          Hay un día planificado que ya pasó sin registro. Quítalo y elige una
          fecha disponible.
        </p>
      )}
      {save.isSuccess && <p role="status">Organización semanal guardada.</p>}
      {save.isError && (
        <p className="training-expired-notice__error" role="alert">
          No pudimos guardar la organización. Recarga e inténtalo nuevamente.
        </p>
      )}
    </section>
  );
}
