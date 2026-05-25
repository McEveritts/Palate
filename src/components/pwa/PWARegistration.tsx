"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share, PlusSquare, Download, X, RefreshCw, Smartphone } from "lucide-react";

export function PWARegistration() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showiOSBanner, setShowiOSBanner] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // 1. Delay Service Worker registration until load to prioritize main thread rendering
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        setRegistration(reg);
        console.log("[PWA] Service Worker registered with scope:", reg.scope);

        // Check for updates on register
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // New update is ready and waiting!
                setShowUpdateBanner(true);
              }
            });
          }
        });
      } catch (error) {
        console.error("[PWA] Service Worker registration failed:", error);
      }
    };

    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
    }

    // 2. Capture standard beforeinstallprompt event (Android / Chrome Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // Only show if user hasn't explicitly dismissed it in the last 7 days
      const lastDismissed = localStorage.getItem("palate_pwa_dismissed");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastDismissed && Date.now() - parseInt(lastDismissed) < oneWeek) {
        return;
      }
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 3. Detect iOS Safari and display manual instructions if not already standalone
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
    
    if (isIOS && !isStandalone) {
      const lastDismissed = localStorage.getItem("palate_pwa_ios_dismissed");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (!lastDismissed || Date.now() - parseInt(lastDismissed) >= oneWeek) {
        // Show iOS manual instructions banner after a short delay so it doesn't disrupt loading
        const timer = setTimeout(() => setShowiOSBanner(true), 4000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      window.removeEventListener("load", handleLoad);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("[PWA] Installation prompt outcome:", outcome);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleDismiss = () => {
    localStorage.setItem("palate_pwa_dismissed", Date.now().toString());
    setShowInstallBanner(false);
  };

  const handleiOSDismiss = () => {
    localStorage.setItem("palate_pwa_ios_dismissed", Date.now().toString());
    setShowiOSBanner(false);
  };

  const handleUpdateRefresh = () => {
    if (registration && registration.waiting) {
      // Force waiting service worker to skip waiting
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };

  return (
    <>
      <AnimatePresence>
        {/* ─── Android / Chrome Custom Install Drawer ─── */}
        {showInstallBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[999] glass-panel p-5 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xl drop-shadow-[0_0_10px_rgba(99,102,241,0.4)]">
                  🌿
                </div>
                <div>
                  <h4 className="font-bold text-white text-[15px]">Install Palate</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Use Palate like a native mobile app</p>
                </div>
              </div>
              <button 
                onClick={handleDismiss}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <button
              onClick={handleInstallClick}
              className="glass-button-primary flex items-center justify-center gap-2 py-2.5 px-4 font-semibold text-sm hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download size={16} /> Add to Home Screen
            </button>
          </motion.div>
        )}

        {/* ─── iOS Safari Custom Manual Tooltip ─── */}
        {showiOSBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-[22rem] z-[999] glass-panel p-5 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xl drop-shadow-[0_0_10px_rgba(99,102,241,0.4)]">
                  🌿
                </div>
                <div>
                  <h4 className="font-bold text-white text-[15px]">Install on iPhone</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Add Palate to your home screen</p>
                </div>
              </div>
              <button 
                onClick={handleiOSDismiss}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="bg-slate-900/40 rounded-xl p-3 border border-white/5 flex flex-col gap-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-indigo-400">
                  <Share size={14} />
                </div>
                <span>Tap the <strong>Share</strong> button at bottom of screen</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-indigo-400">
                  <PlusSquare size={14} />
                </div>
                <span>Select <strong>"Add to Home Screen"</strong></span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── PWA Application Lifecycle Update Toast ─── */}
        {showUpdateBanner && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[1000] glass-panel p-4 rounded-xl border border-indigo-500/30 shadow-2xl flex items-center justify-between gap-4"
          >
            <div className="flex gap-3 items-center">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 animate-spin-slow">
                <Smartphone size={18} />
              </div>
              <div>
                <h5 className="font-bold text-white text-sm">Update Available</h5>
                <p className="text-slate-400 text-xs">Palate has a fresh recipe build ready!</p>
              </div>
            </div>
            <button
              onClick={handleUpdateRefresh}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98]"
            >
              <RefreshCw size={12} className="animate-spin-slow" /> Refresh
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
