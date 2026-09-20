# Privacidade e rascunho de Data Safety

Este documento é **rascunho técnico**, não resposta definitiva do formulário. A configuração do Firebase, do Worker, das páginas servidas remotamente e dos provedores pode mudar após o build. Conferir tráfego real e políticas dos fornecedores antes da declaração. [Orientação oficial do Firebase para Data Safety](https://support.google.com/analytics/answer/11582702?hl=en).

| Dado | Origem e destino observados | Finalidade | HTTPS? | Terceiro / status |
| --- | --- | --- | --- | --- |
| Eventos de abertura, telas, player, menu/review; identificadores de app/instalação/dispositivo | `NekoAnalytics` e coleta automática Firebase → Google/Firebase | Analytics | Sim, pelo SDK; confirmar configuração | Google; **COLETA CONFIRMADA PELO CÓDIGO**, entrega real não observada nesta auditoria |
| Advertising ID e sinais de atribuição | Permissões transitivas Firebase/Google Measurement → Google | Medição/atribuição possível | SDK | **POTENCIAL**; ID não observado em tráfego; confirmar se coletado/necessário |
| IP, user-agent, requisições e termos de busca | WebView/SPA → Cloudflare Pages/Worker; Worker → provedores externos/Jikan/AniList | Entregar catálogo, busca, metadados e vídeo | URLs identificadas usam HTTPS no release; hosts reais exigem teste | Cloudflare e terceiros; logs/retention **NÃO CONFIRMADO** |
| Provedor selecionado, favoritos, progresso, notícias salvas | SPA → `localStorage`/WebView; algumas rotas de sync autenticado ainda existem no código | Personalização/retomar | Armazenamento local; sync usa HTTPS quando ativo | Fluxo atual diz armazenamento local; envio remoto efetivo **NÃO CONFIRMADO** |
| E-mail opcional, mensagem do usuário, categoria, rota e versão | `/reportar` → Worker `/v1/reports` → D1 | Suporte | HTTPS se API de release estiver configurada | Cloudflare; **COLETA CONFIRMADA PELO CÓDIGO** |
| E-mail, senha, token de sessão | Código legado `auth.ts` e rotas Worker `/v1/auth/*`; sem formulário de cadastro na SPA atual | Conta, se reativada | HTTPS esperado | Fluxo não acessível na UI inspecionada; endpoint ainda existe. **NÃO CONFIRMADO — REQUER VALIDAÇÃO MANUAL** sobre contas antigas, retenção e exclusão |
| Conteúdo de vídeo e cookies | ExoPlayer/Blogger/WebView → hosts externos; Blogger WebView aceita cookies de terceiros | Reprodução | URLs aceitas pelo bridge exigem HTTPS | Provedores externos/Google; tratamento de cookies e direitos **NÃO CONFIRMADO** |

Não houve evidência de coleta de localização precisa, contatos, SMS, câmera, microfone, fotos/arquivos pessoais, biometria ou dados financeiros pelo código Android/manifest Play. A coleta do Advertising ID foi desativada no Firebase Analytics e as permissões `AD_ID`/Ad Services foram removidas do manifesto mesclado desta rodada. Ausência de evidência não prova ausência em conteúdo web remoto ou SDK atualizado; validar o AAB final e o tráfego real.

## Respostas sugeridas para revisão humana

- **Coleta de dados:** provavelmente **sim** (Analytics e reports opcionais). Categoria de identificadores, atividade no app e informação pessoal facultativa devem ser avaliadas. Não responder “não coleta”.
- **Compartilhamento com terceiros:** Google Analytics e provedores/hosts podem receber dados. Classificação exata “compartilhado” no formulário depende dos termos de processador e implementação; **NÃO CONFIRMADO — REQUER VALIDAÇÃO MANUAL**.
- **Criptografia em trânsito:** chamadas principais HTTPS; confirmar todos os destinos de vídeo e configuração de produção em teste de tráfego. Não marcar “sim” para todo o app sem esse teste.
- **Exclusão de dados:** `localStorage` pode ser removido ao apagar dados do app; reports resolvidos/descartados passam a ter retenção automática de 90 dias após `closed_at`, além de solicitação de exclusão antecipada pelo contato. Validar a migração D1 e a execução do cron no staging; contas legadas ainda exigem atendimento individual.
- **Opcionalidade:** e-mail no report é opcional; Analytics é inicializado automaticamente. Confirmar configuração remota antes de escolher as respostas.

## Lacunas bloqueantes

## Avaliação operacional do formulário Data Safety

Esta é uma preparação técnica; não deve ser copiada para o Play Console sem conferir a configuração efetiva do Firebase, logs dos fornecedores e todas as versões distribuídas.

| Pergunta/declaração | Estado recomendado hoje | Base e validação pendente |
| --- | --- | --- |
| O app coleta dados? | **Provavelmente sim** | Firebase Analytics é inicializado pelo app e o formulário de reports envia mensagem e dados de contexto quando o usuário escolhe enviar. Confirmar no Firebase DebugView e no tráfego do Worker. |
| E-mail | **Coletado somente quando informado no report; opcional** | `ReportPage` e `/v1/reports`. Verificar retenção no D1 e implementar exclusão/expiração antes da declaração final. |
| Mensagem/conteúdo enviado pelo usuário | **Coletado quando o report é enviado; opcional** | Mensagem, categoria, rota e versão são gravadas para suporte. Classificar conforme o tipo exato oferecido pelo formulário do Play. |
| Interações no app | **Provável via Analytics** | Abertura, telas, player, menu e review são eventos nativos; confirmar quais eventos automáticos o SDK envia. |
| Dispositivo ou outros identificadores | **Requer revisão; potencialmente sim** | Manifest mesclado contém `AD_ID` e Ad Services transitivos. Confirmar se o Advertising ID é lido/enviado, desabilitar se não for necessário e repetir o bundle/manifest scan. |
| Diagnóstico | **NÃO CONFIRMADO** | Não há Crashlytics, mas Firebase/Google podem processar dados técnicos. Confirmar na documentação/console do SDK e no tráfego. |
| Dados armazenados apenas no dispositivo | **Fora do escopo da coleta remota se permanecerem locais** | Favoritos, progresso, notícias e servidor ficam no localStorage/WebView. Não declarar como coleta do desenvolvedor enquanto não houver sincronização ativa. |
| Compartilhamento | **MANUAL_REVIEW** | Cloudflare e Google/Firebase são processadores/terceiros conforme finalidade e contrato; provedores externos recebem requisições de catálogo/vídeo. Classificar com os contratos e a definição do Play. |
| Criptografia em trânsito | **Provavelmente sim para endpoints HTTPS; não confirmar para todo vídeo remoto** | API/Pages usam HTTPS; verificar cada URL de fonte e redirects em teste real. |
| Exclusão | **Parcial, com rotina definida** | Há remoção local pelo usuário; reports resolvidos/descartados são excluídos após 90 dias do encerramento por cron e pedidos válidos podem antecipar a remoção. Validar migração, cron e contas legadas antes da declaração final. |

### Como validar antes de preencher

1. Gerar o AAB da mesma variante que será distribuída e revisar o manifest mesclado.
2. No Firebase, revisar Analytics > Data settings e executar uma sessão de teste com DebugView; confirmar `AD_ID`, eventos automáticos e retenção.
3. Enviar um report de teste com e sem e-mail, resolver/descartar um registro, localizar `closed_at` no D1 e validar a rotina de remoção automática e a remoção antecipada.
4. Capturar uma sessão sem login em rede controlada, listar host/headers/cookies e separar Cloudflare, Google e provedores de conteúdo.
5. Responder o Data Safety pela união de todas as versões distribuídas; marcar como opcional somente o dado que todos os usuários conseguem recusar.

A política do app está pública em `https://nekoanimes-staging.pages.dev/privacidade`. Ela é uma base técnica e deve ser revisada quando retenção, Analytics ou provedores forem definidos. [Política oficial de User Data](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en-GB).
