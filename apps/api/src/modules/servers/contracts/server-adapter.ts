import {
  ServerAnimeDetail,
  ServerAnimeMatch,
  ServerDescriptor,
  ServerEpisodeDetail,
  ServerHealth
} from './server.types';

export interface ServerAdapter {
  readonly descriptor: ServerDescriptor;

  searchAnime(query: string): Promise<ServerAnimeMatch[]>;
  getAnime(reference: string): Promise<ServerAnimeDetail>;
  getEpisode(reference: string): Promise<ServerEpisodeDetail>;
  healthCheck(): Promise<ServerHealth>;
}
