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
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { UpdateProgramStatusDto } from './dto/update-program-status.dto';
import { ProgramIdParamDto } from './dto/program-id-param.dto';
import { ListProgramsQueryDto } from './dto/list-programs-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Raiz de la jerarquia de prescripcion (PROMPT 08). Mismo patron exacto de
// guards que ExercisesController/StudentsController: dos capas
// (JwtAuthGuard + RolesGuard) a nivel de clase, autorizacion de PROPIEDAD
// resuelta siempre en ProgramsService.
@ApiTags('programs')
@Controller('programs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los programas del coach autenticado' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListProgramsQueryDto,
  ) {
    const result = await this.programsService.listForCoach(
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
  @ApiOperation({ summary: 'Detalle de un programa propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdParamDto,
  ) {
    const program = await this.programsService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: program, error: null, meta: {} };
  }

  @Post()
  @ApiOperation({ summary: 'Crea un programa propio del coach' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateProgramDto,
  ) {
    const program = await this.programsService.create(currentUser.id, dto);
    return { data: program, error: null, meta: {} };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita un programa propio' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdParamDto,
    @Body() dto: UpdateProgramDto,
  ) {
    const program = await this.programsService.update(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: program, error: null, meta: {} };
  }

  // Unica forma de "eliminar" un programa (baja logica, reversible) — no
  // existe DELETE /programs/:id, aunque la sección 4 de docs/api.md lo
  // mencionaba conceptualmente: se aplica la misma desviación ya
  // documentada para /students y /exercises.
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa/archiva un programa propio' })
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdParamDto,
    @Body() dto: UpdateProgramStatusDto,
  ) {
    const program = await this.programsService.updateStatus(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: program, error: null, meta: {} };
  }
}
