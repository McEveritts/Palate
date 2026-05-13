import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, BrainCircuit, LibraryBig, UploadCloud, Dumbbell, Zap, Leaf, Droplets, Settings } from "lucide-react";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Palate - Your AI Sous-Chef",
  description: "Local-first AI recipe engine powered by Sage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="flex h-screen w-screen overflow-hidden bg-slate-950 text-white" suppressHydrationWarning>
        {/* Aurora Background to highlight Glassmorphism - respects existing glass physics */}
        <div className="fixed -top-[20%] -left-[10%] w-[80vw] h-[60vh] bg-[radial-gradient(ellipse,rgba(99,102,241,0.4)_0%,transparent_60%)] blur-[100px] z-0 pointer-events-none animate-aurora-1 opacity-80"></div>
        <div className="fixed top-[20%] -right-[20%] w-[70vw] h-[80vh] bg-[radial-gradient(ellipse,rgba(217,70,239,0.35)_0%,transparent_60%)] blur-[120px] z-0 pointer-events-none animate-aurora-2 opacity-80"></div>
        <div className="fixed -bottom-[30%] left-[10%] w-[90vw] h-[50vh] bg-[radial-gradient(ellipse,rgba(79,70,229,0.4)_0%,transparent_60%)] blur-[100px] z-0 pointer-events-none animate-aurora-3 opacity-80"></div>
        
        {/* Background Image & Screen-wide Vignette */}
        <div className="fixed inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2500&auto=format&fit=crop')] bg-cover bg-center opacity-5 mix-blend-screen z-0 pointer-events-none"></div>
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(2,6,23,0.8)_100%)] z-0 pointer-events-none"></div>

        {/* Left Navigation Sidebar */}
        <aside className="w-72 flex flex-col z-10 p-6 glass-panel border-y-0 border-l-0 rounded-none border-r border-white/5 relative">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-9 h-9 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]">
              <Image src="/assets/logos/palate-logo.svg" alt="Palate Logo" width={36} height={36} suppressHydrationWarning />
            </div>
            <div className="text-2xl font-bold tracking-tight text-white">Palate</div>
          </div>

          <div className="mb-8">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Intelligence</div>
            <nav className="flex flex-col gap-1">
              <Link href="/" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-white font-medium bg-gradient-to-r from-indigo-500/15 to-indigo-500/5 border border-indigo-500/20 border-l-[3px] border-l-indigo-400">
                <Sparkles size={18} suppressHydrationWarning /> Ask Sage
              </Link>
              <Link href="/plans" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <BrainCircuit size={18} suppressHydrationWarning /> <span className="font-bold">Currated By Sage</span>
              </Link>
              <Link href="/vault" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <LibraryBig size={18} suppressHydrationWarning /> Vault
              </Link>
              <Link href="/upload" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <UploadCloud size={18} suppressHydrationWarning /> Upload Recipes
              </Link>
            </nav>
          </div>

          <div className="mb-8">
            <div className="text-[0.7rem] font-bold uppercase tracking-widest text-slate-400 mb-3 pl-3">Smart Collections</div>
            <nav className="flex flex-col gap-1">
              <Link href="/collections/macros" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <Dumbbell size={18} suppressHydrationWarning /> Macro-Optimized
              </Link>
              <Link href="/collections/flash" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <Zap size={18} suppressHydrationWarning /> Flash Synthesize
              </Link>
              <Link href="/collections/zero-waste" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <Leaf size={18} suppressHydrationWarning /> Zero-Waste
              </Link>
              <Link href="/collections/flavor" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <Droplets size={18} suppressHydrationWarning /> Flavor Profiles
              </Link>
            </nav>
          </div>

          <div className="flex-grow"></div>

          <div className="mt-auto">
            <nav className="flex flex-col gap-1">
              <Link href="/settings" className="px-3 py-2.5 rounded-lg flex items-center gap-3 text-slate-200 hover:bg-white/5 hover:text-white transition-colors border border-transparent">
                <Settings size={18} suppressHydrationWarning /> Settings
              </Link>
            </nav>
          </div>
        </aside>

        {/* Middle Content Area (Chatbot) */}
        <main className="flex-1 z-10 p-0 overflow-y-auto relative flex flex-col h-full">
          {children}
        </main>
      </body>
    </html>
  );
}
