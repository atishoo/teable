import { useQuery } from '@tanstack/react-query';
import type { IAdminWorkflowRunVo } from '@teable/openapi';
import { adminListWorkflowRuns } from '@teable/openapi';
import { Spin } from '@teable/ui-lib/base';
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn';
import dayjs from 'dayjs';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const PAGE_SIZE = 30;

const statusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'running', label: '运行中' },
  { value: 'waiting', label: '等待中' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'skipped', label: '已跳过' },
] as const;

type StatusFilter = (typeof statusOptions)[number]['value'];

const statusLabel: Record<string, string> = {
  running: '运行中',
  waiting: '等待中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
};

const statusVariant = (status: string) => {
  if (status === 'failed') return 'destructive';
  if (status === 'success') return 'secondary';
  return 'outline' as const;
};

const formatDate = (value?: string | null) =>
  value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';

const formatDuration = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60000).toFixed(1)} min`;
};

const getRunTitle = (run: IAdminWorkflowRunVo) => run.workflowName || run.workflowId;

const WorkflowMonitorPage: NextPageWithLayout = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status === 'all' ? undefined : status,
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    [page, search, status]
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin-workflow-runs', query],
    queryFn: () => adminListWorkflowRuns(query).then(({ data }) => data),
    refetchInterval: 10000,
  });

  const total = data?.total ?? 0;
  const summary = data?.summary;
  const hasPrevious = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold">工作流监控</h1>
          <p className="text-sm text-muted-foreground">查看当前实例内自动化工作流的运行记录</p>
        </div>
        <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          刷新
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-8">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">全部</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.total ?? 0}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">成功</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.success ?? 0}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">失败</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.failed ?? 0}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">运行中</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.running ?? 0}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">等待中</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.waiting ?? 0}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">已跳过</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.skipped ?? 0}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="搜索工作流、数据库、运行 ID"
            className="w-[320px]"
          />
          <Select
            name="workflowRunStatus"
            value={status}
            onValueChange={(value) => {
              setStatus(value as StatusFilter);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[160px]" aria-label="运行状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 overflow-auto rounded-md border">
          <Table className="min-w-[1320px] table-fixed">
            <TableHeader className="sticky top-0 z-20 bg-background">
              <TableRow>
                <TableHead className="sticky left-0 z-30 w-[280px] bg-background shadow-[inset_-1px_0_0_hsl(var(--border))]">
                  工作流
                </TableHead>
                <TableHead className="w-[220px]">数据库</TableHead>
                <TableHead className="w-[120px]">状态</TableHead>
                <TableHead className="w-[120px]">触发</TableHead>
                <TableHead className="w-[150px]">耗时</TableHead>
                <TableHead className="w-[170px]">开始时间</TableHead>
                <TableHead className="w-[170px]">结束时间</TableHead>
                <TableHead className="w-[170px]">触发人</TableHead>
                <TableHead className="sticky right-0 z-30 w-[110px] bg-background text-right shadow-[inset_1px_0_0_hsl(var(--border))]">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isFetching && !data && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Spin />
                  </TableCell>
                </TableRow>
              )}

              {data?.runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    没有匹配的运行记录
                  </TableCell>
                </TableRow>
              )}

              {data?.runs.map((run) => (
                <TableRow key={run.id} className="group">
                  <TableCell className="sticky left-0 z-20 w-[280px] bg-background shadow-[inset_-1px_0_0_hsl(var(--border))] before:pointer-events-none before:absolute before:inset-0 before:bg-primary/5 before:opacity-0 group-hover:before:opacity-100">
                    <div className="relative z-[1] min-w-0">
                      <div className="truncate font-medium">{getRunTitle(run)}</div>
                      <div className="truncate text-xs text-muted-foreground">{run.id}</div>
                    </div>
                  </TableCell>
                  <TableCell className="w-[220px]">
                    <div className="min-w-0">
                      <div className="truncate">{run.baseName ?? run.baseId}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {run.spaceName ?? run.spaceId ?? '-'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="w-[120px]">
                    <Badge variant={statusVariant(run.status)}>
                      {statusLabel[run.status] ?? run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-[120px] truncate">{run.triggerType ?? '-'}</TableCell>
                  <TableCell className="w-[150px]">
                    <div>{formatDuration(run.durationMs)}</div>
                    <div className="text-xs text-muted-foreground">
                      {run.failedStepCount > 0
                        ? `${run.failedStepCount}/${run.stepCount} 步失败`
                        : `${run.stepCount} 步`}
                    </div>
                  </TableCell>
                  <TableCell className="w-[170px] whitespace-nowrap">
                    {formatDate(run.startedTime)}
                  </TableCell>
                  <TableCell className="w-[170px] whitespace-nowrap">
                    {formatDate(run.finishedTime)}
                  </TableCell>
                  <TableCell className="w-[170px]">
                    <div className="truncate">{run.createdByName ?? '-'}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {run.createdByEmail ?? run.createdBy ?? '-'}
                    </div>
                  </TableCell>
                  <TableCell className="sticky right-0 z-20 w-[110px] bg-background text-right shadow-[inset_1px_0_0_hsl(var(--border))] before:pointer-events-none before:absolute before:inset-0 before:bg-primary/5 before:opacity-0 group-hover:before:opacity-100">
                    <div className="relative z-[1] flex justify-end">
                      <Button size="xs" variant="outline" asChild>
                        <Link
                          href={`/base/${run.baseId}/automation/${run.workflowId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-4" />
                          查看
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex shrink-0 items-center justify-between">
          <div className="text-sm text-muted-foreground">共 {total} 条记录</div>
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

WorkflowMonitorPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default WorkflowMonitorPage;
