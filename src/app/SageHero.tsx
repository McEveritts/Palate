"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Brain, CheckCircle2, User, Copy, Check, Save, FileText, Eye, FileCode, ImagePlus, X, Scale } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from 'rehype-sanitize';
import { parseSageStream, parseMessageContent } from "../lib/parser";
import { useAppStore } from "@/lib/store";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";

interface Message {
  id: string;
  role: "user" | "sage";
  content: string;
  thoughts?: string;
  isStreaming?: boolean;
}



export default function SageHero({ sessionId: propSessionId }: { sessionId?: string }) {
  const params = useParams();
  const sessionId = propSessionId || (params?.sessionId as string | undefined);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMicroScreen, setIsMicroScreen] = useState(false);

  // Hydration-safe listener for dynamic viewport adjustments
  useEffect(() => {
    const handleResize = () => setIsMicroScreen(window.innerWidth < 380);
    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [rawMode, setRawMode] = useState<Record<string, boolean>>({});
  const [showCopyOptions, setShowCopyOptions] = useState<string | null>(null);
  const [diaryTotals, setDiaryTotals] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const geminiApiKey = useAppStore((state) => state.geminiApiKey);
  const isGuest = useAppStore((state) => state.isGuest);
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const setMeasurementSystem = useAppStore((state) => state.setMeasurementSystem);

  // Fetch today's diary totals for Sage context
  useEffect(() => {
    const fetchTotals = async () => {
      try {
        const res = await fetch('/api/diary');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.dailyLog) {
            setDiaryTotals({
              calories: data.dailyLog.totalCalories || 0,
              protein: data.dailyLog.totalProtein || 0,
              carbs: data.dailyLog.totalCarbs || 0,
              fat: data.dailyLog.totalFat || 0,
            });
          }
        }
      } catch (e) {
        console.warn('[SageHero] Failed to fetch diary totals:', e);
      }
    };
    fetchTotals();
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageRef = useRef<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const { status } = useSession();
  const router = useRouter();
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [openThoughts, setOpenThoughts] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => setShowCopyOptions(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;
    if (status === "loading") return;

    async function loadHistory() {
      if (!sessionId) {
        setMessages([]);
        setHasStarted(false);
        return;
      }

      setLoadingHistory(true);
      if (status === "authenticated") {
        const { getChatSession } = await import("./actions");
        const res = await getChatSession(sessionId);
        if (res.success && res.session && active) {
          const dbMsgs = res.session.messages.map((m: { id: string; role: string; content: string; thought: string | null }) => ({
            id: m.id,
            role: m.role as "user" | "sage",
            content: m.content,
            thoughts: m.thought ?? undefined,
            isStreaming: false
          }));
          setMessages(dbMsgs);
          setHasStarted(true);
        }
      } else {
        // Guest mode fallback
        const stored = localStorage.getItem(`palate_guest_messages_${sessionId}`);
        if (stored && active) {
          try {
            const parsed = JSON.parse(stored);
            setMessages(parsed);
            setHasStarted(true);
          } catch (e) {
            setMessages([]);
          }
        }
      }
      setLoadingHistory(false);
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [sessionId, status]);

  // Keep track of which thoughts are open for dynamic rendering
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

  const generateSageReply = useCallback(async () => {
    if (!sessionId) return;
    setIsGenerating(true);

    const currentMessages = messagesRef.current;
    const userProfile = useAppStore.getState().userProfile;
    const lastUserMessage = currentMessages[currentMessages.length - 1];
    const userPrompt = lastUserMessage.content;
    const historyPayload = currentMessages.slice(0, currentMessages.length - 1).map(m => ({
      role: m.role,
      content: m.content,
      thoughts: m.thoughts
    }));

    const sageMessageId = (Date.now() + 1).toString();
    const initialSageMessage: Message = { id: sageMessageId, role: "sage", content: "", thoughts: "", isStreaming: true };

    setMessages(prev => [...prev, initialSageMessage]);

    let currentImage = pendingImageRef.current;
    if (typeof window !== 'undefined' && !currentImage) {
      currentImage = sessionStorage.getItem('palate_pending_image');
      sessionStorage.removeItem('palate_pending_image');
    }

    try {
      const res = await fetch("/api/sage", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-gemini-api-key": geminiApiKey
        },
        body: JSON.stringify({
          prompt: userPrompt,
          measurementSystem: measurementSystem,
          history: historyPayload,
          image: currentImage || undefined,
          dailyTargets: userProfile ? {
            calories: userProfile.targetCalories,
            protein: userProfile.targetProtein,
            carbs: userProfile.targetCarbs,
            fat: userProfile.targetFat,
          } : undefined,
          currentTotals: diaryTotals || undefined,
        }),
      });

      // Consume the pending image so it's not re-sent on the next message
      pendingImageRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('palate_pending_image');
      }

      if (!res.ok) {
        throw new Error("Failed to generate");
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = "";
      let finalThoughts = "";
      let finalContent = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          fullText += decoder.decode(value, { stream: true });

          // Intercept tool call tokens before the parser sees them
          const toolMarkers = [
            { marker: '___TOOL_CALL_LOG_FOOD___', handler: async (data: { food_name: string; calories: number; protein: number; carbs: number; fat: number }) => {
              const hour = new Date().getHours();
              const mealType = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 20 ? 'Dinner' : 'Snack';
              fetch('/api/diary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customFoodName: data.food_name,
                  calories: Math.round(data.calories || 0),
                  protein: Math.round(data.protein || 0),
                  carbs: Math.round(data.carbs || 0),
                  fat: Math.round(data.fat || 0),
                  mealType,
                }),
              }).then(res => {
                if (res.ok) {
                  setDiaryTotals(prev => prev ? {
                    calories: prev.calories + Math.round(data.calories || 0),
                    protein: prev.protein + Math.round(data.protein || 0),
                    carbs: prev.carbs + Math.round(data.carbs || 0),
                    fat: prev.fat + Math.round(data.fat || 0),
                  } : { calories: Math.round(data.calories || 0), protein: Math.round(data.protein || 0), carbs: Math.round(data.carbs || 0), fat: Math.round(data.fat || 0) });
                }
              }).catch(err => console.error('[SageHero] Failed to persist food log:', err));
              setToastMessage(`✅ Logged: ${data.food_name} (${Math.round(data.calories)} kcal)`);
              setShowToast(true);
            }},
            { marker: '___TOOL_CALL_LOG_EXERCISE___', handler: async (data: { exercise_name: string; duration_minutes: number; calories_burned: number }) => {
              fetch('/api/exercise', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  exerciseName: data.exercise_name,
                  durationMinutes: Math.round(data.duration_minutes || 0),
                  caloriesBurned: Math.round(data.calories_burned || 0),
                }),
              }).catch(err => console.error('[SageHero] Failed to persist exercise:', err));
              setToastMessage(`🏋️ Logged: ${data.exercise_name} (${Math.round(data.calories_burned)} kcal burned)`);
              setShowToast(true);
            }},
            { marker: '___TOOL_CALL_LOG_HYDRATION___', handler: async (data: { amount_ml: number }) => {
              fetch('/api/hydration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amountMl: Math.round(data.amount_ml || 0) }),
              }).catch(err => console.error('[SageHero] Failed to persist hydration:', err));
              setToastMessage(`💧 Logged: ${Math.round(data.amount_ml)}ml water`);
              setShowToast(true);
            }},
            { marker: '___TOOL_CALL_LOG_WEIGHT___', handler: async (data: { weight_kg: number }) => {
              fetch('/api/weight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weightKg: data.weight_kg }),
              }).catch(err => console.error('[SageHero] Failed to persist weight:', err));
              setToastMessage(`⚖️ Logged: ${data.weight_kg} kg`);
              setShowToast(true);
            }},
          ];

          for (const { marker, handler } of toolMarkers) {
            if (fullText.includes(marker)) {
              const markerIndex = fullText.indexOf(marker);
              const afterMarker = fullText.substring(markerIndex + marker.length);
              const newlineIndex = afterMarker.indexOf('\n\n');
              if (newlineIndex !== -1) {
                try {
                  const jsonStr = afterMarker.substring(0, newlineIndex).trim();
                  const parsedData = JSON.parse(jsonStr);
                  handler(parsedData);
                } catch {
                  // Malformed JSON – strip the marker anyway to avoid flash
                }
                const regex = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n\\n', 'g');
                fullText = fullText.replace(regex, '');
              }
            }
          }

          const parsed = parseSageStream(fullText, done);
          finalThoughts = parsed.thoughts;
          finalContent = parsed.content;

          setMessages(prev => prev.map(msg => {
            if (msg.id !== sageMessageId) return msg;
            return { ...msg, thoughts: finalThoughts, content: finalContent };
          }));
        }
      }

      // Final parse step to guarantee the parser processes the text with isDone = true
      const finalParsed = parseSageStream(fullText, true);
      finalThoughts = finalParsed.thoughts;
      finalContent = finalParsed.content;

      setMessages(prev => prev.map(msg => {
        if (msg.id !== sageMessageId) return msg;
        return { ...msg, thoughts: finalThoughts, content: finalContent, isStreaming: false };
      }));

      // Save assistant message to Database or localStorage
      if (status === "authenticated") {
        const { saveChatMessage } = await import("./actions");
        await saveChatMessage(sessionId, "sage", finalContent, finalThoughts);
      } else {
        // Guest mode – sync to localStorage from fresh state
        setMessages(prev => {
          const updated = prev.map(msg =>
            msg.id === sageMessageId
              ? { ...msg, content: finalContent, thoughts: finalThoughts, isStreaming: false }
              : msg
          );
          try {
            localStorage.setItem(`palate_guest_messages_${sessionId}`, JSON.stringify(updated));
          } catch { /* storage full / unavailable */ }
          return prev; // don't double-update; the finally block handles isStreaming
        });
      }
      
      // Dispatch sidebar update
      window.dispatchEvent(new CustomEvent("palate-chat-sessions-updated"));

    } catch (err: unknown) {
      if (process.env.NODE_ENV === 'development') console.error(err);
      setMessages(prev => prev.map(msg => 
        msg.id === sageMessageId ? { ...msg, content: "⚠️ Failed to connect to Sage." } : msg
      ));
    } finally {
      setIsGenerating(false);
      setMessages(prev => prev.map(msg => 
        msg.id === sageMessageId ? { ...msg, isStreaming: false } : msg
      ));
    }
  }, [sessionId, geminiApiKey, measurementSystem, status, diaryTotals]);

  // Trigger reply generation automatically when a new user message lands at the end of stack
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "user" && !isGenerating && !loadingHistory) {
      const timer = setTimeout(() => {
        generateSageReply();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [messages, isGenerating, loadingHistory, generateSageReply]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !imagePreview) return;
    if (isGenerating) return;

    const userPrompt = prompt;
    const currentImage = imagePreview;

    pendingImageRef.current = imagePreview;
    if (imagePreview && typeof window !== 'undefined') {
      sessionStorage.setItem('palate_pending_image', imagePreview);
    }
    setPrompt("");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const userMessageId = Date.now().toString();
    const userMessage: Message = { id: userMessageId, role: "user", content: userPrompt + (currentImage ? "\n[Image Uploaded]" : "") };

    if (sessionId) {
      if (status === "authenticated") {
        const { saveChatMessage } = await import("./actions");
        await saveChatMessage(sessionId, "user", userMessage.content);
      }
      
      setMessages(prev => [...prev, userMessage]);
      
      if (status !== "authenticated") {
        setMessages(prev => {
          try {
            localStorage.setItem(`palate_guest_messages_${sessionId}`, JSON.stringify(prev));
          } catch { /* storage full / unavailable */ }
          return prev;
        });
      }
      
      window.dispatchEvent(new CustomEvent("palate-chat-sessions-updated"));
    } else {
      // Transition UI to active chat state immediately for instant feedback
      setHasStarted(true);
      setMessages([userMessage]);
      setIsGenerating(true);

      const title = userPrompt.slice(0, 35) + (userPrompt.length > 35 ? "..." : "");
      
      if (status === "authenticated") {
        try {
          const { createChatSession, saveChatMessage } = await import("./actions");
          const res = await createChatSession(title);
          if (res.success && res.session) {
            const newSessionId = res.session.id;
            await saveChatMessage(newSessionId, "user", userMessage.content);
            window.dispatchEvent(new CustomEvent("palate-chat-sessions-updated"));
            router.push(`/ask_sage/${newSessionId}`);
          } else {
            // Revert state if creation failed
            setIsGenerating(false);
            setHasStarted(false);
            setMessages([]);
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') console.error("Failed to create chat session:", error);
          setIsGenerating(false);
          setHasStarted(false);
          setMessages([]);
        }
      } else {
        const newSessionId = `guest-session-${Date.now()}`;
        const storedSessions = localStorage.getItem("palate_guest_sessions");
        let sessionsList: { id: string; title: string; createdAt: string }[] = [];
        try { sessionsList = storedSessions ? JSON.parse(storedSessions) : []; } catch { /* corrupted – reset */ }
        
        sessionsList.unshift({
          id: newSessionId,
          title,
          createdAt: new Date().toISOString()
        });
        
        localStorage.setItem("palate_guest_sessions", JSON.stringify(sessionsList));
        localStorage.setItem(`palate_guest_messages_${newSessionId}`, JSON.stringify([userMessage]));
        
        window.dispatchEvent(new CustomEvent("palate-chat-sessions-updated"));
        router.push(`/ask_sage/${newSessionId}`);
      }
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (loadingHistory) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[400px]">
        <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 w-full h-full rounded-full bg-indigo-500/10 blur-xl animate-pulse" />
          <div className="w-12 h-12 rounded-full border-2 border-indigo-400/20 border-t-indigo-400 animate-spin" />
        </div>
        <p className="text-slate-400 mt-4 text-sm font-medium tracking-wide animate-pulse">
          Retrieving Chef&apos;s Chronicles...
        </p>
      </div>
    );
  }
  return (
    <div className={`w-full flex-1 flex flex-col justify-center relative ${!hasStarted ? 'max-w-4xl mx-auto' : ''}`}>
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleImageSelect} 
        data-sage-upload
      />
      <AnimatePresence mode="wait">
        {!hasStarted ? (
          // Initial Hero State
          <motion.div 
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel glass-hero p-3 xs:p-5 md:p-10 lg:p-14 3xl:p-20 4xl:p-28 flex flex-col items-center text-center gap-6 3xl:gap-10 4xl:gap-14 w-full"
          >
            <div className="w-16 h-16 3xl:w-24 3xl:h-24 4xl:w-32 4xl:h-32 rounded-full glass-icon-wrapper flex items-center justify-center text-3xl 3xl:text-5xl 4xl:text-7xl">
              🌿
            </div>
            
            <h1 className="text-4xl md:text-5xl 3xl:text-7xl 4xl:text-8xl font-bold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] m-0">
              Sage is Ready.
            </h1>
            <p className="text-lg md:text-xl 3xl:text-3xl 4xl:text-4xl text-slate-300 max-w-xl 3xl:max-w-3xl 4xl:max-w-5xl m-0 leading-relaxed">
              Transform pantry chaos, dietary constraints, or fleeting desires into a masterpiece. Share your starting point, and allow Sage to curate your next dining experience.
            </p>
            
            <form onSubmit={handleSubmit} className="w-full max-w-2xl 3xl:max-w-4xl 4xl:max-w-6xl relative mt-4 3xl:mt-8 4xl:mt-12">
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
                className="absolute left-[1px] top-[1px] bottom-[1px] w-[38px] xs:w-[50px] flex items-center justify-center bg-transparent border-none text-slate-400 hover:text-indigo-400 transition-colors z-10"
                title="Upload an image"
                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              >
                <ImagePlus size={20} />
              </button>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="glass-input pl-11 xs:pl-16 pr-12 xs:pr-36 py-3.5 xs:py-4 w-full text-white placeholder-slate-400"
                placeholder={isMicroScreen ? "Ask Sage..." : "e.g. 'I need a high-protein dinner from the vault...'"}
              />
              <button
                type="submit"
                className="absolute right-2 top-2 bottom-2 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 text-white rounded-3xl px-3 xs:px-5 flex items-center gap-2 cursor-pointer transition-all backdrop-blur-md font-medium text-sm"
              >
                <Sparkles size={16} />
                <span className="hidden xs:inline">Ask Sage</span>
              </button>
            </form>
          </motion.div>
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

                const isThoughtsOpen = openThoughts[msg.id] !== undefined 
                  ? openThoughts[msg.id] 
                  : (msg.isStreaming && !msg.content);

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
                        <motion.div 
                          className="w-full min-w-0 md:min-w-[320px] border border-white/10 rounded-2xl bg-slate-950/45 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden transition-all duration-300 hover:border-white/20 relative"
                          animate={msg.isStreaming ? {
                            boxShadow: [
                              "0px 0px 8px rgba(99, 102, 241, 0.25), inset 0px 1px 1px rgba(255,255,255,0.05), 0px 8px 32px rgba(0,0,0,0.35)",
                              "0px 0px 28px rgba(217, 70, 239, 0.45), inset 0px 1px 1px rgba(255,255,255,0.1), 0px 8px 32px rgba(0,0,0,0.35)",
                              "0px 0px 8px rgba(99, 102, 241, 0.25), inset 0px 1px 1px rgba(255,255,255,0.05), 0px 8px 32px rgba(0,0,0,0.35)"
                            ],
                            borderColor: [
                              "rgba(255, 255, 255, 0.1)",
                              "rgba(217, 70, 239, 0.5)",
                              "rgba(255, 255, 255, 0.1)"
                            ]
                          } : undefined}
                          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        >
                          {msg.isStreaming && (
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-fuchsia-500/5 to-indigo-500/5 pointer-events-none animate-pulse" />
                          )}
                          <button 
                            onClick={() => toggleThoughts(msg.id)}
                            className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-medium text-slate-300 hover:text-white transition-colors select-none focus:outline-none relative z-10"
                          >
                            <div className="flex items-center gap-3">
                              {msg.isStreaming ? (
                                <div className="relative flex items-center justify-center w-5 h-5">
                                  <div className="absolute inset-0 rounded-full bg-fuchsia-500/40 blur-[6px] animate-ping" />
                                  <div className="absolute inset-0.5 rounded-full bg-indigo-500/40 blur-[4px] animate-pulse" />
                                  <Brain size={16} className="text-fuchsia-400 relative z-10 animate-pulse" />
                                </div>
                              ) : (
                                <CheckCircle2 size={16} className="text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]" />
                              )}
                              <span className="tracking-wide text-xs uppercase font-bold text-slate-300">
                                {msg.isStreaming ? "Synthesizing Culinary Intelligence..." : "Sage Reasoning Process"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">
                                {isThoughtsOpen ? "CLOSE" : "EXPAND"}
                              </span>
                            </div>
                          </button>
                          
                          <AnimatePresence initial={false}>
                            {isThoughtsOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden relative z-10"
                              >
                                <div className="px-5 pb-5 pt-2 text-xs font-mono text-slate-300 border-t border-white/5 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar bg-slate-950/30">
                                  {msg.thoughts}
                                  {msg.isStreaming && (
                                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-fuchsia-400 animate-pulse" />
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
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
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
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
                                  onClick={() => setMeasurementSystem(measurementSystem === 'metric' ? 'imperial' : 'metric')}
                                  className="p-2 text-slate-400 hover:text-white transition-all bg-black/20 hover:bg-black/40 rounded-lg flex items-center justify-center"
                                  title={`Switch to ${measurementSystem === 'metric' ? 'Imperial' : 'Metric'} units`}
                                >
                                  <Scale size={16} className={measurementSystem === 'metric' ? 'text-indigo-400' : 'text-fuchsia-400'} />
                                </button>
                              )}

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
                              
                              {msg.role === 'sage' && (msg.content.includes("```yaml") || msg.content.includes("---")) && !isGuest && (
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
                className="absolute left-[1px] top-[1px] bottom-[1px] w-[38px] xs:w-[50px] flex items-center justify-center bg-transparent border-none text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50 z-10"
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
                className="glass-input pl-11 xs:pl-16 pr-12 xs:pr-32 py-3.5 xs:py-4 w-full text-white disabled:opacity-50" 
                placeholder={isMicroScreen ? "Follow up..." : "Ask a follow up..."}
              />
              <button 
                type="submit"
                disabled={isGenerating}
                className="absolute right-2 top-2 bottom-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-3xl px-3 xs:px-4 flex items-center justify-center transition-all disabled:opacity-50 font-medium text-sm"
              >
                {isGenerating ? (
                  <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                ) : (
                  <>
                    <Sparkles size={16} className="xs:hidden" />
                    <span className="hidden xs:inline">Send</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-emerald-500/20 backdrop-blur-2xl border border-emerald-500/30 text-emerald-300 text-sm font-medium shadow-[0_8px_32px_rgba(16,185,129,0.3)]"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
