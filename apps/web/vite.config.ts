import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// 后端地址与前端端口均可用环境变量覆盖，默认后端 8790 / 前端 5173。
const backendPort = process.env.BACKEND_PORT ?? '8790';
const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: webPort,
    proxy: {
      '/api': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/ws': { target: `ws://127.0.0.1:${backendPort}`, ws: true },
    },
  },
});
