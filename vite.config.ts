import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/loversintune/',
  plugins: [react()],
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
