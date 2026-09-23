import { Module } from '@nestjs/common';
import { SetLogsController } from './set-logs.controller';
import { SetLogsService } from './set-logs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SetLogsController],
  providers: [SetLogsService],
})
export class SetLogsModule {}
