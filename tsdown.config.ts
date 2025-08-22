import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  target: 'node24',
  skipNodeModulesBundle: true,
  sourcemap: true,
  unbundle: true,
})
