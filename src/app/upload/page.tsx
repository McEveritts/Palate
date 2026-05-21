"use client";

import { useState, useRef } from "react";
import { Sparkles, Brain, Check, RefreshCcw, Save, ImagePlus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from 'rehype-sanitize';
import { saveParsedRecipe } from "../actions";

import { parseMessageContent } from "../../lib/parser";

export default function UploadPage() {
  const [input, setInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<{ markdown: string, category: 'mains' | 'sides', title: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !imagePreview) || isParsing) return;

    setIsParsing(true);
    setError(null);

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, image: imagePreview })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse recipe');
      }

      setParsedData({
        markdown: data.markdown,
        category: data.category,
        title: data.title
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedData || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await saveParsedRecipe(parsedData.markdown, parsedData.category, parsedData.title);
      if (!res.success) {
        throw new Error(res.error || 'Failed to save recipe');
      }
      
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setParsedData(null);
        setInput("");
      }, 2000);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setParsedData(null);
    setInput("");
    setError(null);
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center relative p-8">
      
      <AnimatePresence mode="wait">
        {!parsedData && !isParsing && (
          <motion.div 
            key="input-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
            className="w-full max-w-3xl glass-panel p-10 lg:p-14 rounded-3xl flex flex-col items-center text-center gap-6"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-2">
              <Sparkles size={32} />
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white m-0">
              Upload a Recipe
            </h1>
            <p className="text-lg text-slate-400 max-w-xl m-0 leading-relaxed">
              Paste a URL from any food blog, raw text, or upload an image of a physical recipe. Sage will strip the filler, normalize the measurements, and extract the pure culinary essence.
            </p>
            
            <form onSubmit={handleParse} className="w-full relative mt-6">
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
                    className="absolute bottom-full left-0 mb-4 p-2 bg-slate-800/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl z-20"
                  >
                    <div className="relative group/preview">
                      <img src={imagePreview} alt="Preview" className="h-32 w-auto rounded-xl object-cover" />
                      <button 
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-3 -right-3 bg-slate-900 text-white rounded-full p-1.5 opacity-0 group-hover/preview:opacity-100 transition-opacity border border-white/20 hover:bg-red-500/80"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <button
                type="button"
                className="absolute left-[1px] top-[1px] bottom-[1px] w-[60px] flex items-center justify-center bg-transparent text-slate-400 hover:text-indigo-400 transition-colors z-10"
                title="Upload an image"
                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              >
                <ImagePlus size={22} />
              </button>
              
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="glass-input pl-[68px] pr-40 py-5 w-full text-white placeholder-slate-500 text-lg rounded-2xl" 
                placeholder="Paste URL, text, or upload an image..."
              />
              <button 
                type="submit"
                disabled={(!input.trim() && !imagePreview)}
                className="absolute right-3 top-3 bottom-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-6 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
              >
                Extract
              </button>
            </form>
            
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20">
                {error}
              </motion.div>
            )}
          </motion.div>
        )}

        {isParsing && (
          <motion.div 
            key="parsing-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center gap-6"
          >
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-2 border-indigo-500/20 absolute inset-0"></div>
              <div className="w-24 h-24 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-indigo-400">
                <Brain size={32} className="animate-pulse" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">Synthesizing...</h3>
            <p className="text-slate-400 text-center max-w-sm">Sage is analyzing the input and formatting the culinary data to the Palate standard.</p>
          </motion.div>
        )}

        {parsedData && !isParsing && (
          <motion.div 
            key="review-state"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-4xl h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div>
                <h2 className="text-3xl font-bold text-white">Review Recipe</h2>
                <p className="text-slate-400 mt-1">Review the extracted formatting before saving to the vault.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider rounded-lg border border-slate-700">
                  Folder: {parsedData.category}
                </span>
                <button 
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <RefreshCcw size={16} /> Discard
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving || saveSuccess}
                  className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 font-medium disabled:opacity-50"
                >
                  {saveSuccess ? (
                    <><Check size={18} /> Saved!</>
                  ) : isSaving ? (
                    <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div> Saving...</>
                  ) : (
                    <><Save size={18} /> Save to Vault</>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 text-red-400 text-sm bg-red-400/10 px-4 py-3 rounded-lg border border-red-400/20 shrink-0">
                {error}
              </div>
            )}

            <div className="glass-panel p-8 md:p-12 rounded-3xl flex-1 overflow-y-auto custom-scrollbar border border-white/10 relative">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"></div>
              
              <div className="flex flex-col gap-4 relative z-10 w-full">
                {(() => {
                  const { frontmatter, markdown } = parseMessageContent(parsedData.markdown);
                  
                  return (
                    <>
                      {frontmatter && (
                        <div className="flex flex-col gap-3 p-6 rounded-2xl glass-panel border border-white/10 mb-4 bg-gradient-to-br from-indigo-900/20 to-fuchsia-900/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                          {frontmatter.recipe && <h3 className="text-xl font-bold text-white drop-shadow-sm m-0 relative z-10">{frontmatter.recipe}</h3>}
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 relative z-10">
                            {frontmatter.macros && frontmatter.macros.toLowerCase() !== 'unavailable' && (
                              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                <span className="text-sm text-emerald-200 font-mono tracking-wide">{frontmatter.macros}</span>
                              </div>
                            )}
                            {frontmatter.macros && frontmatter.macros.toLowerCase() === 'unavailable' && (
                              <div className="flex items-center gap-1.5 bg-slate-500/10 border border-slate-500/20 px-2.5 py-1 rounded-md">
                                <span className="w-2 h-2 rounded-full bg-slate-400" />
                                <span className="text-sm text-slate-300 font-mono tracking-wide">Macros: Unavailable</span>
                              </div>
                            )}
                            
                            {frontmatter.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {frontmatter.tags.map((tag: string) => (
                                  <span key={tag} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-slate-200 text-sm font-medium tracking-wide">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="prose prose-invert prose-lg prose-indigo max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                          {markdown}
                        </ReactMarkdown>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
