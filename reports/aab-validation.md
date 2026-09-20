# Validação do Android App Bundle Play Release

Build limpo em 2026-09-19 com Gradle 9.4.1: `:app:assemblePlayRelease` e `:app:bundlePlayRelease` concluíram. Arquivo: `apps/android/app/build/outputs/bundle/playRelease/app-play-release.aab` (aprox. **6,46 MiB**). `bundletool-all-1.18.3.jar validate --bundle=...` concluiu com exit code 0. `bundletool build-apks --mode=universal` também concluiu e produziu `.apks` (aprox. **3,35 MiB**) com **assinatura debug automática**, apenas para validação local. [Documentação do bundletool](https://developer.android.com/tools/bundletool).

O AAB contém um módulo `base`, sem dynamic feature. Foram encontrados `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` (duas bibliotecas `.so` por ABI). Recursos Android são separados por configuração pelo bundletool; combinações reais de densidade/idioma/dispositivo ainda não foram instaladas. `jar tf` não encontrou `project-overview.md` nem arquivos de `reports/` no AAB.

**ASSINATURA VALIDADA:** em 2026-09-20 o AAB Play Release foi reconstruído com a keystore de upload mantida fora do repositório. `jarsigner -verify -verbose -certs` retornou `jar verified` e o bundle passou em `bundletool 1.18.3 validate`. O upload e a adesão ao Play App Signing ainda não foram executados.

**NÃO TESTADO:** instalação de APKs derivados em aparelho, splits por densidade/idioma, compatibilidade física com Android 13–16 e assinatura Play App Signing (sem dispositivo/Play Console nesta sessão).

## Verificação final após correções

O `:app:lintPlayRelease`, os testes Play Debug e o `:app:bundlePlayRelease` passaram no processo protegido de assinatura. O AAB final possui **6.786.386 bytes**, SHA-256 `3273B4899F582C567626C23967A5351C121D64EA9C94CCA17FE406A1A413A874`, assinatura válida e estrutura aceita pelo bundletool. A listagem do AAB não contém `project-overview.md` nem `reports/`.
