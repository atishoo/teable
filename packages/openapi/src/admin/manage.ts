import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';

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

export type IAdminListQuery = z.infer<typeof adminListQuerySchema>;
export type IAdminUserVo = z.infer<typeof adminUserSchema>;
export type IAdminUserListVo = z.infer<typeof adminUserListVoSchema>;
export type IAdminUpdateUserRo = z.infer<typeof adminUpdateUserRoSchema>;
export type IAdminSpaceVo = z.infer<typeof adminSpaceSchema>;
export type IAdminSpaceListVo = z.infer<typeof adminSpaceListVoSchema>;
export type IAdminUpdateSpaceRo = z.infer<typeof adminUpdateSpaceRoSchema>;

export const ADMIN_USER_LIST = '/admin/users';
export const ADMIN_USER_UPDATE = '/admin/users/{userId}';
export const ADMIN_SPACE_LIST = '/admin/spaces';
export const ADMIN_SPACE_UPDATE = '/admin/spaces/{spaceId}';

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
