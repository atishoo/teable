import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { IAdminListQuery, IAdminUpdateSpaceRo, IAdminUpdateUserRo } from '@teable/openapi';
import {
  adminListQuerySchema,
  adminUpdateSpaceRoSchema,
  adminUpdateUserRoSchema,
} from '@teable/openapi';
import { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../../types/cls';
import { ZodValidationPipe } from '../../../zod.validation.pipe';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { AdminOpenApiService } from './admin-open-api.service';

@Controller('api/admin')
@Permissions('instance|update')
export class AdminOpenApiController {
  constructor(
    private readonly adminService: AdminOpenApiService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get('/users')
  async listUsers(@Query(new ZodValidationPipe(adminListQuerySchema)) query: IAdminListQuery) {
    return await this.adminService.listUsers(query);
  }

  @Patch('/users/:userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(adminUpdateUserRoSchema))
    updateRo: IAdminUpdateUserRo
  ): Promise<void> {
    await this.adminService.updateUser(userId, updateRo, this.cls.get('user.id'));
  }

  @Get('/spaces')
  async listSpaces(@Query(new ZodValidationPipe(adminListQuerySchema)) query: IAdminListQuery) {
    return await this.adminService.listSpaces(query);
  }

  @Patch('/spaces/:spaceId')
  async updateSpace(
    @Param('spaceId') spaceId: string,
    @Body(new ZodValidationPipe(adminUpdateSpaceRoSchema))
    updateRo: IAdminUpdateSpaceRo
  ): Promise<void> {
    await this.adminService.updateSpace(spaceId, updateRo, this.cls.get('user.id'));
  }

  @Patch('/plugin/:pluginId/publish')
  async publishPlugin(@Param('pluginId') pluginId: string): Promise<void> {
    await this.adminService.publishPlugin(pluginId);
  }

  @Patch('/plugin/:pluginId/unpublish')
  async unpublishPlugin(@Param('pluginId') pluginId: string): Promise<void> {
    await this.adminService.unpublishPlugin(pluginId);
  }

  @Post('/attachment/repair-table-thumbnail')
  async repairTableAttachmentThumbnail(): Promise<void> {
    await this.adminService.repairTableAttachmentThumbnail();
  }

  @Get('/debug/heap-snapshot')
  async getHeapSnapshot(@Res() res: Response): Promise<void> {
    await this.adminService.getHeapSnapshot(res);
  }

  @Get('performance-cache-stats')
  async getPerformanceCache() {
    return await this.adminService.getPerformanceCache();
  }

  @Delete('performance-cache')
  async deletePerformanceCache(@Query('key') key?: string) {
    return await this.adminService.deletePerformanceCache(key);
  }
}
