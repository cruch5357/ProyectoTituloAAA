import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "../../auth/authContextObject";
import { apiClient } from "../../lib/apiClient";
import type { TrainingDetail } from "../../api/training";
import { TrainingSessionPage } from "./TrainingSessionPage";

const initial: TrainingDetail = {
  id: "s",
  name: "Día 1",
  blockName: "Fuerza",
  assignmentId: "a",
  studentId: "student",
  weekNumber: 1,
  dayNumber: 1,
  revision: 0,
  finished: false,
  scheduledDate: "2026-10-21",
  suggestedDate: "2026-10-21",
  weekStart: "2026-10-19",
  availableFrom: "2026-10-19",
  weekEnd: "2026-10-25",
  actualDate: null,
  canRequestCorrection: false,
  canStartEarly: false,
  canStart: false,
  availability: "IN_PROGRESS",
  startBlockedReason: null,
  status: "NOT_STARTED",
  readOnly: false,
  cycleStatus: "ACTIVE",
  legacy: false,
  workoutLogId: null,
  durationMinutes: null,
  finishedAt: null,
  exercises: ["Sentadilla", "Remo"].map((name, i) => ({
    id: `e${i}`,
    exerciseId: `catalog${i}`,
    name,
    status: "NOT_STARTED",
    muscleGroups: [],
    notes: "Mantén el control.\nPausa abajo.",
    instructions: "Texto genérico",
    videoUrl: null,
    sets: [1, 2, 3].map((setNumber) => ({
      setNumber,
      weight: 100,
      reps: 5,
      rpe: 7,
      priority: "low",
      status: "PENDING",
      actual: { weight: null, reps: null, rpe: null },
    })),
  })),
};
function setup(data = initial, role: "STUDENT" | "COACH" = "STUDENT") {
  vi.spyOn(apiClient, "get").mockResolvedValue({ data, error: null, meta: {} });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/training/sessions/:id", element: <TrainingSessionPage /> }],
    { initialEntries: ["/training/sessions/s"] },
  );
  return render(
    <QueryClientProvider client={cache}>
      <AuthContext.Provider
        value={{
          status: "authenticated",
          user: {
            id: "student",
            name: "Alumno",
            email: "a@example.com",
            role,
            coachId: "c",
            isActive: true,
            createdAt: "",
          },
          login: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
function mockSave() {
  return vi.spyOn(apiClient, "patch").mockImplementation(async (_url, body) => {
    const payload = body as {
      sets: {
        sessionExerciseId: string;
        setNumber: number;
        status: "RECORDED" | "SKIPPED";
        weight: number;
        reps: number;
        rpe: number;
      }[];
    };
    return {
      data: {
        ...initial,
        revision: 1,
        status: "PARTIAL",
        exercises: initial.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((s) => {
            const saved = payload.sets.find(
              (x) =>
                x.sessionExerciseId === e.id && x.setNumber === s.setNumber,
            );
            return saved
              ? {
                  ...s,
                  status: saved.status,
                  actual: {
                    weight: saved.weight,
                    reps: saved.reps,
                    rpe: saved.rpe,
                  },
                }
              : s;
          }),
        })),
      },
      error: null,
      meta: {},
    };
  });
}
const field = (name = "Peso", n = 1, exercise = "Sentadilla") =>
  screen.getByLabelText(`${name} serie ${n} de ${exercise}`);
beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const inSet = (n = 1, exercise = "Sentadilla") =>
  within(screen.getByRole("group", { name: `${exercise}, serie ${n}` }));
const exerciseToggle = (exercise = "Sentadilla") =>
  screen.getByRole("button", { name: new RegExp(`${exercise}.*series`) });
async function openExercise(exercise = "Sentadilla") {
  const button = await screen.findByRole("button", {
    name: new RegExp(`${exercise}.*series`),
  });
  if (button.getAttribute("aria-expanded") === "false")
    await userEvent.click(button);
  return button;
}
async function openSet(n = 1, exercise = "Sentadilla") {
  await openExercise(exercise);
  const button = screen.getByRole("button", {
    name: new RegExp(`Serie ${n} ·`),
  });
  if (button.getAttribute("aria-expanded") === "false")
    await userEvent.click(button);
  return inSet(n, exercise);
}
const sentSets = (patch: ReturnType<typeof mockSave>) =>
  (patch.mock.calls.at(-1)![1] as { sets: Record<string, unknown>[] }).sets;

describe("Ejecución compacta y registro seguro", () => {
  it("inicia una sesión disponible de la semana y habilita el registro", async () => {
    const available: TrainingDetail = {
      ...initial,
      readOnly: true,
      canStart: true,
      availability: "AVAILABLE",
      workoutLogId: null,
    };
    const started: TrainingDetail = {
      ...available,
      readOnly: false,
      canStart: false,
      availability: "IN_PROGRESS",
      workoutLogId: "log",
      actualDate: "2026-10-21",
    };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: started,
      error: null,
      meta: {},
    });
    setup(available);

    expect(
      await screen.findByRole("button", { name: "Iniciar entrenamiento" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/registro es de solo lectura/i),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Iniciar entrenamiento" }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/training/sessions/s/start", {
        assignmentId: "a",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Finalizar sesión" }),
    ).toBeInTheDocument();
  });

  it("explica el bloqueo de una semana futura sin habilitar el inicio", async () => {
    setup({
      ...initial,
      readOnly: true,
      canStart: false,
      availability: "FUTURE",
      startBlockedReason:
        "Esta sesión se habilitará cuando comience su semana.",
    });
    expect(
      await screen.findByText(/se habilitará cuando comience su semana/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Iniciar entrenamiento" }),
    ).not.toBeInTheDocument();
  });

  it("inicia contraído, permite solo un ejercicio abierto y puede contraer todos", async () => {
    const patch = mockSave();
    setup();
    const sentadilla = await screen.findByRole("button", {
      name: /Sentadilla.*series/,
    });
    const remo = exerciseToggle("Remo");
    expect(sentadilla).toHaveAttribute("aria-expanded", "false");
    expect(remo).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByLabelText(/Duración al finalizar/),
    ).not.toBeInTheDocument();
    await userEvent.click(sentadilla);
    expect(sentadilla).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(remo);
    expect(sentadilla).toHaveAttribute("aria-expanded", "false");
    expect(remo).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(remo);
    expect(remo).toHaveAttribute("aria-expanded", "false");
    expect(patch).not.toHaveBeenCalled();
  });

  it("cambiar de ejercicio conserva los datos escritos sin registrarlos", async () => {
    const patch = mockSave();
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "97.5" } });
    await userEvent.click(exerciseToggle("Remo"));
    await userEvent.click(exerciseToggle("Sentadilla"));
    await userEvent.click(
      screen.getByRole("button", { name: /Serie 1 · Pendiente/ }),
    );
    expect(field()).toHaveValue(97.5);
    expect(patch).not.toHaveBeenCalled();
  });

  it("autocompleta lo prescrito sin registrar y permite editar antes de Anotar", async () => {
    const patch = mockSave();
    setup();
    const group = await openSet();
    await userEvent.click(
      group.getByRole("button", { name: "Usar valores prescritos" }),
    );
    expect(field()).toHaveValue(100);
    expect(field("Reps")).toHaveValue(5);
    expect(field("RPE")).toHaveValue(7);
    expect(
      screen.getByRole("button", { name: /Serie 1 · Pendiente/ }),
    ).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "95" } });
    expect(field()).toHaveValue(95);
  });

  it("escribir y mover el foco no registra automáticamente", async () => {
    const patch = mockSave();
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "97.5" } });
    await userEvent.click(field("RPE"));
    await userEvent.click(screen.getByRole("button", { name: /Serie 2/ }));
    expect(patch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Serie 1 · Pendiente/ }),
    ).toBeInTheDocument();
  });

  it("Anotar conserva valores manuales incluso cero, rellena vacíos y guarda", async () => {
    const patch = mockSave();
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "0" } });
    fireEvent.change(field("RPE"), { target: { value: "8.5" } });
    await userEvent.click(inSet(1).getByRole("button", { name: "Anotar" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/training/sessions/s",
        expect.objectContaining({
          assignmentId: "a",
          revision: 0,
          finish: false,
          sets: [
            expect.objectContaining({
              setNumber: 1,
              weight: 0,
              reps: 5,
              rpe: 8.5,
              status: "RECORDED",
            }),
          ],
        }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: /Serie 1 · Registrada/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getAllByRole("button", { name: /Serie 2 · Pendiente/ })[0],
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("0 kg · 5 reps · @8.5")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /añadir serie|agregar serie/i }),
    ).not.toBeInTheDocument();
  });
  it("Guardar progreso conserva un borrador sin convertirlo en SetLog", async () => {
    const patch = mockSave();
    setup();
    await openSet(2);
    fireEvent.change(field("Peso", 2), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar progreso" }));
    expect(patch).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Borrador conservado en esta pestaña/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Serie 2 · Pendiente/ }),
    ).toBeInTheDocument();
  });

  it("al finalizar advierte sobre valores escritos sin confirmar", async () => {
    mockSave();
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Finalizar sesión" }));
    expect(
      await screen.findByText(
        /valores escritos o autocompletados sin confirmar/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Seguir entrenando" }),
    ).toBeInTheDocument();
  });

  it("recupera cambios sin registrar después de recargar y no crea un SetLog", async () => {
    const patch = mockSave();
    const view = setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "92" } });
    view.unmount();
    setup();
    await openSet();
    expect(field()).toHaveValue(92);
    expect(patch).not.toHaveBeenCalled();
  });

  it("Omitir persiste, contrae la serie y conserva las demás", async () => {
    const patch = mockSave();
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "81" } });
    await userEvent.click(inSet(1).getByRole("button", { name: "Omitir" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(sentSets(patch)).toEqual([
      expect.objectContaining({ setNumber: 1, status: "SKIPPED" }),
    ]);
    const skipped = await screen.findByRole("button", {
      name: /Serie 1 · Omitida/,
    });
    expect(skipped).toHaveAttribute("aria-expanded", "false");
    expect(skipped.closest(".training-set-row")).toHaveClass(
      "performed-set--SKIPPED",
    );
    expect(
      screen.getByRole("button", { name: /Serie 2 · Pendiente/ }),
    ).toBeInTheDocument();
  });

  it("Dejar pendiente contrae sin registrar y conserva el borrador", async () => {
    const patch = mockSave();
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "81" } });
    await userEvent.click(
      inSet(1).getByRole("button", { name: "Dejar pendiente" }),
    );
    expect(patch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Serie 1 · Pendiente/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await openSet();
    expect(field()).toHaveValue(81);
  });

  it("un error conserva el formulario y permite reintentar sin doble envío", async () => {
    const patch = vi
      .spyOn(apiClient, "patch")
      .mockRejectedValue(new Error("Sin conexión"));
    setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "91" } });
    const button = inSet(1).getByRole("button", { name: "Anotar" });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText("Sin conexión");
    expect(patch).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue(91);
    expect(
      screen.getByRole("button", { name: /Serie 1 · Registrada/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("no restaura silenciosamente un borrador sobre una revisión diferente", async () => {
    const view = setup();
    await openSet();
    fireEvent.change(field(), { target: { value: "76" } });
    view.unmount();
    setup({ ...initial, revision: 2 });
    expect(
      await screen.findByText(/Hay un borrador local/),
    ).toBeInTheDocument();
    await openSet();
    expect(field()).toBeDisabled();
    expect(sessionStorage.getItem("execution-draft:student:a:s")).toContain(
      "76",
    );
  });
  it("el Coach puede consultar acordeones sin acciones de escritura", async () => {
    setup({ ...initial, readOnly: true, canRequestCorrection: true }, "COACH");
    const remo = await screen.findByRole("button", { name: /Remo.*series/ });
    expect(remo).toHaveAttribute("aria-expanded", "false");
    await openSet(1, "Remo");
    expect(field("Peso", 1, "Remo")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Anotar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Finalizar sesión" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Solicitar corrección al coach" }),
    ).not.toBeInTheDocument();
  });
  it("requiere confirmar y omite todas las series si no existe ninguna registrada", async () => {
    const patch = mockSave();
    setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Omitir sesión" }),
    );
    expect(patch).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Omitir pendientes y cerrar" }),
    );
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const body = patch.mock.calls[0][1] as {
      sets: { status: string }[];
      finish: boolean;
    };
    expect(body.finish).toBe(true);
    expect(body.sets).toHaveLength(6);
    expect(body.sets.every((s) => s.status === "SKIPPED")).toBe(true);
  });

  it("al omitir la sesión conserva series registradas y omite solo las restantes", async () => {
    const patch = mockSave();
    const withRecorded: TrainingDetail = {
      ...initial,
      workoutLogId: "log",
      revision: 1,
      status: "PARTIAL",
      exercises: initial.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        sets: exercise.sets.map((set) =>
          exerciseIndex === 0 && set.setNumber === 1
            ? {
                ...set,
                status: "RECORDED" as const,
                actual: { weight: 90, reps: 5, rpe: 8 },
              }
            : set,
        ),
      })),
    };
    setup(withRecorded);
    await userEvent.click(
      await screen.findByRole("button", { name: "Omitir sesión" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Omitir pendientes y cerrar" }),
    );
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const sets = sentSets(patch) as { status: string; setNumber: number }[];
    expect(sets.filter((set) => set.status === "RECORDED")).toHaveLength(1);
    expect(sets.filter((set) => set.status === "SKIPPED")).toHaveLength(5);
  });
  it("una sesión cerrada solo permite enviar una solicitud, sin modificar datos", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { id: "correction" },
      error: null,
      meta: {},
    });
    setup({
      ...initial,
      readOnly: true,
      status: "SKIPPED",
      canRequestCorrection: true,
    });
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Solicitar corrección al coach",
      }),
    );
    expect(
      screen.getByText(/Registro original: Sin datos/),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Peso corregido"), "60");
    await userEvent.type(
      screen.getByLabelText("Repeticiones corregidas"),
      "10",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar solicitud" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/training/sessions/s/corrections",
        expect.objectContaining({
          assignmentId: "a",
          sessionExerciseId: "e0",
          setNumber: 1,
          weight: 60,
          reps: 10,
        }),
      ),
    );
    expect(
      await screen.findByText(/Los datos no cambiarán hasta que sea aprobada/),
    ).toBeInTheDocument();
  });
  it("inicia anticipadamente solo mediante la acción explícita", async () => {
    const started = {
      ...initial,
      workoutLogId: "log",
      readOnly: false,
      canStartEarly: false,
      actualDate: "2026-10-20",
    };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: started,
      error: null,
      meta: {},
    });
    setup({ ...initial, readOnly: true, canStartEarly: true });
    await userEvent.click(
      await screen.findByRole("button", { name: "Iniciar anticipadamente" }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/training/sessions/s/start", {
        assignmentId: "a",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Finalizar sesión" }),
    ).toBeInTheDocument();
  });
});
