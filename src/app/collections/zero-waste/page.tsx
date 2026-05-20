"use client";

import { useState, useRef } from "react";
import { Leaf, Sparkles, Loader2, ImagePlus, X, Scale, Copy, Check, Brain, CheckCircle2, Eye, FileCode, Save, ArrowRight, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseSageStream, parseMessageContent } from "@/lib/parser";
import SynergyCanvas from "@/components/zero-waste/SynergyCanvas";

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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  const handleSelectNode = (node: any) => {
    if (node.type === "ingredient") {
      setPrompt(`Help me rescue my expiring ${node.name}. Suggest a zero-waste recipe using it alongside typical staples, and output measurements in metric by default.`);
    } else if (node.type === "recipe") {
      setPrompt(`I want to cook the Zero-Waste ${node.name}. Provide a detailed, step-by-step recipe scaling ingredients, details on how it utilizes pantry leftovers, and output in metric.`);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col max-w-7xl mx-auto p-4 md:p-8 gap-8 relative">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none" />

      <div className="grid grid-cols-1 xl:grid-cols-10 gap-8 w-full items-start relative z-10">
        <div className="xl:col-span-6 flex flex-col gap-6 w-full animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5 m-0 drop-shadow-md">
              <Leaf className="text-emerald-400" />
              <span>Zero-Waste Kitchen Canvas</span>
            </h1>
            <p className="text-sm text-slate-400 m-0 leading-relaxed max-w-xl">
              Interact with expiring pantry ingredients and discover synergetic recipes. Click nodes to auto-fill the rescue builder.
            </p>
          </div>

          <div className="w-full relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-indigo-500/20 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000" />
            <div className="relative">
              <SynergyCanvas onSelectNode={handleSelectNode} />
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/5 flex gap-4 bg-slate-900/25 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Info size={20} />
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold text-slate-300 font-mono tracking-wider uppercase">HOW IT WORKS</h4>
              <p className="text-xs text-slate-400 m-0 leading-relaxed">
                Pantry ingredients are colored by decay status: <strong className="text-rose-400">🔴 Critical</strong>, <strong className="text-amber-400">🟡 Warning</strong>, and <strong className="text-emerald-400">🟢 Fresh</strong>. Springs draw attraction to synergetic dishes in the vault, computed dynamically inside an isolated physics worker thread.
              </p>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6 w-full animate-in fade-in slide-in-from-right-4 duration-500">
          <AnimatePresence mode="wait">
            {response === null ? (
              <motion.div 
                key="hero"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="glass-panel p-8 md:p-10 flex flex-col gap-6 w-full rounded-3xl border border-white/10 bg-slate-950/40 shadow-2xl relative overflow-hidden h-[635px] justify-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                  <Sparkles size={28} className="animate-pulse" />
                </div>
                
                <div className="text-center flex flex-col gap-2">
                  <h2 className="text-2xl font-bold tracking-tight text-white m-0">
                    JIT Rescue Engine
                  </h2>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto m-0 leading-relaxed">
                    Select an ingredient or recipe on the canvas, or enter custom leftover descriptions. Sage will engineer a zero-waste recipe on-demand.
                  </p>
                </div>
                
                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-2">
                  <div className="relative">
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
                          initial={{ opacity: 0, scale: 0.9 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="absolute bottom-full left-0 mb-3 p-2 bg-slate-900/90 backdrop-blur-md rounded-xl border border-white/10 shadow-xl z-20"
                        >
                          <div className="relative group/preview">
                            <img src={imagePreview} alt="Preview" className="h-20 w-auto rounded-lg object-cover" />
                            <button 
                              type="button"
                              onClick={removeImage}
                              className="absolute -top-2 -right-2 bg-slate-950 text-white rounded-full p-1 opacity-0 group-hover/preview:opacity-100 transition-opacity border border-white/20 hover:bg-red-500/80 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <button
                      type="button"
                      className="absolute left-[2px] top-[2px] bottom-[2px] w-[46px] flex items-center justify-center bg-transparent border-none text-slate-400 hover:text-emerald-400 transition-colors z-10 cursor-pointer"
                      title="Upload an image"
                      onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                    >
                      <ImagePlus size={18} />
                    </button>
                    
                    <input
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="glass-input pl-12 pr-4 py-4 w-full text-white placeholder-slate-500 text-sm rounded-xl border border-white/10 bg-slate-950/50"
                      placeholder="Click on the canvas, or type e.g. 'Stale sourdough'"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={(!prompt.trim() && !imagePreview) || isGenerating}
                    className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg cursor-pointer hover:shadow-emerald-500/10"
                  >
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {isGenerating ? "Rescuing..." : "Formulate Rescue Recipe"}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col gap-6"
              >
                <div className="glass-panel p-6 rounded-3xl border border-emerald-500/25 bg-slate-950/60 shadow-2xl relative group flex flex-col gap-5 min-h-[635px] max-h-[635px] overflow-y-auto">
                   {!isGenerating && response && (
                     <div className="absolute top-6 right-6 flex items-center gap-2 z-20">
                       <button
                         type="button"
                         onClick={() => setMeasurementSystem(measurementSystem === 'metric' ? 'imperial' : 'metric')}
                         className="p-2 text-slate-400 hover:text-white transition-all bg-black/40 hover:bg-black/60 border border-white/10 rounded-xl flex items-center justify-center shadow-lg cursor-pointer"
                         title={`Switch to ${measurementSystem === 'metric' ? 'Imperial' : 'Metric'} units`}
                       >
                         <Scale size={15} className={measurementSystem === 'metric' ? 'text-emerald-400' : 'text-fuchsia-400'} />
                       </button>
                       <button
                         type="button"
                         onClick={() => setRawMode(!rawMode)}
                         className="p-2 text-slate-400 hover:text-white transition-all bg-black/40 hover:bg-black/60 border border-white/10 rounded-xl flex items-center justify-center shadow-lg cursor-pointer"
                         title={rawMode ? "Show Rendered" : "Show Raw Markdown"}
                       >
                         {rawMode ? <Eye size={15} /> : <FileCode size={15} />}
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           navigator.clipboard.writeText(markdown);
                           setCopied(true);
                           setTimeout(() => setCopied(false), 2000);
                         }}
                         className="p-2 text-slate-400 hover:text-white transition-all bg-black/40 hover:bg-black/60 border border-white/10 rounded-xl flex items-center justify-center shadow-lg cursor-pointer"
                         title="Copy recipe text"
                       >
                         {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                       </button>
                       {!isGuest && (response.includes("---") || response.includes("```yaml")) && (
                          <button
                            type="button"
                            disabled={isSaving}
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
                            className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-black/40 hover:bg-black/60 border border-white/10 rounded-xl flex items-center justify-center shadow-lg cursor-pointer"
                            title="Save to vault"
                          >
                            <AnimatePresence mode="wait">
                              {isSaving ? (
                                <Loader2 size={15} className="animate-spin text-emerald-400" />
                              ) : saved ? (
                                <Check size={15} className="text-emerald-400 stroke-[3]" />
                              ) : (
                                <Save size={15} className="text-slate-400 hover:text-emerald-300" />
                              )}
                            </AnimatePresence>
                          </button>
                        )}
                     </div>
                   )}
                   <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                       <Leaf size={16} />
                     </div>
                     <h3 className="text-lg font-bold text-white m-0">
                       Sage AI Formulation
                     </h3>
                   </div>
                   {isGenerating && (!response || response === "") ? (
                     <div className="flex-1 flex flex-col items-center justify-center gap-3 text-emerald-400 py-12">
                       <Loader2 className="animate-spin" size={24} />
                       <span className="text-sm font-mono tracking-wide">Executing JIT rescue logic...</span>
                     </div>
                   ) : (
                     <div className="flex flex-col gap-4">
                       {thoughts && (
                         <div className="w-full border border-white/5 rounded-xl bg-black/30 overflow-hidden shadow-inner">
                           <button
                             type="button"
                             onClick={() => setOpenThoughts(!openThoughts)}
                             className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
                           >
                             <div className="flex items-center gap-1.5">
                               {isGenerating && !content ? (
                                 <Brain size={13} className="text-emerald-400 animate-pulse" />
                               ) : (
                                 <CheckCircle2 size={13} className="text-emerald-400" />
                               )}
                               <span className="font-mono tracking-wider font-bold">REASONING PIPELINE</span>
                             </div>
                             <span className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">{openThoughts ? "HIDE" : "SHOW"}</span>
                           </button>
                           {openThoughts && (
                             <div className="px-4 py-3.5 text-[11px] font-mono text-slate-500 border-t border-white/5 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                               {thoughts}
                             </div>
                           )}
                         </div>
                       )}
                       {frontmatter && (
                         <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-white/10 bg-gradient-to-br from-emerald-950/20 to-indigo-950/25 relative overflow-hidden animate-in fade-in slide-in-from-top-1 duration-300">
                           <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                           {frontmatter.recipe && (
                             <h4 className="text-base font-bold text-white m-0 relative z-10 font-mono tracking-tight leading-tight">
                               {frontmatter.recipe}
                             </h4>
                           )}
                           <div className="flex flex-wrap items-center gap-2 relative z-10">
                             {frontmatter.macros && frontmatter.macros.toLowerCase() !== 'unavailable' && (
                               <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                                 <span className="text-[10px] text-emerald-300 font-mono tracking-wide">{frontmatter.macros}</span>
                               </div>
                             )}
                             {frontmatter.tags && frontmatter.tags.length > 0 && (
                               <div className="flex flex-wrap gap-1">
                                 {frontmatter.tags.map(tag => (
                                   <span key={tag} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-slate-300 text-[10px] font-medium">
                                     #{tag}
                                   </span>
                                 ))}
                               </div>
                             )}
                           </div>
                         </div>
                       )}
                       {content && (
                         <div className="prose prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed prose-pre:bg-black/35 prose-pre:border prose-pre:border-white/5 prose-headings:text-indigo-100 prose-a:text-emerald-400 hover:prose-a:text-emerald-300 mt-1 select-text">
                           {rawMode ? (
                             <div className="whitespace-pre-wrap font-mono text-xs text-slate-300 bg-black/20 p-3 rounded-lg border border-white/5">
                               {markdown}
                             </div>
                           ) : (
                             <ReactMarkdown remarkPlugins={[remarkGfm]}>
                               {markdown}
                             </ReactMarkdown>
                           )}
                         </div>
                       )}
                     </div>
                   )}
                   {!isGenerating && response !== "" && (
                     <div className="mt-auto border-t border-white/5 pt-4 flex justify-between items-center bg-transparent">
                       <span className="text-[10px] text-slate-500 font-mono font-bold tracking-wider uppercase">SAGE INTERFACE V1.0.4</span>
                       <button
                         type="button"
                         onClick={() => setResponse(null)}
                         className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5 group"
                       >
                         <span>New Rescue</span>
                         <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                       </button>
                     </div>
                   )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
