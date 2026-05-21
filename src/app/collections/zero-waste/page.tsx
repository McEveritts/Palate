"use client";

import { useState, useRef } from "react";
import { Leaf, Sparkles, Loader2, ImagePlus, X, Scale, Copy, Check, Brain, CheckCircle2, Eye, FileCode, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from 'rehype-sanitize';
import { parseSageStream, parseMessageContent } from "@/lib/parser";

export default function ZeroWastePage() {
  const [prompt, setPrompt] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openThoughts, setOpenThoughts] = useState(true);
  const [rawMode, setRawMode] = useState(false);
  const geminiApiKey = useAppStore((state) => state.geminiApiKey);
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const setMeasurementSystem = useAppStore((state) => state.setMeasurementSystem);
  const isGuest = useAppStore((state) => state.isGuest);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { thoughts, content } = parseSageStream(response || "", !isGenerating);
  const { frontmatter, markdown } = parseMessageContent(content);

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
    setOpenThoughts(true);
    setRawMode(false);

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
               {/* Hover Actions in bottom-right, vertically stacked with Scale (Toggle) at the top */}
               {!isGenerating && response && (
                 <div className="opacity-0 group-hover:opacity-100 absolute bottom-6 right-6 flex flex-col gap-2 transition-all z-20">
                   <button
                     type="button"
                     onClick={() => setMeasurementSystem(measurementSystem === 'metric' ? 'imperial' : 'metric')}
                     className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 border border-white/5 rounded-lg flex items-center justify-center shadow-lg"
                     title={`Switch to ${measurementSystem === 'metric' ? 'Imperial' : 'Metric'} units`}
                   >
                     <Scale size={16} className={measurementSystem === 'metric' ? 'text-emerald-400' : 'text-fuchsia-400'} />
                   </button>
                   
                   <button
                     type="button"
                     onClick={() => setRawMode(!rawMode)}
                     className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 border border-white/5 rounded-lg flex items-center justify-center shadow-lg"
                     title={rawMode ? "Show Rendered" : "Show Raw Markdown"}
                   >
                     {rawMode ? <Eye size={16} /> : <FileCode size={16} />}
                   </button>

                   <button
                     type="button"
                     onClick={() => {
                       navigator.clipboard.writeText(markdown);
                       setCopied(true);
                       setTimeout(() => setCopied(false), 2000);
                     }}
                     className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 border border-white/5 rounded-lg flex items-center justify-center shadow-lg"
                     title="Copy recipe text"
                   >
                     {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                   </button>

                   {!isGuest && (response.includes("---") || response.includes("```yaml")) && (
                      <motion.button
                        type="button"
                        disabled={isSaving}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={async () => {
                          setIsSaving(true);
                          try {
                            const { saveRecipeToVault } = await import("@/app/actions");
                            const res = await saveRecipeToVault(response, 'md');
                            if (res.success) {
                              setSaved(true);
                              setTimeout(() => setSaved(false), 2000);
                            }
                          } catch (err) {
                            console.error("Failed to save to vault", err);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-black/20 hover:bg-black/40 border border-white/5 rounded-lg flex items-center justify-center shadow-lg backdrop-blur-md cursor-pointer relative overflow-hidden"
                        title="Save to vault"
                      >
                        <AnimatePresence mode="wait">
                          {isSaving ? (
                            <motion.div
                              key="saving"
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.8, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-center justify-center"
                            >
                              <Loader2 size={16} className="animate-spin text-emerald-400" />
                            </motion.div>
                          ) : saved ? (
                            <motion.div
                              key="saved"
                              initial={{ scale: 0.5, rotate: -45, opacity: 0 }}
                              animate={{ scale: 1, rotate: 0, opacity: 1 }}
                              exit={{ scale: 0.5, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 300, damping: 20 }}
                              className="flex items-center justify-center"
                            >
                              <Check size={16} className="text-emerald-400 stroke-[3]" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="save"
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.8, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-center justify-center"
                            >
                              <Save size={16} className="text-slate-400 hover:text-emerald-300 transition-colors" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    )}
                 </div>
               )}
               
               <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                 <Leaf className="text-emerald-400" /> Rescued Recipe
               </h3>
               
               {isGenerating && (!response || response === "") ? (
                 <div className="flex items-center gap-3 text-emerald-400 my-4">
                   <Loader2 className="animate-spin" size={20} />
                   <span className="text-lg">Formulating zero-waste recipe...</span>
                 </div>
               ) : (
                 <div className="flex flex-col gap-4">
                   {/* Render thoughts block if any thoughts exist */}
                   {thoughts && (
                     <div className="w-full border border-white/5 rounded-xl bg-black/20 overflow-hidden shadow-sm">
                       <button
                         type="button"
                         onClick={() => setOpenThoughts(!openThoughts)}
                         className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-400 hover:text-slate-200 transition-colors"
                       >
                         <div className="flex items-center gap-2">
                           {isGenerating && !content ? (
                             <Brain size={16} className="text-emerald-400 animate-pulse" />
                           ) : (
                             <CheckCircle2 size={16} className="text-emerald-400" />
                           )}
                           <span>{isGenerating && !content ? "Thinking" : "Thoughts"}</span>
                         </div>
                         <span className="text-xs font-mono">{openThoughts ? "HIDE" : "SHOW"}</span>
                       </button>
                       {openThoughts && (
                         <div className="px-4 py-4 text-xs font-mono text-slate-500 border-t border-white/5 whitespace-pre-wrap">
                           {thoughts}
                         </div>
                       )}
                     </div>
                   )}

                   {/* Render frontmatter details block if they exist */}
                   {frontmatter && (
                     <div className="flex flex-col gap-3 p-5 rounded-2xl glass-panel border border-white/10 bg-gradient-to-br from-emerald-950/20 to-teal-950/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                       {frontmatter.recipe && (
                         <h4 className="text-lg font-bold text-white drop-shadow-sm m-0 relative z-10">
                           {frontmatter.recipe}
                         </h4>
                       )}
                       
                       <div className="flex flex-wrap items-center gap-x-4 gap-y-2 relative z-10">
                         {frontmatter.macros && frontmatter.macros.toLowerCase() !== 'unavailable' && (
                           <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                             <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                             <span className="text-xs text-emerald-200 font-mono tracking-wide">{frontmatter.macros}</span>
                           </div>
                         )}
                         
                         {frontmatter.tags && frontmatter.tags.length > 0 && (
                           <div className="flex flex-wrap gap-1.5">
                             {frontmatter.tags.map(tag => (
                               <span key={tag} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-slate-200 text-xs font-medium tracking-wide">
                                 #{tag}
                               </span>
                             ))}
                           </div>
                         )}
                       </div>
                     </div>
                   )}

                   {/* Render final markdown content */}
                   {content && (
                     <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-headings:text-indigo-50 prose-a:text-emerald-400 hover:prose-a:text-emerald-300 prose-strong:text-indigo-100 mt-2">
                       {rawMode ? (
                         <div className="whitespace-pre-wrap font-mono text-[13px] text-slate-300">
                           {markdown}
                         </div>
                       ) : (
                         <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                           {markdown}
                         </ReactMarkdown>
                       )}
                     </div>
                   )}
                 </div>
               )}
               
               {!isGenerating && response !== "" && (
                 <div className="flex justify-end border-t border-white/5 pt-4 mt-2 pr-12">
                   <button
                     type="button"
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
