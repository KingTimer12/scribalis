import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  // Vitest runs Vite in "serve" mode too, so vite-plugin-solid would otherwise
  // inject the solid-refresh HMR runtime into .tsx test suites, which fails to
  // resolve outside a real dev server. Disable HMR only under vitest.
  plugins: [solid({ hot: !process.env.VITEST }), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
