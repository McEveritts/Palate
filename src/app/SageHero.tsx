"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Brain, CheckCircle2, User, Copy, Check, Save, FileText, Eye, FileCode, ImagePlus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseSageStream } from "../lib/parser";

interface Message {
  id: string;
  role: "user" | "sage";
  content: string;
  thoughts?: string;
  isStreaming?: boolean;
}

const parseMessageContent = (content: string) => {
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```markdown')) {
    cleanContent = cleanContent.replace(/^```markdown\n?/, '').replace(/\n?```$/, '').trim();
  }

  const match = cleanContent.match(/---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: null, markdown: content };
  
  const yaml = match[1];
  const markdown = cleanContent.slice(match.index! + match[0].length).trim();
  
  const recipeMatch = yaml.match(/(?:recipe|title):\s*(.*)/);
  const tagsMatch = yaml.match(/tags:\s*\[?(.*?)\]?(?:\n|$)/);
  const macrosMatch = yaml.match(/macros:\s*(.*)/);
  
  return {
    markdown,
    frontmatter: {
      recipe: recipeMatch ? recipeMatch[1].trim().replace(/^['"]|['"]$/g, '') : '',
      tags: tagsMatch ? tagsMatch[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [],
      macros: macrosMatch ? macrosMatch[1].trim() : ''
    }
  };
};

export default function SageHero() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [rawMode, setRawMode] = useState<Record<string, boolean>>({});
  const [showCopyOptions, setShowCopyOptions] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setShowCopyOptions(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);
  
  // Keep track of which thought accordions are open by message ID
  const [openThoughts, setOpenThoughts] = useState<Record<string, boolean>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleThoughts = (id: string) => {
    setOpenThoughts(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
    if (!prompt.trim() && !imagePreview) return;
    if (isGenerating) return;

    if (!hasStarted) setHasStarted(true);

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: prompt + (imagePreview ? "\n[Image Uploaded]" : "") };
    const sageMessageId = (Date.now() + 1).toString();
    const initialSageMessage: Message = { id: sageMessageId, role: "sage", content: "", thoughts: "", isStreaming: true };

    setMessages(prev => [...prev, userMessage, initialSageMessage]);
    
    // Capture the payload and clear state immediately
    const payload = { 
      prompt: prompt,
      image: imagePreview
    };
    
    setPrompt("");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    setIsGenerating(true);

    try {
      const res = await fetch("/api/sage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to generate");
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          fullText += decoder.decode(value, { stream: true });
          
          setMessages(prev => prev.map(msg => {
            if (msg.id !== sageMessageId) return msg;

            const { thoughts, content } = parseSageStream(fullText, done);
            
            return { ...msg, thoughts, content };
          }));
        }
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => prev.map(msg => 
        msg.id === sageMessageId ? { ...msg, content: "⚠️ Failed to connect to Sage." } : msg
      ));
    } finally {
      setIsGenerating(false);
      setMessages(prev => prev.map(msg => 
        msg.id === sageMessageId ? { ...msg, isStreaming: false } : msg
      ));
    }
  };

  return (
    <div className={`w-full h-full flex flex-col justify-center relative ${!hasStarted ? 'max-w-4xl mx-auto' : ''}`}>
      <AnimatePresence mode="wait">
        {!hasStarted ? (
          // Initial Hero State
          <motion.div 
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel glass-hero p-10 lg:p-14 flex flex-col items-center text-center gap-6 w-full"
          >
            <div className="w-16 h-16 rounded-full glass-icon-wrapper flex items-center justify-center text-3xl">
              🌿
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] m-0">
              Sage is Ready.
            </h1>
            <p className="text-lg text-slate-300 max-w-xl m-0 leading-relaxed">
              Transform pantry chaos, dietary constraints, or fleeting desires into a masterpiece. Share your starting point, and allow Sage to curate your next dining experience.
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
                className="absolute left-[1px] top-[1px] bottom-[1px] w-[50px] flex items-center justify-center bg-transparent border-none text-slate-400 hover:text-indigo-400 transition-colors z-10"
                title="Upload an image"
                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              >
                <ImagePlus size={20} />
              </button>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="glass-input pl-16 pr-40 py-4 w-full text-white placeholder-slate-400"
                placeholder="e.g. 'I need a high-protein dinner from the vault...'"
              />
              <button
                type="submit"
                className="absolute right-2 top-2 bottom-2 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 text-white rounded-3xl px-5 flex items-center gap-2 cursor-pointer transition-all backdrop-blur-md font-medium text-sm"
              >
                <Sparkles size={16} /> Ask Sage
              </button>
            </form>          </motion.div>
        ) : (
          // Active Chat State
          <motion.div 
            key="chat"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="w-full flex flex-col gap-6 h-full justify-end pb-8"
          >
            {/* Chat History */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar"
            >
              {messages.map((msg) => {
                const { frontmatter, markdown } = msg.role === 'sage' && !rawMode[msg.id] 
                  ? parseMessageContent(msg.content)
                  : { frontmatter: null, markdown: msg.content };

                return (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full px-[25px]`}
                >
                  <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {msg.role === 'sage' ? (
                        <div className="w-10 h-10 rounded-full glass-icon-wrapper flex items-center justify-center text-lg shadow-lg">
                          🌿
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shadow-lg">
                          <User size={18} />
                        </div>
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-full group`}>
                      {msg.role === 'sage' && msg.thoughts && (
                        <div className="w-full min-w-[300px] border border-white/5 rounded-xl bg-black/20 overflow-hidden shadow-sm">
                          <button 
                            onClick={() => toggleThoughts(msg.id)}
                            className="w-full px-4 py-3 flex items-center justify-between text-sm text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {msg.isStreaming && !msg.content ? (
                                <Brain size={16} className="text-indigo-400 animate-pulse" />
                              ) : (
                                <CheckCircle2 size={16} className="text-emerald-400" />
                              )}
                              <span>{msg.isStreaming && !msg.content ? "Thinking" : "Thoughts"}</span>
                            </div>
                            <span className="text-xs font-mono">{openThoughts[msg.id] ? "HIDE" : "SHOW"}</span>
                          </button>
                          {openThoughts[msg.id] && (
                            <div className="px-4 py-4 text-xs font-mono text-slate-500 border-t border-white/5 whitespace-pre-wrap">
                              {msg.thoughts}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {msg.content || (msg.isStreaming && !msg.thoughts) ? (
                        <div className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} max-w-full`}>
                          <div className={`p-5 rounded-2xl text-[15px] leading-relaxed shadow-lg overflow-hidden ${
                            msg.role === 'user' 
                              ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-50 rounded-tr-sm whitespace-pre-wrap' 
                              : 'glass-panel bg-slate-900/60 border border-white/5 text-slate-100 rounded-tl-sm'
                          }`}>
                            {msg.content ? (
                              msg.role === 'user' ? (
                                msg.content
                              ) : rawMode[msg.id] ? (
                                <div className="whitespace-pre-wrap font-mono text-[13px] text-slate-300">
                                  {msg.content}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-4">
                                  {frontmatter && (
                                    <div className="flex flex-col gap-3 p-5 rounded-2xl glass-panel border border-white/10 mb-4 bg-gradient-to-br from-indigo-900/20 to-fuchsia-900/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] relative overflow-hidden">
                                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                                      {frontmatter.recipe && <h3 className="text-lg font-bold text-white drop-shadow-sm m-0 relative z-10">{frontmatter.recipe}</h3>}
                                      
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 relative z-10">
                                        {frontmatter.macros && frontmatter.macros.toLowerCase() !== 'unavailable' && (
                                          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                            <span className="text-xs text-emerald-200 font-mono tracking-wide">{frontmatter.macros}</span>
                                          </div>
                                        )}
                                        {frontmatter.macros && frontmatter.macros.toLowerCase() === 'unavailable' && (
                                          <div className="flex items-center gap-1.5 bg-slate-500/10 border border-slate-500/20 px-2.5 py-1 rounded-md">
                                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                                            <span className="text-xs text-slate-300 font-mono tracking-wide">Macros: Unavailable</span>
                                          </div>
                                        )}
                                        
                                        {frontmatter.tags.length > 0 && (
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
                                  <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-headings:text-indigo-50 prose-a:text-indigo-400 hover:prose-a:text-indigo-300 prose-strong:text-indigo-100">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {markdown}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              )
                            ) : (
                              <span className="animate-pulse text-indigo-400 flex items-center gap-2">
                                <Sparkles size={16}/> Initializing context...
                              </span>
                            )}
                            {msg.isStreaming && msg.content && <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse"></span>}
                          </div>

                          {/* Action Buttons */}
                          {!msg.isStreaming && msg.content && (
                            <div className="opacity-0 group-hover:opacity-100 flex flex-col gap-2 mb-2 flex-shrink-0 transition-all relative">
                              {msg.role === 'sage' && (
                                <button 
                                  onClick={() => setRawMode(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                  className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 rounded-lg"
                                  title={rawMode[msg.id] ? "Show Rendered" : "Show Raw Markdown"}
                                >
                                  {rawMode[msg.id] ? <Eye size={16} /> : <FileCode size={16} />}
                                </button>
                              )}

                              <div className="relative flex flex-col items-center">
                                <button 
                                  onClick={(e) => {
                                    if (msg.role === 'user') {
                                      navigator.clipboard.writeText(msg.content);
                                      setCopiedId(msg.id);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    } else {
                                      e.stopPropagation();
                                      setShowCopyOptions(showCopyOptions === msg.id ? null : msg.id);
                                    }
                                  }}
                                  className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 rounded-lg"
                                  title="Copy text"
                                >
                                  {copiedId === msg.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                </button>
                                
                                <AnimatePresence>
                                  {msg.role === 'sage' && showCopyOptions === msg.id && (
                                    <motion.div 
                                      initial={{ opacity: 0, scale: 0.95, x: -5 }}
                                      animate={{ opacity: 1, scale: 1, x: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, x: -5 }}
                                      className="absolute right-full mr-3 top-0 flex flex-col gap-1 glass-panel p-1.5 rounded-xl z-30 whitespace-nowrap min-w-[140px]"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(msg.content);
                                          setCopiedId(msg.id);
                                          setShowCopyOptions(null);
                                          setTimeout(() => setCopiedId(null), 2000);
                                        }}
                                        className="text-[13px] px-3 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left flex items-center gap-2"
                                      >
                                        <FileCode size={14} /> As Markdown
                                      </button>
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(markdown);
                                          setCopiedId(msg.id);
                                          setShowCopyOptions(null);
                                          setTimeout(() => setCopiedId(null), 2000);
                                        }}
                                        className="text-[13px] px-3 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left flex items-center gap-2"
                                      >
                                        <FileText size={14} /> As Text
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              
                              {msg.role === 'sage' && (msg.content.includes("```yaml") || msg.content.includes("---")) && (
                                <button 
                                  onClick={async () => {
                                    setIsSaving(prev => ({ ...prev, [msg.id]: true }));
                                    const { saveRecipeToVault } = await import("./actions");
                                    const res = await saveRecipeToVault(msg.content, 'md');
                                    setIsSaving(prev => ({ ...prev, [msg.id]: false }));
                                    if (res.success) {
                                      setSavedId(msg.id);
                                      setTimeout(() => setSavedId(null), 2000);
                                    }
                                  }}
                                  className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 rounded-lg"
                                  title="Save to vault"
                                >
                                  {isSaving[msg.id] ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin"></div>
                                  ) : savedId === msg.id ? (
                                    <Check size={16} className="text-emerald-400" />
                                  ) : (
                                    <Save size={16} />
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                  </div>
                </motion.div>
                );
              })}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="w-full relative shadow-lg mt-auto flex-shrink-0">
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
                disabled={isGenerating}
                className="absolute left-[1px] top-[1px] bottom-[1px] w-[50px] flex items-center justify-center bg-transparent border-none text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50 z-10"
                title="Upload an image"
                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              >
                <ImagePlus size={20} />
              </button>
              <input 
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                className="glass-input pl-16 pr-32 py-4 w-full text-white disabled:opacity-50" 
                placeholder="Ask a follow up..."
              />
              <button 
                type="submit"
                disabled={isGenerating}
                className="absolute right-2 top-2 bottom-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-3xl px-4 flex items-center justify-center transition-all disabled:opacity-50"
              >
                {isGenerating ? <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div> : "Send"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
