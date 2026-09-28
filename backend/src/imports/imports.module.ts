import { Module } from '@nestjs/common';
import { ExcelImportsController } from './excel-imports.controller';
import { ExcelImportsService } from './excel-imports.service';
import { AuthModule } from '../auth/auth.module';

// Mismo patrón exacto que ExercisesModule/StudentsModule: importa
// AuthModule para reutilizar JwtAuthGuard/TokenService en vez de
// reinstanciarlos. No depende de ExercisesModule: la resolución de
// ejercicios por nombre se resuelve con una consulta directa a Prisma
// scopeada por coachId (ExcelImportsService.buildExerciseNameIndex), mismo
// criterio ya usado por otros servicios que solo necesitan LEER una tabla
// ajena sin reutilizar lógica de negocio de su módulo (ver
// DashboardStudentService reutilizando sí a StudentsService.getOwnedByCoach
// porque ahí la lógica de propiedad es más rica — acá no hace falta, es una
// búsqueda simple por nombre).
@Module({
  imports: [AuthModule],
  controllers: [ExcelImportsController],
  providers: [ExcelImportsService],
})
export class ImportsModule {}
