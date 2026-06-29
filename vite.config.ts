import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Il base path deve corrispondere al nome della tua repository GitHub
  // per permettere il caricamento corretto di JS e CSS in produzione.
  base: mode === 'production' ? '/site-ignite-seed/' : '/',
  
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Genera file con nomi puliti per evitare conflitti di cache
    assetsDir: "assets",
    sourcemap: false,
  }
}));
