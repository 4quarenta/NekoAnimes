import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertEmptyNamespace, assertImmutableRelease, releaseGuard, validateBuildMetadata } from '../scripts/android-release-guard.mjs';

const env = { GITHUB_REPOSITORY: 'test/neko', GITHUB_SHA: 'a'.repeat(40), GH_TOKEN: 'test-token', RELEASE_VERSION: '1.0.38', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'test-token' };
const tag = 'v1.0.38-staging';
const files = [{ name: 'NekoAnimes-v1.0.38.apk', size: 3, sha256: createHash('sha256').update('apk').digest('hex') }];
const empty = { success: true, errors: [], result: [], result_info: { is_truncated: false } };
const release = { tag_name: tag, draft: false, prerelease: true, immutable: true, assets: files.map(file => ({ ...file, state: 'uploaded', digest: `sha256:${file.sha256}` })) };

function fake(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, undefined, 'Guard must only read remote state');
    if (url.includes('cloudflare.com')) return Response.json(overrides.r2 ?? empty, { status: overrides.r2Status ?? 200 });
    if (url.endsWith('/test/neko')) return Response.json({ full_name: env.GITHUB_REPOSITORY, permissions: { push: true }, ...overrides.repo }, { status: overrides.repoStatus ?? 200 });
    if (overrides.published && url.includes('/releases/tags/')) return Response.json(overrides.release ?? release);
    if (overrides.published && url.includes('/git/ref/')) return Response.json({ object: { type: 'commit', sha: overrides.sha ?? env.GITHUB_SHA } });
    return Response.json(overrides.absence ?? { message: 'Not Found' }, { status: overrides.tagStatus ?? 404 });
  };
  return { calls, guard: releaseGuard(env, fetcher) };
}

test('release version must match actual Gradle directDebug APK, including versionCode', () => {
  const metadata = { applicationId: 'com.nekoanimes.app', variantName: 'directDebug', elements: [{ versionName: '1.0.38-debug', versionCode: 10038, outputFile: 'app-direct-debug.apk', filters: [] }] };
  validateBuildMetadata(metadata, '1.0.38', '10038');
  for (const change of [{ versionName: '1.0.37-debug' }, { versionCode: 10037 }, { filters: [{ filterType: 'ABI', value: 'arm64-v8a' }] }]) {
    assert.throws(() => validateBuildMetadata({ ...metadata, elements: [{ ...metadata.elements[0], ...change }] }, '1.0.38', '10038'));
  }
  assert.throws(() => validateBuildMetadata({ ...metadata, variantName: 'playDebug' }, '1.0.38', '10038'));
  assert.throws(() => validateBuildMetadata({ ...metadata, elements: [] }, '1.0.38', '10038'));
});

test('preflight requires confirmed repository access, absent stable/staging tags and releases, and empty R2 namespace', async () => {
  const { guard, calls } = fake();
  await guard.preflight();
  assert.equal(calls.length, 6);
  assert.ok(calls.some(url => url.endsWith('/git/ref/tags/v1.0.38')));
  assert.ok(calls.some(url => url.endsWith(`/git/ref/tags/${tag}`)));
  assert.ok(calls.some(url => url.endsWith('/releases/tags/v1.0.38')));
  assert.ok(calls.some(url => url.endsWith(`/releases/tags/${tag}`)));
  assert.equal(new URL(calls.at(-1)).searchParams.get('prefix'), 'android/v1.0.38/');
});

test('existing tags, auth failures, rate limits, server errors and unknown absence responses fail closed', async () => {
  for (const tagStatus of [200, 401, 403, 429, 500]) {
    const { guard, calls } = fake({ tagStatus });
    await assert.rejects(() => guard.preflight());
    assert.ok(!calls.some(url => url.includes('cloudflare.com')));
  }
  await assert.rejects(() => fake({ repoStatus: 404 }).guard.preflight());
  await assert.rejects(() => fake({ repo: { permissions: {} } }).guard.preflight());
  await assert.rejects(() => fake({ absence: {} }).guard.preflight());
  await assert.rejects(() => releaseGuard(env, async () => { throw new Error('network'); }).preflight());
  for (const key of Object.keys(env)) assert.throws(() => releaseGuard({ ...env, [key]: '' }));
});

test('R2 namespace refuses existing APK/checksum, failed, malformed and incomplete listings', async () => {
  assertEmptyNamespace(empty);
  for (const body of [{}, { ...empty, success: false }, { ...empty, errors: [{}] }, { ...empty, result: null },
    { ...empty, result: [{ key: 'android/v1.0.38/NekoAnimes-v1.0.38.apk' }] },
    { ...empty, result: [{ key: 'android/v1.0.38/NekoAnimes-v1.0.38.apk.sha256' }] },
    { ...empty, result_info: {} }, { ...empty, result_info: { is_truncated: true } },
    { ...empty, result_info: { is_truncated: false, cursor: 'next' } }]) {
    assert.throws(() => assertEmptyNamespace(body));
  }
  for (const r2Status of [403, 404, 500]) await assert.rejects(() => fake({ r2Status }).guard.preflight());
});

test('only an immutable published prerelease with exact uploaded assets and digests is accepted', () => {
  assertImmutableRelease(release, tag, files);
  for (const immutable of [false, undefined, null, 'true']) assert.throws(() => assertImmutableRelease({ ...release, immutable }, tag, files));
  for (const patch of [{ draft: true }, { prerelease: false }, { tag_name: 'v1.0.37-staging' }, { assets: [] }, { assets: [...release.assets, ...release.assets] }]) {
    assert.throws(() => assertImmutableRelease({ ...release, ...patch }, tag, files));
  }
  for (const patch of [{ digest: undefined }, { digest: `sha256:${'b'.repeat(64)}` }, { size: 4 }, { state: 'new' }]) {
    assert.throws(() => assertImmutableRelease({ ...release, assets: [{ ...release.assets[0], ...patch }] }, tag, files));
  }
});

test('before R2: verify immutability and build commit before checking namespace again', async () => {
  const { guard, calls } = fake({ published: true });
  await guard.beforeR2(files);
  assert.equal(calls.length, 3);
  for (const patch of [{ release: { ...release, immutable: false } }, { release: { ...release, immutable: undefined } }, { sha: 'b'.repeat(40) }]) {
    const failure = fake({ published: true, ...patch });
    await assert.rejects(() => failure.guard.beforeR2(files));
    assert.ok(!failure.calls.some(url => url.includes('cloudflare.com')));
  }
  await assert.rejects(() => fake({ published: true, r2: { ...empty, result: [{ key: 'occupied' }] } }).guard.beforeR2(files));
});

test('R2 readback must match local bytes and rejects unavailable or changed content', async () => {
  await releaseGuard(env, async () => new Response('apk')).verifyR2(files);
  await assert.rejects(() => releaseGuard(env, async () => new Response('bad')).verifyR2(files));
  await assert.rejects(() => releaseGuard(env, async () => new Response('apk', { status: 404 })).verifyR2(files));
});

test('workflow orders artifact and immutable release gates before every R2 write and has no updater promotion', () => {
  const workflow = readFileSync('../../.github/workflows/android-staging.yml', 'utf8');
  const artifact = workflow.indexOf('uses: actions/upload-artifact@v4');
  const create = workflow.indexOf('gh release create');
  const publish = workflow.indexOf('gh release edit');
  const guard = workflow.indexOf('android-release-guard.mjs before-r2');
  const writes = [...workflow.matchAll(/command: r2 object put/g)].map(match => match.index);
  assert.ok(artifact > 0 && artifact < create && create < publish && publish < guard);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(index => index > guard));
  assert.ok(workflow.includes('overwrite: false'));
  assert.ok(workflow.includes('-f ref="refs/tags/$tag" -f sha="$GITHUB_SHA"'));
  assert.ok(!/--clobber|gh variable set|wrangler deploy|secret put|--force/.test(workflow));
});
