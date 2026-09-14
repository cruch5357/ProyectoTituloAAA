import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Módulo global: cualquier módulo de negocio futuro puede inyectar
// PrismaService sin volver a importarlo explícitamente.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
