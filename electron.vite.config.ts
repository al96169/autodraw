import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    build: {
      outDir: resolve('out/renderer'),
      assetsDir: 'assets',
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    },
    plugins: [vue()]
  }
})
