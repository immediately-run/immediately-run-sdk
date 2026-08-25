import type {Config} from '@jest/types';
// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  // The safe-content/ sub-package carries its own vitest suite (R3-279); jest's
  // CJS pipeline must not pick it up.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/safe-content/'],
  transform: {
  '^.+\\.tsx?$': 'ts-jest',
  }
};
export default config;
