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
      <h1 style={{ marginTop: 8 }}>Fundação administrativa</h1>
      <p style={{ color: '#a1a1aa', maxWidth: 640 }}>
        Esta tela valida a estrutura do Admin. Persistência, autenticação e publicação de
        configurações entram na Etapa 3.
      </p>

      <div style={{ display: 'grid', gap: 16, marginTop: 28 }}>
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Aplicativo</h2>
          <label style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
            <span style={{ color: '#a1a1aa' }}>Modo</span>
            <select disabled defaultValue="streaming" style={{ padding: 12, borderRadius: 10 }}>
              <option value="streaming">Streaming</option>
              <option value="news">Notícias</option>
            </select>
          </label>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Monetização</h2>
          <p style={{ color: '#a1a1aa' }}>
            NekoAdOrchestrator previsto: AppLovin MAX, AdMob e Meta via mediação.
          </p>
          <p style={{ marginBottom: 0 }}>Banner · App Open · Interstitial</p>
        </section>
      </div>
    </main>
  );
}
