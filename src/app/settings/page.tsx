"use client";

import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { User, Key, LogOut, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const { data: session } = useSession();
  const geminiApiKey = useAppStore((state) => state.geminiApiKey);
  const setGeminiApiKey = useAppStore((state) => state.setGeminiApiKey);
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const setMeasurementSystem = useAppStore((state) => state.setMeasurementSystem);
  
  const [keyInput, setKeyInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (session?.user) {
      fetch("/api/settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setMeasurementSystem(data.metricSystem ? "metric" : "imperial");
            if (data.hasKey) {
              setKeyInput("••••••••••••••••");
            } else {
              setKeyInput("");
            }
          }
        })
        .catch((err) => console.error("Failed to load user settings:", err));
    } else {
      setKeyInput(geminiApiKey);
    }
  }, [session, geminiApiKey, setMeasurementSystem]);

  const handleSaveKey = async () => {
    if (session?.user) {
      setSaving(true);
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            geminiApiKey: keyInput,
            measurementSystem,
          }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.hasKey) {
            setKeyInput("••••••••••••••••");
          }
        }
      } catch (err) {
        console.error("Failed to save settings to server:", err);
      } finally {
        setSaving(false);
      }
    } else {
      setGeminiApiKey(keyInput);
    }
  };

  const handleToggleSystem = async (system: "metric" | "imperial") => {
    setMeasurementSystem(system);
    if (session?.user) {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            measurementSystem: system,
          }),
        });
      } catch (err) {
        console.error("Failed to save system preference:", err);
      }
    }
  };

  if (!mounted) return null;

  return (
    <div className="w-full flex-1 p-8 md:p-12 max-w-4xl mx-auto overflow-y-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-slate-400 mt-2 text-lg">Manage your account and AI configuration.</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* User Profile Section */}
        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <User className="text-indigo-400 w-6 h-6" />
            <h2 className="text-2xl font-bold text-white">User Profile</h2>
          </div>

          {session?.user ? (
            <div className="flex items-center justify-between bg-black/20 p-6 rounded-2xl border border-white/5">
              <div className="flex items-center gap-6">
                {session.user.image ? (
                  <Image 
                    src={session.user.image} 
                    alt="Profile" 
                    width={64} 
                    height={64} 
                    className="rounded-full shadow-lg border border-white/10"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                    <User className="text-slate-400 w-8 h-8" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-white">{session.user.name}</h3>
                  <p className="text-slate-400">{session.user.email}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  useAppStore.getState().setGuest(false);
                  signOut({ callbackUrl: '/login' });
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 hover:text-rose-200 rounded-xl transition-colors border border-rose-500/30 font-medium"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 text-center">
              <p className="text-slate-400 mb-4">You are currently using Palate in Guest Mode.</p>
              <button
                onClick={() => {
                  useAppStore.getState().setGuest(false);
                  window.location.href = '/login';
                }}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
              >
                Sign In to Sync Data
              </button>
            </div>
          )}
        </section>

        {/* Display & Units Section */}
        <section className="glass-panel p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/20 transition-colors" />
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-indigo-400 w-6 h-6 animate-pulse" />
            <h2 className="text-2xl font-bold text-white">Display & Units</h2>
          </div>

          <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Measurement System</h3>
              <p className="text-slate-400 mt-1 text-sm leading-relaxed">
                Choose your default measurement format for recipe creation, scaling, and display.
                Sage will default to metric (grams/ml) or imperial (cups, ounces, tablespoons, Fahrenheit).
              </p>
            </div>
            
            {/* Sliding Toggle Control */}
            <div className="flex items-center gap-4 bg-slate-900/60 p-1.5 rounded-2xl border border-white/5 relative shadow-inner">
              <button
                onClick={() => handleToggleSystem('metric')}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 relative z-10 ${
                  measurementSystem === 'metric' ? 'text-indigo-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {measurementSystem === 'metric' && (
                  <motion.div
                    layoutId="active-unit-bg"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-fuchsia-600/30 border border-indigo-500/30 rounded-xl shadow-lg shadow-indigo-500/10 animate-fade-in"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-20">Metric (g / ml)</span>
              </button>
              
              <button
                onClick={() => handleToggleSystem('imperial')}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 relative z-10 ${
                  measurementSystem === 'imperial' ? 'text-indigo-100' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {measurementSystem === 'imperial' && (
                  <motion.div
                    layoutId="active-unit-bg"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-fuchsia-600/30 border border-indigo-500/30 rounded-xl shadow-lg shadow-indigo-500/10 animate-fade-in"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-20">Imperial (oz / cups)</span>
              </button>
            </div>
          </div>
        </section>

        {/* SageAI Configuration Section */}
        <section className="glass-panel p-8 rounded-3xl border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <Key className="text-fuchsia-400 w-6 h-6" />
            <h2 className="text-2xl font-bold text-white">SageAI Configuration</h2>
          </div>

          <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
            <p className="text-slate-400 mb-6 max-w-2xl">
              Palate requires a Google Gemini API Key to synthesize recipes and perform zero-waste analysis. 
              This key is stored <strong className="text-white">securely in your encrypted cloud vault</strong> and is never exposed in plain text.
            </p>

            <div className="flex flex-col gap-3">
              <label htmlFor="api-key" className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                Gemini API Key
              </label>
              <div className="flex gap-4">
                <input
                  id="api-key"
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 placeholder-slate-600 transition-all"
                />
                <button
                  onClick={handleSaveKey}
                  disabled={saving || (session?.user ? false : keyInput === geminiApiKey)}
                  className="px-8 py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {saving ? 'Saving...' : 'Save Key'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Get your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Google AI Studio</a>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
