type StoredSession = {
  access_token: string;
  user: { id: string };
};

const STORAGE_KEY = 'nekoanimes.auth.session';

// Account screens are disabled. These helpers only preserve compatibility with
// sessions created by older builds for the two protected maintenance actions.
export function getAccessToken(): string | null {
  return readSession()?.access_token ?? null;
}

export function currentUserId(): string {
  return readSession()?.user.id ?? 'guest';
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    return session?.access_token && session.user?.id ? session : null;
  } catch {
    return null;
  }
}
