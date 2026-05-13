import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IAdminSpaceVo } from '@teable/openapi';
import { adminListSpaces, adminUpdateSpace } from '@teable/openapi';
import { ConfirmDialog, Spin } from '@teable/ui-lib/base';
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  sonner,
} from '@teable/ui-lib/shadcn';
import dayjs from 'dayjs';
import { ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { SpaceAvatar } from '@/features/app/components/space/SpaceAvatar';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const PAGE_SIZE = 30;

type SpaceAction = 'delete' | 'restore';

const actionConfig: Record<
  SpaceAction,
  {
    title: string;
    description: (space: IAdminSpaceVo) => string;
    confirmText: string;
  }
> = {
  delete: {
    title: '移入回收站',
    description: (space) => `空间「${space.name}」会被移入回收站，成员将无法继续访问。`,
    confirmText: '移入回收站',
  },
  restore: {
    title: '恢复空间',
    description: (space) => `空间「${space.name}」会恢复到正常状态。`,
    confirmText: '恢复',
  },
};

const formatDate = (value?: string | null) =>
  value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';

const AdminSpacePage: NextPageWithLayout = () => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    space: IAdminSpaceVo;
    action: SpaceAction;
  }>();

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    [page, search]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['admin-spaces', query],
    queryFn: () => adminListSpaces(query).then((res) => res.data),
  });

  const { mutateAsync: updateSpace, isPending } = useMutation({
    mutationFn: ({ target, action }: { target: IAdminSpaceVo; action: SpaceAction }) =>
      adminUpdateSpace(target.id, { deleted: action === 'delete' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-spaces'] });
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
    await updateSpace({
      target: pendingAction.space,
      action: pendingAction.action,
    });
    setPendingAction(undefined);
  };

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold">空间管理</h1>
          <p className="text-sm text-muted-foreground">查看和管理当前实例中的全部空间</p>
        </div>
        <Badge variant="secondary">共 {total} 个</Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-8">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="搜索空间名称或 ID"
            className="max-w-sm"
          />
        </div>

        <div className="min-h-0 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[30%]">空间</TableHead>
                <TableHead>创建者</TableHead>
                <TableHead>数据库</TableHead>
                <TableHead>协作者</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[190px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Spin />
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && data?.spaces.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    没有匹配的空间
                  </TableCell>
                </TableRow>
              )}

              {data?.spaces.map((item) => {
                const isDeleted = Boolean(item.deletedTime);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <SpaceAvatar name={item.name} className="size-7 rounded-sm border" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{item.id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="truncate">{item.createdByName ?? '-'}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.createdByEmail ?? item.createdBy}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{item.baseCount}</TableCell>
                    <TableCell>{item.collaboratorCount}</TableCell>
                    <TableCell>
                      {isDeleted ? (
                        <Badge variant="destructive">回收站</Badge>
                      ) : (
                        <Badge variant="secondary">正常</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(item.createdTime)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {!isDeleted && (
                          <Button size="xs" variant="outline" asChild>
                            <Link href={`/space/${item.id}`}>
                              <ExternalLink className="size-4" />
                              打开
                            </Link>
                          </Button>
                        )}
                        {isDeleted ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              setPendingAction({
                                space: item,
                                action: 'restore',
                              })
                            }
                          >
                            <RotateCcw className="size-4" />
                            恢复
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              setPendingAction({
                                space: item,
                                action: 'delete',
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                            移入回收站
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex shrink-0 items-center justify-between">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/user">查看用户管理</Link>
          </Button>
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
            ? selectedConfig.description(pendingAction.space)
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

AdminSpacePage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AdminSpacePage;
