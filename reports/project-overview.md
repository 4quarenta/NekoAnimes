# Visão geral do projeto — auditoria pré-publicação

Data da inspeção: 2026-09-19. Escopo: checkout local da branch `main`; resultados de build e execução ficam nos relatórios específicos. O `package-lock.json` não versionado já existia antes desta auditoria e foi preservado.

## Stack detectada

- Aplicativo Android nativo: Kotlin, Jetpack Compose, AndroidX WebKit/WebView, Media3 ExoPlayer. Não há estrutura de Flutter ou React Native no aplicativo.
- SPA exibida no WebView: React 19, TypeScript 5.9, Vite 7, TanStack Router/Query e Zustand (`apps/web`).
- Backend em produção/staging identificado no repositório: Cloudflare Worker/Hono com D1 (`apps/api-worker`). Há também uma API NestJS/Fastify/Drizzle/PostgreSQL (`apps/api`); a presença no repositório não prova que esteja em uso pelo app distribuído.
- Painel administrativo Next.js em `apps/admin`; pacotes compartilhados em `packages/*`.

## Configuração Android

| Item | Valor observado |
| --- | --- |
| Android Gradle Plugin | 9.2.0 |
| Gradle | 9.4.1 usado no CI e instalação local; wrapper não versionado |
| Kotlin plugin Compose | 2.3.21 |
| Java | source/target 17; JDK local 17.0.11 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 |
| applicationId | `com.nekoanimes.app` |
| versionCode / versionName base e Play | 10036 / 1.0.36 |
| versionCode / versionName Direct | 10038 / 1.0.38 |
| Flavors | `direct` (autoupdate por APK), `play` (autoupdate desativado) |
| Build types | `debug` e `release` (defaults de staging isolado nesta fase; release aceita override `-Pneko*`, R8 e resource shrink) |
| Arquiteturas | nenhuma ABI filtrada no Gradle; seleção real dependerá das bibliotecas transitivas e do AAB |

## Capacidades e integrações encontradas

- Internet, estado da rede, WebView com JavaScript/DOM Storage, ponte via `WebViewCompat.addWebMessageListener`, player Media3, resolução de vídeo Blogger e acesso a provedores externos via Worker.
- Firebase Analytics com projeto configurado localmente; Google Play In-App Review. Não foram identificados SDKs Android de anúncios, billing, OneSignal, login social ou push no `app/build.gradle.kts`.
- Manifest principal declara `INTERNET` e `ACCESS_NETWORK_STATE`; flavor Direct adiciona `REQUEST_INSTALL_PACKAGES`. Permissões transitivas serão verificadas no manifest mesclado.
- `FileProvider` privado para instalação do APK Direct; `MainActivity` exportada como launcher. Sem deep link/app link declarado no manifest principal.
- Persistência local em SharedPreferences e no `localStorage` da SPA; código de sessão/autenticação continua no repositório, embora a UI atual precise ser conferida para determinar se o cadastro está ativo.
- API/SPA podem transmitir pesquisa, seleção de servidor, favoritos/progresso/reports e dados de autenticação quando o fluxo correspondente estiver ativo. Firebase Analytics registra eventos nativos.

## Evidências e limites iniciais

Fontes: `apps/android/{build.gradle.kts,settings.gradle.kts,app/build.gradle.kts}`, manifests por flavor, `package.json` dos workspaces, código Android/Web/Worker e workflows. A existência de código não comprova execução em produção. O relatório de Data Safety distinguirá caminhos ativos, opcionais e não confirmados.

Os arquivos `reports/*.md`, inclusive este, ficam fora do módulo Android e não são recursos do aplicativo. A listagem do AAB Play Release (`jar tf`) confirmou ausência de `project-overview.md` e de `reports/`.

## Política pública de privacidade

Foi adicionada a rota `/privacidade`, vinculada ao perfil e publicada no Pages staging em `https://nekoanimes-staging.pages.dev/privacidade`. O responsável informado é NekoAnimes e o contato público é `dev.app.440@gmail.com`. Reports resolvidos/descartados têm retenção definida de até 90 dias após encerramento, com rotina diária no Worker; o texto ainda precisa de revisão jurídica e as configurações do Firebase/contratos dos provedores permanecem pendentes.
