import type { IAiChatMessagePart } from '@teable/openapi';
import { LocalStorageKeys } from '@teable/sdk/config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export enum CreatorRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
}

export enum MessageStatus {
  Loading = 'loading',
  Done = 'done',
  Failed = 'failed',
}

export interface IMessage {
  id: string;
  baseId: string;
  chatId: string;
  creatorId: string;
  creatorRole: CreatorRole;
  createdAt: number;
  content: string;
  status: MessageStatus;
  type?: 'table' | 'chart';
  contextLabels?: string[];
  attachmentNames?: string[];
  parts?: IAiChatMessagePart[];
  elapsedMs?: number;
}

interface IMessageState {
  messageList: IMessage[];
  getState: () => IMessageState;
  addMessage: (message: IMessage) => void;
  updateMessage: (messageId: string, message: Partial<IMessage>) => void;
  setBaseMessages: (baseId: string, chatId: string, messages: IMessage[]) => void;
  clearMessage: (filter: (message: IMessage) => boolean) => void;
}

export const useMessageStore = create<IMessageState>()(
  persist(
    (set, get) => ({
      messageList: [],
      getState: () => get(),
      addMessage: (message: IMessage) =>
        set((state) => ({ messageList: [...state.messageList, message] })),
      updateMessage: (messageId: string, message: Partial<IMessage>) => {
        set((state) => ({
          ...state,
          messageList: state.messageList.map((item) =>
            item.id === messageId ? { ...item, ...message } : item
          ),
        }));
      },
      setBaseMessages: (baseId: string, chatId: string, messages: IMessage[]) =>
        set((state) => ({
          messageList: [
            ...state.messageList.filter(
              (message) => message.baseId !== baseId || message.chatId !== chatId
            ),
            ...messages,
          ],
        })),
      clearMessage: (filter: (message: IMessage) => boolean) =>
        set((state) => ({ messageList: state.messageList.filter(filter) })),
    }),
    {
      name: LocalStorageKeys.Chat,
    }
  )
);
