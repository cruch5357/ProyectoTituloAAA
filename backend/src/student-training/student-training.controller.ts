import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StudentTrainingService } from './student-training.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { ProgramIdParamDto } from '../programs/dto/program-id-param.dto';
import { BlockIdParamDto } from '../blocks/dto/block-id-param.dto';
import { WeekIdParamDto } from '../weeks/dto/week-id-param.dto';
import { SessionIdParamDto } from '../sessions/dto/session-id-param.dto';

// Rutas de solo lectura bajo el prefijo /student/... (PROMPT 10),
// deliberadamente separadas de /programs, /blocks, /weeks, /sessions
// (COACH-only): reutilizar esas rutas para el Alumno habría exigido mezclar
// dos criterios de autorización distintos (coachId vs. ProgramAssignment)
// en los mismos controllers/servicios, arriesgando debilitar el aislamiento
// ya establecido desde PROMPT 08. Ninguno de estos endpoints permite
// crear/editar/eliminar nada: son un espejo de solo lectura de la jerarquía
// de prescripción ya existente, filtrado por lo que el alumno tiene
// asignado.
@ApiTags('student-training')
@Controller('student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@ApiBearerAuth()
export class StudentTrainingController {
  constructor(
    private readonly studentTrainingService: StudentTrainingService,
  ) {}

  @Get('programs/:id')
  @ApiOperation({
    summary: 'Detalle de un programa asignado al alumno autenticado',
  })
  async getProgram(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdParamDto,
  ) {
    const program = await this.studentTrainingService.getProgram(
      currentUser.id,
      params.id,
    );
    return { data: program, error: null, meta: {} };
  }

  @Get('programs/:id/blocks')
  @ApiOperation({
    summary: 'Lista los bloques de un programa asignado al alumno autenticado',
  })
  async listBlocks(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdParamDto,
  ) {
    const blocks = await this.studentTrainingService.listBlocks(
      currentUser.id,
      params.id,
    );
    return { data: blocks, error: null, meta: {} };
  }

  @Get('blocks/:id')
  @ApiOperation({
    summary: 'Detalle de un bloque asignado al alumno autenticado',
  })
  async getBlock(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: BlockIdParamDto,
  ) {
    const block = await this.studentTrainingService.getBlock(
      currentUser.id,
      params.id,
    );
    return { data: block, error: null, meta: {} };
  }

  @Get('blocks/:id/weeks')
  @ApiOperation({
    summary: 'Lista las semanas de un bloque asignado al alumno autenticado',
  })
  async listWeeks(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: BlockIdParamDto,
  ) {
    const weeks = await this.studentTrainingService.listWeeks(
      currentUser.id,
      params.id,
    );
    return { data: weeks, error: null, meta: {} };
  }

  @Get('weeks/:id')
  @ApiOperation({
    summary: 'Detalle de una semana asignada al alumno autenticado',
  })
  async getWeek(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WeekIdParamDto,
  ) {
    const week = await this.studentTrainingService.getWeek(
      currentUser.id,
      params.id,
    );
    return { data: week, error: null, meta: {} };
  }

  @Get('weeks/:id/sessions')
  @ApiOperation({
    summary: 'Lista las sesiones de una semana asignada al alumno autenticado',
  })
  async listSessions(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WeekIdParamDto,
  ) {
    const sessions = await this.studentTrainingService.listSessions(
      currentUser.id,
      params.id,
    );
    return { data: sessions, error: null, meta: {} };
  }

  @Get('sessions/:id')
  @ApiOperation({
    summary:
      'Detalle de una sesión asignada, con su prescripción de ejercicios',
  })
  async getSession(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdParamDto,
  ) {
    const session = await this.studentTrainingService.getSessionDetail(
      currentUser.id,
      params.id,
    );
    return { data: session, error: null, meta: {} };
  }
}
