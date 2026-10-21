import { ScheduleService } from './schedule.service';
import { BlockAssignmentsModule } from '../block-assignments/block-assignments.module';
import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoachingController } from './coaching.controller';
import { CalendarService } from './calendar.service';
import { StudentAccessService } from './student-access.service';
import { CompetitionsService } from '../competitions/competitions.service';
import { NotificationsService } from '../notifications/notifications.service';

@Global()
@Module({
  imports: [AuthModule, BlockAssignmentsModule],
  controllers: [CoachingController],
  providers: [
    CalendarService,
    ScheduleService,
    StudentAccessService,
    CompetitionsService,
    NotificationsService,
  ],
  exports: [NotificationsService, StudentAccessService],
})
export class CoachingModule {}
