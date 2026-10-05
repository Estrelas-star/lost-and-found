import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://111.229.234.32:8080',
        changeOrigin: true
      },
      // 描述/物品图片经 /uploads 保存为相对路径，dev 下需同样代理到后端，否则本地看不到图
      '/uploads': {
        target: 'http://111.229.234.32:8080',
        changeOrigin: true
      }
    }
  }
})
