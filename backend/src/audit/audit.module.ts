import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global por la misma razón que PrismaModule: cualquier módulo de negocio
// futuro necesita poder auditar eventos sin reimportar este módulo.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
