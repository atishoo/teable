/* eslint-disable sonarjs/no-duplicate-string */
import { Session } from 'node:inspector';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';
import type {
  IAdminListQuery,
  IAdminSpaceListVo,
  IAdminUpdateSpaceRo,
  IAdminUpdateUserRo,
  IAdminUserListVo,
} from '@teable/openapi';
import { CollaboratorType, PluginStatus, UploadType } from '@teable/openapi';
import { Response } from 'express';
import { Knex } from 'knex';
import { InjectModel } from 'nest-knexjs';
import { PerformanceCacheService } from '../../../performance-cache';
import { Timing } from '../../../utils/timing';
import { AttachmentsCropQueueProcessor } from '../../attachments/attachments-crop.processor';
import StorageAdapter from '../../attachments/plugins/adapter';
import { getPublicFullStorageUrl } from '../../attachments/plugins/utils';
import { DeleteUserService } from '../../user/delete-user/delete-user.service';

@Injectable()
export class AdminOpenApiService {
  private readonly logger = new Logger(AdminOpenApiService.name);
  private static readonly defaultPageSize = 50;

  constructor(
    private readonly prismaService: PrismaService,
    @InjectModel('CUSTOM_KNEX') private readonly knex: Knex,
    private readonly attachmentsCropQueueProcessor: AttachmentsCropQueueProcessor,
    private readonly performanceCacheService: PerformanceCacheService,
    private readonly deleteUserService: DeleteUserService
  ) {}

  private getListParams(query: IAdminListQuery = {}) {
    return {
      search: query.search?.trim(),
      skip: query.skip ?? 0,
      take: query.take ?? AdminOpenApiService.defaultPageSize,
    };
  }

  private toIso(value?: Date | null) {
    return value?.toISOString() ?? null;
  }

  async listUsers(query: IAdminListQuery): Promise<IAdminUserListVo> {
    const { search, skip, take } = this.getListParams(query);
    const where: Prisma.UserWhereInput = {
      isSystem: null,
      permanentDeletedTime: null,
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          isAdmin: true,
          deactivatedTime: true,
          deletedTime: true,
          lastSignTime: true,
          createdTime: true,
        },
        orderBy: { createdTime: 'desc' },
        skip,
        take,
      }),
      this.prismaService.user.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar ? getPublicFullStorageUrl(user.avatar) : null,
        isAdmin: user.isAdmin,
        deactivatedTime: this.toIso(user.deactivatedTime),
        deletedTime: this.toIso(user.deletedTime),
        lastSignTime: this.toIso(user.lastSignTime),
        createdTime: user.createdTime.toISOString(),
      })),
      total,
    };
  }

  private async ensureAnotherActiveAdmin(userId: string) {
    const activeAdminCount = await this.prismaService.user.count({
      where: {
        id: { not: userId },
        isAdmin: true,
        isSystem: null,
        deletedTime: null,
        deactivatedTime: null,
      },
    });

    if (activeAdminCount === 0) {
      throw new BadRequestException('At least one active admin is required');
    }
  }

  private isUserAccessRemoval(updateRo: IAdminUpdateUserRo) {
    return Boolean(
      updateRo.deactivated ||
        updateRo.deleted ||
        updateRo.permanentDeleted ||
        updateRo.isAdmin === false
    );
  }

  private shouldEnsureAnotherActiveAdmin(
    targetUser: { isAdmin?: boolean | null; deletedTime?: Date | null },
    updateRo: IAdminUpdateUserRo
  ) {
    return Boolean(
      targetUser.isAdmin && !targetUser.deletedTime && this.isUserAccessRemoval(updateRo)
    );
  }

  async updateUser(
    userId: string,
    updateRo: IAdminUpdateUserRo,
    actorUserId?: string
  ): Promise<void> {
    const targetUser = await this.prismaService.user.findFirst({
      where: { id: userId, permanentDeletedTime: null, isSystem: null },
      select: { id: true, isAdmin: true, deactivatedTime: true, deletedTime: true },
    });

    if (!targetUser) {
      throw new BadRequestException('User not found');
    }

    if (userId === actorUserId && this.isUserAccessRemoval(updateRo)) {
      throw new BadRequestException('Cannot remove your own admin access');
    }

    if (this.shouldEnsureAnotherActiveAdmin(targetUser, updateRo)) {
      await this.ensureAnotherActiveAdmin(userId);
    }

    if (updateRo.permanentDeleted) {
      await this.deleteUserService.deleteUserById(userId, { skipCollaboratorValidation: true });
      return;
    }

    const data: Prisma.UserUpdateInput = {};
    if (updateRo.isAdmin !== undefined) {
      data.isAdmin = updateRo.isAdmin ? true : null;
    }
    if (updateRo.deactivated !== undefined) {
      data.deactivatedTime = updateRo.deactivated ? new Date() : null;
    }
    if (updateRo.deleted !== undefined) {
      data.deletedTime = updateRo.deleted ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return;
    }

    await this.prismaService.user.update({
      where: { id: userId },
      data,
    });
  }

  async listSpaces(query: IAdminListQuery): Promise<IAdminSpaceListVo> {
    const { search, skip, take } = this.getListParams(query);
    const where: Prisma.SpaceWhereInput = {
      isTemplate: null,
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [spaces, total] = await Promise.all([
      this.prismaService.space.findMany({
        where,
        select: {
          id: true,
          name: true,
          createdBy: true,
          deletedTime: true,
          enableAutoJoin: true,
          createdTime: true,
          _count: {
            select: {
              baseGroup: true,
            },
          },
        },
        orderBy: { createdTime: 'desc' },
        skip,
        take,
      }),
      this.prismaService.space.count({ where }),
    ]);

    const spaceIds = spaces.map((space) => space.id);
    const creatorIds = [...new Set(spaces.map((space) => space.createdBy))];
    const [creators, collaboratorCounts] = await Promise.all([
      this.prismaService.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true },
      }),
      spaceIds.length
        ? this.prismaService.collaborator.groupBy({
            by: ['resourceId'],
            where: {
              resourceType: CollaboratorType.Space,
              resourceId: { in: spaceIds },
            },
            _count: { _all: true },
          })
        : [],
    ]);

    const creatorMap = new Map(creators.map((user) => [user.id, user]));
    const collaboratorCountMap = new Map(
      collaboratorCounts.map((item) => [item.resourceId, item._count._all])
    );

    return {
      spaces: spaces.map((space) => {
        const creator = creatorMap.get(space.createdBy);
        return {
          id: space.id,
          name: space.name,
          createdBy: space.createdBy,
          createdByName: creator?.name ?? null,
          createdByEmail: creator?.email ?? null,
          baseCount: space._count.baseGroup,
          collaboratorCount: collaboratorCountMap.get(space.id) ?? 0,
          enableAutoJoin: space.enableAutoJoin,
          deletedTime: this.toIso(space.deletedTime),
          createdTime: space.createdTime.toISOString(),
        };
      }),
      total,
    };
  }

  async updateSpace(
    spaceId: string,
    updateRo: IAdminUpdateSpaceRo,
    actorUserId?: string
  ): Promise<void> {
    const space = await this.prismaService.space.findFirst({
      where: { id: spaceId, isTemplate: null },
      select: { id: true },
    });

    if (!space) {
      throw new BadRequestException('Space not found');
    }

    const data: Prisma.SpaceUpdateInput = {
      lastModifiedBy: actorUserId,
    };
    if (updateRo.deleted !== undefined) {
      data.deletedTime = updateRo.deleted ? new Date() : null;
    }
    if (updateRo.enableAutoJoin !== undefined) {
      data.enableAutoJoin = updateRo.enableAutoJoin;
    }

    await this.prismaService.space.update({
      where: { id: spaceId },
      data,
    });
  }

  async publishPlugin(pluginId: string) {
    return this.prismaService.plugin.update({
      where: { id: pluginId, status: PluginStatus.Reviewing },
      data: { status: PluginStatus.Published },
    });
  }

  async unpublishPlugin(pluginId: string) {
    return this.prismaService.plugin.update({
      where: { id: pluginId, status: PluginStatus.Published },
      data: { status: PluginStatus.Developing },
    });
  }

  async repairTableAttachmentThumbnail() {
    const take = 1000;
    let total = 0;
    let lastToken: string | null = null;
    for (;;) {
      const query = this.knex('attachments_table')
        .select(
          'attachments.token',
          'attachments.height',
          'attachments.mimetype',
          'attachments.path'
        )
        .leftJoin('attachments', 'attachments_table.token', 'attachments.token')
        .where((qb) =>
          qb
            .where((image) =>
              image
                .where('attachments.mimetype', 'like', 'image/%')
                .whereNotNull('attachments.height')
            )
            .orWhereIn('attachments.mimetype', ['application/pdf', 'application/x-pdf'])
        )
        .whereNull('attachments.deleted_time')
        .whereNull('attachments.thumbnail_path')
        .groupBy(
          'attachments.token',
          'attachments.height',
          'attachments.mimetype',
          'attachments.path'
        )
        .orderBy('attachments.token')
        .limit(take);
      if (lastToken) {
        query.where('attachments.token', '>', lastToken);
      }
      const sqlNative = query.toSQL().toNative();
      const attachments = await this.prismaService.$queryRawUnsafe<
        { token: string; height?: number; mimetype: string; path: string }[]
      >(sqlNative.sql, ...sqlNative.bindings);
      this.logger.log('attachments', attachments, sqlNative.sql);
      if (attachments.length === 0) {
        break;
      }
      lastToken = attachments[attachments.length - 1].token;
      total += attachments.length;
      await this.attachmentsCropQueueProcessor.queue.addBulk(
        attachments.map((attachment) => ({
          name: 'admin_attachment_crop_image',
          data: {
            ...attachment,
            bucket: StorageAdapter.getBucket(UploadType.Table),
          },
        }))
      );
      this.logger.log(`Processed ${attachments.length} attachments`);
    }
    this.logger.log(`Total processed ${total} attachments`);
  }

  @Timing()
  async getHeapSnapshot(res: Response) {
    const podName = process.env.HOSTNAME || 'unknown';
    const session = new Session();
    const timestamp = new Date().toISOString();
    const filename = `heap-${podName}-${timestamp}.heapsnapshot`;
    try {
      const snapshotStream = new Readable({
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        read() {},
      });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      session.connect();
      session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
        snapshotStream.push(m.params.chunk);
      });

      const snapshotPromise = new Promise<void>((resolve, reject) => {
        session.post('HeapProfiler.takeHeapSnapshot', undefined, (err) => {
          if (err) {
            reject(err);
          } else {
            snapshotStream.push(null);
            resolve();
          }
        });
      });

      snapshotStream.on('error', (error) => {
        this.logger.error(`Stream error for pod ${podName}:`, error);
        throw new InternalServerErrorException(`Stream error: ${error.message}`);
      });

      snapshotStream.pipe(res);

      await new Promise<void>((resolve, reject) => {
        res.on('finish', () => {
          this.logger.log(`Heap snapshot streaming completed for pod ${podName}`);
          resolve();
        });

        res.on('error', (error) => {
          this.logger.error(`Response error for pod ${podName}:`, error);
          reject(error);
        });

        snapshotStream.on('error', reject);
      });

      await snapshotPromise;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Failed to get heap snapshot: ${error.message}, podName: ${podName}, timestamp: ${timestamp}`
      );
    } finally {
      session.disconnect();
      this.logger.log(`Session disconnected for pod ${podName}`);
    }
  }

  async getPerformanceCache() {
    return {
      stats: this.performanceCacheService.getStats(),
      typeStats: this.performanceCacheService.getTypeStats(),
    };
  }

  async deletePerformanceCache(key?: string) {
    if (!key) {
      throw new BadRequestException('key is required');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.performanceCacheService.del(key as any);
  }
}
