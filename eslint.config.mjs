import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [ 'dist', 'coverage', '.angular', 'e2e/playwright-report', 'e2e/test-results', 'src/app/lifted', 'tools/oracle/work', '**/*.js', '**/*.mjs', '**/*.mts' ],
  },
  {
    files: [ '**/*.ts' ],
    extends: [ ...tseslint.configs.recommended, ...angular.configs.tsRecommended ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: [ './tsconfig.eslint.json' ],
      },
    },
    rules: {
      '@angular-eslint/prefer-inject': 'off',
      '@angular-eslint/prefer-on-push-component-change-detection': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
          overrides: {
            accessors: 'explicit',
            constructors: 'no-public',
            methods: 'explicit',
            properties: 'explicit',
            parameterProperties: 'explicit',
          },
        },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/prefer-as-const': 'off',
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-unused-expressions': 'error',
      '@angular-eslint/sort-lifecycle-methods': 'warn',
      '@angular-eslint/component-class-suffix': 'error',
      '@angular-eslint/directive-class-suffix': 'error',
      '@angular-eslint/no-lifecycle-call': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/no-pipe-impure': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/prefer-signals': [
        'error',
        {
          preferInputSignals: true,
          preferQuerySignals: true,
          preferReadonlySignalProperties: false,
        },
      ],
      '@angular-eslint/relative-url-prefix': 'warn',
      '@angular-eslint/use-component-view-encapsulation': 'warn',
      '@angular-eslint/use-injectable-provided-in': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/use-pipe-transform-interface': 'error',
      '@angular-eslint/contextual-lifecycle': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@angular-eslint/directive-selector': 'off',
      '@angular-eslint/component-selector': 'off',
    },
  },
  {
    files: [ '**/*.html' ],
    extends: [ ...angular.configs.templateRecommended, ...angular.configs.templateAccessibility ],
    rules: {
      '@angular-eslint/template/interactive-supports-focus': 'warn',
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/eqeqeq': 'off',
    },
  },
);
