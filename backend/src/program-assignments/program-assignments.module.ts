import { Module } from '@nestjs/common';
import {
  ProgramAssignmentsController,
  ProgramAssignmentsNestedController,
} from './program-assignments.controller';
import { ProgramAssignmentsService } from './program-assignments.service';
import { AuthModule } from '../auth/auth.module';
import { ProgramsModule } from '../programs/programs.module';

// Importa ProgramsModule para reutilizar ProgramsService.findOwnedProgramOrThrow
// (mismo patrón que BlocksModule en PROMPT 08) — nunca se reimplementa la
// verificación de propiedad de un Program en este módulo.
@Module({
  imports: [AuthModule, ProgramsModule],
  controllers: [
    ProgramAssignmentsNestedController,
    ProgramAssignmentsController,
  ],
  providers: [ProgramAssignmentsService],
  exports: [ProgramAssignmentsService],
})
export class ProgramAssignmentsModule {}
