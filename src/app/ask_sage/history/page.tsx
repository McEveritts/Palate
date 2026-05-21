"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Trash2, Calendar, Search, ArrowRight, Sparkles } from "lucide-react";

export default function HistoryPage() {
  const { status } = useSession();
  const [sessions, setSessions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSessions = async () => {
    setLoading(true);
    if (status === "authenticated") {
      const { getChatSessions } = await import("@/app/actions");
      const res = await getChatSessions();
      if (res.success) {
        setSessions(res.sessions || []);
      }
    } else if (status !== "loading") {
      // Guest mode
      const stored = localStorage.getItem("palate_guest_sessions");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // For each guest session, let's load message count and last message
          const sessionsWithMsgs = parsed.map((s: any) => {
            const msgsStored = localStorage.getItem(`palate_guest_messages_${s.id}`);
            const messages = msgsStored ? JSON.parse(msgsStored) : [];
            return {
              ...s,
              messages
            };
          });
          setSessions(sessionsWithMsgs);
        } catch (e) {
          setSessions([]);
        }
      } else {
        setSessions([]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (status !== "loading") {
      loadSessions();
    }
  }, [status]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm("Are you sure you want to delete this conversation?")) return;

    if (status === "authenticated") {
      const { deleteChatSession } = await import("@/app/actions");
      const res = await deleteChatSession(id);
      if (res.success) {
        setSessions(prev => prev.filter(s => s.id !== id));
        window.dispatchEvent(new CustomEvent("palate-chat-sessions-updated"));
      }
    } else {
      // Guest mode
      const stored = localStorage.getItem("palate_guest_sessions");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter((s: any) => s.id !== id);
          localStorage.setItem("palate_guest_sessions", JSON.stringify(filtered));
          localStorage.removeItem(`palate_guest_messages_${id}`);
          setSessions(prev => prev.filter(s => s.id !== id));
          window.dispatchEvent(new CustomEvent("palate-chat-sessions-updated"));
        } catch (err) {}
      }
    }
  };

  const filteredSessions = sessions.filter(s => 
    (s.title || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto p-6 md:p-12 flex flex-col gap-8 min-h-[80vh] relative overflow-hidden">
      {/* Aurora Radial Orbs for premium aesthetic */}
      <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] md:w-[500px] md:h-[500px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] md:w-[500px] md:h-[500px] rounded-full bg-fuchsia-500/10 blur-[100px] pointer-events-none -z-10" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] m-0 flex items-center gap-3">
            🌿 Conversation Archives
          </h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base">
            Recall and resume your detailed conversations, meal plannings, and zero-waste discussions with Sage.
          </p>
        </div>
        
        <Link 
          href="/ask_sage"
          className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 rounded-xl px-5 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 self-start md:self-auto transition-all shadow-md"
        >
          <Sparkles size={16} /> New Chat
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input 
          type="text" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search archived conversations..."
          className="glass-input pl-12 pr-6 py-3 w-full text-white placeholder-slate-400"
        />
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-white/5 rounded-2xl border border-white/5"></div>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="glass-panel p-16 text-center flex flex-col items-center gap-4 max-w-lg mx-auto mt-12">
          <div className="w-16 h-16 rounded-full glass-icon-wrapper flex items-center justify-center text-2xl">
            💬
          </div>
          <h3 className="text-xl font-bold text-white m-0">No Archives Found</h3>
          <p className="text-slate-400 text-sm max-w-sm m-0 leading-relaxed">
            {search 
              ? "No past conversations match your search query." 
              : "Your culinary intelligence vault is currently empty. Ask Sage a question to generate history!"}
          </p>
          {search && (
            <button 
              onClick={() => setSearch("")}
              className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium text-sm mt-2"
            >
              Clear Search Filter
            </button>
          )}
        </div>
      ) : (
        <motion.div 
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {filteredSessions.map((s) => {
              const formattedDate = new Date(s.createdAt || s.updatedAt || Date.now()).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });
              
              const messageCount = s.messages?.length || 0;

              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="group"
                >
                  <Link 
                    href={`/ask_sage/${s.id}`}
                    className="glass-panel p-6 flex flex-col justify-between h-44 hover:border-white/10 hover:bg-white/[0.04] transition-all relative overflow-hidden flex-1 group shadow-[0_4px_30px_rgba(0,0,0,0.2)] border border-white/5"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all pointer-events-none" />
                    
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-lg font-bold text-white group-hover:text-indigo-200 transition-colors truncate m-0 leading-snug pr-8" title={s.title}>
                          {s.title || "Untitled Conversation"}
                        </h3>
                        <button
                          onClick={(e) => handleDelete(s.id, e)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg absolute top-4 right-4 z-10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Delete history"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 m-0 line-clamp-2 leading-relaxed">
                        {s.messages && s.messages.length > 0 
                          ? s.messages[s.messages.length - 1].content.replace(/<[^>]*>/g, "")
                          : "No messages in this chat session."}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-2">
                      <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> {formattedDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare size={12} /> {messageCount} {messageCount === 1 ? 'turn' : 'turns'}
                        </span>
                      </div>
                      <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 group-hover:text-indigo-400 transition-all" />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
