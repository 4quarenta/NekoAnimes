# NekoAnimes staging

This document records the isolated staging topology. It does not contain Supabase secrets, Cloudflare tokens, admin keys, or signing material.

## Resources

- Pages: `nekoanimes-staging` → `https://nekoanimes-staging.pages.dev` (project id `7e3d03c6-6809-4d8f-a135-d8668ca502e3`)
- Worker: `nekoanimes-api-staging` → URL is recorded after the first Worker deployment
- R2: `nekoanimes-releases-staging` (bucket id `d7e4841d19c54db9bbeedcdc3af062c1`)
- R2 managed public domain: `https://pub-d7e4841d19c54db9bbeedcdc3af062c1.r2.dev` (enabled only for staging downloads)
- PostgreSQL: dedicated Supabase project named `NekoAnimes` (must not be created in SICC)
- Hyperdrive: dedicated config pointing only to the NekoAnimes PostgreSQL database

## Current provisioning blocker

The connected Supabase account currently exposes only the `SICC` organization and
its existing projects. NekoAnimes must not be placed there. Create the isolated
organization/project manually before continuing:

1. Open the Supabase Dashboard and open the organization selector in the top-left.
2. Choose `New organization` (the label may appear as `Create organization`).
3. Name the organization `NekoAnimes` and select the Free plan.
4. Inside that new organization, choose `New project`.
5. Name the project `NekoAnimes`, select the Free plan, and choose `sa-east-1`
   when available; do not enable paid add-ons.
6. Return to this task so the new organization can be detected and the database,
   migrations, Auth, and Hyperdrive can be configured automatically.

Do not select `SICC` or either of its existing projects during these steps.

## GitHub configuration required

Repository secrets:

- `CLOUDFLARE_API_TOKEN` — scoped to Pages edit, Workers edit, R2 edit, and Hyperdrive read/edit as needed
- `CLOUDFLARE_ACCOUNT_ID`
- `NEKO_SUPABASE_URL`
- `NEKO_SUPABASE_PUBLISHABLE_KEY`
- `NEKO_ANDROID_APK_URL`
- `NEKO_ANDROID_APK_SHA256`

Repository variable:

- `NEKO_API_BASE_URL` — the deployed `https://nekoanimes-api-staging.<workers-subdomain>.workers.dev` URL

The APK update URL and SHA are secrets in the deployment workflow because they are operational configuration; no GitHub token is shipped in the APK.

## Database setup

Apply `apps/api/drizzle/0000_wakeful_vapor.sql`, then `apps/api/drizzle/0001_staging_security.sql`, then `apps/api/drizzle/seed-staging.sql` to the dedicated project. Verify the resulting tables and run Supabase security/performance advisors.

Configure Supabase Auth with the Pages origin as the Site URL and allow the Pages origin plus its route paths as redirect URLs. Keep service-role credentials server-side and do not place them in Vite variables.

## Deploy order

1. Create the isolated Supabase organization/project and record its project ref.
2. Apply migrations and the clearly marked staging seed.
3. Create a Hyperdrive config for that database and put its ID in `apps/api-worker/wrangler.jsonc`.
4. Set GitHub secrets/variable and run `Deploy API staging`.
5. Run `Deploy web staging`.
6. Run `Android staging`; it uploads the APK and checksum to R2, stores a GitHub prerelease, and creates the staging artifact.
7. Set `NEKO_ANDROID_APK_URL` and `NEKO_ANDROID_APK_SHA256` from the R2 object and redeploy the API.

## R2 object layout

```text
android/v1.0.0/NekoAnimes-v1.0.0.apk
android/v1.0.0/NekoAnimes-v1.0.0.apk.sha256
```

The `r2.dev` URL is a staging convenience only. A custom download domain must be used before production.
