import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ISettingVo } from '@teable/openapi';
import { getSetting, SettingKey, updateSetting } from '@teable/openapi';
import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { AIConfigurationStatus } from '@/features/app/blocks/admin/setting/components/ai-config/AIConfigurationStatus';
import { AIControlCard } from '@/features/app/blocks/admin/setting/components/ai-config/AIControlCard';
import { AIConfigFormWizard } from '@/features/app/blocks/admin/setting/components/ai-config/AiFormWizard';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

interface IAISettingPageProps {
  settingServerData?: ISettingVo;
}

const AISetting: NextPageWithLayout<IAISettingPageProps> = ({ settingServerData }) => {
  const queryClient = useQueryClient();
  const { data: setting = settingServerData } = useQuery({
    queryKey: ['setting'],
    queryFn: () => getSetting().then(({ data }) => data),
  });

  const { mutate: mutateUpdateSetting } = useMutation({
    mutationFn: (settingRo: Parameters<typeof updateSetting>[0]) => updateSetting(settingRo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setting'] });
    },
  });

  if (!setting) return null;

  const sandboxAgent = setting.sandboxAgentConfig;
  const sandboxModels =
    sandboxAgent?.models?.[sandboxAgent.defaultAgent ?? 'claude'] ??
    sandboxAgent?.models?.claude ??
    [];
  const sandboxConfigured = Boolean(
    setting.sandboxAgentAvailable &&
      sandboxModels.length &&
      sandboxAgent?.llm?.baseUrl &&
      sandboxAgent?.llm?.apiKey
  );
  const aiConfig = setting.aiConfig ?? { llmProviders: [], gatewayModels: [] };
  const disableActions = aiConfig.capabilities?.disableActions ?? [];

  return (
    <div className="flex h-screen flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">AI 设置</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          配置实例级 LLM、AI 字段/自动化模型池和 AI 能力开关。
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <AIConfigurationStatus aiConfig={setting.aiConfig} />
        <AIConfigFormWizard
          aiConfig={setting.aiConfig}
          setAiConfig={(aiConfig) => mutateUpdateSetting({ [SettingKey.AI_CONFIG]: aiConfig })}
          showPricing={false}
        />
      </div>
      <AIControlCard
        disableActions={disableActions}
        sandboxConfigured={sandboxConfigured}
        onChange={(value) =>
          mutateUpdateSetting({
            [SettingKey.AI_CONFIG]: {
              ...aiConfig,
              capabilities: {
                ...aiConfig.capabilities,
                ...value,
              },
            },
          })
        }
      />
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR<IAISettingPageProps>(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();

      if (!userMe?.isAdmin) {
        throw new ForbiddenError();
      }

      const setting = await ssrApi.getSetting();
      return {
        props: {
          settingServerData: setting,
          ...(await getTranslationsProps(context, ['common', 'space'])),
        },
      };
    })
  )
);

AISetting.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AISetting;
