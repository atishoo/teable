import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MailSenderModule } from '../mail-sender/mail-sender.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { RecordModule } from '../record/record.module';
import { AutomationController, AutomationWebhookController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [RecordModule, RecordOpenApiModule, MailSenderModule.register(), AiModule],
  controllers: [AutomationController, AutomationWebhookController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
