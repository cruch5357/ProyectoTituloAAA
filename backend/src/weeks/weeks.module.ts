import { Module } from '@nestjs/common';
import { BlockWeeksController, WeeksController } from './weeks.controller';
import { WeeksService } from './weeks.service';
import { AuthModule } from '../auth/auth.module';
import { BlocksModule } from '../blocks/blocks.module';

@Module({
  imports: [AuthModule, BlocksModule],
  controllers: [BlockWeeksController, WeeksController],
  providers: [WeeksService],
  exports: [WeeksService],
})
export class WeeksModule {}
