'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Loader2 } from 'lucide-react';

interface QuickCaloriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const QuickCaloriesModal: React.FC<QuickCaloriesModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!foodName.trim() || !calories) return;
    setSubmitting(true);
    setError(null);
    
    const cal = parseInt(calories, 10);
    if (isNaN(cal) || cal <= 0) {
      setError('Please enter a valid calorie amount.');
      setSubmitting(false);
      return;
    }

    // Auto-estimate macro split (40/30/30 C/P/F)
    const protein = Math.round((cal * 0.30) / 4);
    const carbs = Math.round((cal * 0.40) / 4);
    const fat = Math.round((cal * 0.30) / 9);

    // Auto-detect meal type from time of day
    const hour = new Date().getHours();
    const mealType = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 20 ? 'Dinner' : 'Snack';

    try {
      const res = await fetch('/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customFoodName: foodName.trim(),
          calories: cal,
          protein,
          carbs,
          fat,
          mealType,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to log');
      
      setFoodName('');
      setCalories('');
      onSuccess?.();
      onClose();
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to log calories.');
    } finally {
      setSubmitting(false);
    }
  }, [foodName, calories, onClose, onSuccess]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl bg-slate-900/80 backdrop-blur-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            {/* Glow orbs */}
            <div className="absolute -top-16 -left-16 w-40 h-40 bg-amber-500/20 rounded-full blur-[60px] pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-indigo-500/15 rounded-full blur-[60px] pointer-events-none" />
            
            <div className="relative z-10 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <Zap size={18} />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Quick Calories</h3>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>
              
              {/* Food Name */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Food Name</label>
                  <input
                    type="text"
                    value={foodName}
                    onChange={(e) => setFoodName(e.target.value)}
                    placeholder="e.g., Protein bar, Coffee"
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors text-sm"
                    autoFocus
                  />
                </div>
                
                {/* Calories */}
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Calories (kcal)</label>
                  <input
                    type="number"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    placeholder="e.g., 250"
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors text-sm"
                    min="1"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  />
                </div>
                
                <p className="text-[11px] text-slate-500">Macros auto-estimated as 40% carbs / 30% protein / 30% fat</p>
                
                {error && (
                  <p className="text-rose-400 text-sm">{error}</p>
                )}
                
                <button
                  onClick={handleSubmit}
                  disabled={!foodName.trim() || !calories || submitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Logging...</>
                  ) : (
                    <><Zap size={16} /> Log Quick Calories</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
