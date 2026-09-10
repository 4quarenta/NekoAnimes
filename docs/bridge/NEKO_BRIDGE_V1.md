# NekoBridge v1

## Transporte

Android:

- AndroidX WebKit;
- `WebViewCompat.addWebMessageListener`;
- origem explicitamente permitida;
- somente mensagens do main frame são aceitas.

iOS futuro:

- WKWebView;
- contrato JavaScript equivalente.

## Envelope Web -> Nativo

```json
{
  "id": "uuid",
  "type": "player.open",
  "payload": {
    "episodeId": "ep_123"
  }
}
```

## Eventos iniciais

Web -> Nativo:

- `navigation.routeChanged`
- `player.open`
- `ads.event`

Nativo -> Web:

- `navigation.navigate`

## Regras

1. Toda mensagem deve ser validada.
2. Eventos desconhecidos devem ser ignorados.
3. A bridge nunca deve ser exposta a origens externas.
4. Segredos nunca transitam para a SPA.
5. O contrato deve ser versionado antes de breaking changes.
