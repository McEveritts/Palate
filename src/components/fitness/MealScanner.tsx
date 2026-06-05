/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Loader2, Check, Sparkles, Package, AlertTriangle, ImagePlus } from 'lucide-react';
import { useAppStore } from '@/lib/store';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MealScanResult {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize?: string;
}

export interface MealScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onMealLogged?: () => void;
}

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const MEAL_COLORS: Record<string, string> = {
  Breakfast: 'text-amber-400 border-amber-400/30 bg-amber-500/10',
  Lunch: 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
  Dinner: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-500/10',
  Snack: 'text-indigo-400 border-indigo-400/30 bg-indigo-500/10',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function MealScanner({ isOpen, onClose, onMealLogged }: MealScannerProps) {
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<MealScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [selectingMeal, setSelectingMeal] = useState(false);
  const [added, setAdded] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const geminiApiKey = useAppStore((state) => state.geminiApiKey);

  // ── Camera Setup with Multi-Stage Constraints ────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported or insecure HTTP context.');
      }

      let stream: MediaStream;
      try {
        // 1. Try back-facing environment camera with ideal HD resolution and ideal facingMode
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (err) {
        console.warn('[MealScanner] Failed ideal constraints, trying basic environment camera:', err);
        try {
          // 2. Fall back to simple back-facing camera with ideal facingMode
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
        } catch (err2) {
          console.warn('[MealScanner] Failed environment camera fallback, trying any camera:', err2);
          // 3. Fall back to any video camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Explicitly trigger play() to bypass iOS autoplay/PWA stand-by policies
        videoRef.current.play().catch((playErr) => {
          console.warn('[MealScanner] HTMLVideoElement play blocked by browser policy:', playErr);
        });
      }
      setCameraActive(true);
      setCameraError(false);
    } catch (err) {
      console.error('[MealScanner] Critical camera startup error:', err);
      setCameraError(true);
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Manage camera on open/close state
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen) {
      // Decouple camera startup and initial state resets from synchronous render/hydration
      timer = setTimeout(() => {
        startCamera();
        setProduct(null);
        setError(null);
        setSelectingMeal(false);
        setAdded(false);
        setCapturedImage(null);
      }, 0);
    } else {
      stopCamera();
    }
    return () => {
      if (timer) clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Capture Image ───────────────────────────────────────────
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraActive) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      stopCamera();
      analyzeMeal(dataUrl);
    }
  };

  // ── File Selection ──────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setCapturedImage(dataUrl);
        stopCamera();
        analyzeMeal(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // ── Analyze Meal via API ────────────────────────────────────
  const analyzeMeal = async (base64Payload: string) => {
    setLoading(true);
    setError(null);
    setProduct(null);

    try {
      const res = await fetch('/api/sage/meal-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': geminiApiKey,
        },
        body: JSON.stringify({ image: base64Payload }),
      });

      const data = await res.json();
      if (!res.ok || !data.product) {
        setError(data.error || 'Failed to analyze the meal. Please try a clearer picture.');
        return;
      }

      setProduct(data.product);
    } catch {
      setError('Connection failed. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  // ── Reset Scanner for a new capture ─────────────────────────
  const resetScanner = () => {
    setCapturedImage(null);
    setProduct(null);
    setError(null);
    setSelectingMeal(false);
    startCamera();
  };

  // ── Add to Food Diary ───────────────────────────────────────
  const handleAddToDiary = async (mealType: string) => {
    if (!product) return;
    try {
      const res = await fetch('/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType,
          customFoodName: product.name,
          amountConsumed: 100,
          calories: product.calories,
          protein: product.protein,
          carbs: product.carbs,
          fat: product.fat,
          fiber: product.fiber ?? 0,
          sugar: product.sugar ?? 0,
          sodium: product.sodium ?? 0,
        }),
      });

      if (!res.ok) throw new Error('Failed to log');

      setAdded(true);
      setSelectingMeal(false);
      onMealLogged?.();
      setTimeout(() => {
        setAdded(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('[MealScanner] Log error:', err);
      setError('Failed to persist meal log to your diary.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="meal-scanner-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

          {/* Card Wrapper */}
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 border-t-white/20 bg-slate-900/40 backdrop-blur-3xl shadow-[0_0_40px_rgba(217,70,239,0.15)]"
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* Ambient Background Orbs */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-fuchsia-500/20 blur-[80px]" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-indigo-500/25 blur-[80px]" />

            <div className="relative z-10 p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/20 text-fuchsia-400">
                    <Camera className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-white/90">Scan Your Meal</h2>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Viewfinder or Captured Preview */}
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black/60 border border-white/5 shadow-inner">
                {capturedImage ? (
                  <img
                    src={capturedImage}
                    alt="Captured Plate"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : cameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/65 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400">
                      <Camera className="h-5.5 w-5.5" />
                    </div>
                    <span className="text-[10px] text-slate-400 max-w-[240px] leading-relaxed">
                      Camera unavailable. Use the buttons below to snap a photo or upload from your gallery.
                    </span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-slate-600 animate-pulse" />
                  </div>
                )}

                {/* Shutter Overlay for snapping */}
                {cameraActive && !capturedImage && (
                  <div className="absolute inset-x-0 bottom-4 flex justify-center z-15">
                    <button
                      onClick={capturePhoto}
                      className="h-14 w-14 rounded-full border-4 border-white bg-fuchsia-500/40 hover:bg-fuchsia-500/60 active:scale-95 shadow-[0_0_20px_rgba(217,70,239,0.5)] transition-all cursor-pointer flex items-center justify-center text-white"
                      title="Snap photo"
                    >
                      <Camera size={22} />
                    </button>
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {capturedImage 
                    ? (loading ? '🌿 Sage is analyzing your plate...' : 'Analysis Complete!') 
                    : 'Snap a picture of your plate or upload an existing photo.'}
                </p>
              </div>

              {/* Hidden Inputs for Direct Camera vs Library picker */}
              <input
                type="file"
                ref={cameraInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              <input
                type="file"
                ref={libraryInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />

              {/* Action Trigger Buttons */}
              {!capturedImage && (
                <div className="flex flex-col sm:flex-row gap-2.5 w-full">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-sm font-semibold text-white shadow-[0_0_15px_rgba(217,70,239,0.25)] transition-all cursor-pointer"
                  >
                    <Camera className="h-4 w-4 animate-pulse" />
                    Snap Plate Photo
                  </button>
                  <button
                    onClick={() => libraryInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800/80 border border-white/10 hover:bg-slate-700/80 text-sm font-semibold text-white transition-all cursor-pointer"
                  >
                    <ImagePlus className="h-4 w-4 text-fuchsia-400" />
                    Upload from Gallery
                  </button>
                </div>
              )}

              {/* Loading State Overlay */}
              {loading && (
                <div className="p-6 rounded-2xl bg-slate-800/40 border border-white/5 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 text-fuchsia-400 animate-spin" />
                  <span className="text-sm font-medium text-slate-300 animate-pulse">Running Culinary Vision Analysis...</span>
                </div>
              )}

              {/* Error Alert */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-400" />
                    <span>{error}</span>
                  </div>
                  <button
                    onClick={resetScanner}
                    className="px-4 py-1.5 self-end bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-lg transition-colors font-semibold"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}

              {/* Visual Recognition Results */}
              <AnimatePresence>
                {product && !loading && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    className="p-4 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/20 text-fuchsia-400 flex-shrink-0">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{product.name}</h3>
                        {product.servingSize && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Est. Serving: {product.servingSize}</p>
                        )}
                        <p className="text-[9px] text-slate-500">Homemade Recipe Prescribed by SageAI</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-extrabold text-white">{Math.round(product.calories)}</span>
                        <span className="text-[10px] text-slate-400 ml-0.5">kcal</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-6 text-xs border-y border-white/5 py-2.5">
                      <span className="text-indigo-300 font-semibold">{product.protein.toFixed(1)}g Protein</span>
                      <span className="text-fuchsia-300 font-semibold">{product.carbs.toFixed(1)}g Carbs</span>
                      <span className="text-amber-300 font-semibold">{product.fat.toFixed(1)}g Fat</span>
                    </div>

                    {added ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-sm font-bold">
                        <Check className="h-4 w-4" /> Logged to telemetry diary!
                      </div>
                    ) : selectingMeal ? (
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">Select Meal Time:</p>
                        <div className="flex justify-center gap-2">
                          {MEAL_TYPES.map((mt) => (
                            <button key={mt} onClick={() => handleAddToDiary(mt)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:brightness-125 cursor-pointer ${MEAL_COLORS[mt]}`}>
                              {mt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={resetScanner}
                          className="w-1/3 py-2.5 rounded-xl bg-slate-800/80 border border-white/10 hover:bg-slate-700/80 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
                        >
                          Retake
                        </button>
                        <button
                          onClick={() => setSelectingMeal(true)}
                          className="w-2/3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-xs font-semibold text-white shadow-[0_0_15px_rgba(217,70,239,0.3)] hover:shadow-[0_0_25px_rgba(217,70,239,0.5)] transition-all cursor-pointer"
                        >
                          <Sparkles size={14} />
                          Log Meal
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
