import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { Linter } = require('eslint');
const importPlugin = require('eslint-plugin-import');
const reactPlugin = require('eslint-plugin-react');

function verify(code, filename, rules) {
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

test('website eslint glob options can call minimatch 11', () => {
  const code = "import eslint from 'eslint';\nexport default eslint;\n";
  const rules = {
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['**/tests/**'] }],
  };
  const allowed = verify(code, 'tests/minimatch-eslint.test.mjs', rules);
  const blocked = verify(code, 'scripts/run-vinext.mjs', rules);
  assert.deepEqual(allowed.filter((message) => message.severity === 2), []);
  assert.equal(blocked.some((message) => String(message.message).includes('devDependencies')), true);

  const jsx = verify('export function App() { return <><Foo_Bar /><Bad_Name /></>; }\n', 'scripts/page.jsx', {
    'react/jsx-pascal-case': ['error', { ignore: ['Foo_*'] }],
  });
  const names = jsx.map((message) => message.message);
  assert.equal(names.some((message) => message.includes('Foo_Bar')), false);
  assert.equal(names.some((message) => message.includes('Bad_Name')), true);
});
