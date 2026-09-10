# NekoAnimes — Foundation

Fundação inicial do NekoAnimes.

## Arquitetura

- `apps/android`: shell Android nativo em Kotlin + Jetpack Compose + WebView + navbar nativa.
- `apps/web`: SPA React/Vite carregada no WebView.
- `apps/api`: API NestJS/Fastify.
- `apps/admin`: painel administrativo Next.js.
- `packages/contracts`: contratos compartilhados de configuração.
- `packages/bridge-web`: cliente TypeScript da NekoBridge.
- `packages/design-tokens`: tokens visuais básicos.
- `docs`: decisões arquiteturais e contratos.
- `infra`: serviços locais PostgreSQL/Redis.

## Pré-requisitos

- Node.js 22+
- npm 10+
- JDK 17+
- Android Studio recente
- Android SDK 37
- Docker + Docker Compose (opcional para PostgreSQL/Redis locais)

## Instalação JS

```bash
npm install
```

## Desenvolvimento

SPA:

```bash
npm run dev:web
```

API:

```bash
npm run dev:api
```

Admin:

```bash
npm run dev:admin
```

Infra local:

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Android

Abra `apps/android` no Android Studio.

Por padrão, a build `debug` aponta para:

- Web: `http://10.0.2.2:5173`
- API: `http://10.0.2.2:3000`

A build `release` usa placeholders:

- `https://app.nekoanimes.com`
- `https://api.nekoanimes.com`

Essas URLs devem ser substituídas/configuradas antes de produção.

## Escopo desta fundação

Implementado:

- Monorepo inicial.
- SPA React mínima.
- API NestJS com `/health` e `/v1/app-manifest`.
- Modo remoto `streaming` / `news` no contrato.
- Android Compose com navbar nativa.
- WebViewHost com navegação externa bloqueada da bridge.
- NekoBridge v1 mínima e bidirecional.
- Admin scaffold.
- Docker Compose com PostgreSQL e Redis.
- Documentação inicial de anúncios e player.

Ainda não implementado:

- persistência do Admin;
- autenticação;
- catálogo real;
- integração MAL/AniList/TMDB;
- player Media3;
- SDKs de anúncios;
- cache Redis em runtime;
- banco via Drizzle;
- iOS.

## Progresso

**Etapa 1/14 — Fundação do projeto: em andamento.**

A estrutura-base está criada. A validação completa de build Android depende do Android SDK/Gradle no ambiente de desenvolvimento.
