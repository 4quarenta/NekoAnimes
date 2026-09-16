# NekoAnimes — Hardening & QA checklist

## API
- [x] CORS restrito às origens web/admin configuradas.
- [x] Body HTTP limitado a 256 KiB.
- [x] Inputs autenticados validados com Zod/UUID.
- [x] Token Bearer limitado e validado remotamente com timeout.
- [x] Supabase exige HTTPS em produção.
- [x] Chaves administrativas permanecem server-side.
- [ ] Executar suíte automatizada em runner saudável.
- [ ] Teste de carga e rate-limit antes do Production GO.

## Android / WebView / Bridge
- [x] File/content access desabilitados no WebView.
- [x] Origem da bridge comparada por scheme/host/porta.
- [x] Mensagens da bridge limitadas a 32 KiB.
- [x] Somente main frame pode chamar a bridge.
- [x] Rotas e IDs possuem validação de tamanho/formato.
- [x] Handshake emite `bridge.ready`.
- [x] Progresso do player retorna ao web app no fechamento.
- [ ] APK real precisa ser compilado e exercitado em emulador/aparelho.

## Auth & user data
- [x] Cliente usa somente chave publicável do Supabase.
- [x] `service_role` não faz parte do app.
- [x] Recursos pessoais são sempre resolvidos pelo `userId` autenticado.
- [x] Biblioteca, progresso e notícias salvas são isolados por usuário.
- [ ] Provisionar projeto Supabase exclusivo do NekoAnimes.
- [ ] Validar login, renovação e logout ponta a ponta no projeto real.

## Release blockers
1. GitHub Actions/runner deve voltar a executar steps normalmente.
2. Gerar APK/AAB e concluir smoke test Android.
3. Provisionar Supabase NekoAnimes e testar Auth real.
4. Configurar credenciais reais de produção.
5. Rodar auditoria final de dependências e permissões.
