import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Forza il base path corretto per GitHub Pages. 
  // Usa '/' se hai un dominio custom, altrimenti il nome della repo.
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
    // Assicura che la build sia pulita per il deploy
    outDir: "dist",
    emptyOutDir: true,
  }
}));
