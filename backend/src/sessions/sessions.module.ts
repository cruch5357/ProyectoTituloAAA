import { Module } from '@nestjs/common';
import {
  WeekSessionsController,
  SessionsController,
} from './sessions.controller';
import { SessionsService } from './sessions.service';
import { AuthModule } from '../auth/auth.module';
import { WeeksModule } from '../weeks/weeks.module';

@Module({
  imports: [AuthModule, WeeksModule],
  controllers: [WeekSessionsController, SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
