import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  isGuest: boolean;
  geminiApiKey: string;
  setGuest: (guest: boolean) => void;
  setGeminiApiKey: (key: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isGuest: false,
      geminiApiKey: '',
      setGuest: (guest) => set({ isGuest: guest }),
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
    }),
    {
      name: 'palate-storage', // unique name
    }
  )
);
