'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, X, Camera, Loader2, Check, Search, AlertTriangle, Package, ImagePlus } from 'lucide-react';
import { getScaleFactor, parseServingWeight } from '@/lib/fitness';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProductResult {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
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
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<'grams' | 'servings'>('servings');

  // Reset quantity/unit when selecting a different product
  useEffect(() => {
    if (product) {
      setQuantity(1);
      setUnit('servings');
    }
  }, [product]);

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
        sugar: r.sugar,
        sodium: r.sodium,
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [detectorSupported, setDetectorSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [barcodeDetectorInstance, setBarcodeDetectorInstance] = useState<any>(null);
  const lookupRef = useRef<((code?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    lookupRef.current = handleLookup;
  }, [handleLookup]);

  // Client-side initialization of Native or Polyfilled BarcodeDetector
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const setupDetector = async () => {
      try {
        let initialized = false;
        if ('BarcodeDetector' in window) {
          console.log('[BarcodeScanner] Attempting native browser BarcodeDetector...');
          try {
            const nativeDetector = new window.BarcodeDetector({
              formats: ['qr_code', 'upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39']
            });
            // Try a quick dry-run scan on a dummy canvas to verify the detection service is functional
            const dummyCanvas = document.createElement('canvas');
            dummyCanvas.width = 1;
            dummyCanvas.height = 1;
            await nativeDetector.detect(dummyCanvas);
            
            setBarcodeDetectorInstance(nativeDetector);
            setDetectorSupported(true);
            initialized = true;
            console.log('[BarcodeScanner] Native BarcodeDetector is fully functional!');
          } catch (nativeErr) {
            console.warn('[BarcodeScanner] Native BarcodeDetector is in window but service is unavailable. Falling back to polyfill...', nativeErr);
          }
        }

        if (!initialized) {
          console.log('[BarcodeScanner] Loading pure WebAssembly/JS barcode polyfill...');
          const { BarcodeDetector: PolyfillDetector } = await import('barcode-detector');
          setDetectorSupported(true);
          setBarcodeDetectorInstance(new PolyfillDetector({
            formats: ['qr_code', 'upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39']
          }));
        }
      } catch (err) {
        console.warn('[BarcodeScanner] Failed to initialize native or polyfilled BarcodeDetector:', err);
      }
    };

    setupDetector();
  }, []);

  // Live-detection scan loop running in requestAnimationFrame
  useEffect(() => {
    if (!cameraActive || !isOpen || !barcodeDetectorInstance) return;

    let active = true;
    let animationFrameId: number;

    const detectLoop = async () => {
      if (!active) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const barcodes = await barcodeDetectorInstance.detect(video);
          if (active && barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            console.log('[BarcodeScanner] Live-detected barcode/QR:', rawValue);
            
            // Haptic feedback
            if (navigator.vibrate) {
              try { navigator.vibrate(100); } catch {}
            }
            setUpcInput(rawValue);
            lookupRef.current?.(rawValue);
            
            // Deactivate loop to prevent double scanning
            active = false;
            return;
          }
        } catch (err) {
          console.warn('[BarcodeScanner] BarcodeDetector runtime scan error:', err);
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
  }, [cameraActive, isOpen, barcodeDetectorInstance]);

  // ── Camera Setup with Multi-Stage Constraints ────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported or insecure HTTP context.');
      }

      let stream: MediaStream;
      try {
        // 1. Try back-facing environment camera with ideal HD resolution
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        console.warn('[BarcodeScanner] Failed ideal constraints, trying basic environment camera:', err);
        try {
          // 2. Fall back to simple back-facing camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
        } catch (err2) {
          console.warn('[BarcodeScanner] Failed environment camera fallback, trying any camera:', err2);
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
          console.warn('[BarcodeScanner] HTMLVideoElement play blocked by browser policy:', playErr);
        });
      }
      setCameraActive(true);
      setCameraError(false);
    } catch (err) {
      console.error('[BarcodeScanner] Critical camera startup error:', err);
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
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen) {
      // Decouple camera startup and initial state resets from synchronous render/hydration
      timer = setTimeout(() => {
        startCamera();
        setUpcInput('');
        setProduct(null);
        setError(null);
        setSelectingMeal(false);
        setAdded(false);
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

  // Client-Side Decoders for File Upload / Photo Snapping
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setProduct(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;

      const img = new Image();
      img.onload = async () => {
        try {
          let detector = barcodeDetectorInstance;
          if (!detector) {
            const { BarcodeDetector: PolyfillDetector } = await import('barcode-detector');
            detector = new PolyfillDetector({
              formats: ['qr_code', 'upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39']
            });
          }

          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            console.log('[BarcodeScanner] Image-detected barcode/QR:', rawValue);
            
            if (navigator.vibrate) {
              try { navigator.vibrate(100); } catch {}
            }
            
            setUpcInput(rawValue);
            
            if (lookupRef.current) {
              await lookupRef.current(rawValue);
            } else {
              await handleLookup(rawValue);
            }
          } else {
            setError('Could not detect any barcode or QR code in the uploaded image. Please ensure the code is clear and centered.');
            setLoading(false);
          }
        } catch (err) {
          console.error('[BarcodeScanner] Image detection error:', err);
          setError('Failed to scan the image. Ensure the barcode is clear and try again.');
          setLoading(false);
        }
      };
      img.onerror = () => {
        setError('Failed to process the selected image.');
        setLoading(false);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setError('Failed to read the selected file.');
      setLoading(false);
    };
    reader.readAsDataURL(file);
  }, [barcodeDetectorInstance, handleLookup]);

  // ── Add to Diary ───────────────────────────────────────────
  const handleAddToDiary = useCallback(async (mealType: string) => {
    if (!product) return;
    try {
      const foodRef = { ...product, source: 'openfoodfacts' };
      const scale = getScaleFactor(foodRef, quantity, unit);
      const formattedUnit = unit === 'servings' ? (quantity === 1 ? 'serving' : 'servings') : 'g';
      const displayName = `${product.name} (${quantity}${formattedUnit})`;

      const res = await fetch('/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType,
          customFoodName: displayName,
          amountConsumed: unit === 'grams' ? quantity : quantity * (parseServingWeight(product.servingSize) || 100),
          calories: product.calories * scale,
          protein: product.protein * scale,
          carbs: product.carbs * scale,
          fat: product.fat * scale,
          fiber: (product.fiber ?? 0) * scale,
          sugar: (product.sugar ?? 0) * scale,
          sodium: (product.sodium ?? 0) * scale,
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
  }, [product, onProductFound, quantity, unit]);

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

              {/* Hidden video element for live barcode detection */}
              {cameraActive && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="hidden"
                />
              )}

              {/* Action Cards — Snap or Upload */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/10 bg-slate-800/40 hover:bg-blue-500/10 hover:border-blue-500/30 transition-all cursor-pointer"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 group-hover:border-blue-500/40 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all">
                    <Camera className="h-5.5 w-5.5 text-blue-400" />
                  </div>
                  <span className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Snap Photo</span>
                </button>
                <button
                  onClick={() => libraryInputRef.current?.click()}
                  className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/10 bg-slate-800/40 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all cursor-pointer"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/20 group-hover:border-indigo-500/40 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all">
                    <ImagePlus className="h-5.5 w-5.5 text-indigo-400" />
                  </div>
                  <span className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Upload Photo</span>
                </button>
              </div>

              <p className="text-center text-[11px] text-slate-500 leading-relaxed">
                Snap a barcode photo, upload an image, or enter the number manually.
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
                        <span className="text-lg font-bold text-white">{product.calories.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <span className="text-[10px] text-slate-400 ml-0.5">kcal</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-6 text-xs">
                      <span className="text-indigo-300 font-medium">{product.protein.toFixed(2)}g Protein</span>
                      <span className="text-fuchsia-300 font-medium">{product.carbs.toFixed(2)}g Carbs</span>
                      <span className="text-amber-300 font-medium">{product.fat.toFixed(2)}g Fat</span>
                    </div>

                    {added ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-sm font-medium">
                        <Check className="h-4 w-4" /> Added to diary!
                      </div>
                    ) : selectingMeal ? (
                      <div className="space-y-3">
                        {/* Quantity & Unit Selectors */}
                        <div className="flex items-center justify-center gap-2 py-1 bg-black/20 rounded-xl px-3 border border-white/5 max-w-[260px] mx-auto">
                          <span className="text-[11px] text-slate-400 font-medium">Qty:</span>
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={quantity}
                            onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                            className="w-12 rounded-lg border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-white text-center outline-none focus:border-indigo-500/50"
                          />
                          <select
                            value={unit}
                            onChange={(e) => setUnit(e.target.value as 'grams' | 'servings')}
                            className="rounded-lg border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-slate-300 outline-none focus:border-indigo-500/50 cursor-pointer"
                          >
                            <option value="servings">Servings</option>
                            <option value="grams">Grams</option>
                          </select>
                        </div>

                        <p className="text-xs text-slate-400 text-center">Add as:</p>
                        <div className="flex justify-center gap-2">
                          {MEAL_TYPES.map((mt) => (
                            <button key={mt} onClick={() => handleAddToDiary(mt)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all hover:brightness-125 cursor-pointer ${MEAL_COLORS[mt]}`}>
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
