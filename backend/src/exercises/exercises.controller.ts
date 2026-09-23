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
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { UpdateExerciseStatusDto } from './dto/update-exercise-status.dto';
import { ExerciseIdParamDto } from './dto/exercise-id-param.dto';
import { ListExercisesQueryDto } from './dto/list-exercises-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Todos los endpoints son exclusivos de COACH (PROMPT 07: el modelo actual
// no contempla ejercicios globales/compartidos, solo por coach — se respeta
// esa decision existente sin inventar un sistema multi-coach). Dos capas de
// guard en el orden ya establecido (PROMPT 03/04): JwtAuthGuard primero,
// RolesGuard despues, a nivel de clase. La autorizacion de PROPIEDAD (que el
// ejercicio pertenezca al coach autenticado) se resuelve siempre en
// ExercisesService, nunca en un guard generico, por la misma razon que
// StudentsController: requiere cargar el recurso desde la base de datos.
@ApiTags('exercises')
@Controller('exercises')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista el catálogo de ejercicios del coach autenticado',
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListExercisesQueryDto,
  ) {
    const result = await this.exercisesService.listForCoach(
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

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ejercicio propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ExerciseIdParamDto,
  ) {
    const exercise = await this.exercisesService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: exercise, error: null, meta: {} };
  }

  @Post()
  @ApiOperation({ summary: 'Crea un ejercicio en el catálogo del coach' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateExerciseDto,
  ) {
    const exercise = await this.exercisesService.create(currentUser.id, dto);
    return { data: exercise, error: null, meta: {} };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita un ejercicio propio' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ExerciseIdParamDto,
    @Body() dto: UpdateExerciseDto,
  ) {
    const exercise = await this.exercisesService.update(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: exercise, error: null, meta: {} };
  }

  // Unica forma de "eliminar" un ejercicio (baja logica, reversible) — no
  // existe DELETE /exercises/:id, mismo criterio que StudentsController
  // (docs/api.md, "Estado de implementación (PROMPT 04)").
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa/desactiva un ejercicio propio' })
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ExerciseIdParamDto,
    @Body() dto: UpdateExerciseStatusDto,
  ) {
    const exercise = await this.exercisesService.updateStatus(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: exercise, error: null, meta: {} };
  }
}
