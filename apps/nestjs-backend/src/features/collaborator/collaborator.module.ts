import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { CollaboratorController } from './collaborator.controller';
import { CollaboratorService } from './collaborator.service';

@Module({
  imports: [NotificationModule],
  providers: [CollaboratorService],
  controllers: [CollaboratorController],
  exports: [CollaboratorService],
})
export class CollaboratorModule {}
