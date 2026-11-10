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

function mockApi(block: LibraryBlock) {
  vi.spyOn(apiClient, "get").mockImplementation(async (path) => ({
    data:
      path === "/block-library"
        ? [block]
        : path === `/block-library/${block.id}`
          ? block
          : trainingOverview,
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
});
