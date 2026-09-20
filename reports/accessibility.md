# Acessibilidade

**NÃO TESTADO em aparelho/TalkBack.** Nenhum dispositivo ADB estava conectado em 2026-09-19. Escala de fonte normal/aumentada, ordem de foco e contraste exigem validação visual e com leitor de tela.

## Evidência estática

- `NekoNavigationBar` fornece label ao item e descrição ao ícone; drawer tem texto visível e ícone decorativo. A SPA usa `<button>`, `<label>`, `alt` em posters e `role=status`/`aria-live` nos loaders.
- Lint Play Release sinalizou `ClickableViewAccessibility` em `WebViewHost.setOnTouchListener`: verificar `performClick`, navegação com TalkBack e gestos de menu/refresh.
- CSS contém textos de 11–14 px em vários elementos; alvos como botões de episódio e paginação devem ser medidos em 200% de escala de fonte e zoom. Sem inspeção no aparelho, **não é possível afirmar conformidade de 48dp ou contraste**.
- Progressos assistidos mudam cor, mas o botão de episódio inclui `aria-label` com “já aberto”; conferir se o leitor anuncia a informação após carregamento.
- Player usa controles Media3, orientação landscape e barras ocultas. Validar rótulos/ordem de foco de anterior/próximo, mensagens de erro e teclado/controle remoto.

## Matriz manual exigida

Android 13–16, telefones e tablet; escala 1,0 e 1,3/2,0; TalkBack ligado; navegar Home, busca, categorias, detalhe, episódios, player, minha lista, report; testar gesto de voltar, menu, estado offline e botões pequenos. Registrar vídeo/capturas e problemas antes da submissão.
