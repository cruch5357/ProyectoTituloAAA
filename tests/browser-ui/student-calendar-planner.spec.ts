import { expect, test } from "@playwright/test";

const today = "2026-11-10";
const actualDate = "2026-11-09";

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment:flexible",
    sessionId: "flexible",
    assignmentId: "assignment",
    name: "Sesión flexible",
    date: today,
    suggestedDate: today,
    actualDate: null,
    weekStart: "2026-11-09",
    availableFrom: "2026-11-09",
    weekEnd: "2026-11-15",
    availability: "AVAILABLE",
    canStart: true,
    finished: false,
    status: "NOT_STARTED",
    programName: "Fuerza",
    blockId: "block-lower",
    blockName: "Fuerza inferior",
    weekNumber: 1,
    blockIndex: 0,
    dayNumber: 1,
    completed: false,
    recordedSets: 0,
    totalSets: 6,
    workoutLogId: null,
    muscleGroups: ["Cuádriceps"],
    exerciseCount: 2,
    cycleStatus: "ACTIVE",
    ...overrides,
  };
}

const flexible = session();
const partial = session({
  id: "assignment:lower:workout:log-lower",
  sessionId: "lower",
  name: "Piernas real",
  actualDate,
  suggestedDate: null,
  availability: "COMPLETED",
  canStart: false,
  finished: true,
  status: "PARTIAL",
  recordedSets: 4,
  workoutLogId: "log-lower",
});
const skipped = session({
  id: "assignment:upper:workout:log-upper",
  sessionId: "upper",
  name: "Torso omitido",
  blockId: "block-upper",
  blockName: "Fuerza superior",
  actualDate,
  suggestedDate: null,
  availability: "COMPLETED",
  canStart: false,
  finished: true,
  status: "SKIPPED",
  recordedSets: 0,
  totalSets: 5,
  workoutLogId: "log-upper",
  muscleGroups: ["Espalda"],
});

const weekPlan = {
  assignmentId: "assignment",
  weekIndex: 0,
  weekStart: "2026-11-09",
  availableFrom: "2026-11-09",
  weekEnd: "2026-11-15",
  prescribedSessions: 3,
  trainingDates: [actualDate, "2026-11-12", "2026-11-15"],
  revision: 1,
  actualSessions: [
    {
      sessionId: "lower",
      name: "Piernas real",
      actualDate,
      status: "PARTIAL",
      finished: true,
      recordedSets: 4,
      totalSets: 6,
      muscleGroups: ["Cuádriceps"],
    },
  ],
  remainingSessions: 2,
  recommendedDates: ["2026-11-12", "2026-11-15"],
  assessment: {
    level: "BALANCED",
    code: "BALANCED",
    message: "Buena distribución.",
    plannedSessions: 3,
    prescribedSessions: 3,
    missingSessions: 0,
    maxConsecutiveDays: 1,
  },
};

const assignment = {
  id: "assignment",
  programId: "program",
  name: "Fuerza",
  sourceBlockId: "source",
  snapshotBlockId: "snapshot",
  startDate: "2026-11-09",
  status: "ACTIVE",
  legacy: false,
  weekCount: 1,
  currentWeek: {
    blockName: "Fuerza inferior",
    weekNumber: 1,
    weekStart: "2026-11-09",
    availableFrom: "2026-11-09",
    weekEnd: "2026-11-15",
    prescribedSessions: 3,
  },
  finishedSessions: 1,
  totalSessions: 3,
  adherence: {
    scheduledSessions: 0,
    completedSessions: 0,
    adherenceRate: null,
  },
};

for (const width of [390, 1440]) {
  test(`calendario y planificación del alumno a ${width}px`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-10T15:00:00.000Z"));
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      let data: unknown = [];
      if (url.pathname.endsWith("/auth/refresh")) {
        data = {
          accessToken: "ui-fixture",
          user: {
            id: "student",
            name: "Alumno",
            role: "STUDENT",
            isActive: true,
          },
        };
      } else if (url.pathname.includes("/notifications")) {
        data = { items: [], count: 0 };
      } else if (url.pathname.endsWith("/training/me")) {
        data = {
          today,
          assignments: [assignment],
          sessions: [flexible, partial],
          nextSession: flexible,
          pendingSession: null,
          weekPlan,
        };
      } else if (url.pathname.endsWith("/calendar/me")) {
        data = {
          today,
          assignments: [assignment],
          sessions: [flexible],
          workouts: [partial, skipped],
          nextSession: flexible,
          pendingSession: null,
          nextCompetition: null,
          competitions: [],
          competitionsTruncated: false,
          weekPlan,
        };
      }
      await route.fulfill({ json: { data, error: null, meta: {} } });
    });

    await page.goto("/training");
    await expect(
      page.getByRole("heading", { name: "Organiza tus días" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Entrenado.*Piernas real.*4\/6 series/,
      }),
    ).toBeDisabled();
    const flexibleCard = page.getByRole("link", {
      name: /Sesión flexible.*Pendiente.*0\/6 series/,
    });
    await expect(flexibleCard).toHaveAttribute(
      "href",
      "/training/sessions/flexible?assignmentId=assignment",
    );
    await expect(flexibleCard.locator("details")).toHaveCount(0);
    await expect(page.getByText("Consultar", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();

    await page.goto("/calendar");
    await page
      .getByRole("button", { name: /2 entrenamientos registrados/ })
      .click();
    const partialCard = page.getByRole("link", {
      name: /Piernas real.*Parcial.*4\/6 series/,
    });
    const skippedCard = page.getByRole("link", {
      name: /Torso omitido.*Omitido.*0\/5 series/,
    });
    await expect(partialCard).toHaveAttribute(
      "href",
      "/workout-logs/log-lower",
    );
    await expect(skippedCard).toHaveAttribute(
      "href",
      "/workout-logs/log-upper",
    );
    const lowerHue = await partialCard.evaluate((element) =>
      (element as HTMLElement).style.getPropertyValue("--calendar-block-hue"),
    );
    const upperHue = await skippedCard.evaluate((element) =>
      (element as HTMLElement).style.getPropertyValue("--calendar-block-hue"),
    );
    expect(lowerHue).not.toBe(upperHue);
    await expect(
      page.getByRole("link", { name: /Sesión flexible.*Disponible/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  });
}
