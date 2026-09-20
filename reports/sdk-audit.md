# SDKs e dependências

Fontes: `apps/android/app/build.gradle.kts`, `reports/gradle-play-release-dependencies.txt` (`:app:dependencies --configuration playReleaseRuntimeClasspath`), manifest Play mesclado e `npm audit --omit=dev` local em 2026-09-19. A lista de dependências transitivas completa está no arquivo Gradle citado; a tabela destaca SDKs com efeito em runtime, privacidade ou política. Não há evidência de versão Android abaixo de mínimo suportado ou de SDK abandonado **somente por esta inspeção**; o Play SDK Index/Play Console ainda deve ser conferido na versão exata antes do envio.

| SDK / versão resolvida | Finalidade / dados potencialmente acessados | Permissões introduzidas ou relevantes | Risco / ação |
| --- | --- | --- | --- |
| AndroidX Core 1.18.0, Activity Compose 1.13.0, Lifecycle 2.9.4 | UI/ciclo de vida, estado local | assinatura `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` e componentes AndroidX | Baixo; lint sugere Core 1.19 e Lifecycle 2.11, atualizar em rodada de regressão. |
| Compose BoM 2026.06.00; UI 1.11.3; Material3 1.4.0; ícones 1.7.8 | Interface | sem permissão sensível identificada | Médio: validar TalkBack, escala de fonte e telas grandes. |
| AndroidX WebKit 1.17.0, SwipeRefreshLayout 1.2.0 | WebView/SPA e pull-to-refresh; cookies e conteúdo web | `INTERNET` | Médio/alto por conteúdo remoto e bridge; revisar origem, CSP e crash do render process. |
| Media3 ExoPlayer/HLS/DASH/UI 1.11.0 | Streaming; endereços e cabeçalhos de vídeo | `WAKE_LOCK`, `INTERNET` (origem transitiva exata a confirmar) | Médio: 29 erros lint de opt-in, testar reprodução/DRM/orientação. Lint sugere 1.11.1. |
| Firebase BoM 34.19.0; Analytics 23.2.0; Firebase Installations 19.1.2 | Eventos automáticos/manuais, identificadores de instalação, potencial Advertising ID | `AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_AD_ID`, componentes de medição | Alto para Data Safety/declaração/consentimento; revisar coleta e configurações do projeto. [Guia de disclosure](https://support.google.com/analytics/answer/11582702?hl=en). |
| Google Play In-App Review 2.0.2 / review-ktx 2.0.2 | Solicitação de avaliação | sem permissão sensível identificada | Baixo; diálogo não garantido fora de distribuição Play. |
| Google Play Services Measurement 23.2.0 / Ads Identifier 18.0.0 (transitivos) | Analytics/atribuição/ID | permissões Google acima | Confirmar exigência e declaração de Advertising ID no Play Console. |

**Ausências verificadas no Gradle Android:** AdMob/GMA, Meta Audience Network, AppLovin MAX, Unity Ads, ironSource/LevelPlay, Pangle, Mintegral, OneSignal, Play Billing, SDK de login social e Crashlytics não constam do classpath Play Release. Isso não garante que a SPA remota não carregue scripts de terceiros no futuro.

**npm/Worker:** `npm audit --omit=dev` retornou 3 entradas `high` encadeadas em `@cloudflare/puppeteer → @puppeteer/browsers → extract-zip`, incluindo [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) e [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3). O fix proposto pela ferramenta faz downgrade major do Puppeteer; **não aplicado** por risco de quebrar o Worker. Avaliar se `extract-zip` processa arquivos controlados por terceiros neste deploy e testar atualização compatível. O `package-lock.json` local não está versionado, logo a árvore CI pode divergir; não usar este scan como prova de vulnerabilidade explorável em produção.

O [Google Play SDK Index](https://developer.android.com/distribute/sdk-index) e as notificações do Play Console exigem checagem manual das versões implantadas; não houve sessão Play Console nesta auditoria.
