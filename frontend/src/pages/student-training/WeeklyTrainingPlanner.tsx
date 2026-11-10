import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrainingWeekPlan } from "../../api/training";
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
  const sorted = [...dates]
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

function draftAdvice(plan: TrainingWeekPlan, selected: string[]) {
  if (plan.prescribedSessions >= 5)
    return {
      level: "HIGH",
      message:
        "Esta semana prescribe 5 o más entrenamientos. Tu coach recibirá una advertencia para revisar carga y recuperación.",
    };
  const consecutive = consecutiveDays(selected);
  if (consecutive >= 3)
    return {
      level: consecutive >= 4 ? "HIGH" : "CAUTION",
      message: `Planificaste ${consecutive} días seguidos. Descansa al menos un día antes de volver a entrenar.`,
    };
  if (selected.length < plan.prescribedSessions)
    return {
      level: "UNPLANNED",
      message: `Elige ${plan.prescribedSessions - selected.length} día${plan.prescribedSessions - selected.length === 1 ? "" : "s"} más para completar tu semana.`,
    };
  if (consecutive === 2)
    return {
      level: "BALANCED",
      message:
        "Dos días seguidos están bien. Procura descansar un día antes del próximo entrenamiento.",
    };
  return {
    level: "BALANCED",
    message:
      "Tu distribución alterna entrenamiento y descanso de forma equilibrada.",
  };
}

export function WeeklyTrainingPlanner({ plan }: { plan: TrainingWeekPlan }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState(plan.trainingDates);
  const [revision, setRevision] = useState(plan.revision);
  const advice = draftAdvice(plan, selected);
  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<TrainingWeekPlan>("/training/week-plan", {
        assignmentId: plan.assignmentId,
        weekIndex: plan.weekIndex,
        revision,
        trainingDates: selected,
      }),
    onSuccess: ({ data }) => {
      setRevision(data.revision);
      setSelected(data.trainingDates);
      void cache.invalidateQueries({ queryKey: ["training"] });
    },
  });
  const toggle = (date: string) => {
    setSelected((current) => {
      if (current.includes(date))
        return current.filter((item) => item !== date);
      if (current.length >= plan.prescribedSessions) return current;
      return [...current, date].sort();
    });
  };
  return (
    <section className="training-week-plan" aria-labelledby="weekly-plan-title">
      <p className="eyebrow">Planificación flexible</p>
      <h2 id="weekly-plan-title">Organiza tus días</h2>
      <p>
        Elige cuándo entrenar según tu tiempo libre. Esto no fija el orden de
        las sesiones. Puedes realizar como máximo un entrenamiento por día.
      </p>
      <div className="training-week-plan__days">
        {weekDates(plan.availableFrom, plan.weekEnd).map((date) => (
          <button
            type="button"
            key={date}
            aria-pressed={selected.includes(date)}
            onClick={() => toggle(date)}
          >
            <strong>{readableDate(date, false).split(",")[0]}</strong>
            <span>{date.slice(8, 10)}</span>
          </button>
        ))}
      </div>
      <aside
        className={`training-week-plan__advice training-week-plan__advice--${advice.level.toLowerCase()}`}
        role={
          advice.level === "CAUTION" || advice.level === "HIGH"
            ? "alert"
            : "status"
        }
      >
        <strong>
          {selected.length} de {plan.prescribedSessions} días organizados
        </strong>
        <span>{advice.message}</span>
        {plan.assessment.historicalAverageRestDays != null && (
          <small>
            En tus registros recientes promediaste{" "}
            {plan.assessment.historicalAverageRestDays} días completos de
            descanso entre entrenamientos.
          </small>
        )}
      </aside>
      <div className="training-week-plan__actions">
        <button
          type="button"
          className="button button--neutral"
          onClick={() => setSelected(plan.recommendedDates)}
        >
          Usar distribución recomendada
        </button>
        <button
          type="button"
          className="button"
          disabled={
            save.isPending || selected.length !== plan.prescribedSessions
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Guardando…" : "Guardar organización"}
        </button>
      </div>
      {save.isSuccess && <p role="status">Organización semanal guardada.</p>}
      {save.isError && (
        <p className="training-expired-notice__error" role="alert">
          No pudimos guardar la organización. Recarga e inténtalo nuevamente.
        </p>
      )}
    </section>
  );
}
