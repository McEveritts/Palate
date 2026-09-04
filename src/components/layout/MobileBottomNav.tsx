"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Calendar, HeartPulse, LibraryBig } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; suppressHydrationWarning?: boolean }>;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Ask Sage",
    href: "/ask_sage",
    icon: Sparkles,
    isActive: (pathname: string) =>
      pathname === "/" || pathname === "/ask_sage" || pathname.startsWith("/ask_sage/"),
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: Calendar,
    isActive: (pathname: string) =>
      pathname === "/calendar" || pathname.startsWith("/calendar/") || pathname.startsWith("/plans"),
  },
  {
    label: "Fitness",
    href: "/diary",
    icon: HeartPulse,
    isActive: (pathname: string) =>
      pathname === "/diary" || pathname.startsWith("/diary/"),
  },
  {
    label: "Vault",
    href: "/vault",
    icon: LibraryBig,
    isActive: (pathname: string) =>
      pathname === "/vault" || pathname.startsWith("/vault/"),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  // Hide completely on unauthenticated login route
  if (pathname === "/login") {
    return null;
  }

  return (
    <nav
      role="navigation"
      aria-label="Mobile Bottom Navigation"
      className="md:hidden !fixed bottom-0 left-0 right-0 z-30 glass-panel rounded-none border-t border-b-0 border-x-0 border-white/10 bg-slate-950/85 backdrop-blur-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.5)] px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))]"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname || "");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center flex-1 min-h-[44px] min-w-[44px] py-1 px-1 rounded-xl transition-all duration-200 group ${
                active
                  ? "text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <div
                className={`w-9 h-7 flex items-center justify-center rounded-lg transition-all duration-200 ${
                  active
                    ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                    : "group-hover:bg-white/5 text-slate-400 group-hover:text-slate-200"
                }`}
              >
                <Icon size={18} suppressHydrationWarning />
              </div>
              <span
                className={`text-[11px] tracking-tight mt-0.5 leading-tight ${
                  active ? "text-indigo-200 font-bold" : "text-slate-400"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
