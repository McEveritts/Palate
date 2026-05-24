'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WeightChart } from '@/components/fitness/WeightChart';
import { MultiAddDock } from '@/components/fitness/MultiAddDock';

/**
 * Client-side wrapper for the diary page.
 * Renders interactive components that require 'use client':
 * - WeightChart (fetches data, handles state)
 * - MultiAddDock (modal state management)
 */
export function DiaryClientWrapper() {
  const router = useRouter();
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
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
