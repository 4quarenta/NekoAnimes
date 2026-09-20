# NekoAnimes

Aplicativo Android nativo com interface React/Vite, player Media3 e configuração remota. O ambiente atual usa infraestrutura isolada de staging na Cloudflare.

## Estrutura

- `apps/android`: aplicativo Kotlin, Jetpack Compose, WebView e Media3.
- `apps/web`: SPA React/Vite carregada pelo aplicativo e páginas públicas auxiliares.
- `apps/api-worker`: API Hono em Cloudflare Workers com banco D1 de staging.
- `apps/admin`: painel administrativo Next.js publicado como Worker separado.
- `apps/api`: implementação NestJS/PostgreSQL preservada como referência da arquitetura original; não é o runtime ativo de staging.
- `packages/contracts`: contratos compartilhados da configuração e do bridge.
- `packages/bridge-web`: cliente TypeScript do bridge Android/WebView.
- `docs`: arquitetura, implantação, QA e preparação para a loja.
- `reports`: evidências e resultados da auditoria de pré-publicação; não entram no APK/AAB.

## Pré-requisitos

- Node.js 22+
- npm 10+
- JDK 17+
- Android SDK 36
- Gradle 9.4.1

## Comandos principais

```bash
npm install
npm run typecheck
npm run test:contracts
npm run build
```

O Android é compilado a partir de `apps/android`. Os workflows instalam uma versão fixa do Gradle, validam Firebase por secret e não publicam automaticamente na Google Play.

## Configuração Android

O flavor `play` gera o AAB da Play Store. O flavor `direct` mantém o atualizador direto fora da variante Play. As URLs podem ser substituídas por propriedades Gradle `-PnekoWebAppUrl`, `-PnekoWebAppOrigin` e `-PnekoApiBaseUrl`.

Enquanto os domínios de produção não forem provisionados, as builds de release usam a infraestrutura isolada de staging documentada em `docs/deployment/nekoanimes-staging.md`.

## Modos remotos

O manifesto entrega apenas os modos numéricos `1` e `2`. A navegação e os recursos visíveis são derivados do modo ativo, sem exigir uma nova compilação do aplicativo.

## Publicação

O repositório prepara build, lint, testes e AAB, mas não publica na Play Store automaticamente. Consulte `reports/PLAYSTORE-READINESS.md` e `docs/release/` antes de enviar uma versão para teste interno.
