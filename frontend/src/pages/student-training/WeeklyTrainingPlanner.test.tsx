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
  actualSessions: [],
  remainingSessions: 3,
  recommendedDates: ["2026-11-10", "2026-11-12", "2026-11-14"],
  assessment: {
    level: "UNPLANNED",
    code: "NO_PLAN",
    message: "Organiza tus días.",
    plannedSessions: 0,
    prescribedSessions: 3,
    missingSessions: 3,
    maxConsecutiveDays: 0,
  },
};

describe("WeeklyTrainingPlanner", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("warns immediately when three consecutive days are selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WeeklyTrainingPlanner plan={plan} today="2026-11-10" />,
    );
    const dayButtons = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("data-state") === "available");
    await user.click(dayButtons[0]);
    await user.click(dayButtons[1]);
    await user.click(dayButtons[2]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Considera dejar un día de recuperación",
    );
    expect(screen.getByText(/un entrenamiento por día/i)).toBeVisible();
  });

  it("applies the spaced recommendation and saves it", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "patch").mockResolvedValue({
      data: { ...plan, trainingDates: plan.recommendedDates, revision: 1 },
      error: null,
      meta: {},
    });
    renderWithProviders(
      <WeeklyTrainingPlanner plan={plan} today="2026-11-10" />,
    );
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

  it("locks real workout days and saves only available remaining dates", async () => {
    const user = userEvent.setup();
    const withWorkout: TrainingWeekPlan = {
      ...plan,
      actualSessions: [
        {
          sessionId: "real",
          name: "Piernas real",
          actualDate: "2026-11-10",
          status: "PARTIAL",
          finished: true,
          recordedSets: 4,
          totalSets: 6,
          muscleGroups: ["Cuádriceps"],
        },
      ],
      remainingSessions: 2,
      recommendedDates: ["2026-11-12", "2026-11-15"],
    };
    vi.spyOn(apiClient, "patch").mockResolvedValue({
      data: {
        ...withWorkout,
        trainingDates: ["2026-11-10", "2026-11-12", "2026-11-15"],
        revision: 1,
      },
      error: null,
      meta: {},
    });
    renderWithProviders(
      <WeeklyTrainingPlanner plan={withWorkout} today="2026-11-10" />,
    );

    const trained = screen.getByRole("button", {
      name: /Entrenado.*Piernas real.*4\/6 series/i,
    });
    expect(trained).toBeDisabled();
    expect(trained).toHaveAttribute("data-state", "trained");
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
      trainingDates: ["2026-11-10", "2026-11-12", "2026-11-15"],
    });
  });

  it("requires confirmation before replacing a saved organization", async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(apiClient, "patch");
    renderWithProviders(
      <WeeklyTrainingPlanner
        plan={{
          ...plan,
          trainingDates: ["2026-11-11", "2026-11-13", "2026-11-15"],
        }}
        today="2026-11-10"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Usar distribución recomendada" }),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Confirmar distribución recomendada",
      }),
    ).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it("warns only from real nearby sessions when muscle groups overlap", () => {
    renderWithProviders(
      <WeeklyTrainingPlanner
        plan={{
          ...plan,
          prescribedSessions: 2,
          remainingSessions: 0,
          actualSessions: [
            {
              sessionId: "a",
              name: "A",
              actualDate: "2026-11-10",
              status: "COMPLETED",
              finished: true,
              recordedSets: 5,
              totalSets: 5,
              muscleGroups: ["Espalda"],
            },
            {
              sessionId: "b",
              name: "B",
              actualDate: "2026-11-11",
              status: "PARTIAL",
              finished: false,
              recordedSets: 2,
              totalSets: 5,
              muscleGroups: ["espalda", "Bíceps"],
            },
          ],
          recommendedDates: [],
        }}
        today="2026-11-11"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "grupos musculares similares",
    );
    expect(screen.getByText(/48–72 horas/)).toBeVisible();
  });
});
