# Firebase Analytics no Android

O app já contém a integração nativa com `firebase-analytics` e registra eventos sem enviar URLs, tokens, e-mails ou IDs de episódios.

## Ativar o projeto NekoAnimes

1. Abra o [Firebase Console](https://console.firebase.google.com/).
2. Crie ou selecione um projeto exclusivo do NekoAnimes.
3. Ative o Google Analytics durante a criação do projeto ou em **Configurações do projeto > Integrações**.
4. Adicione um aplicativo Android com o pacote `com.nekoanimes.app`.
5. Baixe o `google-services.json`.
6. Coloque o arquivo em `apps/android/app/google-services.json`.

O arquivo é ignorado pelo Git por conter a configuração específica do projeto. Não coloque credenciais privadas ou tokens no APK.

Para ativar o Analytics nos workflows do GitHub Actions, cadastre o secret `NEKOANIMES_FIREBASE_JSON_B64` com o conteúdo Base64 do mesmo arquivo. O workflow recria `apps/android/app/google-services.json` somente durante o build. Não use a configuração de outro projeto.

No PowerShell, gere o valor com:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apps/android/app/google-services.json"))
```

Sem esse arquivo, o app continua compilando e funcionando, mas o wrapper desativa os eventos com segurança porque não existe um FirebaseApp padrão configurado.

## Eventos nativos

- `app_shell_ready`
- `screen_view`
- `player_open`
- `player_close`
- `player_navigation`
- `app_event` para menu e review

Depois de adicionar a configuração, use o **DebugView** do Firebase para conferir os eventos. O Analytics pode levar alguns segundos ou minutos para refletir os eventos em tempo real.
