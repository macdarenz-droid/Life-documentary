/* global module */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // e2e/ holds Playwright specs, run by `playwright test`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
};
