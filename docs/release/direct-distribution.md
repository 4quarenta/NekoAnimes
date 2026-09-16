# NekoAnimes — distribuição Android direta

## Canais

O Android possui dois flavors de distribuição:

- `direct`: gera APK instalável diretamente e habilita o atualizador interno.
- `play`: gera o AAB destinado à Google Play e não solicita `REQUEST_INSTALL_PACKAGES`.

## GitHub

O workflow `Android Release` gera:

- `NekoAnimes-vX.Y.Z.apk`
- `NekoAnimes-vX.Y.Z.apk.sha256`
- `NekoAnimes-vX.Y.Z.aab`

Os três arquivos são anexados a uma GitHub Release com a tag informada no `workflow_dispatch`. Em um repositório privado, esses assets são adequados para download manual por usuários autenticados no GitHub.

## Atualização dentro do aplicativo

O APK `direct` consulta `GET /v1/app-update/android`. O backend informa `versionCode`, `versionName`, URL HTTPS do APK, SHA-256 e se a atualização é obrigatória.

O Android baixa o APK para o cache privado, limita o arquivo a 250 MiB, calcula SHA-256 e só abre o instalador do sistema quando o hash é exatamente o esperado.

Nunca incluir GitHub PAT, `GITHUB_TOKEN` ou outro token privado no APK. Portanto, se o repositório de código continuar privado, a URL usada por `ANDROID_APK_URL` precisa ser publicamente legível via HTTPS. Opções recomendadas: um repositório GitHub público contendo apenas binários/releases, Cloudflare R2 público controlado ou outro CDN de downloads. O código-fonte continua privado.

## Variáveis do backend

Depois que o APK estiver publicado em uma URL pública:

```env
ANDROID_LATEST_VERSION_CODE=10001
ANDROID_LATEST_VERSION_NAME=1.0.1
ANDROID_APK_URL=https://downloads.example/NekoAnimes-v1.0.1.apk
ANDROID_APK_SHA256=<64 caracteres hexadecimais>
ANDROID_UPDATE_REQUIRED=false
```

Para atualização obrigatória, altere `ANDROID_UPDATE_REQUIRED=true`.

## Secrets do workflow de release

O GitHub Actions precisa de:

- `NEKO_RELEASE_KEYSTORE_BASE64`
- `NEKO_RELEASE_STORE_PASSWORD`
- `NEKO_RELEASE_KEY_ALIAS`
- `NEKO_RELEASE_KEY_PASSWORD`

## Fluxo para nova versão

1. Atualizar `versionCode` e `versionName` no Gradle.
2. Executar manualmente `Android Release` com uma tag, por exemplo `v1.0.1`.
3. Conferir APK, SHA-256 e AAB anexados à Release.
4. Copiar o APK para o canal público de downloads, se o repo de código continuar privado.
5. Atualizar as variáveis `ANDROID_*` na API.
6. Abrir uma versão anterior do APK direct e validar o aviso de atualização, download, verificação e instalação.

## Observação para Google Play

O flavor `play` não deve usar o instalador direto. Atualizações da versão distribuída pela Play devem seguir o mecanismo da loja. Isso mantém a permissão de instalação de pacotes fora do AAB da Play.
