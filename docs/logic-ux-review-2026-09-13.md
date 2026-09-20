# Auditoria de lógica e UX — 13/09/2026

## Contexto e conclusão

Revisão solicitada sobre o estado anterior de `main` em `cd0c382`, com implementação publicada em `b15ab6b`. Os defeitos abaixo foram reproduzidos naquele estado e servem como histórico de causa; as correções estão aplicadas no working tree atual. A publicação e a validação física do novo APK continuam sendo gates separados.

**Recomendação: promover somente para staging após os gates finais.** A navegação, continuidade, recuperação e separação de listas foram corrigidas no código atual. Ainda não é uma declaração de prontidão para produção: assinatura/release, deployment e validação física precisam ser confirmados separadamente.

## Evidência reproduzível

Com `npm run preview --workspace @neko/web -- --port 4173` em execução:

```sh
npm run typecheck
npm run test:contracts
npm run test:web
```

- Typecheck passou em todos os workspaces.
- Nove testes de contrato passaram.
- Smoke web existente passou: favoritos, episódios em ordem decrescente, diálogo central, erro/retry, envio à bridge, categorias/paginação e perfil; sem erro JavaScript.
- O diagnóstico executado naquela rodada reproduziu os nove cenários abaixo em Chrome de 412 × 820 CSS pixels. O script temporário de reprodução foi removido depois que as regressões relevantes passaram a ser cobertas pelos testes mantidos no projeto.
- A seção de defeitos registra **defeitos reproduzidos no commit anterior**. Os testes de regressão atuais usam contas, providers e mídia fictícios; somente o manifesto é consultado publicamente. Não escrevem no staging nem reproduzem conteúdo de terceiros.
- Inspeção visual: `test-results/profile.png`, `test-results/player-loading.png`, `test-results/player-error.png`.

## Defeitos reproduzidos

| Prioridade | Falha e evidência | Causa / correção proposta |
| --- | --- | --- |
| P1 | **Retomada reinicia o vídeo.** Com 600/1200 segundos salvos, clicar em “Continuar episódio 1, 50% assistido” envia `player.open` sem posição. | `AnimeDetailPage.tsx:140`, `packages/bridge-web/src/index.ts`, `packages/contracts/src/bridge.ts:16` e `NekoPlayerScreen.kt`: não há posição inicial nem `seekTo`. Estender o contrato de forma compatível, validar posição/duração e distinguir “Continuar” de “Recomeçar”. |
| P1 | **Erro de reprodução pode apagar a posição anterior.** Registrar 600/1200 e depois fechamento 0/0 substitui o registro por zero. | `local-progress.ts:36` aceita fechamento sem mídia preparada; o nativo envia 0/0 mesmo quando não criou o player. Preservar o checkpoint anterior em falha/cancelamento; enviar estado de preparação/erro junto do evento. |
| P1 | **Nova posição fica pendente durante um envio.** Upload de 600 s bloqueado, novo registro de 700 s, nova chamada de sync: só uma requisição ocorre; 700 s permanece pendente depois de ambas as chamadas terminarem. | `progress-sync.ts:7` devolve a promessa existente sem reprocessar a fila. Não houve perda local neste teste, mas é necessário outro evento para enviar. Drenar alterações mais recentes por usuário, com retentativa limitada e backoff em falhas. |
| P1 | **Logout depende da rede.** Retendo a resposta de `/auth/logout`, o botão deixa a sessão no armazenamento e a tela continua conectada. | `auth.ts:21` aguarda `fetch` sem timeout antes de `writeSession(null)`. Encerrar a sessão e limpar caches locais imediatamente; tratar a revogação remota separadamente com limite de tempo. |
| P2 | **Categoria perde a página ao voltar.** Página 2 → anime → voltar resulta em página 1. | `CategoriesPage.tsx:36` mantém página somente em `useState(1)`. Persistir na URL e preservar rolagem; resetar apenas quando servidor/categoria mudar. |
| P2 | **Listas não aproveitam metadados recebidos.** Em resposta simulada com poster, nota e gêneros, a linha da categoria ignora esses campos e continua sem eles se AniList não responder. | `CategoriesPage.tsx`, `HomePage.tsx`, `SearchPage.tsx`, `AppScreen.tsx:69`. O contrato atual `ServerAnimeMatch` também não oferece esses metadados, e `/servers/:id/catalog` não consulta o vínculo persistido. Enriquecer por vínculo canônico no backend e consumir esses campos, sem fundir catálogos de providers. Este teste de contrato ampliado não afirma que o endpoint atual já retorne esses campos. |
| P2 | **Notícias salvas têm navegação incoerente.** O atalho do perfil abre `/salvos` em streaming; refresh redireciona à home. | `AccountPage.tsx` oferece a ação, mas `App.tsx:47` aplica uma restrição de modo apenas na montagem. Definir uma regra única: ocultar o atalho nesse modo ou permitir a rota consistentemente. |
| P2 | **Busca perde o termo e os resultados ao voltar.** Pesquisar → abrir anime → voltar mostra campo vazio. | `SearchPage.tsx:11`: termo apenas no estado local. Guardá-lo na URL e restaurar resultados/rolagem. |
| P2 | **Busca falha sem explicar.** Duas respostas 503, incluindo a retentativa, encerram o skeleton sem mensagem ou botão de retry. | `SearchPage.tsx` não renderiza `catalogResults.isError`/`newsResults.isError`. Separar vazio, indisponível e carregando; oferecer repetir/trocar fonte. |

## Falhas verificadas por inspeção / aparelho

### P1 — WebView não recupera erro de rede

No aparelho reinstalado, o CDP mostrou a página padrão “Página da Web não disponível”, primeiro com `ERR_INTERNET_DISCONNECTED`, depois com `ERR_NAME_NOT_RESOLVED` ao recarregar. O manifesto nativo tem fallback em cache, mas `WebViewHost.kt` não trata `onReceivedError`, usa `LOAD_NO_CACHE` e só interrompe o refresh em `onPageFinished`. `MainActivity.kt` retoma timers, não a navegação que falhou.

Corrigir com estado de erro do documento principal, mensagem útil e retry da última URL válida, sem recriar a navegação que já está funcionando. Falha de imagem/subrecurso não deve substituir toda a tela. O código explica a ausência de recuperação, mas **a causa do erro de rede do dispositivo não foi determinada**.

### P1 — Progresso depende de fechar normalmente o player

O fluxo atual publica posição em `sendPlayerClosed`, chamado no fechamento pelo usuário. Não há checkpoint periódico nem captura no pause/background. Morte do processo pode perder todo o avanço desde a abertura. Evidência de código, não teste de encerramento forçado com mídia real nesta rodada.

Adicionar checkpoint local periódico e em pausa; sincronizar com limite de frequência. Não fazer uma gravação remota por segundo. O contrato anuncia `player.progress`, mas o fluxo de persistência efetivo usa `player.closed`.

### P1 — Bloqueio de VPN não se mantém após carregar o manifesto

Em `MainActivity.kt`, `networkAccess` influencia apenas `ShellState.Error`; `ShellState.Ready` sempre monta `AppShell`. Portanto, o controle de estado não aplica a regra anteriormente solicitada quando há manifesto válido/cache ou a VPN é ativada depois. **Não foi testada uma VPN real**. Se essa regra permanecer requisito, bloquear acesso/reprodução sem destruir a árvore de navegação nem disfarçar VPN como erro genérico de internet.

### P1 — Reexecutar release pode alterar o APK público antes de falhar

`.github/workflows/android-staging.yml` envia APK/checksum para o mesmo caminho R2 antes de `gh release create`. Repetir a versão pode sobrescrever o objeto e só depois falhar porque o release GitHub já existe. Se os bytes mudarem, há risco de divergência do SHA-256 anunciado pelo atualizador. Inspeção da ordem do workflow, **não execução destrutiva de teste**.

Validar versão/tag/objeto antes de publicar; tornar artefatos imutáveis e só atualizar manifesto após verificar os dois destinos. Usar novo versionCode/tag para novos APKs. Não repetir o workflow 1.0.37 como teste de publicação.

### P2 — “Reprodução disponível” não é saúde verificada

`ServersPage.tsx` usa `capabilities.playback`, capacidade estática do adapter, para afirmar disponibilidade. O endpoint de saúde existe mas não é consultado pela tela. Usar texto como “Suporta reprodução”; mostrar estado de saúde separado, com horário da consulta, sem prometer que todos os episódios funcionarão.

## Refinamentos de UX e contratos

- O diálogo web de playback ficou centralizado, com erro legível, retry e fechar: manter essa interação. Falta equivalente acionável no erro do player nativo, que atualmente oferece texto e depende do botão voltar do sistema.
- O botão **Sincronizar e atualizar mede 177 × 26 CSS pixels** no viewport testado; tem aparência e área de toque inconsistentes com os demais controles. Padronizar altura, padding, estados de foco e loading dos botões secundários.
- `AnimeListRow` pode consultar AniList por título para cada item sem poster. O cache é da instância do QueryClient; uma nova carga de WebView o perde. Priorizar metadados persistidos por identidade e um enriquecimento em lote/controlado. Não concluo que isso já esgotou quota: o risco decorre da quantidade de chamadas, ainda sem medição sob carga real.
- Busca dispara a partir do segundo caractere, sem debounce nem cancelamento do fetch. Reduzir requisições durante digitação e preservar uma busca confirmada na navegação.
- Perfil agrega quatro consultas em `Promise.all`; falha em notícias pode esconder contagens válidas de favoritos/progresso. Separar estados por seção.
- Menu lateral depende de gesto para descoberta; oferecer uma pista/ação acessível fora do navbar, respeitando o pedido de não trazer “Menu” de volta à barra.
- Não confundir “episódio aberto”, “assistido” e “concluído”. O pedido original aceitava destacar episódios abertos; isso não substitui o histórico sincronizado de consumo.

## Migração do aparelho — trabalho autorizado anterior

## Status das correções nesta rodada

- Separadas as rotas e componentes de `Continuar assistindo` e `Minha lista`; a home mostra apenas uma prévia de continuidade.
- Corrigidos retomada com posição, preservação de progresso em falhas, drenagem de sincronizações concorrentes e logout offline.
- Corrigidos contexto de busca/categorias ao voltar, erros acionáveis, carregamento de metadados persistidos e contadores independentes no perfil.
- Corrigida recuperação de WebView/rede e adicionados testes nativos para progresso e recuperação de documento.
- O APK Direct foi elevado para 1.0.38/10038, sem alterar o flavor Play. A instalação física desta versão depende do aparelho reaparecer no ADB.

- Reinstalado **somente `com.nekoanimes.app`**, 1.0.37-debug / versionCode 10037. `com.nekoanimes.app.debug` permaneceu intacto.
- Antes da remoção, backup privado de dados e APK 1.0.36. Depois, 66 arquivos restaurados e seus SHA-256 comparados: todos iguais, antes do primeiro lançamento.
- Backup em `%LOCALAPPDATA%/NekoAnimes/private-backups/migration-1.0.37`, fora do repositório/OneDrive, com ACL privada. Não inclui cache reconstruível. Restauração binária não equivale a login confirmado na interface.
- Keystore nova preservada localmente e no secret GitHub `NEKO_STAGING_DEBUG_KEYSTORE_BASE64`, com criação verificada em 2026-09-13T22:58:13Z. Envio criptografado conforme [documentação do GitHub](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api). Nenhuma chave privada foi versionada. É assinatura de staging/debug, não keystore definitiva de produção.
- Primeiro lançamento registrou ANR de inicialização (`failed to complete startup`, sem trace disponível). O lançamento seguinte criou o processo e o WebView, mas encontrou os erros de rede descritos acima. Não há evidência suficiente para atribuir o ANR ao código do app, ao backup ou ao sistema.
- Aparelho permaneceu bloqueado na inspeção visual. Desbloqueio solicitado ao usuário; login, reprodução e gesto/back nativos não foram revalidados nesta rodada.
- Auto-update continua **1.0.36**, confirmado publicamente. Nenhum novo workflow/release/deploy foi disparado nesta revisão. Promover 1.0.37 exige concluir runtime e resolver a política de migração dos APKs com certificado antigo; a chave nova não torna assinaturas antigas compatíveis.

## Próxima entrega recomendada

1. Contrato único de playback: identidade canônica + referência do provider + posição inicial + eventos de estado/checkpoint + erros recuperáveis.
2. Fila de progresso confiável e logout local imediato; regressões cobrindo concorrência, cancelamento e mudança de conta.
3. Recuperação de rede e lifecycle nativo, seguida de teste físico de bloqueio/desbloqueio e retorno à página do anime.
4. Estado de busca/paginação na URL, erros acionáveis e metadados vindos dos vínculos persistidos.
5. Pipeline de APK imutável, mesma chave estável e verificação de atualização no aparelho antes da promoção.

Não apagar legados, alterar schema ou reescrever providers para resolver esses pontos. Reaproveitar o que funciona e testar as transições que hoje faltam na cobertura.
