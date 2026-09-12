export interface ServerCapabilities {
  search: boolean;
  anime: boolean;
  episodes: boolean;
  playback: boolean;
}

export interface ServerDescriptor {
  id: string;
  name: string;
  baseUrl: string;
  capabilities: ServerCapabilities;
}

export interface ServerAnimeMatch {
  serverId: string;
  serverName: string;
  title: string;
  reference: string;
  url: string;
  confidence: number;
}

export interface ServerEpisode {
  id: string;
  title: string;
  number: number;
  seasonNumber: number;
  reference: string;
  url: string;
  releasedAt?: string;
  available: boolean;
}

export interface ServerSeason {
  id: string;
  number: number;
  title: string;
  episodes: ServerEpisode[];
}

export interface ServerAnimeDetail {
  server: ServerDescriptor;
  anime: {
    title: string;
    reference: string;
    url: string;
    year?: number;
  };
  seasons: ServerSeason[];
  fetchedAt: string;
}

export interface ServerEpisodeDetail extends ServerEpisode {
  server: ServerDescriptor;
  playback: {
    available: false;
    sources: [];
    reason: 'not-configured';
  };
  fetchedAt: string;
}

export type ServerResultStatus = 'ok' | 'unavailable' | 'timeout' | 'error';

export interface ServerSearchProviderResult {
  server: ServerDescriptor;
  status: ServerResultStatus;
  matches: ServerAnimeMatch[];
  error?: 'provider_unavailable' | 'provider_timeout';
}

export interface ServerSearchResponse {
  query: string;
  servers: ServerSearchProviderResult[];
  fetchedAt: string;
}

export interface ServerEpisodeResolution {
  query: string;
  season: number;
  episode: number;
  servers: Array<{
    server: ServerDescriptor;
    status: ServerResultStatus;
    available: boolean;
    anime?: ServerAnimeMatch;
    episode?: ServerEpisode;
    error?: 'provider_unavailable' | 'provider_timeout';
  }>;
  fetchedAt: string;
}

export interface ServerHealth {
  server: ServerDescriptor;
  status: 'ok' | 'unavailable';
  latencyMs: number;
  checkedAt: string;
}
