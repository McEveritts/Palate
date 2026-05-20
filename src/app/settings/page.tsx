"use client";

import { useSession, signOut, signIn } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { User, Key, LogOut, Sparkles, Calendar, RefreshCw, Lock, ShieldCheck, AlertCircle } from "lucide-react";
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

  // Google Calendar Integration states
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState("create_sage_calendar");
  const [hasCalendarScope, setHasCalendarScope] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
            setCalendarSyncEnabled(data.googleCalendarSyncEnabled);
            setSelectedCalendarId(data.googleCalendarId || "create_sage_calendar");
            setHasCalendarScope(data.hasCalendarScope);
            setGoogleCalendars(data.googleCalendars || []);
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

  const handleToggleCalendarSync = async (enabled: boolean) => {
    setCalendarSyncEnabled(enabled);
    if (session?.user) {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            googleCalendarSyncEnabled: enabled,
          }),
        });
      } catch (err) {
        console.error("Failed to save calendar sync preference:", err);
      }
    }
  };

  const handleSelectCalendar = async (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    if (session?.user) {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            googleCalendarId: calendarId,
          }),
        });
      } catch (err) {
        console.error("Failed to save selected calendar preference:", err);
      }
    }
  };

  const handleBackfillSync = async () => {
    if (!session?.user) return;
    setBackfilling(true);
    setBackfillMessage(null);
    try {
      const res = await fetch("/api/settings/sync-backfill", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setBackfillMessage({
          type: "success",
          text: `Meticulously synced ${data.synced} future meals to Google Calendar!`,
        });
      } else {
        setBackfillMessage({
          type: "error",
          text: data.error || "Failed to sync scheduled meals.",
        });
      }
    } catch (err) {
      console.error("Failed to backfill scheduled meals:", err);
      setBackfillMessage({
        type: "error",
        text: "An error occurred during calendar backfill.",
      });
    } finally {
      setBackfilling(false);
    }
  };

  const handleAuthorizeGoogleCalendar = () => {
    signIn("google", { callbackUrl: window.location.href });
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

        {/* Google Calendar Sync Section */}
        <section className="glass-panel p-8 rounded-3xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/20 transition-colors" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 group-hover:bg-fuchsia-500/20 transition-colors" />
          
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="text-indigo-400 w-6 h-6 animate-pulse" />
            <h2 className="text-2xl font-bold text-white">Google Calendar Sync</h2>
          </div>

          {!session?.user ? (
            /* Guest Mode */
            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 text-center relative overflow-hidden flex flex-col items-center py-10">
              <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center border border-white/10 mb-4 backdrop-blur-md">
                <Lock className="text-slate-400 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Google Calendar Integration Locked</h3>
              <p className="text-slate-400 max-w-md mx-auto mb-6 text-sm leading-relaxed">
                Synchronize your scheduled culinary plans with your personal Google Calendar. This feature requires you to be signed in via your Google Account.
              </p>
              <button
                onClick={() => {
                  useAppStore.getState().setGuest(false);
                  window.location.href = '/login';
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white rounded-xl font-semibold transition-all shadow-lg"
              >
                Sign In with Google
              </button>
            </div>
          ) : !hasCalendarScope ? (
            /* Logged in, scope not granted */
            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <AlertCircle className="text-amber-400 w-5 h-5 animate-bounce" />
                  Calendar Permissions Required
                </h3>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  Sage requires additional calendar management permissions to sync your meal schedules to Google Calendar.
                </p>
              </div>
              <button
                onClick={handleAuthorizeGoogleCalendar}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white rounded-xl font-semibold transition-all shadow-lg border border-indigo-500/30"
              >
                <ShieldCheck className="w-4 h-4" />
                Authorize Google Calendar
              </button>
            </div>
          ) : (
            /* Logged in, fully authorized */
            <div className="flex flex-col gap-6">
              {/* Enable Toggle */}
              <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">Enable Calendar Sync</h3>
                  <p className="text-slate-400 mt-1 text-sm leading-relaxed">
                    When enabled, scheduled meals are pushed dynamically to your selected Google Calendar.
                  </p>
                </div>
                <div className="flex items-center gap-4 bg-slate-900/60 p-1.5 rounded-2xl border border-white/5 relative shadow-inner">
                  <button
                    onClick={() => handleToggleCalendarSync(true)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 relative z-10 ${
                      calendarSyncEnabled ? 'text-indigo-100' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {calendarSyncEnabled && (
                      <motion.div
                        layoutId="active-sync-bg"
                        className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-fuchsia-600/30 border border-indigo-500/30 rounded-xl shadow-lg shadow-indigo-500/10 animate-fade-in"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-20">Sync On</span>
                  </button>
                  <button
                    onClick={() => handleToggleCalendarSync(false)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 relative z-10 ${
                      !calendarSyncEnabled ? 'text-indigo-100' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {!calendarSyncEnabled && (
                      <motion.div
                        layoutId="active-sync-bg"
                        className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-fuchsia-600/30 border border-indigo-500/30 rounded-xl shadow-lg shadow-indigo-500/10 animate-fade-in"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-20">Sync Off</span>
                  </button>
                </div>
              </div>

              {calendarSyncEnabled && (
                <>
                  {/* Select Target Calendar */}
                  <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">Target Calendar</h3>
                      <p className="text-slate-400 mt-1 text-sm leading-relaxed">
                        Choose which Google Calendar to populate with your meals. Sage can create a dedicated calendar automatically.
                      </p>
                    </div>
                    <div className="w-full md:w-auto min-w-[280px]">
                      <select
                        value={selectedCalendarId}
                        onChange={(e) => handleSelectCalendar(e.target.value)}
                        className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium backdrop-blur-md"
                      >
                        <option value="create_sage_calendar" className="bg-slate-950 text-indigo-300 font-bold">
                          ✨ SageAI Culinary Calendar (Dedicated)
                        </option>
                        {googleCalendars.map((cal) => (
                          <option key={cal.id} value={cal.id} className="bg-slate-950 text-white">
                            {cal.summary} {cal.primary ? "(Primary)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Backfill Calendar Button */}
                  <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">Sync Existing Meal Plans</h3>
                      <p className="text-slate-400 mt-1 text-sm leading-relaxed">
                        Synchronize all scheduled upcoming meals in your database with your Google Calendar now.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 w-full md:w-auto items-end">
                      <button
                        onClick={handleBackfillSync}
                        disabled={backfilling}
                        className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg min-w-[200px]"
                      >
                        <RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
                        {backfilling ? 'Syncing...' : 'Sync Upcoming Meals'}
                      </button>
                      {backfillMessage && (
                        <p className={`text-xs mt-1 font-medium ${backfillMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {backfillMessage.text}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
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

