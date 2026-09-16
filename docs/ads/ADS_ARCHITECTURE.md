# Arquitetura de anúncios

## Formatos aprovados

- Banner
- App Open
- Interstitial

## Camadas

```text
SPA / eventos
    ↓
NekoBridge
    ↓
NekoAdOrchestrator
    ↓
AdProvider
    ↓
Mediação
```

## Estratégia inicial

Motor preferencial:

- AppLovin MAX

Demanda inicial:

- AppLovin
- Google / AdMob
- Meta Audience Network

## Regras

- Configuração vem do Admin/API.
- Frequency caps ficam no `AdPolicyEngine`.
- Banner pertence ao shell nativo.
- App Open é solicitado uma vez por entrada real do aplicativo em primeiro plano,
  incluindo cold start e retorno após ficar em segundo plano.
- Interstitial não é disparado pelo carregamento da Home nem por toda troca de
  navbar: aparece a cada N transições de rota configuradas e no início de um vídeo.
- Em falha de configuração remota na primeira inicialização, anúncios ficam desligados.
- O app Android usa o AppLovin MAX como camada de mediação e inclui os adaptadores oficiais para Google/AdMob e Meta Audience Network.
- A configuração dos três provedores permanece no painel MAX; não há IDs, chaves de rede ou credenciais no código-fonte.

## Android e teste de staging

Credenciais e identificadores ficam fora do controle de versão e são fornecidos como propriedades Gradle:

- `MAX_SDK_KEY`
- `MAX_BANNER_AD_UNIT_ID`
- `MAX_APP_OPEN_AD_UNIT_ID`
- `MAX_INTERSTITIAL_AD_UNIT_ID`
- `maxTestMode=true` (somente build de teste)
- `maxTestDeviceAdvertisingId=<GAID do aparelho de teste>` (somente build de teste; nunca versionar)
- `admobTestMode=true` (build local/CI de teste sem conta MAX)
- `googleAdMobAppId=<App ID do AdMob>` (necessário para Google/AdMob fora do modo de teste)

Sem esses valores, a monetização permanece desligada de forma segura.

### Teste local com Google AdMob

Quando `admobTestMode=true`, o APK Direct Debug usa diretamente o Google Mobile Ads
com os IDs oficiais de demonstração. Isso permite validar a posição e o ciclo de
vida dos três formatos antes de configurar MAX:

- Banner: `ca-app-pub-3940256099942544/6300978111`
- App Open: `ca-app-pub-3940256099942544/9257395921`
- Interstitial: `ca-app-pub-3940256099942544/1033173712`

Esse modo é somente para teste e não valida a mediação AppLovin ou Meta.

| Formato | Ponto de teste | Critério observável |
| --- | --- | --- |
| Banner | shell nativo, acima do navbar | log `format=BANNER` com a rede carregada |
| App Open | cold start/retorno ao app | log `format=APP_OPEN` e anúncio exibido |
| Interstitial | a cada N rotas e no início do vídeo | log `format=INTERSTITIAL` e anúncio exibido |

O Admin/API controla `interstitial.pageTransitionFrequency` (`0` desativa o
gatilho por rota) e `interstitial.showOnEpisodeStart`. `minIntervalMinutes` e
`maxPerSession` continuam sendo aplicados como limites adicionais.

Para testar os três provedores, selecione AppLovin, Google/AdMob e Meta Audience Network no MAX Mediation Debugger/Test Mode do mesmo aparelho, um por vez. O log do SDK deve indicar `Test Mode On: true` e o app registra `network=` para a entrega efetiva.
