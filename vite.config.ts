import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const BASE = '/trainright-health/'

/**
 * A build stamp baked in at compile time, shown in the app header. PWAs cache
 * aggressively — especially the iOS home-screen one — so without this there is
 * no way to tell at a glance whether a device is running the latest deploy.
 * Falls back to the timestamp alone if git isn't available (it isn't, inside
 * some CI images).
 */
const buildStamp = (): string => {
  const when = new Date().toISOString().slice(5, 16).replace('T', ' ')
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return `${when} · ${sha}`
  } catch {
    return when
  }
}

export default defineConfig({
  base: BASE,
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest is served as a static file from public/manifest.webmanifest
      // with the correct GitHub Pages start_url and scope.
      // VitePWA auto-manifest generation is disabled to avoid it injecting
      // a conflicting manifest with start_url: "/" into the HTML.
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // Split heavy vendors so the main app shell stays small (<300 kB) and
    // chart code is only loaded when the user opens the Stats tab.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'date-vendor': ['date-fns'],
          'icons': ['lucide-react'],
        },
      },
    },
  },
})
