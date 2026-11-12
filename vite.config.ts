/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages では https://<user>.github.io/<repo>/ 配下で配信されるため、
// ビルド時に BASE_PATH=/<repo>/ を渡す（Actions で自動設定）。
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Datum — 逆算型ダイエットコーチ',
        short_name: 'Datum',
        description: 'ゴールから逆算して、毎日の記録で伴走するダイエットアプリ',
        lang: 'ja',
        theme_color: '#2E5244',
        background_color: '#F1F3F1',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
