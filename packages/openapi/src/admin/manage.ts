import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';
import { sandboxAgentConfigSchema } from './setting/update';

export const adminListQuerySchema = z.object({
  search: z.string().optional(),
  skip: z.coerce.number().min(0).optional(),
  take: z.coerce.number().min(1).max(100).optional(),
});

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatar: z.string().nullable().optional(),
  isAdmin: z.boolean().nullable().optional(),
  deactivatedTime: z.string().nullable().optional(),
  deletedTime: z.string().nullable().optional(),
  lastSignTime: z.string().nullable().optional(),
  createdTime: z.string(),
});

export const adminUserListVoSchema = z.object({
  users: z.array(adminUserSchema),
  total: z.number(),
});

export const adminUpdateUserRoSchema = z.object({
  name: z.string().optional(),
  isAdmin: z.boolean().optional(),
  deactivated: z.boolean().optional(),
  deleted: z.boolean().optional(),
  permanentDeleted: z.boolean().optional(),
});

export const adminSpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdBy: z.string(),
  createdByName: z.string().nullable().optional(),
  createdByEmail: z.string().nullable().optional(),
  baseCount: z.number(),
  collaboratorCount: z.number(),
  enableAutoJoin: z.boolean(),
  deletedTime: z.string().nullable().optional(),
  createdTime: z.string(),
});

export const adminSpaceListVoSchema = z.object({
  spaces: z.array(adminSpaceSchema),
  total: z.number(),
});

export const adminUpdateSpaceRoSchema = z.object({
  deleted: z.boolean().optional(),
  enableAutoJoin: z.boolean().optional(),
});

export const adminWorkflowRunStatusSchema = z.enum([
  'running',
  'success',
  'failed',
  'skipped',
  'waiting',
]);

export const adminWorkflowRunListQuerySchema = adminListQuerySchema.extend({
  status: adminWorkflowRunStatusSchema.optional(),
  baseId: z.string().optional(),
  workflowId: z.string().optional(),
  startedTimeFrom: z.string().optional(),
  startedTimeTo: z.string().optional(),
});

export const adminWorkflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string().nullable().optional(),
  baseId: z.string(),
  baseName: z.string().nullable().optional(),
  spaceId: z.string().nullable().optional(),
  spaceName: z.string().nullable().optional(),
  status: adminWorkflowRunStatusSchema.or(z.string()),
  triggerType: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  startedTime: z.string(),
  finishedTime: z.string().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  createdByEmail: z.string().nullable().optional(),
  stepCount: z.number(),
  failedStepCount: z.number(),
});

export const adminWorkflowRunSummarySchema = z.object({
  total: z.number(),
  success: z.number(),
  failed: z.number(),
  running: z.number(),
  waiting: z.number(),
  skipped: z.number(),
});

export const adminWorkflowRunListVoSchema = z.object({
  runs: z.array(adminWorkflowRunSchema),
  total: z.number(),
  summary: adminWorkflowRunSummarySchema,
});

export const adminSandboxAgentRuntimeConfigSchema = z.object({
  defaultModel: z.string().optional(),
  defaultEffort: z.string().optional(),
  streamIdleTimeout: z.number().optional(),
  maxIdleTime: z.number().optional(),
  vcpus: z.number().optional(),
  modelMapKeys: z.array(z.string()).optional(),
  llm: z
    .object({
      baseUrl: z.string().optional(),
      hasApiKey: z.boolean().optional(),
      timeoutMs: z.number().optional(),
    })
    .optional(),
});

export const adminSandboxAgentStatusVoSchema = z.object({
  available: z.boolean(),
  reachable: z.boolean(),
  status: z.string().optional(),
  activeSessions: z.number().optional(),
  workspaceRoot: z.string().optional(),
  hasTeableCli: z.boolean().optional(),
  runtimeConfig: adminSandboxAgentRuntimeConfigSchema.optional(),
  versions: z.record(z.string(), z.string()).optional(),
  assets: z
    .object({
      docs: z.number().optional(),
      skills: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export const adminSandboxAgentTestRoSchema = sandboxAgentConfigSchema;

export const adminSandboxAgentTestVoSchema = z.object({
  success: z.boolean(),
  model: z.string().optional(),
  response: z.string().optional(),
  elapsedMs: z.number().optional(),
  error: z.string().optional(),
});

export type IAdminListQuery = z.infer<typeof adminListQuerySchema>;
export type IAdminUserVo = z.infer<typeof adminUserSchema>;
export type IAdminUserListVo = z.infer<typeof adminUserListVoSchema>;
export type IAdminUpdateUserRo = z.infer<typeof adminUpdateUserRoSchema>;
export type IAdminSpaceVo = z.infer<typeof adminSpaceSchema>;
export type IAdminSpaceListVo = z.infer<typeof adminSpaceListVoSchema>;
export type IAdminUpdateSpaceRo = z.infer<typeof adminUpdateSpaceRoSchema>;
export type IAdminWorkflowRunListQuery = z.infer<typeof adminWorkflowRunListQuerySchema>;
export type IAdminWorkflowRunVo = z.infer<typeof adminWorkflowRunSchema>;
export type IAdminWorkflowRunListVo = z.infer<typeof adminWorkflowRunListVoSchema>;
export type IAdminSandboxAgentStatusVo = z.infer<typeof adminSandboxAgentStatusVoSchema>;
export type IAdminSandboxAgentTestRo = z.infer<typeof adminSandboxAgentTestRoSchema>;
export type IAdminSandboxAgentTestVo = z.infer<typeof adminSandboxAgentTestVoSchema>;

export const ADMIN_USER_LIST = '/admin/users';
export const ADMIN_USER_UPDATE = '/admin/users/{userId}';
export const ADMIN_SPACE_LIST = '/admin/spaces';
export const ADMIN_SPACE_UPDATE = '/admin/spaces/{spaceId}';
export const ADMIN_WORKFLOW_RUN_LIST = '/admin/workflow-runs';
export const ADMIN_SANDBOX_AGENT_STATUS = '/admin/sandbox-agent/status';
export const ADMIN_SANDBOX_AGENT_SYNC = '/admin/sandbox-agent/sync';
export const ADMIN_SANDBOX_AGENT_TEST_LLM = '/admin/sandbox-agent/test-llm';

export const AdminUserListRoute: RouteConfig = registerRoute({
  method: 'get',
  path: ADMIN_USER_LIST,
  description: 'List instance users for admin management',
  request: {
    query: adminListQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns instance users.',
      content: {
        'application/json': {
          schema: adminUserListVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const AdminUserUpdateRoute: RouteConfig = registerRoute({
  method: 'patch',
  path: ADMIN_USER_UPDATE,
  description: 'Update an instance user for admin management',
  request: {
    params: z.object({
      userId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: adminUpdateUserRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User updated.',
    },
  },
  tags: ['admin'],
});

export const AdminSpaceListRoute: RouteConfig = registerRoute({
  method: 'get',
  path: ADMIN_SPACE_LIST,
  description: 'List instance spaces for admin management',
  request: {
    query: adminListQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns instance spaces.',
      content: {
        'application/json': {
          schema: adminSpaceListVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const AdminSpaceUpdateRoute: RouteConfig = registerRoute({
  method: 'patch',
  path: ADMIN_SPACE_UPDATE,
  description: 'Update an instance space for admin management',
  request: {
    params: z.object({
      spaceId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: adminUpdateSpaceRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Space updated.',
    },
  },
  tags: ['admin'],
});

export const AdminWorkflowRunListRoute: RouteConfig = registerRoute({
  method: 'get',
  path: ADMIN_WORKFLOW_RUN_LIST,
  description: 'List workflow runs for admin monitoring',
  request: {
    query: adminWorkflowRunListQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns workflow runs.',
      content: {
        'application/json': {
          schema: adminWorkflowRunListVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const AdminSandboxAgentStatusRoute: RouteConfig = registerRoute({
  method: 'get',
  path: ADMIN_SANDBOX_AGENT_STATUS,
  description: 'Get sandbox agent runtime status',
  request: {},
  responses: {
    200: {
      description: 'Returns sandbox agent status.',
      content: {
        'application/json': {
          schema: adminSandboxAgentStatusVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const AdminSandboxAgentSyncRoute: RouteConfig = registerRoute({
  method: 'post',
  path: ADMIN_SANDBOX_AGENT_SYNC,
  description: 'Sync sandbox agent runtime configuration',
  request: {},
  responses: {
    200: {
      description: 'Returns sandbox agent status after synchronization.',
      content: {
        'application/json': {
          schema: adminSandboxAgentStatusVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const AdminSandboxAgentTestLLMRoute: RouteConfig = registerRoute({
  method: 'post',
  path: ADMIN_SANDBOX_AGENT_TEST_LLM,
  description: 'Test sandbox agent LLM configuration without saving it',
  request: {
    body: {
      content: {
        'application/json': {
          schema: adminSandboxAgentTestRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns sandbox agent LLM test result.',
      content: {
        'application/json': {
          schema: adminSandboxAgentTestVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const adminListUsers = async (query?: IAdminListQuery) => {
  return axios.get<IAdminUserListVo>(ADMIN_USER_LIST, { params: query });
};

export const adminUpdateUser = async (userId: string, updateRo: IAdminUpdateUserRo) => {
  return axios.patch<void>(urlBuilder(ADMIN_USER_UPDATE, { userId }), updateRo);
};

export const adminListSpaces = async (query?: IAdminListQuery) => {
  return axios.get<IAdminSpaceListVo>(ADMIN_SPACE_LIST, { params: query });
};

export const adminUpdateSpace = async (spaceId: string, updateRo: IAdminUpdateSpaceRo) => {
  return axios.patch<void>(urlBuilder(ADMIN_SPACE_UPDATE, { spaceId }), updateRo);
};

export const adminListWorkflowRuns = async (query?: IAdminWorkflowRunListQuery) => {
  return axios.get<IAdminWorkflowRunListVo>(ADMIN_WORKFLOW_RUN_LIST, { params: query });
};

export const adminGetSandboxAgentStatus = async () => {
  return axios.get<IAdminSandboxAgentStatusVo>(ADMIN_SANDBOX_AGENT_STATUS);
};

export const adminSyncSandboxAgent = async () => {
  return axios.post<IAdminSandboxAgentStatusVo>(ADMIN_SANDBOX_AGENT_SYNC);
};

export const adminTestSandboxAgentLLM = async (data: IAdminSandboxAgentTestRo) => {
  return axios.post<IAdminSandboxAgentTestVo>(ADMIN_SANDBOX_AGENT_TEST_LLM, data);
};
