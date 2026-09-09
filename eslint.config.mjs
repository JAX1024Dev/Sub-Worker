import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/', 'dist/', 'node_modules/', 'worker-configuration.d.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['scripts/**/*.ts', 'src/**/*.ts', 'test/**/*.ts', 'vitest*.config.ts'],
  })),
  {
    files: ['scripts/**/*.ts', 'src/**/*.ts', 'test/**/*.ts', 'vitest*.config.ts'],
    languageOptions: {
      globals: globals.worker,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['*.config.mjs', 'scripts/**/*.{mjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  eslintConfigPrettier,
);
