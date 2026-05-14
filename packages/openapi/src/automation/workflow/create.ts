import { axios } from '../../axios';
import { urlBuilder } from '../../utils';
import { z } from '../../zod';

export const workflowNodeCategorySchema = z.enum(['trigger', 'action', 'logic', 'control']);

export const workflowTriggerTypeSchema = z.enum([
  'recordCreated',
  'recordUpdated',
  'recordCreatedOrUpdated',
  'recordMatchesConditions',
  'buttonClick',
  'formSubmitted',
  'scheduledTime',
  'webhook',
  'emailReceived',
]);

export const workflowActionTypeSchema = z.enum([
  'createRecord',
  'getRecords',
  'updateRecord',
  'sendEmail',
  'httpRequest',
]);

export const workflowLogicTypeSchema = z.enum(['condition']);

export const workflowNodeTypeSchema = z.union([
  workflowTriggerTypeSchema,
  workflowActionTypeSchema,
  workflowLogicTypeSchema,
]);

export const workflowNodeSchema = z.object({
  id: z.string(),
  type: workflowNodeTypeSchema.or(z.string()),
  category: workflowNodeCategorySchema,
  name: z.string().optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  testResult: z.unknown().optional(),
  outputVariables: z.unknown().optional(),
  inputVariables: z.unknown().optional(),
  createdTime: z.string().optional().nullable(),
  lastModifiedTime: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
  lastModifiedBy: z.string().optional().nullable(),
});

export const workflowEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional().nullable(),
  targetHandle: z.string().optional().nullable(),
});

export const workflowRunStepSchema = z.object({
  nodeId: z.string(),
  type: z.string(),
  category: workflowNodeCategorySchema,
  status: z.enum(['success', 'failed', 'skipped']),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  spent: z.number().optional(),
});

export const workflowRunVoSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  baseId: z.string(),
  status: z.enum(['running', 'success', 'failed', 'skipped', 'waiting']),
  triggerType: z.string().optional().nullable(),
  input: z.unknown().optional().nullable(),
  output: z.unknown().optional().nullable(),
  steps: z.array(workflowRunStepSchema).optional(),
  error: z.string().optional().nullable(),
  startedTime: z.string(),
  finishedTime: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
});

export const workflowVoSchema = z.object({
  id: z.string(),
  baseId: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  hasDraft: z.boolean().optional(),
  isActive: z.boolean().optional(),
  trigger: z.unknown().optional().nullable(),
  activeSnapshot: z.unknown().optional().nullable(),
  activeTime: z.string().optional().nullable(),
  activeBy: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
  createdTime: z.string().optional().nullable(),
  lastModifiedTime: z.string().optional().nullable(),
  lastModifiedBy: z.string().optional().nullable(),
});

export type IWorkflowNode = z.infer<typeof workflowNodeSchema>;
export type IWorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type IWorkflowVo = z.infer<typeof workflowVoSchema>;
export type IWorkflowRunVo = z.infer<typeof workflowRunVoSchema>;

const WORKFLOW_BASE = '/base/{baseId}/workflow';
const WORKFLOW_DETAIL = `${WORKFLOW_BASE}/{workflowId}`;
const CREATE_WORKFLOW = WORKFLOW_BASE;
const LIST_WORKFLOW = WORKFLOW_BASE;
const GET_WORKFLOW = WORKFLOW_DETAIL;
const UPDATE_WORKFLOW = WORKFLOW_DETAIL;
const DELETE_WORKFLOW = WORKFLOW_DETAIL;
const ACTIVE_WORKFLOW = `${WORKFLOW_DETAIL}/active`;
const ACTIVE_WORKFLOW_SNAPSHOT = `${WORKFLOW_DETAIL}/active-snapshot`;
const WORKFLOW_TRIGGER = `${WORKFLOW_DETAIL}/trigger`;
const WORKFLOW_ACTION = `${WORKFLOW_DETAIL}/action`;
const WORKFLOW_LOGIC = `${WORKFLOW_DETAIL}/logic`;
const WORKFLOW_NODE = `${WORKFLOW_DETAIL}/{category}/{nodeId}`;
const WORKFLOW_TEST = `${WORKFLOW_DETAIL}/test`;
const WORKFLOW_TEST_NODE = `${WORKFLOW_TEST}/{nodeId}`;
const WORKFLOW_RUN = `${WORKFLOW_DETAIL}/run`;

export const workflowRoSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  trigger: z.unknown().optional(),
  nodes: z.array(workflowNodeSchema).optional(),
  edges: z.array(workflowEdgeSchema).optional(),
});

export const updateWorkflowRoSchema = workflowRoSchema.extend({
  isActive: z.boolean().optional(),
});

export const createWorkflowNodeRoSchema = z.object({
  type: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  parentNodeId: z.string().optional(),
});

export const updateWorkflowNodeRoSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const activeWorkflowRoSchema = z.object({
  method: z.enum(['activate', 'deactivate', 'discard']),
});

export const workflowRunListVoSchema = z.object({
  rowCount: z.number(),
  runs: z.array(workflowRunVoSchema),
});

export const workflowRunSummaryVoSchema = z.object({
  rowCount: z.number(),
  success: z.number(),
  failed: z.number(),
  running: z.number(),
  waiting: z.number(),
  skipped: z.number(),
  averageDuration: z.number().optional(),
});

export type IWorkflowRo = z.infer<typeof workflowRoSchema>;
export type IUpdateWorkflowRo = z.infer<typeof updateWorkflowRoSchema>;
export type ICreateWorkflowGraphNodeRo = z.infer<typeof createWorkflowNodeRoSchema>;
export type IUpdateWorkflowGraphNodeRo = z.infer<typeof updateWorkflowNodeRoSchema>;
export type IActiveWorkflowRo = z.infer<typeof activeWorkflowRoSchema>;
export type IWorkflowRunListVo = z.infer<typeof workflowRunListVoSchema>;
export type IWorkflowRunSummaryVo = z.infer<typeof workflowRunSummaryVoSchema>;

export interface IWorkflowRunListRo {
  skip?: number;
  take?: number;
  status?: IWorkflowRunVo['status'];
  duration?: string;
  startedTimeFrom?: string;
  startedTimeTo?: string;
}

export const createWorkflow = async (baseId: string, createWorkflowRo?: IWorkflowRo) => {
  return axios.post<IWorkflowVo>(urlBuilder(CREATE_WORKFLOW, { baseId }), createWorkflowRo);
};

export const listWorkflow = async (baseId: string) => {
  return axios.get<IWorkflowVo[]>(urlBuilder(LIST_WORKFLOW, { baseId }));
};

export const getWorkflow = async (baseId: string, workflowId: string) => {
  return axios.get<IWorkflowVo>(urlBuilder(GET_WORKFLOW, { baseId, workflowId }));
};

export const updateWorkflow = async (
  baseId: string,
  workflowId: string,
  updateWorkflowRo: IUpdateWorkflowRo
) => {
  return axios.put<IWorkflowVo>(
    urlBuilder(UPDATE_WORKFLOW, { baseId, workflowId }),
    updateWorkflowRo
  );
};

export const deleteWorkflow = async (baseId: string, workflowId: string) => {
  return axios.delete(urlBuilder(DELETE_WORKFLOW, { baseId, workflowId }));
};

export const updateWorkflowActive = async (
  baseId: string,
  workflowId: string,
  activeWorkflowRo: IActiveWorkflowRo
) => {
  return axios.put<IWorkflowVo>(
    urlBuilder(ACTIVE_WORKFLOW, { baseId, workflowId }),
    activeWorkflowRo
  );
};

export const getWorkflowActiveSnapshot = async (baseId: string, workflowId: string) => {
  return axios.get<IWorkflowVo>(urlBuilder(ACTIVE_WORKFLOW_SNAPSHOT, { baseId, workflowId }));
};

export const createWorkflowTrigger = async (
  baseId: string,
  workflowId: string,
  ro: ICreateWorkflowGraphNodeRo
) => {
  return axios.post<IWorkflowNode>(urlBuilder(WORKFLOW_TRIGGER, { baseId, workflowId }), ro);
};

export const createWorkflowAction = async (
  baseId: string,
  workflowId: string,
  ro: ICreateWorkflowGraphNodeRo
) => {
  return axios.post<IWorkflowNode>(urlBuilder(WORKFLOW_ACTION, { baseId, workflowId }), ro);
};

export const createWorkflowLogic = async (
  baseId: string,
  workflowId: string,
  ro: ICreateWorkflowGraphNodeRo
) => {
  return axios.post<IWorkflowNode>(urlBuilder(WORKFLOW_LOGIC, { baseId, workflowId }), ro);
};

export const updateWorkflowNode = async (
  baseId: string,
  workflowId: string,
  category: 'trigger' | 'action' | 'logic',
  nodeId: string,
  ro: IUpdateWorkflowGraphNodeRo
) => {
  return axios.put<IWorkflowNode>(
    urlBuilder(WORKFLOW_NODE, { baseId, workflowId, category, nodeId }),
    ro
  );
};

export const deleteWorkflowNode = async (
  baseId: string,
  workflowId: string,
  category: 'trigger' | 'action' | 'logic',
  nodeId: string
) => {
  return axios.delete(urlBuilder(WORKFLOW_NODE, { baseId, workflowId, category, nodeId }));
};

export const testWorkflow = async (baseId: string, workflowId: string) => {
  return axios.post<IWorkflowRunVo>(urlBuilder(WORKFLOW_TEST, { baseId, workflowId }));
};

export const testWorkflowNode = async (baseId: string, workflowId: string, nodeId: string) => {
  return axios.post<IWorkflowRunVo>(urlBuilder(WORKFLOW_TEST_NODE, { baseId, workflowId, nodeId }));
};

export const listWorkflowRuns = async (
  baseId: string,
  workflowId: string,
  params?: IWorkflowRunListRo
) => {
  return axios.get<IWorkflowRunListVo>(urlBuilder(WORKFLOW_RUN, { baseId, workflowId }), {
    params,
  });
};

export const getWorkflowRunSummary = async (baseId: string, workflowId: string) => {
  return axios.get<IWorkflowRunSummaryVo>(
    `${urlBuilder(WORKFLOW_RUN, { baseId, workflowId })}/summary`
  );
};
