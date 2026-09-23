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
import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { BlockIdParamDto } from './dto/block-id-param.dto';
import { ProgramIdRouteParamDto } from './dto/program-id-route-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

// Dos controllers en el mismo módulo NestJS (listar/crear anidado bajo el
// programa; detalle/editar como recurso propio bajo /blocks/:id) — mismo
// patrón conceptual documentado en docs/api.md sección 4
// (`GET/POST /programs/:id/blocks`), completado con el detalle/edición que
// ese documento no detallaba a nivel de endpoint individual.
@ApiTags('blocks')
@Controller('programs/:programId/blocks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class ProgramBlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los bloques de un programa propio' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdRouteParamDto,
  ) {
    const blocks = await this.blocksService.listForProgram(
      currentUser.id,
      params.programId,
    );
    return { data: blocks, error: null, meta: {} };
  }

  @Post()
  @ApiOperation({ summary: 'Crea un bloque dentro de un programa propio' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ProgramIdRouteParamDto,
    @Body() dto: CreateBlockDto,
  ) {
    const block = await this.blocksService.create(
      currentUser.id,
      params.programId,
      dto,
    );
    return { data: block, error: null, meta: {} };
  }
}

@ApiTags('blocks')
@Controller('blocks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un bloque propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: BlockIdParamDto,
  ) {
    const block = await this.blocksService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: block, error: null, meta: {} };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita un bloque propio (nombre y/u orden)' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: BlockIdParamDto,
    @Body() dto: UpdateBlockDto,
  ) {
    const block = await this.blocksService.update(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: block, error: null, meta: {} };
  }
}
