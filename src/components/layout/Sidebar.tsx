"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Sparkles,
  BrainCircuit,
  LibraryBig,
  UploadCloud,
  Dumbbell,
  HeartPulse,
  Leaf,
  Settings,
  Menu,
  X,
  Calendar,
  MessageSquare,
  History,
  Users,
  CalendarDays,
} from "lucide-react";

interface ChatSession {
  id: string;
  title: string;
  updatedAt?: string | Date;
}

export function Sidebar() {
  const pathname = usePathname();
  const { status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

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
          } catch {
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

  if (pathname === "/login") {
    return null;
  }

  const showRestricted = status === "authenticated";
  const isLoading = status === "loading";

  const getLinkClass = (path: string, exact: boolean = false) => {
    const isActive = exact
      ? pathname === path
      : pathname === path || (path !== "/" && pathname?.startsWith(path));

    if (isActive) {
      return "px-3 py-2.5 rounded-lg flex items-center gap-3 text-white font-medium bg-gradient-to-r from-indigo-500/15 to-indigo-500/5 border border-indigo-500/20 border-l-[3px] border-l-indigo-400";
    }

    return "px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent";
  };

  const getRailIconClass = (path: string, exact: boolean = false) => {
    const isActive = exact
      ? pathname === path
      : pathname === path || (path !== "/" && pathname?.startsWith(path));

    if (isActive) {
      return "w-11 h-11 flex items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.3)] transition-all";
    }

    return "w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent transition-all";
  };

  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      {/* ─── 1. Mobile Header (< 768px) ─── */}
      <header
        className={`md:hidden flex items-center justify-between px-4 h-[65px] z-20 glass-panel rounded-none border-b border-white/5 w-full shrink-0 transition-all duration-300 ${
          isOpen ? "opacity-0 -translate-y-full absolute" : "opacity-100 translate-y-0"
        }`}
      >
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]">
            <Image
              src="/assets/logos/palate-logo.svg"
              alt="Palate Logo"
              width={32}
              height={32}
              suppressHydrationWarning
            />
          </div>
          <div className="text-xl font-bold tracking-tight text-white">Palate</div>
        </Link>
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open navigation menu"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 hover:text-white transition-colors"
        >
          <Menu size={24} suppressHydrationWarning />
        </button>
      </header>

      {/* ─── 2. Mobile & Tablet Slide-Over Drawer (Overlay) ─── */}
      {isOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
            onClick={closeSidebar}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
            className="lg:hidden !fixed top-0 left-0 h-[100dvh] w-[80vw] max-w-[20rem] flex flex-col z-50 p-6 pb-12 glass-panel border-y-0 border-l-0 rounded-none border-r border-white/10 shrink-0 overflow-y-auto shadow-2xl transition-transform duration-300 ease-in-out translate-x-0"
          >
        {/* Mobile Close Button (44x44px touch target) */}
        <button
          onClick={closeSidebar}
          aria-label="Close navigation"
          className="absolute top-4 right-4 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <X size={22} suppressHydrationWarning />
        </button>

        <Link
          href="/"
          className="flex items-center gap-3 mb-8 group transition-opacity hover:opacity-80"
          onClick={closeSidebar}
        >
          <div className="w-9 h-9 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)] group-hover:drop-shadow-[0_0_12px_rgba(99,102,241,0.8)] transition-all">
            <Image
              src="/assets/logos/palate-logo.svg"
              alt="Palate Logo"
              width={36}
              height={36}
              suppressHydrationWarning
            />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">Palate</div>
        </Link>

        {/* Intelligence Section */}
        <div className="mb-6">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-2 pl-3">
            Intelligence
          </div>
          <nav className="flex flex-col gap-1">
            <Link href="/ask_sage" className={getLinkClass("/ask_sage", true)} onClick={closeSidebar}>
              <Sparkles size={18} suppressHydrationWarning /> Ask Sage
            </Link>

            {/* Chat Sessions Sub-tree */}
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
                    <MessageSquare
                      size={13}
                      className={isActive ? "text-indigo-400" : "text-slate-500"}
                      suppressHydrationWarning
                    />
                    <span className="truncate">{s.title || "Untitled Conversation"}</span>
                  </Link>
                );
              })}

              <Link
                href="/ask_sage/history"
                onClick={closeSidebar}
                className={`px-3 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-all duration-200 border ${
                  pathname === "/ask_sage/history"
                    ? "text-white font-medium bg-white/5 border-white/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
                }`}
              >
                <History
                  size={13}
                  className={pathname === "/ask_sage/history" ? "text-indigo-400" : "text-slate-500"}
                  suppressHydrationWarning
                />
                <span className="font-semibold">View More</span>
              </Link>
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-1 animate-pulse mt-1">
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
                <div className="h-10 bg-white/5 rounded-lg w-full"></div>
              </div>
            ) : showRestricted ? (
              <>
                <Link href="/plans" className={getLinkClass("/plans")} onClick={closeSidebar}>
                  <BrainCircuit size={18} suppressHydrationWarning />{" "}
                  <span className="font-bold">Curated By Sage</span>
                </Link>
                <Link href="/calendar" className={getLinkClass("/calendar")} onClick={closeSidebar}>
                  <Calendar size={18} suppressHydrationWarning /> Culinary Calendar
                </Link>
                <Link href="/diary" className={getLinkClass("/diary")} onClick={closeSidebar}>
                  <HeartPulse size={18} suppressHydrationWarning /> Sage Fitness
                </Link>
                <Link href="/collections/zero-waste" className={getLinkClass("/collections/zero-waste")} onClick={closeSidebar}>
                  <Leaf size={18} suppressHydrationWarning /> Zero-Waste
                </Link>
                <Link href="/upload" className={getLinkClass("/upload")} onClick={closeSidebar}>
                  <UploadCloud size={18} suppressHydrationWarning /> Upload Recipes
                </Link>
                <Link href="/vault" className={getLinkClass("/vault")} onClick={closeSidebar}>
                  <LibraryBig size={18} suppressHydrationWarning /> Vault
                </Link>
              </>
            ) : null}
          </nav>
        </div>

        {/* Smart Collections Section */}
        {isLoading ? (
          <div className="mb-6 animate-pulse">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-2 pl-3">
              Smart Collections
            </div>
            <div className="h-10 bg-white/5 rounded-lg w-full mt-1"></div>
          </div>
        ) : showRestricted ? (
          <div className="mb-6">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-2 pl-3">
              Smart Collections
            </div>
            <nav className="flex flex-col gap-1">
              <Link
                href="/collections/macro-optimized"
                className={getLinkClass("/collections/macro-optimized")}
                onClick={closeSidebar}
              >
                <Dumbbell size={18} suppressHydrationWarning /> Macro-Optimized
              </Link>
            </nav>
          </div>
        ) : null}

        {/* Kitchen & Household Integrations */}
        {showRestricted && (
          <div className="mb-6">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-2 pl-3">
              Kitchen & Sync
            </div>
            <nav className="flex flex-col gap-1">
              <Link href="/settings#kitchen" className={getLinkClass("/settings#kitchen")} onClick={closeSidebar}>
                <Users size={18} suppressHydrationWarning /> Kitchen Household
              </Link>
              <Link href="/settings#gcal" className={getLinkClass("/settings#gcal")} onClick={closeSidebar}>
                <CalendarDays size={18} suppressHydrationWarning /> Google Calendar
              </Link>
            </nav>
          </div>
        )}

        <div className="flex-grow"></div>

        <div className="mt-auto pt-4 border-t border-white/5">
          <nav className="flex flex-col gap-1">
            <Link href="/settings" className={getLinkClass("/settings")} onClick={closeSidebar}>
              <Settings size={18} suppressHydrationWarning /> Settings
            </Link>
          </nav>
        </div>
      </aside>
    </>
  )}

      {/* ─── 3. Tablet Collapsed Icon Rail (768px – 1023px) ─── */}
      <nav
        aria-label="Tablet navigation rail"
        className="hidden md:flex lg:hidden w-[72px] shrink-0 h-full flex-col items-center py-5 px-2 glass-panel border-y-0 border-l-0 rounded-none border-r border-white/5 z-20 select-none"
      >
        <Link
          href="/"
          title="Palate Home"
          aria-label="Palate Home"
          className="w-11 h-11 flex items-center justify-center rounded-xl glass-icon-wrapper hover:scale-105 transition-all mb-5"
        >
          <Image
            src="/assets/logos/palate-logo.svg"
            alt="Palate Logo"
            width={28}
            height={28}
            suppressHydrationWarning
          />
        </Link>

        <div className="flex-1 flex flex-col items-center gap-2 w-full">
          <Link
            href="/ask_sage"
            title="Ask Sage"
            aria-label="Ask Sage"
            className={getRailIconClass("/ask_sage", true)}
          >
            <Sparkles size={20} suppressHydrationWarning />
          </Link>

          {showRestricted && (
            <>
              <Link
                href="/calendar"
                title="Culinary Calendar"
                aria-label="Culinary Calendar"
                className={getRailIconClass("/calendar")}
              >
                <Calendar size={20} suppressHydrationWarning />
              </Link>

              <Link
                href="/diary"
                title="Sage Fitness"
                aria-label="Sage Fitness"
                className={getRailIconClass("/diary")}
              >
                <HeartPulse size={20} suppressHydrationWarning />
              </Link>

              <Link
                href="/vault"
                title="Recipe Vault"
                aria-label="Recipe Vault"
                className={getRailIconClass("/vault")}
              >
                <LibraryBig size={20} suppressHydrationWarning />
              </Link>

              <Link
                href="/collections/zero-waste"
                title="Zero-Waste Collections"
                aria-label="Zero-Waste Collections"
                className={getRailIconClass("/collections/zero-waste")}
              >
                <Leaf size={20} suppressHydrationWarning />
              </Link>

              <Link
                href="/collections/macro-optimized"
                title="Macro-Optimized Collections"
                aria-label="Macro-Optimized Collections"
                className={getRailIconClass("/collections/macro-optimized")}
              >
                <Dumbbell size={20} suppressHydrationWarning />
              </Link>
            </>
          )}

          {/* More / Sessions Drawer Toggle Button */}
          <button
            onClick={() => setIsOpen(true)}
            title="More & Conversations"
            aria-label="Open secondary drawer"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all mt-1"
          >
            <Menu size={20} suppressHydrationWarning />
          </button>
        </div>

        <div className="mt-auto">
          <Link
            href="/settings"
            title="Settings"
            aria-label="Settings"
            className={getRailIconClass("/settings")}
          >
            <Settings size={20} suppressHydrationWarning />
          </Link>
        </div>
      </nav>

      {/* ─── 4. Desktop Expanded Sidebar (≥ 1024px) ─── */}
      <aside
        aria-label="Desktop sidebar"
        className="hidden lg:flex w-72 h-full flex-col z-20 p-6 pb-6 glass-panel border-y-0 border-l-0 rounded-none border-r border-white/5 shrink-0 overflow-y-auto"
      >
        <Link
          href="/"
          className="flex items-center gap-3 mb-8 group transition-opacity hover:opacity-80"
        >
          <div className="w-9 h-9 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)] group-hover:drop-shadow-[0_0_12px_rgba(99,102,241,0.8)] transition-all">
            <Image
              src="/assets/logos/palate-logo.svg"
              alt="Palate Logo"
              width={36}
              height={36}
              suppressHydrationWarning
            />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">Palate</div>
        </Link>

        <div className="mb-8">
          <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">
            Intelligence
          </div>
          <nav className="flex flex-col gap-1">
            <Link href="/ask_sage" className={getLinkClass("/ask_sage", true)}>
              <Sparkles size={18} suppressHydrationWarning /> Ask Sage
            </Link>

            <div className="flex flex-col gap-1 pl-4 mt-1 border-l border-white/5 ml-5">
              {sessions.slice(0, 4).map((s) => {
                const isActive = pathname === `/ask_sage/${s.id}`;
                return (
                  <Link
                    key={s.id}
                    href={`/ask_sage/${s.id}`}
                    className={`px-3 py-1.5 rounded-md text-[13px] flex items-center gap-2 truncate transition-all duration-200 border ${
                      isActive
                        ? "text-white font-medium bg-white/5 border-white/10"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
                    }`}
                    title={s.title}
                  >
                    <MessageSquare
                      size={13}
                      className={isActive ? "text-indigo-400" : "text-slate-500"}
                      suppressHydrationWarning
                    />
                    <span className="truncate">{s.title || "Untitled Conversation"}</span>
                  </Link>
                );
              })}

              <Link
                href="/ask_sage/history"
                className={`px-3 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-all duration-200 border ${
                  pathname === "/ask_sage/history"
                    ? "text-white font-medium bg-white/5 border-white/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
                }`}
              >
                <History
                  size={13}
                  className={pathname === "/ask_sage/history" ? "text-indigo-400" : "text-slate-500"}
                  suppressHydrationWarning
                />
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
                <Link href="/plans" className={getLinkClass("/plans")}>
                  <BrainCircuit size={18} suppressHydrationWarning />{" "}
                  <span className="font-bold">Curated By Sage</span>
                </Link>
                <Link href="/calendar" className={getLinkClass("/calendar")}>
                  <Calendar size={18} suppressHydrationWarning /> Culinary Calendar
                </Link>
                <Link href="/diary" className={getLinkClass("/diary")}>
                  <HeartPulse size={18} suppressHydrationWarning /> Sage Fitness
                </Link>
                <Link href="/collections/zero-waste" className={getLinkClass("/collections/zero-waste")}>
                  <Leaf size={18} suppressHydrationWarning /> Zero-Waste
                </Link>
                <Link href="/upload" className={getLinkClass("/upload")}>
                  <UploadCloud size={18} suppressHydrationWarning /> Upload Recipes
                </Link>
                <Link href="/vault" className={getLinkClass("/vault")}>
                  <LibraryBig size={18} suppressHydrationWarning /> Vault
                </Link>
              </>
            ) : null}
          </nav>
        </div>

        {isLoading ? (
          <div className="mb-8 animate-pulse">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">
              Smart Collections
            </div>
            <div className="h-10 bg-white/5 rounded-lg w-full mt-1"></div>
          </div>
        ) : showRestricted ? (
          <div className="mb-8">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">
              Smart Collections
            </div>
            <nav className="flex flex-col gap-1">
              <Link
                href="/collections/macro-optimized"
                className={getLinkClass("/collections/macro-optimized")}
              >
                <Dumbbell size={18} suppressHydrationWarning /> Macro-Optimized
              </Link>
            </nav>
          </div>
        ) : null}

        <div className="flex-grow"></div>

        <div className="mt-auto">
          <nav className="flex flex-col gap-1">
            <Link href="/settings" className={getLinkClass("/settings")}>
              <Settings size={18} suppressHydrationWarning /> Settings
            </Link>
          </nav>
        </div>
      </aside>
    </>
  );
}
