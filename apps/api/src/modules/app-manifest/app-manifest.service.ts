import { Injectable } from '@nestjs/common';

type AppMode = 'streaming' | 'news';

@Injectable()
export class AppManifestService {
  getManifest() {
    const mode = this.resolveMode();

    const streamingNavigation = [
      { id: 'home', label: 'Início', icon: 'home', route: '/' },
      { id: 'catalog', label: 'A–Z', icon: 'catalog', route: '/catalogo' },
      { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' },
      { id: 'library', label: 'Lista', icon: 'library', route: '/lista' }
    ];

    const newsNavigation = [
      { id: 'home', label: 'Início', icon: 'home', route: '/' },
      { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' },
      { id: 'saved', label: 'Salvos', icon: 'bookmark', route: '/salvos' }
    ];

    return {
      schemaVersion: 1,
      mode,
      webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:5173',
      navigation: mode === 'news' ? newsNavigation : streamingNavigation,
      features: {
        player: mode === 'streaming',
        downloads: false,
        notifications: true,
        news: mode === 'news'
      },
      ads: {
        enabled: false,
        engine: 'max',
        banner: { enabled: false },
        appOpen: { enabled: false, minIntervalMinutes: 60, skipFirstOpens: 2 },
        interstitial: { enabled: false, minIntervalMinutes: 15, maxPerSession: 3 }
      }
    };
  }

  private resolveMode(): AppMode {
    return process.env.APP_MODE === 'news' ? 'news' : 'streaming';
  }
}
