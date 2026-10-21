import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlockAssignmentsService } from './block-assignments.service';
import { TrainingService } from './training.service';
import { BlockAssignmentsController } from './block-assignments.controller';
@Module({
  imports: [AuthModule],
  controllers: [BlockAssignmentsController],
  providers: [BlockAssignmentsService, TrainingService],
  exports: [TrainingService],
})
export class BlockAssignmentsModule {}
