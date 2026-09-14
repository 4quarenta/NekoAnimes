import {
  BridgeEventSchema,
  type BridgeEvent,
  type BridgeNativeEvent,
  NEKO_BRIDGE_VERSION
} from '@neko/contracts';

export type NekoBridgeEvent = BridgeEvent;

declare global {
  interface Window {
    NekoNativeBridge?: {
      postMessage(message: string): void;
    };
  }
}

type Listener = (event: NekoBridgeEvent) => void;
export type NekoPlayerSource = {
  url: string;
  mimeType?: string;
  label?: string;
  headers?: Record<string, string>;
};

const listeners = new Set<Listener>();

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function post(type: string, payload: unknown): boolean {
  if (typeof window === 'undefined' || !window.NekoNativeBridge) return false;

  window.NekoNativeBridge.postMessage(JSON.stringify({
    version: NEKO_BRIDGE_VERSION,
    id: createId(),
    type,
    payload
  }));
  return true;
}

export const NekoNative = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.NekoNativeBridge);
  },

  handshake(webVersion = 'dev'): boolean {
    return post('bridge.handshake', { webVersion });
  },

  routeChanged(route: string): boolean {
    return post('navigation.routeChanged', { route });
  },

  // Compatibility alias used by the current SPA.
  navigate(route: string): boolean {
    return this.routeChanged(route);
  },

  player: {
    open(episodeId: string, source?: NekoPlayerSource, startPositionSeconds = 0): boolean {
      return post('player.open', { episodeId, ...(source ? { source } : {}), startPositionSeconds: Math.min(604800, Math.max(0, Math.floor(startPositionSeconds))) });
    }
  },

  openPlayer(episodeId: string, source?: NekoPlayerSource): boolean {
    return this.player.open(episodeId, source);
  },

  appEvent(name: string, placement?: string): boolean {
    return post('app.event', { name, placement });
  },

  // Compatibility alias until monetization migrates to semantic app events.
  adEvent(event: string, placement?: string): boolean {
    return this.appEvent(event, placement);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('message', (message) => {
    if (typeof message.data !== 'string') return;

    try {
      const parsed = BridgeEventSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) return;
      listeners.forEach((listener) => listener(parsed.data));
    } catch {
      // Ignore messages outside the Neko protocol.
    }
  });
}

export type { BridgeNativeEvent };
