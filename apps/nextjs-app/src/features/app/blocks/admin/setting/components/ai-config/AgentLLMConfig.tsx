import { adminTestSandboxAgentLLM } from '@teable/openapi';
import type { ISettingVo } from '@teable/openapi';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type SandboxAgentConfig = NonNullable<ISettingVo['sandboxAgentConfig']>;
type SandboxAgentModel = NonNullable<SandboxAgentConfig['models']>[string][number];

interface IAgentLLMConfigProps {
  sandboxAgentConfig: ISettingVo['sandboxAgentConfig'];
  setSandboxAgentConfig: (data: SandboxAgentConfig) => Promise<void>;
}

const DEFAULT_MODEL: SandboxAgentModel = {
  id: 'glm-5.1',
  name: 'GLM-5.1',
};

const EFFORT_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
] as const;
type AgentEffort = (typeof EFFORT_OPTIONS)[number]['value'];

const getModels = (config: ISettingVo['sandboxAgentConfig']) => {
  const agent = config?.defaultAgent ?? 'claude';
  const models = config?.models?.[agent] ?? config?.models?.claude;
  return models?.length ? models : [DEFAULT_MODEL];
};

const getModelKey = (model: SandboxAgentModel) => model.modelKey ?? model.id;

const getConfigSignature = (config: SandboxAgentConfig) => JSON.stringify(config);

export const AgentLLMConfig = ({
  sandboxAgentConfig,
  setSandboxAgentConfig,
}: IAgentLLMConfigProps) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('600000');
  const [streamIdleTimeout, setStreamIdleTimeout] = useState('900');
  const [maxIdleTime, setMaxIdleTime] = useState('1800');
  const [vcpus, setVcpus] = useState('2');
  const [models, setModels] = useState<SandboxAgentModel[]>([DEFAULT_MODEL]);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL.id);
  const [defaultEffort, setDefaultEffort] = useState<AgentEffort>('high');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testedSignature, setTestedSignature] = useState('');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    const nextModels = getModels(sandboxAgentConfig);
    setBaseUrl(sandboxAgentConfig?.llm?.baseUrl ?? '');
    setApiKey(sandboxAgentConfig?.llm?.apiKey ?? '');
    setTimeoutMs(String(sandboxAgentConfig?.llm?.timeoutMs ?? 600000));
    setStreamIdleTimeout(String(sandboxAgentConfig?.streamIdleTimeout ?? 900));
    setMaxIdleTime(String(sandboxAgentConfig?.maxIdleTime ?? 1800));
    setVcpus(String(sandboxAgentConfig?.vcpus ?? 2));
    setModels(nextModels);
    setDefaultModel(sandboxAgentConfig?.defaultModel ?? getModelKey(nextModels[0]));
    const effort = sandboxAgentConfig?.defaultEffort;
    setDefaultEffort(
      EFFORT_OPTIONS.some((option) => option.value === effort) ? (effort as AgentEffort) : 'high'
    );
    setTestedSignature('');
    setTestMessage('');
  }, [sandboxAgentConfig]);

  const modelOptions = useMemo(
    () =>
      models
        .map((model) => ({ key: getModelKey(model), label: model.name || model.id }))
        .filter((model) => model.key),
    [models]
  );

  const updateModel = (index: number, updates: Partial<SandboxAgentModel>) => {
    setModels((current) =>
      current.map((model, modelIndex) => (modelIndex === index ? { ...model, ...updates } : model))
    );
  };

  const removeModel = (index: number) => {
    setModels((current) => current.filter((_, modelIndex) => modelIndex !== index));
  };

  const addModel = () => {
    setModels((current) => [...current, { id: '', name: '' }]);
  };

  const getNextConfig = (): SandboxAgentConfig | undefined => {
    const nextModels = models
      .map((model) => ({
        ...model,
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        modelKey: model.modelKey?.trim() || undefined,
      }))
      .filter((model) => model.id);
    if (nextModels.length === 0) return;

    const defaultKey = nextModels.some((model) => getModelKey(model) === defaultModel)
      ? defaultModel
      : getModelKey(nextModels[0]);
    const parsedTimeoutMs = Number(timeoutMs);
    const parsedStreamIdleTimeout = Number(streamIdleTimeout);
    const parsedMaxIdleTime = Number(maxIdleTime);
    const parsedVcpus = Number(vcpus);
    const { maxConcurrentChats: _maxConcurrentChats, ...configWithoutLegacyLimit } =
      (sandboxAgentConfig ?? {}) as SandboxAgentConfig & { maxConcurrentChats?: number };
    return {
      ...configWithoutLegacyLimit,
      spaceIds: sandboxAgentConfig?.spaceIds ?? [],
      forceAll: sandboxAgentConfig?.forceAll ?? true,
      defaultAgent: 'claude',
      llm: {
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        timeoutMs: Number.isFinite(parsedTimeoutMs) ? parsedTimeoutMs : undefined,
      },
      models: {
        ...sandboxAgentConfig?.models,
        claude: nextModels,
      },
      defaultModel: defaultKey,
      defaultEffort,
      streamIdleTimeout: Number.isFinite(parsedStreamIdleTimeout)
        ? parsedStreamIdleTimeout
        : undefined,
      maxIdleTime: Number.isFinite(parsedMaxIdleTime) ? parsedMaxIdleTime : undefined,
      vcpus: Number.isFinite(parsedVcpus) ? parsedVcpus : undefined,
    };
  };

  const nextConfig = getNextConfig();
  const currentSignature = nextConfig ? getConfigSignature(nextConfig) : '';
  const testPassed = Boolean(currentSignature && testedSignature === currentSignature);

  const handleTest = async () => {
    const config = getNextConfig();
    if (!config) {
      toast.error('至少需要配置一个 Agent 模型');
      return;
    }
    if (!config.llm?.baseUrl || !config.llm?.apiKey) {
      toast.error('请先填写 Base URL 和 API Key');
      return;
    }

    setTesting(true);
    setTestedSignature('');
    setTestMessage('');
    try {
      const { data } = await adminTestSandboxAgentLLM(config);
      if (!data.success) {
        throw new Error(data.error || 'Agent LLM 测试失败');
      }
      setTestedSignature(getConfigSignature(config));
      setTestMessage(data.response ? `测试通过：${data.response}` : '测试通过');
      toast.success('Agent LLM 测试通过');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent LLM 测试失败';
      setTestMessage(message);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const config = getNextConfig();
    if (!config) {
      toast.error('至少需要配置一个 Agent 模型');
      return;
    }
    if (testedSignature !== getConfigSignature(config)) {
      toast.error('请先测试通过当前 Agent LLM 配置');
      return;
    }

    setSaving(true);
    try {
      await setSandboxAgentConfig(config);
      toast.success('Agent LLM 配置已保存并同步到沙箱');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Agent LLM 配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testStatusText = testPassed
    ? testMessage || '测试通过'
    : testMessage || (testedSignature ? '配置已变更，请重新测试' : '测试通过后可保存 Agent 配置');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent LLM 配置</CardTitle>
        <CardDescription>
          配置 AI 助手沙箱运行时使用的 Claude-compatible 模型、Base URL 和 API Key。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-base-url">Base URL</Label>
              <Input
                id="agent-base-url"
                name="agentBaseUrl"
                value={baseUrl}
                placeholder="https://api.example.com"
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-api-key">API Key</Label>
              <Input
                id="agent-api-key"
                name="agentApiKey"
                type="password"
                autoComplete="current-password"
                value={apiKey}
                placeholder="sk-..."
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-timeout">请求超时</Label>
              <Input
                id="agent-timeout"
                name="agentTimeout"
                inputMode="numeric"
                value={timeoutMs}
                onChange={(event) => setTimeoutMs(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-default-effort">默认思考程度</Label>
              <Select
                name="agentDefaultEffort"
                value={defaultEffort}
                onValueChange={(value) => setDefaultEffort(value as AgentEffort)}
              >
                <SelectTrigger id="agent-default-effort" aria-label="默认思考程度">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-stream-idle-timeout">流式空闲超时（秒）</Label>
              <Input
                id="agent-stream-idle-timeout"
                name="agentStreamIdleTimeout"
                inputMode="numeric"
                value={streamIdleTimeout}
                onChange={(event) => setStreamIdleTimeout(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-max-idle-time">沙箱空闲超时（秒）</Label>
              <Input
                id="agent-max-idle-time"
                name="agentMaxIdleTime"
                inputMode="numeric"
                value={maxIdleTime}
                onChange={(event) => setMaxIdleTime(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-vcpus">vCPU 数量</Label>
              <Input
                id="agent-vcpus"
                name="agentVcpus"
                inputMode="numeric"
                value={vcpus}
                onChange={(event) => setVcpus(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>模型列表</Label>
              <Button type="button" variant="outline" size="sm" onClick={addModel}>
                <Plus className="mr-2 size-4" />
                添加模型
              </Button>
            </div>
            <div className="space-y-2">
              {models.map((model, index) => (
                <div
                  key={`${model.id}-${index}`}
                  className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    id={`agent-model-id-${index}`}
                    name={`agentModelId${index}`}
                    value={model.id}
                    placeholder="SDK 模型 ID"
                    aria-label="SDK 模型 ID"
                    onChange={(event) => updateModel(index, { id: event.target.value })}
                  />
                  <Input
                    id={`agent-model-name-${index}`}
                    name={`agentModelName${index}`}
                    value={model.name}
                    placeholder="Web 显示名称"
                    aria-label="Web 显示名称"
                    onChange={(event) => updateModel(index, { name: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={models.length === 1}
                    onClick={() => removeModel(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="agent-default-model">默认模型</Label>
              <Select name="agentDefaultModel" value={defaultModel} onValueChange={setDefaultModel}>
                <SelectTrigger id="agent-default-model" aria-label="默认模型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.key} value={model.key}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={testing || saving}
                onClick={handleTest}
              >
                {testing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 size-4" />
                )}
                测试连接
              </Button>
              <Button
                type="submit"
                disabled={!testPassed || testing || saving}
                onClick={handleSave}
              >
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                保存 Agent 配置
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{testStatusText}</p>
        </form>
      </CardContent>
    </Card>
  );
};
