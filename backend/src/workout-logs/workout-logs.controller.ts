import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { WorkoutLogsService } from './workout-logs.service';
import { WorkoutLogIdParamDto } from './dto/workout-log-id-param.dto';
import { CreateSetLogsDto } from './dto/create-set-logs.dto';
import { FinishWorkoutLogDto } from './dto/finish-workout-log.dto';
import { ListWorkoutLogsQueryDto } from './dto/list-workout-logs-query.dto';
import { GetWorkoutEvolutionQueryDto } from './dto/get-workout-evolution-query.dto';
import { SessionIdRouteParamDto } from '../session-exercises/dto/session-id-route-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Rutas anidadas bajo /sessions/:sessionId (iniciar/listar WorkoutLog de una
// sesión asignada) — mismo patrón de dos controllers ya usado en
// session-exercises/program-assignments (PROMPT 08/09). Reutiliza
// SessionIdRouteParamDto de session-exercises/ (validador de formato puro,
// sin lógica de autorización: idéntico criterio de reutilización que
// StudentTrainingController con los *IdParamDto del Coach).
@ApiTags('workout-logs')
@Controller('sessions/:sessionId/workout-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@ApiBearerAuth()
export class WorkoutLogsNestedController {
  constructor(private readonly workoutLogsService: WorkoutLogsService) {}

  @Post()
  @ApiOperation({
    summary: 'Inicia el registro de ejecución de una sesión asignada',
  })
  async start(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdRouteParamDto,
  ) {
    const workoutLog = await this.workoutLogsService.start(
      currentUser.id,
      params.sessionId,
    );
    return { data: workoutLog, error: null, meta: {} };
  }

  @Get()
  @ApiOperation({
    summary: 'Lista los propios registros de ejecución de una sesión asignada',
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdRouteParamDto,
  ) {
    const logs = await this.workoutLogsService.listForSession(
      currentUser.id,
      params.sessionId,
    );
    return { data: logs, error: null, meta: {} };
  }
}

// Recurso propio /workout-logs (historial, evolución, detalle, registrar
// series, finalizar).
//
// IMPORTANTE — orden de declaración de rutas: `history()` (bare `@Get()`) y
// `evolution()` (`@Get('evolution')`) están declaradas ANTES de `detail()`
// (`@Get(':id')`) a propósito. Nest/Express resuelve las rutas en el orden
// en que se registran: si `:id` se declarara primero, una petición a
// GET /workout-logs/evolution matchearía ese patrón con `id = "evolution"`
// en vez de llegar al handler correcto. `history()` (sin segmento extra) no
// tiene este problema con ningún orden, pero se mantiene junto a
// `evolution()` por claridad de lectura.
@ApiTags('workout-logs')
@Controller('workout-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@ApiBearerAuth()
export class WorkoutLogsController {
  constructor(private readonly workoutLogsService: WorkoutLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Historial paginado de entrenamientos propios (RF-25)',
  })
  async history(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListWorkoutLogsQueryDto,
  ) {
    const history = await this.workoutLogsService.listHistory(
      currentUser.id,
      query,
    );
    return {
      data: history.items,
      error: null,
      meta: {
        page: history.page,
        limit: history.limit,
        total: history.total,
        totalPages: history.totalPages,
      },
    };
  }

  @Get('evolution')
  @ApiOperation({
    summary: 'Evolución básica descriptiva del alumno autenticado (RF-25)',
  })
  async evolution(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: GetWorkoutEvolutionQueryDto,
  ) {
    const evolution = await this.workoutLogsService.getEvolution(
      currentUser.id,
      query,
    );
    return { data: evolution, error: null, meta: {} };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un registro de ejecución propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WorkoutLogIdParamDto,
  ) {
    const workoutLog = await this.workoutLogsService.getOwnedByStudent(
      currentUser.id,
      params.id,
    );
    return { data: workoutLog, error: null, meta: {} };
  }

  @Post(':id/set-logs')
  @ApiOperation({
    summary: 'Registra una o más series reales en un entrenamiento propio',
  })
  async addSetLogs(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WorkoutLogIdParamDto,
    @Body() dto: CreateSetLogsDto,
  ) {
    const setLogs = await this.workoutLogsService.addSetLogs(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: setLogs, error: null, meta: {} };
  }

  @Patch(':id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finaliza un entrenamiento propio con su resumen de sesión',
  })
  async finish(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WorkoutLogIdParamDto,
    @Body() dto: FinishWorkoutLogDto,
  ) {
    const workoutLog = await this.workoutLogsService.finish(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: workoutLog, error: null, meta: {} };
  }
}
