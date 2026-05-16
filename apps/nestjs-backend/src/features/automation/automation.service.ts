import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  FieldKeyType,
  generateWorkflowActionId,
  generateWorkflowDecisionId,
  generateWorkflowId,
  generateWorkflowTriggerId,
  HttpErrorCode,
} from '@teable/core';
import type { IRecord } from '@teable/core';
import { Prisma, PrismaService } from '@teable/db-main-prisma';
import {
  AIActions,
  Task,
  type IActiveWorkflowRo,
  type ICreateWorkflowGraphNodeRo,
  type IUpdateWorkflowGraphNodeRo,
  type IUpdateWorkflowRo,
  type IMailTransportConfig,
  type IWorkflowManualTestRo,
  type IWorkflowEdge,
  type IWorkflowNode,
  type IWorkflowRo,
} from '@teable/openapi';
import { isPlainObject } from 'lodash';
import get from 'lodash/get';
import { nanoid } from 'nanoid';
import { ClsService } from 'nestjs-cls';
import { CustomHttpException } from '../../custom.exception';
import { Events, RecordCreateEvent, RecordUpdateEvent } from '../../event-emitter/events';
import type { ButtonClickEvent } from '../../event-emitter/events/table/button.event';
import type { IClsStore } from '../../types/cls';
import { AiService } from '../ai/ai.service';
import { MailSenderService } from '../mail-sender/mail-sender.service';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';
import { RecordService } from '../record/record.service';

type IWorkflowCategory = 'trigger' | 'action' | 'logic';
type IWorkflowRunStatus = 'running' | 'success' | 'failed' | 'skipped' | 'waiting';
type IRuntimeStepStatus = 'success' | 'failed' | 'skipped';

interface IWorkflowRunListQuery {
  skip?: string;
  take?: string;
  status?: string;
  duration?: string;
  startedTimeFrom?: string;
  startedTimeTo?: string;
}

interface IWorkflowSnapshot {
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
}

interface IRuntimeContext {
  baseId: string;
  preview?: boolean;
  trigger: Record<string, unknown>;
  nodes: Record<string, unknown>;
  action: Record<string, unknown>;
  logic: Record<string, unknown>;
}

interface IRuntimeStep {
  nodeId: string;
  type: string;
  category: IWorkflowNode['category'];
  status: IRuntimeStepStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  spent?: number;
}

interface IOperationRecordsCreateEvent {
  reqParams?: {
    tableId?: string;
  };
  reqUser?: {
    id?: string;
    name?: string;
    email?: string;
  };
  resolveData?: unknown;
}

interface IReceiveWebhookPayload {
  body: unknown;
  authorization?: string;
}

const webhookTriggerNotFound = 'Webhook trigger not found';
const webhookTriggerNotFoundI18nKey = 'httpErrors.automation.webhookTriggerNotFound';
const httpContentTypeHeader = 'content-type';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly recordOpenApiService: RecordOpenApiService,
    private readonly recordService: RecordService,
    private readonly mailSenderService: MailSenderService,
    private readonly aiService: AiService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  async list(baseId: string, onlyFirst?: boolean) {
    const workflows = await this.prismaService.workflow.findMany({
      where: { baseId, deletedTime: null },
      orderBy: { createdTime: 'asc' },
      take: onlyFirst ? 1 : undefined,
    });
    return workflows.map((workflow) => this.toVo(workflow));
  }

  async create(baseId: string, ro: IWorkflowRo) {
    const nodes = ro.nodes ?? this.nodesFromTrigger(ro.trigger);
    const workflow = await this.prismaService.workflow.create({
      data: {
        id: generateWorkflowId(),
        name: ro.name ?? '新自动化',
        description: ro.description,
        baseId,
        trigger: this.getTriggerFromNodes(nodes) as Prisma.InputJsonValue | undefined,
        nodes: nodes as Prisma.InputJsonValue,
        edges: (ro.edges ?? []) as Prisma.InputJsonValue,
        createdBy: this.userId(),
      },
    });
    return this.toVo(workflow);
  }

  async get(baseId: string, workflowId: string) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    return this.toVo(workflow);
  }

  async update(baseId: string, workflowId: string, ro: IUpdateWorkflowRo) {
    await this.findWorkflow(baseId, workflowId);
    const nodes = ro.nodes;
    const data: Prisma.WorkflowUpdateInput = {
      ...(ro.name === undefined ? {} : { name: ro.name }),
      ...(ro.description === undefined ? {} : { description: ro.description }),
      ...(nodes === undefined ? {} : { nodes: nodes as Prisma.InputJsonValue }),
      ...(ro.edges === undefined ? {} : { edges: ro.edges as Prisma.InputJsonValue }),
      ...(nodes === undefined
        ? {}
        : { trigger: this.getTriggerFromNodes(nodes) as Prisma.InputJsonValue | undefined }),
      ...(ro.isActive === undefined ? {} : { isActive: ro.isActive }),
      lastModifiedBy: this.userId(),
    };
    const workflow = await this.prismaService.workflow.update({ where: { id: workflowId }, data });
    return this.toVo(workflow);
  }

  async delete(baseId: string, workflowId: string) {
    await this.findWorkflow(baseId, workflowId);
    await this.prismaService.workflow.update({
      where: { id: workflowId },
      data: { deletedTime: new Date(), isActive: false, lastModifiedBy: this.userId() },
    });
    return { workflowId };
  }

  async updateActive(baseId: string, workflowId: string, ro: IActiveWorkflowRo) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    const snapshot = this.getDraftSnapshot(workflow);

    if (ro.method === 'activate') {
      this.assertActivatable(snapshot);
      const activeSnapshot = {
        ...snapshot,
        activatedAt: new Date().toISOString(),
        activatedBy: this.userId(),
      };
      const updated = await this.prismaService.workflow.update({
        where: { id: workflowId },
        data: {
          activeSnapshot: activeSnapshot as Prisma.InputJsonValue,
          activeTime: new Date(),
          activeBy: this.userId(),
          isActive: true,
          lastModifiedBy: this.userId(),
        },
      });
      return this.toVo(updated);
    }

    if (ro.method === 'discard') {
      const activeSnapshot = this.getActiveSnapshotGraph(workflow);
      const updated = await this.prismaService.workflow.update({
        where: { id: workflowId },
        data: {
          nodes: activeSnapshot.nodes as Prisma.InputJsonValue,
          edges: activeSnapshot.edges as Prisma.InputJsonValue,
          trigger: this.getTriggerFromNodes(activeSnapshot.nodes) as
            | Prisma.InputJsonValue
            | undefined,
          lastModifiedBy: this.userId(),
        },
      });
      return this.toVo(updated);
    }

    const updated = await this.prismaService.workflow.update({
      where: { id: workflowId },
      data: { isActive: false, lastModifiedBy: this.userId() },
    });
    return this.toVo(updated);
  }

  async getActiveSnapshot(baseId: string, workflowId: string) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    if (!workflow.activeSnapshot) {
      throw new CustomHttpException(
        `No active snapshot found for workflow ${workflowId}`,
        HttpErrorCode.NOT_FOUND,
        { localization: { i18nKey: 'httpErrors.automation.noActiveSnapshot' } }
      );
    }
    const snapshot = this.getActiveSnapshotGraph(workflow);
    return this.toVo({ ...workflow, nodes: snapshot.nodes, edges: snapshot.edges });
  }

  async createNode(
    baseId: string,
    workflowId: string,
    category: IWorkflowCategory,
    ro: ICreateWorkflowGraphNodeRo
  ) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    const snapshot = this.getDraftSnapshot(workflow);
    const node = this.makeNode(category, ro);
    const nodes =
      category === 'trigger'
        ? [node, ...snapshot.nodes.filter((item) => item.category !== 'trigger')]
        : [...snapshot.nodes, node];
    const removedNodeIds = new Set(
      category === 'trigger'
        ? snapshot.nodes.filter((item) => item.category === 'trigger').map((item) => item.id)
        : []
    );
    const edges = snapshot.edges.filter(
      (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
    );
    if (ro.parentNodeId) {
      edges.push({ source: ro.parentNodeId, target: node.id });
    }
    await this.saveGraph(workflowId, nodes, edges);
    return node;
  }

  async updateNode(
    baseId: string,
    workflowId: string,
    category: IWorkflowCategory,
    nodeId: string,
    ro: IUpdateWorkflowGraphNodeRo
  ) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    const snapshot = this.getDraftSnapshot(workflow);
    let updatedNode: IWorkflowNode | undefined;
    const nodes = snapshot.nodes.map((node) => {
      if (node.id !== nodeId || node.category !== category) return node;
      updatedNode = {
        ...node,
        ...(ro.name === undefined ? {} : { name: ro.name }),
        ...(ro.description === undefined ? {} : { description: ro.description }),
        ...(ro.config === undefined ? {} : { config: ro.config }),
        lastModifiedBy: this.userId(),
        lastModifiedTime: new Date().toISOString(),
      };
      return updatedNode;
    });
    if (!updatedNode) {
      throw new CustomHttpException('Workflow node not found', HttpErrorCode.NOT_FOUND);
    }
    await this.saveGraph(workflowId, nodes, snapshot.edges);
    return updatedNode;
  }

  async generateWebhookToken(baseId: string, workflowId: string, nodeId: string) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    const triggerNode = this.getDraftSnapshot(workflow).nodes.find(
      (node) => node.id === nodeId && node.category === 'trigger'
    );
    if (!triggerNode || triggerNode.type !== 'webhook') {
      throw new CustomHttpException(webhookTriggerNotFound, HttpErrorCode.NOT_FOUND, {
        localization: { i18nKey: webhookTriggerNotFoundI18nKey },
      });
    }
    return {
      token: `whk-${randomBytes(32).toString('hex')}`,
      secret: randomBytes(24).toString('base64url'),
    };
  }

  async deleteNode(
    baseId: string,
    workflowId: string,
    category: IWorkflowCategory,
    nodeId: string
  ) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    const snapshot = this.getDraftSnapshot(workflow);
    const nodes = snapshot.nodes.filter(
      (node) => !(node.id === nodeId && node.category === category)
    );
    const edges = snapshot.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    await this.saveGraph(workflowId, nodes, edges);
    return { nodeId };
  }

  async runManualTest(
    baseId: string,
    workflowId: string,
    nodeId?: string,
    ro?: IWorkflowManualTestRo
  ) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    const snapshot = this.getDraftSnapshot(workflow);
    const selectedNode = nodeId ? snapshot.nodes.find((node) => node.id === nodeId) : undefined;
    if (nodeId && !selectedNode) {
      throw new CustomHttpException('Workflow node not found', HttpErrorCode.NOT_FOUND);
    }
    const triggerNode =
      selectedNode?.category === 'trigger'
        ? selectedNode
        : snapshot.nodes.find((node) => node.category === 'trigger');
    const trigger = await this.getManualTestTrigger(baseId, workflowId, triggerNode, ro);
    return this.runSnapshot(workflow, snapshot, {
      triggerType: 'manual',
      trigger,
      startNodeId: selectedNode?.id ?? triggerNode?.id,
      stopNodeId: selectedNode?.id,
      preview: ro?.preview,
      runtimeSeed: selectedNode
        ? this.getManualNodeTestRuntimeSeed(snapshot, selectedNode.id)
        : undefined,
    });
  }

  private async getManualTestTrigger(
    baseId: string,
    workflowId: string,
    triggerNode?: IWorkflowNode,
    ro?: IWorkflowManualTestRo
  ) {
    const testedTrigger = this.getNodeTestTrigger(triggerNode);
    if (testedTrigger && !ro?.recordId) return testedTrigger;

    if (triggerNode?.category === 'trigger' && triggerNode.type === 'webhook') return { body: {} };

    const trigger: Record<string, unknown> = { baseId, workflowId, manual: true };
    const tableId = this.optionalString(triggerNode?.config?.tableId);
    if (!tableId || !ro?.recordId) return trigger;

    const record = await this.recordService.getRecord(
      tableId,
      ro.recordId,
      { fieldKeyType: FieldKeyType.Id },
      true,
      true
    );
    return this.withTriggerMetadata(
      {
        ...trigger,
        tableId,
        record,
        user: this.triggerUser(),
      },
      baseId
    );
  }

  private getNodeTestTrigger(triggerNode?: IWorkflowNode) {
    const step = this.getValidNodeTestStep(triggerNode);
    if (!step || !isPlainObject(step.output)) return undefined;
    return step.output as Record<string, unknown>;
  }

  private getManualNodeTestRuntimeSeed(snapshot: IWorkflowSnapshot, nodeId: string) {
    const upstreamNodeIds = this.getUpstreamNodeIds(snapshot, nodeId);
    const runtimeSeed: Pick<IRuntimeContext, 'nodes' | 'action' | 'logic'> = {
      nodes: {},
      action: {},
      logic: {},
    };

    for (const node of snapshot.nodes) {
      if (!upstreamNodeIds.has(node.id)) continue;
      const output = this.getValidNodeTestStep(node)?.output;
      if (output === undefined) continue;
      if (node.category === 'action') {
        runtimeSeed.nodes[node.id] = output;
        runtimeSeed.action[node.id] = output;
      }
      if (node.category === 'logic') {
        runtimeSeed.nodes[node.id] = output;
        runtimeSeed.logic[node.id] = output;
      }
    }

    return runtimeSeed;
  }

  private getUpstreamNodeIds(snapshot: IWorkflowSnapshot, nodeId: string) {
    const upstreamNodeIds = new Set<string>();
    const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const expandedConditionMergeIds = new Set<string>();
    const getConditionBranchNodeIds = (conditionNodeId: string, stopNodeId: string) => {
      const branchNodeIds = new Set<string>();
      const stack = snapshot.edges
        .filter((edge) => edge.source === conditionNodeId && edge.sourceHandle)
        .map((edge) => edge.target);

      while (stack.length) {
        const branchNodeId = stack.pop()!;
        if (branchNodeId === stopNodeId || branchNodeIds.has(branchNodeId)) continue;
        branchNodeIds.add(branchNodeId);
        snapshot.edges
          .filter((edge) => edge.source === branchNodeId)
          .forEach((edge) => {
            stack.push(edge.target);
          });
      }

      return branchNodeIds;
    };
    const visit = (target: string) => {
      snapshot.edges
        .filter((edge) => edge.target === target)
        .forEach((edge) => {
          const isVisited = upstreamNodeIds.has(edge.source);
          if (!isVisited) upstreamNodeIds.add(edge.source);
          const sourceNode = nodeById.get(edge.source);
          const conditionMergeId = `${edge.source}:${edge.target}`;
          if (
            sourceNode?.type === 'condition' &&
            !edge.sourceHandle &&
            !expandedConditionMergeIds.has(conditionMergeId)
          ) {
            expandedConditionMergeIds.add(conditionMergeId);
            getConditionBranchNodeIds(edge.source, edge.target).forEach((branchNodeId) => {
              if (upstreamNodeIds.has(branchNodeId)) return;
              upstreamNodeIds.add(branchNodeId);
              visit(branchNodeId);
            });
          }
          if (isVisited) return;
          visit(edge.source);
        });
    };
    visit(nodeId);
    return upstreamNodeIds;
  }

  private getValidNodeTestStep(node?: IWorkflowNode) {
    if (!node) return;
    const testResult = isPlainObject(node.testResult)
      ? (node.testResult as Record<string, unknown>)
      : undefined;
    if (testResult?.signature !== this.getNodeSignature(node)) return;
    return isPlainObject(testResult?.step) ? (testResult.step as Partial<IRuntimeStep>) : undefined;
  }

  private getNodeSignature(node: IWorkflowNode) {
    return JSON.stringify(
      this.stableJsonValue({
        type: node.type,
        category: node.category,
        config: node.config ?? {},
      })
    );
  }

  private stableJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.stableJsonValue(item));
    if (!isPlainObject(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, this.stableJsonValue(record[key])])
    );
  }

  async receiveWebhook(baseId: string, workflowId: string, payload: IReceiveWebhookPayload) {
    const workflow = await this.prismaService.workflow.findFirst({
      where: { id: workflowId, baseId, isActive: true, deletedTime: null },
    });
    if (!workflow) {
      throw new CustomHttpException(webhookTriggerNotFound, HttpErrorCode.NOT_FOUND, {
        localization: { i18nKey: webhookTriggerNotFoundI18nKey },
      });
    }

    const snapshot = this.getActiveSnapshotGraph(workflow);
    const triggerNode = snapshot.nodes.find(
      (node) => node.category === 'trigger' && node.type === 'webhook'
    );
    if (!triggerNode) {
      throw new CustomHttpException(webhookTriggerNotFound, HttpErrorCode.NOT_FOUND, {
        localization: { i18nKey: webhookTriggerNotFoundI18nKey },
      });
    }

    this.assertWebhookAuthorization(triggerNode.config ?? {}, payload.authorization);
    return this.runSnapshot(workflow, snapshot, {
      triggerType: 'webhook',
      trigger: { body: payload.body ?? {} },
      startNodeId: triggerNode.id,
    });
  }

  async listRuns(baseId: string, workflowId: string, query: IWorkflowRunListQuery = {}) {
    const skip = this.positiveInteger(query.skip, 0);
    const take = Math.min(this.positiveInteger(query.take, 50), 100);
    const where = this.getRunWhere(baseId, workflowId, query);

    if (!query.duration || query.duration === 'all') {
      const [rowCount, runs] = await this.prismaService.$transaction([
        this.prismaService.workflowRun.count({ where }),
        this.prismaService.workflowRun.findMany({
          where,
          orderBy: { startedTime: 'desc' },
          skip,
          take,
        }),
      ]);
      return { rowCount, runs: runs.map((run) => this.runToVo(run)) };
    }

    const runs = await this.prismaService.workflowRun.findMany({
      where,
      orderBy: { startedTime: 'desc' },
    });
    const filteredRuns = this.filterRunsByDuration(runs, query.duration);
    return {
      rowCount: filteredRuns.length,
      runs: filteredRuns.slice(skip, skip + take).map((run) => this.runToVo(run)),
    };
  }

  async getRunSummary(baseId: string, workflowId: string) {
    const [summary] = await this.prismaService.$queryRaw<
      Array<{
        rowCount: number | bigint;
        success: number | bigint;
        failed: number | bigint;
        running: number | bigint;
        waiting: number | bigint;
        skipped: number | bigint;
        averageDuration: number | null;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::int AS "rowCount",
        COUNT(*) FILTER (WHERE "status" = 'success')::int AS "success",
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failed",
        COUNT(*) FILTER (WHERE "status" = 'running')::int AS "running",
        COUNT(*) FILTER (WHERE "status" = 'waiting')::int AS "waiting",
        COUNT(*) FILTER (WHERE "status" = 'skipped')::int AS "skipped",
        AVG(
          COALESCE(
            NULLIF(
              (
                SELECT SUM(
                  CASE
                    WHEN (step.value ->> 'spent') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                    THEN (step.value ->> 'spent')::double precision
                    ELSE 0
                  END
                )
                FROM jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof("steps"::jsonb) = 'array' THEN "steps"::jsonb
                    ELSE '[]'::jsonb
                  END
                ) AS step(value)
              ),
              0
            ),
            CASE
              WHEN "finished_time" IS NOT NULL
              THEN EXTRACT(EPOCH FROM ("finished_time" - "started_time")) * 1000
              ELSE NULL
            END
          )
        )::double precision AS "averageDuration"
      FROM "workflow_run"
      WHERE "base_id" = ${baseId}
        AND "workflow_id" = ${workflowId}
        AND COALESCE("trigger_type", '') <> 'manual'
    `);
    const averageDuration = this.numberValue(summary?.averageDuration);
    return {
      rowCount: this.numberValue(summary?.rowCount) ?? 0,
      success: this.numberValue(summary?.success) ?? 0,
      failed: this.numberValue(summary?.failed) ?? 0,
      running: this.numberValue(summary?.running) ?? 0,
      waiting: this.numberValue(summary?.waiting) ?? 0,
      skipped: this.numberValue(summary?.skipped) ?? 0,
      averageDuration,
    };
  }

  @OnEvent(Events.OPERATION_RECORDS_CREATE, { async: true })
  async handleOperationRecordsCreate(event: IOperationRecordsCreateEvent) {
    if (this.cls.get('workflowContext')) return;
    const tableId = this.optionalString(event.reqParams?.tableId);
    if (!tableId) return;
    const records = this.recordsFromCreateOperation(event.resolveData);
    if (!records.length) return;

    const baseId = await this.getBaseIdByTableId(tableId);
    for (const record of records) {
      await this.runMatchedWorkflows(baseId, 'recordCreated', {
        tableId,
        record,
        user: this.operationUser(event.reqUser),
      });
    }
  }

  @OnEvent(Events.TABLE_BUTTON_CLICK, { async: true })
  async handleButtonClick(event: ButtonClickEvent | { payload: ButtonClickEvent['payload'] }) {
    if (this.cls.get('workflowContext')) return;
    const payload = event.payload;
    const baseId = await this.getBaseIdByTableId(payload.tableId);
    await this.runMatchedWorkflows(baseId, 'buttonClick', {
      tableId: payload.tableId,
      fieldId: payload.fieldId,
      record: payload.record,
    });
  }

  @OnEvent(Events.TABLE_RECORD_CREATE, { async: true })
  async handleRecordCreate(event: RecordCreateEvent) {
    if (this.cls.get('workflowContext')) return;
    const records = Array.isArray(event.payload.record)
      ? event.payload.record
      : [event.payload.record];
    const baseId = await this.getBaseIdByTableId(event.payload.tableId);
    const triggerType = event.context?.entry?.type === 'form' ? 'formSubmitted' : 'recordCreated';
    for (const record of records) {
      await this.runMatchedWorkflows(baseId, triggerType, {
        tableId: event.payload.tableId,
        viewId: event.context?.entry?.type === 'form' ? event.context.entry.id : undefined,
        record,
      });
    }
  }

  @OnEvent(Events.TABLE_RECORD_UPDATE, { async: true })
  async handleRecordUpdate(event: RecordUpdateEvent) {
    if (this.cls.get('workflowContext')) return;
    const records = Array.isArray(event.payload.record)
      ? event.payload.record
      : [event.payload.record];
    const baseId = await this.getBaseIdByTableId(event.payload.tableId);
    for (const changeRecord of records) {
      const record = this.changeRecordToRecord(changeRecord);
      const fieldIds = Object.keys(changeRecord.fields ?? {});
      await this.runMatchedWorkflows(baseId, 'recordUpdated', {
        tableId: event.payload.tableId,
        fieldIds,
        record,
      });
      await this.runMatchedWorkflows(baseId, 'recordMatchesConditions', {
        tableId: event.payload.tableId,
        record,
      });
    }
  }

  private async runMatchedWorkflows(
    baseId: string,
    triggerType: string,
    trigger: Record<string, unknown>
  ) {
    const workflows = await this.prismaService.workflow.findMany({
      where: { baseId, isActive: true, deletedTime: null },
    });

    for (const workflow of workflows) {
      const snapshot = this.getActiveSnapshotGraph(workflow);
      const triggerNode = snapshot.nodes.find(
        (node) =>
          node.category === 'trigger' &&
          node.type === triggerType &&
          this.triggerMatches(node, trigger)
      );
      if (!triggerNode) continue;
      await this.runSnapshot(workflow, snapshot, {
        triggerType,
        trigger,
        startNodeId: triggerNode.id,
      });
    }
  }

  private async runSnapshot(
    workflow: Awaited<ReturnType<typeof this.findWorkflow>>,
    snapshot: IWorkflowSnapshot,
    params: {
      triggerType: string;
      trigger: Record<string, unknown>;
      startNodeId?: string;
      stopNodeId?: string;
      preview?: boolean;
      runtimeSeed?: Pick<IRuntimeContext, 'nodes' | 'action' | 'logic'>;
    }
  ) {
    const runId = `wfr${nanoid(16)}`;
    const startedTime = new Date();
    await this.prismaService.workflowRun.create({
      data: {
        id: runId,
        workflowId: workflow.id,
        baseId: workflow.baseId,
        status: 'running',
        triggerType: params.triggerType,
        input: params.trigger as Prisma.InputJsonValue,
        steps: [] as Prisma.InputJsonValue,
        createdBy: this.userId(),
      },
    });

    const trigger = this.withTriggerMetadata(params.trigger, workflow.baseId);
    const runtime: IRuntimeContext = {
      baseId: workflow.baseId,
      preview: params.preview,
      trigger,
      nodes: { ...(params.runtimeSeed?.nodes ?? {}) },
      action: { ...(params.runtimeSeed?.action ?? {}) },
      logic: { ...(params.runtimeSeed?.logic ?? {}) },
    };
    const steps: IRuntimeStep[] = [];

    try {
      const currentStore = this.cls.isActive() ? this.cls.get() : ({} as IClsStore);
      await this.cls.runWith(
        {
          ...currentStore,
          user: currentStore.user ?? { id: 'system', name: 'Automation', email: '' },
          origin: currentStore.origin ?? {
            ip: '',
            byApi: false,
            userAgent: 'automation',
            referer: '',
          },
          workflowContext: {},
        },
        async () => {
          this.cls.set('workflowContext', {});
          const startNode =
            snapshot.nodes.find((node) => node.id === params.startNodeId) ??
            snapshot.nodes.find((node) => node.category === 'trigger');
          if (!startNode) {
            throw new Error('Workflow trigger is required');
          }
          const reachedStopNode = await this.runFromNode(
            startNode,
            snapshot,
            runtime,
            steps,
            params.stopNodeId
          );
          if (params.stopNodeId && !reachedStopNode) {
            throw new Error('Workflow test step could not be reached');
          }
        }
      );

      const output = this.getRunOutput(runtime, steps);
      const run = await this.prismaService.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'success',
          output: output as Prisma.InputJsonValue,
          steps: steps as unknown as Prisma.InputJsonValue,
          finishedTime: new Date(),
        },
      });
      return this.runToVo(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = await this.prismaService.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          error: message,
          steps: steps as unknown as Prisma.InputJsonValue,
          finishedTime: new Date(),
        },
      });
      return this.runToVo(run);
    } finally {
      const spent = Date.now() - startedTime.getTime();
      if (!steps.length) {
        await this.prismaService.workflowRun.update({
          where: { id: runId },
          data: { steps: [{ status: 'skipped', spent }] as Prisma.InputJsonValue },
        });
      }
    }
  }

  private async runFromNode(
    startNode: IWorkflowNode,
    snapshot: IWorkflowSnapshot,
    runtime: IRuntimeContext,
    steps: IRuntimeStep[],
    stopNodeId?: string
  ) {
    const visited = new Map<string, number>();
    type IRunNodeResult = { runtime: IRuntimeContext; stopped: boolean };
    const runEdges = async (
      edges: IWorkflowEdge[],
      runNode: (
        node: IWorkflowNode,
        edgeRuntime: IRuntimeContext
      ) => Promise<IRunNodeResult | null>,
      edgeRuntime: IRuntimeContext
    ): Promise<IRunNodeResult | null> => {
      let lastResult: IRunNodeResult | null = null;
      for (const edge of edges) {
        const next = snapshot.nodes.find((item) => item.id === edge.target);
        if (!next) continue;
        const result = await runNode(next, this.cloneRuntimeContext(edgeRuntime));
        if (result?.stopped) return result;
        lastResult = result;
      }
      return lastResult;
    };
    const runNode = async (
      node: IWorkflowNode,
      currentRuntime: IRuntimeContext
    ): Promise<IRunNodeResult | null> => {
      const count = visited.get(node.id) ?? 0;
      if (count > 8) {
        throw new Error(`Workflow loop detected at node ${node.id}`);
      }
      visited.set(node.id, count + 1);

      const output = await this.executeNode(node, currentRuntime, steps);
      if (node.id === stopNodeId) return { runtime: currentRuntime, stopped: true };
      if (node.type === 'condition') {
        const branchEdges = this.getConditionBranchEdges(node, snapshot.edges, output);
        const branchResult = await runEdges(branchEdges, runNode, currentRuntime);
        if (branchResult?.stopped) return branchResult;
        const branchRuntime = branchResult?.runtime ?? currentRuntime;
        const mergeEdges = snapshot.edges.filter(
          (edge) => edge.source === node.id && !edge.sourceHandle
        );
        return (
          (await runEdges(mergeEdges, runNode, branchRuntime)) ?? {
            runtime: branchRuntime,
            stopped: false,
          }
        );
      }

      return (
        (await runEdges(
          snapshot.edges.filter((edge) => edge.source === node.id),
          runNode,
          currentRuntime
        )) ?? { runtime: currentRuntime, stopped: false }
      );
    };

    const result = await runNode(startNode, runtime);
    return stopNodeId ? Boolean(result?.stopped) : Boolean(result);
  }

  private async executeNode(node: IWorkflowNode, runtime: IRuntimeContext, steps: IRuntimeStep[]) {
    const startedAt = Date.now();
    const input = this.resolveValue(node.config ?? {}, runtime);
    try {
      const output =
        node.category === 'trigger'
          ? runtime.trigger
          : node.category === 'logic'
            ? this.executeLogic(node, input, runtime)
            : await this.executeAction(node, input, runtime);
      this.storeNodeOutput(node, output, runtime);
      steps.push({
        nodeId: node.id,
        type: node.type,
        category: node.category,
        status: 'success',
        input,
        output,
        spent: Date.now() - startedAt,
      });
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({
        nodeId: node.id,
        type: node.type,
        category: node.category,
        status: 'failed',
        input,
        error: message,
        spent: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private executeLogic(node: IWorkflowNode, input: unknown, runtime: IRuntimeContext) {
    if (node.type !== 'condition') return { result: true };
    const config = input as Record<string, unknown>;
    return { result: this.matchSimpleCondition(config, runtime) };
  }

  private async executeAction(node: IWorkflowNode, input: unknown, runtime: IRuntimeContext) {
    const config = input as Record<string, unknown>;
    switch (node.type) {
      case 'createRecord': {
        const tableId = this.requiredString(config.tableId, 'tableId');
        const fields = this.objectValue(config.fields, 'fields');
        const outputBaseId = await this.getBaseIdByTableId(tableId);
        const res = await this.recordOpenApiService.createRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          typecast: true,
          records: [{ fields }],
        });
        const records = this.withRecordOutputMetadata(res.records, outputBaseId, tableId);
        return config.loopSource === undefined ? records[0] : { records };
      }
      case 'getRecords': {
        const tableId = this.requiredString(config.tableId, 'tableId');
        const outputBaseId = await this.getBaseIdByTableId(tableId);
        const res = await this.recordService.getRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId: this.optionalString(config.viewId),
          skip: Number(config.skip || 0),
          take: Number(config.take || 100),
          filter: config.filter as never,
        });
        return { records: this.withRecordOutputMetadata(res.records, outputBaseId, tableId) };
      }
      case 'updateRecord': {
        return this.executeUpdateRecordAction(config, runtime);
      }
      case 'sendEmail': {
        return this.executeSendEmailAction(config, runtime);
      }
      case 'aiGenerate': {
        return this.executeAIGenerateAction(config, runtime);
      }
      case 'httpRequest': {
        return this.executeHttpRequestAction(config);
      }
      default:
        throw new Error(`Unsupported workflow action: ${node.type}`);
    }
  }

  private async executeHttpRequestAction(config: Record<string, unknown>) {
    const url = this.requiredString(config.url, 'url');
    const method = this.optionalString(config.method)?.toUpperCase() ?? 'GET';
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS requests are supported');
    }

    const headers = this.getHttpRequestHeaders(config.headers);
    const body = this.getHttpRequestBody(
      method,
      this.getHttpBodyType(config),
      config.body,
      headers
    );

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
      });
      const text = await response.text();
      const responseHeaders = Object.fromEntries(response.headers.entries());
      return {
        status: response.status,
        url: response.url || url,
        headers: responseHeaders,
        body: this.parseHttpResponseBody(text, response.headers.get(httpContentTypeHeader)),
      };
    } catch (error) {
      return {
        status: null,
        url,
        headers: {},
        body: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeSendEmailAction(config: Record<string, unknown>, runtime: IRuntimeContext) {
    const to = config.to;
    const body = this.requiredString(config.body, 'body');
    const toValue = Array.isArray(to) ? to.join(',') : this.requiredString(to, 'to');
    const totalCount = this.getMailRecipientCount(toValue);
    const output = {
      totalCount,
      sentCount: 0,
      error: '',
    };
    const subject = this.requiredString(config.subject, 'subject');
    const text = body.replace(/<[^>]+>/g, ' ');
    if (runtime.preview) return output;
    try {
      await this.mailSenderService.sendMail(
        {
          to: toValue,
          subject,
          html: body,
          text,
          senderName: this.optionalString(config.senderName),
          cc: this.optionalString(config.cc),
          bcc: this.optionalString(config.bcc),
          replyTo: this.optionalString(config.replyTo),
        },
        { shouldThrow: true, transportConfig: this.getMailTransportConfig(config) }
      );
    } catch (error) {
      return { ...output, error: error instanceof Error ? error.message : String(error) };
    }
    return { ...output, sentCount: totalCount };
  }

  private getMailTransportConfig(config: Record<string, unknown>) {
    return isPlainObject(config.mailTransportConfig)
      ? (config.mailTransportConfig as IMailTransportConfig)
      : undefined;
  }

  private getMailRecipientCount(to: string) {
    return to
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean).length;
  }

  private async executeUpdateRecordAction(
    config: Record<string, unknown>,
    runtime: IRuntimeContext
  ) {
    const tableId = this.requiredString(config.tableId, 'tableId');
    const outputBaseId = await this.getBaseIdByTableId(tableId);
    const recordId =
      this.optionalString(config.recordId) ??
      this.optionalString(get(runtime, 'trigger.record.id'));
    if (!recordId) throw new Error('recordId is required');
    const fields = this.objectValue(config.fields, 'fields');
    const record = await this.recordOpenApiService.updateRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      typecast: true,
      record: { fields },
    });
    const outputRecord = this.withRecordOutputMetadata(record, outputBaseId, tableId);
    return config.loopSource === undefined ? outputRecord : { records: [outputRecord] };
  }

  private async executeAIGenerateAction(config: Record<string, unknown>, runtime: IRuntimeContext) {
    const { disableActions } = await this.aiService.getAIDisableAIActions(runtime.baseId);
    if (disableActions.includes(AIActions.AIAutomation)) {
      throw new CustomHttpException(
        'AI automation is not available',
        HttpErrorCode.VALIDATION_ERROR
      );
    }

    const prompt = this.requiredString(config.prompt, 'prompt');
    const modelKey = this.optionalString(config.model) ?? this.optionalString(config.modelKey);
    const outputType = this.optionalString(config.outputType) ?? 'string';
    const attachments = Array.isArray(config.attachments) ? config.attachments.filter(Boolean) : [];
    const promptWithAttachments = attachments.length
      ? `${prompt}\n\nAttachments:\n${JSON.stringify(attachments)}`
      : prompt;
    const result = await this.aiService.generateTextResult(runtime.baseId, {
      prompt: promptWithAttachments,
      modelKey,
      task: Task.Coding,
      temperature: this.optionalAITemperature(config.temperature),
    });
    return this.getAIGenerateOutput(result, outputType);
  }

  private getAIGenerateOutput(
    result: Awaited<ReturnType<AiService['generateTextResult']>>,
    outputType: string
  ) {
    const output: Record<string, unknown> = {
      message: ['json', 'object'].includes(outputType)
        ? this.parseAIJsonOutput(result.text)
        : result.text,
    };
    this.addAIGenerateOutputValue(output, 'reasoning', result.reasoning);
    this.addAIGenerateOutputValue(output, 'reasoningText', result.reasoningText);
    this.addAIGenerateOutputValue(output, 'finishReason', result.finishReason);
    this.addAIGenerateOutputValue(output, 'rawFinishReason', result.rawFinishReason);
    this.addAIGenerateOutputValue(output, 'content', result.content);
    this.addAIGenerateOutputValue(output, 'sources', result.sources);
    this.addAIGenerateOutputValue(output, 'files', result.files);
    this.addAIGenerateOutputValue(output, 'toolCalls', result.toolCalls);
    this.addAIGenerateOutputValue(output, 'toolResults', result.toolResults);
    this.addAIGenerateOutputValue(output, 'usage', result.usage);
    this.addAIGenerateOutputValue(output, 'inputTokens', result.usage.inputTokens);
    this.addAIGenerateOutputValue(output, 'outputTokens', result.usage.outputTokens);
    this.addAIGenerateOutputValue(output, 'totalTokens', result.usage.totalTokens);
    this.addAIGenerateOutputValue(
      output,
      'reasoningTokens',
      result.usage.outputTokenDetails.reasoningTokens ?? result.usage.reasoningTokens
    );
    this.addAIGenerateOutputValue(output, 'totalUsage', result.totalUsage);
    this.addAIGenerateOutputValue(output, 'warnings', result.warnings);
    this.addAIGenerateOutputValue(output, 'request', {
      ...result.request,
      body:
        result.request.body === undefined
          ? null
          : typeof result.request.body === 'string'
            ? this.parseAIJsonOutput(result.request.body)
            : result.request.body,
    });
    this.addAIGenerateOutputValue(output, 'response', {
      id: result.response.id,
      modelId: result.response.modelId,
      timestamp: result.response.timestamp.toISOString(),
      messages: result.response.messages,
      body: result.response.body ?? null,
    });
    this.addAIGenerateOutputValue(output, 'providerMetadata', result.providerMetadata);
    return output;
  }

  private addAIGenerateOutputValue(output: Record<string, unknown>, key: string, value: unknown) {
    output[key] = this.normalizeAIGenerateOutputValue(value);
  }

  private normalizeAIGenerateOutputValue(value: unknown): unknown {
    if (value === undefined) return null;
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => this.normalizeAIGenerateOutputValue(item));
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.normalizeAIGenerateOutputValue(item)])
      );
    }
    return value;
  }

  private getConditionBranchEdges(node: IWorkflowNode, edges: IWorkflowEdge[], output: unknown) {
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const result = Boolean((output as { result?: boolean })?.result);
    return outgoing.filter((edge) => edge.sourceHandle === String(result));
  }

  private storeNodeOutput(node: IWorkflowNode, output: unknown, runtime: IRuntimeContext) {
    if (node.category !== 'action') return;
    runtime.nodes[node.id] = output;
    runtime.action[node.id] = output;
  }

  private cloneRuntimeContext(runtime: IRuntimeContext): IRuntimeContext {
    return {
      baseId: runtime.baseId,
      preview: runtime.preview,
      trigger: runtime.trigger,
      nodes: { ...runtime.nodes },
      action: { ...runtime.action },
      logic: { ...runtime.logic },
    };
  }

  private getRunOutput(runtime: IRuntimeContext, steps: IRuntimeStep[]) {
    const action = steps.reduce<Record<string, unknown>>((result, step) => {
      if (step.category === 'action' && step.status === 'success') {
        result[step.nodeId] = step.output;
      }
      return result;
    }, {});
    return { trigger: runtime.trigger, nodes: action, action, logic: {} };
  }

  private withRecordOutputMetadata<T>(output: T, baseId: string, tableId: string): T {
    if (Array.isArray(output)) {
      return output.map((item) => this.withRecordOutputMetadata(item, baseId, tableId)) as T;
    }
    if (!isPlainObject(output)) return output;
    const record = output as Record<string, unknown>;
    const recordId = this.optionalString(record.id);
    if (!recordId || record.url) return output;
    return {
      ...record,
      url: `/base/${baseId}/table/${tableId}?recordId=${recordId}`,
    } as T;
  }

  private withTriggerMetadata(trigger: Record<string, unknown>, baseId: string) {
    const record = isPlainObject(trigger.record)
      ? (trigger.record as Record<string, unknown>)
      : undefined;
    if (!record) return trigger;

    const tableId = this.optionalString(trigger.tableId);
    const recordId = this.optionalString(record.id);
    const fields = isPlainObject(record.fields) ? (record.fields as Record<string, unknown>) : {};
    const firstValue = Object.values(fields).find(
      (value) => typeof value === 'string' || typeof value === 'number'
    );
    const recordName = this.optionalString(record.name) ?? this.optionalString(firstValue);

    return {
      ...trigger,
      user: isPlainObject(trigger.user) ? trigger.user : this.triggerUser(),
      record: {
        ...record,
        ...(recordName ? { name: recordName } : {}),
        ...(tableId && recordId
          ? { url: `/base/${baseId}/table/${tableId}?recordId=${recordId}` }
          : {}),
      },
    };
  }

  private recordsFromCreateOperation(resolveData: unknown): IRecord[] {
    if (Array.isArray(resolveData)) {
      return resolveData.filter((item): item is IRecord => this.isRecordLike(item));
    }
    if (!isPlainObject(resolveData)) return [];
    const data = resolveData as { records?: unknown };
    if (Array.isArray(data.records)) {
      return data.records.filter((item): item is IRecord => this.isRecordLike(item));
    }
    return this.isRecordLike(resolveData) ? [resolveData] : [];
  }

  private isRecordLike(value: unknown): value is IRecord {
    return isPlainObject(value) && typeof (value as { id?: unknown }).id === 'string';
  }

  private operationUser(user?: IOperationRecordsCreateEvent['reqUser']) {
    if (!user?.id) return undefined;
    return {
      id: user.id,
      name: user.name ?? '',
      email: user.email ?? '',
      avatarUrl: '',
    };
  }

  private triggerUser() {
    const user = this.cls.get('user');
    return {
      id: user?.id ?? 'system',
      name: user?.name ?? '',
      email: user?.email ?? '',
      avatarUrl: '',
    };
  }

  private async saveGraph(workflowId: string, nodes: IWorkflowNode[], edges: IWorkflowEdge[]) {
    await this.prismaService.workflow.update({
      where: { id: workflowId },
      data: {
        nodes: nodes as Prisma.InputJsonValue,
        edges: edges as Prisma.InputJsonValue,
        trigger: this.getTriggerFromNodes(nodes) as Prisma.InputJsonValue | undefined,
        lastModifiedBy: this.userId(),
      },
    });
  }

  private makeNode(category: IWorkflowCategory, ro: ICreateWorkflowGraphNodeRo): IWorkflowNode {
    const id =
      category === 'trigger'
        ? generateWorkflowTriggerId()
        : category === 'logic'
          ? generateWorkflowDecisionId()
          : generateWorkflowActionId();
    return {
      id,
      type: ro.type,
      category,
      name: ro.name ?? ro.type,
      description: ro.description,
      config: ro.config ?? {},
      createdBy: this.userId(),
      createdTime: new Date().toISOString(),
    };
  }

  private async findWorkflow(baseId: string, workflowId: string) {
    const workflow = await this.prismaService.workflow.findFirst({
      where: { id: workflowId, baseId, deletedTime: null },
    });
    if (!workflow) {
      throw new CustomHttpException('Workflow not found', HttpErrorCode.NOT_FOUND);
    }
    return workflow;
  }

  private getDraftSnapshot(workflow: { nodes?: unknown; edges?: unknown; trigger?: unknown }) {
    const nodes = this.asNodes(workflow.nodes);
    return {
      nodes: nodes.length ? nodes : this.nodesFromTrigger(workflow.trigger),
      edges: this.asEdges(workflow.edges),
    };
  }

  private getActiveSnapshotGraph(workflow: {
    activeSnapshot?: unknown;
    nodes?: unknown;
    edges?: unknown;
  }) {
    if (workflow.activeSnapshot && isPlainObject(workflow.activeSnapshot)) {
      const snapshot = workflow.activeSnapshot as Record<string, unknown>;
      return {
        nodes: this.asNodes(snapshot.nodes),
        edges: this.asEdges(snapshot.edges),
      };
    }
    return {
      nodes: this.asNodes(workflow.nodes),
      edges: this.asEdges(workflow.edges),
    };
  }

  private nodesFromTrigger(trigger: unknown): IWorkflowNode[] {
    if (!trigger || !isPlainObject(trigger)) return [];
    const triggerRecord = trigger as { type?: unknown; config?: unknown };
    return [
      {
        id: generateWorkflowTriggerId(),
        type: typeof triggerRecord.type === 'string' ? triggerRecord.type : 'buttonClick',
        category: 'trigger',
        name: typeof triggerRecord.type === 'string' ? triggerRecord.type : 'buttonClick',
        config: isPlainObject(triggerRecord.config)
          ? (triggerRecord.config as Record<string, unknown>)
          : {},
      },
    ];
  }

  private getTriggerFromNodes(nodes: IWorkflowNode[]) {
    const trigger = nodes.find((node) => node.category === 'trigger');
    if (!trigger) return undefined;
    return { type: trigger.type, config: trigger.config ?? {} };
  }

  private asNodes(value: unknown): IWorkflowNode[] {
    return Array.isArray(value) ? (value as IWorkflowNode[]) : [];
  }

  private asEdges(value: unknown): IWorkflowEdge[] {
    return Array.isArray(value) ? (value as IWorkflowEdge[]) : [];
  }

  private toVo(workflow: {
    id: string;
    name: string | null;
    description?: string | null;
    baseId: string;
    trigger?: unknown;
    nodes?: unknown;
    edges?: unknown;
    activeSnapshot?: unknown;
    activeTime?: Date | null;
    activeBy?: string | null;
    isActive: boolean;
    createdBy?: string | null;
    createdTime?: Date | null;
    lastModifiedTime?: Date | null;
    lastModifiedBy?: string | null;
  }) {
    const draft = this.getDraftSnapshot(workflow);
    const active = this.getActiveSnapshotGraph(workflow);
    return {
      id: workflow.id,
      baseId: workflow.baseId,
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      nodes: draft.nodes,
      edges: draft.edges,
      hasDraft: JSON.stringify(draft) !== JSON.stringify(active),
      isActive: workflow.isActive,
      activeSnapshot: workflow.activeSnapshot,
      activeTime: workflow.activeTime?.toISOString() ?? null,
      activeBy: workflow.activeBy,
      createdBy: workflow.createdBy,
      createdTime: workflow.createdTime?.toISOString() ?? null,
      lastModifiedTime: workflow.lastModifiedTime?.toISOString() ?? null,
      lastModifiedBy: workflow.lastModifiedBy,
    };
  }

  private positiveInteger(value: string | undefined, fallback: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
    return Math.floor(numberValue);
  }

  private numberValue(value: number | bigint | null | undefined) {
    if (value === null || value === undefined) return undefined;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private dateFromQuery(value: string | undefined) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }

  private isWorkflowRunStatus(status: string | undefined): status is IWorkflowRunStatus {
    return (
      status === 'running' ||
      status === 'success' ||
      status === 'failed' ||
      status === 'skipped' ||
      status === 'waiting'
    );
  }

  private getRunWhere(baseId: string, workflowId: string, query: IWorkflowRunListQuery) {
    const where: Prisma.WorkflowRunWhereInput = {
      baseId,
      workflowId,
      NOT: { triggerType: 'manual' },
    };
    if (this.isWorkflowRunStatus(query.status)) {
      where.status = query.status;
    }
    const startedTime: Prisma.DateTimeFilter = {};
    const startedTimeFrom = this.dateFromQuery(query.startedTimeFrom);
    const startedTimeTo = this.dateFromQuery(query.startedTimeTo);
    if (startedTimeFrom) startedTime.gte = startedTimeFrom;
    if (startedTimeTo) startedTime.lte = startedTimeTo;
    if (startedTime.gte || startedTime.lte) {
      where.startedTime = startedTime;
    }
    return where;
  }

  private getRunDuration(run: { steps?: unknown; startedTime: Date; finishedTime?: Date | null }) {
    const stepDuration = Array.isArray(run.steps)
      ? run.steps.reduce((sum, step) => {
          if (!isPlainObject(step)) return sum;
          const spent = Number((step as { spent?: unknown }).spent);
          return Number.isFinite(spent) ? sum + spent : sum;
        }, 0)
      : 0;
    if (stepDuration > 0) return stepDuration;
    if (!run.finishedTime) return undefined;
    return Math.max(0, run.finishedTime.getTime() - run.startedTime.getTime());
  }

  private runMatchesDuration(duration: number | undefined, filter: string | undefined) {
    if (!filter || filter === 'all') return true;
    if (duration === undefined) return false;
    if (filter === 'lt_5s') return duration < 5000;
    if (filter === '5_10s') return duration >= 5000 && duration < 10000;
    if (filter === '10_30s') return duration >= 10000 && duration < 30000;
    if (filter === '30s_1m') return duration >= 30000 && duration < 60000;
    if (filter === '1_5m') return duration >= 60000 && duration <= 300000;
    if (filter === 'gt_5m') return duration > 300000;
    return true;
  }

  private filterRunsByDuration<
    T extends { steps?: unknown; startedTime: Date; finishedTime?: Date | null },
  >(runs: T[], durationFilter: string | undefined) {
    if (!durationFilter || durationFilter === 'all') return runs;
    return runs.filter((run) => this.runMatchesDuration(this.getRunDuration(run), durationFilter));
  }

  private runToVo(run: {
    id: string;
    workflowId: string;
    baseId: string;
    status: string;
    triggerType?: string | null;
    input?: unknown;
    output?: unknown;
    steps?: unknown;
    error?: string | null;
    startedTime: Date;
    finishedTime?: Date | null;
    createdBy?: string | null;
  }) {
    return {
      id: run.id,
      workflowId: run.workflowId,
      baseId: run.baseId,
      status: run.status as IWorkflowRunStatus,
      triggerType: run.triggerType,
      input: run.input,
      output: run.output,
      steps: Array.isArray(run.steps) ? run.steps : [],
      error: run.error,
      startedTime: run.startedTime.toISOString(),
      finishedTime: run.finishedTime?.toISOString() ?? null,
      createdBy: run.createdBy,
    };
  }

  private assertActivatable(snapshot: IWorkflowSnapshot) {
    if (!snapshot.nodes.some((node) => node.category === 'trigger')) {
      throw new CustomHttpException('Workflow trigger is required', HttpErrorCode.VALIDATION_ERROR);
    }
    if (!snapshot.nodes.some((node) => node.category === 'action')) {
      throw new CustomHttpException('Workflow action is required', HttpErrorCode.VALIDATION_ERROR);
    }
  }

  private triggerMatches(node: IWorkflowNode, trigger: Record<string, unknown>) {
    const config = node.config ?? {};
    const tableId = this.optionalString(config.tableId);
    if (tableId && tableId !== trigger.tableId) return false;
    const viewId = this.optionalString(config.viewId);
    if (viewId && viewId !== trigger.viewId) return false;
    if (node.type === 'buttonClick' && !this.buttonTriggerMatches(config, trigger)) return false;
    if (node.type === 'recordUpdated' && !this.updateTriggerMatches(config, trigger)) return false;
    if (config.filter) {
      return this.matchSimpleCondition(config.filter, {
        baseId: '',
        trigger,
        nodes: {},
        action: {},
        logic: {},
      });
    }
    return true;
  }

  private assertWebhookAuthorization(config: Record<string, unknown>, authorization?: string) {
    const authorizationConfig = isPlainObject(config.authorization)
      ? (config.authorization as Record<string, unknown>)
      : undefined;
    if (authorizationConfig?.type !== 'bearer') return;
    const token = this.optionalString(authorizationConfig.token);
    if (!token) {
      throw new CustomHttpException('Unauthorized webhook request', HttpErrorCode.UNAUTHORIZED);
    }
    if (authorization !== `Bearer ${token}`) {
      throw new CustomHttpException('Unauthorized webhook request', HttpErrorCode.UNAUTHORIZED);
    }
  }

  private buttonTriggerMatches(config: Record<string, unknown>, trigger: Record<string, unknown>) {
    const watchFieldIds = this.stringArray(config.watchFieldIds);
    return watchFieldIds.includes(String(trigger.fieldId));
  }

  private updateTriggerMatches(config: Record<string, unknown>, trigger: Record<string, unknown>) {
    const watchFieldIds = this.stringArray(config.watchFieldIds);
    if (!watchFieldIds.length) return true;
    const triggerFieldIds = this.stringArray(trigger.fieldIds);
    return watchFieldIds.some((fieldId) => triggerFieldIds.includes(fieldId));
  }

  private matchSimpleCondition(condition: unknown, runtime: IRuntimeContext): boolean {
    if (!condition || !isPlainObject(condition)) return true;
    const config = condition as Record<string, unknown>;
    if (Array.isArray(config.filterSet)) {
      const filters = config.filterSet.filter(isPlainObject);
      if (!filters.length) return true;
      return config.conjunction === 'or'
        ? filters.some((filter) => this.matchSimpleCondition(filter, runtime))
        : filters.every((filter) => this.matchSimpleCondition(filter, runtime));
    }
    const left = this.resolveValue(config.left ?? config.fieldId, runtime);
    const actual = config.fieldId
      ? get(runtime, ['trigger', 'record', 'fields', String(config.fieldId)])
      : left;
    const right = this.resolveValue(config.right ?? config.value, runtime);
    switch (config.operator) {
      case 'neq':
      case 'notEqual':
      case 'isNot':
        return !this.valueEquals(actual, right);
      case 'isAnyOf':
        return this.arrayValue(right).some((item) => this.valueContains(actual, item));
      case 'isNoneOf':
        return !this.arrayValue(right).some((item) => this.valueContains(actual, item));
      case 'hasAnyOf':
        return this.arrayValue(right).some((item) => this.valueContains(actual, item));
      case 'hasAllOf':
        return this.arrayValue(right).every((item) => this.valueContains(actual, item));
      case 'hasNoneOf':
        return !this.arrayValue(right).some((item) => this.valueContains(actual, item));
      case 'isExactly':
        return this.sameValueSet(actual, right);
      case 'isNotExactly':
        return !this.sameValueSet(actual, right);
      case 'contains':
        return this.valueContains(actual, right);
      case 'doesNotContain':
        return !this.valueContains(actual, right);
      case 'empty':
      case 'isEmpty':
        return this.isEmptyValue(actual);
      case 'notEmpty':
      case 'isNotEmpty':
        return !this.isEmptyValue(actual);
      case 'gt':
      case 'isGreater':
        return Number(actual) > Number(right);
      case 'gte':
      case 'isGreaterEqual':
        return Number(actual) >= Number(right);
      case 'lt':
      case 'isLess':
        return Number(actual) < Number(right);
      case 'lte':
      case 'isLessEqual':
        return Number(actual) <= Number(right);
      case 'isBefore':
        return this.compareDate(actual, right) < 0;
      case 'isAfter':
        return this.compareDate(actual, right) > 0;
      case 'isOnOrBefore':
        return this.compareDate(actual, right) <= 0;
      case 'isOnOrAfter':
        return this.compareDate(actual, right) >= 0;
      case 'isWithIn':
        return this.dateWithin(actual, right);
      case 'eq':
      case 'equal':
      case 'is':
      default:
        if (this.isDateFilter(right)) return this.dateMatches(actual, right);
        return this.valueEquals(actual, right);
    }
  }

  private isEmptyValue(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : this.isEmptyValue(value) ? [] : [value];
  }

  private comparableValue(value: unknown): string {
    if (isPlainObject(value)) {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string') return record.id;
      if (typeof record.title === 'string') return record.title;
      if (typeof record.name === 'string') return record.name;
      return JSON.stringify(value);
    }
    return Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
  }

  private valueEquals(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) && !Array.isArray(right)) {
      return left.length === 1 && this.valueEquals(left[0], right);
    }
    if (!Array.isArray(left) && Array.isArray(right)) {
      return right.length === 1 && this.valueEquals(left, right[0]);
    }
    return this.comparableValue(left) === this.comparableValue(right);
  }

  private valueContains(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(actual)) {
      return actual.some((item) => this.valueEquals(item, expected));
    }
    if (Array.isArray(expected)) {
      return expected.some((item) => this.valueContains(actual, item));
    }
    return String(actual ?? '').includes(String(expected ?? ''));
  }

  private sameValueSet(actual: unknown, expected: unknown): boolean {
    const left = this.arrayValue(actual)
      .map((item) => this.comparableValue(item))
      .sort();
    const right = this.arrayValue(expected)
      .map((item) => this.comparableValue(item))
      .sort();
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }

  private isDateFilter(value: unknown): value is Record<string, unknown> {
    return isPlainObject(value) && typeof (value as Record<string, unknown>).mode === 'string';
  }

  private dateValue(value: unknown): Date | undefined {
    const date = new Date(String(value ?? ''));
    return Number.isFinite(date.getTime()) ? date : undefined;
  }

  private dateFilterDate(value: unknown): Date | undefined {
    if (!this.isDateFilter(value)) return this.dateValue(value);
    const mode = String(value.mode);
    const now = new Date();
    const days = Number(value.numberOfDays ?? 0);
    if (typeof value.exactDate === 'string') return this.dateValue(value.exactDate);
    if (mode === 'today') return now;
    if (mode === 'tomorrow') return new Date(now.getTime() + 86400000);
    if (mode === 'yesterday') return new Date(now.getTime() - 86400000);
    if (mode === 'daysAgo') return new Date(now.getTime() - days * 86400000);
    if (mode === 'daysFromNow' || mode === 'nextNumberOfDays') {
      return new Date(now.getTime() + days * 86400000);
    }
    if (mode === 'pastNumberOfDays') return new Date(now.getTime() - days * 86400000);
    return undefined;
  }

  private compareDate(actual: unknown, expected: unknown): number {
    const left = this.dateValue(actual);
    const right = this.dateFilterDate(expected);
    if (!left || !right) return Number.NaN;
    return left.getTime() - right.getTime();
  }

  private sameDay(left: Date, right: Date): boolean {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  private dateMatches(actual: unknown, expected: Record<string, unknown>): boolean {
    const left = this.dateValue(actual);
    if (!left) return false;
    if (expected.mode === 'dateRange') {
      const start = this.dateValue(expected.exactDate);
      const end = this.dateValue(expected.exactDateEnd);
      return Boolean(start && end && left >= start && left <= end);
    }
    const right = this.dateFilterDate(expected);
    return Boolean(right && this.sameDay(left, right));
  }

  private dateWithin(actual: unknown, expected: unknown): boolean {
    const left = this.dateValue(actual);
    if (!left || !this.isDateFilter(expected)) return false;
    const days = Number(expected.numberOfDays ?? 0);
    const now = new Date();
    const diff = left.getTime() - now.getTime();
    if (expected.mode === 'pastNumberOfDays') return diff <= 0 && diff >= -days * 86400000;
    return diff >= 0 && diff <= days * 86400000;
  }

  private resolveValue(value: unknown, runtime: IRuntimeContext): unknown {
    if (typeof value === 'string') return this.interpolate(value, runtime);
    if (Array.isArray(value)) return value.map((item) => this.resolveValue(item, runtime));
    if (value && isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.resolveValue(item, runtime)])
      );
    }
    return value;
  }

  private interpolate(value: string, runtime: IRuntimeContext) {
    const exact = this.getExactVariableExpression(value);
    if (exact !== undefined) return this.resolveVariableExpression(exact, runtime);

    let cursor = 0;
    let result = '';
    while (cursor < value.length) {
      const start = value.indexOf('{{', cursor);
      if (start === -1) return `${result}${value.slice(cursor)}`;
      const end = value.indexOf('}}', start + 2);
      if (end === -1) return `${result}${value.slice(cursor)}`;
      const resolved = this.resolveVariableExpression(value.slice(start + 2, end), runtime);
      result += value.slice(cursor, start);
      result += resolved === undefined || resolved === null ? '' : String(resolved);
      cursor = end + 2;
    }
    return result;
  }

  private getExactVariableExpression(value: string) {
    const text = value.trim();
    if (!text.startsWith('{{') || !text.endsWith('}}')) return;
    return text.slice(2, -2).trim();
  }

  private resolveVariableExpression(expression: string, runtime: IRuntimeContext) {
    const [path, ...modifiers] = expression
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!path) return undefined;
    return modifiers.reduce(
      (value, modifier) => this.applyVariableModifier(value, modifier),
      get(runtime, path)
    );
  }

  private applyVariableModifier(value: unknown, modifier: string) {
    switch (modifier) {
      case 'upper':
        return String(value ?? '').toUpperCase();
      case 'lower':
        return String(value ?? '').toLowerCase();
      case 'capitalize': {
        const text = String(value ?? '');
        return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
      }
      case 'trim':
        return String(value ?? '').trim();
      case 'length':
        return typeof value === 'string' || Array.isArray(value)
          ? value.length
          : Object.keys((value ?? {}) as Record<string, unknown>).length;
      case 'string':
        return String(value ?? '');
      case 'json':
        return JSON.stringify(value ?? null);
      case 'urlEncode':
        return encodeURIComponent(String(value ?? ''));
      default:
        return value;
    }
  }

  private changeRecordToRecord(record: {
    id: string;
    fields: Record<string, { newValue: unknown }>;
  }) {
    return {
      id: record.id,
      fields: Object.fromEntries(
        Object.entries(record.fields ?? {}).map(([fieldId, value]) => [fieldId, value?.newValue])
      ),
    } as IRecord;
  }

  private async getBaseIdByTableId(tableId: unknown) {
    const table = await this.prismaService.tableMeta.findFirst({
      where: { id: String(tableId), deletedTime: null },
      select: { baseId: true },
    });
    if (!table) {
      throw new CustomHttpException('Table not found', HttpErrorCode.NOT_FOUND);
    }
    return table.baseId;
  }

  private userId() {
    return this.cls.get('user.id') ?? 'system';
  }

  private requiredString(value: unknown, name: string) {
    if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
    return value;
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value ? value : undefined;
  }

  private optionalNumber(value: unknown) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value !== 'string' || !value) return undefined;
    const numberValue = Number(value);
    return Number.isNaN(numberValue) ? undefined : numberValue;
  }

  private optionalAITemperature(value: unknown) {
    const numberValue = this.optionalNumber(value);
    if (numberValue === undefined) return undefined;
    return Math.min(1, Math.max(0, numberValue));
  }

  private parseAIJsonOutput(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private stringArray(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private objectValue(value: unknown, name: string) {
    if (!isPlainObject(value)) throw new Error(`${name} must be an object`);
    return value as Record<string, unknown>;
  }

  private bodyValue(value: unknown) {
    if (value === undefined || value === null) return undefined;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  private getHttpRequestHeaders(value: unknown) {
    const entries = this.getHttpKeyValueEntries(value);
    return Object.fromEntries(entries);
  }

  private getHttpBodyType(config: Record<string, unknown>) {
    const bodyType = this.optionalString(config.bodyType);
    if (bodyType) return bodyType;
    switch (this.optionalString(config.contentType)?.toLowerCase()) {
      case 'multipart/form-data':
        return 'formData';
      case 'application/x-www-form-urlencoded':
        return 'urlencoded';
      case 'application/json':
        return 'json';
      case 'text/plain':
        return 'rawText';
      default:
        return undefined;
    }
  }

  private getHttpKeyValueEntries(value: unknown): [string, string][] {
    if (Array.isArray(value)) {
      return value
        .filter(isPlainObject)
        .map((item) => {
          const record = item as Record<string, unknown>;
          return [this.optionalString(record.key), record.value] as const;
        })
        .filter((item): item is readonly [string, unknown] => Boolean(item[0]))
        .map(([key, item]): [string, string] => [key, item == null ? '' : String(item)]);
    }
    if (!isPlainObject(value)) return [];
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key.trim())
      .map(([key, item]): [string, string] => [key, item == null ? '' : String(item)]);
  }

  private getHttpRequestBody(
    method: string,
    bodyType: string | undefined,
    value: unknown,
    headers: Record<string, string>
  ) {
    if (['GET', 'HEAD'].includes(method) || !bodyType || bodyType === 'none') return undefined;

    if (bodyType === 'json') {
      this.setHttpHeaderIfMissing(headers, httpContentTypeHeader, 'application/json');
      return typeof value === 'string' ? value : JSON.stringify(value ?? null);
    }

    if (bodyType === 'urlencoded') {
      this.setHttpHeaderIfMissing(
        headers,
        httpContentTypeHeader,
        'application/x-www-form-urlencoded'
      );
      if (typeof value === 'string') return value;
      return new URLSearchParams(this.getHttpKeyValueEntries(value)).toString();
    }

    if (bodyType === 'formData') {
      const form = new FormData();
      this.getHttpKeyValueEntries(value).forEach(([key, item]) => form.append(key, item));
      return form;
    }

    if (bodyType === 'rawText') {
      this.setHttpHeaderIfMissing(headers, httpContentTypeHeader, 'text/plain');
    }

    return this.bodyValue(value);
  }

  private setHttpHeaderIfMissing(headers: Record<string, string>, key: string, value: string) {
    const hasHeader = Object.keys(headers).some((item) => item.toLowerCase() === key.toLowerCase());
    if (!hasHeader) headers[key] = value;
  }

  private parseHttpResponseBody(text: string, contentType: string | null) {
    const value = text.slice(0, 10000);
    if (contentType?.toLowerCase().includes('application/json'))
      return this.parseAIJsonOutput(value);
    const parsed = this.parseAIJsonOutput(value);
    return parsed === value ? value : parsed;
  }
}
