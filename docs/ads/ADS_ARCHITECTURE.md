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
- App Open respeita cooldown e elegibilidade.
- Interstitial só aparece em pontos de transição permitidos.
- Em falha de configuração remota na primeira inicialização, anúncios ficam desligados.
- SDKs reais entram na Etapa 11.
