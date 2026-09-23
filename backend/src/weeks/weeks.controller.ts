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
import { WeeksService } from './weeks.service';
import { CreateWeekDto } from './dto/create-week.dto';
import { UpdateWeekDto } from './dto/update-week.dto';
import { WeekIdParamDto } from './dto/week-id-param.dto';
import { BlockIdRouteParamDto } from './dto/block-id-route-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

@ApiTags('weeks')
@Controller('blocks/:blockId/weeks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class BlockWeeksController {
  constructor(private readonly weeksService: WeeksService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las semanas de un bloque propio' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: BlockIdRouteParamDto,
  ) {
    const weeks = await this.weeksService.listForBlock(
      currentUser.id,
      params.blockId,
    );
    return { data: weeks, error: null, meta: {} };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una semana dentro de un bloque propio' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: BlockIdRouteParamDto,
    @Body() dto: CreateWeekDto,
  ) {
    const week = await this.weeksService.create(
      currentUser.id,
      params.blockId,
      dto,
    );
    return { data: week, error: null, meta: {} };
  }
}

@ApiTags('weeks')
@Controller('weeks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class WeeksController {
  constructor(private readonly weeksService: WeeksService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una semana propia' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WeekIdParamDto,
  ) {
    const week = await this.weeksService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: week, error: null, meta: {} };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edita una semana propia (número y/u orden)' })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WeekIdParamDto,
    @Body() dto: UpdateWeekDto,
  ) {
    const week = await this.weeksService.update(currentUser.id, params.id, dto);
    return { data: week, error: null, meta: {} };
  }
}
