'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WeightChart } from '@/components/fitness/WeightChart';
import { MultiAddDock } from '@/components/fitness/MultiAddDock';
import ProfileOnboarding from '@/components/fitness/ProfileOnboarding';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';

interface DiaryClientWrapperProps {
  userProfile: {
    gender: string;
    dateOfBirth: string;
    weightKg: number;
    heightCm: number;
    activityLevel: string;
    goal: string;
    targetCalories: number;
    targetProtein: number;
    targetCarbs: number;
    targetFat: number;
  } | null;
}

/**
 * Client-side wrapper for the diary page.
 * Renders interactive components that require 'use client':
 * - Fitness Profile (collapsible ProfileOnboarding)
 * - WeightChart (fetches data, handles state)
 * - MultiAddDock (modal state management)
 */
export function DiaryClientWrapper({ userProfile }: DiaryClientWrapperProps) {
  const router = useRouter();
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      {/* Fitness Profile Section */}
      <div className="space-y-3">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="w-full flex items-center justify-between px-1 pt-2 border-b border-white/10 pb-2 group cursor-pointer"
        >
          <h2 className="text-xl font-medium text-white/90 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Fitness Profile
          </h2>
          {profileOpen ? (
            <ChevronUp className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
          )}
        </button>
        {profileOpen && (
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2" />
            <ProfileOnboarding existingProfile={userProfile} onComplete={() => router.refresh()} />
          </div>
        )}
      </div>

      {/* Weight & Progress Chart */}
      <div className="space-y-3">
        <h2 className="text-xl font-medium text-white/90 px-1 pt-2 border-b border-white/10 pb-2">
          Weight & Progress
        </h2>
        <WeightChart />
      </div>

      {/* Multi-Add Dock (fixed to bottom) */}
      <MultiAddDock
        onFoodLogged={handleRefresh}
        onExerciseLogged={handleRefresh}
      />
    </>
  );
}
