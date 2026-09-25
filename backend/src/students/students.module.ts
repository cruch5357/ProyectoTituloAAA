import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { AuthModule } from '../auth/auth.module';

// Sigue el mismo patrón que UsersModule (PROMPT 03): importa AuthModule para
// reutilizar JwtAuthGuard/TokenService en vez de reinstanciarlos o duplicar
// lógica de autenticación.
//
// `exports: [StudentsService]` agregado en PROMPT 12: DashboardModule
// reutiliza StudentsService.getOwnedByCoach() (verificación de propiedad
// coach->alumno, 404 genérico) en vez de reimplementar ese chequeo para la
// vista por-alumno del Dashboard del Coach.
@Module({
  imports: [AuthModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
