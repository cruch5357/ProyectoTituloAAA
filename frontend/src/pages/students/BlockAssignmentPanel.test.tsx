import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  overview:
    typeof trainingOverview | typeof riskyTrainingOverview = trainingOverview,
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
    expect(sentData.get("body")).toContain("Distribución sugerida");
    expect(
      await screen.findByText("Advertencia enviada en el chat."),
    ).toBeVisible();
  });
});
