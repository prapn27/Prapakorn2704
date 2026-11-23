import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/Prapakorn2704/").
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'สลิปบัญชี — รายรับรายจ่าย',
        short_name: 'สลิปบัญชี',
        description: 'บันทึกรายรับรายจ่าย นำเข้าจากสลิปโอนเงิน ซิงก์ทุกเครื่อง',
        lang: 'th',
        theme_color: '#0f766e',
        background_color: '#f6f7f5',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ไฟล์ OCR ใหญ่ — ไม่ precache แต่แคชตอนใช้งานครั้งแรก (ดู runtimeCaching)
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          {
            // Tesseract worker, wasm core และข้อมูลภาษาไทย/อังกฤษ (โฮสต์กับตัวแอพเอง)
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          charts: ['chart.js', 'react-chartjs-2'],
          ocr: ['tesseract.js', 'jsqr']
        }
      }
    }
  },
} as any);
