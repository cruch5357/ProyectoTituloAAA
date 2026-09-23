import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

// Body de POST /programs/:programId/assign (PROMPT 09). DELIBERADAMENTE
// angosto: el UNICO campo que este endpoint acepta es `studentId` (formato
// de cuid validado antes de tocar la base de datos, mismo criterio de
// IDOR/BOLA que el resto del proyecto). Nunca se acepta `coachId`,
// `programId` ni `status` en este body — el `programId` sale siempre de la
// ruta (ya verificada como propia del coach autenticado antes de llegar
// aca), y una asignacion nueva SIEMPRE nace en estado ACTIVE (default del
// schema, ver prisma/schema.prisma), nunca elegido por el cliente.
//
// DECISION DOCUMENTADA (ver docs/api.md, "Estado de implementacion
// (PROMPT 09)"): docs/api.md seccion 4 (planificacion conceptual, PROMPT 00)
// describia este endpoint con un body de LISTA de studentId ("asigna un
// programa a uno o varios alumnos"). Se implementa en cambio con un unico
// `studentId` por llamada, exactamente como describe el enunciado de
// PROMPT 09 en su diagrama de flujo ("Selecciona Alumno propio" en
// singular, tanto en la seccion de reglas de propiedad como en la de
// frontend). Asignar a varios alumnos se logra invocando este mismo
// endpoint una vez por alumno, cada invocacion validada y auditada de forma
// independiente — evita ademas tener que decidir un comportamiento
// "todo o nada" vs "parcial" para una lista, que el enunciado no pide.
export class AssignProgramDto {
  @ApiProperty({ example: 'ckv6q8x9z0000qzrmn831p6k' })
  @Matches(/^c[a-z0-9]{24}$/, { message: 'id con formato inválido' })
  studentId: string;
}
