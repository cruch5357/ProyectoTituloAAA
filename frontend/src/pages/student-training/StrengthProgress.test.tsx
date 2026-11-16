import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { apiClient } from "../../lib/apiClient";
import { renderWithProviders } from "../../test/renderWithProviders";
import { StrengthProgress } from "./StrengthProgress";

const bench = {
  exerciseId: "bench",
  exerciseName: "Press banca",
  sessions: 43,
  since: "2026-07-06",
  firstE1rmKg: 25.3,
  lastE1rmKg: 69.7,
  changePct: 175.5,
  trend: [
    { date: "2026-11-09", e1rmKg: 66 },
    { date: "2026-11-11", e1rmKg: 69.7 },
  ],
  forecast: { predictedE1rmKg: 72.1, expectedChangePct: 3.4 },
};

function mockProgress(items: unknown[]) {
  vi.spyOn(apiClient, "get").mockResolvedValue({
    data: { items },
    error: null,
    meta: {},
  });
}

describe("StrengthProgress", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("muestra el avance propio y la previsión, sin cargas sugeridas", async () => {
    mockProgress([bench]);
    renderWithProviders(<StrengthProgress />);
    const card = await screen.findByRole("article", {
      name: "Progreso en Press banca",
    });
    expect(apiClient.get).toHaveBeenCalledWith("/training/me/progress");
    expect(card).toHaveTextContent("43 sesiones desde el 06/07");
    expect(card).toHaveTextContent("+175,5 % de fuerza estimada");
    expect(card).toHaveTextContent("25,3 → 69,7 kg de 1RM");
    expect(card).toHaveTextContent(
      "Si mantienes el ritmo, el modelo prevé 72,1 kg",
    );
    expect(
      within(card).getByRole("img", { name: /prevé 72,1 kg/ }),
    ).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/× \d+ reps/);
    expect(screen.getByText(/Tu coach define las cargas/)).toBeVisible();
  });

  it("sin modelo disponible muestra igual el progreso", async () => {
    mockProgress([{ ...bench, forecast: null }]);
    renderWithProviders(<StrengthProgress />);
    const card = await screen.findByRole("article", {
      name: "Progreso en Press banca",
    });
    expect(card).toHaveTextContent("+175,5 %");
    expect(card).not.toHaveTextContent("el modelo prevé");
  });

  it("invita a registrar sesiones cuando aún no hay progreso", async () => {
    mockProgress([]);
    renderWithProviders(<StrengthProgress />);
    expect(
      await screen.findByText(/Registra al menos dos sesiones/),
    ).toBeVisible();
  });
});
