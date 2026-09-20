# PLAY STORE READINESS REPORT

## Resumo

Status geral: **NÃO RECOMENDADO PARA PUBLICAÇÃO**. Auditoria local atualizada em 2026-09-20; aprovação da Google não é inferível de build/lint. O `project-overview.md` e demais `reports/` não entram no AAB, pois ficam fora do módulo Android.

## Bloqueadores

- Direitos/licenças dos streams, imagens e metadados de provedores externos **NÃO CONFIRMADOS**. Obter documentação e revisão jurídica antes da distribuição; ver `play-policy-audit.md`.
- Os domínios de produção `app.nekoanimes.com` e `api.nekoanimes.com` continuam sem DNS; o Play Release temporário foi corrigido para usar os hosts isolados de staging, validados publicamente. Não tratar isso como produção.
- Política de privacidade foi criada, vinculada ao perfil e publicada em `https://nekoanimes-staging.pages.dev/privacidade`; a retenção de reports agora está definida em 90 dias após encerramento e implementada no staging, mas o texto jurídico e o Data Safety ainda exigem revisão humana.
- O AAB Play Release foi reconstruído e validado com a chave de upload em 2026-09-20. O build continua falhando fechado quando as quatro variáveis `NEKO_RELEASE_*` não são fornecidas, evitando artefatos unsigned.

## Alta prioridade

- Analytics inicializado automaticamente; a coleta do Advertising ID foi desativada e as permissões `AD_ID`/Ad Services foram removidas do manifesto Play. Ainda exige validação do Firebase Console e declaração fiel.
- O código implementa `onRenderProcessGone` no WebView principal e no resolver Blogger, mas o lint ainda emite quatro avisos para esses callbacks. Confirmar o comportamento em aparelho sob pressão de memória antes de ampliar a distribuição; não suprimir o alerta sem essa evidência.
- Falta validação real de player, voltar, rede ruim/offline, Android 13–16 e tamanho de tela; vulnerabilidades npm high em cadeia do Worker precisam triagem.
- Rotas legadas de autenticação/conta precisam revisão de retenção/exclusão se voltarem a ser acessíveis.

## Média prioridade

- Verificar links externos do WebView, cookies Blogger, origem remota, regras de backup/transferência, reprodução/orientação em tablets e confiabilidade do backend.
- Acessibilidade com TalkBack, texto ampliado, contraste e alvos de toque; lint mantém aviso de touch.

## Baixa prioridade

- Modernizar dependências e sugestões `UseKtx` após regressão; hints de autoboxing não são bloqueadores.

## Build

`lintPlayRelease`, testes Play Debug e `bundlePlayRelease` passaram no processo protegido de assinatura. O SDK local emitiu avisos de `emulator`/`platform-tools` em diretórios `-2` inconsistentes; não impediram o lint, mas convém normalizar antes dos testes instrumentados. Vite emitiu dois avisos de anotação `@__PURE__` de Zod. Não usar esse status como prova de funcionamento no aparelho.

## Android Lint

Inicial: 30 errors, 48 warnings, 2 hints. Após correções: **0 errors, 44 warnings, 3 hints**, task exit 0. Permanecem os avisos de `onRenderProcessGone` (apesar de callbacks implementados, requerem validação física), recursos WebView, orientação fixa, `allowBackup`, acessibilidade de toque e atualizações de dependências. Ver `android-lint.md`.

## Testes

Kotlin Play Debug 14/14, Direct Debug 14/14, repetidos após correções; Worker contratos **37/37**; typecheck/build JS passaram. Smoke SPA com API simulada passou também após os ajustes finais, incluindo a garantia de que a conta do modo 2 não apresenta biblioteca, progresso ou servidor. UI Android/instrumentados: **NÃO TESTADO** sem aparelho ADB.

## Manifest

Play Release: launcher exportada; `FileProvider` privado; Firebase/Measurement não exportados; ProfileInstaller receiver protegido. `allowBackup=false`, cleartext negado, release não debuggable. Ver `manifest-audit.md`.

## Permissões

`INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `BIND_GET_INSTALL_REFERRER_SERVICE` e permissão própria de receiver. `AD_ID` e permissões Ad Services foram removidas do manifesto Play final. `REQUEST_INSTALL_PACKAGES` só no flavor Direct, não no Play.

## SDKs

Compose/AndroidX, WebKit, Media3, Firebase Analytics, Google Play In-App Review; sem AdMob/Meta/AppLovin/OneSignal/Billing no Play Release. `npm audit` apontou cadeia high no Worker; impacto em runtime **NÃO CONFIRMADO**. Ver `sdk-audit.md`.

## Segurança

TLS/cleartext e origem da bridge têm controles; riscos residuais: links externos sem allowlist de scheme, token em `localStorage` legado se contas forem reativadas, origem de mídia HTTPS ampla e renderer WebView ainda não testado fisicamente. MobSF **NÃO EXECUTADO**.

## Privacidade

Política pública criada e vinculada no perfil: `https://nekoanimes-staging.pages.dev/privacidade`. Firebase Analytics, reports e destinos externos exigem texto e controles verificados. Advertising ID foi desativado e removido do manifesto; DebugView foi acessado, mas a sessão end-to-end ficou **NÃO TESTADA** por falta de aparelho conectado.

## Data Safety

Rascunho técnico em `data-safety-audit.md`, agora com matriz de preenchimento e passos de validação; revisar identificadores/atividade, e-mail e texto opcionais de reports, compartilhamento Google/Cloudflare/provedores e execução do cron de retenção de 90 dias. Não declarar ausência de coleta sem medir tráfego real.

## Ads e Consentimento

SDK de anúncios não encontrado; Analytics mede eventos e pode usar identificadores. Não há UMP/CMP ou revogação explícita no app; necessidade jurídica/regional e configuração devem ser confirmadas. Ver `ads-privacy.md`.

## Compatibilidade Android

`minSdk=24`, `compileSdk=36`, `targetSdk=36`. Requisito de target vigente atendido; comportamento Android 13–16, orientação Android 16/tablet e back navigation **NÃO TESTADO** fisicamente.

## Performance

R8/resource shrink ativos; pacote AAB cerca de 6,46 MiB no build inicial. Cold/warm start, jank, memória, bateria, render-process crash e ANR **NÃO TESTADO**. Ver `performance.md`.

## Acessibilidade

Sem TalkBack/escala de fonte em dispositivo. Lint acusa touch sem `performClick`; labels existem parcialmente. Estado: **MANUAL REVIEW**. Ver `accessibility.md`.

## AAB

O AAB atual mede **6.786.386 bytes**, possui SHA-256 `3273B4899F582C567626C23967A5351C121D64EA9C94CCA17FE406A1A413A874`, passou em `jarsigner -verify` e `bundletool validate`. O upload e o Play App Signing ainda não foram executados. Ver `aab-validation.md`.

## Firebase Test Lab

**NÃO TESTADO**: sem CLI/credenciais Test Lab disponíveis. Comandos condicionais e matriz em `firebase-test-lab.md`.

## Google Play Policy

Riscos centrais: propriedade intelectual/licenciamento, User Data/Privacy Policy/Data Safety. WebView não é por si só reprovação; há player e UI nativa, mas direitos da SPA/conteúdo devem ser documentados. O fluxo de solicitação de remoção foi adicionado, mas não substitui comprovação de autorização. Ver `play-policy-audit.md`.

## Validações manuais pendentes

Comprovar direitos de conteúdo; revisar a política pública; validar Firebase/Analytics com sessão real e preencher Data Safety; validar no staging a retenção/exclusão de reports (90 dias após encerramento e pedidos antecipados); provisionar endpoints de produção quando sair do teste; testar em Android 13–16 e tablet (primeira abertura, offline, player, back, bloqueio/desbloqueio, rotação, relatórios, TalkBack); inspecionar tráfego e Play SDK Index; executar Test Lab se autorizado. Sem aparelho nesta sessão: **NÃO TESTADO**.

## Recomendação final

O bloqueio técnico de assinatura do AAB foi resolvido. Antes de enviá-lo, ainda é necessário resolver direitos/licenças, revisar Data Safety, validar Firebase em sessão real e executar smoke do pacote derivado do AAB. O staging pode continuar sendo usado no teste; produção exige endpoints próprios. Reavaliar os avisos de WebView e segurança antes de ampliar o público.
