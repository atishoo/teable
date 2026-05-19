import { useQuery } from '@tanstack/react-query';
import { AIActions, getAIConfig } from '@teable/openapi';
import { useBaseId, useIsReadOnlyPreview } from '@teable/sdk/hooks';
import { useDisableAIAction } from './useDisableAIAction';

export function useAI() {
  const baseId = useBaseId() as string;
  const isReadOnlyPreview = useIsReadOnlyPreview();
  const { aiField, aiChat } = useDisableAIAction();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-config', baseId],
    queryFn: () => getAIConfig(baseId).then(({ data }) => data),
    enabled: Boolean(baseId) && !isReadOnlyPreview,
  });
  const agent = data?.sandboxAgentConfig?.defaultAgent ?? 'claude';
  const agentModels =
    data?.sandboxAgentConfig?.models?.[agent] ?? data?.sandboxAgentConfig?.models?.claude;
  const sandboxAgentConfigured = Boolean(
    data?.sandboxAgentAvailable && agentModels?.length && data?.sandboxAgentConfig?.llm?.hasApiKey
  );
  const disableActions = data?.capabilities?.disableActions ?? [];
  const textModelConfigured = Boolean(data?.chatModel?.lg);
  const aiFieldEnabled =
    aiField && textModelConfigured && !disableActions.includes(AIActions.AIField);
  const aiChatEnabled = aiChat && !disableActions.includes(AIActions.AIChat);

  return {
    enable: aiFieldEnabled,
    chatEnable: Boolean(aiChatEnabled && sandboxAgentConfigured),
    config: data,
    isLoading,
  };
}
