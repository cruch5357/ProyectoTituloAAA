import { Module } from '@nestjs/common';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { AuthModule } from '../auth/auth.module';

// Mismo patron exacto que ExercisesModule (PROMPT 07). Exporta
// ProgramsService: BlocksModule lo necesita para verificar la propiedad del
// Program padre antes de crear un Block.
@Module({
  imports: [AuthModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
