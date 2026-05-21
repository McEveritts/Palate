import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Palate - Your AI Sous-Chef",
  description:
    "Palate is an AI-powered culinary assistant. Transform pantry chaos, dietary constraints, or fleeting desires into a masterpiece with Sage, your personal digital sous-chef.",
};

export default function Home() {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-8 md:p-12 overflow-y-auto">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-10">
        {/* Hero */}
        <div className="glass-panel glass-hero p-10 lg:p-14 flex flex-col items-center text-center gap-6 w-full rounded-3xl border border-white/5">
          <div className="w-20 h-20 rounded-full glass-icon-wrapper flex items-center justify-center text-4xl">
            🌿
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] m-0">
            Welcome to Palate
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-xl m-0 leading-relaxed">
            Your AI-powered culinary assistant. Transform pantry chaos, dietary
            constraints, or fleeting desires into a masterpiece with{" "}
            <strong className="text-indigo-300">Sage</strong>, your personal
            digital sous-chef.
          </p>

          <div className="flex flex-wrap gap-4 justify-center mt-4">
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
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 text-center">
            <div className="text-3xl mb-3">🍳</div>
            <h3 className="text-white font-bold text-lg mb-1">AI Recipes</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Synthesize recipes from ingredients, cravings, or dietary needs with Sage.
            </p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-white/5 text-center">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-white font-bold text-lg mb-1">USDA Nutrition</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Deterministic nutritional data from USDA FoodData Central.
            </p>
          </div>
          <div className="glass-panel p-6 rounded-2xl border border-white/5 text-center">
            <div className="text-3xl mb-3">📅</div>
            <h3 className="text-white font-bold text-lg mb-1">Calendar Sync</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Push meal plans to Google Calendar automatically.
            </p>
          </div>
        </div>

        {/* Footer links */}
        <div className="flex items-center gap-6 text-sm text-slate-500 pb-8">
          <Link
            href="/privacy"
            className="hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          <span className="text-slate-700">•</span>
          <Link
            href="/terms"
            className="hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
