import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminGetSandboxAgentStatus,
  adminSyncSandboxAgent,
  getSetting,
  SettingKey,
  updateSetting,
} from '@teable/openapi';
import type { ISettingVo } from '@teable/openapi';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  sonner,
} from '@teable/ui-lib/shadcn';
import { RefreshCw } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { AgentLLMConfig } from '@/features/app/blocks/admin/setting/components/ai-config/AgentLLMConfig';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

interface ISandboxAgentPageProps {
  settingServerData?: ISettingVo;
}

const boolText = (value?: boolean) => (value ? '正常' : '异常');

const formatList = (value?: string[]) => {
  if (!value?.length) return '-';
  return value.join('、');
};

const formatVersion = (versions?: Record<string, string>, key?: string) => {
  if (!versions || !key) return '-';
  return versions[key] ?? '-';
};

const SandboxAgentPage: NextPageWithLayout<ISandboxAgentPageProps> = ({ settingServerData }) => {
  const queryClient = useQueryClient();
  const { data: setting = settingServerData } = useQuery({
    queryKey: ['setting'],
    queryFn: () => getSetting().then(({ data }) => data),
    initialData: settingServerData,
  });
  const { data: status, isLoading } = useQuery({
    queryKey: ['admin-sandbox-agent-status'],
    queryFn: () => adminGetSandboxAgentStatus().then(({ data }) => data),
    refetchInterval: 10000,
  });

  const { mutateAsync: updateSandboxAgentSetting } = useMutation({
    mutationFn: (settingRo: Parameters<typeof updateSetting>[0]) => updateSetting(settingRo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setting'] });
      queryClient.invalidateQueries({ queryKey: ['admin-sandbox-agent-status'] });
    },
  });

  const { mutate: syncSandboxAgent, isPending: syncing } = useMutation({
    mutationFn: () => adminSyncSandboxAgent(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sandbox-agent-status'] });
      sonner.toast.success('沙箱配置已同步');
    },
    onError: () => sonner.toast.error('沙箱配置同步失败'),
  });

  const runtime = status?.runtimeConfig;
  const available = Boolean(setting?.sandboxAgentAvailable);
  const connectionBadgeText = isLoading
    ? '正在检测'
    : status?.reachable
      ? '连接正常'
      : available
        ? '连接异常'
        : '未接入沙箱';

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold">沙箱 Agent</h1>
          <p className="text-sm text-muted-foreground">查看沙箱运行状态并管理 Agent LLM 配置</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!available || syncing}
          onClick={() => syncSandboxAgent()}
        >
          <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
          同步配置
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-8">
        <div className="grid gap-4 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>连接状态</CardDescription>
              <CardTitle className="text-2xl">
                {isLoading ? '检查中' : status?.reachable ? '在线' : '不可达'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={isLoading || status?.reachable ? 'secondary' : 'destructive'}>
                {connectionBadgeText}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>运行中会话</CardDescription>
              <CardTitle className="text-2xl">{status?.activeSessions ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">当前沙箱实例</CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Teable CLI</CardDescription>
              <CardTitle className="text-2xl">{boolText(status?.hasTeableCli)}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {formatVersion(status?.versions, '@teable/cli')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Docs / Skills</CardDescription>
              <CardTitle className="text-2xl">
                {status?.assets?.docs ?? 0} / {status?.assets?.skills ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">共享文档和技能资产</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>运行时</CardTitle>
            <CardDescription>
              由主服务同步到沙箱，API Key 只显示是否已配置，不会返回明文。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-muted-foreground">默认模型</div>
                <div className="mt-1 font-medium">{runtime?.defaultModel ?? '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">默认思考程度</div>
                <div className="mt-1 font-medium">{runtime?.defaultEffort ?? '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">流式空闲超时</div>
                <div className="mt-1 font-medium">{runtime?.streamIdleTimeout ?? '-'} 秒</div>
              </div>
              <div>
                <div className="text-muted-foreground">沙箱空闲超时</div>
                <div className="mt-1 font-medium">{runtime?.maxIdleTime ?? '-'} 秒</div>
              </div>
              <div>
                <div className="text-muted-foreground">vCPU</div>
                <div className="mt-1 font-medium">{runtime?.vcpus ?? '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">LLM Base URL</div>
                <div className="mt-1 truncate font-medium">{runtime?.llm?.baseUrl ?? '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">LLM API Key</div>
                <div className="mt-1 font-medium">
                  {runtime?.llm?.hasApiKey ? '已配置' : '未配置'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">模型映射</div>
                <div className="mt-1 truncate font-medium">{formatList(runtime?.modelMapKeys)}</div>
              </div>
            </div>
            {status?.error && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {status.error}
              </div>
            )}
          </CardContent>
        </Card>

        {available && setting && (
          <AgentLLMConfig
            sandboxAgentConfig={setting.sandboxAgentConfig}
            setSandboxAgentConfig={async (sandboxAgentConfig) => {
              await updateSandboxAgentSetting({
                [SettingKey.SANDBOX_AGENT_CONFIG]: sandboxAgentConfig,
              });
            }}
          />
        )}
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR<ISandboxAgentPageProps>(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();

      if (!userMe?.isAdmin) {
        throw new ForbiddenError();
      }

      const setting = await ssrApi.getSetting();
      return {
        props: {
          settingServerData: setting,
          ...(await getTranslationsProps(context, 'common')),
        },
      };
    })
  )
);

SandboxAgentPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default SandboxAgentPage;
