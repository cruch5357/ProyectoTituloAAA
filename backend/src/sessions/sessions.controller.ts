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
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionIdParamDto } from './dto/session-id-param.dto';
import { WeekIdRouteParamDto } from './dto/week-id-route-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';

@ApiTags('sessions')
@Controller('weeks/:weekId/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class WeekSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las sesiones de una semana propia' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WeekIdRouteParamDto,
  ) {
    const sessions = await this.sessionsService.listForWeek(
      currentUser.id,
      params.weekId,
    );
    return { data: sessions, error: null, meta: {} };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una sesión dentro de una semana propia' })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: WeekIdRouteParamDto,
    @Body() dto: CreateSessionDto,
  ) {
    const session = await this.sessionsService.create(
      currentUser.id,
      params.weekId,
      dto,
    );
    return { data: session, error: null, meta: {} };
  }
}

@ApiTags('sessions')
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una sesión propia' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdParamDto,
  ) {
    const session = await this.sessionsService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: session, error: null, meta: {} };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edita una sesión propia (nombre, día de la semana y/u orden)',
  })
  async update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: SessionIdParamDto,
    @Body() dto: UpdateSessionDto,
  ) {
    const session = await this.sessionsService.update(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: session, error: null, meta: {} };
  }
}
