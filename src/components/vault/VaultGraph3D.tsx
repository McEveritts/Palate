"use client";

import dynamic from 'next/dynamic';
import React from 'react';
import { VaultRecipe } from '@/lib/vaultParser';

// Dynamically import the WebGL 3D graph with SSR disabled to prevent Node compilation errors
const VaultGraph3DClient = dynamic(
  () => import('./VaultGraph3DClient'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[80vh] flex flex-col items-center justify-center border border-white/5 rounded-3xl bg-slate-950/20 backdrop-blur-md relative overflow-hidden">
        {/* Glow element */}
        <div className="absolute w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-indigo-400 animate-spin"></div>
          <p className="text-sm font-bold tracking-widest text-indigo-300 uppercase animate-pulse">
            Configuring 3D Cosmos Space...
          </p>
        </div>
      </div>
    )
  }
);

interface VaultGraph3DProps {
  recipes: VaultRecipe[];
}

export function VaultGraph3D({ recipes }: VaultGraph3DProps) {
  return <VaultGraph3DClient recipes={recipes} />;
}
