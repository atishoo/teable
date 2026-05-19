import { Module } from '@nestjs/common';
import { AccessTokenModule } from '../access-token/access-token.module';
import { SettingModule } from '../setting/setting.module';
import { AiController, BaseChatController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [SettingModule, AccessTokenModule],
  controllers: [AiController, BaseChatController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
