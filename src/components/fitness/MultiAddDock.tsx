'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Camera, Zap, ScanLine, Dumbbell, Droplet } from 'lucide-react';
import FoodSearch from './FoodSearch';
import BarcodeScanner from './BarcodeScanner';
import MealScanner from './MealScanner';
import ExerciseLogger from './ExerciseLogger';
import { QuickCaloriesModal } from './QuickCaloriesModal';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MultiAddDockProps {
  onFoodLogged?: () => void;
  onExerciseLogged?: () => void;
}

// ── Scroll-direction hook ──────────────────────────────────────────────────────

function useScrollDirection(threshold = 10, onHide?: () => void) {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const getScrollY = (e?: Event): number | null => {
      const container = document.getElementById('palate-main-content');

      // If a scroll event is passed, ignore events from inner nested elements (modals, dropdowns, etc.)
      if (e && e.target) {
        const target = e.target as Node;
        if (target.nodeType === 1) {
          // Element node: only accept if it is the main page scroll container or document root
          const el = target as HTMLElement;
          const isMain =
            (container && el === container) ||
            el.id === 'palate-main-content' ||
            el === document.documentElement ||
            el === document.body;
          if (!isMain) {
            return null;
          }
        }
      }

      const containerScroll = (container && typeof container.scrollTop === 'number') ? container.scrollTop : 0;
      const windowScroll = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      return Math.max(containerScroll, windowScroll);
    };

    // Initialize lastScrollY to the actual current scroll position on mount
    const initialY = getScrollY();
    if (initialY !== null) {
      lastScrollY.current = Math.max(0, initialY);
    }

    const onScroll = (e?: Event) => {
      const currentY = getScrollY(e);
      if (currentY === null) return;

      const container = document.getElementById('palate-main-content');
      let maxScroll = Infinity;
      if (container && container.scrollHeight > container.clientHeight) {
        maxScroll = container.scrollHeight - container.clientHeight;
      } else if (typeof window !== 'undefined') {
        const docHeight = Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0
        );
        if (docHeight > window.innerHeight) {
          maxScroll = docHeight - window.innerHeight;
        }
      }

      // Clamp scroll position to [0, maxScroll] to eliminate elastic rubber-band rebound jitter
      const normalizedY = Math.max(0, Math.min(currentY, maxScroll));

      // Always show when at or near the top of the page
      if (normalizedY <= threshold) {
        setVisible(true);
        lastScrollY.current = normalizedY;
        return;
      }

      const delta = normalizedY - lastScrollY.current;
      if (Math.abs(delta) < threshold) return;

      // Scrolling DOWN (delta > 0) -> hide (visible = false) and notify onHide
      // Scrolling UP (delta < 0) -> show (visible = true)
      if (delta > 0) {
        setVisible(false);
        onHide?.();
      } else {
        setVisible(true);
      }
      lastScrollY.current = normalizedY;
    };

    const container = document.getElementById('palate-main-content');
    if (container) {
      container.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });

    return () => {
      if (container) {
        container.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [threshold, onHide]);

  return visible;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const MultiAddDock = ({ onFoodLogged, onExerciseLogged }: MultiAddDockProps) => {
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showMealScanner, setShowMealScanner] = useState(false);
  const [showExercise, setShowExercise] = useState(false);
  const [showQuickCalories, setShowQuickCalories] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);

  // Close quick menu when dock hides so it does not unexpectedly re-open on scroll up
  const handleDockHide = React.useCallback(() => {
    setShowQuickMenu(false);
  }, []);

  const dockVisible = useScrollDirection(10, handleDockHide);
  const isMenuOpen = showQuickMenu && dockVisible;

  return (
    <>
      {/* Modals */}
      <FoodSearch
        isOpen={showFoodSearch}
        onClose={() => setShowFoodSearch(false)}
        onFoodSelected={() => {
          setShowFoodSearch(false);
          onFoodLogged?.();
        }}
      />

      <BarcodeScanner
        isOpen={showBarcode}
        onClose={() => setShowBarcode(false)}
        onProductFound={() => {
          setShowBarcode(false);
          onFoodLogged?.();
        }}
      />

      <MealScanner
        isOpen={showMealScanner}
        onClose={() => setShowMealScanner(false)}
        onMealLogged={() => {
          setShowMealScanner(false);
          onFoodLogged?.();
        }}
      />

      <ExerciseLogger
        isOpen={showExercise}
        onClose={() => setShowExercise(false)}
        onLogged={() => {
          setShowExercise(false);
          onExerciseLogged?.();
        }}
      />

      <QuickCaloriesModal
        isOpen={showQuickCalories}
        onClose={() => setShowQuickCalories(false)}
        onSuccess={() => {
          onFoodLogged?.();
        }}
      />

      {/* Dock — auto-hides on scroll down, reappears on scroll up */}
      <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <motion.div
          className="relative"
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: dockVisible ? 0 : 80,
            opacity: dockVisible ? 1 : 0,
          }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          style={{ pointerEvents: dockVisible ? 'auto' : 'none' }}
        >
          <motion.div
            role="toolbar"
            aria-label="Quick add food actions"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ willChange: 'transform, opacity' }}
            className="flex items-center gap-2 p-2 bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-full shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]"
          >
            <DockButton
              icon={<Search size={20} />}
              label="Search Food"
              color="text-indigo-400"
              onClick={() => setShowFoodSearch(true)}
            />
            <DockButton
              icon={<Camera size={20} />}
              label="Scan Meal"
              color="text-fuchsia-400"
              onClick={() => setShowMealScanner(true)}
            />

            {/* Primary Action Button (Glowing) */}
            <button
              aria-label="Quick add"
              onClick={() => setShowQuickMenu((prev) => !prev)}
              className="relative group p-3 rounded-full bg-gradient-to-tr from-indigo-600 to-fuchsia-600 border border-white/20 shadow-[0_0_20px_rgba(139,92,246,0.6)] hover:shadow-[0_0_30px_rgba(217,70,239,0.8)] transition-all duration-300"
            >
              <div className="absolute inset-0 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <Plus
                size={24}
                className={`text-white drop-shadow-md transition-transform duration-200 ${isMenuOpen ? 'rotate-45' : ''}`}
              />
            </button>

            <DockButton
              icon={<ScanLine size={20} />}
              label="Scan Barcode"
              color="text-blue-400"
              onClick={() => setShowBarcode(true)}
            />
            <DockButton
              icon={<Dumbbell size={20} />}
              label="Log Exercise"
              color="text-emerald-400"
              onClick={() => setShowExercise(true)}
            />
          </motion.div>

          {/* Quick Add Radial Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 flex flex-wrap justify-center w-max max-w-[calc(100vw-2rem)] gap-2 sm:gap-3 px-2"
              >
                {[
                  { label: 'Quick Calories', icon: <Zap size={16} />, color: 'text-amber-400 bg-amber-500/15 border-amber-400/30', action: () => setShowQuickCalories(true) },
                  { label: 'Search Food', icon: <Search size={16} />, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-400/30', action: () => setShowFoodSearch(true) },
                  { label: 'Log Exercise', icon: <Dumbbell size={16} />, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-400/30', action: () => setShowExercise(true) },
                  { label: 'Log Water', icon: <Droplet size={16} />, color: 'text-cyan-400 bg-cyan-500/15 border-cyan-400/30', action: async () => {
                    try {
                      await fetch('/api/hydration', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amountMl: 250 }),
                      });
                      onFoodLogged?.(); // Triggers diary refresh
                    } catch {}
                  }},
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setShowQuickMenu(false);
                      item.action?.();
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border backdrop-blur-3xl text-xs font-medium shadow-lg transition-all hover:brightness-125 ${item.color}`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
};

// ── DockButton ─────────────────────────────────────────────────────────────────

const DockButton = ({
  icon,
  label,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick?: () => void;
}) => {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="relative group p-3 rounded-full hover:bg-white/10 transition-colors"
    >
      <div className={`${color} drop-shadow-[0_0_8px_currentColor]`}>
        {icon}
      </div>
      {/* Tooltip */}
      <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-1.5 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-lg text-xs text-white/90 whitespace-nowrap pointer-events-none shadow-xl">
        {label}
      </div>
    </button>
  );
};
