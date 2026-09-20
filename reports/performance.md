# Performance e estabilidade

**Medição em aparelho NÃO TESTADA**: sem ADB conectado nesta rodada. Sem números confiáveis de cold/warm start, jank, CPU, heap, bateria, ANR ou tráfego real.

## Inspeção estática e build

- AAB Play Release após R8/resource shrink: aprox. 6,46 MiB. `bundletool build-apks --mode=universal` gerou conjunto de 3,35 MiB; tamanho instalado real depende do split/dispositivo.
- `AppManifestRepository` usa `Dispatchers.IO` e timeout de conexão/leitura de 4 s, com cache local de manifesto. Falha DNS dos hosts de release resulta em tela de erro na primeira instalação; bloqueador funcional, não apenas latência.
- Player Media3 faz checkpoint a cada 15 s quando reproduzindo e pausa no background. `BloggerVideoResolver` cria WebView invisível por reprodução com timeout de 30 s; validar carga, descarte e consumo de memória em episódios sucessivos.
- SPA usa TanStack Query e paginação por provedor. `PosterImage` usa `loading="eager"` para linhas da lista; telas longas podem carregar muitos posters de uma vez. O fallback por proxy incrementa `attempt` sem limite: se origem e proxy falharem, o mesmo `img` pode entrar em novas tentativas/renderizações; correção determinística após auditoria.
- `CategoriesPage` dispara `fetchServers` sem consumir seu resultado; chamada de rede redundante. Remoção de baixo risco possível após verificação.
- Busca direta de AniList na SPA não tem timeout; pode manter estado de carregamento indefinidamente. Outros helpers de API usam `AbortSignal.timeout(30000)`.
- O código de WebView implementa `onRelease` com `stopLoading()`/`destroy()`, mas lint encontrou falta de `onRenderProcessGone`, risco de crash se o processo de renderização for morto por memória.

## Próximas medições

Usar `adb shell am start -W`, Perfetto/Android Studio Profiler e Play Vitals em aparelhos Android 13–16; medir 10 partidas frias/quentes, navegação longa com posters, player por 30 min, retorno do background, rede lenta/offline e memória após múltiplos episódios. Verificar que nenhum loader fica infinito e que o WebView se recupera de OOM.
