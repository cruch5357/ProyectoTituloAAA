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
  status: "NOT_STARTED",
  readOnly: false,
  cycleStatus: "ACTIVE",
  legacy: false,
  workoutLogId: null,
  durationMinutes: null,
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
function setup(data = initial) {
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
            role: "STUDENT",
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

// Cada serie es un fieldset con nombre "<ejercicio>, serie <n>": como ahora
// todas las series pendientes están abiertas, los botones se buscan dentro de
// la serie correspondiente.
const inSet = (n = 1, exercise = "Sentadilla") =>
  within(screen.getByRole("group", { name: `${exercise}, serie ${n}` }));
const ready = () => screen.findAllByRole("button", { name: "Anotar" });
const sentSets = (patch: ReturnType<typeof mockSave>) =>
  (patch.mock.calls.at(-1)![1] as { sets: Record<string, unknown>[] }).sets;

describe("Ejecución compacta y registro seguro", () => {
  it("abre todos los ejercicios y todas las series pendientes, vacías", async () => {
    const patch = mockSave();
    setup();
    expect(
      await screen.findByRole("button", { name: /Sentadilla.*series/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Remo.*series/ }),
    ).toHaveAttribute("aria-expanded", "true");
    for (const button of screen.getAllByRole("button", {
      name: /Serie \d · Pendiente/,
    }))
      expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: "Anotar" })).toHaveLength(6);
    expect(field()).toHaveValue(null);
    expect(field("Peso", 3, "Remo")).toBeEnabled();
    expect(patch).not.toHaveBeenCalled();
    expect(screen.queryByText("Indicaciones")).not.toBeInTheDocument();
    expect(screen.queryByText("Texto genérico")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Mantén el control/)[0]).toBeInTheDocument();
  });
  it("escribir no guarda; al pasar a otra serie la anterior se anota sola", async () => {
    const patch = mockSave();
    setup();
    await ready();
    await userEvent.click(field());
    fireEvent.change(field(), { target: { value: "97.5" } });
    // Moverse dentro de la misma serie no la anota.
    await userEvent.click(field("RPE"));
    expect(patch).not.toHaveBeenCalled();
    await userEvent.click(field("Peso", 2));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(sentSets(patch)).toEqual([
      expect.objectContaining({
        setNumber: 1,
        status: "RECORDED",
        weight: 97.5,
        reps: 5,
        rpe: 7,
      }),
    ]);
    expect(
      await screen.findByRole("button", { name: /Serie 1 · Registrada/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });
  it("Anotar conserva valores manuales incluso cero, rellena vacíos y guarda", async () => {
    const patch = mockSave();
    setup();
    await ready();
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
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("0 kg · 5 reps · @8.5")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /añadir serie|agregar serie/i }),
    ).not.toBeInTheDocument();
  });
  it("Guardar progreso también guarda las series con datos escritos sin anotar", async () => {
    const patch = mockSave();
    setup();
    await ready();
    fireEvent.change(field("Peso", 2), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar progreso" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(sentSets(patch)).toEqual([
      expect.objectContaining({
        setNumber: 2,
        status: "RECORDED",
        weight: 88,
        reps: 5,
        rpe: 7,
      }),
    ]);
    expect(
      await screen.findByRole("button", { name: /Serie 2 · Registrada/ }),
    ).toBeInTheDocument();
  });
  it("al finalizar avisa cuántas series con datos sin anotar se registrarán", async () => {
    mockSave();
    setup();
    await ready();
    fireEvent.change(field(), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Finalizar sesión" }));
    expect(
      await screen.findByText(
        /1 series registradas \(incluye 1 con datos escritos sin anotar\)\. Las 5 pendientes sin datos quedarán omitidas/,
      ),
    ).toBeInTheDocument();
  });
  it("recupera cambios sin registrar después de recargar y no crea un SetLog", async () => {
    const patch = mockSave();
    const view = setup();
    await ready();
    fireEvent.change(field(), { target: { value: "92" } });
    view.unmount();
    setup();
    await ready();
    expect(field()).toHaveValue(92);
    expect(
      screen.getAllByRole("button", { name: /Serie 1 · Pendiente/ })[0],
    ).toHaveAttribute("aria-expanded", "true");
    expect(patch).not.toHaveBeenCalled();
  });
  it("omitir y dejar pendiente conservan los campos manuales", async () => {
    setup();
    await ready();
    fireEvent.change(field(), { target: { value: "81" } });
    await userEvent.click(inSet(1).getByRole("button", { name: "Omitir" }));
    expect(field()).toHaveValue(81);
    await userEvent.click(
      inSet(1).getByRole("button", { name: "Dejar pendiente" }),
    );
    expect(field()).toHaveValue(81);
  });
  it("un error conserva el formulario y permite reintentar sin doble envío", async () => {
    const patch = vi
      .spyOn(apiClient, "patch")
      .mockRejectedValue(new Error("Sin conexión"));
    setup();
    await ready();
    fireEvent.change(field(), { target: { value: "91" } });
    const button = inSet(1).getByRole("button", { name: "Anotar" });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText("Sin conexión");
    expect(patch).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue(91);
    expect(
      screen.getByRole("button", { name: /Serie 1 · Registrada/ }),
    ).toBeInTheDocument();
  });
  it("no restaura silenciosamente un borrador sobre una revisión diferente", async () => {
    const view = setup();
    await ready();
    fireEvent.change(field(), { target: { value: "76" } });
    view.unmount();
    setup({ ...initial, revision: 2 });
    expect(
      await screen.findByText(/Hay un borrador local/),
    ).toBeInTheDocument();
    expect(field()).toBeDisabled();
    expect(sessionStorage.getItem("execution-draft:student:a:s")).toContain(
      "76",
    );
  });
  it("el Coach puede consultar acordeones sin acciones de escritura", async () => {
    setup({ ...initial, readOnly: true });
    expect(
      await screen.findByRole("button", { name: /Remo.*series/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(field("Peso", 1, "Remo")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Anotar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Finalizar sesión" }),
    ).not.toBeInTheDocument();
  });
  it("requiere confirmar y omite exclusivamente las series existentes", async () => {
    const patch = mockSave();
    setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Omitir sesión" }),
    );
    expect(patch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    const body = patch.mock.calls[0][1] as {
      sets: { status: string }[];
      finish: boolean;
    };
    expect(body.finish).toBe(true);
    expect(body.sets).toHaveLength(6);
    expect(body.sets.every((s) => s.status === "SKIPPED")).toBe(true);
  });
});
