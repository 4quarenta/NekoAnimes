# Segurança Android/SPA/API — referência OWASP MASVS/MASTG

Escopo: análise estática local, manifest mesclado Play Release, dependências e testes existentes. **MOBSF NÃO EXECUTADO**: MobSF/Docker não estavam disponíveis; não instalei ferramenta de sistema para esta auditoria. Sem pentest dinâmico, proxy TLS ou avaliação de backend em produção. Ausência de alerta não comprova segurança.

## MASVS-STORAGE / dados locais

- `MainActivity` ativa `FLAG_SECURE` em release, impedindo screenshots normais. Bom controle de exposição visual; testar em aparelho Play Release.
- `android:allowBackup=false` observado; lint pede `dataExtractionRules` para Android 12+. Confirmar se dados do WebView/localStorage podem ser transferidos por mecanismos de fabricante ou restauração.
- Favoritos/progresso ficam no `localStorage` da SPA. Código legado `apps/web/src/lib/auth.ts` guarda bearer token em `localStorage`, caso a autenticação seja reativada. Uma XSS na origem confiável teria acesso ao token; migrar para fluxo mais seguro antes de reativar conta. Não há evidência de senha gravada localmente pelo app atual.
- `AppManifestRepository` mantém apenas o manifesto de configuração em SharedPreferences; `NekoReviewRequester` armazena preferência local.

## MASVS-NETWORK / comunicação

- Release bloqueia cleartext no manifest e `network_security_config.xml`. Conexões Android de manifesto/player/update usam timeouts definidos; Web API padrão usa `AbortSignal.timeout(30000)` em vários fluxos. A busca direta de AniList em `apps/web/src/lib/api.ts` não tinha timeout; foi limitado a 30 segundos nesta auditoria. Alguns destinos de vídeo vêm de provedores externos e requerem inspeção de tráfego.
- `NekoBridge.parseSource` aceita qualquer host HTTPS com cabeçalhos fornecidos pela SPA. A origem da mensagem é validada, mas compromisso/XSS da SPA ou configuração remota maliciosa pode direcionar o player a host inesperado. Um allowlist de mídia exigiria política de provedores e teste, portanto não foi aplicado automaticamente.
- `BloggerVideoResolver` usa WebView com JavaScript e cookies de terceiros para obter URL temporária; endpoint é verificado por host/path HTTPS no retorno. Exige revisão de privacidade e comportamento do WebView. Não foi identificado bypass TLS/certificado no código próprio.

## MASVS-PLATFORM / componentes

- Bridge usa `WebViewCompat.addWebMessageListener` apenas na origem `BuildConfig.WEB_APP_ORIGIN`, verifica main frame, versão e tamanho da mensagem. Não usa `addJavascriptInterface` irrestrito.
- `WebViewHost.shouldOverrideUrlLoading` envia qualquer URL externa para `Intent.ACTION_VIEW` sem allowlist de scheme. A origem da página é controlada, mas conteúdo injetado ou link remoto poderia invocar handlers de outros apps. Recomenda-se limitar a `https` e schemes de produto explicitamente aprovados após teste de links legítimos; mudança não aplicada automaticamente por alterar navegação.
- `FileProvider` não exportado e restrito a `cache-path updates/`; flavor Play não pede `REQUEST_INSTALL_PACKAGES` e autoupdate Direct está desabilitado via `SELF_UPDATE_ENABLED=false`.
- `FirebaseInitProvider` inicializa Analytics antes da UI. Vínculos, identificadores e consentimento precisam validação. `MainActivity` é exportada apenas como launcher. Receiver do ProfileInstaller é exportado mas exige `DUMP`.
- `WebViewHost` e `BloggerVideoResolver` agora tratam `onRenderProcessGone`: removem/destruem o renderer inválido e recriam a WebView principal com a última URL recuperável. A correção reduz o risco de crash, mas ainda precisa de teste físico sob pressão de memória e em Android 13–16.

## MASVS-AUTH / contas e backend

- UI atual opera sem login. Código cliente e endpoints de registro/login continuam presentes; rotas autenticadas no Worker devem ser examinadas antes de reativar. Não foram feitos ataques a API de produção, auditoria de rate limit ou validação de RLS. Tokens legados no WebView são exposição potencial, não prova de comprometimento atual.
- Worker usa D1 com `prepare(...).bind(...)` nos caminhos de reports/autenticação inspecionados; não foi encontrada concatenação SQL nesses fluxos. Revisão completa de injeção de todas as rotas exige teste dedicado.

## MASVS-CODE / dependências e repositório

- `git ls-files` e nomes no histórico não mostraram keystore, service account, `google-services.json`, `.env` real ou chave privada versionada; `.env.example` é exemplo. Busca por assinaturas de segredo em código ativo não retornou arquivo. Não imprimi nem incluí credenciais no relatório. O `google-services.json` local é configuração de cliente e está ignorado, não deve ser tratado como chave de servidor.
- `npm audit --omit=dev` apontou cadeia de 3 alertas high em Puppeteer/extract-zip, com impacto de deploy a confirmar (ver `sdk-audit.md`). Vulnerabilidades Android conhecidas **NÃO CONFIRMADAS** sem SDK Index/Play Console e base de advisories atual.
- R8/minify no release está habilitado. Não foi encontrada deserialização nativa insegura ou uso de RNG fraco no Android inspecionado.

## Prioridade

Antes de Internal Testing: revisar privacidade do Analytics, confirmar política pública, assinar o AAB e executar teste dinâmico em aparelho/API. Antes de publicação ampla: tratar política de links externos e token legado caso contas retornem, além de comprovar direitos de conteúdo. O teste físico de renderer, offline, back e Android 13–16 continua **NÃO TESTADO** nesta rodada.
