import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateBuildMetadata(metadata, version, code) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(metadata.applicationId, 'com.nekoanimes.app');
  assert.equal(metadata.variantName, 'directDebug');
  assert.equal(metadata.elements?.length, 1, 'Expected one universal APK');
  const apk = metadata.elements[0];
  assert.equal(apk.versionName, `${version}-debug`, 'APK versionName does not match release');
  assert.equal(apk.versionCode, Number(code), 'APK versionCode does not match release');
  assert.equal(apk.outputFile, 'app-direct-debug.apk');
  assert.deepEqual(apk.filters, [], 'Split APKs cannot be published as universal');
}

export function assertEmptyNamespace(body) {
  assert.equal(body.success, true, 'R2 list did not confirm success');
  assert.ok(Array.isArray(body.errors) && body.errors.length === 0, 'R2 list errors/unknown state');
  assert.ok(Array.isArray(body.result), 'R2 list has unknown shape');
  assert.equal(body.result.length, 0, 'Version namespace already contains objects; use a new version');
  assert.equal(body.result_info?.is_truncated, false, 'R2 listing completeness is unknown');
  assert.ok(!body.result_info.cursor, 'R2 listing has another page');
  assert.ok(!body.result_info.delimited?.length, 'R2 namespace contains prefixes');
}

export function assertImmutableRelease(release, tag, files) {
  assert.equal(release.tag_name, tag);
  assert.equal(release.draft, false, 'Release must be published before R2 writes');
  assert.equal(release.prerelease, true);
  assert.equal(release.immutable, true, 'Release immutability is absent, disabled or unknown; R2 publication blocked');
  assert.ok(Array.isArray(release.assets));
  assert.equal(release.assets.length, files.length, 'Release asset set differs from build');
  for (const file of files) {
    const matches = release.assets.filter(asset => asset.name === file.name);
    assert.equal(matches.length, 1, `Missing/duplicate release asset: ${file.name}`);
    assert.equal(matches[0].state, 'uploaded');
    assert.equal(matches[0].size, file.size);
    assert.equal(matches[0].digest, `sha256:${file.sha256}`, `Missing/mismatched asset digest: ${file.name}`);
  }
}

export function releaseGuard(env, fetcher = fetch) {
  for (const key of ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'GH_TOKEN', 'RELEASE_VERSION', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
    assert.ok(env[key], `Missing ${key}; publication blocked`);
  }
  assert.match(env.RELEASE_VERSION, /^\d+\.\d+\.\d+$/);
  const tag = `v${env.RELEASE_VERSION}-staging`;
  const repoUrl = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
  const objectsUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/nekoanimes-releases-staging/objects`;
  const ghHeaders = { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const cfHeaders = { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
  const get = (url, headers) => fetcher(url, { headers, signal: AbortSignal.timeout(60_000), redirect: 'error' });
  async function json(url, headers) {
    const response = await get(url, headers);
    assert.equal(response.status, 200, `Verification failed: HTTP ${response.status}`);
    return response.json();
  }
  async function namespace() {
    const query = new URLSearchParams({ prefix: `android/v${env.RELEASE_VERSION}/`, per_page: '1' });
    assertEmptyNamespace(await json(`${objectsUrl}?${query}`, cfHeaders));
  }
  return {
    async preflight() {
      // Confirm repository access first: an unauthorized private repo may also return 404.
      const repo = await json(repoUrl, ghHeaders);
      assert.equal(repo.full_name, env.GITHUB_REPOSITORY);
      assert.equal(repo.permissions?.push, true, 'Cannot verify repository write access');
      for (const candidate of [`v${env.RELEASE_VERSION}`, tag]) {
        for (const path of [`git/ref/tags/${candidate}`, `releases/tags/${candidate}`]) {
          const response = await get(`${repoUrl}/${path}`, ghHeaders);
          assert.equal(response.status, 404, `Tag/release exists or check failed (${response.status}); use a new version`);
          assert.equal((await response.json()).message, 'Not Found', 'Unrecognized absence response');
        }
      }
      await namespace();
    },
    async beforeR2(files) {
      const release = await json(`${repoUrl}/releases/tags/${tag}`, ghHeaders);
      assertImmutableRelease(release, tag, files);
      const ref = await json(`${repoUrl}/git/ref/tags/${tag}`, ghHeaders);
      assert.equal(ref.object?.type, 'commit');
      assert.equal(ref.object?.sha, env.GITHUB_SHA, 'Release tag does not point at this build commit');
      await namespace();
    },
    async verifyR2(files) {
      for (const file of files.filter(file => !file.name.includes('-staging'))) {
        const response = await get(`${objectsUrl}/android/v${env.RELEASE_VERSION}/${file.name}`, cfHeaders);
        assert.equal(response.status, 200, `R2 readback failed for ${file.name}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.length, file.size);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `R2 checksum mismatch: ${file.name}`);
      }
    }
  };
}

function releaseFiles(directory, version) {
  const names = [`NekoAnimes-v${version}.apk`, `NekoAnimes-v${version}-staging.apk`].flatMap(name => [name, `${name}.sha256`]);
  assert.deepEqual(readdirSync(directory).sort(), [...names].sort(), 'Unexpected release file set');
  return names.map(name => {
    const bytes = readFileSync(join(directory, name));
    return { name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, directory] = process.argv.slice(2);
  if (command === 'metadata') {
    validateBuildMetadata(JSON.parse(readFileSync(directory, 'utf8')), process.env.RELEASE_VERSION, process.env.RELEASE_VERSION_CODE);
  } else {
    const guard = releaseGuard(process.env);
    if (command === 'preflight') await guard.preflight();
    else if (command === 'before-r2') await guard.beforeR2(releaseFiles(directory, process.env.RELEASE_VERSION));
    else if (command === 'verify-r2') await guard.verifyR2(releaseFiles(directory, process.env.RELEASE_VERSION));
    else throw new Error('Unknown release guard command');
  }
}
