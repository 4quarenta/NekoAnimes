import { Injectable } from '@nestjs/common';
import { BaseHtmlServerAdapter } from '../base-html-server.adapter';
import { ServerDescriptor } from '../../contracts/server.types';
import { ServerHttpClient } from '../../server-http.client';

@Injectable()
export class AnimesOnlineCcAdapter extends BaseHtmlServerAdapter {
  readonly descriptor: ServerDescriptor = {
    id: 'animesonlinecc',
    name: 'Animes Online',
    baseUrl: 'https://animesonlinecc.to',
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

  protected override cleanAnimeTitle(title: string): string {
    return super
      .cleanAnimeTitle(title)
      .replace(/\s+todos\s+os\s+epis[oó]dios\s+online$/i, '')
      .replace(/\s+online$/i, '')
      .trim();
  }
}
