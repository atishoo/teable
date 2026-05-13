/* eslint-disable sonarjs/no-identical-functions */
import { Injectable, Optional } from '@nestjs/common';
import type {
  IAttachmentCellValue,
  IAttachmentItem,
  IButtonFieldCellValue,
  IButtonFieldOptions,
  IFieldAIConfig,
  IFieldVo,
  IMakeOptional,
} from '@teable/core';
import {
  FieldAIActionType,
  FieldKeyType,
  FieldType,
  HttpErrorCode,
  ViewType,
  generateTaskId,
  getActionTriggerChannel,
} from '@teable/core';
import type { ITableActionKey } from '@teable/core';
import { DataPrismaService } from '@teable/db-data-prisma';
import { PrismaService } from '@teable/db-main-prisma';
import {
  CreateRecordAction,
  ICreateRecordsRo,
  IUpdateRecordsRo,
  UpdateRecordAction,
} from '@teable/openapi';
import type {
  IAutoFillCellVo,
  IAutoFillFieldRo,
  IAutoFillFieldVo,
  IRecordHistoryItemVo,
  ICreateRecordsVo,
  IFormSubmitRo,
  IGetRecordHistoryQuery,
  IRecord,
  IRecordHistoryVo,
  IRecordInsertOrderRo,
  IUpdateRecordRo,
} from '@teable/openapi';
import { isEmpty, keyBy, pick } from 'lodash';
import { ClsService } from 'nestjs-cls';
import { IThresholdConfig, ThresholdConfig } from '../../../configs/threshold.config';
import { CustomHttpException } from '../../../custom.exception';
import { EventEmitterService } from '../../../event-emitter/event-emitter.service';
import { Events } from '../../../event-emitter/events';
import { ButtonClickEvent } from '../../../event-emitter/events/table/button.event';
import { ShareDbService } from '../../../share-db/share-db.service';
import type { IClsStore } from '../../../types/cls';
import { extractFieldReferences } from '../../../utils';
import { retryOnDeadlock } from '../../../utils/retry-decorator';
import { AiService } from '../../ai/ai.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { getPublicFullStorageUrl } from '../../attachments/plugins/utils';
import { FieldService } from '../../field/field.service';
import { createFieldInstanceByRaw } from '../../field/model/factory';
import { TableDomainQueryService } from '../../table-domain';
import { RecordModifyService } from '../record-modify/record-modify.service';
import { RecordModifySharedService } from '../record-modify/record-modify.shared.service';
import type { IRecordInnerRo } from '../record.service';
import { RecordService } from '../record.service';
import type { IUpdateRecordsInternalRo } from '../type';

type IAiFillTaskSnapshot = {
  tableId: string;
  fieldId: string;
  recordIds: string[];
  completedCount: number;
  totalCount: number;
  visitedFieldIds?: string[];
};

const AI_FILL_TASK_TYPE = 'text';
const TASK_STATUS_PROCESSING = 'processing';
const TASK_STATUS_COMPLETED = 'completed';
const TASK_STATUS_FAILED = 'failed';
const TASK_STATUS_CANCELLED = 'cancelled';

@Injectable()
export class RecordOpenApiService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly dataPrismaService: DataPrismaService,
    private readonly recordService: RecordService,
    private readonly attachmentsService: AttachmentsService,
    private readonly recordModifyService: RecordModifyService,
    @ThresholdConfig() private readonly thresholdConfig: IThresholdConfig,
    private readonly recordModifySharedService: RecordModifySharedService,
    private readonly tableDomainQueryService: TableDomainQueryService,
    private readonly fieldService: FieldService,
    private readonly cls: ClsService<IClsStore>,
    private readonly eventEmitterService: EventEmitterService,
    @Optional() private readonly aiService?: AiService,
    @Optional() private readonly shareDbService?: ShareDbService
  ) {}

  @retryOnDeadlock()
  async multipleCreateRecords(
    tableId: string,
    createRecordsRo: ICreateRecordsRo,
    ignoreMissingFields: boolean = false,
    isAiInternal?: string
  ): Promise<ICreateRecordsVo> {
    const res = await this.prismaService.$tx(
      async () =>
        this.recordModifyService.multipleCreateRecords(
          tableId,
          createRecordsRo,
          ignoreMissingFields
        ),
      { timeout: this.thresholdConfig.bigTransactionTimeout }
    );

    const appId = this.cls.get('appId');
    if (appId) {
      this.cls.set('skipRecordAuditLog', true);
      await this.recordService.emitRecordAuditLogEvent(
        CreateRecordAction.AppRecordCreate,
        tableId,
        createRecordsRo.records?.length ?? 0,
        appId
      );
    } else if (isAiInternal) {
      this.cls.set('skipRecordAuditLog', true);
      this.cls.set('user.id', 'aiRobot');
      await this.recordService.emitRecordAuditLogEvent(
        CreateRecordAction.AiRecordCreate,
        tableId,
        createRecordsRo.records?.length ?? 0
      );
    }

    if (!isAiInternal) {
      await this.autoFillDependentFieldsForUpdatedRecords(
        tableId,
        res.records.map((record, index) => ({
          id: record.id,
          fields: createRecordsRo.records?.[index]?.fields ?? record.fields,
        })),
        createRecordsRo.fieldKeyType ?? FieldKeyType.Name
      );
    }

    return res;
  }

  /**
   * create records without any ops, only typecast and sql
   * @param tableId
   * @param createRecordsRo
   */
  async createRecordsOnlySql(tableId: string, createRecordsRo: ICreateRecordsRo): Promise<void> {
    await this.prismaService.$tx(async () => {
      return await this.recordModifyService.createRecordsOnlySql(tableId, createRecordsRo);
    });
  }

  async createRecords(
    tableId: string,
    createRecordsRo: ICreateRecordsRo & { records: IMakeOptional<IRecordInnerRo, 'id'>[] },
    ignoreMissingFields: boolean = false
  ): Promise<ICreateRecordsVo> {
    const res = await this.prismaService.$tx(
      async () =>
        this.recordModifyService.multipleCreateRecords(
          tableId,
          createRecordsRo,
          ignoreMissingFields
        ),
      { timeout: this.thresholdConfig.bigTransactionTimeout }
    );

    await this.autoFillDependentFieldsForUpdatedRecords(
      tableId,
      res.records.map((record, index) => ({
        id: record.id,
        fields: createRecordsRo.records?.[index]?.fields ?? record.fields,
      })),
      createRecordsRo.fieldKeyType ?? FieldKeyType.Name
    );

    return res;
  }

  @retryOnDeadlock()
  async updateRecords(
    tableId: string,
    updateRecordsRo: IUpdateRecordsRo,
    windowId?: string,
    isAiInternal?: string
  ) {
    const res = await this.recordModifyService.updateRecords(
      tableId,
      updateRecordsRo as IUpdateRecordsInternalRo,
      windowId
    );

    const appId = this.cls.get('appId');
    if (appId) {
      this.cls.set('skipRecordAuditLog', true);
      await this.recordService.emitRecordAuditLogEvent(
        UpdateRecordAction.AppRecordUpdate,
        tableId,
        updateRecordsRo.records?.length ?? 0,
        appId
      );
    } else if (isAiInternal) {
      this.cls.set('skipRecordAuditLog', true);
      this.cls.set('user.id', 'aiRobot');
      await this.recordService.emitRecordAuditLogEvent(
        UpdateRecordAction.AiRecordUpdate,
        tableId,
        updateRecordsRo.records?.length ?? 0
      );
    }

    if (!isAiInternal) {
      await this.autoFillDependentFieldsForUpdatedRecords(
        tableId,
        updateRecordsRo.records ?? [],
        updateRecordsRo.fieldKeyType ?? FieldKeyType.Name
      );
    }

    return res;
  }

  async simpleUpdateRecords(tableId: string, updateRecordsRo: IUpdateRecordsRo) {
    return await this.recordModifyService.simpleUpdateRecords(
      tableId,
      updateRecordsRo as IUpdateRecordsInternalRo
    );
  }

  async updateRecord(
    tableId: string,
    recordId: string,
    updateRecordRo: IUpdateRecordRo,
    windowId?: string,
    isAiInternal?: string
  ): Promise<IRecord> {
    await this.updateRecords(
      tableId,
      {
        ...updateRecordRo,
        records: [{ id: recordId, fields: updateRecordRo.record.fields }],
      },
      windowId,
      isAiInternal
    );

    const snapshots = await this.recordService.getSnapshotBulkWithPermission(
      tableId,
      [recordId],
      undefined,
      updateRecordRo.fieldKeyType || FieldKeyType.Name,
      undefined,
      true
    );

    if (snapshots.length !== 1) {
      throw new CustomHttpException('update record failed', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.record.updateFailed',
        },
      });
    }

    return snapshots[0].data;
  }

  private getFieldKeyMap(fields: IFieldVo[], fieldKeyType: FieldKeyType) {
    return new Map(
      fields.map((field) => {
        const key =
          fieldKeyType === FieldKeyType.Id
            ? field.id
            : fieldKeyType === FieldKeyType.DbFieldName
              ? field.dbFieldName
              : field.name;
        return [key, field.id];
      })
    );
  }

  private getUpdatedFieldIds(
    records: Array<{ fields?: Record<string, unknown> }>,
    fields: IFieldVo[],
    fieldKeyType: FieldKeyType
  ) {
    const fieldKeyMap = this.getFieldKeyMap(fields, fieldKeyType);
    return Array.from(
      new Set(
        records.flatMap((record) =>
          Object.keys(record.fields ?? {})
            .map((fieldKey) => fieldKeyMap.get(fieldKey))
            .filter(Boolean)
        ) as string[]
      )
    );
  }

  private getAiConfigReferenceFieldIds(aiConfig?: IFieldAIConfig | null) {
    if (!aiConfig) return [];
    const config = aiConfig as Record<string, unknown>;
    const sourceFieldId = typeof config.sourceFieldId === 'string' ? config.sourceFieldId : null;
    const prompt = typeof config.prompt === 'string' ? config.prompt : '';
    return Array.from(
      new Set([...(sourceFieldId ? [sourceFieldId] : []), ...extractFieldReferences(prompt)])
    );
  }

  private stringifyCellValue(value: unknown): string {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>;
            return String(record.title ?? record.name ?? record.id ?? JSON.stringify(record));
          }
          return String(item);
        })
        .join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private getSelectChoiceNames(field: IFieldVo) {
    const options = field.options as { choices?: Array<{ name?: string }> } | undefined;
    return options?.choices?.map((choice) => choice.name).filter(Boolean) ?? [];
  }

  private buildFieldAiPrompt(field: IFieldVo, fields: IFieldVo[], record: IRecord) {
    const aiConfig = field.aiConfig as (IFieldAIConfig & Record<string, unknown>) | undefined;
    if (!aiConfig?.type) {
      throw new CustomHttpException('AI field config is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }

    const fieldMap = new Map(fields.map((item) => [item.id, item]));
    const recordFields = record.fields as Record<string, unknown>;
    const sourceFieldId =
      typeof aiConfig.sourceFieldId === 'string' ? aiConfig.sourceFieldId : undefined;
    const sourceField = sourceFieldId ? fieldMap.get(sourceFieldId) : undefined;
    const sourceValue = sourceFieldId ? this.stringifyCellValue(recordFields[sourceFieldId]) : '';
    const choiceNames = this.getSelectChoiceNames(field);
    const choiceInstruction = choiceNames.length
      ? `可选项：${choiceNames.map((name) => `"${name}"`).join(', ')}`
      : '';
    const attachPrompt = typeof aiConfig.attachPrompt === 'string' ? aiConfig.attachPrompt : '';

    const customPrompt =
      typeof aiConfig.prompt === 'string'
        ? aiConfig.prompt.replace(/\{(fld[a-zA-Z0-9]+)\}/g, (_match, fieldId: string) => {
            const referencedField = fieldMap.get(fieldId);
            return this.stringifyCellValue(recordFields[fieldId]) || referencedField?.name || '';
          })
        : '';

    const taskInstruction = (() => {
      switch (aiConfig.type) {
        case FieldAIActionType.Summary:
          return `请总结来源字段"${sourceField?.name ?? sourceFieldId}"的内容。`;
        case FieldAIActionType.Extraction:
          return `请从来源字段"${sourceField?.name ?? sourceFieldId}"中提取适合目标字段的值。`;
        case FieldAIActionType.Translation:
          return `请将来源字段"${sourceField?.name ?? sourceFieldId}"翻译为${String(
            aiConfig.targetLanguage ?? ''
          )}。`;
        case FieldAIActionType.Improvement:
          return `请润色改写来源字段"${sourceField?.name ?? sourceFieldId}"的内容。`;
        case FieldAIActionType.Classification:
          return `请根据来源字段"${sourceField?.name ?? sourceFieldId}"进行单选分类。`;
        case FieldAIActionType.Tag:
          return `请根据来源字段"${sourceField?.name ?? sourceFieldId}"生成多选标签。`;
        case FieldAIActionType.Rating:
          return `请根据来源字段"${sourceField?.name ?? sourceFieldId}"给出评分。`;
        case FieldAIActionType.Customization:
        case FieldAIActionType.ImageCustomization:
          return customPrompt;
        case FieldAIActionType.ImageGeneration:
          return `请根据目标字段配置生成适合的值。`;
        default:
          return `请为目标字段生成适合的值。`;
      }
    })();

    const outputInstruction = (() => {
      if (field.type === FieldType.MultipleSelect) return '返回 JSON：{"value":["选项名"]}。';
      if (field.type === FieldType.SingleSelect) return '返回 JSON：{"value":"选项名"}。';
      if (field.type === FieldType.Number || field.type === FieldType.Rating) {
        return '返回 JSON：{"value":数字}。';
      }
      if (field.type === FieldType.Date) return '返回 JSON：{"value":"YYYY-MM-DD"}。';
      return '返回 JSON：{"value":"生成内容"}。';
    })();

    return [
      '你正在为表格记录生成 AI 字段值。',
      `目标字段：${field.name}`,
      `目标字段类型：${field.type}`,
      sourceField ? `来源字段：${sourceField.name}` : '',
      sourceField ? `来源字段值：${sourceValue || '空'}` : '',
      choiceInstruction,
      taskInstruction,
      attachPrompt,
      outputInstruction,
      '只返回 JSON，不要返回 Markdown，不要解释。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseAIResponseValue(text: string) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const content = fenced?.[1]?.trim() ?? trimmed;
    const jsonText = content.startsWith('{') ? content : content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) return content;
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(parsed, 'value')) return parsed.value;
      if (Object.prototype.hasOwnProperty.call(parsed, 'result')) return parsed.result;
      return parsed;
    } catch {
      return content;
    }
  }

  private normalizeAIFieldValue(field: IFieldVo, rawValue: unknown) {
    if (rawValue == null) return null;

    if (field.type === FieldType.MultipleSelect) {
      if (Array.isArray(rawValue)) return rawValue.map((item) => String(item)).filter(Boolean);
      return String(rawValue)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (field.type === FieldType.Number || field.type === FieldType.Rating) {
      const numberValue = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
      return Number.isFinite(numberValue) ? numberValue : rawValue;
    }

    if (field.type === FieldType.SingleSelect || field.type === FieldType.Date) {
      return Array.isArray(rawValue) ? String(rawValue[0] ?? '') : String(rawValue).trim();
    }

    return typeof rawValue === 'string' ? rawValue.trim() : this.stringifyCellValue(rawValue);
  }

  private async getTableBaseId(tableId: string) {
    const table = await this.prismaService.txClient().tableMeta.findUniqueOrThrow({
      where: { id: tableId },
      select: { baseId: true },
    });
    return table.baseId;
  }

  private async assertAiFieldReady(tableId: string, fieldId: string) {
    const fields = await this.fieldService.getFieldsByQuery(tableId);
    const field = fields.find((item) => item.id === fieldId);
    if (!field?.aiConfig?.type || !field.aiConfig.modelKey) {
      throw new CustomHttpException('AI field config is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }
    if (!this.aiService) {
      throw new CustomHttpException('AI service is not available', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }
  }

  private parseAiFillTaskSnapshot(snapshot?: string | null): IAiFillTaskSnapshot | null {
    if (!snapshot) return null;
    try {
      const value = JSON.parse(snapshot) as Partial<IAiFillTaskSnapshot>;
      if (
        typeof value.tableId !== 'string' ||
        typeof value.fieldId !== 'string' ||
        !Array.isArray(value.recordIds)
      ) {
        return null;
      }
      const recordIds = value.recordIds.filter(
        (recordId): recordId is string => typeof recordId === 'string'
      );
      return {
        tableId: value.tableId,
        fieldId: value.fieldId,
        recordIds,
        completedCount: typeof value.completedCount === 'number' ? value.completedCount : 0,
        totalCount: typeof value.totalCount === 'number' ? value.totalCount : recordIds.length,
        visitedFieldIds: Array.isArray(value.visitedFieldIds)
          ? value.visitedFieldIds.filter(
              (fieldId): fieldId is string => typeof fieldId === 'string'
            )
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private async updateAiFillTaskSnapshot(
    taskId: string,
    patch: Partial<Pick<IAiFillTaskSnapshot, 'completedCount'>>
  ) {
    const task = await this.prismaService.txClient().task.findUnique({
      where: { id: taskId },
      select: { snapshot: true },
    });
    const snapshot = this.parseAiFillTaskSnapshot(task?.snapshot);
    if (!snapshot) return;
    await this.prismaService.txClient().task.update({
      where: { id: taskId },
      data: {
        snapshot: JSON.stringify({
          ...snapshot,
          ...patch,
        }),
      },
    });
  }

  private emitTaskAction(
    tableId: string,
    actionKey: ITableActionKey,
    payload?: Record<string, unknown>
  ) {
    if (!this.shareDbService) return;
    const channel = getActionTriggerChannel(tableId);
    const presence = this.shareDbService.connect().getPresence(channel);
    const localPresence = presence.create(tableId);
    localPresence.submit([{ actionKey, payload }], () => undefined);
  }

  private async createAiFillTask(
    tableId: string,
    fieldId: string,
    recordIds: string[],
    visitedFieldIds = new Set<string>()
  ) {
    const taskId = generateTaskId();
    const userId = this.cls.get('user.id') ?? 'system';
    const snapshot: IAiFillTaskSnapshot = {
      tableId,
      fieldId,
      recordIds,
      completedCount: 0,
      totalCount: recordIds.length,
      visitedFieldIds: [...visitedFieldIds],
    };

    await this.prismaService.txClient().task.create({
      data: {
        id: taskId,
        type: AI_FILL_TASK_TYPE,
        status: TASK_STATUS_PROCESSING,
        snapshot: JSON.stringify(snapshot),
        createdBy: userId,
        lastModifiedBy: userId,
        runs: {
          create: {
            status: TASK_STATUS_PROCESSING,
            snapshot: JSON.stringify(snapshot),
            startedTime: new Date(),
          },
        },
      },
    });

    recordIds.forEach((recordId) =>
      this.emitTaskAction(tableId, 'taskProcessing', { recordId, fieldId })
    );
    return taskId;
  }

  private scheduleAiFillTask(taskId: string) {
    const run = () => {
      void this.runAiFillTask(taskId);
    };
    if (typeof setImmediate === 'function') {
      setImmediate(run);
      return;
    }
    setTimeout(run, 0);
  }

  private async isTaskCancelled(taskId: string) {
    const task = await this.prismaService.txClient().task.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    return task?.status === TASK_STATUS_CANCELLED;
  }

  private async completeAiFillTask(taskId: string, status: string, errorMsg?: string) {
    const task = await this.prismaService.txClient().task.findUnique({
      where: { id: taskId },
      select: { snapshot: true },
    });
    const snapshot = this.parseAiFillTaskSnapshot(task?.snapshot);
    const now = new Date();
    const startedRun = await this.prismaService.txClient().taskRun.findFirst({
      where: { taskId },
      orderBy: { createdTime: 'asc' },
      select: { id: true, startedTime: true },
    });
    const spent = startedRun?.startedTime
      ? Math.max(0, now.getTime() - startedRun.startedTime.getTime())
      : undefined;

    await this.prismaService.txClient().task.update({
      where: { id: taskId },
      data: { status },
    });
    await this.prismaService.txClient().taskRun.updateMany({
      where: { taskId, status: TASK_STATUS_PROCESSING },
      data: {
        status,
        spent,
        errorMsg,
      },
    });

    if (!snapshot) return;
    const actionKey =
      status === TASK_STATUS_COMPLETED
        ? 'taskCompleted'
        : status === TASK_STATUS_CANCELLED
          ? 'taskCancelled'
          : 'taskFailed';
    snapshot.recordIds.forEach((recordId) =>
      this.emitTaskAction(snapshot.tableId, actionKey, {
        recordId,
        fieldId: snapshot.fieldId,
        ...(errorMsg ? { errorMsg } : {}),
      })
    );
  }

  private async runAiFillTask(taskId: string) {
    const task = await this.prismaService.txClient().task.findUnique({
      where: { id: taskId },
      select: { snapshot: true },
    });
    const snapshot = this.parseAiFillTaskSnapshot(task?.snapshot);
    if (!snapshot) {
      await this.completeAiFillTask(taskId, TASK_STATUS_FAILED, 'Invalid AI task snapshot');
      return;
    }

    let completedCount = snapshot.completedCount;
    try {
      for (const recordId of snapshot.recordIds) {
        if (await this.isTaskCancelled(taskId)) {
          await this.completeAiFillTask(taskId, TASK_STATUS_CANCELLED);
          return;
        }
        await this.fillAiCellNow(
          snapshot.tableId,
          recordId,
          snapshot.fieldId,
          new Set(snapshot.visitedFieldIds)
        );
        completedCount += 1;
        await this.updateAiFillTaskSnapshot(taskId, { completedCount });
      }
      await this.completeAiFillTask(taskId, TASK_STATUS_COMPLETED);
    } catch (error) {
      await this.completeAiFillTask(
        taskId,
        TASK_STATUS_FAILED,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async fillAiCellNow(
    tableId: string,
    recordId: string,
    fieldId: string,
    visitedFieldIds = new Set<string>()
  ) {
    if (visitedFieldIds.has(fieldId)) return;
    const nextVisitedFieldIds = new Set(visitedFieldIds);
    nextVisitedFieldIds.add(fieldId);

    const fields = await this.fieldService.getFieldsByQuery(tableId);
    const field = fields.find((item) => item.id === fieldId);
    if (!field?.aiConfig?.type || !field.aiConfig.modelKey) {
      throw new CustomHttpException('AI field config is not set', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }
    if (!this.aiService) {
      throw new CustomHttpException('AI service is not available', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.ai.configurationNotSet',
        },
      });
    }

    const [snapshot] = await this.recordService.getSnapshotBulkWithPermission(
      tableId,
      [recordId],
      undefined,
      FieldKeyType.Id,
      undefined,
      true
    );
    if (!snapshot?.data) {
      throw new CustomHttpException('record not found', HttpErrorCode.NOT_FOUND, {
        localization: {
          i18nKey: 'httpErrors.record.notFound',
        },
      });
    }

    const baseId = await this.getTableBaseId(tableId);
    const prompt = this.buildFieldAiPrompt(field, fields, snapshot.data);
    const text = await this.aiService.generateText(baseId, {
      prompt,
      modelKey: field.aiConfig.modelKey,
    });
    const value = this.normalizeAIFieldValue(field, this.parseAIResponseValue(text));

    await this.updateRecord(
      tableId,
      recordId,
      {
        fieldKeyType: FieldKeyType.Id,
        typecast: true,
        record: {
          fields: {
            [fieldId]: value,
          },
        },
      },
      undefined,
      'true'
    );

    await this.autoFillDependentFieldsForUpdatedRecords(
      tableId,
      [{ id: recordId, fields: { [fieldId]: value } }],
      FieldKeyType.Id,
      nextVisitedFieldIds
    );
  }

  async autoFillCell(
    tableId: string,
    recordId: string,
    fieldId: string,
    visitedFieldIds = new Set<string>()
  ): Promise<IAutoFillCellVo> {
    if (visitedFieldIds.has(fieldId)) {
      return { taskId: '' };
    }

    await this.assertAiFieldReady(tableId, fieldId);
    const taskId = await this.createAiFillTask(tableId, fieldId, [recordId], visitedFieldIds);
    this.scheduleAiFillTask(taskId);
    return { taskId };
  }

  async autoFillField(
    tableId: string,
    fieldId: string,
    query: IAutoFillFieldRo
  ): Promise<IAutoFillFieldVo> {
    const { ids } = await this.recordService.getDocIdsByQuery(tableId, query, true);
    const recordIds: string[] = [];

    for (const recordId of ids) {
      if (query.mode === 'emptyOnly') {
        const [snapshot] = await this.recordService.getSnapshotBulkWithPermission(
          tableId,
          [recordId],
          { [fieldId]: true },
          FieldKeyType.Id,
          undefined,
          true
        );
        if (snapshot?.data?.fields?.[fieldId] != null) continue;
      }

      recordIds.push(recordId);
    }

    await this.assertAiFieldReady(tableId, fieldId);
    const taskId = recordIds.length
      ? await this.createAiFillTask(tableId, fieldId, recordIds)
      : null;
    if (taskId) this.scheduleAiFillTask(taskId);

    return {
      taskId,
      rowCount: ids.length,
      processedCount: 0,
      isLimited: ids.length >= 1000,
    };
  }

  async stopFillField(tableId: string, fieldId: string) {
    const tasks = await this.prismaService.txClient().task.findMany({
      where: {
        type: AI_FILL_TASK_TYPE,
        status: TASK_STATUS_PROCESSING,
        snapshot: {
          contains: `"tableId":"${tableId}"`,
        },
      },
      select: { id: true, snapshot: true },
    });
    const matchedTasks = tasks.filter((task) => {
      const snapshot = this.parseAiFillTaskSnapshot(task.snapshot);
      return snapshot?.tableId === tableId && snapshot.fieldId === fieldId;
    });
    if (!matchedTasks.length) return null;

    const taskIds = matchedTasks.map((task) => task.id);
    await this.prismaService.txClient().task.updateMany({
      where: { id: { in: taskIds } },
      data: { status: TASK_STATUS_CANCELLED },
    });
    await this.prismaService.txClient().taskRun.updateMany({
      where: { taskId: { in: taskIds }, status: TASK_STATUS_PROCESSING },
      data: { status: TASK_STATUS_CANCELLED },
    });
    matchedTasks.forEach((task) => {
      const snapshot = this.parseAiFillTaskSnapshot(task.snapshot);
      snapshot?.recordIds.forEach((recordId) =>
        this.emitTaskAction(tableId, 'taskCancelled', { recordId, fieldId })
      );
    });
    return null;
  }

  async autoFillDependentFieldsForUpdatedRecords(
    tableId: string,
    records: Array<{ id: string; fields?: Record<string, unknown> }>,
    fieldKeyType: FieldKeyType,
    visitedFieldIds = new Set<string>()
  ) {
    if (!records.length) return;

    const fields = await this.fieldService.getFieldsByQuery(tableId);
    const updatedFieldIds = this.getUpdatedFieldIds(records, fields, fieldKeyType);
    if (!updatedFieldIds.length) return;

    const updatedFieldIdSet = new Set(updatedFieldIds);
    const dependentAiFields = fields.filter((field) => {
      const { aiConfig } = field;
      if (visitedFieldIds.has(field.id)) return false;
      if (!aiConfig?.type || !aiConfig.isAutoFill) return false;
      return this.getAiConfigReferenceFieldIds(aiConfig).some((fieldId) =>
        updatedFieldIdSet.has(fieldId)
      );
    });

    for (const record of records) {
      for (const field of dependentAiFields) {
        try {
          await this.autoFillCell(tableId, record.id, field.id, visitedFieldIds);
        } catch {
          // Source field updates should not be rolled back when an automatic AI refresh fails.
        }
      }
    }
  }

  async deleteRecord(tableId: string, recordId: string, windowId?: string) {
    return this.recordModifyService.deleteRecord(tableId, recordId, windowId);
  }

  async deleteRecords(tableId: string, recordIds: string[], windowId?: string) {
    return this.recordModifyService.deleteRecords(tableId, recordIds, windowId);
  }

  async getRecordHistory(
    tableId: string,
    recordId: string | undefined,
    query: IGetRecordHistoryQuery,
    projectionIds?: string[]
  ): Promise<IRecordHistoryVo> {
    const { cursor, startDate, endDate } = query;
    const limit = 20;

    const dateFilter: { [key: string]: Date } = {};
    if (startDate) {
      dateFilter['gte'] = new Date(startDate);
    }
    if (endDate) {
      dateFilter['lte'] = new Date(endDate);
    }

    const list = await this.dataPrismaService.recordHistory.findMany({
      where: {
        tableId,
        ...(recordId ? { recordId } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { createdTime: dateFilter } : {}),
        ...(projectionIds?.length ? { fieldId: { in: projectionIds } } : {}),
      },
      select: {
        id: true,
        recordId: true,
        fieldId: true,
        before: true,
        after: true,
        createdTime: true,
        createdBy: true,
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        createdTime: 'desc',
      },
    });

    let nextCursor: typeof cursor | undefined = undefined;

    if (list.length > limit) {
      const nextItem = list.pop();
      nextCursor = nextItem?.id;
    }

    const createdBySet: Set<string> = new Set();
    const historyList: IRecordHistoryItemVo[] = [];

    for (const item of list) {
      const { id, recordId, fieldId, before, after, createdTime, createdBy } = item;

      createdBySet.add(createdBy);
      const beforeObj = JSON.parse(before as string);
      const afterObj = JSON.parse(after as string);
      const { meta: beforeMeta, data: beforeData } = beforeObj as IRecordHistoryItemVo['before'];
      const { meta: afterMeta, data: afterData } = afterObj as IRecordHistoryItemVo['after'];
      const { type: beforeType } = beforeMeta;
      const { type: afterType } = afterMeta;

      if (beforeType === FieldType.Attachment) {
        beforeObj.data = await this.recordService.getAttachmentPresignedCellValue(
          beforeData as IAttachmentCellValue
        );
      }

      if (afterType === FieldType.Attachment) {
        afterObj.data = await this.recordService.getAttachmentPresignedCellValue(
          afterData as IAttachmentCellValue
        );
      }

      historyList.push({
        id,
        tableId,
        recordId,
        fieldId,
        before: beforeObj,
        after: afterObj,
        createdTime: createdTime.toISOString(),
        createdBy,
      });
    }

    const userList = await this.prismaService.user.findMany({
      where: {
        id: {
          in: Array.from(createdBySet),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    });

    const handledUserList = userList.map((user) => {
      const { avatar } = user;
      return {
        ...user,
        avatar: avatar && getPublicFullStorageUrl(avatar),
      };
    });

    return {
      historyList,
      userMap: keyBy(handledUserList, 'id'),
      nextCursor,
    };
  }

  private async getValidateAttachmentRecord(tableId: string, recordId: string, fieldId: string) {
    const field = await this.prismaService
      .txClient()
      .field.findFirstOrThrow({
        where: {
          id: fieldId,
          deletedTime: null,
        },
        select: {
          id: true,
          type: true,
          isComputed: true,
        },
      })
      .catch(() => {
        throw new CustomHttpException(`Field ${fieldId} not found`, HttpErrorCode.NOT_FOUND, {
          localization: {
            i18nKey: 'httpErrors.field.notFound',
          },
        });
      });

    if (field.type !== FieldType.Attachment) {
      throw new CustomHttpException('Field is not an attachment', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.field.notAttachment',
        },
      });
    }

    if (field.isComputed) {
      throw new CustomHttpException('Field is computed', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.field.isComputed',
        },
      });
    }

    const recordData = await this.recordService.getRecordsById(tableId, [recordId]);
    const record = recordData.records[0];
    if (!record) {
      throw new CustomHttpException(`Record ${recordId} not found`, HttpErrorCode.NOT_FOUND, {
        localization: {
          i18nKey: 'httpErrors.record.notFound',
        },
      });
    }
    return record;
  }

  async uploadAttachment(
    tableId: string,
    recordId: string,
    fieldId: string,
    file?: Express.Multer.File,
    fileUrl?: string
  ) {
    if (!file && !fileUrl) {
      throw new CustomHttpException('No file or URL provided', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.record.noFileOrUrlProvided',
        },
      });
    }

    const record = await this.getValidateAttachmentRecord(tableId, recordId, fieldId);

    const attachmentItem = file
      ? await this.attachmentsService.uploadFile(file)
      : await this.attachmentsService.uploadFromUrl(fileUrl as string);

    // Update the cell value
    const updateRecordRo: IUpdateRecordRo = {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [fieldId]: ((record.fields[fieldId] || []) as IAttachmentItem[]).concat(attachmentItem),
        },
      },
    };

    return await this.updateRecord(tableId, recordId, updateRecordRo);
  }

  async insertAttachment(
    tableId: string,
    recordId: string,
    fieldId: string,
    attachments: IAttachmentItem[],
    anchorId?: string
  ) {
    if (!attachments.length) {
      throw new CustomHttpException('No attachments provided', HttpErrorCode.VALIDATION_ERROR);
    }

    const record = await this.getValidateAttachmentRecord(tableId, recordId, fieldId);

    // Fetch full attachment data for each attachment item from database

    const current = (record.fields[fieldId] || []) as IAttachmentItem[];
    const anchorIndex = anchorId ? current.findIndex((item) => item.id === anchorId) : -1;
    const next =
      anchorIndex >= 0
        ? [...current.slice(0, anchorIndex + 1), ...attachments, ...current.slice(anchorIndex + 1)]
        : current.concat(attachments);

    const updateRecordRo: IUpdateRecordRo = {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [fieldId]: next,
        },
      },
    };

    return await this.updateRecord(tableId, recordId, updateRecordRo);
  }

  async duplicateRecord(
    tableId: string,
    recordId: string,
    order?: IRecordInsertOrderRo,
    projection?: string[]
  ) {
    const query = { fieldKeyType: FieldKeyType.Id, projection };
    const result = await this.recordService.getRecord(tableId, recordId, query);
    const records = { fields: result.fields };
    const createRecordsRo = {
      fieldKeyType: FieldKeyType.Id,
      order,
      records: [records],
    };
    return await this.prismaService
      .$tx(async () => this.createRecords(tableId, createRecordsRo))
      .then((res) => {
        return res.records[0];
      });
  }

  async buttonClick(tableId: string, recordId: string, fieldId: string) {
    const fieldRaw = await this.prismaService.txClient().field.findFirstOrThrow({
      where: {
        id: fieldId,
        type: FieldType.Button,
        deletedTime: null,
      },
    });

    const fieldInstance = createFieldInstanceByRaw(fieldRaw);
    const options = fieldInstance.options as IButtonFieldOptions;
    const workflowId = options.workflow?.id;
    const workflow = workflowId
      ? await this.prismaService.txClient().workflow.findFirst({
          where: { id: workflowId, deletedTime: null },
          select: { isActive: true },
        })
      : null;
    const isActive = Boolean(workflowId && workflow?.isActive);
    if (!isActive) {
      throw new CustomHttpException(
        `Button field's workflow ${options.workflow?.id} is not active`,
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.workflow.notActive',
          },
        }
      );
    }

    const maxCount = options.maxCount || 0;
    const record = await this.recordService.getRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
    });

    const fieldValue = record.fields[fieldId] as IButtonFieldCellValue;
    const count = fieldValue?.count || 0;
    if (maxCount > 0 && count >= maxCount) {
      throw new CustomHttpException(
        `Button click count ${count} reached max count ${maxCount}`,
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.field.button.clickCountReachedMaxCount',
          },
        }
      );
    }
    const updatedRecord: IRecord = await this.updateRecord(tableId, recordId, {
      record: {
        fields: { [fieldId]: { count: count + 1 } },
      },
      fieldKeyType: FieldKeyType.Id,
    });
    const eventRecord = { ...updatedRecord, fields: { ...updatedRecord.fields } };
    updatedRecord.fields = pick(updatedRecord.fields, [fieldId]);
    await this.eventEmitterService.emitAsync(
      Events.TABLE_BUTTON_CLICK,
      new ButtonClickEvent(
        { tableId, fieldId, record: eventRecord },
        { user: this.cls.get('user'), entry: this.cls.get('entry') }
      )
    );

    return {
      tableId,
      fieldId,
      record: updatedRecord,
    };
  }

  async resetButton(tableId: string, recordId: string, fieldId: string) {
    const fieldRaw = await this.prismaService.txClient().field.findFirstOrThrow({
      where: {
        id: fieldId,
        type: FieldType.Button,
        deletedTime: null,
      },
    });

    const fieldInstance = createFieldInstanceByRaw(fieldRaw);
    const fieldOptions = fieldInstance.options as IButtonFieldOptions;
    if (!fieldOptions.resetCount) {
      throw new CustomHttpException(
        'Button field does not support reset',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.field.button.notSupportReset',
          },
        }
      );
    }

    return await this.updateRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [fieldId]: null,
        },
      },
    });
  }

  public async validateFieldsAndTypecast<
    T extends {
      fields: Record<string, unknown>;
    },
  >(
    tableId: string,
    records: T[],
    fieldKeyType: FieldKeyType = FieldKeyType.Name,
    typecast: boolean = false,
    ignoreMissingFields: boolean = false
  ) {
    const table = await this.tableDomainQueryService.getTableDomainById(tableId);
    return this.recordModifySharedService.validateFieldsAndTypecast(
      table,
      records,
      fieldKeyType,
      typecast,
      ignoreMissingFields
    );
  }

  async formSubmit(
    tableId: string,
    formSubmitRo: IFormSubmitRo,
    options?: { includeHiddenField?: boolean }
  ): Promise<IRecord> {
    const { viewId, fields, typecast } = formSubmitRo;
    const { includeHiddenField = false } = options ?? {};

    // 1. Validate view exists and is Form type
    await this.prismaService.view
      .findFirstOrThrow({
        where: { id: viewId, tableId, deletedTime: null, type: ViewType.Form },
      })
      .catch(() => {
        throw new CustomHttpException('View is not a form', HttpErrorCode.RESTRICTED_RESOURCE, {
          localization: {
            i18nKey: 'httpErrors.share.viewTypeNotAllowed',
          },
        });
      });

    // 2. Check field visibility - only allow submission of visible fields
    const visibleFields = await this.fieldService.getFieldsByQuery(tableId, {
      viewId,
      filterHidden: !includeHiddenField,
    });
    const visibleFieldIdSet = new Set(visibleFields.map(({ id }) => id));

    if (
      (!visibleFields.length && !isEmpty(fields)) ||
      Object.keys(fields).some((fieldId) => !visibleFieldIdSet.has(fieldId))
    ) {
      throw new CustomHttpException(
        'The form contains hidden fields, submission not allowed.',
        HttpErrorCode.RESTRICTED_RESOURCE,
        {
          localization: {
            i18nKey: 'httpErrors.share.hiddenFieldsSubmissionNotAllowed',
          },
        }
      );
    }

    // 3. Create record with form entry context
    const { records } = await this.prismaService.$tx(async () => {
      this.cls.set('entry', { type: 'form', id: viewId });
      this.cls.set('skipRecordAuditLog', true);
      return this.createRecords(tableId, {
        records: [{ fields }],
        fieldKeyType: FieldKeyType.Id,
        typecast,
      });
    });

    // 4. Emit form audit log
    await this.emitFormAuditLog(tableId, records.length);

    // 5. Validate record creation
    if (records.length === 0) {
      throw new CustomHttpException(
        'The number of successful submit records is 0',
        HttpErrorCode.INTERNAL_SERVER_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.share.submitRecordsError',
          },
        }
      );
    }

    return records[0];
  }

  private async emitFormAuditLog(tableId: string, length: number) {
    const userId = this.cls.get('user.id');
    const origin = this.cls.get('origin');

    await this.cls.run(async () => {
      this.cls.set('user.id', userId);
      this.cls.set('origin', origin!);
      await this.eventEmitterService.emitAsync(Events.TABLE_RECORD_CREATE_RELATIVE, {
        action: CreateRecordAction.FormSubmit,
        resourceId: tableId,
        recordCount: length,
      });
    });
  }
}
