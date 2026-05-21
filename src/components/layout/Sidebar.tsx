"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sparkles, BrainCircuit, LibraryBig, UploadCloud, Dumbbell, Leaf, Settings, Menu, X, Calendar, MessageSquare, History } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    let active = true;

    async function loadSessions() {
      if (status === "loading") return;

      if (status === "authenticated") {
        const { getChatSessions } = await import("@/app/actions");
        const res = await getChatSessions();
        if (res.success && active) {
          setSessions(res.sessions || []);
        }
      } else {
        const stored = localStorage.getItem("palate_guest_sessions");
        if (stored && active) {
          try {
            setSessions(JSON.parse(stored));
          } catch (e) {
            setSessions([]);
          }
        } else if (active) {
          setSessions([]);
        }
      }
    }

    loadSessions();

    const handleUpdate = () => {
      loadSessions();
    };

    window.addEventListener("palate-chat-sessions-updated", handleUpdate);
    return () => {
      active = false;
      window.removeEventListener("palate-chat-sessions-updated", handleUpdate);
    };
  }, [status]);
  
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

  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      {/* Mobile Header (Hidden on Desktop) */}
      <div className={`lg:hidden flex items-center justify-between p-4 z-20 glass-panel rounded-none border-b border-white/5 w-full shrink-0 transition-all duration-300 ${isOpen ? "opacity-0 -translate-y-full absolute" : "opacity-100 translate-y-0"}`}>
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]">
            <Image src="/assets/logos/palate-logo.svg" alt="Palate Logo" width={32} height={32} suppressHydrationWarning />
          </div>
          <div className="text-xl font-bold tracking-tight text-white">Palate</div>
        </Link>
        <button onClick={() => setIsOpen(true)} className="text-slate-300 hover:text-white transition-colors">
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Main Sidebar */}
      <aside className={`fixed lg:relative top-0 left-0 h-[100dvh] lg:h-full w-[80vw] max-w-[18rem] lg:w-72 flex flex-col z-50 p-6 pb-12 lg:pb-6 glass-panel border-y-0 border-l-0 rounded-none border-r border-white/5 shrink-0 overflow-y-auto transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        
        {/* Mobile-only additional opacity layer (+12%) */}
        <div className="lg:hidden absolute inset-0 bg-black/[0.12] pointer-events-none -z-10"></div>

        {/* Mobile Close Button */}
        <button onClick={closeSidebar} className="lg:hidden absolute top-5 right-5 text-slate-400 hover:text-white transition-colors">
          <X size={24} />
        </button>

        <Link href="/" className="flex items-center gap-3 mb-10 group transition-opacity hover:opacity-80" onClick={closeSidebar}>
          <div className="w-9 h-9 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)] group-hover:drop-shadow-[0_0_12px_rgba(99,102,241,0.8)] transition-all">
            <Image src="/assets/logos/palate-logo.svg" alt="Palate Logo" width={36} height={36} suppressHydrationWarning />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">Palate</div>
        </Link>

        <div className="mb-8">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Intelligence</div>
          <nav className="flex flex-col gap-1">
            <Link href="/ask_sage" className={getLinkClass('/ask_sage', true)} onClick={closeSidebar}>
              <Sparkles size={18} suppressHydrationWarning /> Ask Sage
            </Link>
            
            <div className="flex flex-col gap-1 pl-4 mt-1 border-l border-white/5 ml-5">
              {sessions.slice(0, 4).map((s) => {
                const isActive = pathname === `/ask_sage/${s.id}`;
                return (
                  <Link
                    key={s.id}
                    href={`/ask_sage/${s.id}`}
                    onClick={closeSidebar}
                    className={`px-3 py-1.5 rounded-md text-[13px] flex items-center gap-2 truncate transition-all duration-200 border ${
                      isActive
                        ? "text-white font-medium bg-white/5 border-white/10"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
                    }`}
                    title={s.title}
                  >
                    <MessageSquare size={13} className={isActive ? "text-indigo-400" : "text-slate-500"} suppressHydrationWarning />
                    <span className="truncate">{s.title || "Untitled Conversation"}</span>
                  </Link>
                );
              })}
              
              <Link
                href="/ask_sage/history"
                onClick={closeSidebar}
                className={`px-3 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-all duration-200 border ${
                  pathname === '/ask_sage/history'
                    ? "text-white font-medium bg-white/5 border-white/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
                }`}
              >
                <History size={13} className={pathname === '/ask_sage/history' ? "text-indigo-400" : "text-slate-500"} suppressHydrationWarning />
                <span className="font-semibold">View More</span>
              </Link>
            </div>
            
            {isLoading ? (
              <div className="flex flex-col gap-1 animate-pulse mt-1">
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
              </div>
            ) : showRestricted ? (
              <>
                <Link href="/plans" className={getLinkClass('/plans')} onClick={closeSidebar}>
                  <BrainCircuit size={18} suppressHydrationWarning /> <span className="font-bold">Curated By Sage</span>
                </Link>
                <Link href="/calendar" className={getLinkClass('/calendar')} onClick={closeSidebar}>
                  <Calendar size={18} suppressHydrationWarning /> Culinary Calendar
                </Link>
                <Link href="/collections/zero-waste" className={getLinkClass('/collections/zero-waste')} onClick={closeSidebar}>
                  <Leaf size={18} suppressHydrationWarning /> Zero-Waste
                </Link>
                <Link href="/upload" className={getLinkClass('/upload')} onClick={closeSidebar}>
                  <UploadCloud size={18} suppressHydrationWarning /> Upload Recipes
                </Link>
                <Link href="/vault" className={getLinkClass('/vault')} onClick={closeSidebar}>
                  <LibraryBig size={18} suppressHydrationWarning /> Vault
                </Link>
              </>
            ) : null}
          </nav>
        </div>

        {isLoading ? (
          <div className="mb-8 animate-pulse">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Smart Collections</div>
            <div className="h-10 bg-white/5 rounded-lg w-full mt-1"></div>
          </div>
        ) : showRestricted ? (
          <div className="mb-8">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Smart Collections</div>
            <nav className="flex flex-col gap-1">
              <Link href="/collections/macro-optimized" className={getLinkClass('/collections/macro-optimized')} onClick={closeSidebar}>
                <Dumbbell size={18} suppressHydrationWarning /> Macro-Optimized
              </Link>
            </nav>
          </div>
        ) : null}

        <div className="flex-grow"></div>

        <div className="mt-auto">
          <nav className="flex flex-col gap-1">
            <Link href="/settings" className={getLinkClass('/settings')} onClick={closeSidebar}>
              <Settings size={18} suppressHydrationWarning /> Settings
            </Link>
          </nav>
        </div>
      </aside>
    </>
  );
}
