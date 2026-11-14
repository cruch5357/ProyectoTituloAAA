import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTraining } from "../../api/training";
import { apiClient } from "../../lib/apiClient";
import { readableDate } from "../../lib/readableDate";
import "../student-training/training.css";

const DAY_MS = 86_400_000;

function datesBetween(first: string, last: string) {
  const start = Date.parse(`${first}T00:00:00.000Z`);
  const end = Date.parse(`${last}T00:00:00.000Z`);
  return Array.from(
    { length: Math.floor((end - start) / DAY_MS) + 1 },
    (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function listDates(dates: string[]) {
  return dates.map((date) => readableDate(date, false)).join(", ");
}

export function CoachWeekPlanPreview({
  studentId,
  mode = "full",
}: {
  studentId: string;
  mode?: "full" | "chat-alert";
}) {
  const query = useTraining(studentId);
  const plan = query.data?.weekPlan;
  const client = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [sent, setSent] = useState(false);
  const risky =
    plan?.assessment.level === "CAUTION" || plan?.assessment.level === "HIGH";
  const defaultMessage = useMemo(() => {
    if (!plan) return "";
    const lines = [
      "Quiero que reconsideremos tu planificación semanal.",
      `${plan.assessment.title ?? "Revisa tu recuperación"}: ${plan.assessment.message}`,
      plan.assessment.recommendation
        ? `Sugerencia: ${plan.assessment.recommendation}`
        : null,
      plan.recommendedDates.length
        ? `Distribución sugerida: ${listDates(plan.recommendedDates)}.`
        : null,
      plan.recommendation?.reason
        ? `Justificación: ${plan.recommendation.reason}`
        : null,
      "Esta recomendación no bloquea tus entrenamientos; conversemos si necesitas mantener otra distribución.",
    ];
    return lines.filter(Boolean).join("\n\n");
  }, [plan]);
  const [message, setMessage] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const data = new FormData();
      data.append("body", message.trim() || defaultMessage);
      return apiClient.postFile(`/messages/${studentId}`, data);
    },
    onSuccess: () => {
      setSent(true);
      setComposing(false);
      void client.invalidateQueries({ queryKey: ["coaching"] });
    },
  });

  if (!plan || (mode === "chat-alert" && !risky)) return null;

  const openComposer = () => {
    setMessage(defaultMessage);
    setSent(false);
    setComposing(true);
  };
  const actualDates = new Set(
    plan.actualSessions.map((session) => session.actualDate),
  );

  return (
    <section
      className={`coach-week-plan coach-week-plan--${mode} training-week-plan__advice training-week-plan__advice--${plan.assessment.level.toLowerCase()}`}
      aria-label={
        mode === "chat-alert"
          ? "Aviso privado sobre planificación semanal"
          : "Previsualización de la planificación semanal"
      }
      role={risky ? "alert" : "status"}
    >
      <header className="coach-week-plan__header">
        <div>
          <small className="training-week-plan__advice-level">
            Solo visible para el coach
            {plan.assessment.basis === "CONFIRMED"
              ? " · situación registrada"
              : plan.assessment.basis === "POTENTIAL"
                ? " · riesgo potencial"
                : ""}
          </small>
          <strong>
            {plan.assessment.title ?? "Organización semanal del alumno"}
          </strong>
        </div>
        <span>
          {plan.assessment.plannedSessions}/{plan.prescribedSessions} sesiones
        </span>
      </header>
      <p>{plan.assessment.message}</p>
      {plan.assessment.recommendation && (
        <p className="coach-week-plan__suggestion">
          {plan.assessment.recommendation}
        </p>
      )}

      {mode === "full" && (
        <>
          <div
            className="coach-week-plan__days"
            aria-label="Distribución de lunes a domingo"
          >
            {datesBetween(plan.weekStart, plan.weekEnd).map((date) => {
              const actual = plan.actualSessions.filter(
                (session) => session.actualDate === date,
              );
              const result = actual.length
                ? actual.every((session) => session.status === "SKIPPED")
                  ? "Omitido"
                  : actual.every((session) => session.status === "COMPLETED")
                    ? "Completo"
                    : "Parcial"
                : plan.trainingDates.includes(date)
                  ? "Planificado"
                  : "Libre";
              return (
                <div
                  key={date}
                  data-state={
                    actualDates.has(date)
                      ? result.toLowerCase()
                      : result === "Planificado"
                        ? "planned"
                        : "free"
                  }
                >
                  <strong>{readableDate(date, false).split(",")[0]}</strong>
                  <span>{date.slice(8, 10)}</span>
                  <small>{result}</small>
                </div>
              );
            })}
          </div>
          <div className="coach-week-plan__default">
            <strong>Propuesta óptima por defecto</strong>
            <p>
              {plan.recommendedDates.length
                ? listDates(plan.recommendedDates)
                : "No quedan sesiones pendientes por distribuir."}
            </p>
            <small>
              {plan.recommendation?.reason ??
                "Se conserva la libertad del alumno y no se asigna una sesión específica a cada fecha."}
            </small>
          </div>
        </>
      )}

      {risky && !composing && (
        <button type="button" onClick={openComposer}>
          Preparar advertencia para el chat
        </button>
      )}
      {composing && (
        <form
          className="coach-week-plan__composer"
          onSubmit={(event) => {
            event.preventDefault();
            send.mutate();
          }}
        >
          <label className="field">
            Advertencia para el alumno
            <textarea
              maxLength={4000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <div className="dialog-actions">
            <button disabled={send.isPending || !message.trim()}>
              {send.isPending ? "Enviando…" : "Enviar advertencia"}
            </button>
            <button
              type="button"
              className="button--neutral"
              disabled={send.isPending}
              onClick={() => setComposing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {sent && <p role="status">Advertencia enviada en el chat.</p>}
      {send.isError && (
        <p role="alert" className="field-error">
          No pudimos enviar la advertencia. Inténtalo nuevamente.
        </p>
      )}
    </section>
  );
}
