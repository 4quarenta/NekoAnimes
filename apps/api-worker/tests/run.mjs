import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['tests/flows.test.ts'],outfile:'.wrangler/tests/flows.test.mjs',bundle:true,platform:'node',format:'esm',external:['@cloudflare/puppeteer']});
const result=spawnSync(process.execPath,['--test','.wrangler/tests/flows.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
