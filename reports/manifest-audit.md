# Manifest e permissões — flavor Play Release

Fonte: `apps/android/app/src/main/AndroidManifest.xml`, overlays `direct`/`debug`, e `apps/android/app/build/intermediates/merged_manifests/playRelease/processPlayReleaseManifest/AndroidManifest.xml` gerado no build de 2026-09-19. A lista abaixo é do **manifest mesclado**, não só do arquivo fonte.

| Permissão Play Release | Classificação | Evidência e ação |
| --- | --- | --- |
| `android.permission.INTERNET` | NECESSÁRIA | SPA, API, player e Analytics. |
| `android.permission.ACCESS_NETWORK_STATE` | NECESSÁRIA | `MainActivity.rememberNetworkAccess` diferencia offline/VPN. |
| `android.permission.WAKE_LOCK` | PROVAVELMENTE NECESSÁRIA | Introduzida por Media3/serviços transitivos; confirmar origem no merger report. |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` | QUESTIONÁVEL | Transitiva do ecossistema Google; não há uso direto identificado. Confirmar necessidade/atribuição no SDK Index. |
| `com.google.android.gms.permission.AD_ID` | REMOVIDA DO PLAY RELEASE | Dependência transitiva do Firebase; coleta desativada e permissão removida com `tools:node="remove"` porque não há anúncios/atribuição nesta versão. Reavaliar se o produto mudar. |
| `android.permission.ACCESS_ADSERVICES_ATTRIBUTION` | REMOVIDA DO PLAY RELEASE | Capacidade transitiva sem uso de anúncios/atribuição; removida explicitamente do manifesto final. |
| `android.permission.ACCESS_ADSERVICES_AD_ID` | REMOVIDA DO PLAY RELEASE | Capacidade transitiva sem uso de anúncios/atribuição; removida explicitamente do manifesto final. |
| `com.nekoanimes.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | PROVAVELMENTE NECESSÁRIA | Permissão de assinatura gerada por dependência AndroidX; sem acesso externo genérico. |

`REQUEST_INSTALL_PACKAGES` está **somente no flavor Direct**, não no Play Release mesclado. O Play define `SELF_UPDATE_ENABLED=false`. As permissões sensíveis listadas na solicitação (mídia/armazenamento, localização, câmera, microfone, contatos, telefone/SMS, notificações, alarmes, overlay, package visibility, foreground service) não apareceram no Play Release mesclado. Isto não cobre permissões adicionadas por versões futuras dos SDKs.

## Componentes e configuração

- `MainActivity`: `exported=true`, apenas `MAIN`/`LAUNCHER`; orientação portrait, player muda orientação em runtime. Nenhum deep link/app link declarado.
- `FileProvider`: `exported=false`, autoridade restrita ao pacote, `cache-path` `updates/`. Permanece no flavor Play embora o instalador Direct não seja usado; avaliar retirada específica do Play em mudança posterior, sem pressa.
- Firebase/Measurement: `FirebaseInitProvider`, services, receiver e `GoogleApiActivity` não exportados.
- `androidx.profileinstaller.ProfileInstallReceiver`: `exported=true`, protegido por `android.permission.DUMP`. Risco residual baixo; confirmar no SDK Index/manifest merger.
- `android:allowBackup=false`; `android:usesCleartextTraffic=false` e configuração de rede principal negando cleartext. Debug abre cleartext apenas para localhost e `10.0.2.2`.
- `isDebuggable=false` no release; R8 e resource shrinking ativados.
- `android:screenOrientation=portrait` na activity e mudança para landscape no player. Validar comportamento em Android 16 e telas grandes fisicamente.

## Conclusão

O manifest Play não solicita instalação de APK externo nem permissões perigosas clássicas. O Advertising ID não aparece no manifesto mesclado final e a coleta foi desativada; Analytics, consentimento e Data Safety ainda precisam ser conferidos no Firebase/Play Console. [Configuração oficial do Firebase Analytics](https://firebase.google.com/docs/analytics/android/configure-data-collection) e [declarações de permissões no Play Console](https://support.google.com/googleplay/android-developer/answer/9214102?hl=en).
