'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, X, Camera, CameraOff, Loader2, Check, Search, AlertTriangle, Package } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProductResult {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  barcode: string;
  servingSize?: string;
}

export interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onProductFound?: (food: ProductResult) => void;
}

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const MEAL_COLORS: Record<string, string> = {
  Breakfast: 'text-amber-400 border-amber-400/30 bg-amber-500/10',
  Lunch: 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
  Dinner: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-500/10',
  Snack: 'text-indigo-400 border-indigo-400/30 bg-indigo-500/10',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function BarcodeScanner({ isOpen, onClose, onProductFound }: BarcodeScannerProps) {
  const [upcInput, setUpcInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [selectingMeal, setSelectingMeal] = useState(false);
  const [added, setAdded] = useState(false);

  // ── UPC Lookup ─────────────────────────────────────────────
  const handleLookup = useCallback(async (code?: string) => {
    const barcode = (code || upcInput).trim();
    if (!barcode) return;

    setLoading(true);
    setError(null);
    setProduct(null);

    try {
      const res = await fetch(`/api/food-search?upc=${encodeURIComponent(barcode)}`);
      const data = await res.json();

      if (!res.ok || !data.results?.length) {
        setError('No product found for this barcode. Try searching by name instead.');
        return;
      }

      const r = data.results[0];
      setProduct({
        name: r.name,
        brand: r.brand,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        fiber: r.fiber,
        barcode: r.barcode || barcode,
        servingSize: r.servingSize,
      });
    } catch {
      setError('Unable to look up product. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [upcInput]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [detectorSupported, setDetectorSupported] = useState(false);
  const lookupRef = useRef<((code?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    lookupRef.current = handleLookup;
  }, [handleLookup]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      setDetectorSupported(true);
    }
  }, []);

  // Real-time automatic barcode/QR detector loop
  useEffect(() => {
    if (!cameraActive || !isOpen) return;

    let active = true;
    let animationFrameId: number;

    const detectLoop = async () => {
      if (!active) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && 'BarcodeDetector' in window) {
        try {
          // @ts-ignore
          const detector = new window.BarcodeDetector({
            formats: ['qr_code', 'upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39']
          });
          const barcodes = await detector.detect(video);
          if (active && barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            console.log('[BarcodeScanner] Live-detected barcode/QR:', rawValue);
            
            // Trigger feedback and lookup
            if (navigator.vibrate) {
              try { navigator.vibrate(100); } catch {}
            }
            setUpcInput(rawValue);
            lookupRef.current?.(rawValue);
            
            // Pause detection upon successful detection to prevent double triggering
            active = false;
            return;
          }
        } catch (err) {
          console.warn('[BarcodeScanner] BarcodeDetector error:', err);
        }
      }

      if (active) {
        animationFrameId = requestAnimationFrame(detectLoop);
      }
    };

    const startTimeout = setTimeout(() => {
      detectLoop();
    }, 1000);

    return () => {
      active = false;
      clearTimeout(startTimeout);
      cancelAnimationFrame(animationFrameId);
    };
  }, [cameraActive, isOpen]);

  // ── Camera Setup ────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setCameraError(false);
    } catch {
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

  // Start camera on open, stop on close
  useEffect(() => {
    if (isOpen) {
      startCamera();
      setUpcInput('');
      setProduct(null);
      setError(null);
      setSelectingMeal(false);
      setAdded(false);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);



  // ── Add to Diary ───────────────────────────────────────────
  const handleAddToDiary = useCallback(async (mealType: string) => {
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
        }),
      });

      if (!res.ok) throw new Error('Failed to log');

      setAdded(true);
      setSelectingMeal(false);
      onProductFound?.(product);
      setTimeout(() => { setAdded(false); setProduct(null); }, 2000);
    } catch (err) {
      console.error('[BarcodeScanner] Log error:', err);
    }
  }, [product, onProductFound]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="barcode-scanner-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 border-t-white/20 bg-slate-900/40 backdrop-blur-3xl shadow-[0_0_40px_rgba(139,92,246,0.15)]"
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* Orbs */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-indigo-500/30 blur-[80px]" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-[80px]" />

            <div className="relative z-10 p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                    <ScanLine className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-white/90">Scan Barcode</h2>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Camera Viewfinder */}
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-black/60 border border-white/5">
                {cameraActive && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <CameraOff className="h-8 w-8 text-slate-500" />
                    <p className="text-xs text-slate-400">Camera not available</p>
                  </div>
                )}

                {!cameraActive && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-slate-600 animate-pulse" />
                  </div>
                )}

                {/* Scanning overlay */}
                {cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-48 h-28 border-2 border-dashed border-indigo-400/60 rounded-xl"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute w-48 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                      animate={{ y: [-50, 50, -50] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-slate-500">
                {cameraActive 
                  ? (detectorSupported 
                      ? '🌿 Live scanner active! Align barcode or QR code inside viewfinder.' 
                      : 'Point camera at barcode, then enter the number below')
                  : 'Enter the barcode number manually'}
              </p>

              {/* Manual UPC Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={upcInput}
                  onChange={(e) => setUpcInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  placeholder="Enter UPC barcode number..."
                  maxLength={13}
                  className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-400/50 tracking-wider font-mono"
                />
                <button
                  onClick={() => handleLookup()}
                  disabled={loading || !upcInput.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:shadow-[0_0_25px_rgba(139,92,246,0.6)] transition-all"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Look Up
                </button>
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Product Result */}
              <AnimatePresence>
                {product && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    className="p-4 rounded-2xl bg-slate-800/50 border border-white/10 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{product.name}</h3>
                        {product.brand && <p className="text-[10px] text-slate-400">{product.brand}</p>}
                        <p className="text-[10px] text-slate-500 mt-0.5">per {product.servingSize || '100g'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-bold text-white">{Math.round(product.calories)}</span>
                        <span className="text-[10px] text-slate-400 ml-0.5">kcal</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-6 text-xs">
                      <span className="text-indigo-300 font-medium">{product.protein.toFixed(1)}g Protein</span>
                      <span className="text-fuchsia-300 font-medium">{product.carbs.toFixed(1)}g Carbs</span>
                      <span className="text-amber-300 font-medium">{product.fat.toFixed(1)}g Fat</span>
                    </div>

                    {added ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-sm font-medium">
                        <Check className="h-4 w-4" /> Added to diary!
                      </div>
                    ) : selectingMeal ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-400 text-center">Add as:</p>
                        <div className="flex justify-center gap-2">
                          {MEAL_TYPES.map((mt) => (
                            <button key={mt} onClick={() => handleAddToDiary(mt)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all hover:brightness-125 ${MEAL_COLORS[mt]}`}>
                              {mt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectingMeal(true)}
                        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-sm font-semibold text-white shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:shadow-[0_0_25px_rgba(139,92,246,0.6)] transition-all"
                      >
                        Add to Diary
                      </button>
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
