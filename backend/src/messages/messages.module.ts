import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoachingModule } from '../coaching/coaching.module';
import {
  LocalStorageService,
  StorageService,
} from '../storage/storage.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
@Module({
  imports: [AuthModule, CoachingModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    { provide: StorageService, useClass: LocalStorageService },
  ],
})
export class MessagesModule {}
