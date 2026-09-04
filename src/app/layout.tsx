import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { PWARegistration } from "@/components/pwa/PWARegistration";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Palate - Your AI Sous-Chef",
  description: "Local-first AI recipe engine powered by Sage",
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Palate',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="fixed inset-0 bg-slate-950 text-white overflow-hidden flex flex-col md:flex-row" suppressHydrationWarning>
        <AuthProvider>
          {/* PWA Updates and Install Banners */}
          <PWARegistration />

          {/* Aurora Background to highlight Glassmorphism - respects existing glass physics */}
          <div className="fixed -top-[20%] -left-[10%] w-[80vw] h-[60vh] bg-[radial-gradient(ellipse,rgba(99,102,241,0.4)_0%,transparent_60%)] blur-[100px] z-0 pointer-events-none animate-aurora-1 opacity-80"></div>
          <div className="fixed top-[20%] -right-[20%] w-[70vw] h-[80vh] bg-[radial-gradient(ellipse,rgba(217,70,239,0.35)_0%,transparent_60%)] blur-[120px] z-0 pointer-events-none animate-aurora-2 opacity-80"></div>
          <div className="fixed -bottom-[30%] left-[10%] w-[90vw] h-[50vh] bg-[radial-gradient(ellipse,rgba(79,70,229,0.4)_0%,transparent_60%)] blur-[100px] z-0 pointer-events-none animate-aurora-3 opacity-80"></div>
          
          {/* Background Texture & Screen-wide Vignette */}
          <div className="fixed inset-0 opacity-[0.03] mix-blend-screen z-0 pointer-events-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "200px 200px" }}></div>
          <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(2,6,23,0.8)_100%)] z-0 pointer-events-none"></div>

          {/* Left Navigation Shell (Mobile Header, Tablet Rail, Desktop Sidebar) */}
          <Sidebar />

          {/* Primary Application Workspace */}
          <main id="palate-main-content" className="flex-1 min-w-0 min-h-0 md:h-full overflow-y-auto overflow-x-hidden flex flex-col z-10 relative pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
            {children}
          </main>

          {/* Mobile Bottom Navigation (< 768px) */}
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}

