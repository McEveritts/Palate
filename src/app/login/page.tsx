"use client";

import { useEffect, useState } from "react";
import { signIn, getProviders, ClientSafeProvider, LiteralUnion } from "next-auth/react";
import { BuiltInProviderType } from "next-auth/providers/index";
import { useAppStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User, Lock, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const setGuest = useAppStore((state) => state.setGuest);

  const [providers, setProviders] = useState<Record<
    LiteralUnion<BuiltInProviderType, string>,
    ClientSafeProvider
  > | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getProviders().then((res) => {
      setProviders(res);
    });
  }, []);

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

  const jellyfinPublicUrl = process.env.NEXT_PUBLIC_JELLYFIN_PUBLIC_URL || "https://jellyfin.redonemedia.org";
  const hasJellyfin = Boolean(providers?.jellyfin);

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
            {/* Jellyfin Login Form (Rendered when Jellyfin provider is registered) */}
            {hasJellyfin && (
              <form onSubmit={handleJellyfinLogin} className="w-full flex flex-col gap-3.5 text-left mb-2">
                {errorMessage && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
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
                      placeholder="Username"
                      autoComplete="username"
                      disabled={isLoading}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-slate-900/80 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Password
                    </label>
                    <a
                      href={`${jellyfinPublicUrl.replace(/\/+$/, "")}/web/index.html#!/forgotpassword.html`}
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
                  className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-60"
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
            )}

            {/* Google Login */}
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg"
            >
              {/* Simple Google SVG icon */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-medium uppercase tracking-wider">OR</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            {/* Guest Login */}
            <div>
              <button
                onClick={handleGuestLogin}
                className="w-full bg-slate-800/50 hover:bg-slate-800 border border-white/10 text-white font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition-colors shadow-lg"
              >
                <User className="w-5 h-5 text-indigo-400" />
                Continue as Guest
              </button>
              <p className="text-xs text-slate-500 mt-2">
                Guest data is stored on this device only and does not sync.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
