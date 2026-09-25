import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardStudentService } from './dashboard-student.service';
import { ListRecentActivityQueryDto } from './dto/list-recent-activity-query.dto';
import { StudentIdRouteParamDto } from './dto/student-id-route-param.dto';
import { GetWorkoutEvolutionQueryDto } from '../workout-logs/dto/get-workout-evolution-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Dashboard del Coach (PROMPT 12, RF-26). Rutas exclusivas de COACH (mismo
// patrón de guards que StudentsController/ProgramsController desde PROMPT
// 04/08): JwtAuthGuard resuelve la sesión, RolesGuard exige el rol, y el
// `coachId` real SIEMPRE sale de CurrentUser() -- ningún endpoint de este
// controller acepta un coachId de query/body/param.
//
// Las tres rutas (`summary`, `recent-activity`, `students/:studentId`) son
// literales distintos en el mismo nivel: a diferencia de
// WorkoutLogsController (PROMPT 11), acá no hay conflicto de orden posible
// entre una ruta con `:param` y una ruta literal, porque `:studentId` va
// DESPUÉS de un segmento literal propio (`students/`), nunca en la raíz del
// controller.
@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly summaryService: DashboardSummaryService,
    private readonly studentService: DashboardStudentService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Resumen agregado del coach autenticado: alumnos, asignaciones activas y métricas de entrenamiento de todos sus alumnos',
  })
  async summary(@CurrentUser() currentUser: AuthenticatedUser) {
    const data = await this.summaryService.getSummary(currentUser.id);
    return { data, error: null, meta: {} };
  }

  @Get('recent-activity')
  @ApiOperation({
    summary:
      'Actividad reciente (WorkoutLog) de todos los alumnos del coach autenticado, paginada y filtrable por fecha/estado',
  })
  async recentActivity(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListRecentActivityQueryDto,
  ) {
    const result = await this.summaryService.listRecentActivity(
      currentUser.id,
      query,
    );
    return {
      data: result.items,
      error: null,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('students/:studentId')
  @ApiOperation({
    summary:
      'Métricas de entrenamiento de UN alumno propio (verificado por propiedad, nunca confiado del cliente)',
  })
  async studentDashboard(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: StudentIdRouteParamDto,
    @Query() query: GetWorkoutEvolutionQueryDto,
  ) {
    const data = await this.studentService.getStudentDashboard(
      currentUser.id,
      params.studentId,
      query,
    );
    return { data, error: null, meta: {} };
  }
}
