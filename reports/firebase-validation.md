# Validação do Firebase — NekoAnimes

Data: 2026-09-19.

## Configuração confirmada

- Projeto Firebase: `nekoanimes-39529`.
- Aplicativo Android registrado: `com.nekoanimes.app`.
- Console acessível com a conta autorizada.
- Plano exibido: Spark, sem custo mensal.
- Analytics habilitado e dashboard acessível.
- `google-services.json` local corresponde ao projeto e ao package do app.

## Resultado do DebugView

O Realtime/DebugView foi aberto no console para o app Android correto. No momento da validação, o console mostrou:

- Usuários ativos nos últimos 30 minutos: `0`.
- Usuários ativos nos últimos 5 minutos: `0`.
- Contagem de eventos em tempo real: sem dados.

Isso não prova que o SDK está quebrado. O ADB estava sem dispositivo conectado durante a tentativa de execução; portanto nenhuma sessão real foi gerada nesta rodada.

Status: **CONFIGURAÇÃO VALIDADA; FLUXO END-TO-END NÃO TESTADO**.

## Eventos esperados no código

- `app_shell_ready`.
- `screen_view`.
- `player_open`.
- `player_close`.
- `player_navigation`.
- `app_event` com `menu_open` ou `review_request`.

## Procedimento pendente no aparelho

```powershell
adb devices
adb -s ID_DO_APARELHO shell setprop debug.firebase.analytics.app com.nekoanimes.app
adb -s ID_DO_APARELHO install -r caminho\para\app-direct-debug.apk
adb -s ID_DO_APARELHO shell monkey -p com.nekoanimes.app 1
```

Depois, abrir o Firebase Console em Analytics > DebugView, usar o app por alguns minutos e confirmar os eventos acima. Ao terminar:

```powershell
adb -s ID_DO_APARELHO shell setprop debug.firebase.analytics.app .none.
```

O Advertising ID está desativado no Analytics e as permissões correspondentes foram removidas do manifesto Play final.
