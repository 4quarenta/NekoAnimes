import { Injectable } from '@nestjs/common';
import { BaseHtmlServerAdapter } from '../base-html-server.adapter';
import { ServerDescriptor } from '../../contracts/server.types';
import { ServerHttpClient } from '../../server-http.client';

@Injectable()
export class GoyabuAdapter extends BaseHtmlServerAdapter {
  readonly descriptor: ServerDescriptor = {
    id: 'goyabu',
    name: 'Goyabu',
    baseUrl: 'https://goyabu.io',
    capabilities: {
      search: true,
      anime: true,
      episodes: true,
      playback: false
    }
  };

  constructor(http: ServerHttpClient) {
    super(http);
  }

  protected override isEpisodeReference(reference: string): boolean {
    return /^\/\d+\/?(?:\?.*)?$/.test(reference) || reference.includes('/episodio/');
  }

  protected override cleanAnimeTitle(title: string): string {
    return super
      .cleanAnimeTitle(title)
      .replace(/^assistir\s+/i, '')
      .replace(/\s+todos\s+os\s+epis[oó]dios\s+online\.?$/i, '')
      .trim();
  }
}
