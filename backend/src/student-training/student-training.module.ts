import { Module } from '@nestjs/common';
import { StudentTrainingController } from './student-training.controller';
import { StudentTrainingService } from './student-training.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StudentTrainingController],
  providers: [StudentTrainingService],
  exports: [StudentTrainingService],
})
export class StudentTrainingModule {}
