import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const showApiProxy = {
  target: "https://mlb26.theshow.com",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/show-api/, "/apis"),
};

const historyApiProxy = {
  target: "http://127.0.0.1:4000",
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/history-api/, "/api"),
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/show-api": showApiProxy,
      "/history-api": historyApiProxy,
    },
  },
  preview: {
    proxy: {
      "/show-api": showApiProxy,
      "/history-api": historyApiProxy,
    },
  },
});
