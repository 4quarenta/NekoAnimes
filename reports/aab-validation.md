# Validação do Android App Bundle Play Release

Build limpo em 2026-09-19 com Gradle 9.4.1: `:app:assemblePlayRelease` e `:app:bundlePlayRelease` concluíram. Arquivo: `apps/android/app/build/outputs/bundle/playRelease/app-play-release.aab` (aprox. **6,46 MiB**). `bundletool-all-1.18.3.jar validate --bundle=...` concluiu com exit code 0. `bundletool build-apks --mode=universal` também concluiu e produziu `.apks` (aprox. **3,35 MiB**) com **assinatura debug automática**, apenas para validação local. [Documentação do bundletool](https://developer.android.com/tools/bundletool).

O AAB contém um módulo `base`, sem dynamic feature. Foram encontrados `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` (duas bibliotecas `.so` por ABI). Recursos Android são separados por configuração pelo bundletool; combinações reais de densidade/idioma/dispositivo ainda não foram instaladas. `jar tf` não encontrou `project-overview.md` nem arquivos de `reports/` no AAB.

**BLOQUEADOR ATUAL:** a verificação em 2026-09-20 com `jarsigner -verify -verbose -certs` retornou `jar is unsigned` para o AAB Play Release atual. As quatro variáveis de assinatura `NEKO_RELEASE_*` não estão configuradas nesta sessão; por isso o Gradle agora falha fechado para `assemblePlayRelease` e `bundlePlayRelease` sem elas. Não enviar este AAB à Play Console. O upload e a adesão ao Play App Signing ainda não foram executados.

**NÃO TESTADO:** instalação de APKs derivados em aparelho, splits por densidade/idioma, compatibilidade física com Android 13–16 e assinatura Play App Signing (sem dispositivo/Play Console nesta sessão).

## Verificação final após correções

O último `:app:lintPlayRelease` passou e o bundle anterior ao bloqueio foi produzido com **6.774.842 bytes**, porém sem assinatura. Após fornecer a chave de upload à sessão de build, gerar novamente o AAB, confirmar `jar verified`, executar `bundletool validate` e instalar um APK universal derivado antes do upload. A listagem do AAB não contém `project-overview.md` nem `reports/`.
