import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Validación de formato del `:studentId` de ruta (mismo criterio que
// StudentIdParamDto en students/, SessionIdRouteParamDto en
// session-exercises/, etc. — PROMPT 04, punto 21): un id con forma inválida
// se rechaza con 400 antes de tocar la base de datos. Que ESE id
// efectivamente pertenezca al coach autenticado se verifica después, en el
// servicio (reutilizando StudentsService.getOwnedByCoach(), que responde
// 404 genérico si no existe o es de otro coach).
export class StudentIdRouteParamDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'studentId con formato inválido' })
  studentId: string;
}
