# Arquitetura do player

## Android

Planejado:

- AndroidX Media3;
- ExoPlayer;
- Activity/Surface nativa fullscreen;
- HLS/DASH/MP4;
- legendas;
- múltiplos áudios;
- PiP;
- progresso;
- próximo episódio.

## Fluxo

```text
SPA
  ↓ player.open(episodeId)
NekoBridge
  ↓
PlayerCoordinator
  ↓
Media3 / ExoPlayer
```

O player web não será usado como implementação principal.

## iOS futuro

- AVKit
- AVPlayer
- mesma operação `player.open` na bridge
