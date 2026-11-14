import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrainingWeekPlan } from "../../api/training";
import { trainingLabels } from "../../api/training";
import { apiClient } from "../../lib/apiClient";
import { readableDate } from "../../lib/readableDate";
import { assessPlanDraft } from "./weekPlanAdvice";

const DAY_MS = 86_400_000;

function weekDates(first: string, last: string) {
  const start = Date.parse(`${first}T00:00:00.000Z`);
  const end = Date.parse(`${last}T00:00:00.000Z`);
  return Array.from(
    { length: Math.floor((end - start) / DAY_MS) + 1 },
    (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
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
  const draftAdvice = assessPlanDraft(plan, futurePlanned);
  const advice =
    futurePlanned.length > plan.remainingSessions
      ? {
          ...draftAdvice,
          level: "CAUTION" as const,
          title: "Revisa los días guardados",
          message:
            "Hay más días planificados que sesiones pendientes. Quita un día o aplica una nueva distribución antes de guardar.",
          recommendation: null,
          showRecoveryContext: false,
        }
      : draftAdvice;
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
        <span className="training-week-plan__key training-week-plan__key--completed">
          Completo
        </span>
        <span className="training-week-plan__key training-week-plan__key--partial">
          Parcial
        </span>
        <span className="training-week-plan__key training-week-plan__key--skipped">
          Omitido
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
          const trainingResult = trained
            ? actual.every((session) => session.status === "SKIPPED")
              ? "skipped"
              : actual.every((session) => session.status === "COMPLETED")
                ? "completed"
                : "partial"
            : null;
          const state = trained
            ? trainingResult === "skipped"
              ? "Omitido"
              : trainingResult === "completed"
                ? "Completado"
                : "Parcial"
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
              data-result={trainingResult ?? undefined}
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
        <small className="training-week-plan__advice-level">
          {advice.level === "HIGH"
            ? "Recuperación comprometida"
            : advice.level === "CAUTION"
              ? "Atención"
              : advice.level === "UNPLANNED"
                ? "Incompleto"
                : "Equilibrado"}
          {advice.basis === "POTENTIAL"
            ? " · riesgo potencial"
            : advice.basis === "CONFIRMED"
              ? " · datos registrados"
              : advice.basis === "INSUFFICIENT"
                ? " · información limitada"
                : ""}
        </small>
        <strong>{advice.title}</strong>
        <span>{advice.message}</span>
        {advice.recommendation && (
          <span className="training-week-plan__practical">
            {advice.recommendation}
          </span>
        )}
        {advice.showRecoveryContext && (
          <small>
            Como referencia contextual, suele considerarse alrededor de 48 horas
            antes de repetir trabajo intenso del mismo grupo; la carga y tu
            respuesta individual también importan.
          </small>
        )}
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
      {plan.recommendation?.reason && (
        <p className="training-week-plan__recommendation" role="status">
          <strong>Por qué se sugiere:</strong> {plan.recommendation.reason}
        </p>
      )}
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
