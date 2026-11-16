import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiClient } from "../../lib/apiClient";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { LibraryBlock } from "../blocks/library-model";
import { BlockAssignmentPanel } from "./BlockAssignmentPanel";

const trainingOverview = {
  today: "2026-11-09",
  assignments: [],
  sessions: [],
  nextSession: null,
  pendingSession: null,
};

const riskyTrainingOverview = {
  ...trainingOverview,
  weekPlan: {
    assignmentId: "assignment-1",
    weekIndex: 0,
    weekStart: "2026-11-09",
    availableFrom: "2026-11-09",
    weekEnd: "2026-11-15",
    prescribedSessions: 3,
    trainingDates: ["2026-11-09", "2026-11-10", "2026-11-14"],
    revision: 1,
    actualSessions: [
      {
        sessionId: "legs",
        name: "Piernas",
        actualDate: "2026-11-09",
        status: "COMPLETED" as const,
        finished: true,
        recordedSets: 6,
        totalSets: 6,
        muscleGroups: ["Piernas"],
      },
    ],
    pendingSessions: [
      {
        sessionId: "legs-2",
        name: "Piernas 2",
        totalSets: 5,
        muscleGroups: ["Piernas"],
      },
    ],
    adjacentSessions: [],
    remainingSessions: 2,
    recommendedDates: ["2026-11-11", "2026-11-14"],
    recommendation: {
      dates: ["2026-11-11", "2026-11-14"],
      quality: "IMPROVED" as const,
      reason: "Se priorizó la recuperación de piernas.",
    },
    assessment: {
      level: "CAUTION" as const,
      code: "POTENTIAL_MUSCLE_CONFLICT",
      basis: "POTENTIAL" as const,
      title: "Revisa qué sesión realizarás",
      message: "Si repites piernas, el descanso podría ser insuficiente.",
      recommendation: "Prioriza otra sesión o cambia la fecha.",
      showRecoveryContext: true,
      notifyCoach: true,
      plannedSessions: 3,
      prescribedSessions: 3,
      missingSessions: 0,
      maxConsecutiveDays: 2,
      affectedMuscleGroups: ["Piernas"],
    },
  },
};

function blockWithSessions(days = 2): LibraryBlock {
  return {
    id: "block-1",
    name: "Bloque flexible",
    folderId: null,
    revision: 1,
    weekCount: 1,
    weeks: [
      {
        id: "week-1",
        days: Array.from({ length: days }, (_, index) => ({
          id: `day-${index + 1}`,
          name: `Día ${index + 1}`,
          exercises: [],
        })),
      },
    ],
  };
}

function mockApi(
  block: LibraryBlock,
  overview: unknown = trainingOverview,
) {
  vi.spyOn(apiClient, "get").mockImplementation(async (path) => ({
    data:
      path === "/block-library"
        ? [block]
        : path === `/block-library/${block.id}`
          ? block
          : overview,
    error: null,
    meta: {},
  }));
  return vi.spyOn(apiClient, "post").mockResolvedValue({
    data: { id: "assignment-1" },
    error: null,
    meta: {},
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("asignación semanal flexible", () => {
  it("abre el ciclo en su semana actual y navega solo las sesiones de cada semana", async () => {
    const sessions = [
      [1, 1, "Semana 1 · Piernas", "SKIPPED", "2026-11-02"],
      [2, 1, "Semana 2 · Empuje", "NOT_STARTED", null],
      [2, 2, "Semana 2 · Tirón", "PARTIAL", "2026-11-11"],
      [3, 1, "Semana 3 · Full body", "COMPLETED", "2026-11-18"],
      [4, 1, "Semana 4 · Potencia", "NOT_STARTED", null],
      [4, 2, "Semana 4 · Core", "NOT_STARTED", null],
    ].map(([weekNumber, dayNumber, name, status, date], index) => ({
      id: `assignment-1:session-${index + 1}`,
      sessionId: `session-${index + 1}`,
      assignmentId: "assignment-1",
      name,
      weekNumber,
      dayNumber,
      status,
      date,
    }));
    mockApi(blockWithSessions(), {
      today: "2026-11-11",
      assignments: [
        {
          id: "assignment-1",
          programId: "program-1",
          name: "Progresión flexible",
          sourceBlockId: "block-1",
          snapshotBlockId: "snapshot-1",
          startDate: "2026-11-02",
          status: "ACTIVE",
          legacy: false,
          weekCount: 4,
          currentWeek: {
            blockName: "Bloque",
            weekNumber: 2,
            weekStart: "2026-11-09",
            availableFrom: "2026-11-09",
            weekEnd: "2026-11-15",
          },
          finishedSessions: 2,
          totalSessions: 6,
          adherence: {
            scheduledSessions: 3,
            completedSessions: 2,
            adherenceRate: 67,
          },
        },
      ],
      sessions,
      nextSession: null,
      pendingSession: null,
      weekPlan: null,
    });

    renderWithProviders(<BlockAssignmentPanel studentId="student-1" />);

    const navigator = await screen.findByRole("navigation", {
      name: "Navegación por semanas de Progresión flexible",
    });
    expect(navigator).toHaveTextContent("Semana 2 de 4");
    expect(screen.getByText("Semana 2 · Empuje", { exact: false })).toBeVisible();
    expect(screen.getByText("Semana 2 · Tirón", { exact: false })).toBeVisible();
    expect(screen.queryByText("Semana 1 · Piernas", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/Sin fecha · Pendiente/)).toBeVisible();
    expect(screen.getByText("2 / 6 sesiones finalizadas", { exact: false })).toBeVisible();

    await userEvent.click(within(navigator).getByRole("button", { name: "Anterior" }));
    expect(navigator).toHaveTextContent("Semana 1 de 4");
    expect(screen.getByText("Semana 1 · Piernas", { exact: false })).toBeVisible();
    expect(within(navigator).getByRole("button", { name: "Anterior" })).toBeDisabled();

    await userEvent.click(within(navigator).getByRole("button", { name: "Siguiente" }));
    await userEvent.click(within(navigator).getByRole("button", { name: "Siguiente" }));
    await userEvent.click(within(navigator).getByRole("button", { name: "Siguiente" }));
    expect(navigator).toHaveTextContent("Semana 4 de 4");
    expect(screen.getByText("Semana 4 · Potencia", { exact: false })).toBeVisible();
    expect(screen.getByText("Semana 4 · Core", { exact: false })).toBeVisible();
    expect(within(navigator).getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("elige un límite coherente cuando el ciclo no tiene una semana actual", async () => {
    mockApi(blockWithSessions(), {
      today: "2026-12-01",
      assignments: [
        {
          id: "assignment-1",
          name: "Ciclo finalizado",
          startDate: "2026-11-02",
          status: "FINISHED",
          legacy: false,
          weekCount: 2,
          currentWeek: null,
          finishedSessions: 0,
          totalSessions: 2,
          adherence: { scheduledSessions: 0, completedSessions: 0 },
        },
      ],
      sessions: [
        {
          id: "assignment-1:first",
          sessionId: "first",
          assignmentId: "assignment-1",
          name: "Primera semana",
          weekNumber: 1,
          dayNumber: 1,
          status: "COMPLETED",
          date: "2026-11-02",
        },
        {
          id: "assignment-1:last",
          sessionId: "last",
          assignmentId: "assignment-1",
          name: "Última semana",
          weekNumber: 2,
          dayNumber: 1,
          status: "PARTIAL",
          date: "2026-11-09",
        },
      ],
      nextSession: null,
      pendingSession: null,
    });

    renderWithProviders(<BlockAssignmentPanel studentId="student-1" />);

    expect(
      await screen.findByRole("navigation", {
        name: "Navegación por semanas de Ciclo finalizado",
      }),
    ).toHaveTextContent("Semana 2 de 2");
    expect(screen.getByText("Última semana", { exact: false })).toBeVisible();
    expect(screen.queryByText("Primera semana", { exact: false })).not.toBeInTheDocument();
  });

  it("asigna el bloque sin exigir ni enviar dayOffsets", async () => {
    const post = mockApi(blockWithSessions());
    renderWithProviders(<BlockAssignmentPanel studentId="student-1" />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Asignar bloque" }),
    );
    await userEvent.selectOptions(
      await screen.findByLabelText("Bloque reusable"),
      "block-1",
    );

    expect(
      await screen.findByRole("heading", { name: "Flexibilidad semanal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/disponibles de lunes a domingo/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Posición del día/i),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha de inicio"), {
      target: { value: "2026-11-11" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar asignación" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/students/student-1/block-assignments",
        {
          blockId: "block-1",
          startDate: "2026-11-11",
          replaceActive: false,
        },
      ),
    );
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("dayOffsets");
  });

  it("mantiene bloqueada una asignación cuyo bloque no tiene sesiones", async () => {
    mockApi(blockWithSessions(0));
    renderWithProviders(<BlockAssignmentPanel studentId="student-1" />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Asignar bloque" }),
    );
    await userEvent.selectOptions(
      await screen.findByLabelText("Bloque reusable"),
      "block-1",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este bloque no tiene sesiones",
    );
    expect(
      screen.getByRole("button", { name: "Confirmar asignación" }),
    ).toBeDisabled();
  });

  it("previsualiza siete días y permite al coach enviar una advertencia justificada al chat", async () => {
    mockApi(blockWithSessions(), riskyTrainingOverview);
    const postFile = vi.spyOn(apiClient, "postFile").mockResolvedValue({
      data: { id: "message-1" },
      error: null,
      meta: {},
    });
    renderWithProviders(<BlockAssignmentPanel studentId="student-1" />);

    const preview = await screen.findByRole("alert", {
      name: "Previsualización de la planificación semanal",
    });
    expect(preview).toHaveTextContent("Solo visible para el coach");
    expect(preview).toHaveTextContent("Se priorizó la recuperación de piernas");
    expect(
      screen.getByLabelText("Distribución de lunes a domingo").children,
    ).toHaveLength(7);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Preparar advertencia para el chat",
      }),
    );
    expect(
      (
        screen.getByLabelText(
          "Advertencia para el alumno",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Justificación");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar advertencia" }),
    );

    await waitFor(() =>
      expect(postFile).toHaveBeenCalledWith(
        "/messages/student-1",
        expect.any(FormData),
      ),
    );
    const sentData = postFile.mock.calls[0]![1] as FormData;
    expect(sentData.get("body")).toContain("[TRAINING_PLAN_ALERT]");
    expect(sentData.get("body")).toContain("Distribución sugerida");
    expect(
      await screen.findByText("Advertencia enviada en el chat."),
    ).toBeVisible();
  });
});
