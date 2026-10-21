import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BlockAssignmentsService } from './block-assignments.service';
import { TrainingService } from './training.service';
import { AssignBlockDto, SaveTrainingDto } from './block-assignment.dto';
const envelope = <T>(data: T) => ({ data, error: null, meta: {} });
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlockAssignmentsController {
  constructor(
    private readonly assignments: BlockAssignmentsService,
    private readonly training: TrainingService,
  ) {}
  @Post('students/:id/block-assignments')
  @Roles(Role.COACH)
  async assign(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignBlockDto,
  ) {
    return envelope(await this.assignments.assign(u.id, id, dto));
  }
  @Get('students/:id/training')
  @Roles(Role.COACH)
  async student(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return envelope(await this.training.overview(u, id));
  }
  @Get('training/me')
  @Roles(Role.STUDENT)
  async own(@CurrentUser() u: AuthenticatedUser) {
    return envelope(await this.training.overview(u, u.id));
  }
  @Get('training/sessions/:id')
  @Roles(Role.STUDENT, Role.COACH)
  async session(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query('assignmentId') assignmentId?: string,
  ) {
    return envelope(await this.training.detail(u, id, assignmentId));
  }
  @Patch('training/sessions/:id')
  @Roles(Role.STUDENT)
  async save(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveTrainingDto,
  ) {
    return envelope(await this.training.save(u, id, dto));
  }
}
