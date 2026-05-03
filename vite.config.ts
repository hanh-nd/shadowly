import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@huggingface/transformers', '@ricky0123/vad-web'],
  },
  worker: {
    format: 'es',
  },
});
