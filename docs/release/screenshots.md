# NekoAnimes — plano de screenshots para a Play Store

Status: roteiro preparado; screenshots finais ainda não estão aprovadas.

## Regra de qualidade

As imagens finais devem ser capturadas no APK assinado que será enviado ao teste interno, com o mesmo manifest/configuração de staging. As capturas existentes em `test-results/` são referências de smoke test e podem conter dados sintéticos, WebView ou estado antigo; não devem ser copiadas para a ficha sem uma revisão visual final.

## Conjunto recomendado

| Ordem | Tela | O que precisa aparecer | Estado |
| --- | --- | --- | --- |
| 1 | Início | Logo, busca, continuar assistindo ou estado vazio compreensível e catálogo em destaque | Capturar no APK final |
| 2 | Categorias | Lista de categorias reais do servidor, com navegação clara | Capturar no APK final |
| 3 | Itens de uma categoria | Paginação, posters, tipo, avaliação e gêneros | Capturar no APK final |
| 4 | Detalhes da obra | Poster/backdrop, sinopse, temporadas, ação de salvar e metadados | Capturar no APK final |
| 5 | Episódios | Grade numerada, ordem e indicação de episódio já aberto | Capturar no APK final |
| 6 | Continuar assistindo | Card com obra, episódio e progresso visível | Capturar com dados de teste não pessoais |
| 7 | Player | Player nativo em paisagem, controles e título do episódio sem erro visível | Capturar somente com uma fonte autorizada/de teste |
| 8 | Minha lista | Obras salvas localmente, sem expor e-mail ou identificador do usuário | Capturar no APK final |

## Capturas já existentes

Estas imagens ajudam a orientar a composição, mas não são consideradas aprovadas para envio:

- `test-results/anime-detail.png` — detalhe e grade de episódios da SPA;
- `test-results/device-after-pages-deploy.png` — captura de smoke test com barra do Android;
- `test-results/profile.png` — lista local em estado de teste.

## Bloqueio atual

Não há dispositivo Android disponível no `adb devices` nesta etapa. Por isso ainda não é possível produzir screenshots finais do APK assinado nem confirmar a aparência em diferentes densidades. Assim que o aparelho voltar:

```powershell
adb devices -l
adb install -r "apps/android/app/build/outputs/apk/debug/app-play-debug.apk"
adb shell am force-stop com.nekoanimes.app
adb shell monkey -p com.nekoanimes.app 1
adb exec-out screencap -p > test-results/play-home-final.png
```

Repetir a captura após navegar a cada tela, remover dados pessoais e conferir se o conteúdo exibido é adequado para a ficha. Não enviar screenshots de erro, loading, URLs de providers, tokens, e-mails ou dados de conta.

## Aprovação antes do upload

- conferir que o texto visível está em português correto;
- conferir que logo, tema e nome do app estão atualizados;
- confirmar que o player não mostra uma fonte sem autorização;
- confirmar que nenhuma captura contradiz a ficha, a classificação ou o Data Safety;
- exportar no formato aceito pelo Play Console, sem bordas artificiais ou molduras que escondam o app.

Referência: [boas práticas oficiais para a ficha da loja](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en).
