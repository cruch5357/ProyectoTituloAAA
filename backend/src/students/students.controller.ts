import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StudentsService } from './students.service';
import { InviteStudentDto } from './dto/invite-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentIdParamDto } from './dto/student-id-param.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { AUTH_THROTTLER_NAME } from '../auth/auth.constants';

// Todos los endpoints de este controller son exclusivos de COACH (PROMPT 04,
// puntos 2-7): dos capas de guard en el orden establecido en PROMPT 03
// (JwtAuthGuard primero, RolesGuard después), aplicadas a nivel de clase
// para no repetirlas en cada método. La autorización de PROPIEDAD del
// recurso (que el alumno pertenezca al coach autenticado) NO se puede
// resolver con un guard genérico porque depende de cargar el recurso desde
// la base de datos: se resuelve siempre en StudentsService (docs/security.md,
// "Autorización sobre recursos/objetos").
@ApiTags('students')
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COACH)
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // El coachId SIEMPRE sale de CurrentUser() (JWT ya verificado). La query
  // no declara `coachId` (ver ListStudentsQueryDto): si el cliente lo envía,
  // el ValidationPipe global (whitelist + forbidNonWhitelisted) lo rechaza
  // con 400 antes de que este método se ejecute.
  @Get()
  @ApiOperation({ summary: 'Lista los alumnos del coach autenticado' })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListStudentsQueryDto,
  ) {
    const result = await this.studentsService.listForCoach(
      currentUser.id,
      query,
    );
    return {
      data: result.items,
      error: null,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un alumno propio' })
  async detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: StudentIdParamDto,
  ) {
    const student = await this.studentsService.getOwnedByCoach(
      currentUser.id,
      params.id,
    );
    return { data: student, error: null, meta: {} };
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa/desactiva un alumno propio' })
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param() params: StudentIdParamDto,
    @Body() dto: UpdateStudentStatusDto,
  ) {
    const student = await this.studentsService.updateStatus(
      currentUser.id,
      params.id,
      dto,
    );
    return { data: student, error: null, meta: {} };
  }

  // Reubicado desde `POST /auth/students/invite` (PROMPT 03) — ver
  // docs/api.md, "Estado de implementación (PROMPT 04)" para la nota de
  // reorganización. Mismo throttler nombrado `"auth"` que el resto de los
  // endpoints sensibles de autenticación/cuentas.
  @Post('invite')
  @Throttle({ [AUTH_THROTTLER_NAME]: {} })
  @ApiOperation({ summary: 'Coach invita a un alumno por email' })
  async invite(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: InviteStudentDto,
  ) {
    const result = await this.studentsService.invite(currentUser.id, dto);
    return { data: result, error: null, meta: {} };
  }
}
