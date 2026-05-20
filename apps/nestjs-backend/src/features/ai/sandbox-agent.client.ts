import type { IAdminSandboxAgentTestVo, ISandboxAgentConfig } from '@teable/openapi';

export interface ISandboxAgentScope {
  userHash: string;
  spaceId: string;
  baseId: string;
  chatId: string;
}

export interface ISandboxWorkspaceInitPayload {
  sessionKey: string;
  scope: ISandboxAgentScope;
  env?: Record<string, string | undefined>;
  model?: string;
  modelKey?: string;
  effort?: string;
}

export interface ISandboxAgentAttachmentUploadPayload {
  sessionKey: string;
  scope: ISandboxAgentScope;
  attachment: {
    name: string;
    type: string;
    size?: number;
    data: string;
    encoding: 'base64';
  };
}

export interface ISandboxAgentAttachmentUploadResult {
  success: boolean;
  attachment: {
    name: string;
    type: string;
    size?: number;
    path: string;
  };
}

interface ISandboxAgentRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const defaultSandboxAgentRequestTimeoutMs = Number(
  process.env.SANDBOX_AGENT_REQUEST_TIMEOUT_MS ?? 30000
);

export const getSandboxAgentUrl = () => process.env.SANDBOX_AGENT_URL?.replace(/\/$/, '');

export const getSandboxAgentHeaders = () => {
  const headers: [string, string][] = [['Content-Type', 'application/json']];
  const token = process.env.SANDBOX_AGENT_ADMIN_TOKEN;
  if (token) {
    headers.push(['x-sandbox-agent-token', token]);
  }
  return headers;
};

const getSandboxAgentModels = (config: ISandboxAgentConfig | undefined) => {
  const agent = config?.defaultAgent ?? 'claude';
  return config?.models?.[agent] ?? config?.models?.claude ?? [];
};

export const resolveSandboxAgentModel = (
  config: ISandboxAgentConfig | undefined,
  modelKey?: string
) => {
  const models = getSandboxAgentModels(config);
  const mappedModel = models.find((model) => model.modelKey === modelKey || model.id === modelKey);
  return mappedModel?.id ?? config?.defaultModel ?? models[0]?.id;
};

const getSandboxAgentModelMap = (config: ISandboxAgentConfig | undefined) => {
  const models = getSandboxAgentModels(config);
  return models.reduce<Record<string, string>>((map, model) => {
    map[model.id] = model.id;
    if (model.modelKey) {
      map[model.modelKey] = model.id;
    }
    return map;
  }, {});
};

const getSandboxAgentConfigPayload = (config: ISandboxAgentConfig | undefined) => ({
  defaultModel: resolveSandboxAgentModel(config, config?.defaultModel),
  modelMap: getSandboxAgentModelMap(config),
  defaultEffort: config?.defaultEffort,
  streamIdleTimeout: config?.streamIdleTimeout,
  maxIdleTime: config?.maxIdleTime,
  vcpus: config?.vcpus,
  llm: {
    baseUrl: config?.llm?.baseUrl?.trim() || undefined,
    apiKey: config?.llm?.apiKey?.trim() || undefined,
    timeoutMs: config?.llm?.timeoutMs,
  },
});

const getSandboxAgentRequestTimeout = (timeoutMs?: number) => {
  const timeout = timeoutMs ?? defaultSandboxAgentRequestTimeoutMs;
  return Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
};

const requestSandboxAgentJson = async <T>(
  sandboxUrl: string,
  path: string,
  body: unknown,
  options: ISandboxAgentRequestOptions = {}
) => {
  const controller = new AbortController();
  const timeout = getSandboxAgentRequestTimeout(options.timeoutMs);
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = timeout
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout)
    : undefined;

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abort, { once: true });
  }

  try {
    const response = await fetch(`${sandboxUrl}${path}`, {
      method: 'POST',
      headers: getSandboxAgentHeaders(),
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const text = await response.text().catch(() => '');
    const data = (() => {
      if (!text) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    })();
    if (response.ok) return data as T;

    throw new Error(
      `Sandbox agent request failed: ${response.status} ${text.slice(0, 200) || response.statusText}`
    );
  } catch (error) {
    if (timedOut) {
      throw new Error(`Sandbox agent request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
};

const requestSandboxAgent = async (
  sandboxUrl: string,
  path: string,
  body: unknown,
  options?: ISandboxAgentRequestOptions
) => {
  await requestSandboxAgentJson(sandboxUrl, path, body, options);
};

export const syncSandboxAgentConfig = async (
  sandboxUrl: string | undefined,
  config: ISandboxAgentConfig | undefined,
  options?: ISandboxAgentRequestOptions
) => {
  if (!sandboxUrl) return;
  await requestSandboxAgent(sandboxUrl, '/config', getSandboxAgentConfigPayload(config), options);
};

export const testSandboxAgentConfig = async (
  sandboxUrl: string,
  config: ISandboxAgentConfig,
  options?: ISandboxAgentRequestOptions
): Promise<IAdminSandboxAgentTestVo> => {
  return requestSandboxAgentJson<IAdminSandboxAgentTestVo>(
    sandboxUrl,
    '/config/test',
    getSandboxAgentConfigPayload(config),
    options
  );
};

export const initSandboxAgentWorkspace = async (
  sandboxUrl: string,
  payload: ISandboxWorkspaceInitPayload,
  options?: ISandboxAgentRequestOptions
) => {
  await requestSandboxAgent(sandboxUrl, '/workspaces/init', payload, options);
};

export const uploadSandboxAgentAttachment = async (
  sandboxUrl: string,
  payload: ISandboxAgentAttachmentUploadPayload,
  options?: ISandboxAgentRequestOptions
) => {
  return requestSandboxAgentJson<ISandboxAgentAttachmentUploadResult>(
    sandboxUrl,
    '/workspaces/attachment',
    payload,
    options
  );
};
