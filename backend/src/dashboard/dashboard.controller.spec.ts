import 'reflect-metadata';
import { Role } from '@prisma/client';
import { DashboardController } from './dashboard.controller';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardStudentService } from './dashboard-student.service';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';

function buildCoachUser(): AuthenticatedUser {
  return {
    id: 'coach-1',
    email: 'coach@example.com',
    role: Role.COACH,
    name: 'Coach Uno',
    coachId: null,
  };
}

describe('DashboardController - autorización declarada', () => {
  it('exige el rol COACH', () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, DashboardController),
    ).toEqual([Role.COACH]);
  });
});

describe('DashboardController - delegación con el id del coach del token', () => {
  let summaryService: jest.Mocked<DashboardSummaryService>;
  let studentService: jest.Mocked<DashboardStudentService>;
  let controller: DashboardController;

  beforeEach(() => {
    summaryService = {
      getSummary: jest.fn(),
      listRecentActivity: jest.fn(),
    } as unknown as jest.Mocked<DashboardSummaryService>;
    studentService = {
      getStudentDashboard: jest.fn(),
    } as unknown as jest.Mocked<DashboardStudentService>;
    controller = new DashboardController(summaryService, studentService);
  });

  it('summary() pasa el id del coach del token, NUNCA de la query/body', async () => {
    summaryService.getSummary.mockResolvedValue({} as never);

    await controller.summary(buildCoachUser());

    expect(summaryService.getSummary).toHaveBeenCalledWith('coach-1');
  });

  it('recentActivity() pasa el id del coach del token y la query, y expone la paginación en meta', async () => {
    summaryService.listRecentActivity.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
    const query = { page: 1, limit: 20 };

    const response = await controller.recentActivity(
      buildCoachUser(),
      query as never,
    );

    expect(summaryService.listRecentActivity).toHaveBeenCalledWith(
      'coach-1',
      query,
    );
    expect(response.meta).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    });
  });

  it('studentDashboard() pasa el id del coach del token, el :studentId de ruta y la query -- nunca confía un coachId del cliente', async () => {
    studentService.getStudentDashboard.mockResolvedValue({} as never);
    const query = { exerciseId: 'exercise-1' };

    await controller.studentDashboard(
      buildCoachUser(),
      { studentId: 'student-1' },
      query as never,
    );

    expect(studentService.getStudentDashboard).toHaveBeenCalledWith(
      'coach-1',
      'student-1',
      query,
    );
  });
});
