import { Module } from '@nestjs/common';
import {
  WorkoutLogsController,
  WorkoutLogsNestedController,
} from './workout-logs.controller';
import { WorkoutLogsService } from './workout-logs.service';
import { AuthModule } from '../auth/auth.module';
import { StudentTrainingModule } from '../student-training/student-training.module';

// Importa StudentTrainingModule para reutilizar
// StudentTrainingService.findAssignedSessionOrThrow (mismo patrón que
// BlocksModule reutilizando ProgramsService desde PROMPT 08) — nunca se
// reimplementa la cadena de propiedad Session -> ... -> ProgramAssignment
// en este módulo.
@Module({
  imports: [AuthModule, StudentTrainingModule],
  controllers: [WorkoutLogsNestedController, WorkoutLogsController],
  providers: [WorkoutLogsService],
  exports: [WorkoutLogsService],
})
export class WorkoutLogsModule {}
