import { Injectable } from '@nestjs/common';
import { BaseHtmlServerAdapter } from '../base-html-server.adapter';
import { ServerDescriptor } from '../../contracts/server.types';
import { ServerHttpClient } from '../../server-http.client';

@Injectable()
export class AnimesDigitalAdapter extends BaseHtmlServerAdapter {
  readonly descriptor: ServerDescriptor = {
    id: 'animesdigital',
    name: 'Animes Digital',
    baseUrl: 'https://animesdigital.org',
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

  protected override searchPath(query: string): string {
    return `/?s=${encodeURIComponent(query)}`;
  }

  protected override isAnimeReference(reference: string): boolean {
    return reference.startsWith('/anime/a/');
  }

  protected override isEpisodeReference(reference: string): boolean {
    return reference.startsWith('/video/a/') || /^\/\?p=\d+$/i.test(reference);
  }

  protected override cleanAnimeTitle(title: string): string {
    return super
      .cleanAnimeTitle(title)
      .replace(/\s+todos\s+(?:os\s+)?epis[oó]dios(?:\s+online)?(?:\s+em\s+hd)?$/i, '')
      .replace(/\s+online(?:\s+em\s+hd)?$/i, '')
      .trim();
  }
}
