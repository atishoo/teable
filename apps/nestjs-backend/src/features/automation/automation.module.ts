import { Module } from '@nestjs/common';
import { MailSenderModule } from '../mail-sender/mail-sender.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { RecordModule } from '../record/record.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [RecordModule, RecordOpenApiModule, MailSenderModule.register()],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
