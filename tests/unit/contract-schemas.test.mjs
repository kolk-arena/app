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

function loadTsModules() {
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
          // try next candidate
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

test('every published contract schema slug has a Zod schema', () => {
  const restore = loadTsModules();
  try {
    const { listContractSchemaSlugs, getContractSchema } = require(
      path.join(srcRoot, 'lib/kolk/schemas/index.ts'),
    );
    const slugs = listContractSchemaSlugs();
    assert.deepEqual(
      slugs.sort(),
      [
        'agent-context.v2',
        'automation-manifest.v1',
        'catalog.v1',
        'quota.v1',
        'submit-result.v2',
      ].sort(),
      'contract schema slug registry must match the documented public surfaces',
    );
    for (const slug of slugs) {
      const schema = getContractSchema(slug);
      assert.ok(schema, `slug ${slug} must resolve to a Zod schema`);
      assert.equal(typeof schema.parse, 'function', `slug ${slug} must expose .parse()`);
    }
  } finally {
    restore();
  }
});

test('Zod schemas serialize to Draft 2020-12 JSON Schema with stable shape', () => {
  const restore = loadTsModules();
  try {
    const { listContractSchemaSlugs, getContractSchema } = require(
      path.join(srcRoot, 'lib/kolk/schemas/index.ts'),
    );
    const { z } = require('zod');

    for (const slug of listContractSchemaSlugs()) {
      const schema = getContractSchema(slug);
      const json = z.toJSONSchema(schema, { target: 'draft-2020-12' });
      assert.equal(
        json.$schema,
        'https://json-schema.org/draft/2020-12/schema',
        `${slug} must declare Draft 2020-12 $schema`,
      );
      assert.ok(json.properties, `${slug} must serialize to an object schema with properties`);
      // Every contract surface MUST publish a schemaVersion property so
      // agents can confirm which version they are validating against.
      assert.ok(
        json.properties.schemaVersion,
        `${slug} JSON Schema must include the schemaVersion property`,
      );
    }
  } finally {
    restore();
  }
});

test('built automation manifest validates against AutomationManifestSchema', () => {
  const restore = loadTsModules();
  try {
    const { buildAutomationManifest } = require(
      path.join(srcRoot, 'lib/kolk/agentic-url/automation-manifest.ts'),
    );
    const { AutomationManifestSchema } = require(
      path.join(srcRoot, 'lib/kolk/schemas/index.ts'),
    );

    const manifest = buildAutomationManifest();
    const result = AutomationManifestSchema.safeParse(manifest);
    if (!result.success) {
      assert.fail(
        `Built manifest failed AutomationManifestSchema:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
  } finally {
    restore();
  }
});

test('manifest exposes every served schema URL via manifest.schemas', () => {
  const restore = loadTsModules();
  try {
    const { buildAutomationManifest } = require(
      path.join(srcRoot, 'lib/kolk/agentic-url/automation-manifest.ts'),
    );
    const { listContractSchemaSlugs } = require(
      path.join(srcRoot, 'lib/kolk/schemas/index.ts'),
    );
    const { APP_CONFIG } = require(path.join(srcRoot, 'lib/frontend/app-config.ts'));

    const manifest = buildAutomationManifest();
    const expected = {
      manifest: `${APP_CONFIG.canonicalOrigin}/api/schema/automation-manifest.v1`,
      agentContext: `${APP_CONFIG.canonicalOrigin}/api/schema/agent-context.v2`,
      submitResult: `${APP_CONFIG.canonicalOrigin}/api/schema/submit-result.v2`,
      catalog: `${APP_CONFIG.canonicalOrigin}/api/schema/catalog.v1`,
      quota: `${APP_CONFIG.canonicalOrigin}/api/schema/quota.v1`,
    };
    assert.deepEqual(manifest.schemas, expected);

    // Every key in compatibleSchemas must have a matching JSON Schema URL.
    const keysFromCompatible = Object.keys(manifest.compatibleSchemas).sort();
    const keysFromSchemas = Object.keys(manifest.schemas).sort();
    assert.deepEqual(
      keysFromCompatible,
      keysFromSchemas,
      'compatibleSchemas and schemas must enumerate the same surfaces',
    );

    // Every served slug must be mirrored as a manifest.schemas URL.
    for (const slug of listContractSchemaSlugs()) {
      const found = Object.values(manifest.schemas).some((url) => url.endsWith(`/api/schema/${slug}`));
      assert.ok(found, `manifest.schemas must include a URL for ${slug}`);
    }
  } finally {
    restore();
  }
});

test('built challenge catalog validates against CatalogResponseSchema', () => {
  const restore = loadTsModules();
  try {
    const { LEVEL_DEFINITIONS } = require(path.join(srcRoot, 'lib/kolk/levels/index.ts'));
    const { getAgentLevelContract, getAgentCompletionContract } = require(
      path.join(srcRoot, 'lib/kolk/agent-contract.ts'),
    );
    const beta = require(path.join(srcRoot, 'lib/kolk/beta-contract.ts'));
    const { APP_CONFIG } = require(path.join(srcRoot, 'lib/frontend/app-config.ts'));
    const { CatalogResponseSchema } = require(path.join(srcRoot, 'lib/kolk/schemas/index.ts'));

    // Mirror the catalog route's level transform without booting Next.
    const levels = LEVEL_DEFINITIONS.map((definition) => {
      const level = definition.level;
      const requiresAuth = level > beta.ANONYMOUS_BETA_MAX_LEVEL;
      const agentContract = getAgentLevelContract(level);
      const sampleSuccessUrl = agentContract?.sampleSuccessPath
        ? `${APP_CONFIG.canonicalOrigin}${agentContract.sampleSuccessPath}`
        : null;
      return {
        level,
        name: definition.name,
        family: definition.family,
        band: definition.band,
        isBoss: definition.isBoss,
        bossSpecial: definition.bossSpecial ?? null,
        legacyPassThreshold: definition.passThreshold,
        timeLimitMinutes: definition.timeLimitMinutes,
        suggestedTimeMinutes: beta.getSuggestedTimeMinutes(level),
        coverageTargets: definition.coverageTargets,
        outputContract: agentContract?.outputContract ?? null,
        deterministicChecks: agentContract?.deterministicChecks ?? definition.layer1Checks,
        factSourceKeys: agentContract?.factSourceKeys ?? null,
        commonFailureModes: agentContract?.commonFailureModes ?? [],
        sampleSuccessUrl,
        catalogScope: 'level_family_static',
        variantsMayDifferBySeed: true,
        liveFetchContractPath: '$.agentContext',
        aiJudged: beta.isAiJudgedLevel(level),
        leaderboardEligible: beta.isRankedBetaLevel(level),
        requiresAuth,
        identityMode: requiresAuth ? 'bearer_token' : 'browser_session_cookie',
      };
    });

    const catalogPayload = {
      schemaVersion: 'kolk-catalog.v1',
      publicBeta: {
        minLevel: beta.PUBLIC_BETA_MIN_LEVEL,
        maxLevel: beta.PUBLIC_BETA_MAX_LEVEL,
        rankedMinLevel: beta.RANKED_BETA_MIN_LEVEL,
        rankedMaxLevel: beta.RANKED_BETA_MAX_LEVEL,
        anonymousMaxLevel: beta.ANONYMOUS_BETA_MAX_LEVEL,
        authRequiredFromLevel: beta.ANONYMOUS_BETA_MAX_LEVEL + 1,
      },
      completionContract: getAgentCompletionContract(),
      catalogScope: 'level_family_static',
      variantsMayDifferBySeed: true,
      liveContractPath: '$.agentContext',
      levels,
    };

    const result = CatalogResponseSchema.safeParse(catalogPayload);
    if (!result.success) {
      assert.fail(
        `Catalog payload failed CatalogResponseSchema:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
  } finally {
    restore();
  }
});

test('built agent context validates with live effective contract fields', () => {
  const restore = loadTsModules();
  try {
    const { getLevel } = require(path.join(srcRoot, 'lib/kolk/levels/index.ts'));
    const { getAgentCompletionContract, getAgentLevelContract } = require(
      path.join(srcRoot, 'lib/kolk/agent-contract.ts'),
    );
    const {
      AgentContextSchema,
    } = require(path.join(srcRoot, 'lib/kolk/schemas/index.ts'));
    const {
      buildEffectiveAgentContract,
      getFactSourceKeysForLevel,
    } = require(path.join(srcRoot, 'lib/kolk/effective-contract.ts'));

    const level = 4;
    const levelDef = getLevel(level);
    const agentContract = getAgentLevelContract(level);
    const structuredBrief = {
      trip_days: 3,
      budget_total: 1200,
      constraints: ['Stay near Centro Histórico'],
      key_facts: ['Budget is 1200 MXN'],
    };
    const factSourceKeys = getFactSourceKeysForLevel(level);
    const effectiveContract = buildEffectiveAgentContract({
      level,
      outputKind: levelDef.family,
      outputContract: agentContract.outputContract,
      layer1Checks: levelDef.layer1Checks,
      structuredBrief,
      factSourceKeys,
      variantFamily: 'itinerary_seed',
    });

    const payload = {
      schemaVersion: 'kolk-agent-context.v2',
      level,
      levelName: levelDef.name,
      outputKind: levelDef.family,
      sourceLanguage: null,
      targetLanguage: null,
      variantFamily: 'itinerary_seed',
      factSourceKeys,
      outputContract: agentContract.outputContract,
      deterministicChecks: agentContract.deterministicChecks,
      ...effectiveContract,
      completionContract: getAgentCompletionContract(),
    };

    const result = AgentContextSchema.safeParse(payload);
    if (!result.success) {
      assert.fail(
        `Agent context failed AgentContextSchema:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }

    assert.equal(payload.effectiveBrief.sourceOfTruth, 'live_fetch');
    assert.ok(payload.effectiveBrief.availableFactSourceKeys.includes('constraints'));
    assert.ok(payload.effectiveChecks.blockingChecks.some((check) => check.name === 'math_verify' && check.active));
    assert.ok(payload.effectiveChecks.blockingChecks.some((check) => check.name === 'item_count' && check.active));
  } finally {
    restore();
  }
});
