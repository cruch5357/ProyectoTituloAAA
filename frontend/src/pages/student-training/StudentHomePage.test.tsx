import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/renderWithProviders";
import { apiClient } from "../../lib/apiClient";
import type {
  TrainingAssignment,
  TrainingOverview,
  TrainingSessionSummary,
} from "../../api/training";
import { StudentHomePage } from "./StudentHomePage";
const session: TrainingSessionSummary = {
  id: "a:s",
  sessionId: "s",
  assignmentId: "a",
  name: "Día de fuerza",
  blockName: "Fuerza",
  weekNumber: 1,
  dayNumber: 1,
  date: "2026-10-21",
  suggestedDate: "2026-10-21",
  actualDate: "2026-10-21",
  weekStart: "2026-10-19",
  availableFrom: "2026-10-21",
  weekEnd: "2026-10-25",
  availability: "IN_PROGRESS",
  canStart: false,
  status: "PARTIAL",
  recordedSets: 1,
  totalSets: 4,
  exerciseCount: 1,
  muscleGroups: ["quadriceps"],
  programName: "Fuerza",
  blockId: "b",
  blockIndex: 0,
  completed: false,
  finished: false,
  workoutLogId: "log-1",
  legacy: false,
};
const assignment: TrainingAssignment = {
  id: "a",
  programId: "p",
  name: "Fuerza",
  sourceBlockId: "source",
  snapshotBlockId: "snapshot",
  startDate: "2026-10-21",
  status: "ACTIVE",
  legacy: false,
  weekCount: 2,
  currentWeek: {
    blockName: "Fuerza",
    weekNumber: 1,
    weekStart: "2026-10-19",
    availableFrom: "2026-10-21",
    weekEnd: "2026-10-25",
  },
  finishedSessions: 0,
  totalSessions: 4,
  adherence: {
    scheduledSessions: 1,
    completedSessions: 1,
    adherenceRate: 100,
  },
};

function sessionFor(
  weekNumber: number,
  overrides: Partial<TrainingSessionSummary> = {},
): TrainingSessionSummary {
  const date =
    overrides.date ?? `2026-10-${String(9 + weekNumber).padStart(2, "0")}`;
  return {
    ...session,
    id: `a:s${weekNumber}`,
    sessionId: `s${weekNumber}`,
    name: `Sesión semana ${weekNumber}`,
    weekNumber,
    date,
    suggestedDate: overrides.suggestedDate ?? date,
    ...overrides,
  };
}

function setupOverview(data: TrainingOverview) {
  vi.spyOn(apiClient, "get").mockResolvedValue({ data, error: null, meta: {} });
}

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
              ...assignment,
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
  it("Entrenamiento prioriza la sesión en curso y muestra la semana activa", async () => {
    setup();
    renderWithProviders(<StudentHomePage training />);
    const continueLinks = await screen.findAllByRole("link", {
      name: /Continuar entrenamiento/,
    });
    expect(
      continueLinks.some(
        (link) =>
          link.getAttribute("href") === "/training/sessions/s?assignmentId=a",
      ),
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Tu próximo paso" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tu ciclo activo")).toBeInTheDocument();
    expect(screen.queryByText("Mis programas")).not.toBeInTheDocument();
  });
  it("Inicio muestra el ciclo activo con el progreso real de sus sesiones", async () => {
    setup();
    renderWithProviders(<StudentHomePage />);
    expect(await screen.findByText("Tu ciclo activo")).toBeInTheDocument();
    expect(screen.getAllByText("Parcial")).toHaveLength(2);
    expect(screen.queryByText("Qué vas a trabajar")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: /Continuar entrenamiento/ })
        .some((link) => link.getAttribute("href") === "/training"),
    ).toBe(true);
  });
  it("muestra un estado vacío honesto", async () => {
    setup(true);
    renderWithProviders(<StudentHomePage />);
    expect(
      await screen.findByText("Tu próximo ciclo empieza aquí"),
    ).toBeInTheDocument();
  });
  it("reutiliza las imágenes musculares del catálogo en Entrenamiento", async () => {
    setup();
    renderWithProviders(<StudentHomePage training />);
    expect(await screen.findByText("Qué vas a trabajar")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Zona muscular/ })).toHaveAttribute(
      "src",
      expect.stringContaining(".webp"),
    );
  });
});

describe("jerarquía semanal del Inicio", () => {
  it("muestra la semana actual y permite solo las dos anteriores, una a la vez", async () => {
    const week12 = sessionFor(12, { date: "2026-10-21" });
    const week11 = sessionFor(11, { date: "2026-10-14" });
    const week10 = sessionFor(10, { date: "2026-10-07" });
    setupOverview({
      today: "2026-10-21",
      assignments: [
        {
          ...assignment,
          startDate: "2026-08-05",
          weekCount: 12,
          currentWeek: {
            blockName: "Segundo bloque",
            weekNumber: 12,
            weekStart: "2026-10-19",
            availableFrom: "2026-10-19",
            weekEnd: "2026-10-25",
          },
        },
      ],
      sessions: [week10, week11, week12],
      nextSession: week12,
      pendingSession: null,
    });
    renderWithProviders(<StudentHomePage />);
    const picker = await screen.findByRole("combobox", {
      name: "Semana visible de Fuerza",
    });
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Semana 12 · Actual", "Semana 11", "Semana 10"]);
    expect(
      screen.getByRole("region", { name: "Sesiones de la semana 12" }),
    ).toHaveTextContent("Sesión semana 12");
    expect(screen.queryByText("Sesión semana 11")).not.toBeInTheDocument();
    await userEvent.selectOptions(picker, "11");
    expect(
      screen.getByRole("region", { name: "Sesiones de la semana 11" }),
    ).toHaveTextContent("Sesión semana 11");
    expect(
      screen.queryByRole("region", { name: "Sesiones de la semana 12" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sesión semana 10")).not.toBeInTheDocument();
  });

  it("en semana 1 no ofrece semanas inexistentes ni futuras", async () => {
    setup();
    renderWithProviders(<StudentHomePage />);
    const picker = await screen.findByRole("combobox", {
      name: "Semana visible de Fuerza",
    });
    expect(within(picker).getAllByRole("option")).toHaveLength(1);
    expect(within(picker).getByRole("option")).toHaveTextContent(
      "Semana 1 · Actual",
    );
    expect(screen.queryByText(/Semana 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Semana 2 · Actual/)).not.toBeInTheDocument();
  });

  it("conserva estados, series y rutas reales en las sesiones visibles", async () => {
    const statuses = [
      sessionFor(1, {
        id: "a:completed",
        sessionId: "completed",
        name: "Completada",
        dayNumber: 1,
        status: "COMPLETED",
        recordedSets: 4,
        totalSets: 4,
        finished: true,
      }),
      sessionFor(1, {
        id: "a:partial",
        sessionId: "partial",
        name: "Parcial real",
        dayNumber: 2,
        status: "PARTIAL",
        recordedSets: 2,
        totalSets: 4,
      }),
      sessionFor(1, {
        id: "a:skipped",
        sessionId: "skipped",
        name: "Omitida",
        dayNumber: 3,
        status: "SKIPPED",
        recordedSets: 0,
        totalSets: 3,
        finished: true,
      }),
      sessionFor(1, {
        id: "a:pending",
        sessionId: "pending",
        name: "Pendiente real",
        dayNumber: 4,
        status: "NOT_STARTED",
        recordedSets: 0,
        totalSets: 5,
      }),
    ];
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: statuses,
      nextSession: statuses[3],
      pendingSession: null,
    });
    renderWithProviders(<StudentHomePage />);
    const week = await screen.findByRole("region", {
      name: "Sesiones de la semana 1",
    });
    expect(week).toHaveTextContent("Completado4/4 series");
    expect(week).toHaveTextContent("Parcial2/4 series");
    expect(week).toHaveTextContent("Omitido0/3 series");
    expect(week).toHaveTextContent("Pendiente0/5 series");
    expect(
      within(week).getByRole("link", { name: /Parcial real/ }),
    ).toHaveAttribute("href", "/training/sessions/partial?assignmentId=a");
  });
});

describe("entrenamiento destacado del Inicio", () => {
  it("muestra una semana vencida sin desplazar una sesión disponible", async () => {
    const omitted = sessionFor(1, {
      date: "2026-10-20",
      name: "Sesión omitida",
      status: "SKIPPED",
      recordedSets: 0,
      totalSets: 12,
      readOnly: true,
      canRequestCorrection: true,
      availability: "EXPIRED",
      canStart: false,
      actualDate: null,
      weekEnd: "2026-10-18",
    });
    const today = sessionFor(1, {
      id: "a:today",
      sessionId: "today",
      date: "2026-10-21",
      name: "Sesión de hoy",
      status: "NOT_STARTED",
      recordedSets: 0,
      availability: "AVAILABLE",
      canStart: true,
      actualDate: null,
    });
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: [omitted, today],
      nextSession: today,
      pendingSession: omitted,
    });
    renderWithProviders(<StudentHomePage />);
    const todayCard = await screen.findByRole("link", {
      name: /Disponible esta semana/,
    });
    const notice = screen.getByText("Entrenamiento omitido").closest("aside");
    expect(notice).not.toBeNull();
    expect(todayCard.compareDocumentPosition(notice!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(notice!).toHaveTextContent(
      "Confirma la omisión para cerrar la sesión",
    );
    expect(
      within(notice!).queryByText("Ir a entrenar"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Sesiones de la semana 1" }),
    ).toHaveTextContent("Omitido0/12 series");
  });
  it("enlaza la sesión en curso hacia Entrenamiento", async () => {
    setup();
    renderWithProviders(<StudentHomePage />);
    const card = (
      await screen.findAllByRole("link", {
        name: /Entrenamiento en curso/,
      })
    )[0];
    expect(card).toHaveAttribute("href", "/training");
    expect(card).toHaveTextContent("Continuar entrenamiento");
  });

  it("trata una fecha sugerida posterior como disponible en la misma semana", async () => {
    const future = sessionFor(2, {
      date: "2026-10-24",
      status: "NOT_STARTED",
      recordedSets: 0,
      availability: "AVAILABLE",
      canStart: true,
      actualDate: null,
    });
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: [future],
      nextSession: future,
      pendingSession: null,
    });
    renderWithProviders(<StudentHomePage />);
    expect(
      await screen.findByText("Disponible esta semana"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sugerido: 24 de octubre/)).toBeInTheDocument();
  });

  it("mantiene una sesión semanal entrenable y presenta la vencida como cerrada", async () => {
    const pending = sessionFor(1, {
      date: "2026-10-18",
      status: "PARTIAL",
      recordedSets: 2,
      name: "Pendiente anterior",
      availability: "EXPIRED",
      canStart: false,
      actualDate: null,
      weekEnd: "2026-10-18",
    });
    const future = sessionFor(2, {
      date: "2026-10-24",
      status: "NOT_STARTED",
      recordedSets: 0,
      availability: "AVAILABLE",
      canStart: true,
      actualDate: null,
    });
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: [pending, future],
      nextSession: future,
      pendingSession: pending,
    });
    renderWithProviders(<StudentHomePage />);
    const card = await screen.findByRole("link", {
      name: /Disponible esta semana/,
    });
    expect(card).toHaveTextContent("Sesión semana 2");
    expect(screen.getByText("Entrenamiento cerrado")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente anterior")).toHaveLength(2);
    expect(
      screen.queryByText("Entrenamiento pendiente"),
    ).not.toBeInTheDocument();
  });

  it("permite omitir rápidamente el aviso y no altera el detalle registrado", async () => {
    const pending = sessionFor(1, {
      date: "2026-10-18",
      status: "PARTIAL",
      recordedSets: 2,
      name: "Pendiente anterior",
      readOnly: true,
    });
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: [pending],
      nextSession: null,
      pendingSession: pending,
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { dismissed: true },
      error: null,
      meta: {},
    });
    renderWithProviders(<StudentHomePage />);
    const notice = (await screen.findByText("Entrenamiento cerrado")).closest(
      "aside",
    )!;
    await userEvent.click(
      within(notice).getByRole("button", {
        name: "Cerrar y omitir series pendientes",
      }),
    );
    await userEvent.click(
      within(notice).getByRole("button", { name: "Confirmar omisión" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Entrenamiento cerrado"),
      ).not.toBeInTheDocument(),
    );
    expect(post).toHaveBeenCalledWith("/training/sessions/s1/close", {
      assignmentId: "a",
    });
    expect(
      screen.getByRole("region", { name: "Sesiones de la semana 1" }),
    ).toHaveTextContent("Parcial2/4 series");
  });

  it("cierra una vencida sin registros mediante close, no mediante dismiss", async () => {
    const expired = sessionFor(1, {
      date: "2026-10-18",
      status: "SKIPPED",
      recordedSets: 0,
      finished: false,
      readOnly: true,
    });
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: [expired],
      nextSession: null,
      pendingSession: expired,
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: expired,
      error: null,
      meta: {},
    });
    renderWithProviders(<StudentHomePage />);
    const notice = (await screen.findByText("Entrenamiento omitido")).closest(
      "aside",
    )!;
    await userEvent.click(
      within(notice).getByRole("button", { name: "Omitir entrenamiento" }),
    );
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(
      within(notice).getByRole("button", { name: "Confirmar omisión" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/training/sessions/s1/close", {
        assignmentId: "a",
      }),
    );
  });

  it("una sesión ya omitida solo oculta el aviso sin cerrar nuevamente", async () => {
    const skipped = sessionFor(1, {
      date: "2026-10-18",
      status: "SKIPPED",
      recordedSets: 0,
      finished: true,
      readOnly: true,
    });
    setupOverview({
      today: "2026-10-21",
      assignments: [assignment],
      sessions: [skipped],
      nextSession: null,
      pendingSession: skipped,
    });
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { dismissed: true },
      error: null,
      meta: {},
    });
    renderWithProviders(<StudentHomePage />);
    const notice = (await screen.findByText("Entrenamiento omitido")).closest(
      "aside",
    )!;
    await userEvent.click(
      within(notice).getByRole("button", { name: "Ocultar aviso" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/training/sessions/s1/dismiss", {
        assignmentId: "a",
      }),
    );
    expect(screen.queryByText("Entrenamiento omitido")).not.toBeInTheDocument();
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
  ).toHaveTextContent("100 % de adherencia");
});

it("calcula la antigüedad desde la fecha real del bloque", async () => {
  setupOverview({
    today: "2026-10-21",
    assignments: [{ ...assignment, startDate: "2026-08-05" }],
    sessions: [session],
    nextSession: session,
    pendingSession: null,
  });
  renderWithProviders(<StudentHomePage />);
  const adherence = await screen.findByRole("region", {
    name: "Adherencia del programa",
  });
  expect(adherence).toHaveTextContent(
    "Inicio del bloque: 5 de agosto · Hace 11 semanas",
  );
  expect(adherence).toHaveTextContent("100 % de adherencia");
  expect(adherence).toHaveTextContent("1 de 1 sesiones de semanas cerradas");
});

it("separa completadas, omitidas, parciales vencidas y sesiones accionables", async () => {
  setupOverview({
    today: "2026-10-21",
    assignments: [
      {
        ...assignment,
        adherence: {
          scheduledSessions: 34,
          completedSessions: 25,
          adherenceRate: 73.53,
          fullyCompletedSessions: 25,
          skippedSessions: 6,
          expiredPartialSessions: 3,
          actionableSessions: 4,
        },
      },
    ],
    sessions: [session],
    nextSession: session,
    pendingSession: null,
  });
  renderWithProviders(<StudentHomePage />);
  const adherence = await screen.findByRole("region", {
    name: "Adherencia del programa",
  });
  expect(adherence).toHaveTextContent("73,53 % de adherencia");
  expect(adherence).toHaveTextContent("25 completadas");
  expect(adherence).toHaveTextContent("6 omitidas");
  expect(adherence).toHaveTextContent("3 parciales vencidas");
  expect(adherence).toHaveTextContent("4 disponibles esta semana");
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
