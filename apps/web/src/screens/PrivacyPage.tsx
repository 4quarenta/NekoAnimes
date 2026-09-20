import { AppScreen, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';

const updatedAt = '19 de setembro de 2026';

export function PrivacyPage() {
  return <AppScreen>
    <Eyebrow>NekoAnimes</Eyebrow>
    <ScreenHeader title="Política de Privacidade" subtitle={`Última atualização: ${updatedAt}. Acesso público, sem necessidade de conta.`} />
    <Section title="Quem somos e como entrar em contato">
      <p>O responsável identificado nesta política é NekoAnimes. Para dúvidas de privacidade ou solicitações sobre seus dados, escreva para <a href="mailto:dev.app.440@gmail.com">dev.app.440@gmail.com</a> ou use o <a href="/reportar">formulário público de contato</a>, escolha “Outro” e descreva sua solicitação. Informe um e-mail se quiser receber resposta pelo formulário; ele é opcional para o envio do relato.</p>
    </Section>
    <Section title="Dados guardados no seu dispositivo">
      <p>A lista de obras, notícias salvas, progresso de episódios e preferência de servidor podem ser guardados no armazenamento local da aplicação/webview. Eles permanecem no dispositivo até que você os remova, limpe os dados do aplicativo ou desinstale o app. Alguns caminhos antigos de sincronização com conta ainda existem no serviço, mas não são necessários para usar a interface atual.</p>
    </Section>
    <Section title="Dados enviados quando você usa o serviço">
      <p>Ao acessar o catálogo, buscar ou reproduzir conteúdo, o app solicita dados à infraestrutura hospedada na Cloudflare e, conforme o servidor escolhido, a serviços externos de catálogo, metadados, imagens e vídeo. A infraestrutura do NekoAnimes pode registrar dados técnicos para operar e proteger o serviço; o prazo efetivo desses logs precisa ser confirmado com os fornecedores.</p>
      <p>Se você enviar um relato, guardamos a categoria, mensagem, rota da tela, versão do app e, se informado, seu e-mail em banco de dados do serviço para atendimento e investigação. Não inclua senhas nem informações sensíveis na mensagem. Reports resolvidos ou descartados são retidos por até 90 dias após o encerramento e depois excluídos automaticamente. Reports ainda em análise permanecem enquanto forem necessários para o atendimento.</p>
    </Section>
    <Section title="Medição de uso">
      <p>O aplicativo Android usa Firebase Analytics, fornecido pelo Google, para medir abertura, telas e eventos de navegação e reprodução. Os eventos personalizados não incluem a URL do vídeo, senha ou e-mail, mas o SDK pode tratar identificadores do aplicativo/dispositivo e dados técnicos próprios. Esta versão não integra um SDK de anúncios, desativa a coleta do Advertising ID pelo Analytics e remove as permissões de Advertising ID do manifesto. A configuração efetiva do projeto Firebase e a declaração final no Play Console ainda precisam ser verificadas antes da publicação. Consulte também a <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">política de privacidade do Google</a>.</p>
    </Section>
    <Section title="Compartilhamento e segurança">
      <p>Os dados necessários ao funcionamento podem ser processados pela Cloudflare (hospedagem, API e banco de dados), pelo Google/Firebase (métricas) e pelos serviços externos que entregam metadados, imagens ou vídeo quando você usa essas funções. Não vendemos os relatos enviados pelo usuário. As conexões configuradas para a versão de publicação usam HTTPS; nenhum sistema conectado à internet oferece segurança absoluta.</p>
      <p>O NekoAnimes atua como uma interface agregadora e não mantém arquivos de vídeo hospedados em seus servidores. As fontes são externas e podem ser desativadas quando uma análise administrativa identificar indisponibilidade, risco ou uma solicitação válida de remoção. A operação como agregador não é, por si só, uma confirmação de autorização para redistribuir cada obra; solicitações devem ser encaminhadas pelo <a href="/reportar">formulário público</a> ou pelo e-mail acima.</p>
    </Section>
    <Section title="Retenção e solicitações de exclusão">
      <p>Você pode remover os dados locais limpando os dados do app ou desinstalando-o. Para pedir acesso ou exclusão antecipada de relatos que enviou, use o <a href="/reportar">formulário de contato</a>. Podemos solicitar informações suficientes para localizar o relato e confirmar sua titularidade antes de excluí-lo. Reports resolvidos ou descartados serão excluídos automaticamente após 90 dias do encerramento. Contas antigas, caso existam, também exigem atendimento individual; a interface atual não oferece criação de conta. A retenção do Firebase segue as configurações do projeto Google e deve ser conferida separadamente.</p>
    </Section>
    <Section title="Mudanças nesta política">
      <p>Alterações relevantes no tratamento de dados serão refletidas nesta página com nova data de atualização. Esta política deve ser revisada antes de uma distribuição ampla, especialmente se forem adicionados anúncios, contas ou novos provedores.</p>
    </Section>
  </AppScreen>;
}
