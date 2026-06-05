import { defaultCache } from "@serwist/next/worker";
import type { SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, NetworkFirst } from "serwist";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface WorkerGlobalScope extends SerwistGlobalConfig {}
}

const manifest = (self as unknown as { __SW_MANIFEST: Array<{ url: string; revision: string | null }> }).__SW_MANIFEST;

const serwist = new Serwist({
  precacheEntries: manifest,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
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
        networkTimeoutSeconds: 5,
        plugins: [
          {
            // Fallback to precached offline.html if both network and cache miss
            handlerDidError: async () => {
              const offlineResponse = await serwist.matchPrecache("/offline.html");
              return offlineResponse || Response.error();
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
