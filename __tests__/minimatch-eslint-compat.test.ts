/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequire } = require('node:module');
const { join } = require('node:path');

const root = process.cwd();
const rootRequire = createRequire(join(root, 'package.json'));
const { Linter } = rootRequire('eslint');
const importPlugin = rootRequire('eslint-plugin-import');
const reactPlugin = rootRequire('eslint-plugin-react');

function verify(code: string, filename: string, rules: Record<string, unknown>) {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(code, [
    {
      files: ['**/*.{ts,tsx,jsx,mjs}'],
      plugins: { import: importPlugin, react: reactPlugin },
      settings: { react: { version: '19.0' } },
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      rules,
    },
  ], { filename });
}

test('import/no-extraneous-dependencies accepts a devDependency glob', () => {
  const code = "import eslint from 'eslint';\nexport default eslint;\n";
  const rules = {
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['**/__tests__/**'] }],
  };
  const inTest = verify(code, '__tests__/minimatch-eslint-compat.test.ts', rules);
  const inSource = verify(code, 'src/lib/text.ts', rules);
  expect(inTest.map((message: { message: string }) => message.message)).toEqual([]);
  expect(inSource.some((message: { message: string }) => message.message.includes('devDependencies'))).toBe(true);
});

test('react/jsx-pascal-case ignore globs call minimatch', () => {
  const code = 'export function App() { return <><Foo_Bar /><Bad_Name /></>; }\n';
  const messages = verify(code, 'src/component.jsx', {
    'react/jsx-pascal-case': ['error', { ignore: ['Foo_*'] }],
  });
  const names = messages.map((message: { message: string }) => message.message);
  expect(names.some((message: string) => message.includes('Foo_Bar'))).toBe(false);
  expect(names.some((message: string) => message.includes('Bad_Name'))).toBe(true);
});
