'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Flame } from 'lucide-react';
import { HydrationTracker } from './HydrationTracker';

export interface HydrationEnergyRowProps {
  initialWaterMl?: number;
  initialTargetMl?: number;
  totalExerciseCalories: number;
}

export const HydrationEnergyRow: React.FC<HydrationEnergyRowProps> = ({
  initialWaterMl = 0,
  initialTargetMl = 1893,
  totalExerciseCalories,
}) => {
  const router = useRouter();
  const handleWaterLogged = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <div className="flex items-center justify-between w-full gap-4">
      {/* Hydration — Interactive */}
      <HydrationTracker
        initialWaterMl={initialWaterMl}
        initialTargetMl={initialTargetMl}
        onWaterLogged={handleWaterLogged}
      />

      {/* Active Energy — Display Only */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="p-3 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
          <Flame size={20} />
        </div>
        <div>
          <h4 className="text-sm font-medium text-slate-200">Active Energy</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalExerciseCalories > 0
              ? `${totalExerciseCalories.toLocaleString()} kcal Burned`
              : 'No exercise logged'}
          </p>
        </div>
      </div>
    </div>
  );
};
