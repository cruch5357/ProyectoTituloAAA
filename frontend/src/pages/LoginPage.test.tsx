import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../auth/authContextObject";
import type { AuthContextValue } from "../auth/authContextObject";
import type { PublicUser } from "../types/user";
import { ApiError } from "../lib/apiClient";
import { LoginPage } from "./LoginPage";

// Pruebas de navegación crítica (PROMPT 17): el login debe redirigir según
// el rol del usuario (Coach -> /dashboard, Alumno -> /home), no
// siempre al mismo lugar. Se usa un AuthContext.Provider "a mano" (en vez
// de AuthProvider real) para no depender de la llamada de red a
// /auth/refresh que AuthProvider dispara al montarse.
function buildUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "user-1",
    email: "user@example.com",
    role: "STUDENT",
    name: "Usuario de prueba",
    isActive: true,
    coachId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderLogin(authValue: AuthContextValue, route = "/login") {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Panel del coach</div>} />
          <Route
            path="/home"
            element={<div>Mis programas asignados</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("LoginPage", () => {
  it("links to password recovery", () => {
    renderLogin({
      status: "anonymous",
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
    });
    expect(
      screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
  it("redirige a /dashboard cuando ya hay sesión de un coach", () => {
    renderLogin({
      status: "authenticated",
      user: buildUser({ role: "COACH" }),
      login: vi.fn(),
      logout: vi.fn(),
    });

    expect(screen.getByText("Panel del coach")).toBeInTheDocument();
  });

  it("redirige a /home cuando ya hay sesión de un alumno", () => {
    renderLogin({
      status: "authenticated",
      user: buildUser({ role: "STUDENT" }),
      login: vi.fn(),
      logout: vi.fn(),
    });

    expect(screen.getByText("Mis programas asignados")).toBeInTheDocument();
  });

  it("tras iniciar sesión, redirige según el rol devuelto (no siempre a /students)", async () => {
    const user = userEvent.setup();
    const loggedInUser = buildUser({ role: "STUDENT" });
    const login = vi.fn().mockResolvedValue(loggedInUser);

    renderLogin({ status: "anonymous", user: null, login, logout: vi.fn() });

    await user.type(screen.getByLabelText("Correo"), "alumno@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(login).toHaveBeenCalledWith({
      email: "alumno@example.com",
      password: "clave-segura",
    });
    await waitFor(() =>
      expect(screen.getByText("Mis programas asignados")).toBeInTheDocument(),
    );
  });

  it("muestra el mensaje de error del backend y conserva los valores ingresados", async () => {
    const user = userEvent.setup();
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError(401, "Credenciales inválidas."));

    renderLogin({ status: "anonymous", user: null, login, logout: vi.fn() });

    const emailInput = screen.getByLabelText("Correo");
    await user.type(emailInput, "alumno@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "clave-incorrecta");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Credenciales inválidas.",
    );
    expect(emailInput).toHaveValue("alumno@example.com");
  });
});
