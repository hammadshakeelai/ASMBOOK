import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});