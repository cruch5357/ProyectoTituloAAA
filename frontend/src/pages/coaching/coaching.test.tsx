import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
const session = { id: 'a1:ss1', sessionId: 'ss1', assignmentId: 'a1', name: 'Fuerza de hoy', date: '2026-10-07', programName: 'Fuerza', blockId: 'b1', blockName: 'Base', weekNumber: 2, blockIndex: 0, completed: false, muscleGroups: [], status: 'NOT_STARTED', dayNumber: 1, totalSets: 4, recordedSets: 0, exerciseCount: 1 };
const calendar = { today: '2026-10-07', nextSession: session, pendingSession: null, nextCompetition: competition, sessions: [session], assignments: [], competitions: [competition] };
function renderUser(children: ReactNode) {
  return renderWithProviders(<AuthContext.Provider value={{ status: 'authenticated', user: { id: 's1', name: 'Atleta', email: 's@example.com', role: 'STUDENT', coachId: 'coach1', isActive: true, createdAt: '' }, login: vi.fn(), logout: vi.fn() }}>{children}</AuthContext.Provider>);
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(apiClient, 'get').mockImplementation(async (path) => {
    let data: unknown = [];
    if (path.startsWith('/calendar/') || path === '/training/me') data = calendar;
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
  it('Entrenamiento muestra la sesión de hoy y qué se va a trabajar', async () => {
    expect(getHomePathForRole('STUDENT')).toBe('/home');
    renderUser(<StudentHomePage training />);
    expect(await screen.findByText('Tu sesión de hoy')).toBeInTheDocument();
    expect(screen.queryByText('Entrenamiento de hoy')).not.toBeInTheDocument();
    expect(screen.getByText('Qué vas a trabajar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar entrenamiento' })).not.toBeInTheDocument();
  });
  it('muestra sesiones futuras como consulta sin iniciar desde Home', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...calendar, nextSession: { ...session, date: '2026-10-08' } }, error: null, meta: {} });
    // Exercise the calendar-driven panel through the real Home queries with narrow responses.
    vi.mocked(apiClient.get).mockImplementation(async (path) => ({ data: path === '/training/me' ? { ...calendar, nextSession: { ...session, date: '2026-10-08' } } : path.startsWith('/workout-logs/evolution') ? { summary: { totalWorkouts: 0, totalSetLogs: 0 } } : [], error: null, meta: { total: 0 } }));
    renderUser(<StudentHomePage training />);
    expect(await screen.findByText('Próxima sesión')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver entrenamiento/ })).toHaveAttribute('href', '/training/sessions/ss1?assignmentId=a1');
    expect(screen.queryByRole('button', { name: 'Iniciar entrenamiento' })).not.toBeInTheDocument();
  });
  it('crea competición usando datos del formulario y sin studentId arbitrario', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: competition, error: null, meta: {} });
    renderUser(<CompetitionsPage />); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Agregar hito' }));
    await user.type(screen.getByLabelText('Nombre'), 'Torneo local');
    await user.type(screen.getByLabelText('Fecha'), '2026-11-20');
    await user.type(screen.getByLabelText('Categoría'), 'Open');
    await user.click(screen.getByRole('button', { name: 'Guardar hito' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/competitions', expect.objectContaining({ name: 'Torneo local', eventDate: '2026-11-20', category: 'Open' })));
    expect(post.mock.calls[0][1]).not.toHaveProperty('studentId');
  });
  it('calendario mensual compacto: marca días, muestra el detalle del día elegido y cambia de mes', async () => {
    // Fecha fija: el calendario abre en el mes actual y los datos son de octubre.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
    try {
      renderUser(<Calendar />);
      // Hoy (7 de octubre) viene elegido: su sesión aparece en el detalle del día.
      expect(await screen.findByRole('link', { name: /Fuerza de hoy/ })).toHaveAttribute('href', '/training/sessions/ss1?assignmentId=a1');
      expect(screen.getByRole('button', { name: /1 entrenamiento/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText(/^(LUN|MAR|MIÉ|JUE|VIE|SÁB|DOM)$/)).toHaveLength(7);
      // El hito del 20 no aparece hasta elegir ese día.
      expect(screen.queryByText('Open Santiago')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: /1 hito/ }));
      expect(screen.getByText('Open Santiago')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Fuerza de hoy/ })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
      await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(expect.stringMatching(/\/calendar\/me\?month=2026-11/)));
    } finally {
      vi.useRealTimers();
    }
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
  it('un alumno siempre conversa con su coach aunque la URL traiga otro ?peer=', async () => {
    renderWithProviders(
      <AuthContext.Provider value={{ status: 'authenticated', user: { id: 's1', name: 'Atleta', email: 's@example.com', role: 'STUDENT', coachId: 'coach1', isActive: true, createdAt: '' }, login: vi.fn(), logout: vi.fn() }}>
        <MessagesPage />
      </AuthContext.Provider>,
      { route: '/messages?peer=s1' },
    );
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('/messages/coach1?page=1')));
    expect(vi.mocked(apiClient.get).mock.calls.some(([path]) => String(path).startsWith('/messages/s1'))).toBe(false);
  });
  it('Novedades muestra solo las 4 más recientes', async () => {
    const notices = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, title: `Novedad ${i + 1}`, resourceType: 'program', resourceId: 'p1', createdAt: `2026-10-0${i + 1}T12:00:00Z`, readAt: null }));
    const defaultGet = vi.mocked(apiClient.get).getMockImplementation()!;
    vi.mocked(apiClient.get).mockImplementation(async (path, options) =>
      path.startsWith('/notifications?') ? { data: notices, error: null, meta: {} } : defaultGet(path, options));
    renderUser(<CoachOperations />);
    expect(await screen.findByText('Novedad 6')).toBeInTheDocument();
    for (const n of [6, 5, 4, 3]) expect(screen.getByText(`Novedad ${n}`)).toBeInTheDocument();
    expect(screen.queryByText('Novedad 2')).toBeNull();
    expect(screen.queryByText('Novedad 1')).toBeNull();
    expect(screen.getByText(/Ves las 4 más recientes/)).toBeInTheDocument();
  });
  it('el chat baja al último mensaje al enviar', async () => {
    const older = { id: 'm1', senderId: 'coach1', body: 'Hola', createdAt: '2026-10-07T10:00:00Z', readAt: null, attachments: [] };
    const sent = { id: 'm2', senderId: 's1', body: 'Listo', createdAt: '2026-10-07T10:05:00Z', readAt: null, attachments: [] };
    let messages = [older];
    const defaultGet = vi.mocked(apiClient.get).getMockImplementation()!;
    vi.mocked(apiClient.get).mockImplementation(async (path, options) =>
      path.startsWith('/messages/coach1') ? { data: messages, error: null, meta: {} } : defaultGet(path, options));
    vi.spyOn(apiClient, 'postFile').mockImplementation(async () => { messages = [sent, older]; return { data: sent, error: null, meta: {} }; });

    renderUser(<MessagesPage />);
    expect(await screen.findByText('Hola')).toBeInTheDocument();
    const thread = screen.getByLabelText('Mensajes de la conversación');
    // jsdom no calcula layout: se simula un hilo con contenido desplazable.
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(thread, 'clientHeight', { configurable: true, value: 300 });
    thread.scrollTop = 0;

    await userEvent.type(screen.getByLabelText('Mensaje'), 'Listo');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(await screen.findByText('Listo', { selector: 'p' })).toBeInTheDocument();
    await waitFor(() => expect(thread.scrollTop).toBe(900));
  });
  it('las imágenes y videos del chat se amplían en un visor al tocarlos', async () => {
    const message = { id: 'm1', senderId: 'coach1', body: 'Mira la técnica', createdAt: '2026-10-07T10:00:00Z', readAt: null, attachments: [
      { id: 'a1', type: 'IMAGE', originalFilename: 'foto.jpg' },
      { id: 'a2', type: 'VIDEO', originalFilename: 'tecnica.mp4' },
    ] };
    const defaultGet = vi.mocked(apiClient.get).getMockImplementation()!;
    vi.mocked(apiClient.get).mockImplementation(async (path, options) =>
      path.startsWith('/messages/coach1') ? { data: [message], error: null, meta: {} } : defaultGet(path, options));
    vi.spyOn(apiClient, 'blob').mockResolvedValue(new Blob(['x']));
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`), revokeObjectURL: vi.fn() });

    renderUser(<MessagesPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Ampliar foto.jpg' }));
    const imageViewer = screen.getByRole('dialog', { name: 'foto.jpg' });
    expect(imageViewer).toHaveAttribute('open');
    expect(within(imageViewer).getByRole('img', { name: 'foto.jpg' })).toBeInTheDocument();
    await userEvent.click(within(imageViewer).getByRole('button', { name: 'Cerrar' }));
    expect(imageViewer).not.toHaveAttribute('open');

    await userEvent.click(screen.getByRole('button', { name: 'Ampliar tecnica.mp4' }));
    const videoViewer = screen.getByRole('dialog', { name: 'tecnica.mp4' });
    const video = videoViewer.querySelector('video');
    expect(video).toHaveAttribute('controls');
    // jsdom no dispara `close` al llamar close(): se simula para comprobar
    // que el video se desmonta (y por lo tanto se detiene) al cerrar.
    await userEvent.click(within(videoViewer).getByRole('button', { name: 'Cerrar' }));
    fireEvent(videoViewer, new Event('close'));
    await waitFor(() => expect(videoViewer.querySelector('video')).toBeNull());
    vi.unstubAllGlobals();
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
