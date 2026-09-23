import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/tokens/token.service';
import { PublicUser, toPublicUser } from '../common/mappers/public-user.mapper';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_STUDENT_INVITATION,
  AUDIT_ENTITY_USER,
} from '../auth/auth.constants';
import { InviteStudentDto } from './dto/invite-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';

export interface InviteStudentResult {
  email: string;
  expiresAt: Date;
  // Ver StudentsService.invite(): entrega temporal del token en texto
  // plano, mientras no exista un servicio real de envío de correo (idéntico
  // a como se documentó en PROMPT 03 para el endpoint original).
  activationToken: string;
}

export interface PaginatedStudents {
  items: PublicUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const GENERIC_STUDENT_NOT_FOUND = 'Alumno no encontrado';

// ---------------------------------------------------------------------------
// Gestión de alumnos por parte del Coach — primer recurso de negocio real
// del proyecto (PROMPT 04). Autorización de propiedad (docs/security.md,
// puntos 3 y 5; docs/api.md, sección 3):
//
// El `coachId` usado para filtrar/verificar SIEMPRE viene del usuario
// autenticado (`request.user`, poblado por JwtAuthGuard a partir del JWT ya
// verificado) — nunca de un parámetro de ruta, query o body. Cada método
// público de este servicio recibe `coachId` como primer parámetro explícito,
// exactamente igual que `AuthService.inviteStudent()` en PROMPT 03.
//
// DECISIÓN DOCUMENTADA (ver docs/security.md, "Estado de implementación
// (PROMPT 04)"): para el caso de acceso cruzado entre coaches (Coach A
// intentando leer/modificar un alumno de Coach B), este servicio usa
// `NotFoundException` (404) en vez de la función genérica
// `assertOwnsResource()` de `src/auth/authorization/resource-ownership.ts`
// (que lanza `ForbiddenException`/403). Motivo: informar con un 403 que "el
// recurso existe pero no es tuyo" ya revela la existencia de un alumno
// ajeno con ese id (docs/api.md, sección 5: "se prefiere 404 sobre 403
// cuando informar la existencia del recurso ya es una fuga de
// información"). `assertOwnsResource()` sigue disponible para recursos
// futuros donde esa fuga no aplique o no importe.
// ---------------------------------------------------------------------------
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  // Verifica que `student` exista, sea efectivamente un STUDENT y pertenezca
  // al coach autenticado. Lanza 404 (nunca 403) en cualquier otro caso, sin
  // distinguir "no existe" de "existe pero es de otro coach" (mismo
  // principio de no-enumeración que login()/activate() en PROMPT 03).
  private ensureOwnedStudent(coachId: string, student: User | null): User {
    if (
      !student ||
      student.role !== Role.STUDENT ||
      student.coachId !== coachId
    ) {
      throw new NotFoundException(GENERIC_STUDENT_NOT_FOUND);
    }
    return student;
  }

  // -------------------------------------------------------------------
  // GET /students — únicamente los alumnos del coach autenticado
  // (docs/api.md, PROMPT 04, punto 5). El scoping por coachId se aplica
  // directamente en la cláusula `where` de Prisma, nunca en memoria
  // después de traer todos los alumnos.
  // -------------------------------------------------------------------
  async listForCoach(
    coachId: string,
    query: ListStudentsQueryDto,
  ): Promise<PaginatedStudents> {
    const { page, limit, search } = query;

    const where: Prisma.UserWhereInput = {
      role: Role.STUDENT,
      coachId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    // Selecciona solo los campos necesarios para el listado (PROMPT 04,
    // punto 22 — evitar sobre-consultar); `toPublicUser()` de todos modos
    // nunca expondría passwordHash/tokenVersion aunque se trajeran.
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(toPublicUser),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // -------------------------------------------------------------------
  // GET /students/:id — secuencia de verificación (docs/api.md, PROMPT 04,
  // punto 6):
  //   1. Autenticado (JwtAuthGuard, a nivel de controller).
  //   2. Rol COACH (RolesGuard, a nivel de controller).
  //   3. `:id` con formato válido (StudentIdParamDto, a nivel de controller).
  //   4. Cargar el recurso por id.
  //   5. Verificar que sea un STUDENT y que pertenezca al coach autenticado;
  //      si no, 404 sin más detalle (ensureOwnedStudent).
  // -------------------------------------------------------------------
  async getOwnedByCoach(
    coachId: string,
    studentId: string,
  ): Promise<PublicUser> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    return toPublicUser(this.ensureOwnedStudent(coachId, student));
  }

  // -------------------------------------------------------------------
  // PATCH /students/:id/status — único campo mutable: `isActive`. Mismo
  // chequeo de propiedad que getOwnedByCoach() antes de escribir nada.
  // -------------------------------------------------------------------
  async updateStatus(
    coachId: string,
    studentId: string,
    dto: UpdateStudentStatusDto,
  ): Promise<PublicUser> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    this.ensureOwnedStudent(coachId, student);

    const updated = await this.prisma.user.update({
      where: { id: studentId },
      // Objeto `data` explícito y angosto: nunca se reenvía el DTO completo
      // ni el body crudo de la request (prevención de mass assignment).
      data: { isActive: dto.isActive },
    });

    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.STUDENT_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_USER,
      entityId: updated.id,
      metadata: { isActive: dto.isActive },
    });

    return toPublicUser(updated);
  }

  // -------------------------------------------------------------------
  // POST /students/invite — reubicado sin cambios funcionales desde
  // AuthService.inviteStudent() (PROMPT 03). Ver nota de reorganización en
  // docs/api.md, "Estado de implementación (PROMPT 04)".
  // -------------------------------------------------------------------
  async invite(
    coachId: string,
    dto: InviteStudentDto,
  ): Promise<InviteStudentResult> {
    const email = this.normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException(
        'Ya existe una cuenta asociada a este correo',
      );
    }

    await this.prisma.studentInvitation.deleteMany({
      where: { coachId, email, usedAt: null },
    });

    const { token, tokenHash } = this.tokenService.generateInvitationToken();
    const expiresAt = this.tokenService.getInvitationExpiresAt();

    const invitation = await this.prisma.studentInvitation.create({
      data: { email, coachId, tokenHash, expiresAt },
    });

    await this.auditService.record({
      actorId: coachId,
      action: AUDIT_ACTIONS.STUDENT_INVITED,
      entityType: AUDIT_ENTITY_STUDENT_INVITATION,
      entityId: invitation.id,
      metadata: { email },
    });

    return { email, expiresAt, activationToken: token };
  }
}
