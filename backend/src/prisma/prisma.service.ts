import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Infraestructura de acceso a datos (PROMPT 01). Todavía no existen modelos
// de negocio en prisma/schema.prisma: eso se define en el prompt de base de
// datos, según docs/database.md.
//
// Deliberadamente NO se llama $connect() de forma eager en el arranque: en
// esta etapa aún no hay una base de datos PostgreSQL configurada en todos los
// entornos de desarrollo del equipo, y forzar la conexión aquí haría que la
// aplicación (y sus pruebas) fallen al iniciar sin motivo relacionado con la
// infraestructura HTTP. Prisma se conecta de forma perezosa en la primera
// consulta real. Cuando se implemente el modelo de datos definitivo, evaluar
// si conviene conectar de forma eager para fallar rápido ante una base de
// datos no disponible.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
