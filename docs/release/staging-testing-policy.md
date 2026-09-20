# NekoAnimes — política de staging para o primeiro teste na Play

## Decisão atual

O primeiro AAB de teste continuará apontando para:

- Pages: `https://nekoanimes-staging.pages.dev`
- API: `https://nekoanimes-api-staging.john-alleff01.workers.dev`

Não haverá troca para endpoints de produção agora. O objetivo é conseguir os primeiros usuários por teste interno/fechado, observar estabilidade e validar o fluxo real antes de provisionar ou promover uma infraestrutura de produção.

## Condições para uma futura migração

A troca somente deve ocorrer depois de:

1. usuários de teste suficientes para revelar problemas de inicialização, player, atualização e navegação;
2. métricas e reports revisados;
3. política de privacidade e Data Safety alinhados ao comportamento final;
4. direitos e autorização das fontes confirmados;
5. endpoints de produção isolados, com HTTPS, backup e plano de rollback;
6. novo AAB/release candidate validado sem depender de uma alteração remota escondida.

Staging e produção não devem compartilhar banco, secrets, bucket de releases ou configurações administrativas.
