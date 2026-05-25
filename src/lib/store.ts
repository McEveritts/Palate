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

export interface DiaryTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface AppState {
  isGuest: boolean;
  geminiApiKey: string;
  measurementSystem: 'metric' | 'imperial';
  userProfile: UserProfileState | null;
  diaryTotals: DiaryTotals | null;
  setGuest: (guest: boolean) => void;
  setGeminiApiKey: (key: string) => void;
  setMeasurementSystem: (system: 'metric' | 'imperial') => void;
  setUserProfile: (profile: UserProfileState | null) => void;
  updateProfile: (partial: Partial<UserProfileState>) => void;
  setDiaryTotals: (totals: DiaryTotals | null) => void;
  incrementDiaryTotals: (added: DiaryTotals) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isGuest: false,
      geminiApiKey: '',
      measurementSystem: 'metric',
      userProfile: null,
      diaryTotals: null,
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
      setDiaryTotals: (totals) => set({ diaryTotals: totals }),
      incrementDiaryTotals: (added) => set((state) => ({
        diaryTotals: state.diaryTotals ? {
          calories: state.diaryTotals.calories + added.calories,
          protein: state.diaryTotals.protein + added.protein,
          carbs: state.diaryTotals.carbs + added.carbs,
          fat: state.diaryTotals.fat + added.fat,
        } : { ...added },
      })),
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
