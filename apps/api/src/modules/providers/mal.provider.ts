import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnimeMetadataProvider, CanonicalAnimeInput } from './provider.types';

type MalNode = { id:number; title:string; alternative_titles?:{ en?:string; ja?:string }; synopsis?:string; media_type?:string; status?:string; start_date?:string; mean?:number; genres?:Array<{name:string}> };

@Injectable()
export class MalProvider implements AnimeMetadataProvider {
  readonly name = 'mal' as const;
  private readonly clientId?: string;
  constructor(config: ConfigService) { this.clientId = config.get<string>('MAL_CLIENT_ID'); }

  private async request(path: string): Promise<any> {
    if (!this.clientId) throw new Error('MAL_CLIENT_ID não configurado');
    const response = await fetch(`https://api.myanimelist.net/v2${path}`, { headers: { 'X-MAL-CLIENT-ID': this.clientId } });
    if (!response.ok) throw new Error(`MAL respondeu ${response.status}`);
    return response.json();
  }

  private normalize(node: MalNode): CanonicalAnimeInput {
    return { provider:'mal', externalId:String(node.id), title:node.title, titleEnglish:node.alternative_titles?.en ?? null, titleNative:node.alternative_titles?.ja ?? null, synopsis:node.synopsis ?? null, type:node.media_type ?? null, status:node.status ?? null, year:node.start_date ? Number(node.start_date.slice(0,4)) : null, score:node.mean ?? null, genres:node.genres?.map((g)=>g.name) ?? [] };
  }

  async search(query: string, limit = 20) {
    const fields = 'alternative_titles,synopsis,media_type,status,start_date,mean,genres';
    const data = await this.request(`/anime?q=${encodeURIComponent(query)}&limit=${Math.min(limit,100)}&fields=${fields}`);
    return (data.data ?? []).map((item:any)=>this.normalize(item.node));
  }

  async getById(id: string) {
    const fields = 'alternative_titles,synopsis,media_type,status,start_date,mean,genres';
    try { return this.normalize(await this.request(`/anime/${encodeURIComponent(id)}?fields=${fields}`)); } catch { return null; }
  }
}
