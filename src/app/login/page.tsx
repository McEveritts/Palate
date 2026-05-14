"use client";

import { signIn } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, LogIn, User } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const setGuest = useAppStore((state) => state.setGuest);

  const handleGuestLogin = () => {
    setGuest(true);
    router.push("/");
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950 p-6">
      {/* Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none animate-aurora-1"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-fuchsia-600/20 rounded-full blur-[100px] pointer-events-none animate-aurora-2"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-panel p-10 md:p-12 rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center mb-8 shadow-xl">
            <UtensilsCrossed className="w-10 h-10 text-white drop-shadow-md" />
          </div>

          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">
            Palate
          </h1>
          <p className="text-slate-400 text-lg mb-10">Your AI Sous-Chef</p>

          <div className="w-full flex flex-col gap-4">
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg"
            >
              {/* Simple Google SVG icon */}
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-slate-500 text-sm font-medium">OR</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              onClick={handleGuestLogin}
              className="w-full bg-slate-800/50 hover:bg-slate-800 border border-white/10 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg"
            >
              <User className="w-5 h-5 text-indigo-400" />
              Continue as Guest
            </button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
