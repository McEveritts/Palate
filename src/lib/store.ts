import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AppState {
  isGuest: boolean;
  geminiApiKey: string;
  measurementSystem: 'metric' | 'imperial';
  setGuest: (guest: boolean) => void;
  setGeminiApiKey: (key: string) => void;
  setMeasurementSystem: (system: 'metric' | 'imperial') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isGuest: false,
      geminiApiKey: '',
      measurementSystem: 'metric',
      setGuest: (guest) => set({ isGuest: guest }),
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      setMeasurementSystem: (system) => set({ measurementSystem: system }),
    }),
    {
      name: 'palate-storage',
      // H3 Fix: Use sessionStorage instead of localStorage.
      // Keys are wiped when the tab closes, preventing persistent XSS extraction.
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
