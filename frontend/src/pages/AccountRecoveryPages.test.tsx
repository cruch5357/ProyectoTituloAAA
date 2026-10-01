import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { AccountLinkPage, ForgotPasswordPage } from "./AccountRecoveryPages";
import { activate, forgotPassword, resetPassword } from "../api/auth";
import { ApiError } from "../lib/apiClient";

vi.mock("../api/auth", () => ({
  activate: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));
function Location() {
  return <p data-testid="location">{useLocation().search}</p>;
}
function renderPage(
  mode: "activate" | "reset-password" | "forgot-password",
  query = "?token=secret",
) {
  render(
    <MemoryRouter initialEntries={[`/${mode}${query}`]}>
      <Location />
      <Routes>
        <Route
          path={`/${mode}`}
          element={
            mode === "forgot-password" ? (
              <ForgotPasswordPage />
            ) : (
              <AccountLinkPage mode={mode} />
            )
          }
        />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => vi.resetAllMocks());
describe("Account recovery", () => {
  it("submits email and presents generic confirmation", async () => {
    vi.mocked(forgotPassword).mockResolvedValue({
      message: "Si existe una cuenta activa, recibirás instrucciones.",
    });
    renderPage("forgot-password", "");
    await userEvent.type(screen.getByLabelText("Correo"), "user@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar instrucciones" }),
    );
    expect(forgotPassword).toHaveBeenCalledWith("user@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si existe una cuenta activa",
    );
  });
  it("rejects mismatching passwords without API call", async () => {
    renderPage("reset-password");
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Password123",
    );
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "Different123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restablecer contraseña" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("no coinciden");
    expect(resetPassword).not.toHaveBeenCalled();
  });
  it("uses token from email, removes it from URL and confirms reset", async () => {
    vi.mocked(resetPassword).mockResolvedValue({ message: "OK" });
    renderPage("reset-password");
    expect(screen.getByTestId("location")).toBeEmptyDOMElement();
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Password123",
    );
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "Password123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restablecer contraseña" }),
    );
    expect(resetPassword).toHaveBeenCalledWith("secret", "Password123");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Contraseña restablecida",
    );
  });
  it("activates without accepting role or coach id and redirects to login", async () => {
    renderPage("activate");
    await userEvent.type(screen.getByLabelText("Nombre"), "Alumno Uno");
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Password123",
    );
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "Password123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Activar cuenta" }),
    );
    expect(activate).toHaveBeenCalledWith(
      "secret",
      "Alumno Uno",
      "Password123",
    );
    expect(await screen.findByText("Login")).toBeInTheDocument();
  });
  it("shows expired/invalid link errors without revealing backend internals", async () => {
    vi.mocked(resetPassword).mockRejectedValue(
      new ApiError(401, "private backend detail"),
    );
    renderPage("reset-password");
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Password123",
    );
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "Password123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restablecer contraseña" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "inválido, expiró o ya fue utilizado",
    );
    expect(
      screen.queryByText("private backend detail"),
    ).not.toBeInTheDocument();
  });
  it("handles missing token", () => {
    renderPage("activate", "");
    expect(screen.getByRole("alert")).toHaveTextContent("Falta el enlace");
  });
});
