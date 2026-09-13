# Revisão dos fluxos — staging 1.0.37

## Identidade e favoritos

- Uma obra salva tem identidade canônica e referências específicas por provider. Favoritos abrem `GET /v1/servers/:serverId/anime?slug=...` no servidor atual, não o detalhe do catálogo legado.
- Primeiro é consultado o vínculo persistido. Sem vínculo, a busca é limitada ao servidor selecionado e aceita um único título/alias normalizado exato. Números e nomes de continuações são preservados. Ausência ou ambiguidade retorna 404/409 com orientação, nunca uma referência de outro provider.
- `PUT /v1/me/provider-library` valida o provider, carrega o detalhe e persiste a obra antes de adicioná-la. Adicionar e remover têm feedback e invalidam o cache da biblioteca.
- Persistência centralizada em `catalog-store.ts`; referências conflitantes não são reatribuídas. Inserção de metadados e vínculos usa um batch transacional D1. Metadados vazios não apagam capa/sinopse/gêneros já existentes.
- O endpoint de carregar dados não aceita que IDs arbitrários enviados pelo cliente alterem vínculos globais. Capa ou sinopse precisam ter sido retornadas pelas fontes consultadas no servidor; caso contrário há erro explícito, não uma falsa confirmação.

## Progresso e contrato

- `ProviderSelectionSchema` e `ProviderProgressSchema` compartilhados validam referências, episódio, temporada, posição e duração.
- `PUT /v1/me/provider-progress` verifica que o episódio pertence à obra/temporada do provider, persiste temporada/episódio canônicos e reutiliza as tabelas existentes de progresso. Não armazena URLs temporárias de vídeo no histórico.
- IDs nativos de episódio agora incluem a referência da página; dois animes com episódio 1 não compartilham mais o mesmo ID de reprodução.
- A home recebe apenas o registro mais recente por obra. Progresso local pendente fica separado por conta, com reenvio ao recuperar conexão/entrar na conta e botão de sincronização no perfil. Falhas não são descartadas silenciosamente.
- Respostas autenticadas usam `private, no-store`; 401 limpa a sessão expirada. Caches pessoais são removidos ao trocar de conta.
- Limite atual: a retomada abre o episódio correto; busca automática do segundo exato no player ainda precisa de extensão do contrato nativo. Numerações incompatíveis entre edições não são convertidas automaticamente.

## Categorias e perfil

- Categorias agora vêm das páginas reais de cada provider, incluindo atributos `title` de links vazios do Animes Digital. Letras, idioma e nomes sem texto válido não são tratados como gêneros.
- A página de categoria usa sua referência real, sem traduzir um gênero MAL para uma URL inventada. Ao trocar servidor/categoria, a paginação volta à primeira página.
- Páginas upstream não são cortadas em 24 itens para depois pular o restante. Goyabu usa o mesmo endpoint público JSON empregado pelo site (`/wp-json/cronos/v1/animes/filter`), incluindo `total_pages`.
- Categorias: cache de 15 minutos; detalhes/episódios do provider: 2 minutos. Metadados externos têm seu cache existente. Resolução de mídia não usa mais o cache de 10 minutos no frontend.
- Perfil mostra contagens consultadas da API, favoritos, progresso, notícias salvas, servidor padrão, horário da consulta e envios pendentes. Não afirma “sincronizado” sem consultar a conta.

## Player e interface

- Ordenação dos episódios ocorre antes do recorte: “mais recentes” realmente começa pelo último episódio.
- Carregamento e erro de abertura aparecem em diálogo central acessível, independente da rolagem; cancelar e tentar novamente são explícitos. Falhas de validação da bridge também são exibidas.
- Spinner nativo observa `STATE_BUFFERING` e a preparação inicial, incluindo o estado já existente antes de registrar o listener. Erros interrompem o spinner e aparecem sobre o player.
- Package preservado: `com.nekoanimes.app`. Somente Direct recebe versionCode 10037/versionName 1.0.37; Play permanece com sua configuração anterior.

## Validação reproduzível

- `npm run typecheck`: todos os workspaces.
- `npm run build`: SPA, NestJS, Worker e admin.
- `npm run test:contracts`: testes com Hono e SQLite real em memória (adapter D1), providers simulados, conflitos, favoritos entre servidores, progresso e isolamento de contas.
- `npm run test:web`: com `npm run preview --workspace @neko/web -- --port 4173` ativo. Chrome headless, API simulada; verifica favorito, ordem de episódios, diálogo visível, erro, retry, bridge, categorias, paginação e perfil. Imagens locais em `test-results/`.
- `node tools/smoke-staging.mjs`: teste real em endpoints públicos e conta temporária. Valida favorito Animes Online → Animes Digital e progresso; remove somente o usuário temporário, suas sessões, lista e progresso por cascade. Vínculos de obras verificados permanecem.
- Testes públicos de categorias: páginas 1 e 2 dos três providers. Goyabu página 2: 30 itens e próxima página disponível.

## Publicação e limites

SPA: https://nekoanimes-staging.pages.dev

API: https://nekoanimes-api-staging.john-alleff01.workers.dev

APK planejado para esta revisão: https://pub-d7e4841d19c54db9bbeedcdc3af062c1.r2.dev/android/v1.0.37/NekoAnimes-v1.0.37.apk

Prerelease: https://github.com/4quarenta/NekoAnimes/releases/tag/v1.0.37-staging

- Workflows manuais; Android CI não sobrescreve releases. Publicação pelo CI exige `NEKO_STAGING_DEBUG_KEYSTORE_BASE64` estável; sem isso, gera apenas Artifact de validação, não um download anunciado pelo atualizador. Isso evita publicar APK com assinatura descartável incompatível.
- Fontes externas podem estar indisponíveis e títulos homônimos/edições exigem vínculo conferido; não prometemos correspondência universal. Vínculos antigos incorretos não foram apagados automaticamente.
- Nenhum recurso de SICC, SnapGym ou ConcursoMestre foi alterado. Banco e infraestrutura existentes do NekoAnimes foram preservados.
- A compilação local inicial falhou por falta de espaço no disco. A tentativa de limpeza foi bloqueada pelo ambiente e nenhum diretório foi excluído; após o npm finalizar houve espaço para retomar. Manter espaço livre é necessário para futuras compilações.
- Dependências reportaram alertas no `npm install`; não foi executado `npm audit fix --force` nem migração automática com breaking changes.
