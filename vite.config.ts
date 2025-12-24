import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Base is set for GitHub Pages deployment
export default defineConfig({
  base: '/FlightTools/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
