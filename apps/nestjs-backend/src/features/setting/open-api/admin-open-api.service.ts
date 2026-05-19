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
  IAdminSandboxAgentStatusVo,
  IAdminSandboxAgentTestRo,
  IAdminSandboxAgentTestVo,
  IAdminSpaceListVo,
  IAdminUpdateSpaceRo,
  IAdminUpdateUserRo,
  IAdminUserListVo,
  IAdminWorkflowRunListQuery,
  IAdminWorkflowRunListVo,
} from '@teable/openapi';
import { CollaboratorType, PluginStatus, SettingKey, UploadType } from '@teable/openapi';
import { Response } from 'express';
import { Knex } from 'knex';
import { InjectModel } from 'nest-knexjs';
import { PerformanceCacheService } from '../../../performance-cache';
import { Timing } from '../../../utils/timing';
import {
  getSandboxAgentUrl,
  syncSandboxAgentConfig,
  testSandboxAgentConfig,
} from '../../ai/sandbox-agent.client';
import { AttachmentsCropQueueProcessor } from '../../attachments/attachments-crop.processor';
import StorageAdapter from '../../attachments/plugins/adapter';
import { getPublicFullStorageUrl } from '../../attachments/plugins/utils';
import { DeleteUserService } from '../../user/delete-user/delete-user.service';
import { SettingService } from '../setting.service';

@Injectable()
export class AdminOpenApiService {
  private readonly logger = new Logger(AdminOpenApiService.name);
  private static readonly defaultPageSize = 50;

  constructor(
    private readonly prismaService: PrismaService,
    @InjectModel('CUSTOM_KNEX') private readonly knex: Knex,
    private readonly attachmentsCropQueueProcessor: AttachmentsCropQueueProcessor,
    private readonly performanceCacheService: PerformanceCacheService,
    private readonly deleteUserService: DeleteUserService,
    private readonly settingService: SettingService
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

  private getUserUpdateData(updateRo: IAdminUpdateUserRo): Prisma.UserUpdateInput {
    const data: Prisma.UserUpdateInput = {};
    if (updateRo.name !== undefined) {
      const name = updateRo.name.trim();
      if (!name) {
        throw new BadRequestException('User name is required');
      }
      data.name = name;
    }
    if (updateRo.isAdmin !== undefined) {
      data.isAdmin = updateRo.isAdmin ? true : null;
    }
    if (updateRo.deactivated !== undefined) {
      data.deactivatedTime = updateRo.deactivated ? new Date() : null;
    }
    if (updateRo.deleted !== undefined) {
      data.deletedTime = updateRo.deleted ? new Date() : null;
    }
    return data;
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

    const data = this.getUserUpdateData(updateRo);
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

  private dateFromQuery(value?: string) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }

  private getWorkflowRunDuration(run: {
    steps?: unknown;
    startedTime: Date;
    finishedTime?: Date | null;
  }) {
    const stepDuration = Array.isArray(run.steps)
      ? run.steps.reduce((sum, step) => {
          if (!step || typeof step !== 'object') return sum;
          const spent = Number((step as { spent?: unknown }).spent);
          return Number.isFinite(spent) ? sum + spent : sum;
        }, 0)
      : 0;
    if (stepDuration > 0) return stepDuration;
    if (!run.finishedTime) return null;
    return Math.max(0, run.finishedTime.getTime() - run.startedTime.getTime());
  }

  private getWorkflowRunStepCounts(steps: unknown) {
    if (!Array.isArray(steps)) {
      return { stepCount: 0, failedStepCount: 0 };
    }
    return {
      stepCount: steps.length,
      failedStepCount: steps.filter(
        (step) =>
          step && typeof step === 'object' && (step as { status?: unknown }).status === 'failed'
      ).length,
    };
  }

  private async getWorkflowRunWhere(
    query: IAdminWorkflowRunListQuery
  ): Promise<Prisma.WorkflowRunWhereInput> {
    const where: Prisma.WorkflowRunWhereInput = {
      NOT: { triggerType: 'manual' },
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.baseId) {
      where.baseId = query.baseId;
    }
    if (query.workflowId) {
      where.workflowId = query.workflowId;
    }

    const startedTime: Prisma.DateTimeFilter = {};
    const startedTimeFrom = this.dateFromQuery(query.startedTimeFrom);
    const startedTimeTo = this.dateFromQuery(query.startedTimeTo);
    if (startedTimeFrom) startedTime.gte = startedTimeFrom;
    if (startedTimeTo) startedTime.lte = startedTimeTo;
    if (startedTime.gte || startedTime.lte) {
      where.startedTime = startedTime;
    }

    const search = query.search?.trim();
    if (!search) {
      return where;
    }

    const [workflows, bases] = await Promise.all([
      this.prismaService.workflow.findMany({
        where: {
          OR: [
            { id: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { baseId: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 100,
      }),
      this.prismaService.base.findMany({
        where: {
          OR: [
            { id: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { spaceId: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 100,
      }),
    ]);

    const workflowIds = workflows.map((workflow) => workflow.id);
    const baseIds = bases.map((base) => base.id);
    where.OR = [
      { id: { contains: search, mode: 'insensitive' } },
      { workflowId: { contains: search, mode: 'insensitive' } },
      { baseId: { contains: search, mode: 'insensitive' } },
      ...(workflowIds.length ? [{ workflowId: { in: workflowIds } }] : []),
      ...(baseIds.length ? [{ baseId: { in: baseIds } }] : []),
    ];
    return where;
  }

  async listWorkflowRuns(query: IAdminWorkflowRunListQuery): Promise<IAdminWorkflowRunListVo> {
    const { skip, take } = this.getListParams(query);
    const where = await this.getWorkflowRunWhere(query);
    const summaryWhere = { ...where };
    delete summaryWhere.status;
    const [total, runs, summaryTotal, success, failed, running, waiting, skipped] =
      await this.prismaService.$transaction([
        this.prismaService.workflowRun.count({ where }),
        this.prismaService.workflowRun.findMany({
          where,
          orderBy: { startedTime: 'desc' },
          skip,
          take,
        }),
        this.prismaService.workflowRun.count({ where: summaryWhere }),
        this.prismaService.workflowRun.count({ where: { ...summaryWhere, status: 'success' } }),
        this.prismaService.workflowRun.count({ where: { ...summaryWhere, status: 'failed' } }),
        this.prismaService.workflowRun.count({ where: { ...summaryWhere, status: 'running' } }),
        this.prismaService.workflowRun.count({ where: { ...summaryWhere, status: 'waiting' } }),
        this.prismaService.workflowRun.count({ where: { ...summaryWhere, status: 'skipped' } }),
      ]);

    const workflowIds = [...new Set(runs.map((run) => run.workflowId))];
    const baseIds = [...new Set(runs.map((run) => run.baseId))];
    const userIds = [...new Set(runs.map((run) => run.createdBy).filter(Boolean))] as string[];
    const [workflows, bases, users] = await Promise.all([
      workflowIds.length
        ? this.prismaService.workflow.findMany({
            where: { id: { in: workflowIds } },
            select: { id: true, name: true },
          })
        : [],
      baseIds.length
        ? this.prismaService.base.findMany({
            where: { id: { in: baseIds } },
            select: {
              id: true,
              name: true,
              spaceId: true,
              space: { select: { id: true, name: true } },
            },
          })
        : [],
      userIds.length
        ? this.prismaService.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
    ]);

    const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
    const baseMap = new Map(bases.map((base) => [base.id, base]));
    const userMap = new Map(users.map((user) => [user.id, user]));
    return {
      total,
      summary: { total: summaryTotal, success, failed, running, waiting, skipped },
      runs: runs.map((run) => {
        const workflow = workflowMap.get(run.workflowId);
        const base = baseMap.get(run.baseId);
        const user = run.createdBy ? userMap.get(run.createdBy) : undefined;
        const { stepCount, failedStepCount } = this.getWorkflowRunStepCounts(run.steps);
        return {
          id: run.id,
          workflowId: run.workflowId,
          workflowName: workflow?.name ?? null,
          baseId: run.baseId,
          baseName: base?.name ?? null,
          spaceId: base?.spaceId ?? null,
          spaceName: base?.space?.name ?? null,
          status: run.status,
          triggerType: run.triggerType,
          error: run.error,
          startedTime: run.startedTime.toISOString(),
          finishedTime: run.finishedTime?.toISOString() ?? null,
          durationMs: this.getWorkflowRunDuration(run),
          createdBy: run.createdBy,
          createdByName: user?.name ?? null,
          createdByEmail: user?.email ?? null,
          stepCount,
          failedStepCount,
        };
      }),
    };
  }

  private async fetchSandboxAgentHealth(url: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Sandbox health check failed: ${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  async getSandboxAgentStatus(): Promise<IAdminSandboxAgentStatusVo> {
    const url = getSandboxAgentUrl();
    if (!url) {
      return {
        available: false,
        reachable: false,
        error: 'SANDBOX_AGENT_URL is not configured',
      };
    }

    try {
      const health = await this.fetchSandboxAgentHealth(url);
      return {
        available: true,
        reachable: true,
        status: typeof health.status === 'string' ? health.status : undefined,
        activeSessions:
          typeof health.activeSessions === 'number' ? health.activeSessions : undefined,
        workspaceRoot: typeof health.workspaceRoot === 'string' ? health.workspaceRoot : undefined,
        hasTeableCli: typeof health.hasTeableCli === 'boolean' ? health.hasTeableCli : undefined,
        runtimeConfig:
          health.runtimeConfig && typeof health.runtimeConfig === 'object'
            ? (health.runtimeConfig as IAdminSandboxAgentStatusVo['runtimeConfig'])
            : undefined,
        versions:
          health.versions && typeof health.versions === 'object'
            ? (health.versions as Record<string, string>)
            : undefined,
        assets:
          health.assets && typeof health.assets === 'object'
            ? (health.assets as IAdminSandboxAgentStatusVo['assets'])
            : undefined,
      };
    } catch (error) {
      return {
        available: true,
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async syncSandboxAgent(): Promise<IAdminSandboxAgentStatusVo> {
    const url = getSandboxAgentUrl();
    if (!url) {
      return this.getSandboxAgentStatus();
    }
    const { sandboxAgentConfig } = await this.settingService.getSetting([
      SettingKey.SANDBOX_AGENT_CONFIG,
    ]);
    await syncSandboxAgentConfig(url, sandboxAgentConfig ?? undefined);
    return this.getSandboxAgentStatus();
  }

  async testSandboxAgentLLM(
    sandboxAgentConfig: IAdminSandboxAgentTestRo
  ): Promise<IAdminSandboxAgentTestVo> {
    const url = getSandboxAgentUrl();
    if (!url) {
      return {
        success: false,
        error: 'SANDBOX_AGENT_URL is not configured',
      };
    }

    try {
      return await testSandboxAgentConfig(url, sandboxAgentConfig);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
