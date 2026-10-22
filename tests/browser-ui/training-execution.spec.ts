import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`ejecución compacta a ${width}px, teclado y borradores`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let data = {
      id: "s",
      name: "Fuerza · Día 1",
      blockName: "Preparación",
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
      exercises: ["Sentadilla", "Press de banca", "Remo", "Plancha"].map(
        (name, i) => ({
          id: `e${i}`,
          exerciseId: `catalog${i}`,
          name,
          status: "NOT_STARTED",
          muscleGroups: [],
          notes:
            i === 0
              ? "Controla el descenso.\nPausa un segundo antes de subir."
              : null,
          instructions: null,
          videoUrl: null,
          sets: [1, 2, 3].map((setNumber) => ({
            setNumber,
            weight: 40,
            reps: 10,
            rpe: 8,
            priority: "low",
            status: "PENDING",
            actual: {
              weight: null as number | null,
              reps: null as number | null,
              rpe: null as number | null,
            },
          })),
        }),
      ),
    };
    let saves = 0;
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      let result: unknown = [];
      if (url.pathname.endsWith("/auth/refresh"))
        result = {
          accessToken: "ui-fixture",
          user: {
            id: "student",
            name: "Alumno",
            role: "STUDENT",
            isActive: true,
          },
        };
      if (url.pathname.includes("/notifications"))
        result = { items: [], count: 0 };
      if (url.pathname.endsWith("/training/sessions/s")) {
        if (route.request().method() === "PATCH") {
          saves++;
          const body = route.request().postDataJSON();
          data = {
            ...data,
            revision: data.revision + 1,
            status: "PARTIAL",
            exercises: data.exercises.map((e) => ({
              ...e,
              sets: e.sets.map((s) => {
                const saved = body.sets.find(
                  (x: { sessionExerciseId: string; setNumber: number }) =>
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
          };
        }
        result = data;
      }
      await route.fulfill({ json: { data: result, error: null, meta: {} } });
    });
    await page.goto("/training/sessions/s");
    const weight = page.getByLabel("Peso serie 1 de Sentadilla", {
      exact: true,
    });
    await expect(weight).toBeVisible();
    await expect(weight).toHaveValue("");
    await weight.fill("37.5");
    await page.getByRole("button", { name: /Remo.*series/ }).click();
    await expect(weight).not.toBeVisible();
    const first = page.getByRole("button", { name: /Sentadilla.*series/ });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(weight).toHaveValue("37.5");
    await page.getByRole("button", { name: "Anotar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Serie 1 · Registrada/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(saves).toBe(1);
    await expect(
      page.getByRole("button", { name: /Serie 2 · Pendiente/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/p3-execution-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Serie 2 · Pendiente/ }),
    ).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: /Serie 1 · Registrada/ }).click();
    await expect(weight).toHaveValue("37.5");
  });
}
