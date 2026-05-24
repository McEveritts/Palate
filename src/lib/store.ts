import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UserProfileState {
  gender: 'Male' | 'Female' | 'Other';
  activityLevel: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'VeryActive';
  goal: 'Lose' | 'Maintain' | 'Gain';
  dateOfBirth: string;
  weightKg: number;
  heightCm: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

interface AppState {
  isGuest: boolean;
  geminiApiKey: string;
  measurementSystem: 'metric' | 'imperial';
  userProfile: UserProfileState | null;
  setGuest: (guest: boolean) => void;
  setGeminiApiKey: (key: string) => void;
  setMeasurementSystem: (system: 'metric' | 'imperial') => void;
  setUserProfile: (profile: UserProfileState | null) => void;
  updateProfile: (partial: Partial<UserProfileState>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isGuest: false,
      geminiApiKey: '',
      measurementSystem: 'metric',
      userProfile: null,
      setGuest: (guest) => set({ isGuest: guest }),
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      setMeasurementSystem: (system) => set({ measurementSystem: system }),
      setUserProfile: (profile) => set({ userProfile: profile }),
      updateProfile: (partial) => set((state) => {
        if (!state.userProfile) {
          console.warn('updateProfile called with null userProfile — no-op');
          return {};
        }
        return { userProfile: { ...state.userProfile, ...partial } };
      }),
    }),
    {
      name: 'palate-storage',
      // H3 Fix: Use sessionStorage instead of localStorage.
      // Keys are wiped when the tab closes, preventing persistent XSS extraction.
      storage: createJSONStorage(() => sessionStorage),
      // H-10 Fix: Exclude geminiApiKey from persistence entirely.
      partialize: (state) => ({
        isGuest: state.isGuest,
        measurementSystem: state.measurementSystem,
        userProfile: state.userProfile,
      }),
    }
  )
);
