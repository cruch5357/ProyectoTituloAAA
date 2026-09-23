import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProgramAssignmentsService } from './program-assignments.service';
import { AssignProgramDto } from './dto/assign-program.dto';
import { ProgramIdRouteParamDto } from './dto/program-id-route-param.dto';
import { ProgramAssignmentIdParamDto } from './dto/program-assignment-id-param.dto';
import { UpdateProgramAssignmentStatusDto } from './dto/update-program-assignment-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Rutas anidadas bajo /programs/:programId (crear/listar asignaciones de un
// programa propio) — mismo patrón de dos controllers ya usado en
// blocks/weeks/sessions/session-exercises (PROMPT 08): la creación y el
// listado necesitan el id del programa padre en la ruta, así que viven
// anidados; el detalle/edición de una asignación puntual ya se identifica
// por su propio id (ver ProgramAssignmentsController más abajo).
@ApiTags('program-assignments')
@Controller('programs/:programId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class ProgramAssignmentsNestedController {
  constructor(
    private readonly programAssignmentsService: ProgramAssignmentsService,
  ) {}

  @Post('assign')
  @ApiOperation({ summary: 'Asigna un programa propio a un alumno propio' })
  async assign(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdRouteParamDto,
    @Body() dto: AssignProgramDto,
  ) {
    const assignment = await this.programAssignmentsService.assign(
      currentUser.id,
      params.programId,
      dto,
    );
    return { data: assignment, error: null, meta: {} };
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Lista las asignaciones de un programa propio' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdRouteParamDto,
  ) {
    const assignments = await this.programAssignmentsService.listForProgram(
      currentUser.id,
      params.programId,
    );
    return { data: assignments, error: null, meta: {} };
  }
}

// Recurso propio /program-assignments/:id (detalle/estado, vista Coach) +
// /program-assignments/me (listado propio, vista Alumno). Este controller
// NO aplica `@Roles(...)` a nivel de clase (a diferencia del resto del
// proyecto) porque combina endpoints de dos roles distintos que nunca deben
// compartir el mismo rol requerido: cada método declara su propio `@Roles`
// (RolesGuard usa `getAllAndOverride`, que prioriza el metadato del método
// por sobre el de la clase — ver roles.guard.ts).
//
// IMPORTANTE: `listOwn()` (`GET /program-assignments/me`) está declarado
// ANTES que `detail()` (`GET /program-assignments/:id`) en esta clase.
// NestJS registra las rutas de un mismo controller en el orden en que se
// declaran los métodos, y Express hace matching en orden de registro: si
// `:id` se registrara primero, una request a `/program-assignments/me`
// coincidiría con `:id = "me"` antes de llegar nunca al método `listOwn()`
// (mismo problema clásico que `/users/me` vs `/users/:id`).
@ApiTags('program-assignments')
@Controller('program-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProgramAssignmentsController {
  constructor(
    private readonly programAssignmentsService: ProgramAssignmentsService,
  ) {}

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: 'Lista las asignaciones propias del alumno autenticado',
  })
  async listOwn(@CurrentUser() currentUser: AuthenticatedUser) {
    const assignments = await this.programAssignmentsService.listForStudent(
      currentUser.id,
    );
    return { data: assignments, error: null, meta: {} };
  }

  @Get(':id')
  @Roles(Role.COACH)
  @ApiOperation({ summary: 'Detalle de una asignación de un programa propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramAssignmentIdParamDto,
  ) {
    const assignment = await this.programAssignmentsService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: assignment, error: null, meta: {} };
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.COACH)
  @ApiOperation({
    summary: 'Activa/finaliza una asignación de un programa propio',
  })
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramAssignmentIdParamDto,
    @Body() dto: UpdateProgramAssignmentStatusDto,
  ) {
    const assignment = await this.programAssignmentsService.updateStatus(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: assignment, error: null, meta: {} };
  }
}
