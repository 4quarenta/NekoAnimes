# Análise restrita à superfície de envio da Google Play

Data: 2026-09-19.

## Escopo correto

Esta análise não trata o repositório inteiro como se fosse enviado à Google. Ela considera somente:

1. AAB/manifesto/dex/recursos e SDKs incluídos no Play Release.
2. URLs e capacidades que o pacote pode acessar em execução.
3. Política de privacidade pública vinculada ao app.
4. Informações que ainda precisam ser preenchidas no Play Console.

Mesmo assim, a Play não analisa somente bytes do AAB: a revisão pode instalar o app e observar o comportamento, a rede, a WebView, a configuração remota e o conteúdo acessível pelos endpoints públicos.

## Evidências do pacote enviado

- AAB: `apps/android/app/build/outputs/bundle/playRelease/app-play-release.aab`.
- Tamanho: 6.774.842 bytes.
- SHA-256: `D9DFAF4F64512EBF6B2887DCDCF53EA352A55EF722F36E047F1AD288E556CE48`.
- `bundletool validate`: passou.
- Assinatura: presente; `jarsigner` retornou `jar verified`. O upload e o Play App Signing ainda não foram executados.
- `applicationId`: `com.nekoanimes.app`.
- `targetSdk`: 36.
- `minSdk`: 24.
- `allowBackup=false`.
- Cleartext HTTP bloqueado no release.
- `AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION` e `ACCESS_ADSERVICES_AD_ID`: ausentes do manifesto Play mesclado final.
- SDKs de anúncios: não encontrados.
- Firebase Analytics: incluído.
- Google Play In-App Review: incluído.
- Relatórios e `project-overview.md`: não incluídos no AAB.

## O que é um problema real de submissão

### Confirmado

- AAB com assinatura de upload validada localmente; confirmar a adesão ao Play App Signing durante o primeiro envio.
- Data Safety ainda não preenchido/validado no Play Console: bloqueador de declaração, não uma rejeição automática já comprovada.
- Teste físico do pacote assinado não realizado: risco operacional real, mas não prova de rejeição.

### Risco real, mas não decisão do Google

- O app acessa provedores externos, resolve fontes e reproduz vídeos remotos. A ausência de armazenamento próprio não elimina a necessidade de demonstrar autorização para catálogo, imagens, metadados e streams.
- O formulário de remoção foi adicionado, mas remoção posterior não substitui direitos ou licenças documentadas.
- A política de propriedade intelectual da Play deve ser revisada antes da publicação. [Política oficial de propriedade intelectual](https://support.google.com/googleplay/android-developer/answer/9888072).

### Não confirmado

- Conteúdo da ficha da loja, screenshots, classificação etária e declarações do Play Console.
- Resultado de revisão humana da Google.
- Comportamento em aparelho Android durante revisão.
- Dados efetivamente entregues pelo Firebase em uma sessão real; o DebugView estava sem eventos porque o dispositivo não estava conectado.

## Conclusão restrita

O problema de licenciamento não foi inventado a partir de arquivos de auditoria: ele decorre do comportamento que o próprio AAB expõe ao executar, somado aos endpoints remotos que o app acessa. Porém, não é correto afirmar “a Google rejeitará” sem submissão/revisão. A classificação tecnicamente defensável é:

**AINDA NÃO PRONTO PARA ENVIO** — a assinatura foi corrigida, mas as declarações ainda estão incompletas, a validação física/Analytics não terminou e o risco de propriedade intelectual permanece **não confirmado e de alta prioridade**, não uma decisão oficial já tomada.
