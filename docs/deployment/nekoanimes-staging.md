# NekoAnimes staging — Cloudflare-only

Staging é isolado do SICC, SnapGym e ConcursoMestre. Esta topologia usa somente
recursos Cloudflare e não exige Supabase. Nenhum segredo é versionado.

## Recursos provisionados

- Pages: `nekoanimes-staging` — <https://nekoanimes-staging.pages.dev>
  (project id `7e3d03c6-6809-4d8f-a135-d8668ca502e3`)
- Worker: `nekoanimes-api-staging` —
  <https://nekoanimes-api-staging.john-alleff01.workers.dev>
- D1: `nekoanimes-staging-db` — database id
  `b075bb90-a027-40de-8a28-b74f74192f2f`
- R2: `nekoanimes-releases-staging` — bucket id
  `d7e4841d19c54db9bbeedcdc3af062c1`
- R2 público temporário: <https://pub-d7e4841d19c54db9bbeedcdc3af062c1.r2.dev>

O Worker usa Hono e SQL nativo do D1. A API NestJS/Fastify original foi
preservada para o runtime tradicional; o Worker staging é uma camada de
adaptação isolada, porque o spike não justificou transportar NestJS/Fastify e
Drizzle para Workers neste primeiro ciclo. O banco de staging é D1; PostgreSQL
fica preservado para o runtime tradicional/produção.

## Endpoints públicos

- Health: <https://nekoanimes-api-staging.john-alleff01.workers.dev/health>
- Readiness: <https://nekoanimes-api-staging.john-alleff01.workers.dev/health/ready>
- Manifest: <https://nekoanimes-api-staging.john-alleff01.workers.dev/v1/app-manifest>
- Catálogo: <https://nekoanimes-api-staging.john-alleff01.workers.dev/v1/catalog/anime>
- Notícias: <https://nekoanimes-api-staging.john-alleff01.workers.dev/v1/news>
- Atualização Android: <https://nekoanimes-api-staging.john-alleff01.workers.dev/v1/app-update/android>

O endpoint de atualização permanece `503` até que um APK seja publicado no R2
e as secrets `ANDROID_APK_URL` e `ANDROID_APK_SHA256` sejam configuradas.

## Banco e dados de teste

As migrations autoritativas de staging são:

1. `apps/api-worker/migrations/0001_initial.sql`
2. `apps/api-worker/migrations/0002_staging_seed.sql`

O seed contém 5 animes, 6 temporadas, 23 episódios e 3 notícias. O catálogo
não contém links de streaming piratas. Episódios sem fonte retornam erro
controlado de fonte indisponível.

O login de staging é local ao Worker, com usuários e sessões armazenados no D1.
Ele é suficiente para testes do app, mas ainda não oferece e-mail de
confirmação, recuperação de senha ou rate limiting de produção.

## Deploy manual

Para a SPA, publique o diretório `apps/web/dist` no Pages (build command:
`npm run build --workspace @neko/web`, output directory: `apps/web/dist`). O
arquivo `apps/web/public/_redirects` mantém o fallback SPA para refresh em
`/catalogo`, `/buscar`, `/anime/*`, `/conta`, `/lista` e rotas de notícias.

Variáveis públicas do build web:

- `VITE_API_BASE_URL=https://nekoanimes-api-staging.john-alleff01.workers.dev`
- `VITE_APP_VERSION=1.0.0`

Não há `VITE_SUPABASE_*` nesta arquitetura. Nunca colocar tokens de Cloudflare,
credenciais de banco ou `service_role` no frontend.

## APK, R2 e atualização

O workflow `Android staging` é manual e usa a variável de repositório
`NEKO_API_BASE_URL`. Ele compila `:app:assembleDirectDebug` com:

- `WEB_APP_URL=https://nekoanimes-staging.pages.dev`
- `WEB_APP_ORIGIN=https://nekoanimes-staging.pages.dev`
- `API_BASE_URL=https://nekoanimes-api-staging.john-alleff01.workers.dev`

Publicação esperada:

```text
android/v1.0.0/NekoAnimes-v1.0.0.apk
android/v1.0.0/NekoAnimes-v1.0.0.apk.sha256
```

O workflow guarda o APK como artifact e cria a prerelease GitHub
`v1.0.0-staging`; não é release de produção. Depois do upload, configure no
Worker as secrets `ANDROID_APK_URL` e `ANDROID_APK_SHA256` e redeploy. A URL
esperada do APK é:

<https://pub-d7e4841d19c54db9bbeedcdc3af062c1.r2.dev/android/v1.0.0/NekoAnimes-v1.0.0.apk>

O Android baixa o manifesto de atualização, compara `versionCode`, baixa o
APK, valida SHA-256 e abre o instalador. A instalação de APK direto exige
autorizar a fonte desconhecida no Android de teste.

## GitHub Actions

Os workflows são manuais (`workflow_dispatch`) ou limitados ao escopo de
staging:

- `deploy-web-staging.yml`
- `deploy-api-staging.yml`
- `android-staging.yml`

Configure no repositório:

- secret `CLOUDFLARE_API_TOKEN` com escopo apenas para este account e recursos
  necessários;
- secret `CLOUDFLARE_ACCOUNT_ID` com valor
  `a534a9010287d6a1746db5ec722a6241`;
- variável `NEKO_API_BASE_URL` com a URL do Worker acima.

O token GitHub usado pela própria Action para a prerelease não é embutido no
APK.

## Limites conhecidos

- O R2 `r2.dev` é temporário para teste; antes de produção deve ser trocado por
  domínio customizado.
- A autenticação local do Worker é staging-only; a API NestJS original continua
  separada e não foi substituída.
- Direct Release não é gerado automaticamente sem keystore definitiva.
- O endpoint de update só fica operacional depois do primeiro APK publicado e
  das duas secrets de checksum configuradas.
