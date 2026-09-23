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
import { SessionExercisesService } from './session-exercises.service';
import { CreateSessionExerciseDto } from './dto/create-session-exercise.dto';
import { UpdateSessionExerciseDto } from './dto/update-session-exercise.dto';
import { SessionExerciseIdParamDto } from './dto/session-exercise-id-param.dto';
import { SessionIdRouteParamDto } from './dto/session-id-route-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

@ApiTags('session-exercises')
@Controller('sessions/:sessionId/exercises')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class SessionExercisesNestedController {
  constructor(
    private readonly sessionExercisesService: SessionExercisesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los ejercicios prescritos en una sesión propia',
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdRouteParamDto,
  ) {
    const items = await this.sessionExercisesService.listForSession(
      currentUser.id,
      params.sessionId,
    );
    return { data: items, error: null, meta: {} };
  }

  @Post()
  @ApiOperation({
    summary: 'Agrega un ejercicio del catálogo a una sesión propia',
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdRouteParamDto,
    @Body() dto: CreateSessionExerciseDto,
  ) {
    const item = await this.sessionExercisesService.create(
      currentUser.id,
      params.sessionId,
      dto,
    );
    return { data: item, error: null, meta: {} };
  }
}

@ApiTags('session-exercises')
@Controller('session-exercises')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class SessionExercisesController {
  constructor(
    private readonly sessionExercisesService: SessionExercisesService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ejercicio prescrito propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionExerciseIdParamDto,
  ) {
    const item = await this.sessionExercisesService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: item, error: null, meta: {} };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Edita la prescripción de un ejercicio dentro de una sesión propia',
  })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionExerciseIdParamDto,
    @Body() dto: UpdateSessionExerciseDto,
  ) {
    const item = await this.sessionExercisesService.update(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: item, error: null, meta: {} };
  }
}
