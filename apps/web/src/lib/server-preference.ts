import { create } from 'zustand';

const STORAGE_KEY = 'nekoanimes.selected-server.v1';

function readStoredServer(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

type ServerPreferenceState = {
  serverId: string | null;
  setServerId: (serverId: string) => void;
};

export const useServerPreference = create<ServerPreferenceState>((set) => ({
  serverId: readStoredServer(),
  setServerId: (serverId) => {
    try { window.localStorage.setItem(STORAGE_KEY, serverId); } catch { /* storage may be unavailable */ }
    set({ serverId });
  }
}));
