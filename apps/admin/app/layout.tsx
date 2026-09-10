import './globals.css';

export const metadata = {
  title: 'Neko Admin',
  description: 'Painel administrativo NekoAnimes'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
