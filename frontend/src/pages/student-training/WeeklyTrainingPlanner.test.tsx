import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiClient } from "../../lib/apiClient";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { TrainingWeekPlan } from "../../api/training";
import { WeeklyTrainingPlanner } from "./WeeklyTrainingPlanner";

const plan: TrainingWeekPlan = {
  assignmentId: "assignment",
  weekIndex: 0,
  weekStart: "2026-11-09",
  availableFrom: "2026-11-10",
  weekEnd: "2026-11-15",
  prescribedSessions: 3,
  trainingDates: [],
  revision: 0,
  recommendedDates: ["2026-11-10", "2026-11-12", "2026-11-14"],
  assessment: {
    level: "UNPLANNED",
    code: "NO_PLAN",
    message: "Organiza tus días.",
    plannedSessions: 0,
    prescribedSessions: 3,
    missingSessions: 3,
    maxConsecutiveDays: 0,
    restDays: 7,
    historicalAverageRestDays: 1.5,
  },
};

describe("WeeklyTrainingPlanner", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("warns immediately when three consecutive days are selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WeeklyTrainingPlanner plan={plan} />);
    const dayButtons = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    await user.click(dayButtons[0]);
    await user.click(dayButtons[1]);
    await user.click(dayButtons[2]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Descansa al menos un día",
    );
    expect(screen.getByText(/máximo un entrenamiento por día/i)).toBeVisible();
  });

  it("applies the spaced recommendation and saves it", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "patch").mockResolvedValue({
      data: { ...plan, trainingDates: plan.recommendedDates, revision: 1 },
      error: null,
      meta: {},
    });
    renderWithProviders(<WeeklyTrainingPlanner plan={plan} />);
    await user.click(
      screen.getByRole("button", { name: "Usar distribución recomendada" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar organización" }),
    );
    expect(apiClient.patch).toHaveBeenCalledWith("/training/week-plan", {
      assignmentId: "assignment",
      weekIndex: 0,
      revision: 0,
      trainingDates: plan.recommendedDates,
    });
    expect(
      await screen.findByText("Organización semanal guardada."),
    ).toBeVisible();
  });
});
