import { LocalStorageKeys } from '@teable/sdk/config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IChatSession {
  id: string;
  baseId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  selectedModel?: string;
  selectedEffort?: 'low' | 'medium' | 'high' | 'xhigh';
}

export interface IChatPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Chat panel visibility states:
 * - 'open'     — panel visible at normal width (side panel)
 * - 'close'    — panel hidden, only cuppy icon shown
 * - 'expanded' — panel floats above the table and can be moved/resized
 *
 * State is persisted to localStorage so the user's preference
 * survives page navigations and browser refreshes.
 */
interface IChatPanelState {
  status: 'open' | 'close' | 'expanded';
  panelType: 'general' | 'app-builder';
  activeChatId?: string;
  chats: IChatSession[];
  panelWidth: number;
  floatingRect: IChatPanelRect;
  setPanelType: (type: 'general' | 'app-builder') => void;
  setActiveChatId: (chatId?: string) => void;
  upsertChat: (chat: IChatSession) => void;
  setBaseChats: (baseId: string, chats: IChatSession[]) => void;
  removeEmptyChat: (chatId: string) => void;
  setPanelWidth: (width: number) => void;
  setFloatingRect: (rect: IChatPanelRect) => void;
  close: () => void;
  open: () => void;
  expand: () => void;
  toggleVisible: () => void;
  toggleExpanded: () => void;
}

export const useChatPanelStore = create<IChatPanelState>()(
  persist(
    (set) => ({
      status: 'close',
      panelType: 'general',
      activeChatId: undefined,
      chats: [],
      panelWidth: 380,
      floatingRect: {
        x: 120,
        y: 72,
        width: 720,
        height: 620,
      },
      setPanelType: (type: 'general' | 'app-builder') => set({ panelType: type }),
      setActiveChatId: (chatId?: string) => set({ activeChatId: chatId }),
      upsertChat: (chat: IChatSession) =>
        set((state) => {
          const exists = state.chats.some(({ id }) => id === chat.id);
          const chats = exists
            ? state.chats.map((item) => (item.id === chat.id ? { ...item, ...chat } : item))
            : [chat, ...state.chats];
          return {
            activeChatId: chat.id,
            chats: chats.sort((a, b) => b.updatedAt - a.updatedAt),
          };
        }),
      setBaseChats: (baseId: string, chats: IChatSession[]) =>
        set((state) => ({
          chats: [...state.chats.filter((chat) => chat.baseId !== baseId), ...chats].sort(
            (a, b) => b.updatedAt - a.updatedAt
          ),
        })),
      removeEmptyChat: (chatId: string) =>
        set((state) => ({
          chats: state.chats.filter(({ id }) => id !== chatId),
          activeChatId: state.activeChatId === chatId ? undefined : state.activeChatId,
        })),
      setPanelWidth: (width: number) => set({ panelWidth: width }),
      setFloatingRect: (rect: IChatPanelRect) => set({ floatingRect: rect }),
      close: () =>
        set(() => ({
          status: 'close',
        })),
      open: () => set({ status: 'open' }),
      expand: () => set({ status: 'expanded' }),
      toggleVisible: () =>
        set((state) => ({
          status: state.status !== 'close' ? 'close' : 'open',
        })),
      toggleExpanded: () =>
        set((state) => ({ status: state.status === 'expanded' ? 'open' : 'expanded' })),
    }),
    {
      name: LocalStorageKeys.ChatPanel,
      partialize: (state) => ({
        status: state.status,
        activeChatId: state.activeChatId,
        chats: state.chats,
        panelWidth: state.panelWidth,
        floatingRect: state.floatingRect,
      }),
    }
  )
);
