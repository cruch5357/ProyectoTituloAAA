import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ExcelImportsService } from './excel-imports.service';
import { ImportBatchIdParamDto } from './dto/import-batch-id-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { EXCEL_MAX_FILE_SIZE_BYTES } from '../common/imports/excel-import.constants';

// Exclusivo de COACH: el Excel de este módulo representa una planificación
// que el coach quiere prescribir, nunca algo que un alumno sube (mismo
// criterio de "todos los endpoints son exclusivos de COACH" ya aplicado en
// ExercisesController/ProgramsController).
//
// `POST /imports/excel` y `GET /imports/excel/:id` son los dos endpoints de
// PROMPT 13. `POST /imports/excel/:id/confirm` y `POST /imports/excel/:id/
// reject` (PROMPT 14) usan POST + `@HttpCode(HttpStatus.OK)` en vez de la
// convención PATCH+OK usada en otras transiciones de estado del proyecto
// (`workout-logs.controller.ts`, `program-assignments.controller.ts`):
// docs/api.md ya define el contrato de este módulo desde PROMPT 00 como
// `POST .../confirm` y `POST .../reject`, así que se respeta ese contrato
// preexistente en vez de forzar la convención PATCH.
@ApiTags('imports')
@Controller('imports/excel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class ExcelImportsController {
  constructor(private readonly excelImportsService: ExcelImportsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Sube un archivo .xlsx con una planificación, lo valida y devuelve una vista previa (sin persistir en el modelo normalizado)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Límite "circuito abierto" del propio multer, deliberadamente MAYOR
      // al límite real (`EXCEL_MAX_FILE_SIZE_BYTES`): protege memoria ante
      // un archivo groseramente sobredimensionado sin abortar el stream a
      // mitad de camino, para que sea siempre `ExcelImportsService` (con un
      // mensaje claro y controlado, 400) quien rechace el límite real de 5
      // MB — un `MulterError` crudo lanzado desde el propio interceptor no
      // pasa por la misma capa de mensajes limpios (ver informe de cierre de
      // PROMPT 13 para el detalle de esta decisión).
      limits: { fileSize: EXCEL_MAX_FILE_SIZE_BYTES * 2 },
    }),
  )
  async upload(
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const batch = await this.excelImportsService.createFromUpload(
      currentUser.id,
      file,
    );
    return { data: batch, error: null, meta: {} };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Vista previa de una importación propia (conteos, filas y errores)',
  })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ImportBatchIdParamDto,
  ) {
    const batch = await this.excelImportsService.getOwnedPreview(
      currentUser.id,
      params.id,
    );
    return { data: batch, error: null, meta: {} };
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirma una importación propia PENDING_REVIEW: normaliza sus filas válidas en Program/Block/Week/Session/SessionExercise y marca el batch como CONFIRMED',
  })
  async confirm(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ImportBatchIdParamDto,
  ) {
    const batch = await this.excelImportsService.confirmBatch(
      currentUser.id,
      params.id,
    );
    return { data: batch, error: null, meta: {} };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rechaza una importación propia PENDING_REVIEW sin generar programación',
  })
  async reject(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: ImportBatchIdParamDto,
  ) {
    const batch = await this.excelImportsService.rejectBatch(
      currentUser.id,
      params.id,
    );
    return { data: batch, error: null, meta: {} };
  }
}
