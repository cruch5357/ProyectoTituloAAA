import { Module } from '@nestjs/common';
import {
  SessionExercisesNestedController,
  SessionExercisesController,
} from './session-exercises.controller';
import { SessionExercisesService } from './session-exercises.service';
import { AuthModule } from '../auth/auth.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [AuthModule, SessionsModule],
  controllers: [SessionExercisesNestedController, SessionExercisesController],
  providers: [SessionExercisesService],
})
export class SessionExercisesModule {}
