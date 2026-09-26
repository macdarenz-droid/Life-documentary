import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const sharedRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  'no-console': ['error', { allow: ['warn', 'error'] }],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/.expo',
      '**/node_modules',
      '**/out',
      '**/.wrangler',
      'apps/api/worker-configuration.d.ts',
      'apps/mobile/android',
      'apps/mobile/ios',
    ],
  },
  js.configs.recommended,
  {
    files: ['packages/**/*.{ts,tsx}', 'apps/api/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    rules: sharedRules,
  },
  prettier,
);
