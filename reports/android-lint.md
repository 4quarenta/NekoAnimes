# Android Lint — Play Release

Execução inicial (2026-09-19): `gradle --no-daemon clean :app:assemblePlayDebug :app:assemblePlayRelease :app:bundlePlayRelease :app:testPlayDebugUnitTest :app:testDirectDebugUnitTest :app:lintPlayRelease`. Build, bundle e testes unitários chegaram ao fim; a task agregada terminou com exit code 1 porque **lint falhou**. Resultado: **30 Errors, 48 Warnings, 2 Hints**. Relatórios completos em `apps/android/app/build/reports/lint-results-playRelease.html` e `apps/android/app/build/intermediates/lint_intermediate_text_report/playRelease/lintReportPlayRelease/lint-results-playRelease.txt`.

| Severidade | Regra | Contagem | Causa identificada / tratamento |
| --- | --- | ---: | --- |
| Error | `UnsafeOptInUsageError` | 29 | Media3 exige opt-in explícito de `UnstableApi` em `NekoPlayerScreen`/wrapper de navegação. Correção de baixo risco: adicionar `@OptIn` nos pontos de uso, sem desabilitar lint. |
| Error | `ContextCastToActivity` | 1 | `LocalContext.current as ComponentActivity` em `AppShell`; Compose fornece `LocalActivity`. Substituição de baixo risco com cast para `ComponentActivity` após obter `LocalActivity`. |
| Warning | `MissingOnRenderProcessGone` | 0 | `WebViewHost` e `BloggerVideoResolver` agora tratam o renderer encerrado; a recuperação ainda exige validação física em diferentes Androids. |
| Warning | `RequiresFeature` | 3 | Bridge usa `WEB_MESSAGE_LISTENER`; guarda existe em `attach`, mas lint não demonstra que protege callbacks. Revisar em runtime/versões antigas; evitar supressão cega. |
| Warning | `SetJavaScriptEnabled` | 2 | Necessário à SPA e ao player Blogger; restringir origem, CSP e conteúdo ativo. |
| Warning | `GradleDependency` | 8 | `compileSdk 37` e versões mais novas de core/lifecycle/Media3; atualização exige regressão. |
| Warning | `UseKtx` | 21 | Sugestões estilísticas; não bloqueiam Play. |
| Warning | `LockedOrientationActivity` / `DiscouragedApi` | 1 / 1 | Portrait fixo será ignorado em muitos cenários Android 16/telas grandes; testar navegação e player adaptativos. |
| Warning | `DataExtractionRules` | 1 | Falta `android:dataExtractionRules` explícito para Android 12+, embora `allowBackup=false`. Rever política de backup/transferência antes de configurar. |
| Warning | `ClickableViewAccessibility` | 1 | Listener de touch do WebView não usa `performClick`; verificar TalkBack/gestos sem quebrar cliques da SPA. |
| Warning | `OldTargetApi` | 1 | Lint local detecta SDK 37 disponível; política Play vigente exige 36, já atendido. Não elevar target sem teste de compatibilidade. |
| Hint | `AutoboxingStateCreation` | 2 | `mutableStateOf(Int)` no player poderia usar `mutableIntStateOf`; micro-otimização, sem bloqueio. |

Nenhuma regra foi desativada ou colocada em baseline. Após substituir o cast de contexto por `LocalActivity`, aplicar `androidx.annotation.OptIn` nos usos de Media3 e tratar o renderer da WebView, `:app:lintPlayRelease` terminou com **0 Errors, 44 Warnings, 3 Hints** (exit code 0; execução final de 2026-09-19). A primeira tentativa com `kotlin.OptIn` não satisfazia esta verificação do Media3; ela foi substituída antes do lint final. Os avisos de acessibilidade, orientação e privacidade ainda exigem revisão e teste físico.
