import { ScheduleService } from './schedule.service';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitionsService } from '../competitions/competitions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarService } from './calendar.service';
import {
  CalendarQueryDto,
  CoachGoalDto,
  CompetitionDto,
  DateDto,
  RescheduleDto,
  PageDto,
  ProfileDto,
  UpdateCompetitionDto,
} from './coaching.dto';
import { dateOnly } from '../common/training/calendar-date';
import { BadRequestException } from '@nestjs/common';

const envelope = <T>(data: T) => ({ data, error: null, meta: {} });
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoachingController {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly notifications: NotificationsService,
    private readonly calendar: CalendarService,
    private readonly schedule: ScheduleService,
    private readonly prisma: PrismaService,
  ) {}
  @Get('competitions/me')
  @Roles(Role.STUDENT)
  async own(@CurrentUser() u: AuthenticatedUser, @Query() q: PageDto) {
    return envelope(await this.competitions.list(u, u.id, q.page));
  }
  @Get('students/:id/competitions')
  @Roles(Role.COACH)
  async list(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: PageDto,
  ) {
    return envelope(await this.competitions.list(u, id, q.page));
  }
  @Post('competitions')
  @Roles(Role.STUDENT)
  async create(@CurrentUser() u: AuthenticatedUser, @Body() d: CompetitionDto) {
    return envelope(await this.competitions.create(u, d));
  }
  @Get('competitions/:id')
  async get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return envelope(await this.competitions.get(u, id));
  }
  @Patch('competitions/:id')
  @Roles(Role.STUDENT)
  async update(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: UpdateCompetitionDto,
  ) {
    return envelope(await this.competitions.update(u, id, d));
  }
  @Patch('competitions/:id/coach-goal')
  @Roles(Role.COACH)
  async goal(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() d: CoachGoalDto,
  ) {
    return envelope(await this.competitions.coachGoal(u, id, d));
  }
  @Get('calendar/me')
  @Roles(Role.STUDENT)
  async ownCalendar(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: CalendarQueryDto,
  ) {
    return envelope(await this.calendar.overview(u, u.id, q.month));
  }
  @Get('students/:id/calendar')
  @Roles(Role.COACH)
  async studentCalendar(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: CalendarQueryDto,
  ) {
    return envelope(await this.calendar.overview(u, id, q.month));
  }
  @Get('dashboard/operations')
  @Roles(Role.COACH)
  async operations(@CurrentUser() u: AuthenticatedUser) {
    return envelope(await this.calendar.coach(u));
  }
  @Patch('program-assignments/:id/start-date')
  @Roles(Role.COACH)
  async startDate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DateDto,
  ) {
    return envelope(await this.schedule.changeStart(u.id, id, dto.startDate));
  }
  @Patch('program-assignments/:id/sessions/:sessionId/schedule')
  @Roles(Role.COACH)
  async reschedule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: RescheduleDto,
  ) {
    return envelope(await this.schedule.change(u.id, id, sessionId, dto));
  }
  @Post('program-assignments/:id/sessions/:sessionId/schedule/reset')
  @Roles(Role.COACH)
  async resetSchedule(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return envelope(await this.schedule.change(u.id, id, sessionId, null));
  }
  @Get('profile/me')
  async profile(@CurrentUser() u: AuthenticatedUser) {
    return envelope(
      await this.prisma.user.findUnique({
        where: { id: u.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profile: true,
          coach: { select: { id: true, name: true, email: true } },
        },
      }),
    );
  }
  @Patch('profile/me')
  async saveProfile(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: ProfileDto,
  ) {
    const birthDate =
      dto.birthDate === undefined
        ? undefined
        : dto.birthDate === null
          ? null
          : dateOnly(dto.birthDate);
    if (birthDate && birthDate > new Date())
      throw new BadRequestException('Fecha de nacimiento futura');
    const data = {
      displayName: dto.displayName,
      avatarUrl: dto.avatarUrl,
      phone: dto.phone,
      birthDate,
      city: dto.city,
      sport: dto.sport,
      bio: dto.bio,
    };
    return envelope(
      await this.prisma.userProfile.upsert({
        where: { userId: u.id },
        create: { userId: u.id, ...data },
        update: data,
      }),
    );
  }
  @Get('notifications')
  async notificationList(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PageDto,
  ) {
    return envelope(await this.notifications.list(u.id, q.page));
  }
  @Get('notifications/unread-count')
  async unread(@CurrentUser() u: AuthenticatedUser) {
    return envelope({ count: await this.notifications.count(u.id) });
  }
  @Patch('notifications/read-all')
  async readAll(@CurrentUser() u: AuthenticatedUser) {
    return envelope(await this.notifications.readAll(u.id));
  }
  @Patch('notifications/:id/read')
  async read(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return envelope(await this.notifications.read(u.id, id));
  }
}
