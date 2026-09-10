export type NekoBridgeEvent = {
  type: string;
  payload?: unknown;
};

type Listener = (event: NekoBridgeEvent) => void;

const listeners = new Set<Listener>();

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const NekoNative = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.NekoNativeBridge);
  },

  emit(type: string, payload?: unknown): boolean {
    if (!this.isAvailable()) return false;

    window.NekoNativeBridge!.postMessage(
      JSON.stringify({
        id: createId(),
        type,
        payload
      })
    );

    return true;
  },

  navigate(route: string): boolean {
    return this.emit('navigation.routeChanged', { route });
  },

  openPlayer(episodeId: string): boolean {
    return this.emit('player.open', { episodeId });
  },

  adEvent(event: string, placement?: string): boolean {
    return this.emit('ads.event', { event, placement });
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
      const event = JSON.parse(message.data) as NekoBridgeEvent;
      if (!event || typeof event.type !== 'string') return;
      listeners.forEach((listener) => listener(event));
    } catch {
      // Ignora mensagens que não fazem parte do protocolo Neko.
    }
  });
}
