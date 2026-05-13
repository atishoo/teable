import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IAdminUserVo } from '@teable/openapi';
import { adminListUsers, adminUpdateUser } from '@teable/openapi';
import { useSession } from '@teable/sdk/hooks';
import { ConfirmDialog, Spin } from '@teable/ui-lib/base';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  sonner,
} from '@teable/ui-lib/shadcn';
import dayjs from 'dayjs';
import { RotateCcw, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { UserAvatar } from '@/features/app/components/user/UserAvatar';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const PAGE_SIZE = 30;

type UserAction =
  | 'deactivate'
  | 'activate'
  | 'delete'
  | 'restore'
  | 'permanentDelete'
  | 'grantAdmin'
  | 'revokeAdmin';

const actionConfig: Record<
  UserAction,
  {
    title: string;
    description: (user: IAdminUserVo) => string;
    confirmText: string;
  }
> = {
  deactivate: {
    title: '停用用户',
    description: (user) => `停用后，${user.email} 将无法继续登录当前实例。`,
    confirmText: '停用',
  },
  activate: {
    title: '激活用户',
    description: (user) => `激活后，${user.email} 可以重新登录当前实例。`,
    confirmText: '激活',
  },
  delete: {
    title: '删除用户',
    description: (user) => `删除后，${user.email} 将无法登录，用户信息会保留以便恢复。`,
    confirmText: '删除',
  },
  restore: {
    title: '恢复用户',
    description: (user) => `恢复后，${user.email} 将回到删除前的账号状态。`,
    confirmText: '恢复',
  },
  permanentDelete: {
    title: '永久删除用户',
    description: (user) => `永久删除会清理 ${user.email} 的账号数据，此操作不可撤销。`,
    confirmText: '永久删除',
  },
  grantAdmin: {
    title: '设为管理员',
    description: (user) => `${user.email} 将获得实例管理权限。`,
    confirmText: '设为管理员',
  },
  revokeAdmin: {
    title: '移除管理员',
    description: (user) => `${user.email} 将失去实例管理权限。`,
    confirmText: '移除',
  },
};

const formatDate = (value?: string | null) =>
  value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';

const AdminUserPage: NextPageWithLayout = () => {
  const { t } = useTranslation('common');
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    user: IAdminUserVo;
    action: UserAction;
  }>();
  const [editingUser, setEditingUser] = useState<IAdminUserVo>();
  const [editingName, setEditingName] = useState('');

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    [page, search]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => adminListUsers(query).then((res) => res.data),
  });

  const { mutateAsync: updateUser, isPending } = useMutation({
    mutationFn: ({ target, action }: { target: IAdminUserVo; action: UserAction }) => {
      if (action === 'deactivate') {
        return adminUpdateUser(target.id, { deactivated: true });
      }
      if (action === 'activate') {
        return adminUpdateUser(target.id, { deactivated: false });
      }
      if (action === 'delete') {
        return adminUpdateUser(target.id, { deleted: true });
      }
      if (action === 'restore') {
        return adminUpdateUser(target.id, { deleted: false });
      }
      if (action === 'permanentDelete') {
        return adminUpdateUser(target.id, { permanentDeleted: true });
      }
      if (action === 'grantAdmin') {
        return adminUpdateUser(target.id, { isAdmin: true });
      }
      return adminUpdateUser(target.id, { isAdmin: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      sonner.toast(t('actions.updateSucceed'));
    },
  });

  const { mutateAsync: updateUserName, isPending: isUpdatingUserName } = useMutation({
    mutationFn: ({ target, name }: { target: IAdminUserVo; name: string }) =>
      adminUpdateUser(target.id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      sonner.toast(t('actions.updateSucceed'));
    },
  });

  const total = data?.total ?? 0;
  const hasPrevious = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;
  const selectedConfig = pendingAction ? actionConfig[pendingAction.action] : undefined;

  const handleConfirm = async () => {
    if (!pendingAction) {
      return;
    }
    await updateUser({
      target: pendingAction.user,
      action: pendingAction.action,
    });
    setPendingAction(undefined);
  };

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      sonner.toast.success('复制成功');
    } catch {
      sonner.toast.error('复制失败');
    }
  };

  const openEditUserName = (target: IAdminUserVo) => {
    setEditingUser(target);
    setEditingName(target.name);
  };

  const closeEditUserName = () => {
    setEditingUser(undefined);
    setEditingName('');
  };

  const handleUpdateUserName = async () => {
    if (!editingUser) {
      return;
    }
    const name = editingName.trim();
    if (!name) {
      sonner.toast('用户名不能为空');
      return;
    }
    if (name === editingUser.name) {
      closeEditUserName();
      return;
    }
    await updateUserName({ target: editingUser, name });
    closeEditUserName();
  };

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold">用户管理</h1>
          <p className="text-sm text-muted-foreground">管理当前实例中的用户和管理员权限</p>
        </div>
        <Badge variant="secondary">共 {total} 人</Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-8">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="搜索用户名称、邮箱或 ID"
            className="max-w-sm"
          />
        </div>

        <div className="min-h-0 overflow-auto rounded-md border">
          <TooltipProvider delayDuration={200}>
            <Table className="min-w-[1110px] table-fixed">
              <TableHeader className="sticky top-0 z-20 bg-background">
                <TableRow>
                  <TableHead className="sticky left-0 z-30 w-[180px] whitespace-nowrap bg-background shadow-[inset_-1px_0_0_hsl(var(--border))]">
                    用户
                  </TableHead>
                  <TableHead className="w-[110px] whitespace-nowrap">角色</TableHead>
                  <TableHead className="w-[120px] whitespace-nowrap">状态</TableHead>
                  <TableHead className="w-[170px] whitespace-nowrap">最近登录</TableHead>
                  <TableHead className="w-[170px] whitespace-nowrap">创建时间</TableHead>
                  <TableHead className="sticky right-0 z-30 w-[360px] whitespace-nowrap bg-background text-right shadow-[inset_1px_0_0_hsl(var(--border))]">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Spin />
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && data?.users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      没有匹配的用户
                    </TableCell>
                  </TableRow>
                )}

                {data?.users.map((item) => {
                  const isSelf = item.id === user.id;
                  const isDeactivated = Boolean(item.deactivatedTime);
                  const isDeleted = Boolean(item.deletedTime);
                  return (
                    <TableRow key={item.id} className="group">
                      <TableCell className="sticky left-0 z-20 w-[180px] whitespace-nowrap bg-background shadow-[inset_-1px_0_0_hsl(var(--border))] before:pointer-events-none before:absolute before:inset-0 before:bg-primary/5 before:opacity-0 group-hover:before:opacity-100">
                        <div className="relative z-[1] flex min-w-0 items-center gap-3">
                          <UserAvatar user={item} />
                          <div className="min-w-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="block max-w-full cursor-pointer truncate rounded-sm text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    openEditUserName(item);
                                  }}
                                >
                                  {item.name}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>双击编辑</TooltipContent>
                            </Tooltip>
                            <button
                              type="button"
                              className="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => void copyEmail(item.email)}
                            >
                              {item.email}
                            </button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="w-[110px] whitespace-nowrap">
                        {item.isAdmin ? (
                          <Badge>管理员</Badge>
                        ) : (
                          <Badge variant="outline">成员</Badge>
                        )}
                      </TableCell>
                      <TableCell className="w-[120px] whitespace-nowrap">
                        {isDeleted ? (
                          <Badge variant="destructive">已删除</Badge>
                        ) : isDeactivated ? (
                          <Badge variant="destructive">已停用</Badge>
                        ) : (
                          <Badge variant="secondary">正常</Badge>
                        )}
                      </TableCell>
                      <TableCell className="w-[170px] whitespace-nowrap">
                        {formatDate(item.lastSignTime)}
                      </TableCell>
                      <TableCell className="w-[170px] whitespace-nowrap">
                        {formatDate(item.createdTime)}
                      </TableCell>
                      <TableCell className="sticky right-0 z-20 w-[360px] whitespace-nowrap bg-background shadow-[inset_1px_0_0_hsl(var(--border))] before:pointer-events-none before:absolute before:inset-0 before:bg-primary/5 before:opacity-0 group-hover:before:opacity-100">
                        <div className="relative z-[1] flex justify-end gap-2 whitespace-nowrap">
                          {isDeleted ? (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  setPendingAction({
                                    user: item,
                                    action: 'restore',
                                  })
                                }
                              >
                                <RotateCcw className="size-4" />
                                恢复
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive"
                                disabled={isSelf}
                                onClick={() =>
                                  setPendingAction({
                                    user: item,
                                    action: 'permanentDelete',
                                  })
                                }
                              >
                                <Trash2 className="size-4" />
                                永久删除
                              </Button>
                            </>
                          ) : (
                            <>
                              {item.isAdmin ? (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={isSelf}
                                  onClick={() =>
                                    setPendingAction({
                                      user: item,
                                      action: 'revokeAdmin',
                                    })
                                  }
                                >
                                  <ShieldOff className="size-4" />
                                  移除管理员
                                </Button>
                              ) : (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    setPendingAction({
                                      user: item,
                                      action: 'grantAdmin',
                                    })
                                  }
                                >
                                  <ShieldCheck className="size-4" />
                                  设为管理员
                                </Button>
                              )}
                              {isDeactivated ? (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    setPendingAction({
                                      user: item,
                                      action: 'activate',
                                    })
                                  }
                                >
                                  <UserCheck className="size-4" />
                                  激活
                                </Button>
                              ) : (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  disabled={isSelf}
                                  onClick={() =>
                                    setPendingAction({
                                      user: item,
                                      action: 'deactivate',
                                    })
                                  }
                                >
                                  <UserX className="size-4" />
                                  停用
                                </Button>
                              )}
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={isSelf}
                                onClick={() =>
                                  setPendingAction({
                                    user: item,
                                    action: 'delete',
                                  })
                                }
                              >
                                <Trash2 className="size-4" />
                                删除
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>

        <div className="flex shrink-0 items-center justify-end">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasPrevious}
              onClick={() => setPage((value) => Math.max(value - 1, 0))}
            >
              上一页
            </Button>
            <span className="w-16 text-center text-sm text-muted-foreground">第 {page + 1} 页</span>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasNext}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={selectedConfig?.title}
        description={
          pendingAction && selectedConfig
            ? selectedConfig.description(pendingAction.user)
            : undefined
        }
        cancelText={t('actions.cancel')}
        confirmText={selectedConfig?.confirmText}
        confirmLoading={isPending}
        onCancel={() => setPendingAction(undefined)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(undefined);
          }
        }}
        onConfirm={handleConfirm}
      />
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            closeEditUserName();
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>修改用户名</DialogTitle>
            <DialogDescription>为 {editingUser?.email} 设置新的用户名。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="admin-user-name">用户名</Label>
            <Input
              id="admin-user-name"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleUpdateUserName();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditUserName} disabled={isUpdatingUserName}>
              取消
            </Button>
            <Button
              onClick={() => void handleUpdateUserName()}
              disabled={isUpdatingUserName || !editingName.trim()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();

      if (!userMe?.isAdmin) {
        throw new ForbiddenError();
      }

      return {
        props: {
          ...(await getTranslationsProps(context, 'common')),
        },
      };
    })
  )
);

AdminUserPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AdminUserPage;
