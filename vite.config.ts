import { defineConfig } from "vite";

// @ts-expect-error process is a Node.js global in the Vite config runtime
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: "desktop",
  build: {
    outDir: "../dist-desktop",
    emptyOutDir: true,
  },
  clearScreen: false,
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
      ignored: ["**/src-tauri/**"],
    },
  },
});
