import { LocalStorageKeys } from '@teable/sdk/config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Chat panel visibility states:
 * - 'open'     — panel visible at normal width (side panel)
 * - 'close'    — panel hidden, only cuppy icon shown
 * - 'expanded' — panel takes up most of the screen
 *
 * State is persisted to localStorage so the user's preference
 * survives page navigations and browser refreshes.
 */
interface IChatPanelState {
  status: 'open' | 'close' | 'expanded';
  panelType: 'general' | 'app-builder';
  setPanelType: (type: 'general' | 'app-builder') => void;
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
      setPanelType: (type: 'general' | 'app-builder') => set({ panelType: type }),
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
      }),
    }
  )
);
