import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { ProgramDetailPage } from './ProgramDetailPage';

function buildProgram() {
  return {
    id: 'program-1',
    coachId: 'coach-1',
    name: 'Fuerza - Bloque base',
    description: null,
    durationWeeks: 8,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildBlock() {
  return {
    id: 'block-1',
    programId: 'program-1',
    name: 'Bloque 1 - Acumulación',
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildStudent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'student-1',
    email: 'alumno@example.com',
    role: 'STUDENT',
    name: 'Alumno Uno',
    isActive: true,
    coachId: 'coach-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    programId: 'program-1',
    studentId: 'student-1',
    status: 'ACTIVE',
    assignedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    student: {
      id: 'student-1',
      name: 'Alumno Uno',
      email: 'alumno@example.com',
      isActive: true,
    },
    ...overrides,
  };
}

// Mock genérico de GET por fragmento de ruta, compartido por todas las
// pruebas de esta página desde que PROMPT 09 agregó la sección de
// asignaciones (que también consulta /students y /programs/:id/assignments
// además de /programs/:id y /programs/:id/blocks, ya cubiertos desde
// PROMPT 08).
function mockGetByPath(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
    if (path.includes('/blocks')) {
      return {
        data: overrides.blocks ?? [buildBlock()],
        error: null,
        meta: {},
      };
    }
    if (path.includes('/assignments')) {
      return { data: overrides.assignments ?? [], error: null, meta: {} };
    }
    if (path.includes('/students')) {
      return { data: overrides.students ?? [], error: null, meta: {} };
    }
    return { data: overrides.program ?? buildProgram(), error: null, meta: {} };
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// PROMPT 08 — "navegación Program -> Block".
describe('ProgramDetailPage', () => {
  it('carga el programa, permite editarlo y muestra sus bloques con link de navegación', async () => {
    const user = userEvent.setup();
    mockGetByPath();
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { ...buildProgram(), name: 'Fuerza 2.0' },
      error: null,
      meta: {},
    });

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    const nameInput = await screen.findByLabelText('Nombre');
    expect(nameInput).toHaveValue('Fuerza - Bloque base');

    // El bloque existente se lista y enlaza a su propia página de detalle
    // (siguiente nivel de la jerarquía Program -> Block -> Week -> Session).
    const blockLink = await screen.findByRole('link', {
      name: /Bloque 1 - Acumulación/,
    });
    expect(blockLink).toHaveAttribute('href', '/blocks/block-1');

    await user.clear(nameInput);
    await user.type(nameInput, 'Fuerza 2.0');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        '/programs/program-1',
        expect.objectContaining({ name: 'Fuerza 2.0' }),
      );
    });
  });

  it('permite crear un nuevo bloque desde el detalle del programa', async () => {
    const user = userEvent.setup();
    mockGetByPath({ blocks: [] });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildBlock(),
      error: null,
      meta: {},
    });

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    await screen.findByText('Este programa todavía no tiene bloques.');

    await user.type(
      screen.getByLabelText('Nombre del nuevo bloque'),
      'Bloque 1',
    );
    await user.click(screen.getByRole('button', { name: 'Agregar bloque' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/programs/program-1/blocks',
        expect.objectContaining({ name: 'Bloque 1' }),
      );
    });
  });

  // PROMPT 08 — "manejo de errores".
  it('muestra un mensaje de error si el programa no existe o no pertenece al coach', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new ApiError(404, 'Programa no encontrado'),
    );

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/no-existe',
    });

    expect(await screen.findByText('Programa no encontrado')).toBeInTheDocument();
  });

  // PROMPT 09 — "asignar programa" / "selección de alumno".
  it('permite asignar el programa a un alumno propio activo', async () => {
    const user = userEvent.setup();
    mockGetByPath({ assignments: [], students: [buildStudent()] });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: buildAssignment(),
      error: null,
      meta: {},
    });

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    await screen.findByText('Este programa todavía no está asignado a ningún alumno.');
    await screen.findByRole('option', { name: /Alumno Uno/ });

    await user.selectOptions(
      screen.getByLabelText('Asignar a alumno'),
      'student-1',
    );
    await user.click(screen.getByRole('button', { name: 'Asignar programa' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/programs/program-1/assign', {
        studentId: 'student-1',
      });
    });
  });

  // PROMPT 09 — "visualización de asignaciones" y "gestión de estado".
  it('lista las asignaciones existentes y permite finalizar una asignación activa', async () => {
    const user = userEvent.setup();
    mockGetByPath({ assignments: [buildAssignment()], students: [buildStudent()] });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: buildAssignment({ status: 'FINISHED' }),
      error: null,
      meta: {},
    });

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    expect(await screen.findByText('Alumno Uno')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finalizar' }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/program-assignments/assignment-1/status', {
        status: 'FINISHED',
      });
    });
  });

  // PROMPT 09 — "manejo de errores" en la asignación.
  it('muestra un mensaje de error si la asignación falla (ej. alumno inactivo)', async () => {
    const user = userEvent.setup();
    mockGetByPath({ assignments: [], students: [buildStudent()] });
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(422, 'El alumno no está activo para recibir una programación'),
    );

    renderWithRoute(<ProgramDetailPage />, {
      path: '/programs/:id',
      route: '/programs/program-1',
    });

    await screen.findByRole('option', { name: /Alumno Uno/ });
    await user.selectOptions(
      screen.getByLabelText('Asignar a alumno'),
      'student-1',
    );
    await user.click(screen.getByRole('button', { name: 'Asignar programa' }));

    expect(
      await screen.findByText('El alumno no está activo para recibir una programación'),
    ).toBeInTheDocument();
  });
});
