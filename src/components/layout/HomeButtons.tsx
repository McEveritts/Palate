"use client";

import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HomeButtons() {
  const { status } = useSession();
  const isGuest = useAppStore((state) => state.isGuest);
  const setGuest = useAppStore((state) => state.setGuest);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGuestClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setGuest(true);
    document.cookie = "palate_guest=true; path=/; max-age=2592000; SameSite=Lax; Secure";
    router.push("/ask_sage");
  };

  if (!mounted) {
    return (
      <div className="flex flex-wrap gap-4 justify-center mt-4 min-h-[58px]">
        <Link
          href="/login"
          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold rounded-xl transition-all shadow-lg border border-indigo-500/30 text-lg"
        >
          Get Started
        </Link>
        <Link
          href="/ask_sage"
          className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all text-lg"
        >
          Try as Guest
        </Link>
      </div>
    );
  }

  const isUserLoggedIn = status === "authenticated" || isGuest;

  return (
    <div className="flex flex-wrap gap-4 justify-center mt-4">
      {isUserLoggedIn ? (
        <Link
          href="/ask_sage"
          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold rounded-xl transition-all shadow-lg border border-indigo-500/30 text-lg hover:scale-[1.02] active:scale-[0.98]"
        >
          Go to Dashboard
        </Link>
      ) : (
        <>
          <Link
            href="/login"
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold rounded-xl transition-all shadow-lg border border-indigo-500/30 text-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            Get Started
          </Link>
          <button
            onClick={handleGuestClick}
            className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all text-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            Try as Guest
          </button>
        </>
      )}
    </div>
  );
}
