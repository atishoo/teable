import { useQueryClient } from '@tanstack/react-query';
import {
  FieldType,
  fieldVoSchema,
  type IButtonFieldOptions,
  type IConvertFieldRo,
  type IFieldVo,
} from '@teable/core';
import {
  BaseNodeResourceType,
  convertField,
  createBaseNode,
  getWorkflow,
  type IBaseNodeWorkflowResourceMeta,
} from '@teable/openapi';
import type { IFieldInstance } from '@teable/sdk';
import { useBaseId, useField, useTableId } from '@teable/sdk';
import { ReactQueryKeys } from '@teable/sdk/config';
import { isEmpty } from 'lodash';
import { useWorkFlowPanelStore } from '@/features/app/automation/workflow-panel/useWorkFlowPaneStore';
import {
  FieldSetting as FieldSettingInner,
  FieldOperator,
} from '@/features/app/components/field-setting';
import { useFieldSettingStore } from './useFieldSettingStore';

export const FieldSetting = () => {
  const { setting, closeSetting } = useFieldSettingStore();
  const field = useField(setting?.fieldId);
  const order = setting?.order;
  const baseId = useBaseId() as string;
  const tableId = useTableId() as string;
  const queryClient = useQueryClient();

  const handleOpenWorkflowPanel = async (field?: IFieldVo | IFieldInstance) => {
    const { from = '', openModal } = useWorkFlowPanelStore.getState();
    if (from === 'buttonFieldOptions' && field && field.type === FieldType.Button) {
      const options = field.options as IButtonFieldOptions;
      const workflow = options.workflow ?? {};
      let workflowId = workflow.id ?? '';
      let workflowName = workflow.name ?? field.name;
      let isActive = workflow.isActive ?? false;
      if (isEmpty(workflowId)) {
        const result = await createBaseNode(baseId, {
          resourceType: BaseNodeResourceType.Workflow,
          name: field.name,
          trigger: {
            type: 'buttonClick', // WorkflowTriggerType.ButtonClick
            config: {
              tableId,
              watchFieldIds: [field.id],
            },
          },
          isActive: false,
        });
        const resourceMeta = result.data.resourceMeta as IBaseNodeWorkflowResourceMeta;
        workflowId = result.data.resourceId;
        workflowName = resourceMeta.name;
        isActive = resourceMeta.isActive ?? false;
      } else {
        const workflowVo = await getWorkflow(baseId, workflowId).then((res) => res.data);
        workflowName = workflowVo.name ?? workflowName;
        isActive = workflowVo.isActive ?? isActive;
      }

      if (
        workflow.id !== workflowId ||
        workflow.name !== workflowName ||
        workflow.isActive !== isActive
      ) {
        const fieldVo = field as IFieldVo;
        const fieldRo: IConvertFieldRo = {
          type: FieldType.Button,
          name: fieldVo.name,
          description: fieldVo.description,
          dbFieldName: fieldVo.dbFieldName,
          unique: fieldVo.unique,
          notNull: fieldVo.notNull,
          isLookup: fieldVo.isLookup,
          isConditionalLookup: fieldVo.isConditionalLookup,
          lookupOptions: fieldVo.lookupOptions,
          aiConfig: fieldVo.aiConfig,
          options: {
            ...options,
            workflow: {
              id: workflowId,
              name: workflowName,
              isActive,
            },
          },
        };
        await convertField(tableId, field.id, fieldRo);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ReactQueryKeys.baseNodeTree(baseId) }),
          queryClient.invalidateQueries({ queryKey: ReactQueryKeys.field(tableId) }),
          queryClient.invalidateQueries({ queryKey: ReactQueryKeys.fieldList(tableId) }),
        ]);
      }
      openModal(baseId, workflowId);
    }
  };

  const onCancel = () => {
    closeSetting();
    handleOpenWorkflowPanel(field);
  };

  const onConfirm = (fieldVo?: IFieldVo) => {
    closeSetting();
    handleOpenWorkflowPanel(fieldVo);
  };

  const visible = Boolean(setting);
  if (!visible) {
    return <></>;
  }

  const normalizedField = field
    ? {
        ...field,
        description: field.description ?? undefined,
      }
    : undefined;
  const fieldVo = normalizedField ? fieldVoSchema.safeParse(normalizedField) : undefined;

  return (
    <FieldSettingInner
      visible={visible}
      field={fieldVo?.success ? fieldVo.data : undefined}
      order={order}
      operator={setting?.operator || FieldOperator.Add}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};
