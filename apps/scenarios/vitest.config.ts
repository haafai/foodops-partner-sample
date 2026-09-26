import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { name: 'scenarios', environment: 'node', testTimeout: 20_000 } });
