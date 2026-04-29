import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('module');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(repoRoot, 'src');

function installTsLoader() {
  const previousTsLoader = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;

  Module._extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };

  Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
    if (request.startsWith('@/')) {
      const rel = request.slice(2);
      const candidates = [
        path.join(srcRoot, rel),
        path.join(srcRoot, rel + '.ts'),
        path.join(srcRoot, rel + '.tsx'),
        path.join(srcRoot, rel, 'index.ts'),
      ];
      for (const candidate of candidates) {
        try {
          return previousResolve.call(this, candidate, parent, ...rest);
        } catch {
          // try next
        }
      }
    }
    return previousResolve.call(this, request, parent, ...rest);
  };

  for (const cached of Object.keys(require.cache)) {
    if (cached.startsWith(srcRoot)) {
      delete require.cache[cached];
    }
  }

  return () => {
    if (previousTsLoader) {
      Module._extensions['.ts'] = previousTsLoader;
    } else {
      delete Module._extensions['.ts'];
    }
    Module._resolveFilename = previousResolve;
  };
}

test('country helpers expose the full ISO list and normalize legacy inputs', () => {
  const restore = installTsLoader();
  try {
    const { COUNTRY_OPTIONS, countryCodeFromInput, countryNameFromCode } = require(
      path.join(srcRoot, 'lib/frontend/countries.ts'),
    );

    assert.equal(COUNTRY_OPTIONS.length, 249);
    assert.deepEqual(COUNTRY_OPTIONS[0], { code: 'AF', name: 'Afghanistan' });
    assert.deepEqual(COUNTRY_OPTIONS[COUNTRY_OPTIONS.length - 1], { code: 'ZW', name: 'Zimbabwe' });

    const names = COUNTRY_OPTIONS.map((country) => country.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));

    assert.equal(countryNameFromCode('mx'), 'Mexico');
    assert.equal(countryCodeFromInput('Mexico'), 'MX');
    assert.equal(countryCodeFromInput('mexico'), 'MX');
    assert.equal(countryCodeFromInput('MX'), 'MX');
    assert.equal(countryCodeFromInput('not-a-country'), null);
  } finally {
    restore();
  }
});

test('ProfileInputSchema only accepts canonical alpha-2 country codes', () => {
  const restore = installTsLoader();
  try {
    const { ProfileInputSchema } = require(path.join(srcRoot, 'lib/kolk/types/index.ts'));

    const parsed = ProfileInputSchema.parse({ country: 'gb' });
    assert.equal(parsed.country, 'GB');

    assert.throws(() => ProfileInputSchema.parse({ country: 'United Kingdom' }), /ISO 3166-1 alpha-2/);
  } finally {
    restore();
  }
});
