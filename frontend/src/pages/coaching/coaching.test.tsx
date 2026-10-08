import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AuthContext } from '../../auth/authContextObject';
import { apiClient } from '../../lib/apiClient';
import { CompetitionsPage } from './CompetitionsPage';
import { ProfilePage } from './ProfilePage';
import { MediaPreview, MessagesPage } from './MessagesPage';
import { Calendar } from '../../components/coaching/Planning';
import { NotificationBell } from '../../components/coaching/Notifications';
import { StudentHomePage } from '../student-training/StudentHomePage';
import { CoachOperations } from '../../components/coaching/CoachOperations';
import { getHomePathForRole } from '../../auth/roleHome';

const competition = { id: 'c1', name: 'Open Santiago', studentId: 's1', eventDate: '2026-10-20T00:00:00.000Z', category: 'Open', status: 'UPCOMING', goal: 'Técnica', coachGoal: null, notes: null, location: null };
const session = { id: 'a1:ss1', sessionId: 'ss1', assignmentId: 'a1', name: 'Fuerza de hoy', date: '2026-10-07', programName: 'Fuerza', blockId: 'b1', blockName: 'Base', weekNumber: 2, blockIndex: 0, completed: false };
const calendar = { today: '2026-10-07', nextSession: session, pendingSession: null, nextCompetition: competition, sessions: [session], assignments: [], competitions: [competition] };
function renderUser(children: ReactNode) {
  return renderWithProviders(<AuthContext.Provider value={{ status: 'authenticated', user: { id: 's1', name: 'Atleta', email: 's@example.com', role: 'STUDENT', coachId: 'coach1', isActive: true, createdAt: '' }, login: vi.fn(), logout: vi.fn() }}>{children}</AuthContext.Provider>);
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
    let data: unknown = [];
    if (path.startsWith('/calendar/')) data = calendar;
    else if (path === '/profile/me') data = { id: 's1', name: 'Atleta', role: 'STUDENT', email: 's@example.com', profile: null, coach: { id: 'coach1', name: 'Mi entrenador', email: 'c@example.com' } };
    else if (path.startsWith('/competitions/me')) data = [competition];
    else if (path === '/notifications/unread-count') data = { count: 1 };
    else if (path.startsWith('/notifications?')) data = [{ id: 'n1', title: 'Tu programa está listo', resourceType: 'program', resourceId: 'p1', createdAt: '2026-10-07T12:00:00Z', readAt: null }];
    else if (path.startsWith('/student/sessions/')) data = { id: 'ss1', exercises: [{ id: 'se1', exercise: { name: 'Sentadilla' }, targetSets: 3 }] };
    else if (path.startsWith('/workout-logs/evolution')) data = { summary: { totalWorkouts: 0, totalSetLogs: 0, averageOverallRpe: null } };
    else if (path === '/dashboard/operations') data = { competitions: [{ ...competition, student: { id: 's1', name: 'Atleta' } }], attention: [{ id: 's1', name: 'Atleta', reasons: ['Sin programa activo'] }], workoutsThisWeek: 3 };
    return { data, error: null, meta: { page: 1, total: 0, totalPages: 1 } };
  });
  vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {}, error: null, meta: {} });
});
describe('Evolución coaching', () => {
  it('dirige el alumno a Inicio y muestra sesión de hoy, competición y coach reales', async () => {
    expect(getHomePathForRole('STUDENT')).toBe('/home');
    renderUser(<StudentHomePage />);
    expect(await screen.findByText('Entrenamiento de hoy')).toBeInTheDocument();
    expect(await screen.findByText('Sentadilla')).toBeInTheDocument();
    expect(screen.getByText('Open Santiago')).toBeInTheDocument();
    expect(screen.getByText('Mi entrenador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar entrenamiento' })).toBeEnabled();
  });
  it('muestra sesiones futuras como consulta sin iniciar desde Home', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...calendar, nextSession: { ...session, date: '2026-10-08' } }, error: null, meta: {} });
    // Exercise the calendar-driven panel through the real Home queries with narrow responses.
    vi.mocked(apiClient.get).mockImplementation(async (path) => ({ data: path.startsWith('/calendar/') ? { ...calendar, nextSession: { ...session, date: '2026-10-08' } } : path.startsWith('/workout-logs/evolution') ? { summary: { totalWorkouts: 0, totalSetLogs: 0 } } : [], error: null, meta: { total: 0 } }));
    renderUser(<StudentHomePage training />);
    expect(await screen.findByText('Próximo entrenamiento')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver entrenamiento' })).toHaveAttribute('href', '/student/sessions/ss1');
    expect(screen.queryByRole('button', { name: 'Iniciar entrenamiento' })).not.toBeInTheDocument();
  });
  it('crea competición usando datos del formulario y sin studentId arbitrario', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: competition, error: null, meta: {} });
    renderUser(<CompetitionsPage />); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Agregar competición' }));
    await user.type(screen.getByLabelText('Nombre'), 'Torneo local');
    await user.type(screen.getByLabelText('Fecha'), '2026-11-20');
    await user.type(screen.getByLabelText('Categoría'), 'Open');
    await user.click(screen.getByRole('button', { name: 'Guardar competición' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/competitions', expect.objectContaining({ name: 'Torneo local', eventDate: '2026-11-20', category: 'Open' })));
    expect(post.mock.calls[0][1]).not.toHaveProperty('studentId');
  });
  it('calendario renderiza programación y competición y permite cambiar mes', async () => {
    renderUser(<Calendar />);
    expect(await screen.findByRole('link', { name: /Fuerza de hoy/ })).toHaveAttribute('href', '/student/sessions/ss1');
    expect(screen.getByText('Open Santiago')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(expect.stringMatching(/\/calendar\/me\?month=/)));
  });
  it('guarda perfil y muestra coach asociado', async () => {
    renderUser(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText('Ciudad'), 'Santiago');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/profile/me', expect.objectContaining({ city: 'Santiago' })));
    expect(screen.getByText('Mi entrenador')).toBeInTheDocument();
  });
  it('la campana muestra no leídas y marca todas sin aceptar userId', async () => {
    renderUser(<NotificationBell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Notificaciones: 1 sin leer' }));
    expect(await screen.findByText('Tu programa está listo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/notifications/read-all', undefined));
  });
  it('chat envía texto por multipart y preview de video no tiene autoplay', async () => {
    const post = vi.spyOn(apiClient, 'postFile').mockResolvedValue({ data: {}, error: null, meta: {} });
    renderUser(<MessagesPage />);
    await userEvent.type(await screen.findByLabelText('Mensaje'), 'Mi sesión está lista');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/messages/coach1', expect.any(FormData)));
    const { container } = renderWithProviders(<MediaPreview url="blob:preview" video name="Técnica" />);
    expect(container.querySelector('video')).toHaveAttribute('controls');
    expect(container.querySelector('video')).not.toHaveAttribute('autoplay');
  });
  it('dashboard muestra competiciones propias y atención determinista', async () => {
    renderUser(<CoachOperations />);
    expect(await screen.findByText('Sin programa activo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Atleta · Open Santiago' })).toHaveAttribute('href', '/students/s1?tab=calendar');
  });
});
