import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers', '@ricky0123/vad-web'],
  },
  worker: {
    format: 'es',
  },
})
