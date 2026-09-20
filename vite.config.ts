import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", ".nojekyll"],
      manifest: {
        name: "Scripture Outliner",
        short_name: "Outliner",
        description:
          "Hand-outline scripture passages with word-level selection.",
        theme_color: "#3d4a3a",
        background_color: "#f4efe4",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
