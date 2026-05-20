import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      name: 'palate-storage', // unique name
    }
  )
);
