"use client";

import { useState, useEffect } from "react";
import { signIn, getProviders } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User, Lock, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const setGuest = useAppStore((state) => state.setGuest);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive initial enablement strictly from NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED === "true" (never default to visible)
  const isEnvEnabled = process.env.NEXT_PUBLIC_JELLYFIN_LOGIN_ENABLED === "true";
  const [serverHasJellyfin, setServerHasJellyfin] = useState<boolean>(isEnvEnabled);

  useEffect(() => {
    let isMounted = true;
    getProviders()
      .then((providers) => {
        if (isMounted) {
          setServerHasJellyfin(Boolean(providers && providers.jellyfin));
        }
      })
      .catch(() => {
        if (isMounted) {
          setServerHasJellyfin(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const hasJellyfin = isEnvEnabled && serverHasJellyfin;
  const jellyfinPublicUrl = process.env.NEXT_PUBLIC_JELLYFIN_PUBLIC_URL || "https://jellyfin.redonemedia.org";

  const handleGuestLogin = () => {
    setGuest(true);
    document.cookie = "palate_guest=true; path=/; max-age=2592000; SameSite=Lax; Secure";
    router.push("/");
  };

  const handleJellyfinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMessage("Please enter your Jellyfin username.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await signIn("jellyfin", {
        redirect: false,
        username: username.trim(),
        password,
      });

      if (!res || res.error) {
        const err = res?.error;
        if (err === "RateLimited") {
          setErrorMessage("Too many login attempts. Please wait a minute and try again.");
        } else if (err === "AccountDisabled") {
          setErrorMessage("This Jellyfin account has been disabled.");
        } else if (err === "JellyfinUnavailable") {
          setErrorMessage("Jellyfin server is unreachable. Please try again later.");
        } else {
          setErrorMessage("Invalid username or password. Please try again.");
        }
      } else if (res.ok) {
        setGuest(false);
        document.cookie = "palate_guest=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        router.push("/");
        router.refresh();
      }
    } catch {
      setErrorMessage("Authentication service is temporarily unavailable.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-y-auto bg-slate-950 p-4 sm:p-6 py-10">
      {/* Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none animate-aurora-1"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-fuchsia-600/20 rounded-full blur-[100px] pointer-events-none animate-aurora-2"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10 my-auto"
      >
        <div className="glass-panel p-8 sm:p-10 md:p-12 rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-xl drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            <Image src="/assets/logos/palate-logo.svg" alt="Palate Logo" width={80} height={80} priority suppressHydrationWarning />
          </div>

          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">
            Palate
          </h1>
          <p className="text-slate-400 text-lg mb-8">Your AI Sous-Chef</p>

          <div className="w-full flex flex-col gap-4">
            {/* Jellyfin Login Form or Styled Unavailable State */}
            {hasJellyfin ? (
              <form onSubmit={handleJellyfinLogin} className="w-full flex flex-col gap-3.5 text-left mb-2">
                {errorMessage && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider pl-1">
                    Jellyfin Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. chef_john"
                      autoComplete="username"
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900/80 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center pl-1">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Password
                    </label>
                    <a
                      href={jellyfinPublicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900/80 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <span>Sign in with Jellyfin</span>
                  )}
                </button>
              </form>
            ) : (
              <div className="w-full p-5 mb-2 bg-slate-900/60 border border-amber-500/20 rounded-2xl flex flex-col items-center text-center gap-2">
                <AlertCircle className="w-7 h-7 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-200">Jellyfin Authentication Unavailable</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Jellyfin sign-in is currently disabled or unconfigured on this instance. You may continue as a guest below.
                </p>
              </div>
            )}

            {/* Separator / Guest Access */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-4 text-xs uppercase tracking-widest text-slate-400">or</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              Continue as Guest
            </button>

            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
              Jellyfin is the identity provider for Palate. Your credentials are authenticated directly against your private Jellyfin server.
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
