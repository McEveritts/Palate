"use client";

import { useState } from "react";
import { Leaf, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ZeroWastePage() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setResponse("");

    try {
      const res = await fetch("/api/sage/zero-waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
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
    <div className="w-full h-full flex flex-col justify-center relative max-w-4xl mx-auto p-8">
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
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="glass-input pl-6 pr-32 py-5 w-full text-white placeholder-slate-500 text-lg rounded-2xl"
                placeholder="e.g. 'I have half an onion, heavy cream, and wilted spinach...'"
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
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
            className="w-full flex flex-col gap-6 h-full pb-8"
          >
            <div className="glass-panel p-8 rounded-3xl border border-emerald-500/20">
               <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2"><Leaf className="text-emerald-400"/> Rescued Recipe</h3>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
