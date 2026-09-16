const sectionStyle: React.CSSProperties = {
  border: '1px solid #27272a',
  borderRadius: 16,
  padding: 20,
  background: '#16161d'
};

export default function AdminHome() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px' }}>
      <p style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em' }}>
        NEKO ADMIN
      </p>
      <h1 style={{ marginTop: 8 }}>Painel NekoAnimes</h1>
      <p style={{ color: '#a1a1aa', maxWidth: 640 }}>
        Configuração operacional da experiência entregue pelo aplicativo.
      </p>

      <div style={{ display: 'grid', gap: 16, marginTop: 28 }}>
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Aplicativo</h2>
          <p style={{ color: '#a1a1aa' }}>Perfil de experiência e monetização versionados.</p>
          <a href="/configuracao" style={{ color: '#c4b5fd', fontWeight: 700 }}>Abrir configurações →</a>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Operação disponível</h2>
          <p style={{ color: '#a1a1aa', marginBottom: 0 }}>
            A configuração reúne abas separadas para anúncios, servidores, reports de usuários e atualizações Android.
          </p>
        </section>
      </div>
    </main>
  );
}
