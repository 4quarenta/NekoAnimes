# Matriz de testes e compatibilidade

Data: 2026-09-19. Comandos executados no checkout local. Falha de teste por ambiente foi repetida isoladamente.

Verificação final após correções: `:app:testPlayDebugUnitTest` e `:app:testDirectDebugUnitTest` passaram novamente (14 testes, 0 falhas em cada flavor); `:app:assemblePlayRelease` e `:app:bundlePlayRelease` passaram. `npm run build:web`, `npm run typecheck` e `npm run test:web` passaram novamente. Lint final: 0 erros/48 avisos/2 hints. A execução de GitHub Actions e testes em dispositivo seguem **NÃO TESTADOS**.

| Área | Resultado | Evidência e limite |
| --- | --- | --- |
| Kotlin unitário Play Debug | PASS (14/14) | 8 `PlaybackProgressTest` + 6 `DocumentRecoveryTest`, XML em `apps/android/app/build/test-results/testPlayDebugUnitTest`. Não cobre serviços de rede/player real. |
| Kotlin unitário Direct Debug | PASS (14/14) | Mesmo conjunto no flavor Direct. |
| Worker/contracts | PASS (34/34) | `npm run test:contracts` isolado. Primeiro ensaio em paralelo com Gradle falhou por falta de recursos do Windows ao ler dependência; repetição isolada passou. |
| TypeScript | PASS | `npm run typecheck` nos workspaces web, API Nest, Worker, admin e pacotes. |
| Builds JS | PASS | `npm run build:web`, `build:api`, `build:api-worker`, `build:admin`. Vite reportou 2 avisos de anotação `@__PURE__` em Zod; sem falha. |
| Smoke SPA em Chromium | PASS no cenário automatizado, inclusive repetição pós-correção | `npm run test:web` com Vite preview em `127.0.0.1:4173`: favoritos/provedor, detalhe, episódios, loading/erro/retry, fallback de pôster quebrado, bridge simulada, categorias/paginação, perfil, recuperação e layout 320px. O teste intercepta API e injeta sessão de teste; **não valida backend real nem WebView nativo**. Primeiro ensaio sem preview falhou por `ERR_CONNECTION_REFUSED`, repetição com preview passou. |
| Android UI/Espresso/Maestro | **NÃO TESTADO** | Sem ADB conectado; não existem testes instrumentados de produto no repositório. APK Play Release local é não assinado. |
| Primeira execução, voltar, player, rotação, bloqueio/desbloqueio | **NÃO TESTADO** | Exigem aparelho/Emulator ou Test Lab com release configurado. |
| Permissões: aceitar/recusar/revogar | **NÃO APLICÁVEL** a permissões perigosas no Play manifest atual | `INTERNET`, rede e ID são normais; Play não pede `REQUEST_INSTALL_PACKAGES`. Validar eventual alteração futura e flavor Direct separadamente. |
| Rede rápida/lenta/offline/DNS/401/403/404/429/500 | **PARCIAL** | DNS dos domínios de produção falhou; staging SPA/health/manifest/catálogo/news/update HTTP 200, rotas privadas sem token HTTP 401 e anime inexistente HTTP 404. Testes Worker cobrem erros de provedor e smoke web simula 503. Lenta, offline em aparelho, 403, 429 e 500 reais: **NÃO TESTADO**. |
| Android 13/14/15/16; Samsung/tablet; escala de fonte/TalkBack | **NÃO TESTADO** | Sem matriz de dispositivos. Target 36, min 24; lint ressalta orientação fixa no Android 16/telas grandes. |
| Crash/ANR/StrictMode/consumo | **NÃO TESTADO** dinamicamente | Lint aponta `onRenderProcessGone` ausente e não há Crashlytics. Não induzir crash em produção. |

## Lacunas determinísticas

Testes Android não exercitam a integração real WebView↔bridge, Firebase, player HLS/Blogger, retorno de player, update Play, Firebase consentimento, perfis de rede nem acessibilidade. Adicionar smoke instrumentado após disponibilidade de aparelho/Test Lab e backend de release, sem conta pessoal ou mídia sem licença.
