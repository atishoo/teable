import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';

export enum Task {
  Coding = 'coding',
  Embedding = 'embedding',
  Translation = 'translation',
}

export const AI_GENERATE_STREAM = '/api/{baseId}/ai/generate-stream';
export const AI_CHAT_HISTORY = '/{baseId}/ai/chat-history';
export const AI_CHAT_MESSAGE = '/{baseId}/ai/chat-message';
export const AI_CHAT = '/{baseId}/ai/chat/{chatId}';
export const BASE_CHAT_CREATE = '/base/{baseId}/chat/create';
export const BASE_CHAT_HISTORY = '/base/{baseId}/chat/history';
export const BASE_CHAT_MESSAGES = '/base/{baseId}/chat/{chatId}/messages';
export const BASE_CHAT_SEND = '/base/{baseId}/chat/{chatId}/send';
export const BASE_CHAT_INTERRUPT = '/base/{baseId}/chat/{chatId}/interrupt';
export const BASE_CHAT_GATE_RESPONSE = '/base/{baseId}/chat/{chatId}/gate-response';
export const BASE_CHAT = '/base/{baseId}/chat/{chatId}';

export const aiGenerateRoSchema = z.object({
  prompt: z.string(),
  system: z.string().optional().meta({
    description: 'System instructions for the model',
    example: 'You are an assistant.',
  }),
  deepThink: z.boolean().optional().meta({
    description: 'Enable extended model reasoning',
    example: true,
  }),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional().meta({
    description: 'Reasoning effort level when deep thinking is enabled',
    example: 'high',
  }),
  task: z.enum(Task).optional().meta({
    description: 'Quick model selection via predefined task type',
    example: Task.Coding,
  }),
  modelKey: z.string().optional().meta({
    description: 'Specify an exact model configuration to use',
    example: 'openai@gpt-4o@custom-name',
  }),
  temperature: z.number().min(0).max(1).optional().meta({
    description: 'Controls generation randomness',
    example: 0.5,
  }),
});

export type IAiGenerateRo = z.infer<typeof aiGenerateRoSchema>;

export const aiGenerateVoSchema = z.object({
  result: z.string(),
});

export type IAiGenerateVo = z.infer<typeof aiGenerateVoSchema>;

export const aiChatSchema = z.object({
  id: z.string(),
  baseId: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type IAiChat = z.infer<typeof aiChatSchema>;

export const aiChatContextSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  label: z.string(),
  detail: z.string(),
  viewType: z.string().optional(),
  emoji: z.string().nullable().optional(),
});

export type IAiChatContext = z.infer<typeof aiChatContextSchema>;

export const aiChatAttachmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number().optional(),
  text: z.string().optional(),
  data: z.string().optional(),
  encoding: z.enum(['base64']).optional(),
});

export type IAiChatAttachment = z.infer<typeof aiChatAttachmentSchema>;

export const aiChatMessagePartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    toolName: z.string(),
    toolCallId: z.string().optional(),
    input: z.unknown().optional(),
    status: z.enum(['running', 'done', 'failed']).optional(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolName: z.string(),
    toolCallId: z.string().optional(),
    output: z.unknown().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('task-progress'),
    title: z.string().optional(),
    todos: z.array(
      z.object({
        content: z.string(),
        status: z.string(),
        activeForm: z.string().optional(),
      })
    ),
  }),
  z.object({
    type: z.literal('ask-user-question'),
    toolCallId: z.string().optional(),
    question: z.string(),
    options: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('data-context'),
    contexts: z.array(aiChatContextSchema),
  }),
  z.object({
    type: z.literal('attachment'),
    attachments: z.array(aiChatAttachmentSchema),
  }),
]);

export type IAiChatMessagePart = z.infer<typeof aiChatMessagePartSchema>;

export const aiChatMessageSchema = z.object({
  id: z.string(),
  baseId: z.string(),
  chatId: z.string(),
  creatorId: z.string(),
  creatorRole: z.enum(['system', 'user', 'assistant']),
  createdAt: z.number(),
  content: z.string(),
  status: z.enum(['loading', 'done', 'failed']),
  type: z.enum(['table', 'chart']).optional(),
  contextLabels: z.array(z.string()).optional(),
  attachmentNames: z.array(z.string()).optional(),
  parts: z.array(aiChatMessagePartSchema).optional(),
  elapsedMs: z.number().optional(),
});

export type IAiChatMessage = z.infer<typeof aiChatMessageSchema>;

export const baseChatHistoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  createdTime: z.string(),
  createdBy: z.string(),
  lastModifiedTime: z.string(),
  selectedModel: z.string().optional(),
  selectedEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
});

export type IBaseChatHistoryItem = z.infer<typeof baseChatHistoryItemSchema>;

export const createBaseChatRoSchema = z.object({
  type: z.string().optional(),
});

export type ICreateBaseChatRo = z.infer<typeof createBaseChatRoSchema>;

export const createBaseChatVoSchema = z.object({
  chatId: z.string(),
});

export type ICreateBaseChatVo = z.infer<typeof createBaseChatVoSchema>;

export const sendBaseChatMessageRoSchema = z.object({
  messageId: z.string().optional(),
  assistantMessageId: z.string().optional(),
  prompt: z.string(),
  contexts: z.array(aiChatContextSchema).optional(),
  attachments: z.array(aiChatAttachmentSchema).optional(),
  parts: z.array(aiChatMessagePartSchema).optional(),
  modelKey: z.string().optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
});

export type ISendBaseChatMessageRo = z.infer<typeof sendBaseChatMessageRoSchema>;

export const baseChatGateResponseRoSchema = z.object({
  toolCallId: z.string().optional(),
  behavior: z.enum(['allow', 'deny']),
  message: z.string().optional(),
  updatedInput: z.unknown().optional(),
});

export type IBaseChatGateResponseRo = z.infer<typeof baseChatGateResponseRoSchema>;

export const baseChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    messageId: z.string(),
  }),
  z.object({
    type: z.literal('text_delta'),
    messageId: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('reasoning_delta'),
    messageId: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('part'),
    messageId: z.string(),
    part: aiChatMessagePartSchema,
  }),
  z.object({
    type: z.literal('gate_request'),
    messageId: z.string(),
    toolCallId: z.string().optional(),
    question: z.string(),
    options: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('done'),
    messageId: z.string(),
    elapsedMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('error'),
    messageId: z.string().optional(),
    error: z.string(),
  }),
]);

export type IBaseChatStreamEvent = z.infer<typeof baseChatStreamEventSchema>;

export const getBaseChatHistoryVoSchema = z.object({
  history: z.array(baseChatHistoryItemSchema),
  total: z.number(),
});

export type IGetBaseChatHistoryVo = z.infer<typeof getBaseChatHistoryVoSchema>;

export const getBaseChatMessagesVoSchema = z.object({
  messages: z.array(aiChatMessageSchema),
});

export type IGetBaseChatMessagesVo = z.infer<typeof getBaseChatMessagesVoSchema>;

export const getAiChatHistoryVoSchema = z.object({
  chats: z.array(aiChatSchema),
  messages: z.array(aiChatMessageSchema),
});

export type IGetAiChatHistoryVo = z.infer<typeof getAiChatHistoryVoSchema>;

export const upsertAiChatMessageRoSchema = z.object({
  chat: aiChatSchema,
  message: aiChatMessageSchema,
});

export type IUpsertAiChatMessageRo = z.infer<typeof upsertAiChatMessageRoSchema>;

export const deleteAiChatVoSchema = z.object({
  success: z.boolean(),
});

export type IDeleteAiChatVo = z.infer<typeof deleteAiChatVoSchema>;

export const aiGenerateRoute = registerRoute({
  method: 'post',
  path: AI_GENERATE_STREAM,
  description: 'Generate ai stream',
  request: {
    params: z.object({
      baseId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: aiGenerateRoSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Returns ai generate stream.',
      content: {
        'application/json': {
          schema: aiGenerateVoSchema,
        },
      },
    },
  },
  tags: ['ai'],
});

export const getAiChatHistoryRoute = registerRoute({
  method: 'get',
  path: AI_CHAT_HISTORY,
  description: 'Get AI chat history for the current user in a base',
  request: {
    params: z.object({
      baseId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Returns AI chat sessions and messages.',
      content: {
        'application/json': {
          schema: getAiChatHistoryVoSchema,
        },
      },
    },
  },
  tags: ['ai'],
});

export const upsertAiChatMessageRoute = registerRoute({
  method: 'post',
  path: AI_CHAT_MESSAGE,
  description: 'Persist an AI chat message',
  request: {
    params: z.object({
      baseId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: upsertAiChatMessageRoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Returns saved AI chat history.',
      content: {
        'application/json': {
          schema: getAiChatHistoryVoSchema,
        },
      },
    },
  },
  tags: ['ai'],
});

export const deleteAiChatRoute = registerRoute({
  method: 'delete',
  path: AI_CHAT,
  description: 'Delete an AI chat session for the current user',
  request: {
    params: z.object({
      baseId: z.string(),
      chatId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Returns deletion result.',
      content: {
        'application/json': {
          schema: deleteAiChatVoSchema,
        },
      },
    },
  },
  tags: ['ai'],
});

export const aiGenerateStream = (
  baseId: string,
  aiGenerateRo: IAiGenerateRo,
  signal?: AbortSignal
) => {
  return fetch(
    urlBuilder(AI_GENERATE_STREAM, {
      baseId,
    }),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(aiGenerateRo),
      signal,
    }
  );
};

export const getAiChatHistory = async (baseId: string) => {
  return axios.get<IGetAiChatHistoryVo>(urlBuilder(AI_CHAT_HISTORY, { baseId }));
};

export const createBaseChat = async (baseId: string, createBaseChatRo: ICreateBaseChatRo = {}) => {
  return axios.post<ICreateBaseChatVo>(urlBuilder(BASE_CHAT_CREATE, { baseId }), createBaseChatRo);
};

export const getBaseChatHistory = async (baseId: string) => {
  return axios.get<IGetBaseChatHistoryVo>(urlBuilder(BASE_CHAT_HISTORY, { baseId }));
};

export const getBaseChatMessages = async (baseId: string, chatId: string, limit?: number) => {
  return axios.get<IGetBaseChatMessagesVo>(urlBuilder(BASE_CHAT_MESSAGES, { baseId, chatId }), {
    params: limit ? { limit } : undefined,
  });
};

export const sendBaseChatMessage = (
  baseId: string,
  chatId: string,
  sendRo: ISendBaseChatMessageRo,
  signal?: AbortSignal
) => {
  return fetch(urlBuilder(`/api${BASE_CHAT_SEND}`, { baseId, chatId }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sendRo),
    signal,
  });
};

export const interruptBaseChat = async (baseId: string, chatId: string) => {
  return axios.post(urlBuilder(BASE_CHAT_INTERRUPT, { baseId, chatId }));
};

export const respondBaseChatGate = async (
  baseId: string,
  chatId: string,
  gateResponseRo: IBaseChatGateResponseRo
) => {
  return axios.post(urlBuilder(BASE_CHAT_GATE_RESPONSE, { baseId, chatId }), gateResponseRo);
};

export const upsertAiChatMessage = async (
  baseId: string,
  upsertAiChatMessageRo: IUpsertAiChatMessageRo
) => {
  return axios.post<IGetAiChatHistoryVo>(
    urlBuilder(AI_CHAT_MESSAGE, { baseId }),
    upsertAiChatMessageRo
  );
};

export const deleteAiChat = async (baseId: string, chatId: string) => {
  return axios.delete<IDeleteAiChatVo>(urlBuilder(AI_CHAT, { baseId, chatId }));
};

export const deleteBaseChat = async (baseId: string, chatId: string) => {
  return axios.delete<IDeleteAiChatVo>(urlBuilder(BASE_CHAT, { baseId, chatId }));
};
