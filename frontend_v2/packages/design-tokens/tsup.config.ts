import type { Options } from 'tsup';

const config: Options = {
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
};

export default config;
