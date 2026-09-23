import { Module } from '@nestjs/common';
import { ProgramBlocksController, BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { AuthModule } from '../auth/auth.module';
import { ProgramsModule } from '../programs/programs.module';

// Importa ProgramsModule para reutilizar ProgramsService.findOwnedProgramOrThrow
// al crear/listar bloques bajo un programa (verificación del primer eslabón
// de la cadena de propiedad). Exporta BlocksService: WeeksModule lo necesita
// para el mismo propósito un nivel más abajo.
@Module({
  imports: [AuthModule, ProgramsModule],
  controllers: [ProgramBlocksController, BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
