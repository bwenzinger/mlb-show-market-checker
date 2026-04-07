import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const showApiProxy = {
  target: "https://mlb26.theshow.com",
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/show-api/, "/apis"),
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/show-api": showApiProxy,
    },
  },
  preview: {
    proxy: {
      "/show-api": showApiProxy,
    },
  },
});
