import { defaultCache } from "@serwist/next/worker";
import type { SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, NetworkFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {}
}

const serwist = new Serwist({
  precacheEntries: (self as any).__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    // 1. Strict NetworkOnly for chat/Sage AI dynamic routes to prevent stale AI contexts
    {
      matcher: ({ url }) => 
        url.pathname.startsWith("/api/ask_sage") || 
        url.pathname.startsWith("/api/chat") ||
        url.pathname.startsWith("/api/sage") ||
        url.pathname.startsWith("/api/curate"),
      handler: new NetworkOnly(),
    },
    // 2. Next.js App Router Page Navigations / standard page requests
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [
          {
            // Fallback to offline.html if network and cache fail
            handlerDidError: async () => {
              return (await caches.match("/offline.html")) || Response.error();
            }
          }
        ]
      }),
    },
    // 3. Fallback to Serwist default caches for other assets (CSS, JS, static files)
    ...defaultCache,
  ],
});

serwist.addEventListeners();
