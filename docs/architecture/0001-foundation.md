# ADR 0001 — Fundação híbrida NekoAnimes

## Status

Aprovada.

## Decisão

O produto usa:

- Android nativo em Kotlin/Jetpack Compose;
- navbar nativa;
- WebView como superfície principal de conteúdo;
- SPA React remota;
- bridge bidirecional com AndroidX WebKit;
- player nativo futuro via Media3/ExoPlayer;
- iOS futuro via Swift/SwiftUI/WKWebView/AVPlayer;
- API NestJS/Fastify;
- Admin Next.js.

## Fronteira Web/Nativo

Web:

- home;
- catálogo textual;
- busca;
- página de anime;
- temporadas;
- episódios;
- notícias;
- artigos;
- biblioteca visual.

Nativo:

- navbar;
- player;
- PiP;
- downloads;
- notificações;
- deep links;
- compartilhamento;
- secure storage;
- permissões;
- anúncios;
- integrações de sistema.

## Regra

A SPA não acessa SDK nativo diretamente. Toda integração passa pelo contrato versionado `NekoBridge`.
