/* global module, require */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // @noble/hashes ships ESM only; let babel transform it like the Expo packages.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('(?!(.pnpm|', '(?!(.pnpm|@noble|'),
  ),
  // e2e/ holds Playwright specs, run by `playwright test`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
};
