import { API_URL } from './config';

export type AuthUser = { id: string; email: string };
export type AuthSession = { access_token: string; token_type: 'bearer'; expires_in: number; user: AuthUser };
type AuthResponse = { session: AuthSession };
type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT';
const storageKey = 'nekoanimes.auth.session';
const listeners = new Set<(event: AuthEvent, session: AuthSession | null) => void>();

export const hasAuth = Boolean(API_URL);

export const auth = {
  async getSession() { return { data: { session: readSession() } }; },
  onAuthStateChange(callback: (event: AuthEvent, session: AuthSession | null) => void) {
    listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => { listeners.delete(callback); } } } };
  },
  async signInWithPassword(credentials: { email: string; password: string }) { return authenticate('/v1/auth/login', credentials); },
  async signUp(credentials: { email: string; password: string }) { return authenticate('/v1/auth/register', credentials); },
  async signOut() {
    const session = readSession();
    if (session) await fetch(`${API_URL}/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } }).catch(() => undefined);
    writeSession(null);
    return { error: null };
  }
};

export function getAccessToken() { return readSession()?.access_token ?? null; }
export function currentUserId() { return readSession()?.user.id ?? 'guest'; }
export function clearSession() { writeSession(null); }

async function authenticate(path: string, credentials: { email: string; password: string }) {
  try {
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
    const payload = await response.json() as AuthResponse | { message?: string };
    if (!response.ok || !('session' in payload)) return { data: { session: null }, error: new Error(('message' in payload && payload.message) || 'Não foi possível autenticar') };
    writeSession(payload.session);
    return { data: { session: payload.session }, error: null };
  } catch {
    return { data: { session: null }, error: new Error('API indisponível') };
  }
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(storageKey); if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    return session?.access_token && session.user?.id ? session : null;
  } catch { return null; }
}

function writeSession(session: AuthSession | null) {
  if (session) localStorage.setItem(storageKey, JSON.stringify(session)); else localStorage.removeItem(storageKey);
  listeners.forEach((listener) => listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}
