import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { AuthModule } from '../auth/auth.module';

// Sigue el mismo patrón que UsersModule (PROMPT 03): importa AuthModule para
// reutilizar JwtAuthGuard/TokenService en vez de reinstanciarlos o duplicar
// lógica de autenticación.
@Module({
  imports: [AuthModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
