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
import type {
  IActiveWorkflowRo,
  ICreateWorkflowGraphNodeRo,
  IUpdateWorkflowGraphNodeRo,
  IUpdateWorkflowRo,
  IWorkflowEdge,
  IWorkflowNode,
  IWorkflowRo,
} from '@teable/openapi';
import { isPlainObject } from 'lodash';
import get from 'lodash/get';
import { nanoid } from 'nanoid';
import { ClsService } from 'nestjs-cls';
import { CustomHttpException } from '../../custom.exception';
import { Events, RecordCreateEvent, RecordUpdateEvent } from '../../event-emitter/events';
import type { ButtonClickEvent } from '../../event-emitter/events/table/button.event';
import type { IClsStore } from '../../types/cls';
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

@Injectable()
export class AutomationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly recordOpenApiService: RecordOpenApiService,
    private readonly recordService: RecordService,
    private readonly mailSenderService: MailSenderService,
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

  async runManualTest(baseId: string, workflowId: string, nodeId?: string) {
    const workflow = await this.findWorkflow(baseId, workflowId);
    return this.runSnapshot(workflow, this.getDraftSnapshot(workflow), {
      triggerType: 'manual',
      trigger: { baseId, workflowId, manual: true },
      startNodeId: nodeId,
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
      WHERE "base_id" = ${baseId} AND "workflow_id" = ${workflowId}
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
      await this.runMatchedWorkflows(baseId, 'recordCreatedOrUpdated', {
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
      await this.runMatchedWorkflows(baseId, 'recordCreatedOrUpdated', {
        tableId: event.payload.tableId,
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
      await this.runMatchedWorkflows(baseId, 'recordCreatedOrUpdated', {
        tableId: event.payload.tableId,
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
    params: { triggerType: string; trigger: Record<string, unknown>; startNodeId?: string }
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
      trigger,
      nodes: {},
      action: {},
      logic: {},
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
          await this.runFromNode(startNode, snapshot, runtime, steps);
        }
      );

      const output = { trigger: runtime.trigger, action: runtime.action, logic: runtime.logic };
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
    steps: IRuntimeStep[]
  ) {
    const visited = new Map<string, number>();
    const runNode = async (node: IWorkflowNode): Promise<void> => {
      const count = visited.get(node.id) ?? 0;
      if (count > 8) {
        throw new Error(`Workflow loop detected at node ${node.id}`);
      }
      visited.set(node.id, count + 1);

      const output = await this.executeNode(node, runtime, steps);
      if (node.type === 'condition') {
        const branchEdges = this.getConditionBranchEdges(node, snapshot.edges, output);
        for (const edge of branchEdges) {
          const next = snapshot.nodes.find((item) => item.id === edge.target);
          if (next) await runNode(next);
        }
        const mergeEdges = snapshot.edges.filter(
          (edge) => edge.source === node.id && !edge.sourceHandle
        );
        for (const edge of mergeEdges) {
          const next = snapshot.nodes.find((item) => item.id === edge.target);
          if (next) await runNode(next);
        }
        return;
      }

      const nextEdges = snapshot.edges.filter((edge) => edge.source === node.id);
      for (const edge of nextEdges) {
        const next = snapshot.nodes.find((item) => item.id === edge.target);
        if (next) await runNode(next);
      }
    };

    await runNode(startNode);
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
        const res = await this.recordOpenApiService.createRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          typecast: true,
          records: [{ fields }],
        });
        return res.records;
      }
      case 'getRecords': {
        const tableId = this.requiredString(config.tableId, 'tableId');
        const res = await this.recordService.getRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId: this.optionalString(config.viewId),
          skip: Number(config.skip || 0),
          take: Number(config.take || 100),
          filter: config.filter as never,
        });
        return res.records;
      }
      case 'updateRecord': {
        const tableId = this.requiredString(config.tableId, 'tableId');
        const recordId =
          this.optionalString(config.recordId) ??
          this.optionalString(get(runtime, 'trigger.record.id'));
        if (!recordId) throw new Error('recordId is required');
        const fields = this.objectValue(config.fields, 'fields');
        return this.recordOpenApiService.updateRecord(tableId, recordId, {
          fieldKeyType: FieldKeyType.Id,
          typecast: true,
          record: { fields },
        });
      }
      case 'sendEmail': {
        const to = config.to;
        const subject = this.requiredString(config.subject, 'subject');
        const body = this.requiredString(config.body, 'body');
        await this.mailSenderService.sendMail({
          to: Array.isArray(to) ? to.join(',') : this.requiredString(to, 'to'),
          subject,
          html: body,
          text: body.replace(/<[^>]+>/g, ' '),
          senderName: this.optionalString(config.senderName),
          cc: this.optionalString(config.cc),
          bcc: this.optionalString(config.bcc),
          replyTo: this.optionalString(config.replyTo),
        });
        return { sent: true };
      }
      case 'httpRequest': {
        const url = this.requiredString(config.url, 'url');
        const method = this.optionalString(config.method)?.toUpperCase() ?? 'GET';
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Only HTTP and HTTPS requests are supported');
        }
        const response = await fetch(url, {
          method,
          headers: this.objectValue(config.headers ?? {}, 'headers') as Record<string, string>,
          body: method === 'GET' ? undefined : this.bodyValue(config.body),
        });
        const text = await response.text();
        return {
          status: response.status,
          ok: response.ok,
          body: text.slice(0, 10000),
        };
      }
      default:
        throw new Error(`Unsupported workflow action: ${node.type}`);
    }
  }

  private getConditionBranchEdges(node: IWorkflowNode, edges: IWorkflowEdge[], output: unknown) {
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const result = Boolean((output as { result?: boolean })?.result);
    return outgoing.filter((edge) => edge.sourceHandle === String(result));
  }

  private storeNodeOutput(node: IWorkflowNode, output: unknown, runtime: IRuntimeContext) {
    runtime.nodes[node.id] = output;
    if (node.category === 'action') runtime.action[node.id] = output;
    if (node.category === 'logic') runtime.logic[node.id] = output;
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
    const where: Prisma.WorkflowRunWhereInput = { baseId, workflowId };
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
        trigger,
        nodes: {},
        action: {},
        logic: {},
      });
    }
    return true;
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
}
