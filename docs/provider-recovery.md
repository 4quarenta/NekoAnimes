# Recuperação de obras salvas entre servidores

## Fluxo

- Quando uma obra salva não abre no servidor selecionado, a tela mantém seu título/poster e explica que o favorito e o progresso foram preservados.
- A busca é automática no servidor selecionado, usando até dois títulos canônicos/alternativos e deduplicando as referências. Sugestões não criam vínculos.
- Outros servidores aparecem somente quando já possuem um vínculo da obra e sua página pode ser consultada sem redirecionar para outra referência. A troca revalida a referência, salva o novo padrão e abre diretamente a obra.
- Ao tocar em uma sugestão, uma comparação mostra a obra salva e o resultado, com tipo, ano disponível e quantidade de temporadas/episódios. Somente “Sim, vincular e abrir” grava o vínculo.
- “Não, abrir separadamente” navega para o item original do provider, sem gravar vínculo. Fechar a comparação não modifica dados.

## Contratos

`GET /v1/servers/:serverId/recovery?slug=<slug salvo>`

Resposta pública, sem cache HTTP: `work`, `server`, `available`, `matches`, `searchFailed`, `availabilityFailed`. A descoberta não escreve no banco. Falhas externas são distintas de busca vazia. As consultas de páginas reaproveitam o cache temporário já existente do provider.

`POST /v1/me/provider-links`

Requer sessão e que o usuário tenha a obra na biblioteca ou no progresso. Corpo validado por `ConfirmProviderLinkSchema`: `serverId`, `reference`, `workSlug`, `expectedTitle`, `confirmed: true`.

O backend reconsulta a referência, verifica título da prévia, redirecionamentos e tipo; depois insere condicionalmente em `anime_external_ids`. Nunca recebe um MAL ID escolhido pelo cliente. O novo provider referencia o mesmo `anime.id` e herda seus identificadores MAL/AniList e metadados. Se não existe MAL ID, mantém a identidade interna compartilhada, sem inventar ID.

Vínculos para outro `anime.id` retornam 409 e exigem revisão: não são fundidos automaticamente, mesmo após confirmação. Isso evita reatribuir silenciosamente biblioteca/progresso de outras contas. A operação é idempotente e não sobrescreve metadados, favoritos nem progresso. Não há migração de schema.

Na reabertura, referências já persistidas prevalecem sobre diferenças de título localizado. Referências novas têm prioridade; um vínculo antigo indisponível não impede a leitura de outro vínculo válido. Redirecionamentos para outra referência continuam bloqueados. Buscas sem vínculo mantêm a regra de título exato e sem ambiguidades.

## Validação

- `npm run typecheck`
- `npm run test:contracts`: descoberta sem escrita, autenticação, confirmação explícita, conflitos, aliases, MAL ausente, tipos/redirecionamentos, idempotência, referência antiga, biblioteca e progresso canônicos.
- `npm run build:web`
- Preview Vite em 4173 + `npm run test:web`: busca automática, comparação, recusa sem escrita, troca exata/padrão salvo, erro de conflito, confirmação/reabertura e layout de 320px.
- Capturas de validação local: `test-results/provider-recovery.png` e `test-results/provider-comparison.png` (fixtures de teste, não dados publicados).

Alteração web/API: não exige um novo APK. Recarregue a SPA no app após a publicação. A disponibilidade da página do provider não garante que todos os vídeos estejam online.
