import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import { apiClient } from "../../lib/apiClient";
import type { TrainingAssignment } from "../../api/training";
import { StudentHomePage } from "./StudentHomePage";
const session = {
  id: "a:s",
  sessionId: "s",
  assignmentId: "a",
  name: "Día de fuerza",
  blockName: "Fuerza",
  weekNumber: 1,
  dayNumber: 1,
  date: "2026-10-21",
  status: "PARTIAL",
  recordedSets: 1,
  totalSets: 4,
  exerciseCount: 1,
  muscleGroups: ["quadriceps"],
};
function setup(
  empty = false,
  adherence: TrainingAssignment["adherence"] = {
    scheduledSessions: 1,
    completedSessions: 1,
    adherenceRate: 100,
  },
) {
  vi.spyOn(apiClient, "get").mockResolvedValue({
    data: {
      today: "2026-10-21",
      assignments: empty
        ? []
        : [
            {
              id: "a",
              name: "Fuerza",
              weekCount: 2,
              currentWeek: { weekNumber: 1 },
              finishedSessions: 0,
              totalSessions: 4,
              adherence,
            },
          ],
      sessions: empty ? [] : [session],
      nextSession: empty ? null : session,
      pendingSession: null,
    },
    error: null,
    meta: {},
  });
}
beforeEach(() => vi.restoreAllMocks());
describe("Inicio basado en bloques", () => {
  it("ofrece registrar la sesión directamente y muestra progreso real", async () => {
    setup();
    renderWithProviders(<StudentHomePage training />);
    expect(
      await screen.findByRole("link", { name: /Continuar entrenamiento/ }),
    ).toHaveAttribute("href", "/training/sessions/s?assignmentId=a");
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.queryByText("Mis programas")).not.toBeInTheDocument();
  });
  it("muestra un estado vacío honesto", async () => {
    setup(true);
    renderWithProviders(<StudentHomePage />);
    expect(
      await screen.findByText("Tu próximo ciclo empieza aquí"),
    ).toBeInTheDocument();
  });
  it("reutiliza las imágenes musculares del catálogo", async () => {
    setup();
    renderWithProviders(<StudentHomePage />);
    expect(await screen.findByText("Qué vas a trabajar")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Zona muscular/ })).toHaveAttribute(
      "src",
      expect.stringContaining(".webp"),
    );
  });
});

it("conserva el resumen de adherencia en el inicio del alumno", async () => {
  setup();
  renderWithProviders(<StudentHomePage />);
  expect(
    await screen.findByRole("heading", { name: "Adherencia del programa" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Adherencia del programa" }),
  ).toHaveTextContent("100%");
});

it("muestra incertidumbre histórica sin convertirla en cero por ciento", async () => {
  setup(false, {
    scheduledSessions: 1,
    completedSessions: 0,
    adherenceRate: null,
    insufficientReason: "legacy-history",
  });
  renderWithProviders(<StudentHomePage />);
  expect(
    await screen.findByText(
      "Sin datos suficientes: el historial antiguo no distingue ciclos de asignación.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Adherencia del programa" }),
  ).not.toHaveTextContent("0%");
});
it("muestra programación insuficiente cuando no hay sesiones vencidas", async () => {
  setup(false, {
    scheduledSessions: 0,
    completedSessions: 0,
    adherenceRate: null,
  });
  renderWithProviders(<StudentHomePage />);
  expect(
    await screen.findByText("Sin programación suficiente"),
  ).toBeInTheDocument();
});
