"use client";

import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { User, Key, LogOut, Sparkles, ShieldCheck, AlertCircle, Home, Copy, Check, UserPlus, DoorOpen, Wand2, UserMinus, Activity, Calendar, RefreshCw, Unlink, ExternalLink, CheckCircle2 } from "lucide-react";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

export default function SettingsPage() {
  const { data: session } = useSession();
  const geminiApiKey = useAppStore((state) => state.geminiApiKey);
  const setGeminiApiKey = useAppStore((state) => state.setGeminiApiKey);
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const setMeasurementSystem = useAppStore((state) => state.setMeasurementSystem);
  
  const [keyInput, setKeyInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyVerification, setKeyVerification] = useState<{ status: "idle" | "success" | "error"; message: string }>({ status: "idle", message: "" });

  // Google Calendar integration states
  const [hasGoogleConnection, setHasGoogleConnection] = useState(false);
  const [googleCalendarSyncEnabled, setGoogleCalendarSyncEnabled] = useState(false);
  const [googleCalendarId, setGoogleCalendarId] = useState<string>("");
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>([]);
  const [calendarBackfilling, setCalendarBackfilling] = useState(false);
  const [calendarDisconnecting, setCalendarDisconnecting] = useState(false);
  const [calendarFeedback, setCalendarFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Household states
  const [household, setHousehold] = useState<{
    id: string;
    name: string;
    members: { id: string; name: string | null; email: string | null; image: string | null }[];
    pendingInvites: { code: string; expiresAt: string }[];
  } | null>(null);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMessage, setRedeemMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [householdNameEdit, setHouseholdNameEdit] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [suggestingName, setSuggestingName] = useState(false);

  // Fitness Profile states
  const [fitnessProfile, setFitnessProfile] = useState<{
    gender: string;
    dateOfBirth: string;
    weightKg: number;
    heightCm: number;
    activityLevel: string;
    goal: string;
    targetCalories: number;
    targetProtein: number;
    targetCarbs: number;
    targetFat: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    requestAnimationFrame(() => {
      if (active) setMounted(true);
    });
    if (session?.user) {
      fetch("/api/settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && active) {
            setMeasurementSystem(data.metricSystem ? "metric" : "imperial");
            if (data.hasKey) {
              setKeyInput("••••••••••••••••");
            } else {
              setKeyInput("");
            }
            setHasGoogleConnection(Boolean(data.hasGoogleConnection));
            setGoogleCalendarSyncEnabled(Boolean(data.googleCalendarSyncEnabled));
            setGoogleCalendarId(data.googleCalendarId || "");
            setCalendars(data.calendars || []);
          }
        })
        .catch((err) => {
          console.error("Failed to load user settings:", err);
        });

      // Check query params for integration status
      const timeoutId = setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("connected") === "google_calendar") {
          setCalendarFeedback({
            type: "success",
            message: "Google Calendar successfully connected!",
          });
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (params.get("error")) {
          const err = params.get("error");
          const messages: Record<string, string> = {
            account_already_linked_to_another_user: "This Google account is already linked to a different Palate user.",
            session_required: "An active Jellyfin login session is required to connect Google Calendar.",
            state_mismatch: "Security verification failed (state mismatch). Please try connecting again.",
            expired_oauth_state: "The authorization request expired. Please try connecting again.",
            google_not_configured: "Google integration is not configured on this server.",
          };
          setCalendarFeedback({
            type: "error",
            message: messages[err || ""] || `Connection error: ${err}`,
          });
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }, 0);

      return () => clearTimeout(timeoutId);
    } else {
      requestAnimationFrame(() => {
        if (active) setKeyInput(geminiApiKey);
      });
    }
    return () => {
      active = false;
    };
  }, [session, geminiApiKey, setMeasurementSystem]);

  const handleToggleCalendarSync = async () => {
    const nextVal = !googleCalendarSyncEnabled;
    setGoogleCalendarSyncEnabled(nextVal);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleCalendarSyncEnabled: nextVal }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setGoogleCalendarSyncEnabled(!nextVal); // revert optimistic state
        setCalendarFeedback({
          type: "error",
          message: data.error || "Failed to update calendar sync preference.",
        });
      }
    } catch (e) {
      console.error("Failed to toggle calendar sync:", e);
      setGoogleCalendarSyncEnabled(!nextVal); // revert optimistic state
      setCalendarFeedback({
        type: "error",
        message: "Network error while updating calendar sync preference.",
      });
    }
  };

  const handleSelectCalendar = async (calId: string) => {
    const previousCalId = googleCalendarId;
    setGoogleCalendarId(calId);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleCalendarId: calId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setGoogleCalendarId(previousCalId); // revert optimistic state
        setCalendarFeedback({
          type: "error",
          message: data.error || "Failed to update target calendar.",
        });
      }
    } catch (e) {
      console.error("Failed to save calendar selection:", e);
      setGoogleCalendarId(previousCalId); // revert optimistic state
      setCalendarFeedback({
        type: "error",
        message: "Network error while updating target calendar.",
      });
    }
  };

  const handleBackfillCalendar = async () => {
    setCalendarBackfilling(true);
    setCalendarFeedback(null);
    try {
      const res = await fetch("/api/settings/sync-backfill", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCalendarFeedback({ type: "success", message: data.message });
      } else {
        setCalendarFeedback({ type: "error", message: data.error || "Failed to sync calendar." });
      }
    } catch {
      setCalendarFeedback({ type: "error", message: "Network error while syncing calendar." });
    } finally {
      setCalendarBackfilling(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect Google Calendar? Existing events on Google will remain, but upcoming meals will stop syncing."
      )
    ) {
      return;
    }
    setCalendarDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/disconnect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setHasGoogleConnection(false);
        setGoogleCalendarSyncEnabled(false);
        setGoogleCalendarId("");
        setCalendars([]);
        if (data.revocationWarning) {
          setCalendarFeedback({
            type: "error",
            message: data.revocationWarning,
          });
        } else {
          setCalendarFeedback({ type: "success", message: "Google Calendar disconnected." });
        }
      } else {
        setCalendarFeedback({
          type: "error",
          message: data.error || "Failed to disconnect Google Calendar.",
        });
      }
    } catch {
      setCalendarFeedback({ type: "error", message: "Failed to disconnect Google Calendar." });
    } finally {
      setCalendarDisconnecting(false);
    }
  };

  // Load household info
  const loadHousehold = useCallback(async () => {
    if (!session?.user) return;
    setHouseholdLoading(true);
    try {
      const res = await fetch("/api/household");
      const data = await res.json();
      if (data.success) {
        setHousehold(data.household);
        setHouseholdNameEdit(data.household.name);
      }
    } catch (err) {
      console.error("Failed to load household:", err);
    } finally {
      setHouseholdLoading(false);
    }
  }, [session]);

  // Load fitness profile
  const loadFitnessProfile = useCallback(async () => {
    if (!session?.user) return;
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.success && data.profile) {
        setFitnessProfile(data.profile);
      }
    } catch (err) {
      console.error("Failed to load fitness profile:", err);
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    requestAnimationFrame(() => {
      if (active) {
        loadHousehold();
        loadFitnessProfile();
      }
    });
    return () => {
      active = false;
    };
  }, [loadHousehold, loadFitnessProfile]);

  const handleCreateInvite = async () => {
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-invite" }),
      });
      const data = await res.json();
      if (data.success) {
        setInviteCode(data.code);
        setInviteCopied(false);
      }
    } catch (err) {
      console.error("Failed to create invite:", err);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleRedeemInvite = async () => {
    if (!redeemCode.trim()) return;
    setRedeemMessage(null);
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redeem-invite", code: redeemCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setRedeemMessage({ type: "success", text: data.message });
        setRedeemCode("");
        loadHousehold();
      } else {
        setRedeemMessage({ type: "error", text: data.error });
      }
    } catch {
      setRedeemMessage({ type: "error", text: "Failed to redeem invite code." });
    }
  };

  const handleLeaveHousehold = async () => {
    if (!confirm("Are you sure you want to leave this household? Your recipes will stay with the current household.")) return;
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      const data = await res.json();
      if (data.success) {
        loadHousehold();
        setInviteCode(null);
      }
    } catch (err) {
      console.error("Failed to leave household:", err);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from the household? Their recipes will stay with this household, and they will receive a new personal kitchen.`)) return;
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-member", memberId }),
      });
      const data = await res.json();
      if (data.success) {
        loadHousehold();
      } else {
        alert(data.error || "Failed to remove member.");
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const handleRenameHousehold = async () => {
    if (!householdNameEdit.trim()) return;
    try {
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: householdNameEdit.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setHousehold((prev) => prev ? { ...prev, name: data.name } : prev);
        setIsEditingName(false);
      }
    } catch (err) {
      console.error("Failed to rename household:", err);
    }
  };

  const handleSuggestName = async () => {
    setSuggestingName(true);
    try {
      const memberNames = household?.members.map((m) => m.name).filter(Boolean) || [];
      const res = await fetch("/api/household/suggest-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberNames }),
      });
      const data = await res.json();
      if (data.success && data.suggestedName) {
        setHouseholdNameEdit(data.suggestedName);
        setIsEditingName(true);
      }
    } catch (err) {
      console.error("Failed to get name suggestion:", err);
    } finally {
      setSuggestingName(false);
    }
  };

  const handleSaveKey = async () => {
    setKeyVerification({ status: "idle", message: "" });
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
        if (res.ok && data.success) {
          setKeyVerification({ status: "success", message: data.message || "API key successfully verified and saved!" });
          if (data.hasKey) {
            setKeyInput("••••••••••••••••");
          }
        } else {
          setKeyVerification({ status: "error", message: data.error || "Failed to verify API key." });
        }
      } catch (err) {
        console.error("Failed to save settings to server:", err);
        setKeyVerification({ status: "error", message: "Failed to connect to the server." });
      } finally {
        setSaving(false);
      }
    } else {
      // Guest Mode: test the key directly from the browser before saving to local store
      setSaving(true);
      try {
        const testRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${keyInput.trim()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "hi" }] }]
            })
          }
        );
        if (testRes.ok) {
          setGeminiApiKey(keyInput.trim());
          setKeyVerification({ status: "success", message: "API key verified and saved locally!" });
        } else {
          const errData = await testRes.json().catch(() => ({}));
          const errMsg = errData.error?.message || "Invalid API key.";
          setKeyVerification({ status: "error", message: `Google API Error: ${errMsg}` });
        }
      } catch {
        setKeyVerification({ status: "error", message: "Failed to connect to Google API for verification." });
      } finally {
        setSaving(false);
      }
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
    <div className="w-full flex-1 p-4 sm:p-8 md:p-12 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-slate-400 mt-2 text-lg">Manage your account and AI configuration.</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* User Profile Section */}
        <section className="glass-panel p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <User className="text-indigo-400 w-6 h-6" />
            <h2 className="text-2xl font-bold text-white">User Profile</h2>
          </div>

          {session?.user ? (
            <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center justify-between bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 gap-6">
              <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-4 sm:gap-6">
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
                  <h3 className="text-xl font-bold text-white">{session.user.name ?? "Palate User"}</h3>
                  {session.user.email ? (
                    <p className="text-slate-400">{session.user.email}</p>
                  ) : (
                    <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Jellyfin Account
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  useAppStore.getState().setGuest(false);
                  document.cookie = "palate_guest=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                  signOut({ callbackUrl: '/login' });
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 hover:text-rose-200 rounded-xl transition-colors border border-rose-500/30 font-medium"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 text-center">
              <p className="text-slate-400 mb-4">You are currently using Palate in Guest Mode.</p>
              <button
                onClick={() => {
                  useAppStore.getState().setGuest(false);
                  document.cookie = "palate_guest=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                  window.location.href = '/login';
                }}
                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
              >
                Sign In to Sync Data
              </button>
            </div>
          )}
        </section>

        {/* Google Calendar Integration Section */}
        {session?.user && (
          <section className="glass-panel p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-500/20 transition-colors" />

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Calendar className="text-blue-400 w-6 h-6" />
                <h2 className="text-2xl font-bold text-white">Google Calendar Integration</h2>
              </div>
              {hasGoogleConnection && (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected
                </span>
              )}
            </div>

            <AnimatePresence>
              {calendarFeedback && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -5 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -5 }}
                  className={`mb-6 p-4 rounded-xl border text-sm flex items-start gap-2.5 font-medium leading-relaxed ${
                    calendarFeedback.type === "success"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  }`}
                >
                  {calendarFeedback.type === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">{calendarFeedback.message}</div>
                  <button
                    onClick={() => setCalendarFeedback(null)}
                    className="text-xs opacity-70 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {!hasGoogleConnection ? (
              <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="max-w-xl">
                  <h3 className="text-lg font-semibold text-white mb-1">Synchronize Planned Meals</h3>
                  <p className="text-sm text-slate-400">
                    Connect your Google Calendar to automatically synchronize planned breakfast, lunch, and dinner schedules to your personal calendar.
                  </p>
                </div>
                <a
                  href="/api/integrations/google-calendar/connect"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-all text-center cursor-pointer shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                  Connect Google Calendar
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Sync Toggle */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">Automatic Meal Synchronization</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Automatically sync meal additions, moves, and deletions with your Google Calendar.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={googleCalendarSyncEnabled}
                      onChange={handleToggleCalendarSync}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Calendar Target Selector */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
                  <h3 className="text-base font-semibold text-white mb-2">Target Calendar</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    Choose which calendar Palate should populate with meal schedules.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      value={googleCalendarId}
                      onChange={(e) => handleSelectCalendar(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
                    >
                      <option value="">Primary Calendar (Default)</option>
                      <option value="create_sage_calendar">Dedicated &ldquo;SageAI Culinary Calendar&rdquo;</option>
                      {calendars.map((cal) => (
                        <option key={cal.id} value={cal.id}>
                          {cal.summary} {cal.primary ? "(Primary)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Backfill & Disconnect Controls */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">Backfill Upcoming Meals</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Push upcoming scheduled meals to your selected Google Calendar.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={handleBackfillCalendar}
                      disabled={calendarBackfilling || !googleCalendarSyncEnabled}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded-xl transition-colors border border-blue-500/30 text-sm font-medium disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${calendarBackfilling ? "animate-spin" : ""}`} />
                      {calendarBackfilling ? "Syncing..." : "Sync Backfill"}
                    </button>
                    <a
                      href="/api/integrations/google-calendar/connect"
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl transition-colors border border-white/10 text-sm font-medium"
                    >
                      Reconnect
                    </a>
                    <button
                      onClick={handleDisconnectCalendar}
                      disabled={calendarDisconnecting}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-xl transition-colors border border-rose-500/30 text-sm font-medium disabled:opacity-50"
                    >
                      <Unlink className="w-4 h-4" />
                      {calendarDisconnecting ? "Disconnecting..." : "Disconnect"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Household Section */}
        {session?.user && (
          <section className="glass-panel p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 group-hover:bg-fuchsia-500/20 transition-colors" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/20 transition-colors" />
            
            <div className="flex items-center gap-3 mb-6">
              <Home className="text-fuchsia-400 w-6 h-6 animate-pulse" />
              <h2 className="text-2xl font-bold text-white">Household</h2>
            </div>

            {householdLoading ? (
              <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 text-center">
                <p className="text-slate-400 animate-pulse">Loading household...</p>
              </div>
            ) : household ? (
              <div className="flex flex-col gap-6">
                {/* Household Name */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Kitchen Name</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSuggestName}
                        disabled={suggestingName}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-500/30 rounded-lg transition-colors border border-fuchsia-500/20 font-medium disabled:opacity-50"
                      >
                        <Wand2 className={`w-3 h-3 ${suggestingName ? 'animate-spin' : ''}`} />
                        {suggestingName ? 'Sage is thinking...' : 'Ask Sage'}
                      </button>
                    </div>
                  </div>
                  {isEditingName ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={householdNameEdit}
                        onChange={(e) => setHouseholdNameEdit(e.target.value)}
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 transition-all"
                        maxLength={100}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameHousehold()}
                      />
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={handleRenameHousehold}
                          className="flex-1 sm:flex-initial px-5 py-2.5 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all text-center cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setIsEditingName(false); setHouseholdNameEdit(household.name); }}
                          className="flex-1 sm:flex-initial px-4 py-2.5 text-slate-400 hover:text-white transition-colors text-center border border-white/5 rounded-xl bg-white/5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-white to-indigo-300 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      {household.name}
                    </button>
                  )}
                </div>

                {/* Members */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
                  <h3 className="text-lg font-semibold text-white mb-4">Members</h3>
                  <div className="flex flex-wrap gap-4">
                    {household.members.map((member) => (
                      <div key={member.id} className="flex items-center gap-3 bg-slate-900/60 px-4 py-3 rounded-xl border border-white/5">
                        {member.image ? (
                          <Image
                            src={member.image}
                            alt={member.name || "Member"}
                            width={36}
                            height={36}
                            className="rounded-full border border-white/10"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                            <User className="text-slate-400 w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium text-sm">{member.name || "Unknown"}</p>
                          <p className="text-slate-500 text-xs">{member.email ?? "Jellyfin Member"}</p>
                        </div>
                        {member.id === session.user?.id ? (
                          <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded-full">You</span>
                        ) : (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.name || "Member")}
                            className="ml-3 p-1.5 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 hover:scale-105 active:scale-95 rounded-lg transition-all border border-rose-500/20 cursor-pointer flex items-center justify-center shadow-md shadow-rose-500/5 hover:shadow-rose-500/10"
                            title="Remove from Household"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Invite Partner */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-indigo-400" />
                        Invite Partner
                      </h3>
                      <p className="text-slate-400 text-sm mt-1">
                        Generate a one-time invite code for your partner to join your kitchen. Codes expire after 48 hours.
                      </p>
                    </div>
                    <button
                      onClick={handleCreateInvite}
                      className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 text-white font-bold rounded-xl transition-all shadow-lg"
                    >
                      <UserPlus className="w-4 h-4" />
                      Generate Code
                    </button>
                  </div>

                  <AnimatePresence>
                    {inviteCode && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/80 p-4 rounded-xl border border-indigo-500/20 mt-3"
                      >
                        <code className="text-xl sm:text-2xl font-mono font-bold tracking-[0.3em] text-indigo-300 flex-1">
                          {inviteCode}
                        </code>
                        <button
                          onClick={handleCopyInvite}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-colors border border-indigo-500/20 font-medium text-sm"
                        >
                          {inviteCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {inviteCopied ? "Copied!" : "Copy"}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Redeem Invite */}
                <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
                  <h3 className="text-lg font-semibold text-white mb-2">Join Another Kitchen</h3>
                  <p className="text-slate-400 text-sm mb-4">
                    Enter an invite code from your partner to join their kitchen.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                      placeholder="Enter 8-character code"
                      maxLength={8}
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono tracking-wider text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-slate-600 transition-all uppercase"
                      onKeyDown={(e) => e.key === 'Enter' && handleRedeemInvite()}
                    />
                    <button
                      onClick={handleRedeemInvite}
                      disabled={redeemCode.length !== 8}
                      className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg text-center flex justify-center items-center cursor-pointer"
                    >
                      Join
                    </button>
                  </div>
                  {redeemMessage && (
                    <p className={`text-sm mt-3 font-medium ${redeemMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {redeemMessage.text}
                    </p>
                  )}
                </div>

                {/* Leave Household */}
                {household.members.length > 1 && (
                  <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-rose-500/10">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-rose-300 flex items-center gap-2">
                          <DoorOpen className="w-5 h-5" />
                          Leave Household
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">
                          Your recipes will stay with the current household. You&apos;ll get a new personal kitchen.
                        </p>
                      </div>
                      <button
                        onClick={handleLeaveHousehold}
                        className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 hover:text-rose-200 rounded-xl transition-colors border border-rose-500/30 font-medium cursor-pointer"
                      >
                        <DoorOpen className="w-4 h-4" />
                        Leave Kitchen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        )}

        {/* Fitness Profile Section */}
        {session?.user && (
          <section className="glass-panel p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2" />
            <div className="flex items-center gap-3 mb-6">
              <Activity className="text-emerald-400 w-6 h-6 animate-pulse" />
              <h2 className="text-2xl font-bold text-white">Fitness Profile</h2>
            </div>
            <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
              {fitnessProfile ? (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-white font-medium mb-2">Your fitness profile is active.</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                      <span><strong className="text-slate-300">Target:</strong> {fitnessProfile.targetCalories} kcal/day</span>
                      <span><strong className="text-slate-300">Protein:</strong> {fitnessProfile.targetProtein}g</span>
                      <span><strong className="text-slate-300">Carbs:</strong> {fitnessProfile.targetCarbs}g</span>
                      <span><strong className="text-slate-300">Fat:</strong> {fitnessProfile.targetFat}g</span>
                      <span><strong className="text-slate-300">Goal:</strong> {fitnessProfile.goal}</span>
                    </div>
                  </div>
                  <a
                    href="/diary"
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-center"
                  >
                    <Activity className="w-4 h-4" />
                    Open Sage Fitness
                  </a>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-white font-medium mb-1">No fitness profile configured yet.</p>
                    <p className="text-slate-400 text-sm">Set up your biometrics, activity level, and goals in Sage Fitness.</p>
                  </div>
                  <a
                    href="/diary"
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-center"
                  >
                    <Activity className="w-4 h-4" />
                    Set Up in Sage Fitness
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Display & Units Section */}
        <section className="glass-panel p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/20 transition-colors" />
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-indigo-400 w-6 h-6 animate-pulse" />
            <h2 className="text-2xl font-bold text-white">Display & Units</h2>
          </div>

          <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Measurement System</h3>
              <p className="text-slate-400 mt-1 text-sm leading-relaxed">
                Choose your default measurement format for recipe creation, scaling, and display.
                Sage will default to metric (grams/ml) or imperial (cups, ounces, tablespoons, Fahrenheit).
              </p>
            </div>
            
            {/* Sliding Toggle Control */}
            <div className="flex items-center gap-2 sm:gap-4 bg-slate-900/60 p-1.5 rounded-2xl border border-white/5 relative shadow-inner">
              <button
                onClick={() => handleToggleSystem('metric')}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 relative z-10 ${
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
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 relative z-10 ${
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
        <section className="glass-panel p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <Key className="text-fuchsia-400 w-6 h-6" />
            <h2 className="text-2xl font-bold text-white">SageAI Configuration</h2>
          </div>

          <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
            <p className="text-slate-400 mb-6 max-w-2xl">
              Palate requires a Google Gemini API Key to synthesize recipes and perform zero-waste analysis. 
              This key is stored <strong className="text-white">securely in your encrypted cloud vault</strong> and is never exposed in plain text.
            </p>

            <div className="flex flex-col gap-3">
              <label htmlFor="api-key" className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                Gemini API Key
                {keyVerification.status === "success" && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <Check className="w-2.5 h-2.5" /> Verified & Active
                  </span>
                )}
                {keyVerification.status === "error" && (
                  <span className="flex items-center gap-1 text-[10px] text-rose-400 font-bold uppercase tracking-wider bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 animate-pulse">
                    <AlertCircle className="w-2.5 h-2.5" /> Verification Failed
                  </span>
                )}
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="api-key"
                  type="password"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (keyVerification.status !== "idle") setKeyVerification({ status: "idle", message: "" });
                  }}
                  placeholder="AIzaSy..."
                  className={`flex-1 bg-black/40 border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 placeholder-slate-600 transition-all ${
                    keyVerification.status === "success"
                      ? "border-emerald-500/30 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                      : keyVerification.status === "error"
                      ? "border-rose-500/30 focus:ring-rose-500/50 focus:border-rose-500/50"
                      : "border-white/10 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50"
                  }`}
                />
                <button
                  onClick={handleSaveKey}
                  disabled={saving || (session?.user ? false : keyInput === geminiApiKey)}
                  className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg min-w-[140px] text-center justify-center flex items-center cursor-pointer"
                >
                  {saving ? 'Verifying...' : 'Save & Verify'}
                </button>
              </div>

              <AnimatePresence>
                {keyVerification.status !== "idle" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -5 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -5 }}
                    className={`mt-2 p-3.5 rounded-xl border text-sm flex items-start gap-2.5 font-medium leading-relaxed ${
                      keyVerification.status === "success"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                    }`}
                  >
                    {keyVerification.status === "success" ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>{keyVerification.message}</div>
                  </motion.div>
                )}
              </AnimatePresence>

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

