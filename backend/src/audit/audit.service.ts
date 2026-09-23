import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEventInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  // Metadata mínima y segura: NUNCA contraseñas, tokens, cookies o secretos
  // (docs/security.md, puntos 17 y 18). Cada llamador es responsable de no
  // incluir esos valores; este servicio no los conoce ni los filtra.
  metadata?: Record<string, unknown>;
}

// Servicio de auditoría (docs/database.md AuditLog; docs/security.md punto
// 18). Un fallo al auditar nunca debe romper el flujo de negocio principal
// (ej. un login exitoso no debe fallar solo porque no se pudo escribir el
// AuditLog) — se captura y se registra en el logger de la aplicación.
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEventInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: event.actorId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          // Prisma tipa los campos Json anulables como
          // `NullableJsonNullValueInput | InputJsonValue`: un `null` de
          // JavaScript no alcanza para expresar "guardar JSON null", hay
          // que usar el centinela `Prisma.JsonNull`. Detectado recién al
          // correr `prisma generate` de verdad (ver informe de PROMPT 03
          // sobre el shim local de tipos usado en el sandbox de
          // preparación, que no distinguía este caso).
          metadata:
            event.metadata !== undefined
              ? (event.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar evento de auditoría (${event.action})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
