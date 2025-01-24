import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // 是否添加node全局变量
      globals: {
        process: true,
      },
      // 是否添加node内置模块polyfill
      protocolImports: true,
    }),
  ],
})
