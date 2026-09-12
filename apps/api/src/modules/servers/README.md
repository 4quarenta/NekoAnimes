# Servers module

Camada padronizada de descoberta de disponibilidade por fontes externas.

## Providers iniciais

- `goyabu` → `https://goyabu.io`
- `animesonlinecc` → `https://animesonlinecc.to`

Cada provider implementa o mesmo contrato `ServerAdapter`. O restante da API não depende do HTML ou das rotas específicas de cada site.

## Endpoints

### Listar providers

`GET /v1/servers`

### Health check

`GET /v1/servers/health`

### Buscar um anime em todos os providers

`GET /v1/servers/search?q=bleach`

Retorna resultados por provider, com `reference` interna e `confidence`.

### Obter temporadas/episódios de um provider

`GET /v1/servers/:serverId/anime?ref=/anime/bleach/`

A referência sempre é um path relativo ao host allowlisted do adapter. URLs arbitrárias não são aceitas, evitando que esse módulo se torne um proxy SSRF.

### Resolver episódio diretamente

`GET /v1/servers/resolve/bleach/1/15`

Procura o anime nos providers, consulta a estrutura normalizada e informa em quais fontes o episódio está disponível.

### Obter metadados de uma página de episódio

`GET /v1/servers/:serverId/episode?ref=/episodio/bleach-episodio-1/`

## Contrato de reprodução

Os providers desta etapa são de **descoberta/metadados**. Eles não extraem players, tokens, iframes ou URLs de mídia. Por isso `capabilities.playback=false` e o detalhe de episódio retorna `playback.available=false`.

Uma fonte própria/licenciada pode implementar `playback=true` no futuro sem alterar o contrato público dos demais providers.

## Proteções

- apenas HTTPS;
- hosts fixos por adapter;
- redirect final precisa permanecer no mesmo host;
- timeout por request;
- resposta HTML limitada a 3 MiB;
- referências externas limitadas a paths do provider;
- falha de um provider não derruba os demais;
- cache Redis com fallback em memória;
- TTL separado para busca, anime, episódio e resolução.

## Adicionando um novo provider

1. criar `adapters/<provider>/<provider>.adapter.ts`;
2. estender `BaseHtmlServerAdapter` ou implementar `ServerAdapter` diretamente;
3. definir `descriptor` e regras específicas de referência;
4. registrar em `ServerRegistry` e `ServersModule`.
