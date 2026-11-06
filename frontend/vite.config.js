import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Carta digital',
          short_name: 'Carta',
          description: 'Carta digital con realidad aumentada',
          lang: 'es-AR',
          theme_color: '#a73400',
          background_color: '#fff8f4',
          display: 'standalone',
          start_url: '/',
          icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        workbox: {
          // Precarga solo el núcleo de la carta: el panel del staff y el visor 3D se descargan a demanda.
          globPatterns: ['index.html', 'assets/index-*.{js,css}', 'assets/*.woff2', 'favicon.svg'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.endsWith('/api/public/menu'),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'menu-api', expiration: { maxEntries: 2, maxAgeSeconds: 86400 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.includes('/uploads/images/'),
              handler: 'CacheFirst',
              options: { cacheName: 'menu-images', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86400 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.includes('/uploads/models/'),
              handler: 'CacheFirst',
              options: { cacheName: 'menu-models', expiration: { maxEntries: 40, maxAgeSeconds: 30 * 86400 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: { cacheName: 'app-chunks', expiration: { maxEntries: 80, maxAgeSeconds: 30 * 86400 } },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        '/api': { target: env.VITE_DEV_BACKEND, changeOrigin: true },
        '/uploads': { target: env.VITE_DEV_BACKEND, changeOrigin: true },
      },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1200,
    },
  };
});
