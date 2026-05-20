import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  aiGenerateRoSchema,
  baseChatGateResponseRoSchema,
  createBaseChatRoSchema,
  IBaseChatGateResponseRo,
  ICreateBaseChatRo,
  IAiGenerateRo,
  ISendBaseChatMessageRo,
  IUploadBaseChatAttachmentVo,
  IUpsertAiChatMessageRo,
  sendBaseChatMessageRoSchema,
  upsertAiChatMessageRoSchema,
} from '@teable/openapi';
import { Response } from 'express';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { TablePipe } from '../table/open-api/table.pipe';
import { AiService } from './ai.service';

@Controller('api/:baseId/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('/generate-stream')
  @Permissions('base|read')
  async generateStream(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(aiGenerateRoSchema), TablePipe) aiGenerateRo: IAiGenerateRo,
    @Res() res: Response
  ) {
    await this.aiService.generateStream(baseId, aiGenerateRo, res);
  }

  @Get('/config')
  @Permissions('base|read')
  async getAIConfig(@Param('baseId') baseId: string) {
    return await this.aiService.getSimplifiedAIConfig(baseId);
  }

  @Get('/disable-ai-actions')
  @Permissions('base|read')
  async getAIDisableAIActions(@Param('baseId') baseId: string) {
    return await this.aiService.getAIDisableAIActions(baseId);
  }

  @Get('/chat-history')
  @Permissions('base|read')
  async getChatHistory(@Param('baseId') baseId: string) {
    return await this.aiService.getChatHistory(baseId);
  }

  @Post('/chat-message')
  @HttpCode(200)
  @Permissions('base|read')
  async upsertChatMessage(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(upsertAiChatMessageRoSchema)) upsertRo: IUpsertAiChatMessageRo
  ) {
    return await this.aiService.upsertChatMessage(baseId, upsertRo);
  }

  @Delete('/chat/:chatId')
  @Permissions('base|read')
  async deleteChat(@Param('baseId') baseId: string, @Param('chatId') chatId: string) {
    return await this.aiService.deleteChat(baseId, chatId);
  }
}

@Controller('api/base/:baseId/chat')
export class BaseChatController {
  constructor(private readonly aiService: AiService) {}

  @Post('/create')
  @Permissions('base|read')
  async createChat(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(createBaseChatRoSchema)) createRo: ICreateBaseChatRo
  ) {
    return await this.aiService.createBaseChat(baseId, createRo);
  }

  @Get('/history')
  @Permissions('base|read')
  async getHistory(@Param('baseId') baseId: string) {
    return await this.aiService.getBaseChatHistory(baseId);
  }

  @Get('/:chatId/messages')
  @Permissions('base|read')
  async getMessages(
    @Param('baseId') baseId: string,
    @Param('chatId') chatId: string,
    @Query('limit') limit?: string
  ) {
    return await this.aiService.getBaseChatMessages(baseId, chatId, limit);
  }

  @Post('/:chatId/send')
  @Permissions('base|read')
  async sendMessage(
    @Param('baseId') baseId: string,
    @Param('chatId') chatId: string,
    @Body(new ZodValidationPipe(sendBaseChatMessageRoSchema)) sendRo: ISendBaseChatMessageRo,
    @Res() res: Response
  ) {
    await this.aiService.sendBaseChatMessage(baseId, chatId, sendRo, res);
  }

  @Post('/:chatId/attachment')
  @Permissions('base|read')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    })
  )
  async uploadAttachment(
    @Param('baseId') baseId: string,
    @Param('chatId') chatId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('text') text?: string,
    @Body('thumbnailUrl') thumbnailUrl?: string,
    @Body('typeLabel') typeLabel?: string
  ): Promise<IUploadBaseChatAttachmentVo> {
    return await this.aiService.uploadBaseChatAttachment(baseId, chatId, file, {
      text,
      thumbnailUrl,
      typeLabel,
    });
  }

  @Post('/:chatId/interrupt')
  @Permissions('base|read')
  async interrupt(@Param('baseId') baseId: string, @Param('chatId') chatId: string) {
    return await this.aiService.interruptBaseChat(baseId, chatId);
  }

  @Post('/:chatId/gate-response')
  @Permissions('base|read')
  async gateResponse(
    @Param('baseId') baseId: string,
    @Param('chatId') chatId: string,
    @Body(new ZodValidationPipe(baseChatGateResponseRoSchema)) gateRo: IBaseChatGateResponseRo
  ) {
    return await this.aiService.respondBaseChatGate(baseId, chatId, gateRo);
  }

  @Delete('/:chatId')
  @Permissions('base|read')
  async deleteChat(@Param('baseId') baseId: string, @Param('chatId') chatId: string) {
    return await this.aiService.deleteChat(baseId, chatId);
  }
}
