# Firebase Test Lab

**NÃO TESTADO.** `gcloud`/Firebase CLI não estão disponíveis neste ambiente e não foi constatada sessão Test Lab com credenciais autorizadas. O Firebase Analytics está configurado no Android, mas isso não concede automaticamente permissão de executar testes pagos/limitados no Test Lab. Nenhum projeto/conta foi criado.

Depois de corrigir os bloqueadores de release e obter APK/AAB assinado:

```bash
gcloud auth login
gcloud config set project nekoanimes-39529
gcloud firebase test android models list
gcloud firebase test android run --type robo --app apps/android/app/build/outputs/apk/play/release/app-play-release.apk --device model=MODEL_PIXEL,version=VERSAO_DISPONIVEL,locale=pt_BR,orientation=portrait --timeout 5m
```

Substituir `MODEL_PIXEL` e `VERSAO_DISPONIVEL` pelos identificadores **retornados no momento** pelo catálogo. Executar matrizes adicionais para Android 13, 14, 15, 16, Samsung equivalente e tablet se disponíveis; verificar custo/cota e estabilidade do dispositivo. Incluir smoke de abertura, navegação, offline, rotação do player e retorno. O Robo Test e a seleção de dispositivos são documentados pelo [Firebase Test Lab](https://firebase.google.com/docs/test-lab/android/command-line) e [catálogo de dispositivos](https://firebase.google.com/docs/test-lab/android/available-testing-devices).
