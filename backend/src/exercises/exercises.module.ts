import { Module } from '@nestjs/common';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { AuthModule } from '../auth/auth.module';

// Mismo patron exacto que StudentsModule (PROMPT 04): importa AuthModule
// para reutilizar JwtAuthGuard/TokenService en vez de reinstanciarlos.
@Module({
  imports: [AuthModule],
  controllers: [ExercisesController],
  providers: [ExercisesService],
})
export class ExercisesModule {}
