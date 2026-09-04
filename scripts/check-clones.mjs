import { checkClones } from '@immediately-run/verify-checks/clones';

await checkClones({
  patterns: ['src/**/*.{ts,tsx}'],
  ignore: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
  baselinePath: 'verify-baselines/clones.json',
});
