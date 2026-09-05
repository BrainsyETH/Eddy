import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // React 19's compiler-oriented rules surface useful modernization work,
    // but enabling them as blocking errors would turn this security upgrade
    // into an unrelated rewrite of dozens of stable effects. Keep the existing
    // lint baseline and address these rules incrementally in focused changes.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    // Motion goes through the tokens. globals.css defines --duration-* and
    // --ease-*; Tailwind exposes them as duration-fast|normal|slow|slower and
    // ease|ease-out|ease-out-expo|ease-bounce; a style object reaches them
    // as var(--…). A raw `duration-200` or an inline cubic-bezier is one more
    // timing that matches nothing else on the page — before this rule the
    // site had five durations and four curves in components and zero token
    // uses outside globals.css. The primitives in src/components/ui carry the
    // right values already; reach for one of those first.
    files: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\bduration-\\d+\\b/]',
          message:
            'Raw duration class. Use a motion token: duration-fast|normal|slow|slower (see globals.css --duration-*).',
        },
        {
          selector: 'TemplateElement[value.raw=/\\bduration-\\d+\\b/]',
          message:
            'Raw duration class. Use a motion token: duration-fast|normal|slow|slower (see globals.css --duration-*).',
        },
        {
          selector: 'Literal[value=/cubic-bezier\\(/]',
          message:
            'Inline easing curve. Use an easing token: var(--ease-default|out|out-expo|bounce) or the ease-* utilities.',
        },
        {
          selector: 'TemplateElement[value.raw=/cubic-bezier\\(/]',
          message:
            'Inline easing curve. Use an easing token: var(--ease-default|out|out-expo|bounce) or the ease-* utilities.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'remotion/**',
    'scripts/**',
  ]),
]);
