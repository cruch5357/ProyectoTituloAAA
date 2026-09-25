import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardStudentService } from './dashboard-student.service';
import { AuthModule } from '../auth/auth.module';
import { StudentsModule } from '../students/students.module';

// Sigue el mismo patrón que WorkoutLogsModule/ProgramAssignmentsModule:
// importa AuthModule (guards/decorators de autenticación) y StudentsModule
// (para reutilizar StudentsService.getOwnedByCoach() en
// DashboardStudentService, en vez de duplicar la verificación de
// propiedad coach->alumno).
@Module({
  imports: [AuthModule, StudentsModule],
  controllers: [DashboardController],
  providers: [DashboardSummaryService, DashboardStudentService],
})
export class DashboardModule {}
