import { Module } from '@nestjs/common';
import { BlockLibraryService } from './library.service';
import { BlockLibraryController } from './library.controller';
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
  controllers: [
    ProgramBlocksController,
    BlocksController,
    BlockLibraryController,
  ],
  providers: [BlocksService, BlockLibraryService],
  exports: [BlocksService],
})
export class BlocksModule {}
