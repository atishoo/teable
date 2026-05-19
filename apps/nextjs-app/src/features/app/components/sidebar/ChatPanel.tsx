import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ViewType } from '@teable/core';
import { Cuppy, MagicAi, Maximize2, Minimize2, X } from '@teable/icons';
import {
  BaseNodeResourceType,
  deleteBaseChat,
  getBaseChatHistory,
  getBaseChatMessages,
  getViewList,
  interruptBaseChat,
  type IAiChatMessagePart,
  type IBaseChatStreamEvent,
  type IGetAIConfig,
  respondBaseChatGate,
  sendBaseChatMessage,
} from '@teable/openapi';
import { MarkdownPreview } from '@teable/sdk';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId, useTables, useViews } from '@teable/sdk/hooks';
import { FilePreviewDialog, FilePreviewProvider, type IFilePreviewDialogRef } from '@teable/ui-lib';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
} from '@teable/ui-lib/shadcn';
import {
  ArrowDown,
  ArrowUp,
  AppWindow,
  AtSign,
  Check,
  CircleCheck,
  CircleX,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  History,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Square,
  SquareTerminal,
  Table2,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useTranslation } from 'next-i18next';
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { VIEW_ICON_MAP } from '@/features/app/blocks/view/constant';
import { tableConfig } from '@/features/i18n/table.config';
import type { IMessage } from '../../../../store/message';
import { CreatorRole, MessageStatus, useMessageStore } from '../../../../store/message';
import { useBaseNodeContext } from '../../blocks/base/base-node/hooks/useBaseNodeContext';
import { useAI } from '../../hooks/useAI';
import type { IBaseResource } from '../../hooks/useBaseResource';
import { useBaseResource } from '../../hooks/useBaseResource';
import { useDisableAIAction } from '../../hooks/useDisableAIAction';
import { Emoji } from '../emoji/Emoji';
import type { IChatSession } from './useChatPanelStore';
import { useChatPanelStore } from './useChatPanelStore';

type ChatContext = {
  id: string;
  type: 'table' | 'view' | 'dashboard' | 'app' | 'workflow' | 'selection' | 'current';
  label: string;
  detail: string;
  title?: string;
  viewType?: ViewType;
  emoji?: string | null;
};

type ContextItem = ChatContext & {
  icon: typeof Table2;
  resourceId?: string;
  resourceType?: BaseNodeResourceType;
};

type ModelOption = {
  id: string;
  key: string;
  name: string;
};

type ContextView = {
  id: string;
  name: string;
  type?: ViewType;
};

type ChatAttachment = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  size: number;
  status: 'loading' | 'ready';
  objectUrl?: string;
  thumbnailUrl?: string;
  text?: string;
  data?: string;
  encoding?: 'base64';
};

type EditorPart =
  | { type: 'text'; text: string }
  | { type: 'attachment'; attachmentId: string }
  | { type: 'context'; contextId: string };

type GridSelectionContext = {
  rows?: [number, number][];
  addToChat?: boolean;
  timestamp?: number;
};

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
type ChipDeletionDirection = 'previous' | 'next';
type BaseNodeTreeItem = {
  resourceType: BaseNodeResourceType;
  resourceId: string;
  order: number;
  resourceMeta: {
    name: string;
    icon?: string | null;
  };
};
type BaseNodeTreeItems = Record<string, BaseNodeTreeItem>;
type TableList = Array<{ id: string; name: string; icon?: string | null }>;
type ContextLabels = {
  tables: string;
  dashboards: string;
  apps: string;
  automations: string;
};
type DomSvgIconDefinition = {
  mode: 'fill' | 'stroke';
  paths: string[];
  strokeWidth?: number;
};
type ToolCallPart = Extract<IAiChatMessagePart, { type: 'tool-call' }>;
type ToolResultPart = Extract<IAiChatMessagePart, { type: 'tool-result' }>;
type DataContextPart = Extract<IAiChatMessagePart, { type: 'data-context' }>;
type AttachmentPart = Extract<IAiChatMessagePart, { type: 'attachment' }>;
type AiChatContext = DataContextPart['contexts'][number] & {
  viewType?: ViewType;
  emoji?: string | null;
};
type AiChatAttachment = AttachmentPart['attachments'][number];

const PANEL_MIN_WIDTH = 340;
const PANEL_MAX_WIDTH = 720;
const FLOATING_MIN_WIDTH = 320;
const FLOATING_MIN_HEIGHT = 480;
const CONTEXT_PICKER_WIDTH = 260;
const MAX_ATTACHMENT_TEXT_LENGTH = 12000;
const MAX_ATTACHMENT_BINARY_BYTES = 16 * 1024 * 1024;
const REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  REASONING_EFFORTS.includes(value as ReasoningEffort);
const COMPOSER_PLACEHOLDER_KEYS = [
  'table:aiChat.inputPlaceholder',
  'table:aiChat.inputPlaceholderFiles',
] as const;

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getAttachmentTypeLabel = (file: File) => {
  const extension = file.name.split('.').pop();
  if (extension && extension !== file.name) return extension.slice(0, 4).toUpperCase();
  const [, subtype] = file.type.split('/');
  return (subtype || 'FILE').slice(0, 4).toUpperCase();
};

const getAttachmentMimeType = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'csv':
      return 'text/csv';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getToolInputText = (input: unknown) => {
  if (isRecord(input) && typeof input.command === 'string' && input.command.trim()) {
    return `$ ${input.command.trim()}`;
  }
  return typeof input === 'undefined' ? '' : JSON.stringify(input, null, 2);
};

const getToolDisplayName = (part: ToolCallPart | ToolResultPart) => {
  if (part.type === 'tool-call' && isRecord(part.input)) {
    const description = part.input.description;
    if (typeof description === 'string' && description.trim()) return description.trim();
  }
  return part.toolName;
};

const getVisibleContextLabels = (message: IMessage) => {
  const contexts =
    message.parts?.flatMap((part) => (part.type === 'data-context' ? part.contexts : [])) ?? [];
  if (contexts.length > 0)
    return contexts.filter(({ type }) => type !== 'current').map(({ label }) => label);
  return message.contextLabels?.filter((label) => label !== '当前页面') ?? [];
};

const getContextChipIcon = (context: AiChatContext) => {
  switch (context.type) {
    case 'view':
      return getViewIcon(context.viewType);
    case 'dashboard':
      return LayoutGrid;
    case 'app':
      return AppWindow;
    case 'workflow':
      return Workflow;
    case 'selection':
    case 'current':
      return Database;
    default:
      return Table2;
  }
};

const getAttachmentPayload = ({ name, type, size, text }: ChatAttachment): AiChatAttachment => ({
  name,
  type,
  size,
  text,
});

const getAttachmentTransportPayload = ({
  name,
  type,
  size,
  text,
  data,
  encoding,
}: ChatAttachment): AiChatAttachment => ({
  name,
  type,
  size,
  text,
  data,
  encoding,
});

const appendUserTextPart = (parts: IAiChatMessagePart[], text: string) => {
  if (!text) return;
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === 'text') {
    parts[parts.length - 1] = { ...lastPart, text: `${lastPart.text}${text}` };
    return;
  }
  parts.push({ type: 'text', text });
};

const getUserMessageParts = ({
  attachmentMap,
  contextMap,
  editorParts,
  userInput,
  value,
}: {
  attachmentMap: Map<string, ChatAttachment>;
  contextMap: Map<string, ChatContext>;
  editorParts: EditorPart[];
  userInput: string;
  value?: string;
}) => {
  const parts: IAiChatMessagePart[] = [];

  if (value) {
    appendUserTextPart(parts, value);
  } else {
    editorParts.forEach((part) => {
      if (part.type === 'text') {
        appendUserTextPart(parts, part.text);
        return;
      }
      if (part.type === 'context') {
        const context = contextMap.get(part.contextId);
        if (context) parts.push({ type: 'data-context', contexts: [context] });
        return;
      }
      const attachment = attachmentMap.get(part.attachmentId);
      if (attachment) {
        parts.push({ type: 'attachment', attachments: [getAttachmentPayload(attachment)] });
      }
    });
  }

  if (!parts.some((part) => part.type === 'text' && part.text.trim()) && userInput) {
    parts.push({ type: 'text', text: userInput });
  }

  return parts;
};

const shouldSkipSendMessage = ({
  currentAttachments,
  currentContexts,
  isAttachmentUploading,
  isGenerating,
  userInput,
}: {
  currentAttachments: ChatAttachment[];
  currentContexts: ChatContext[];
  isAttachmentUploading: boolean;
  isGenerating: boolean;
  userInput: string;
}) =>
  isGenerating ||
  isAttachmentUploading ||
  (!userInput && currentAttachments.length === 0 && currentContexts.length === 0);

const getAssistantErrorState = ({
  cancelText,
  error,
  isManualStop,
  unknownErrorText,
}: {
  cancelText: string;
  error: unknown;
  isManualStop: boolean;
  unknownErrorText: string;
}) => {
  const isAbort = error instanceof Error && error.name === 'AbortError';
  if (isAbort) {
    return {
      content: isManualStop ? cancelText : '',
      status: MessageStatus.Done,
    };
  }
  return {
    content: error instanceof Error ? error.message : unknownErrorText,
    status: MessageStatus.Failed,
  };
};

const getAttachmentTypeIcon = (typeLabel: string) => {
  const label =
    typeLabel
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 4) || 'FILE';
  const isSheet = ['CSV', 'XLS', 'XLSX'].includes(label);
  const palette = isSheet
    ? { bg: '#D1FAE5', main: '#10B981', corner: '#6EE7B7' }
    : { bg: '#E0E7FF', main: '#6366F1', corner: '#A5B4FC' };
  const glyph = isSheet
    ? '<path fill-rule="evenodd" clip-rule="evenodd" d="M73 53C75.4853 53 77.5 55.0147 77.5 57.5V75.5C77.5 77.9853 75.4853 80 73 80H47C44.5147 80 42.5 77.9853 42.5 75.5V57.5C42.5 55.0147 44.5147 53 47 53H73ZM45.5 75.5C45.5 76.3284 46.1716 77 47 77H50.5V72H45.5V75.5ZM53.5 77H58.5V72H53.5V77ZM61.5 77H66.5V72H61.5V77ZM69.5 77H73C73.8284 77 74.5 76.3284 74.5 75.5V72H69.5V77ZM45.5 69H50.5V64H45.5V69ZM53.5 69H58.5V64H53.5V69ZM61.5 69H66.5V64H61.5V69ZM69.5 69H74.5V64H69.5V69ZM47 56C46.1716 56 45.5 56.6716 45.5 57.5V61H74.5V57.5C74.5 56.6716 73.8284 56 73 56H47Z" fill="white"></path>'
    : `<text x="60" y="70" text-anchor="middle" fill="white" font-size="22" font-family="Arial, sans-serif" font-weight="700">${label}</text>`;
  const svg = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="${palette.bg}"></rect><path d="M32 30C32 26.6863 34.6863 24 38 24H72L88 40V90C88 93.3137 85.3137 96 82 96H38C34.6863 96 32 93.3137 32 90V30Z" fill="${palette.main}"></path><path d="M72 24L88 40H75C73.3431 40 72 38.6569 72 37V24Z" fill="${palette.corner}"></path>${glyph}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const readImageThumbnail = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const readAttachmentData = async (file: File) => {
  if (file.size > MAX_ATTACHMENT_BINARY_BYTES) return undefined;
  return arrayBufferToBase64(await file.arrayBuffer());
};

const formatElapsed = (elapsedMs?: number) => {
  if (!elapsedMs) return '';
  const seconds = Math.max(1, Math.ceil(elapsedMs / 1000));
  return `${seconds}s`;
};

const mergeReasoningPart = (parts: IAiChatMessagePart[], text: string) => {
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === 'reasoning') {
    return [...parts.slice(0, -1), { ...lastPart, text: `${lastPart.text}${text}` }];
  }
  return [...parts, { type: 'reasoning' as const, text }];
};

const mergeTextPart = (parts: IAiChatMessagePart[], text: string) => {
  if (!text) return parts;
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === 'text') {
    return [...parts.slice(0, -1), { ...lastPart, text: `${lastPart.text}${text}` }];
  }
  return [...parts, { type: 'text' as const, text }];
};

const getHistoryGroup = (updatedAt: number) => {
  const diff = Date.now() - updatedAt;
  const day = 24 * 60 * 60 * 1000;

  if (diff < day) return 'today';
  if (diff < 7 * day) return 'oneWeek';
  if (diff < 14 * day) return 'twoWeek';
  if (diff < 31 * day) return 'oneMonth';
  return 'other';
};

const isReadableFile = (file: File) =>
  file.type.startsWith('text/') ||
  [
    'application/json',
    'application/xml',
    'application/csv',
    'application/javascript',
    'application/x-javascript',
  ].includes(file.type) ||
  /\.(?:csv|json|md|txt|xml|yaml|yml)$/i.test(file.name);

const getMentionQuery = (value: string) => value.match(/@([^@\s]*)$/)?.[1];

const revokeTrackedObjectUrl = (objectUrls: Set<string>, objectUrl?: string) => {
  if (!objectUrl || !objectUrls.has(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
  objectUrls.delete(objectUrl);
};

const isFileDrag = (event: { dataTransfer?: DataTransfer | null }) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

const getTransferFiles = (dataTransfer?: DataTransfer | null) => {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files);
  if (files.length > 0) return files;
  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
};

const getChipDeletionSibling = (range: Range, direction: ChipDeletionDirection) => {
  if (range.startContainer.nodeType !== Node.TEXT_NODE) {
    const offset = direction === 'previous' ? range.startOffset - 1 : range.startOffset;
    return {
      cleanup: undefined,
      sibling: offset < 0 ? null : range.startContainer.childNodes.item(offset),
    };
  }

  const textNode = range.startContainer as Text;
  const text = textNode.textContent ?? '';
  const beforeText = text.slice(0, range.startOffset);
  const afterText = text.slice(range.startOffset);
  const removableText = direction === 'previous' ? beforeText : afterText;
  if (removableText.trim()) return { cleanup: undefined, sibling: null };

  const sibling = direction === 'previous' ? textNode.previousSibling : textNode.nextSibling;
  return {
    cleanup: () => {
      textNode.textContent =
        direction === 'previous' ? text.slice(range.startOffset) : text.slice(0, range.startOffset);
      if (!textNode.textContent) {
        textNode.remove();
      }
    },
    sibling,
  };
};

const getContextViewQueryKey = (tableId?: string) =>
  tableId ? ReactQueryKeys.viewList(tableId) : ['ai-chat-context-view-list'];

const getActiveContextViews = (
  remoteViews: ContextView[] | undefined,
  activeTableId: string | undefined,
  currentTableId: string | undefined,
  currentViews: ContextView[]
) => {
  if (remoteViews) return remoteViews;
  if (activeTableId === currentTableId) return currentViews;
  return [];
};

const getViewIcon = (type?: ViewType) => (type ? VIEW_ICON_MAP[type] ?? LayoutGrid : LayoutGrid);

const DOM_SVG_ICONS: Record<string, DomSvgIconDefinition> = {
  grid: {
    mode: 'stroke',
    paths: [
      'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2M3 9h18M3 15h18M9 9v12M15 9v12',
    ],
  },
  gallery: {
    mode: 'stroke',
    paths: ['M10 3H3v7h7zM21 3h-7v7h7zM21 14h-7v7h7zM10 14H3v7h7z'],
  },
  kanban: {
    mode: 'fill',
    paths: [
      'M11 4v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2M9 4H4v16h5zm13 0v12a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2m-2 0h-5v12h5z',
    ],
  },
  calendar: {
    mode: 'stroke',
    paths: [
      'M16 2v4M8 2v4m-5 4h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
    ],
  },
  form: {
    mode: 'fill',
    paths: [
      'M8.00977 15C8.56205 15 9.00977 15.4477 9.00977 16C9.00977 16.5523 8.56205 17 8.00977 17H8C7.44772 17 7 16.5523 7 16C7 15.4477 7.44772 15 8 15H8.00977ZM16 15C16.5523 15 17 15.4477 17 16C17 16.5523 16.5523 17 16 17H12C11.4477 17 11 16.5523 11 16C11 15.4477 11.4477 15 12 15H16ZM8.00977 10C8.56205 10 9.00977 10.4477 9.00977 11C9.00977 11.5523 8.56205 12 8.00977 12H8C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10H8.00977ZM16 10C16.5523 10 17 10.4477 17 11C17 11.5523 16.5523 12 16 12H12C11.4477 12 11 11.5523 11 11C11 10.4477 11.4477 10 12 10H16ZM15 3H9V5H15V3ZM17 5C17 6.10457 16.1046 7 15 7H9C7.89543 7 7 6.10457 7 5H6C5.73478 5 5.4805 5.10543 5.29297 5.29297C5.10543 5.4805 5 5.73478 5 6V20C5 20.2652 5.10543 20.5195 5.29297 20.707C5.48051 20.8946 5.73478 21 6 21H18C18.2652 21 18.5195 20.8946 18.707 20.707C18.8946 20.5195 19 20.2652 19 20V6C19 5.73478 18.8946 5.48051 18.707 5.29297C18.5195 5.10543 18.2652 5 18 5H17ZM18 3C18.7956 3 19.5585 3.3163 20.1211 3.87891C20.6837 4.44152 21 5.20435 21 6V20C21 20.7957 20.6837 21.5585 20.1211 22.1211C19.5585 22.6837 18.7957 23 18 23H6C5.20435 23 4.44152 22.6837 3.87891 22.1211C3.3163 21.5585 3 20.7957 3 20V6C3 5.20435 3.3163 4.44152 3.87891 3.87891C4.44152 3.3163 5.20435 3 6 3H7C7 1.89543 7.89543 1 9 1H15C16.1046 1 17 1.89543 17 3H18Z',
    ],
  },
  plugin: {
    mode: 'stroke',
    strokeWidth: 1.33,
    paths: [
      'M5.5 8.5 9 12l-3.5 3.5L2 12zM12 2l3.5 3.5L12 9 8.5 5.5zM18.5 8.5 22 12l-3.5 3.5L15 12zM12 15l3.5 3.5L12 22l-3.5-3.5z',
    ],
  },
  dashboard: {
    mode: 'stroke',
    paths: ['M10 3H3v7h7zM21 3h-7v7h7zM21 14h-7v7h7zM10 14H3v7h7z'],
  },
  app: {
    mode: 'stroke',
    paths: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M2 8h20M7 4v4'],
  },
  workflow: {
    mode: 'stroke',
    paths: [
      'M6 3v6M6 9a3 3 0 1 0 0 6M18 15a3 3 0 1 0 0 6M6 15v3a3 3 0 0 0 3 3h6M18 15V9a3 3 0 0 0-3-3H9',
    ],
  },
  selection: {
    mode: 'stroke',
    paths: [
      'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ],
  },
};

const createDomSvgIcon = (definition: DomSvgIconDefinition) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.classList.add('size-3.5');

  definition.paths.forEach((d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    if (definition.mode === 'fill') {
      path.setAttribute('fill', 'currentColor');
    } else {
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-width', String(definition.strokeWidth ?? 2));
    }
    svg.appendChild(path);
  });

  return svg;
};

const getDomContextIconDefinition = (context: ChatContext) => {
  if (context.type === 'view') return DOM_SVG_ICONS[context.viewType ?? 'gallery'];
  return DOM_SVG_ICONS[context.type] ?? DOM_SVG_ICONS.grid;
};

const getConfiguredModelOptions = (config: IGetAIConfig | null | undefined): ModelOption[] => {
  const sandboxAgent = config?.sandboxAgentConfig;
  const sandboxModels =
    sandboxAgent?.models?.[sandboxAgent.defaultAgent ?? 'claude'] ?? sandboxAgent?.models?.claude;

  return (
    sandboxModels?.map((model) => ({
      id: model.id,
      key: model.modelKey ?? model.id,
      name: model.name || model.id,
    })) ?? []
  );
};

const getTableResourceIds = (baseResource: IBaseResource) =>
  baseResource.resourceType === BaseNodeResourceType.Table
    ? { tableId: baseResource.tableId, viewId: baseResource.viewId }
    : { tableId: undefined, viewId: undefined };

const createContextNodeItem = (node: BaseNodeTreeItem, labels: ContextLabels): ContextItem => {
  const label = node.resourceMeta.name;

  switch (node.resourceType) {
    case BaseNodeResourceType.Table:
      return {
        id: `table-${node.resourceId}`,
        type: 'table',
        resourceType: node.resourceType,
        resourceId: node.resourceId,
        label,
        detail: `${labels.tables}: ${label} (${node.resourceId})`,
        icon: Table2,
        emoji: node.resourceMeta.icon,
      };
    case BaseNodeResourceType.Dashboard:
      return {
        id: `dashboard-${node.resourceId}`,
        type: 'dashboard',
        resourceType: node.resourceType,
        resourceId: node.resourceId,
        label,
        detail: `${labels.dashboards}: ${label} (${node.resourceId})`,
        icon: LayoutGrid,
      };
    case BaseNodeResourceType.App:
      return {
        id: `app-${node.resourceId}`,
        type: 'app',
        resourceType: node.resourceType,
        resourceId: node.resourceId,
        label,
        detail: `${labels.apps}: ${label} (${node.resourceId})`,
        icon: AppWindow,
      };
    default:
      return {
        id: `workflow-${node.resourceId}`,
        type: 'workflow',
        resourceType: node.resourceType,
        resourceId: node.resourceId,
        label,
        detail: `${labels.automations}: ${label} (${node.resourceId})`,
        icon: Workflow,
      };
  }
};

const getContextNodeItems = (
  treeItems: BaseNodeTreeItems,
  tables: TableList,
  labels: ContextLabels
) => {
  const nodes = Object.values(treeItems)
    .filter((node) =>
      [
        BaseNodeResourceType.Table,
        BaseNodeResourceType.Dashboard,
        BaseNodeResourceType.App,
        BaseNodeResourceType.Workflow,
      ].includes(node.resourceType)
    )
    .sort((a, b) => a.order - b.order);

  if (nodes.length > 0) return nodes.map((node) => createContextNodeItem(node, labels));

  return tables.map((item) => ({
    id: `table-${item.id}`,
    type: 'table' as const,
    resourceType: BaseNodeResourceType.Table,
    resourceId: item.id,
    label: item.name,
    detail: `${labels.tables}: ${item.name} (${item.id})`,
    icon: Table2,
    emoji: item.icon,
  }));
};

export const ChatPanel = () => {
  const baseId = useBaseId() as string;
  const queryClient = useQueryClient();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const { config: aiConfig, chatEnable, isLoading: isAIConfigLoading } = useAI();
  const { aiChat } = useDisableAIAction();
  const baseResource = useBaseResource();
  const { tableId } = getTableResourceIds(baseResource);
  const tables = useTables();
  const views = useViews();
  const { treeItems } = useBaseNodeContext();
  const {
    status,
    close,
    open,
    toggleExpanded,
    setPanelType,
    activeChatId,
    chats,
    panelWidth,
    floatingRect,
    setActiveChatId,
    upsertChat,
    setBaseChats,
    removeEmptyChat,
    setPanelWidth,
    setFloatingRect,
  } = useChatPanelStore();
  const { messageList, addMessage, updateMessage, setBaseMessages, clearMessage } =
    useMessageStore();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [contextSearch, setContextSearch] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [contextPickerPosition, setContextPickerPosition] = useState<{
    left: number;
    top: number;
  }>();
  const [activeContextTableId, setActiveContextTableId] = useState<string>();
  const [viewSearch, setViewSearch] = useState('');
  const [contexts, setContexts] = useState<ChatContext[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>();
  const [isAttachmentDragActive, setIsAttachmentDragActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelKey, setModelKey] = useState<string>();
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [loadingElapsedNow, setLoadingElapsedNow] = useState(Date.now());
  const controllerRef = useRef<AbortController | null>(null);
  const manualStopRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedEditorRangeRef = useRef<Range>();
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const filePreviewDialogRef = useRef<IFilePreviewDialogRef>(null);
  const attachmentDragDepthRef = useRef(0);
  const attachmentObjectUrlsRef = useRef(new Set<string>());
  const appliedSelectionTimestampRef = useRef<number>();
  const loadedHistoryBaseRef = useRef<string>();
  const locallyUpdatedMessagesAtRef = useRef(new Map<string, number>());
  const keepEditorFocusAfterMenuCloseRef = useRef(false);
  const restoredChatSelectionRef = useRef<string>();
  const activeChatIdRef = useRef<string>();
  const baseIdRef = useRef<string>();

  const messages = useMemo(
    () =>
      messageList
        .filter((message) => message.baseId === baseId && message.chatId === activeChatId)
        .sort((a, b) => a.createdAt - b.createdAt),
    [activeChatId, baseId, messageList]
  );
  const hasLoadingAssistantMessage = useMemo(
    () =>
      messages.some(
        (message) =>
          message.creatorRole === CreatorRole.Assistant && message.status === MessageStatus.Loading
      ),
    [messages]
  );
  const attachmentMap = useMemo(
    () => new Map(attachments.map((attachment) => [attachment.id, attachment])),
    [attachments]
  );

  useEffect(() => {
    if (!hasLoadingAssistantMessage) return;
    setLoadingElapsedNow(Date.now());
    const timer = window.setInterval(() => setLoadingElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasLoadingAssistantMessage]);

  const attachmentPreviewFiles = useMemo(
    () =>
      attachments
        .filter((attachment) => attachment.status === 'ready' && attachment.objectUrl)
        .map((attachment) => ({
          fileId: attachment.id,
          name: attachment.name,
          src: attachment.objectUrl as string,
          mimetype: attachment.type,
          size: attachment.size,
          thumb: attachment.thumbnailUrl,
          downloadUrl: attachment.objectUrl,
        })),
    [attachments]
  );
  const contextMap = useMemo(
    () => new Map(contexts.map((context) => [context.id, context])),
    [contexts]
  );
  const availableModels = useMemo(() => getConfiguredModelOptions(aiConfig), [aiConfig]);
  const configuredDefaultModelKey = aiConfig?.sandboxAgentConfig?.defaultModel;
  const configuredDefaultEffort = aiConfig?.sandboxAgentConfig?.defaultEffort;
  const defaultModelKey =
    availableModels.find(
      (model) => model.key === configuredDefaultModelKey || model.id === configuredDefaultModelKey
    )?.key ?? availableModels[0]?.key;
  const selectedModel = useMemo(
    () => availableModels.find((model) => model.key === modelKey) ?? availableModels[0],
    [availableModels, modelKey]
  );
  const effortLabels = useMemo(
    () => ({
      low: String(t('table:aiChat.effort.low')),
      medium: String(t('table:aiChat.effort.medium')),
      high: String(t('table:aiChat.effort.high')),
      xhigh: 'Extra High',
    }),
    [t]
  );
  const completedText = useMemo(() => {
    const key = 'table:aiChat.agent.completion.completed';
    const text = String(t(key));
    return text === key ? String(t('table:aiChat.meta.taskCompleted')) : text;
  }, [t]);
  const clearChatTitle = useMemo(() => {
    const key = 'table:aiChat.clearChat';
    const text = String(t(key));
    return text === key ? String(t('common:actions.clear')) : text;
  }, [t]);
  const composerPlaceholder = useMemo(
    () =>
      attachments.length > 0
        ? String(t('table:aiChat.inputPlaceholderFiles'))
        : String(t(COMPOSER_PLACEHOLDER_KEYS[placeholderIndex])),
    [attachments.length, placeholderIndex, t]
  );
  const isAttachmentUploading = attachments.some(({ status }) => status === 'loading');

  const selection = baseId
    ? queryClient.getQueryData<GridSelectionContext>(ReactQueryKeys.gridSelection(baseId))
    : undefined;
  const { data: chatHistory } = useQuery({
    queryKey: ['ai-chat-history', baseId],
    queryFn: () => getBaseChatHistory(baseId).then(({ data }) => data),
    enabled: Boolean(baseId) && Boolean(aiChat) && chatEnable,
  });
  const isHistoryChat = Boolean(chatHistory?.history.some(({ id }) => id === activeChatId));
  const { data: activeChatMessages, dataUpdatedAt: activeChatMessagesUpdatedAt } = useQuery({
    queryKey: ['ai-chat-messages', baseId, activeChatId],
    queryFn: () => getBaseChatMessages(baseId, activeChatId as string).then(({ data }) => data),
    enabled: Boolean(baseId) && Boolean(aiChat) && chatEnable && isHistoryChat,
  });
  const buildSelectionContext = useCallback(
    (rows: [number, number][]) => {
      const label = rows
        .map(([start, end]) => {
          const rowStart = Math.min(start, end) + 1;
          const rowEnd = Math.max(start, end) + 1;
          return String(
            t('table:aiChat.context.selectionRows', {
              start: rowStart,
              end: rowEnd,
            })
          );
        })
        .join(', ');

      return {
        label,
        detail: label,
      };
    },
    [t]
  );

  useEffect(() => {
    if (
      defaultModelKey &&
      (!modelKey || !availableModels.some((model) => model.key === modelKey))
    ) {
      setModelKey(defaultModelKey);
    }
  }, [availableModels, defaultModelKey, modelKey]);

  useEffect(() => {
    if (isReasoningEffort(configuredDefaultEffort)) {
      setReasoningEffort(configuredDefaultEffort);
    }
  }, [configuredDefaultEffort]);

  useEffect(() => {
    if (!chatHistory || isGenerating || loadedHistoryBaseRef.current === baseId) return;
    const serverChats = chatHistory.history.map((chat) => ({
      id: chat.id,
      baseId,
      title: chat.name,
      createdAt: new Date(chat.createdTime).getTime(),
      updatedAt: new Date(chat.lastModifiedTime).getTime(),
      selectedModel: chat.selectedModel,
      selectedEffort: chat.selectedEffort,
    }));
    const serverChatIds = new Set(serverChats.map(({ id }) => id));
    const localMessageChatIds = new Set(
      messageList.filter((message) => message.baseId === baseId).map((message) => message.chatId)
    );
    const localChats = chats.filter(
      (chat) =>
        chat.baseId === baseId && !serverChatIds.has(chat.id) && localMessageChatIds.has(chat.id)
    );
    setBaseChats(baseId, [...serverChats, ...localChats]);
    loadedHistoryBaseRef.current = baseId;
  }, [baseId, chatHistory, chats, isGenerating, messageList, setBaseChats]);

  useEffect(() => {
    if (!activeChatId) return;
    const activeChat = chats.find(({ id }) => id === activeChatId);
    if (activeChat?.baseId !== baseId) {
      if (activeChat?.baseId && isGenerating) {
        manualStopRef.current = true;
        void interruptBaseChat(activeChat.baseId, activeChat.id).catch(() => undefined);
        controllerRef.current?.abort();
        controllerRef.current = null;
        setIsGenerating(false);
      }
      setActiveChatId(undefined);
    }
  }, [activeChatId, baseId, chats, isGenerating, setActiveChatId]);

  useEffect(() => {
    if (!activeChatId) {
      restoredChatSelectionRef.current = undefined;
      return;
    }
    const activeChat = chats.find(
      ({ id, baseId: chatBaseId }) => id === activeChatId && chatBaseId === baseId
    );
    const restoreKey = activeChat
      ? `${baseId}:${activeChat.id}:${activeChat.selectedModel ?? ''}:${activeChat.selectedEffort ?? ''}`
      : undefined;
    if (!activeChat || restoredChatSelectionRef.current === restoreKey) return;

    const hasSavedModel = Boolean(activeChat.selectedModel);
    const restoredModel = hasSavedModel
      ? availableModels.find(
          (model) => model.key === activeChat.selectedModel || model.id === activeChat.selectedModel
        )
      : undefined;
    if (hasSavedModel && !restoredModel) return;

    if (restoredModel?.key && restoredModel.key !== modelKey) {
      setModelKey(restoredModel.key);
    }
    if (
      isReasoningEffort(activeChat.selectedEffort) &&
      activeChat.selectedEffort !== reasoningEffort
    ) {
      setReasoningEffort(activeChat.selectedEffort);
    }
    restoredChatSelectionRef.current = restoreKey;
  }, [activeChatId, availableModels, baseId, chats, modelKey, reasoningEffort]);

  useEffect(() => {
    if (!activeChatMessages || isGenerating) return;
    const localKey = `${baseId}:${activeChatId}`;
    const locallyUpdatedAt = locallyUpdatedMessagesAtRef.current.get(localKey);
    if (locallyUpdatedAt && activeChatMessagesUpdatedAt < locallyUpdatedAt) return;
    locallyUpdatedMessagesAtRef.current.delete(localKey);
    if (!activeChatId) return;
    setBaseMessages(
      baseId,
      activeChatId,
      activeChatMessages.messages.map((message) => ({
        ...message,
        creatorRole: message.creatorRole as CreatorRole,
        status: message.status as MessageStatus,
      }))
    );
  }, [
    activeChatId,
    activeChatMessages,
    activeChatMessagesUpdatedAt,
    baseId,
    isGenerating,
    setBaseMessages,
  ]);

  const updateScrollBottomState = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setShowScrollBottom(distance > 24);
  }, []);

  const scrollToBottom = useCallback(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' });
    setShowScrollBottom(false);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport || status === 'close') return;

    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const markdownScroller = target?.closest<HTMLElement>('[data-ai-chat-markdown-scroll]');
      if (!markdownScroller || !viewport.contains(markdownScroller)) return;
      if (!markdownScroller.querySelector('table')) return;
      if (!event.deltaY || event.shiftKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      event.preventDefault();
      viewport.scrollTop += event.deltaY;
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [status]);

  useEffect(() => {
    baseIdRef.current = baseId;
    activeChatIdRef.current = activeChatId;
  }, [activeChatId, baseId]);

  useEffect(() => {
    return () => {
      if (baseIdRef.current && activeChatIdRef.current) {
        void interruptBaseChat(baseIdRef.current, activeChatIdRef.current).catch(() => undefined);
      }
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const objectUrls = attachmentObjectUrlsRef.current;
    return () => {
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (input || contexts.length > 0 || attachments.length > 0) return;
    const timer = window.setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % COMPOSER_PLACEHOLDER_KEYS.length),
      3000
    );
    return () => window.clearInterval(timer);
  }, [attachments.length, contexts.length, input]);

  useEffect(() => {
    if (!selection?.addToChat || !selection.rows?.length || !selection.timestamp) return;
    if (appliedSelectionTimestampRef.current === selection.timestamp) return;
    appliedSelectionTimestampRef.current = selection.timestamp;
    const selectionContext = buildSelectionContext(selection.rows);
    const contextId = `selection-${selection.timestamp}`;
    setContexts((prev) =>
      prev.some(({ id }) => id === contextId)
        ? prev
        : [
            ...prev,
            {
              id: contextId,
              type: 'selection',
              label: selectionContext.label,
              detail: selectionContext.detail,
            },
          ]
    );
  }, [buildSelectionContext, selection?.addToChat, selection?.rows, selection?.timestamp]);

  const ensureChat = useCallback(
    (title?: string, selectedModel?: string, selectedEffort?: ReasoningEffort) => {
      const activeChat = chats.find(({ id }) => id === activeChatId);
      if (activeChat?.baseId === baseId) return activeChat;
      const id = createId();
      const now = Date.now();
      const chat = {
        id,
        baseId,
        title: title || t('table:aiChat.newChat'),
        createdAt: now,
        updatedAt: now,
        selectedModel,
        selectedEffort,
      };
      upsertChat(chat);
      return chat;
    },
    [activeChatId, baseId, chats, t, upsertChat]
  );

  const updateChatMeta = useCallback(
    (chatId: string, title: string, selectedModel?: string, selectedEffort?: ReasoningEffort) => {
      const existing = chats.find((chat) => chat.baseId === baseId && chat.id === chatId);
      const now = Date.now();
      const chat = {
        id: chatId,
        baseId,
        title:
          existing?.title && existing.title !== t('table:aiChat.newChat') ? existing.title : title,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        selectedModel: selectedModel ?? existing?.selectedModel,
        selectedEffort: selectedEffort ?? existing?.selectedEffort,
      };
      upsertChat(chat);
      return chat;
    },
    [baseId, chats, t, upsertChat]
  );

  const revokeAttachmentUrl = useCallback((objectUrl?: string) => {
    revokeTrackedObjectUrl(attachmentObjectUrlsRef.current, objectUrl);
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach(({ objectUrl }) => revokeAttachmentUrl(objectUrl));
      return [];
    });
    setPreviewAttachmentId(undefined);
  }, [revokeAttachmentUrl]);

  const setComposerText = useCallback((value: string) => {
    setInput(value);
    if (!editorRef.current) return;
    editorRef.current.textContent = value;
  }, []);

  const startNewChat = useCallback(() => {
    if (baseId && activeChatId) {
      void interruptBaseChat(baseId, activeChatId).catch(() => undefined);
    }
    controllerRef.current?.abort();
    setComposerText('');
    setContexts([]);
    clearAttachments();
    setActiveChatId(undefined);
  }, [activeChatId, baseId, clearAttachments, setActiveChatId, setComposerText]);

  const clearCurrentChat = useCallback(() => {
    if (!activeChatId) return;
    if (isGenerating) {
      manualStopRef.current = true;
      void interruptBaseChat(baseId, activeChatId).catch(() => undefined);
      controllerRef.current?.abort();
      controllerRef.current = null;
      setIsGenerating(false);
    }
    clearMessage((message) => message.baseId !== baseId || message.chatId !== activeChatId);
    removeEmptyChat(activeChatId);
    void deleteBaseChat(baseId, activeChatId);
    setComposerText('');
    setContexts([]);
    clearAttachments();
  }, [
    activeChatId,
    baseId,
    clearAttachments,
    clearMessage,
    isGenerating,
    removeEmptyChat,
    setComposerText,
  ]);

  const isRangeInEditor = useCallback((range: Range) => {
    const editor = editorRef.current;
    if (!editor) return false;
    return editor.contains(range.commonAncestorContainer);
  }, []);

  const saveEditorSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!isRangeInEditor(range)) return;
    savedEditorRangeRef.current = range.cloneRange();
  }, [isRangeInEditor]);

  const getFallbackEditorRange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }, []);

  const getEditorInsertionRange = useCallback(() => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (isRangeInEditor(range)) return range.cloneRange();
    }
    if (savedEditorRangeRef.current && isRangeInEditor(savedEditorRangeRef.current)) {
      return savedEditorRangeRef.current.cloneRange();
    }
    return getFallbackEditorRange();
  }, [getFallbackEditorRange, isRangeInEditor]);

  const updateContextPickerPosition = useCallback(
    (range?: Range) => {
      const composer = composerRef.current;
      const editor = editorRef.current;
      const targetRange = range ?? getEditorInsertionRange();
      if (!composer || !editor || !targetRange) return;

      const rangeRect = targetRange.getClientRects()[0] ?? targetRange.getBoundingClientRect();
      const rect =
        rangeRect.width || rangeRect.height || rangeRect.left || rangeRect.top
          ? rangeRect
          : editor.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      const maxLeft = Math.max(0, composerRect.width - CONTEXT_PICKER_WIDTH);

      setContextPickerPosition({
        left: clamp(rect.left - composerRect.left, 0, maxLeft),
        top: clamp(rect.top - composerRect.top, 0, composerRect.height),
      });
    },
    [getEditorInsertionRange]
  );

  const focusEditorRange = useCallback((range: Range) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedEditorRangeRef.current = range.cloneRange();
  }, []);

  const readEditorParts = useCallback(() => {
    const editor = editorRef.current;
    const parts: EditorPart[] = [];

    const visit = (node: ChildNode) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) parts.push({ type: 'text', text: node.textContent });
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.attachmentId) {
        parts.push({ type: 'attachment', attachmentId: node.dataset.attachmentId });
        return;
      }
      if (node.dataset.contextId) {
        parts.push({ type: 'context', contextId: node.dataset.contextId });
        return;
      }
      if (node.tagName === 'BR') {
        parts.push({ type: 'text', text: '\n' });
        return;
      }
      node.childNodes.forEach(visit);
    };

    editor?.childNodes.forEach(visit);
    return parts;
  }, []);

  const syncComposerFromDom = useCallback(
    (prune = true) => {
      const parts = readEditorParts();
      setInput(parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join(''));
      if (!prune) return;

      const attachmentIds = new Set(
        parts.flatMap((part) => (part.type === 'attachment' ? [part.attachmentId] : []))
      );
      const contextIds = new Set(
        parts.flatMap((part) => (part.type === 'context' ? [part.contextId] : []))
      );
      setAttachments((prev) => {
        prev.forEach((attachment) => {
          if (!attachmentIds.has(attachment.id)) {
            revokeAttachmentUrl(attachment.objectUrl);
          }
        });
        return prev.filter(({ id }) => attachmentIds.has(id));
      });
      setContexts((prev) => prev.filter(({ id }) => contextIds.has(id)));
    },
    [readEditorParts, revokeAttachmentUrl]
  );

  const getCurrentAttachments = useCallback(() => {
    const ordered = readEditorParts()
      .flatMap((part) => (part.type === 'attachment' ? [attachmentMap.get(part.attachmentId)] : []))
      .filter((attachment): attachment is ChatAttachment => Boolean(attachment));
    return ordered.length ? ordered : attachments;
  }, [attachmentMap, attachments, readEditorParts]);

  const getCurrentContexts = useCallback(() => {
    const ordered = readEditorParts()
      .flatMap((part) => (part.type === 'context' ? [contextMap.get(part.contextId)] : []))
      .filter((context): context is ChatContext => Boolean(context));
    return ordered.length ? ordered : contexts;
  }, [contextMap, contexts, readEditorParts]);

  const updateAttachmentChipElement = useCallback(
    (chip: HTMLElement, attachment: ChatAttachment) => {
      chip.dataset.uploadStatus = attachment.status === 'ready' ? 'done' : 'uploading';
      chip.title = attachment.name;
      const isSelected = chip.classList.contains('ProseMirror-selectednode');
      chip.className = cn(
        'attachment-chip mx-0.5 inline-flex h-6 max-w-full -translate-y-px items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-primary/[0.08] bg-primary/[0.04] px-1.5 align-middle text-sm leading-none text-foreground transition-[background-color,box-shadow] hover:bg-primary/[0.08] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/15 [&.ProseMirror-selectednode]:border-primary',
        attachment.status === 'loading' ? 'uploading opacity-80' : 'previewable cursor-pointer',
        isSelected && 'ProseMirror-selectednode'
      );

      const iconSrc = attachment.thumbnailUrl ?? getAttachmentTypeIcon(attachment.typeLabel);
      chip.innerHTML = '';
      const button = document.createElement('span');
      button.className = 'contents size-full';
      button.setAttribute('role', 'button');
      button.tabIndex = attachment.status === 'ready' ? 0 : -1;

      if (attachment.status === 'loading') {
        const spinner = document.createElement('span');
        spinner.className =
          'attachment-chip-spinner size-3.5 shrink-0 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground opacity-95';
        button.appendChild(spinner);
      } else {
        const image = document.createElement('img');
        image.src = iconSrc;
        image.alt = '';
        image.className = 'attachment-chip-thumb size-3.5 shrink-0 rounded-sm object-cover';
        button.appendChild(image);
      }

      const label = document.createElement('span');
      label.className =
        'attachment-chip-label block min-w-0 max-w-28 truncate text-sm font-normal leading-5';
      label.textContent = attachment.name;
      button.appendChild(label);
      chip.appendChild(button);
    },
    []
  );

  const createAttachmentChipElement = useCallback(
    (attachment: ChatAttachment) => {
      const chip = document.createElement('span');
      chip.contentEditable = 'false';
      chip.dataset.type = 'attachmentChip';
      chip.dataset.attachmentId = attachment.id;
      updateAttachmentChipElement(chip, attachment);
      return chip;
    },
    [updateAttachmentChipElement]
  );

  const createContextChipElement = useCallback((context: ChatContext) => {
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.type = 'contextChip';
    chip.dataset.contextId = context.id;
    chip.title = context.title ?? context.label;
    chip.className =
      'context-chip mx-0.5 inline-flex h-6 max-w-full -translate-y-px items-center gap-1.5 rounded-md border border-foreground/10 bg-foreground/[0.04] px-1.5 align-middle text-sm leading-none text-foreground transition-[background-color,box-shadow] hover:bg-foreground/[0.08] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/15';

    const icon = document.createElement('span');
    icon.className =
      'flex size-3.5 shrink-0 items-center justify-center self-center text-muted-foreground';
    if (context.type === 'table' && context.emoji) {
      icon.className = 'flex size-[1em] shrink-0 items-center justify-center self-center';
      icon.textContent = context.emoji;
    } else {
      icon.appendChild(createDomSvgIcon(getDomContextIconDefinition(context)));
    }
    chip.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'block max-w-28 truncate leading-5';
    label.textContent = context.label;
    chip.appendChild(label);
    return chip;
  }, []);

  const placeCaretAfter = useCallback(
    (node: Text, offset = node.textContent?.length ?? 0) => {
      const range = document.createRange();
      range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
      range.collapse(true);
      focusEditorRange(range);
    },
    [focusEditorRange]
  );

  const insertNodesAtRange = useCallback(
    (nodes: Node[], range: Range | undefined) => {
      const targetRange = range ?? getFallbackEditorRange();
      if (!targetRange) return;
      const fragment = document.createDocumentFragment();
      const spaceNode = document.createTextNode(' ');
      nodes.forEach((node) => fragment.appendChild(node));
      fragment.appendChild(spaceNode);
      targetRange.deleteContents();
      targetRange.insertNode(fragment);
      placeCaretAfter(spaceNode, 1);
      syncComposerFromDom();
    },
    [getFallbackEditorRange, placeCaretAfter, syncComposerFromDom]
  );

  const insertContextMentionTrigger = useCallback(() => {
    const range = getEditorInsertionRange();
    if (!range) return;

    const mentionNode = document.createTextNode('@');
    range.deleteContents();
    range.insertNode(mentionNode);

    const caretRange = document.createRange();
    caretRange.setStart(mentionNode, 1);
    caretRange.collapse(true);
    focusEditorRange(caretRange);
    syncComposerFromDom();
    setContextSearch('');
    setActiveContextTableId(undefined);
    setViewSearch('');
    keepEditorFocusAfterMenuCloseRef.current = true;
    setContextOpen(true);
    updateContextPickerPosition(caretRange);
    window.requestAnimationFrame(() => {
      focusEditorRange(caretRange);
      updateContextPickerPosition(caretRange);
    });
  }, [focusEditorRange, getEditorInsertionRange, syncComposerFromDom, updateContextPickerPosition]);

  const addContext = useCallback(
    (context: ChatContext) => {
      if (contexts.some(({ id }) => id === context.id)) {
        setContextOpen(false);
        setContextPickerPosition(undefined);
        return;
      }
      const range = getEditorInsertionRange();
      if (range?.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
        const text = range.startContainer.textContent ?? '';
        const beforeText = text.slice(0, range.startOffset);
        const mention = beforeText.match(/@[^@\s]*$/);
        if (mention) {
          range.setStart(range.startContainer, range.startOffset - mention[0].length);
        }
      }
      setContexts((prev) => {
        return [...prev, context];
      });
      setContextOpen(false);
      setContextPickerPosition(undefined);
      setContextSearch('');
      setActiveContextTableId(undefined);
      setViewSearch('');
      insertNodesAtRange([createContextChipElement(context)], range);
    },
    [contexts, createContextChipElement, getEditorInsertionRange, insertNodesAtRange]
  );

  const openAttachment = useCallback((attachment: ChatAttachment) => {
    if (attachment.status !== 'ready') return;
    setPreviewAttachmentId(attachment.id);
    filePreviewDialogRef.current?.openPreview(attachment.id);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    attachments.forEach((attachment) => {
      editor.querySelectorAll<HTMLElement>('.attachment-chip').forEach((chip) => {
        if (chip.dataset.attachmentId === attachment.id) {
          updateAttachmentChipElement(chip, attachment);
        }
      });
    });
  }, [attachments, updateAttachmentChipElement]);

  const readFiles = useCallback(
    (files: FileList | File[]) => {
      const fileList = Array.from(files);
      if (fileList.length === 0) return;
      setPreviewAttachmentId(undefined);
      filePreviewDialogRef.current?.closePreview();

      const pendingAttachments = fileList.map((file): ChatAttachment => {
        const objectUrl = URL.createObjectURL(file);
        attachmentObjectUrlsRef.current.add(objectUrl);

        return {
          id: createId(),
          name: file.name,
          type: getAttachmentMimeType(file),
          typeLabel: getAttachmentTypeLabel(file),
          size: file.size,
          status: 'loading',
          objectUrl,
        };
      });

      setAttachments((prev) => [...prev, ...pendingAttachments]);
      insertNodesAtRange(
        pendingAttachments.map((attachment) => createAttachmentChipElement(attachment)),
        getEditorInsertionRange()
      );

      pendingAttachments.forEach((attachment, index) => {
        const file = fileList[index];
        if (!file) return;
        void (async () => {
          const [text, thumbnailUrl, data] = await Promise.all([
            isReadableFile(file)
              ? file.text().then((content) => content.slice(0, MAX_ATTACHMENT_TEXT_LENGTH))
              : Promise.resolve(undefined),
            file.type.startsWith('image/')
              ? readImageThumbnail(file).catch(() => undefined)
              : Promise.resolve(undefined),
            readAttachmentData(file).catch(() => undefined),
          ]);

          setAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id
                ? {
                    ...item,
                    status: 'ready',
                    text,
                    thumbnailUrl,
                    data,
                    encoding: data === undefined ? undefined : 'base64',
                  }
                : item
            )
          );
        })();
      });
    },
    [createAttachmentChipElement, getEditorInsertionRange, insertNodesAtRange]
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const missingContexts = contexts.filter(
      (context) =>
        !Array.from(editor.querySelectorAll<HTMLElement>('.context-chip')).some(
          (chip) => chip.dataset.contextId === context.id
        )
    );
    if (missingContexts.length === 0) return;
    insertNodesAtRange(
      missingContexts.map((context) => createContextChipElement(context)),
      getFallbackEditorRange()
    );
  }, [contexts, createContextChipElement, getFallbackEditorRange, insertNodesAtRange]);

  const resetAttachmentDrag = useCallback(() => {
    attachmentDragDepthRef.current = 0;
    setIsAttachmentDragActive(false);
  }, []);

  const handleAttachmentDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current += 1;
    setIsAttachmentDragActive(true);
  }, []);

  const handleAttachmentDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleAttachmentDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);
    if (attachmentDragDepthRef.current === 0) {
      setIsAttachmentDragActive(false);
    }
  }, []);

  const handleAttachmentDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetAttachmentDrag();
      const files = getTransferFiles(event.dataTransfer);
      if (files.length === 0) return;
      readFiles(files);
    },
    [readFiles, resetAttachmentDrag]
  );

  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLElement>) => {
      const files = getTransferFiles(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      readFiles(files);
    },
    [readFiles]
  );

  useEffect(() => {
    if (!previewAttachmentId) return;

    const handleWindowPaste = (event: ClipboardEvent) => {
      const files = getTransferFiles(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      readFiles(files);
    };
    const handleWindowDragOver = (event: WindowEventMap['dragover']) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleWindowDrop = (event: WindowEventMap['drop']) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetAttachmentDrag();
      const files = getTransferFiles(event.dataTransfer);
      if (files.length === 0) return;
      readFiles(files);
    };

    window.addEventListener('paste', handleWindowPaste, true);
    window.addEventListener('dragover', handleWindowDragOver, true);
    window.addEventListener('drop', handleWindowDrop, true);
    return () => {
      window.removeEventListener('paste', handleWindowPaste, true);
      window.removeEventListener('dragover', handleWindowDragOver, true);
      window.removeEventListener('drop', handleWindowDrop, true);
    };
  }, [previewAttachmentId, readFiles, resetAttachmentDrag]);

  const stopGenerating = useCallback(() => {
    manualStopRef.current = true;
    if (baseId && activeChatId) {
      void interruptBaseChat(baseId, activeChatId).catch(() => undefined);
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsGenerating(false);
  }, [activeChatId, baseId]);

  const applyAssistantStreamEvent = useCallback(
    ({
      event,
      assistantMessageId,
      startedAt,
      content,
      parts,
    }: {
      event: IBaseChatStreamEvent;
      assistantMessageId: string;
      startedAt: number;
      content: string;
      parts: IAiChatMessagePart[];
    }) => {
      if ('messageId' in event && event.messageId !== assistantMessageId) {
        return { content, parts };
      }

      if (event.type === 'text_delta') {
        const nextContent = `${content}${event.text}`;
        const nextParts = mergeTextPart(parts, event.text);
        updateMessage(assistantMessageId, {
          content: nextContent,
          parts: nextParts,
          elapsedMs: Date.now() - startedAt,
        });
        return { content: nextContent, parts: nextParts };
      }

      if (event.type === 'reasoning_delta') {
        const nextParts = mergeReasoningPart(parts, event.text);
        updateMessage(assistantMessageId, {
          parts: nextParts,
          elapsedMs: Date.now() - startedAt,
        });
        return { content, parts: nextParts };
      }

      if (event.type === 'part') {
        const nextParts = [...parts, event.part];
        updateMessage(assistantMessageId, {
          parts: nextParts,
          elapsedMs: Date.now() - startedAt,
        });
        return { content, parts: nextParts };
      }

      if (event.type === 'gate_request') {
        const nextParts = [
          ...parts,
          {
            type: 'ask-user-question' as const,
            toolCallId: event.toolCallId,
            question: event.question,
            options: event.options,
          },
        ];
        updateMessage(assistantMessageId, {
          parts: nextParts,
          elapsedMs: Date.now() - startedAt,
        });
        return { content, parts: nextParts };
      }

      return { content, parts };
    },
    [updateMessage]
  );

  const readAgentStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      assistantMessageId: string,
      startedAt: number
    ) => {
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let assistantParts: IAiChatMessagePart[] = [];
      let reading = true;

      const applyLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as IBaseChatStreamEvent;
        if (event.type === 'error') {
          throw new Error(event.error);
        }
        if (event.type === 'done') {
          updateMessage(assistantMessageId, {
            status: MessageStatus.Done,
            elapsedMs: event.elapsedMs ?? Date.now() - startedAt,
          });
          return;
        }
        const next = applyAssistantStreamEvent({
          event,
          assistantMessageId,
          startedAt,
          content: assistantContent,
          parts: assistantParts,
        });
        assistantContent = next.content;
        assistantParts = next.parts;
      };

      while (reading) {
        const { done, value: chunkValue } = await reader.read();
        if (done) {
          reading = false;
          break;
        }
        buffer += decoder.decode(chunkValue, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(applyLine);
      }

      const finalContent = decoder.decode();
      if (finalContent) buffer += finalContent;
      if (buffer.trim()) applyLine(buffer);

      return { content: assistantContent, parts: assistantParts };
    },
    [applyAssistantStreamEvent, updateMessage]
  );

  const sendAgentMessageAndRead = useCallback(
    async ({
      assistantMessageId,
      chatId,
      currentAttachments,
      requestContexts,
      selectedModelKey,
      signal,
      startedAt,
      userInput,
      userMessageId,
      userParts,
    }: {
      assistantMessageId: string;
      chatId: string;
      currentAttachments: ChatAttachment[];
      requestContexts: ChatContext[];
      selectedModelKey: string;
      signal: AbortSignal;
      startedAt: number;
      userInput: string;
      userMessageId: string;
      userParts: IAiChatMessagePart[];
    }) => {
      const response = await sendBaseChatMessage(
        baseId!,
        chatId,
        {
          messageId: userMessageId,
          assistantMessageId,
          prompt: userInput,
          contexts: requestContexts,
          attachments: currentAttachments.map(getAttachmentTransportPayload),
          parts: userParts,
          modelKey: selectedModelKey,
          reasoningEffort,
        },
        signal
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      return readAgentStream(reader, assistantMessageId, startedAt);
    },
    [baseId, readAgentStream, reasoningEffort]
  );

  const sendMessage = useCallback(
    async (value?: string) => {
      const editorParts = readEditorParts();
      const currentContexts = getCurrentContexts();
      const currentAttachments = getCurrentAttachments();
      const editorText = editorParts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('');
      const userInput = (value ?? (editorText || input)).trim();
      if (
        shouldSkipSendMessage({
          currentAttachments,
          currentContexts,
          isAttachmentUploading,
          isGenerating,
          userInput,
        })
      )
        return;
      const selectedModelKey = modelKey ?? availableModels[0]?.key;
      if (!selectedModelKey) return;

      const chatTitle = userInput.slice(0, 36) || t('table:aiChat.newChat');
      const ensuredChat = ensureChat(chatTitle, selectedModelKey, reasoningEffort);
      const chatId = ensuredChat.id;
      const now = Date.now();
      const userMessageId = createId();
      const assistantMessageId = createId();

      updateChatMeta(chatId, chatTitle, selectedModelKey, reasoningEffort);
      locallyUpdatedMessagesAtRef.current.set(`${baseId}:${chatId}`, Date.now());
      const requestContexts = currentContexts;
      const userParts = getUserMessageParts({
        attachmentMap,
        contextMap,
        editorParts,
        userInput,
        value,
      });

      const userMessage = {
        id: userMessageId,
        baseId,
        chatId,
        creatorId: 'user',
        creatorRole: CreatorRole.User,
        createdAt: now,
        content: userInput,
        status: MessageStatus.Done,
        contextLabels: requestContexts.map(({ label }) => label),
        attachmentNames: currentAttachments.map(({ name }) => name),
        parts: userParts,
      };
      const assistantMessage = {
        id: assistantMessageId,
        baseId,
        chatId,
        creatorId: 'cuppy',
        creatorRole: CreatorRole.Assistant,
        createdAt: now + 1,
        content: '',
        status: MessageStatus.Loading,
        parts: [],
      };
      addMessage(userMessage);
      addMessage(assistantMessage);

      setComposerText('');
      clearAttachments();
      setContexts([]);
      setIsGenerating(true);

      const startedAt = Date.now();
      const controller = new AbortController();
      controllerRef.current = controller;
      manualStopRef.current = false;

      try {
        const { content, parts } = await sendAgentMessageAndRead({
          assistantMessageId,
          chatId,
          currentAttachments,
          requestContexts,
          selectedModelKey,
          signal: controller.signal,
          startedAt,
          userInput,
          userMessageId,
          userParts,
        });
        updateMessage(assistantMessageId, {
          content,
          parts,
          status: MessageStatus.Done,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        const errorState = getAssistantErrorState({
          cancelText: t('common:actions.cancel'),
          error,
          isManualStop: manualStopRef.current,
          unknownErrorText: t('common:noun.unknownError'),
        });
        updateMessage(assistantMessageId, {
          ...errorState,
          elapsedMs: Date.now() - startedAt,
        });
      } finally {
        locallyUpdatedMessagesAtRef.current.set(`${baseId}:${chatId}`, Date.now());
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['ai-chat-messages', baseId, chatId] }),
          queryClient.invalidateQueries({ queryKey: ['ai-chat-history', baseId] }),
        ]);
        setIsGenerating(false);
        controllerRef.current = null;
        manualStopRef.current = false;
      }
    },
    [
      addMessage,
      attachmentMap,
      availableModels,
      baseId,
      clearAttachments,
      contextMap,
      ensureChat,
      getCurrentAttachments,
      getCurrentContexts,
      input,
      isGenerating,
      isAttachmentUploading,
      modelKey,
      queryClient,
      readEditorParts,
      reasoningEffort,
      sendAgentMessageAndRead,
      setComposerText,
      t,
      updateChatMeta,
      updateMessage,
    ]
  );

  const handleResizePanel = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = panelWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        setPanelWidth(
          clamp(startWidth + startX - moveEvent.clientX, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH)
        );
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [panelWidth, setPanelWidth]
  );

  const handleResizePanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? 24 : -24;
      setPanelWidth(clamp(panelWidth + delta, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH));
    },
    [panelWidth, setPanelWidth]
  );

  const contextNodeItems = useMemo(() => {
    return getContextNodeItems(treeItems, tables, {
      tables: String(t('table:aiChat.mention.tables')),
      dashboards: String(t('common:noun.dashboard')),
      apps: String(t('table:aiChat.mention.apps')),
      automations: String(t('common:noun.automation')),
    });
  }, [tables, t, treeItems]);

  const contextTableItems = useMemo(
    () =>
      contextNodeItems.filter(
        (item) => item.resourceType === BaseNodeResourceType.Table && item.resourceId
      ),
    [contextNodeItems]
  );
  const activeContextTable = contextTableItems.find(
    (item) => item.resourceId === activeContextTableId
  );
  const { data: activeContextViewList, isFetching: isActiveContextViewsFetching } = useQuery({
    queryKey: getContextViewQueryKey(activeContextTableId),
    queryFn: () => getViewList(activeContextTableId as string).then((res) => res.data),
    enabled: contextOpen && Boolean(activeContextTableId),
  });

  const groupedContextItems = useMemo(() => {
    const normalizedSearch = contextSearch.trim().toLowerCase();
    const selectionItems =
      selection?.rows?.length && selection.timestamp
        ? [
            {
              id: `selection-${selection.timestamp}`,
              type: 'selection' as const,
              ...buildSelectionContext(selection.rows),
              icon: Database,
            },
          ]
        : [];

    const filterItems = (items: ContextItem[]) =>
      items.filter((item) => item.label.toLowerCase().includes(normalizedSearch));

    return [
      {
        key: 'selection',
        label: '',
        items: filterItems(selectionItems),
      },
      {
        key: 'tables',
        label: String(t('table:aiChat.mention.tables')),
        items: filterItems(
          contextNodeItems.filter((item) => item.resourceType === BaseNodeResourceType.Table)
        ),
      },
      {
        key: 'dashboards',
        label: String(t('common:noun.dashboard')),
        items: filterItems(
          contextNodeItems.filter((item) => item.resourceType === BaseNodeResourceType.Dashboard)
        ),
      },
      {
        key: 'apps',
        label: String(t('table:aiChat.mention.apps')),
        items: filterItems(
          contextNodeItems.filter((item) => item.resourceType === BaseNodeResourceType.App)
        ),
      },
      {
        key: 'workflows',
        label: String(t('common:noun.automation')),
        items: filterItems(
          contextNodeItems.filter((item) => item.resourceType === BaseNodeResourceType.Workflow)
        ),
      },
    ].filter((group) => group.items.length > 0);
  }, [
    buildSelectionContext,
    contextSearch,
    contextNodeItems,
    selection?.rows,
    selection?.timestamp,
    t,
  ]);

  const activeContextViews = getActiveContextViews(
    activeContextViewList,
    activeContextTableId,
    tableId,
    views ?? []
  );
  const filteredActiveContextViews = activeContextViews.filter((item) =>
    item.name.toLowerCase().includes(viewSearch.trim().toLowerCase())
  );

  useEffect(() => {
    if (!contextOpen) {
      setActiveContextTableId(undefined);
      setViewSearch('');
      setContextPickerPosition(undefined);
    }
  }, [contextOpen]);

  const filteredChats = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return chats
      .filter((chat) => chat.baseId === baseId)
      .filter((chat) => chat.title.toLowerCase().includes(normalizedSearch));
  }, [baseId, chats, search]);

  const groupedChats = useMemo(() => {
    return filteredChats.reduce<Record<string, IChatSession[]>>((acc, chat) => {
      const group = getHistoryGroup(chat.updatedAt);
      acc[group] = [...(acc[group] ?? []), chat];
      return acc;
    }, {});
  }, [filteredChats]);

  const renderHistory = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" title={t('table:aiChat.history')}>
          <History className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('common:actions.search')}
            className="h-9 pl-8"
          />
        </div>
        <ScrollArea className="max-h-80">
          {filteredChats.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              {search ? t('table:aiChat.noFoundHistory') : t('table:aiChat.noHistory')}
            </div>
          )}
          {(['today', 'oneWeek', 'twoWeek', 'oneMonth', 'other'] as const).map((group) => {
            const items = groupedChats[group] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-2">
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  {t(`table:aiChat.timeGroup.${group}`)}
                </div>
                {items.map((chat) => (
                  <DropdownMenuItem
                    key={chat.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setActiveChatId(chat.id);
                    }}
                  >
                    <span className="truncate">{chat.title}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            );
          })}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderModelPicker = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-7 min-w-0 max-w-[180px] gap-1 rounded-md px-2 py-1.5 text-xs focus-visible:!ring-border focus-visible:!ring-offset-0"
        >
          <span className="truncate">{selectedModel?.name || t('table:aiChat.noModel')}</span>
          <span className="shrink-0 text-muted-foreground">·{effortLabels[reasoningEffort]}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
          {t('table:aiChat.effort.title')}
        </DropdownMenuLabel>
        {REASONING_EFFORTS.map((effort) => (
          <DropdownMenuItem
            key={effort}
            className="cursor-pointer"
            onClick={() => setReasoningEffort(effort)}
          >
            <span>{effortLabels[effort]}</span>
            {reasoningEffort === effort && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <span className="truncate">{selectedModel?.name || t('table:aiChat.noModel')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-72">
            {availableModels.map((model) => (
              <DropdownMenuItem
                key={model.key}
                className="cursor-pointer"
                onClick={() => setModelKey(model.key)}
              >
                <span className="min-w-0 flex-1 truncate">{model.name}</span>
                {selectedModel?.key === model.key && <Check className="ml-2 size-4 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderContextPicker = () => {
    if (!contextOpen) return null;
    const contextPickerStyle = contextPickerPosition
      ? {
          left: contextPickerPosition.left,
          top: contextPickerPosition.top,
          transform: 'translateY(calc(-100% - 8px))',
        }
      : undefined;
    return (
      <div
        className={cn('absolute z-50', !contextPickerPosition && 'bottom-[calc(100%+8px)] left-0')}
        style={contextPickerStyle}
      >
        {activeContextTable && (
          <div className="absolute bottom-auto right-[calc(100%+6px)] top-6 w-64 rounded-md border border-border-high bg-popover p-1 text-popover-foreground shadow-md">
            <div className="px-1">
              <Input
                value={viewSearch}
                onChange={(event) => setViewSearch(event.target.value)}
                placeholder={`${t('common:actions.search')}${t('common:noun.view')}...`}
                className="h-8 border-0 bg-transparent px-7 text-xs shadow-none focus-visible:ring-0"
              />
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            </div>
            <ContextViewList
              views={filteredActiveContextViews}
              isFetching={isActiveContextViewsFetching}
              loadingText={t('common:actions.loading')}
              emptyText={t('table:aiChat.context.searchEmpty')}
              onPick={(item) =>
                addContext({
                  id: `view-${activeContextTable.resourceId}-${item.id}`,
                  type: 'view',
                  label: item.name,
                  title: `${item.name} · ${activeContextTable.label}`,
                  detail: `${t('table:aiChat.mention.tables')}: ${activeContextTable.label} (${activeContextTable.resourceId}); ${t('common:actions.view')}: ${item.name} (${item.id})`,
                  viewType: item.type,
                })
              }
            />
          </div>
        )}
        <div className="max-h-[280px] w-[260px] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {groupedContextItems.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              {t('table:aiChat.context.searchEmpty')}
            </div>
          ) : (
            groupedContextItems.map((group) => (
              <div key={group.key}>
                {group.label && (
                  <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {group.label}
                  </div>
                )}
                {group.items.map(
                  ({
                    id,
                    type,
                    label,
                    detail,
                    title,
                    icon: Icon,
                    emoji,
                    resourceId,
                    resourceType,
                  }) => {
                    const isActiveTable =
                      resourceType === BaseNodeResourceType.Table &&
                      resourceId === activeContextTable?.resourceId;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={cn(
                          'group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                          isActiveTable && 'bg-accent text-accent-foreground'
                        )}
                        onMouseEnter={() => {
                          if (resourceType === BaseNodeResourceType.Table) {
                            setActiveContextTableId(resourceId);
                            setViewSearch('');
                            return;
                          }
                          setActiveContextTableId(undefined);
                          setViewSearch('');
                        }}
                        onFocus={() => {
                          if (resourceType === BaseNodeResourceType.Table) {
                            setActiveContextTableId(resourceId);
                            return;
                          }
                          setActiveContextTableId(undefined);
                        }}
                        onClick={() => addContext({ id, type, label, detail, title, emoji })}
                      >
                        {type === 'table' && emoji ? (
                          <Emoji
                            emoji={emoji}
                            size="1em"
                            className="size-[1em] shrink-0 transition-colors"
                          />
                        ) : (
                          <Icon
                            className={cn(
                              'size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground group-focus:text-accent-foreground',
                              isActiveTable && 'text-accent-foreground'
                            )}
                          />
                        )}
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  }
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderPartValue = (value: unknown) => {
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  };

  const renderMarkdownText = (text: string, key?: string) => (
    <div
      key={key}
      data-ai-chat-markdown-scroll
      className="min-w-0 max-w-full overflow-x-auto text-sm leading-6"
    >
      <MarkdownPreview className="max-w-full p-0 text-sm [&_p]:my-1 [&_table]:w-max [&_table]:min-w-full [&_td]:min-w-[8ch] [&_th]:min-w-[8ch] [&_th]:whitespace-nowrap">
        {text}
      </MarkdownPreview>
    </div>
  );

  const renderToolPart = (
    message: IMessage,
    part: ToolCallPart | ToolResultPart,
    index: number,
    result?: ToolResultPart
  ) => {
    const inputText = part.type === 'tool-call' ? getToolInputText(part.input) : '';
    const outputText = renderPartValue(
      result?.error ??
        result?.output ??
        (part.type === 'tool-result' ? part.error ?? part.output : undefined)
    );
    const body = [inputText, outputText].filter(Boolean).join('\n\n');
    const hasResult = Boolean(result || part.type === 'tool-result');
    const hasError = Boolean(result?.error || (part.type === 'tool-result' && part.error));

    return (
      <details key={`${message.id}-part-${index}`} className="group">
        <summary className="flex h-6 w-full cursor-pointer list-none items-center gap-3 rounded-md p-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {getToolDisplayName(part)}
            </span>
            {hasResult ? (
              hasError ? (
                <CircleX className="ml-0.5 size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <CircleCheck className="ml-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )
            ) : (
              <Loader2 className="ml-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>
          <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        {body && (
          <div className="mt-1 overflow-hidden rounded-lg bg-zinc-950 text-zinc-100">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5">
              {body}
            </pre>
          </div>
        )}
      </details>
    );
  };

  const renderMessagePart = (message: IMessage, part: IAiChatMessagePart, index: number) => {
    if (part.type === 'data-context' || part.type === 'attachment' || part.type === 'reasoning') {
      return null;
    }

    if (part.type === 'text') {
      return renderMarkdownText(part.text, `${message.id}-part-${index}`);
    }

    if (part.type === 'task-progress') {
      const completedCount = part.todos.filter(({ status }) =>
        ['completed', 'done'].includes(status)
      ).length;
      return (
        <div
          key={`${message.id}-part-${index}`}
          className="overflow-hidden rounded-md border border-border bg-background text-xs"
        >
          <div className="flex h-8 items-center gap-2 border-b px-3 font-medium">
            <LayoutGrid className="size-3.5 text-muted-foreground" />
            <span>
              {part.title ?? t('table:aiChat.agent.taskProgress.title')} {completedCount}/
              {part.todos.length}
            </span>
            {completedCount === part.todos.length && (
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1.5 px-3 py-2">
            {part.todos.map((todo) => (
              <div
                key={`${todo.content}-${todo.status}`}
                className="flex min-w-0 items-center gap-2 text-muted-foreground"
              >
                <Check className="size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{todo.content}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (part.type === 'ask-user-question') {
      return (
        <div
          key={`${message.id}-part-${index}`}
          className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm"
        >
          <div className="mb-2 font-medium">{part.question}</div>
          <div className="flex flex-wrap gap-1.5">
            {part.options?.map((option) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  void respondBaseChatGate(baseId, message.chatId, {
                    toolCallId: part.toolCallId,
                    behavior: 'allow',
                    updatedInput: {
                      answers: {
                        [part.question]: option,
                      },
                    },
                  });
                }}
              >
                {option}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                void respondBaseChatGate(baseId, message.chatId, {
                  toolCallId: part.toolCallId,
                  behavior: 'deny',
                  message: t('common:actions.cancel'),
                });
              }}
            >
              {t('common:actions.cancel')}
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderMessageParts = (message: IMessage) => {
    const parts = message.parts ?? [];
    const usedToolResultIndexes = new Set<number>();
    const rendered = parts.map((part, index) => {
      if (usedToolResultIndexes.has(index)) return null;
      if (part.type === 'tool-call') {
        const resultIndex = parts.findIndex(
          (item, itemIndex) =>
            itemIndex > index &&
            item.type === 'tool-result' &&
            !usedToolResultIndexes.has(itemIndex) &&
            (!part.toolCallId || item.toolCallId === part.toolCallId)
        );
        const result =
          resultIndex >= 0 && parts[resultIndex]?.type === 'tool-result'
            ? (parts[resultIndex] as ToolResultPart)
            : undefined;
        if (resultIndex >= 0) usedToolResultIndexes.add(resultIndex);
        return renderToolPart(message, part, index, result);
      }
      if (part.type === 'tool-result') return renderToolPart(message, part, index);
      return renderMessagePart(message, part, index);
    });
    return rendered.some(Boolean) ? rendered : null;
  };

  const renderUserContextChip = (context: AiChatContext, key: string) => {
    if (context.type === 'current') return null;
    const Icon = getContextChipIcon(context);

    return (
      <span
        key={key}
        className="mx-0.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-foreground/10 bg-foreground/[0.04] px-1.5 align-middle text-xs"
      >
        {context.type === 'table' && context.emoji ? (
          <Emoji emoji={context.emoji} size="1em" className="size-[1em] shrink-0" />
        ) : (
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="max-w-28 truncate">{context.label}</span>
      </span>
    );
  };

  const renderUserAttachmentChip = (attachment: AiChatAttachment, key: string) => (
    <span
      key={key}
      className="mx-0.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-primary/[0.08] bg-primary/[0.04] px-1.5 align-middle text-xs"
    >
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-28 truncate">{attachment.name}</span>
    </span>
  );

  const renderUserMessageParts = (message: IMessage) => {
    const parts = message.parts ?? [];
    if (!parts.length) return null;

    const rendered = parts.flatMap((part, index) => {
      if (part.type === 'text') {
        return part.text ? [<span key={`${message.id}-text-${index}`}>{part.text}</span>] : [];
      }
      if (part.type === 'data-context') {
        return part.contexts.flatMap((context, contextIndex) => {
          const chip = renderUserContextChip(
            context as AiChatContext,
            `${message.id}-context-${index}-${contextIndex}`
          );
          return chip ? [chip] : [];
        });
      }
      if (part.type === 'attachment') {
        return part.attachments.map((attachment, attachmentIndex) =>
          renderUserAttachmentChip(
            attachment,
            `${message.id}-attachment-${index}-${attachmentIndex}`
          )
        );
      }
      return [];
    });

    return rendered.length ? (
      <div className="whitespace-pre-wrap break-words">{rendered}</div>
    ) : null;
  };

  const renderMessages = () => (
    <div className="relative min-h-0 flex-1">
      <ScrollArea
        className="size-full [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!min-w-0"
        viewportRef={messageViewportRef}
        onScroll={updateScrollBottomState}
      >
        <div className="w-full min-w-0 space-y-5 p-4">
          {messages.length === 0 && (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
              <Cuppy className="mb-5 size-14 text-muted-foreground" />
              <div className="text-lg font-semibold">{t('table:aiChat.suggestions.title')}</div>
            </div>
          )}
          {messages.map((message) => {
            const isUser = message.creatorRole === CreatorRole.User;
            const hasMessageContent = message.content.trim().length > 0;
            const hasAssistantTextParts = message.parts?.some(
              (part) => part.type === 'text' && part.text.trim()
            );
            const contextLabels = getVisibleContextLabels(message);
            const userMessageParts = isUser ? renderUserMessageParts(message) : null;
            const assistantMessageParts = isUser ? null : renderMessageParts(message);
            const isAssistantThinking = !isUser && message.status === MessageStatus.Loading;
            const showAssistantMeta = !isUser && message.status !== MessageStatus.Loading;
            const loadingElapsedMs =
              !isUser && message.status === MessageStatus.Loading
                ? Math.max(1000, loadingElapsedNow - message.createdAt)
                : undefined;
            return (
              <div
                key={message.id}
                className={cn('flex min-w-0 flex-col gap-2', isUser && 'items-end')}
              >
                {isUser ? (
                  <div className="max-w-[88%] rounded-md bg-muted px-3 py-2 text-sm leading-6">
                    {userMessageParts ?? (
                      <>
                        <div className="whitespace-pre-wrap">
                          {contextLabels.map((label) => (
                            <span
                              key={label}
                              className="mx-0.5 inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-foreground/10 bg-foreground/[0.04] px-1.5 align-middle text-xs"
                            >
                              <Table2 className="size-3 shrink-0" />
                              {label}
                            </span>
                          ))}
                          {contextLabels.length ? ' ' : ''}
                          {message.content}
                        </div>
                        {Boolean(message.attachmentNames?.length) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {message.attachmentNames?.map((name) => (
                              <span
                                key={name}
                                className="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="w-full min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Cuppy className="size-6 text-foreground" />
                      <span className="text-xs font-semibold text-foreground">Cuppy</span>
                      {loadingElapsedMs && (
                        <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                          {formatElapsed(loadingElapsedMs)}
                        </span>
                      )}
                    </div>
                    {hasMessageContent &&
                      !hasAssistantTextParts &&
                      renderMarkdownText(message.content, `${message.id}-content`)}
                    {assistantMessageParts && (
                      <div className="min-w-0 space-y-2">{assistantMessageParts}</div>
                    )}
                    {isAssistantThinking && (
                      <div className="flex h-7 items-center gap-1.5 text-sm">
                        <Lightbulb className="size-4 shrink-0 text-muted-foreground" />
                        <span className="ai-chat-thinking-text font-medium">
                          {t('table:aiChat.thinking', { defaultValue: '思考中' })}
                        </span>
                      </div>
                    )}
                    {showAssistantMeta && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {message.status === MessageStatus.Done && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="size-3" />
                            {completedText}
                          </span>
                        )}
                        {message.status === MessageStatus.Failed && (
                          <span className="flex items-center gap-1 text-destructive">
                            <Square className="size-3" />
                            {t('common:noun.unknownError')}
                          </span>
                        )}
                        {message.elapsedMs && (
                          <span className="flex items-center gap-1">
                            <Clock3 className="size-3" />
                            {formatElapsed(message.elapsedMs)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messageEndRef} />
        </div>
      </ScrollArea>
      {showScrollBottom && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute bottom-4 left-1/2 size-9 -translate-x-1/2 rounded-full !border-border-high !bg-background !text-foreground shadow-[0_2px_4px_rgb(0_0_0/0.08),0_4px_12px_rgb(0_0_0/0.06)] dark:!bg-zinc-900"
          onClick={scrollToBottom}
        >
          <ArrowDown className="size-4" />
        </Button>
      )}
    </div>
  );

  const getClosestChip = useCallback((node: Node | null) => {
    const editor = editorRef.current;
    const element = node instanceof Element ? node : node?.parentElement;
    const chip = element?.closest<HTMLElement>('.attachment-chip,.context-chip');
    if (!editor || !chip || !editor.contains(chip)) return null;
    return chip;
  }, []);

  const clearSelectedChip = useCallback(() => {
    editorRef.current
      ?.querySelectorAll('.ProseMirror-selectednode')
      .forEach((chip) => chip.classList.remove('ProseMirror-selectednode'));
  }, []);

  const selectChipElement = useCallback(
    (chip: HTMLElement) => {
      const editor = editorRef.current;
      if (!editor) return;
      clearSelectedChip();
      chip.classList.add('ProseMirror-selectednode');

      const range = document.createRange();
      range.selectNode(chip);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedEditorRangeRef.current = range.cloneRange();
    },
    [clearSelectedChip]
  );

  const removeChipElement = useCallback(
    (chip: HTMLElement) => {
      const editor = editorRef.current;
      if (!editor) return;

      const nextNode = chip.nextSibling;
      const attachmentId = chip.dataset.attachmentId;
      const contextId = chip.dataset.contextId;
      chip.remove();

      if (attachmentId) {
        setAttachments((prev) => {
          const removedAttachment = prev.find(({ id }) => id === attachmentId);
          revokeAttachmentUrl(removedAttachment?.objectUrl);
          return prev.filter(({ id }) => id !== attachmentId);
        });
      }
      if (contextId) {
        setContexts((prev) => prev.filter(({ id }) => id !== contextId));
      }

      const range = document.createRange();
      if (nextNode?.parentNode) {
        if (nextNode.nodeType === Node.TEXT_NODE) {
          range.setStart(nextNode, 0);
        } else {
          range.setStartBefore(nextNode);
        }
      } else {
        range.selectNodeContents(editor);
        range.collapse(false);
      }
      range.collapse(true);
      focusEditorRange(range);
      syncComposerFromDom(false);
    },
    [focusEditorRange, revokeAttachmentUrl, syncComposerFromDom]
  );

  const findAdjacentChip = useCallback(
    (node: ChildNode | null, direction: 'previous' | 'next') => {
      let current = node;
      const cleanupNodes: ChildNode[] = [];
      while (current) {
        const chip = getClosestChip(current);
        if (chip) {
          return {
            chip,
            cleanup: () => cleanupNodes.forEach((cleanupNode) => cleanupNode.remove()),
          };
        }
        if (current.nodeType !== Node.TEXT_NODE || current.textContent?.trim()) {
          return { chip: null, cleanup: undefined };
        }

        const nextNode = direction === 'previous' ? current.previousSibling : current.nextSibling;
        cleanupNodes.push(current);
        current = nextNode;
      }
      return { chip: null, cleanup: undefined };
    },
    [getClosestChip]
  );

  const removeAdjacentChip = useCallback(
    (key: 'Backspace' | 'Delete') => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount) return false;

      const range = selection.getRangeAt(0);
      if (!range.collapsed || !isRangeInEditor(range)) return false;

      const selectedChip = getClosestChip(range.startContainer);
      if (selectedChip) {
        removeChipElement(selectedChip);
        return true;
      }

      const direction = key === 'Backspace' ? 'previous' : 'next';
      const { cleanup, sibling } = getChipDeletionSibling(range, direction);
      const { chip, cleanup: cleanupSiblings } = findAdjacentChip(sibling, direction);
      if (!chip) return false;
      cleanup?.();
      cleanupSiblings?.();
      removeChipElement(chip);
      return true;
    },
    [findAdjacentChip, getClosestChip, isRangeInEditor, removeChipElement]
  );

  const openAttachmentByChip = useCallback(
    (chip: HTMLElement | null) => {
      const attachmentId = chip?.dataset.attachmentId;
      const attachment = attachmentId ? attachmentMap.get(attachmentId) : undefined;
      if (!attachment) return false;
      openAttachment(attachment);
      return true;
    },
    [attachmentMap, openAttachment]
  );

  const syncMentionFromSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed || !isRangeInEditor(range)) return;

    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(editor);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const mentionQuery = getMentionQuery(beforeRange.toString());
    if (mentionQuery === undefined) {
      if (contextOpen) {
        setContextOpen(false);
        setContextSearch('');
        setContextPickerPosition(undefined);
      }
      return;
    }
    setContextSearch(mentionQuery);
    setContextOpen(true);
    updateContextPickerPosition(range);
  }, [contextOpen, isRangeInEditor, updateContextPickerPosition]);

  const handleEditorInput = useCallback(() => {
    syncComposerFromDom();
    saveEditorSelection();
    syncMentionFromSelection();
  }, [saveEditorSelection, syncComposerFromDom, syncMentionFromSelection]);

  const handleEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const chip = getClosestChip(event.target as Node);
      if (chip?.dataset.attachmentId && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        event.stopPropagation();
        selectChipElement(chip);
        openAttachmentByChip(chip);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
        return;
      }
      if (event.key === 'Escape') {
        setContextOpen(false);
        setContextSearch('');
        setContextPickerPosition(undefined);
        return;
      }
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;

      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
      if (range && !range.collapsed) {
        window.requestAnimationFrame(() => {
          syncComposerFromDom();
          saveEditorSelection();
        });
        return;
      }
      if (removeAdjacentChip(event.key)) {
        event.preventDefault();
        return;
      }
      window.requestAnimationFrame(() => {
        syncComposerFromDom();
        saveEditorSelection();
      });
    },
    [
      getClosestChip,
      openAttachmentByChip,
      removeAdjacentChip,
      saveEditorSelection,
      selectChipElement,
      sendMessage,
      syncComposerFromDom,
    ]
  );

  const handleEditorClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const chip = getClosestChip(event.target as Node);
      if (!chip) {
        clearSelectedChip();
        return;
      }
      if (!chip.dataset.attachmentId) return;
      event.preventDefault();
      event.stopPropagation();
      selectChipElement(chip);
      openAttachmentByChip(chip);
    },
    [clearSelectedChip, getClosestChip, openAttachmentByChip, selectChipElement]
  );

  if (!baseId || !aiChat || isAIConfigLoading || !chatEnable || availableModels.length === 0) {
    return null;
  }

  const renderComposer = () => (
    <div className="shrink-0 bg-background px-4 py-3">
      <input
        ref={fileInputRef}
        type="file"
        name="chat-attachments"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            readFiles(event.target.files);
          }
          event.target.value = '';
        }}
      />
      <div
        ref={composerRef}
        className="relative rounded-xl border bg-background px-3 pb-3 pt-2 transition-[border-color,box-shadow] duration-200 focus-within:border-ring/70"
      >
        {renderContextPicker()}
        <div className="relative">
          {!input.trim() && contexts.length === 0 && attachments.length === 0 && (
            <span
              key={composerPlaceholder}
              className="pointer-events-none absolute left-0 top-px inline-block h-7 text-sm leading-7 text-muted-foreground/50 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
            >
              {composerPlaceholder}
            </span>
          )}
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            className="max-h-[196px] min-h-[112px] cursor-text select-text overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words pt-px text-sm leading-7 [overflow-wrap:anywhere] focus:outline-none"
            onInput={handleEditorInput}
            onKeyDown={handleEditorKeyDown}
            onKeyUp={saveEditorSelection}
            onMouseUp={saveEditorSelection}
            onFocus={saveEditorSelection}
            onClick={handleEditorClick}
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex min-w-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 rounded-md"
                  title={t('common:actions.add')}
                >
                  <Plus className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                onCloseAutoFocus={(event) => {
                  if (!keepEditorFocusAfterMenuCloseRef.current) return;
                  keepEditorFocusAfterMenuCloseRef.current = false;
                  event.preventDefault();
                  const range = savedEditorRangeRef.current;
                  if (range && isRangeInEditor(range)) {
                    window.requestAnimationFrame(() => focusEditorRange(range.cloneRange()));
                  }
                }}
              >
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-2 size-4" />
                  {t('table:aiChat.addAttachment')}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={insertContextMentionTrigger}>
                  <AtSign className="mr-2 size-4" />
                  {t('table:aiChat.context.button')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {renderModelPicker()}
            <Button
              size="icon"
              className="size-7 rounded-full"
              disabled={
                !selectedModel?.key ||
                isAttachmentUploading ||
                (!isGenerating &&
                  !input.trim() &&
                  attachments.length === 0 &&
                  contexts.length === 0)
              }
              onClick={() => (isGenerating ? stopGenerating() : void sendMessage())}
              title={isGenerating ? t('common:actions.cancel') : t('common:actions.submit')}
            >
              {isGenerating ? <Square className="size-4" /> : <ArrowUp className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAttachmentDropOverlay = () => (
    <div
      className={cn(
        'absolute inset-0 flex size-full flex-col bg-background/30 p-1 opacity-0 backdrop-blur-sm transition-opacity',
        isAttachmentDragActive ? 'z-50 opacity-100' : '-z-10'
      )}
    >
      <div
        role="button"
        aria-label={t('sdk:editor.attachment.uploadDragDefault')}
        className="flex flex-1 cursor-default items-center justify-center rounded-md border border-dashed bg-foreground/5 text-center text-sm text-foreground/60"
      >
        {t('sdk:editor.attachment.uploadDragDefault')}
      </div>
    </div>
  );

  const renderPanelBody = (className?: string) => (
    <FilePreviewProvider
      onOpenChange={(isOpen, fileId) => {
        const attachmentId = isOpen && fileId ? String(fileId) : undefined;
        setPreviewAttachmentId(attachmentId);
        if (!attachmentId) return;
        const chip = editorRef.current?.querySelector<HTMLElement>(
          `.attachment-chip[data-attachment-id="${CSS.escape(attachmentId)}"]`
        );
        if (chip) {
          selectChipElement(chip);
        }
      }}
    >
      <aside
        className={cn('relative flex min-h-0 flex-col bg-background', className)}
        onDragEnter={handleAttachmentDragEnter}
        onDragOver={handleAttachmentDragOver}
        onDragLeave={handleAttachmentDragLeave}
        onDragEnd={resetAttachmentDrag}
        onDrop={handleAttachmentDrop}
        onPaste={handlePaste}
      >
        <FilePreviewDialog ref={filePreviewDialogRef} files={attachmentPreviewFiles} />
        {renderAttachmentDropOverlay()}
        <div
          className={cn(
            'chat-panel-drag-handle flex h-12 shrink-0 items-center gap-2 border-b px-3',
            status === 'expanded' ? 'cursor-move' : 'cursor-default'
          )}
        >
          <MagicAi className="size-4 text-orange-500" />
          <div className="min-w-0 flex-1 truncate text-sm font-medium">
            {t('table:aiChat.title', { defaultValue: 'AI助手' })}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleExpanded}
            title={t('table:aiChat.expand')}
          >
            {status === 'expanded' ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={startNewChat}
            title={t('table:aiChat.newChat')}
          >
            <Plus className="size-4" />
          </Button>
          {renderHistory()}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearCurrentChat}
              title={clearChatTitle}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={close} title={t('table:aiChat.close')}>
            <X className="size-4" />
          </Button>
        </div>
        {renderMessages()}
        {renderComposer()}
      </aside>
    </FilePreviewProvider>
  );

  if (status === 'close') {
    return (
      <Button
        className="fixed bottom-4 right-4 z-40 size-11 rounded-full shadow-lg"
        size="icon"
        onClick={() => {
          setPanelType('general');
          open();
        }}
        title={t('table:aiChat.newChat')}
      >
        <MagicAi className="size-5" />
      </Button>
    );
  }

  if (status === 'expanded') {
    const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
    const maxWidth = Math.max(320, viewportWidth - 24);
    const maxHeight = Math.max(360, viewportHeight - 24);
    const minWidth = Math.min(FLOATING_MIN_WIDTH, maxWidth);
    const minHeight = Math.min(FLOATING_MIN_HEIGHT, maxHeight);
    const width = clamp(floatingRect.width, minWidth, maxWidth);
    const height = clamp(floatingRect.height, minHeight, maxHeight);
    const x = clamp(floatingRect.x, 12, Math.max(12, viewportWidth - width - 12));
    const y = clamp(floatingRect.y, 12, Math.max(12, viewportHeight - height - 12));

    return (
      <Rnd
        size={{ width, height }}
        position={{ x, y }}
        minWidth={minWidth}
        minHeight={minHeight}
        bounds="window"
        dragHandleClassName="chat-panel-drag-handle"
        cancel="button,input,textarea,[contenteditable=true],[role=menuitem]"
        className="z-50 rounded-md border bg-background shadow-2xl"
        onDragStop={(_, data) =>
          setFloatingRect({
            x: data.x,
            y: data.y,
            width,
            height,
          })
        }
        onResizeStop={(_, __, ref, ___, position) =>
          setFloatingRect({
            x: position.x,
            y: position.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          })
        }
      >
        {renderPanelBody('size-full')}
      </Rnd>
    );
  }

  return (
    <div className="relative h-full shrink-0 border-l bg-background" style={{ width: panelWidth }}>
      <button
        type="button"
        aria-label={t('common:actions.change')}
        className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1 cursor-col-resize appearance-none border-0 bg-transparent p-0"
        onMouseDown={handleResizePanel}
        onKeyDown={handleResizePanelKeyDown}
      />
      {renderPanelBody('h-full')}
    </div>
  );
};

const ContextViewList = ({
  views,
  isFetching,
  loadingText,
  emptyText,
  onPick,
}: {
  views: ContextView[];
  isFetching: boolean;
  loadingText: string;
  emptyText: string;
  onPick: (view: ContextView) => void;
}) => (
  <div className="mt-1 max-h-[200px] overflow-y-auto">
    {isFetching ? (
      <div className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {loadingText}
      </div>
    ) : views.length === 0 ? (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
    ) : (
      views.map((item) => {
        const Icon = getViewIcon(item.type);
        return (
          <button
            key={item.id}
            type="button"
            className="group flex w-full cursor-pointer items-center gap-1 rounded-sm px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={() => onPick(item)}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground group-focus:text-accent-foreground" />
            <span className="truncate">{item.name}</span>
          </button>
        );
      })
    )}
  </div>
);
