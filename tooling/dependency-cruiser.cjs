// Import boundaries from CLAUDE.md rules 4, 5 and 7 and ARCHITECTURE §2. Run with `pnpm boundaries`.
// A package's own files, not its nested node_modules.
const own = (pkg) => `^packages/${pkg}/(?!node_modules/)`;
const ZOD = '(^|/)node_modules/zod/';
const TEST_FILES = '(^|/)(test|__tests__)/|\\.test\\.[cm]?[jt]sx?$';

module.exports = {
  forbidden: [
    {
      name: 'contracts-only-zod',
      comment: 'packages/contracts may import only zod (CLAUDE.md rule 3).',
      severity: 'error',
      from: { path: '^packages/contracts/', pathNot: TEST_FILES },
      to: { pathNot: `${own('contracts')}|${ZOD}` },
    },
    {
      name: 'story-only-contracts',
      comment: 'packages/story may import only packages/contracts and zod (CLAUDE.md rule 4).',
      severity: 'error',
      from: { path: '^packages/story/', pathNot: TEST_FILES },
      to: { pathNot: `${own('story')}|${own('contracts')}|${ZOD}` },
    },
    {
      name: 'design-self-contained',
      comment: 'packages/design imports nothing outside itself.',
      severity: 'error',
      from: { path: '^packages/design/', pathNot: TEST_FILES },
      to: { pathNot: own('design') },
    },
    {
      name: 'packages-not-apps',
      comment: 'Shared packages never import an app.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'features-not-data-or-services',
      comment: 'Mobile features never import data/ or services/ (CLAUDE.md rule 5).',
      severity: 'error',
      from: { path: '^apps/mobile/src/features/' },
      to: { path: '^apps/mobile/src/(data|services)/' },
    },
    {
      name: 'nothing-imports-routes',
      comment: 'Nothing imports the expo-router routes folder apps/mobile/app (CLAUDE.md rule 5).',
      severity: 'error',
      from: {},
      to: { path: '^apps/mobile/app/' },
    },
    {
      name: 'sqlite-only-in-data',
      comment: 'Only apps/mobile/src/data imports the SQLite driver (CLAUDE.md rule 5).',
      severity: 'error',
      from: { path: '^apps/mobile/', pathNot: '^apps/mobile/src/data/' },
      to: { path: '(^|/)(expo-sqlite|drizzle-orm|better-sqlite3)(/|$)' },
    },
    {
      name: 'vendor-sdks-only-in-providers',
      comment: 'Only apps/api/src/providers imports vendor SDKs (CLAUDE.md rule 5).',
      severity: 'error',
      from: { path: '^apps/api/src/', pathNot: '^apps/api/src/providers/' },
      to: {
        path: '(^|/)(@anthropic-ai/sdk|elevenlabs|@elevenlabs/[^/]+|@remotion/lambda|aws4fetch|openai)(/|$)',
      },
    },
    {
      name: 'no-biometrics',
      comment: 'No face or voice biometrics anywhere (CLAUDE.md rule 7).',
      severity: 'error',
      from: {},
      to: {
        path: 'face-api|@vladmandic/face|face-detector|expo-face-detector|react-native-vision-camera-face|@mediapipe/tasks-vision|mlkit.*face|face-recognition|voiceprint|speaker-id|pyannote',
      },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(apps|packages)/[^/]+/(dist|\\.expo|\\.wrangler|out|coverage)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types', 'react-native'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
