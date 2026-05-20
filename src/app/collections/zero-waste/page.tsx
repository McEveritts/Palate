"use client";

import { useState, useRef } from "react";
import { Leaf, Sparkles, Loader2, ImagePlus, X, Scale, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";

export default function ZeroWastePage() {
  const [prompt, setPrompt] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const geminiApiKey = useAppStore((state) => state.geminiApiKey);
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const setMeasurementSystem = useAppStore((state) => state.setMeasurementSystem);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt.trim() && !imagePreview) || isGenerating) return;

    setIsGenerating(true);
    setResponse("");

    const payload = { 
      prompt: prompt,
      image: imagePreview,
      measurementSystem: measurementSystem
    };

    try {
      const res = await fetch("/api/sage/zero-waste", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-gemini-api-key": geminiApiKey
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status} ${res.statusText}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          setResponse(prev => (prev || "") + decoder.decode(value, { stream: true }));
        }
      }
    } catch (err) {
      console.error(err);
      setResponse("⚠️ Failed to connect to Sage.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col justify-center relative max-w-4xl mx-auto p-8">
      <AnimatePresence mode="wait">
        {response === null ? (
          <motion.div 
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-panel p-10 lg:p-14 flex flex-col items-center text-center gap-6 w-full rounded-3xl"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
              <Leaf size={32} />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white m-0">
              Zero-Waste Kitchen
            </h1>
            <p className="text-lg text-slate-400 max-w-xl m-0 leading-relaxed">
              List the expiring ingredients, half-used vegetables, or leftover proteins sitting in your fridge. Sage will synthesize a creative recipe to prevent waste.
            </p>
            
            <form onSubmit={handleSubmit} className="w-full max-w-2xl relative mt-4">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageSelect} 
              />
              <AnimatePresence>
                {imagePreview && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute bottom-full left-0 mb-3 p-2 bg-slate-800/80 backdrop-blur-md rounded-xl border border-white/10 shadow-xl z-20"
                  >
                    <div className="relative group/preview">
                      <img src={imagePreview} alt="Preview" className="h-24 w-auto rounded-lg object-cover" />
                      <button 
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 bg-slate-900 text-white rounded-full p-1 opacity-0 group-hover/preview:opacity-100 transition-opacity border border-white/20 hover:bg-red-500/80"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="button"
                className="absolute left-[2px] top-[2px] bottom-[2px] w-[50px] flex items-center justify-center bg-transparent border-none text-slate-400 hover:text-emerald-400 transition-colors z-10"
                title="Upload an image"
                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              >
                <ImagePlus size={20} />
              </button>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="glass-input pl-16 pr-32 py-5 w-full text-white placeholder-slate-500 text-lg rounded-2xl"
                placeholder="e.g. 'I have half an onion, heavy cream, and wilted spinach...'"
              />
              <button
                type="submit"
                disabled={(!prompt.trim() && !imagePreview) || isGenerating}
                className="absolute right-3 top-3 bottom-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isGenerating ? "Rescuing..." : "Rescue"}
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div 
            key="chat"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex flex-col gap-6 flex-1 pb-8"
          >
            <div className="glass-panel p-8 rounded-3xl border border-emerald-500/20 flex flex-col gap-6 relative group">
               {/* Hover Actions in top-right */}
               {!isGenerating && response && (
                 <div className="opacity-0 group-hover:opacity-100 absolute top-6 right-6 flex items-center gap-2 transition-all">
                   <button
                     onClick={() => setMeasurementSystem(measurementSystem === 'metric' ? 'imperial' : 'metric')}
                     className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 rounded-lg flex items-center justify-center"
                     title={`Switch to ${measurementSystem === 'metric' ? 'Imperial' : 'Metric'} units`}
                   >
                     <Scale size={16} className={measurementSystem === 'metric' ? 'text-emerald-400' : 'text-fuchsia-400'} />
                   </button>
                   
                   <button
                     onClick={() => {
                       navigator.clipboard.writeText(response);
                       setCopied(true);
                       setTimeout(() => setCopied(false), 2000);
                     }}
                     className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 rounded-lg flex items-center justify-center"
                     title="Copy recipe text"
                   >
                     {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                   </button>
                 </div>
               )}
               <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Leaf className="text-emerald-400"/> Rescued Recipe</h3>
               <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                 {isGenerating && response === "" ? (
                   <div className="flex items-center gap-3 text-emerald-400">
                     <Loader2 className="animate-spin" size={20} />
                     <span className="text-lg">Formulating zero-waste recipe...</span>
                   </div>
                 ) : (
                   response
                 )}
               </div>
               
               {!isGenerating && response !== "" && (
                 <div className="flex justify-end border-t border-white/5 pt-4 mt-2">
                   <button
                     onClick={() => setResponse(null)}
                     className="px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-inner relative overflow-hidden group"
                   >
                     <span className="relative z-10">🌿 Rescue Another Ingredient</span>
                   </button>
                 </div>
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
