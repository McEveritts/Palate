import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { AuthProvider } from "@/components/layout/AuthProvider";

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
      <body className="flex flex-col lg:flex-row h-screen w-screen overflow-hidden bg-slate-950 text-white" suppressHydrationWarning>
        <AuthProvider>
          {/* Aurora Background to highlight Glassmorphism - respects existing glass physics */}
          <div className="fixed -top-[20%] -left-[10%] w-[80vw] h-[60vh] bg-[radial-gradient(ellipse,rgba(99,102,241,0.4)_0%,transparent_60%)] blur-[100px] z-0 pointer-events-none animate-aurora-1 opacity-80"></div>
          <div className="fixed top-[20%] -right-[20%] w-[70vw] h-[80vh] bg-[radial-gradient(ellipse,rgba(217,70,239,0.35)_0%,transparent_60%)] blur-[120px] z-0 pointer-events-none animate-aurora-2 opacity-80"></div>
          <div className="fixed -bottom-[30%] left-[10%] w-[90vw] h-[50vh] bg-[radial-gradient(ellipse,rgba(79,70,229,0.4)_0%,transparent_60%)] blur-[100px] z-0 pointer-events-none animate-aurora-3 opacity-80"></div>
          
          {/* Background Image & Screen-wide Vignette */}
          <div className="fixed inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2500&auto=format&fit=crop')] bg-cover bg-center opacity-5 mix-blend-screen z-0 pointer-events-none"></div>
          <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(2,6,23,0.8)_100%)] z-0 pointer-events-none"></div>

          {/* Left Navigation Sidebar */}
          <Sidebar />

          {/* Middle Content Area (Chatbot) */}
          <main className="flex-1 z-10 p-0 overflow-y-auto relative flex flex-col h-full">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
