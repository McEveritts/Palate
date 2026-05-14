"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sparkles, BrainCircuit, LibraryBig, UploadCloud, Dumbbell, Zap, Leaf, Droplets, Settings } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  
  if (pathname === '/login') {
    return null;
  }

  const showRestricted = status === "authenticated";
  const isLoading = status === "loading";

  const getLinkClass = (path: string, exact: boolean = false) => {
    const isActive = exact 
      ? pathname === path 
      : pathname === path || (path !== '/' && pathname?.startsWith(path));
    
    if (isActive) {
      return "px-3 py-2.5 rounded-lg flex items-center gap-3 text-white font-medium bg-gradient-to-r from-indigo-500/15 to-indigo-500/5 border border-indigo-500/20 border-l-[3px] border-l-indigo-400";
    }
    
    return "px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent";
  };

  return (
    <aside className="w-72 flex flex-col z-10 p-6 glass-panel border-y-0 border-l-0 rounded-none border-r border-white/5 relative shrink-0">
      <Link href="/" className="flex items-center gap-3 mb-10 group transition-opacity hover:opacity-80">
        <div className="w-9 h-9 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)] group-hover:drop-shadow-[0_0_12px_rgba(99,102,241,0.8)] transition-all">
          <Image src="/assets/logos/palate-logo.svg" alt="Palate Logo" width={36} height={36} suppressHydrationWarning />
        </div>
        <div className="text-2xl font-bold tracking-tight text-white">Palate</div>
      </Link>

      <div className="mb-8">
        <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Intelligence</div>
        <nav className="flex flex-col gap-1">
          <Link href="/ask_sage" className={getLinkClass('/ask_sage')}>
            <Sparkles size={18} suppressHydrationWarning /> Ask Sage
          </Link>
          
          {isLoading ? (
            <div className="flex flex-col gap-1 animate-pulse">
              <div className="h-10 bg-white/5 rounded-lg w-full"></div>
              <div className="h-10 bg-white/5 rounded-lg w-full"></div>
              <div className="h-10 bg-white/5 rounded-lg w-full"></div>
              <div className="h-10 bg-white/5 rounded-lg w-full"></div>
            </div>
          ) : showRestricted ? (
            <>
              <Link href="/plans" className={getLinkClass('/plans')}>
                <BrainCircuit size={18} suppressHydrationWarning /> <span className="font-bold">Curated By Sage</span>
              </Link>
              <Link href="/collections/zero-waste" className={getLinkClass('/collections/zero-waste')}>
                <Leaf size={18} suppressHydrationWarning /> Zero-Waste
              </Link>
              <Link href="/upload" className={getLinkClass('/upload')}>
                <UploadCloud size={18} suppressHydrationWarning /> Upload Recipes
              </Link>
              <Link href="/vault" className={getLinkClass('/vault')}>
                <LibraryBig size={18} suppressHydrationWarning /> Vault
              </Link>
            </>
          ) : null}
        </nav>
      </div>

      {isLoading ? (
        <div className="mb-8 animate-pulse">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Smart Collections</div>
          <div className="h-10 bg-white/5 rounded-lg w-full"></div>
        </div>
      ) : showRestricted ? (
        <div className="mb-8">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Smart Collections</div>
          <nav className="flex flex-col gap-1">
            <Link href="/collections/macro-optimized" className={getLinkClass('/collections/macro-optimized')}>
              <Dumbbell size={18} suppressHydrationWarning /> Macro-Optimized
            </Link>
          </nav>
        </div>
      ) : null}

      <div className="flex-grow"></div>

      <div className="mt-auto">
        <nav className="flex flex-col gap-1">
          <Link href="/settings" className={getLinkClass('/settings')}>
            <Settings size={18} suppressHydrationWarning /> Settings
          </Link>
        </nav>
      </div>
    </aside>
  );
}
