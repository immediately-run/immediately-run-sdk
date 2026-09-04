import { checkUntested } from '@immediately-run/verify-checks/untested';

await checkUntested({
  base: 'origin/main',
  logicPaths: { include: ['src/**'], exclude: ['src/index.ts'] },
});
