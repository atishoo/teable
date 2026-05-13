import { useQueryClient } from '@tanstack/react-query';
import { MagicAi, Maximize2, Minimize2, X } from '@teable/icons';
import { aiGenerateStream } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId } from '@teable/sdk/hooks';
import { Button, cn, Textarea } from '@teable/ui-lib/shadcn';
import { Loader2, Send } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef, useState } from 'react';
import { tableConfig } from '@/features/i18n/table.config';
import { useAI } from '../../hooks/useAI';
import { useDisableAIAction } from '../../hooks/useDisableAIAction';
import { useChatPanelStore } from './useChatPanelStore';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type GridSelectionContext = {
  rows?: [number, number][];
  addToChat?: boolean;
};

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const ChatPanel = () => {
  const baseId = useBaseId();
  const queryClient = useQueryClient();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const { enable: aiEnabled } = useAI();
  const { aiChat } = useDisableAIAction();
  const { status, close, open, toggleExpanded, setPanelType } = useChatPanelStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const selection = baseId
    ? queryClient.getQueryData<GridSelectionContext>(ReactQueryKeys.gridSelection(baseId))
    : undefined;
  const selectionContext =
    selection?.addToChat && selection.rows?.length
      ? selection.rows
          .map(([start, end]) =>
            t('table:aiChat.context.selectionRows', {
              start: Math.min(start, end) + 1,
              end: Math.max(start, end) + 1,
            })
          )
          .join(', ')
      : '';

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, isGenerating]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  if (!baseId || !aiEnabled || !aiChat) {
    return null;
  }

  const sendMessage = async () => {
    const userInput = input.trim();
    if (!userInput || isGenerating) return;

    const userMessage: Message = { id: createId(), role: 'user', content: userInput };
    const assistantMessage: Message = { id: createId(), role: 'assistant', content: '' };
    const recentMessages = messages.slice(-6);
    const prompt = [
      selectionContext ? `Context: ${selectionContext}` : '',
      ...recentMessages.map((message) => `${message.role}: ${message.content}`),
      `user: ${userInput}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    setInput('');
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsGenerating(true);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await aiGenerateStream(baseId, { prompt }, controller.signal);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let reading = true;
      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          break;
        }
        const chunk = decoder.decode(value);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common:noun.unknownError');
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: errorMessage } : message
        )
      );
    } finally {
      setIsGenerating(false);
      controllerRef.current = null;
    }
  };

  if (status === 'close') {
    return (
      <Button
        className="fixed bottom-4 right-4 z-40 size-10 rounded-full shadow-lg"
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

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-l bg-background',
        status === 'expanded'
          ? 'fixed inset-y-3 right-3 z-40 w-[min(720px,calc(100vw-24px))] rounded-md border shadow-xl'
          : 'h-full w-[360px]'
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <MagicAi className="size-4 text-orange-500" />
        <div className="flex-1 truncate text-sm font-medium">{t('table:aiChat.newChat')}</div>
        <Button variant="ghost" size="icon-xs" onClick={toggleExpanded}>
          {status === 'expanded' ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={close}>
          <X className="size-4" />
        </Button>
      </div>
      {selectionContext && (
        <div className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">
          {selectionContext}
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('table:aiChat.suggestions.title')}
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'whitespace-pre-wrap rounded-md px-3 py-2 text-sm',
              message.role === 'user'
                ? 'ml-8 bg-primary text-primary-foreground'
                : 'mr-8 bg-muted text-foreground'
            )}
          >
            {message.content || (isGenerating && message.role === 'assistant' ? '...' : '')}
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>
      <div className="flex shrink-0 gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={t('table:aiChat.inputPlaceholder')}
          className="max-h-28 min-h-10 resize-none"
        />
        <Button
          size="icon"
          disabled={!input.trim() || isGenerating}
          onClick={() => void sendMessage()}
        >
          {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </aside>
  );
};
