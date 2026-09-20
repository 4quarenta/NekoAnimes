# Pré-análise de políticas Google Play

Data: 2026-09-19. Base: código atual, manifest Play mesclado, checagem dos hosts de release, e políticas oficiais. Esta análise **não é aprovação da Google** nem parecer jurídico.

## Bloqueadores e decisões

1. **Direitos sobre conteúdo de terceiros — ALTO RISCO / NÃO RECOMENDADO PARA PUBLICAÇÃO.** O Worker contém adaptadores para `animesdigital.org`, `animesonlinecc.to` e `goyabu.io`; resolve episódios/fontes e o app reproduz vídeos em ExoPlayer/Blogger. O repositório não contém documentação de licença/autorização para catálogos, imagens e streams. A política Play proíbe apps que incentivem ou facilitem streaming não autorizado. Verificar origem e direitos de **cada** fonte, imagens e metadados, guardar autorizações por escrito e obter revisão jurídica antes de enviar. Não foi presumido que todo conteúdo seja ilícito; o direito de distribuição é **NÃO CONFIRMADO**. [Política de propriedade intelectual](https://support.google.com/googleplay/android-developer/answer/9888072?hl=en).
2. **Domínios de produção ainda não provisionados — BLOQUEADOR PARA PRODUÇÃO, não para o staging temporário.** `app.nekoanimes.com` e `api.nekoanimes.com` falharam em DNS na checagem de 2026-09-19. O `playRelease` agora embute explicitamente os hosts isolados de staging, que retornaram HTTP 200; isso permite teste temporário, mas não deve ser confundido com infraestrutura de produção.
3. **Política de privacidade pública — CORRIGIDA TECNICAMENTE, revisão jurídica pendente.** A página foi publicada em `https://nekoanimes-staging.pages.dev/privacidade`, vinculada à UI e verificada no navegador; cobre Analytics, reports, armazenamento local, provedores e contato `dev.app.440@gmail.com`. O texto ainda requer revisão humana antes da publicação ampla. [User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en-GB).
4. **Data Safety — ALTA PRIORIDADE / REVISÃO HUMANA.** A coleta do Advertising ID foi desativada no Analytics e as permissões `AD_ID`/Ad Services foram removidas do manifesto Play final. Ainda é necessário confirmar o projeto Firebase, retenção, dados automáticos e preencher o Play Console fielmente. [Orientação Firebase](https://firebase.google.com/docs/analytics/android/configure-data-collection).

## Funcionalidades e implicações

| Tema | Evidência | Estado / ação |
| --- | --- | --- |
| API target | `targetSdk=36` | Atende ao requisito vigente desde 31/08/2026 para novos apps mobile. [Regra oficial](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) |
| WebView | SPA própria por origem fixa, player nativo, bridge com verificação da origem | Há valor nativo além do WebView. Validar propriedade/permissão da SPA e experiência funcional; a política de spam cobre WebViews sem permissão. [Spam](https://support.google.com/googleplay/android-developer/answer/9899034?hl=en) |
| Anúncios | SDKs de anúncios não encontrados | Declaração “contém anúncios” deve acompanhar build e SPA publicados. Analytics não implica banner/interstitial. |
| Billing/assinaturas | Não encontrados | NÃO APLICÁVEL no código examinado; revisar se conteúdo remoto puder introduzir pagamentos. |
| Conta e exclusão | UI atual diz que conta não é necessária; rotas `auth/register` e código cliente legado existem | Se criação de conta ficar acessível pelo app/site servido, requer exclusão no app e via web; dados associados e retenção devem ser tratados. [Requisito oficial](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) |
| Reviews | In-App Review nativo | Conferir que não condiciona benefício a nota positiva nem promete que o diálogo sempre aparece. |
| Kids/Families | Público-alvo não definido no repo | NÃO CONFIRMADO — definir faixa etária e classificação no Play Console; conteúdo de anime pode variar. |
| Notícias/UGC | Tela de notícias e formulário de report, sem publicação pública do report identificada | Avaliar declaração como app de notícias conforme modo remoto; UGC público não confirmado. |
| Avisos de remoção | Formulário público permite informar provedor, URL e justificativa; administração pode desativar fontes | Melhoria operacional aplicada. Não substitui comprovação de direitos, triagem, registro de decisões e análise jurídica. |
| Notificações, localização, fotos, saúde, finanças | Não detectados no Play manifest/código Android | Sem implicação específica identificada neste build; revisar após mudança remota. |
| Impersonation/metadados | Marca NekoAnimes e arte própria; catálogo usa títulos/imagens de obras de terceiros | Verificar direitos de arte, descrição e screenshots na ficha da loja. |
| Play Integrity | Não encontrado | Não implementar automaticamente. Pode ajudar se futuramente houver API privada, contas sensíveis ou conteúdo licenciado; validar falsos positivos/offline antes de exigir. |

## Próximo gate

Para uma distribuição temporária de teste, o staging agora é funcional e a política está pública. Ainda não enviar o AAB enquanto o bundle não estiver assinado, Data Safety não estiver validado, o teste físico não tiver sido feito e os direitos/licenças de streaming/imagens não estiverem documentados. Domínios de produção continuam sendo gate separado para lançamento público.
