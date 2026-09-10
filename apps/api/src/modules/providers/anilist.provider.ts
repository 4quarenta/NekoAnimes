import { Injectable } from '@nestjs/common';
import type { AnimeMetadataProvider, CanonicalAnimeInput } from './provider.types';

@Injectable()
export class AniListProvider implements AnimeMetadataProvider {
  readonly name = 'anilist' as const;
  private async query(query:string, variables:Record<string,unknown>) {
    const response = await fetch('https://graphql.anilist.co', { method:'POST', headers:{'content-type':'application/json','accept':'application/json'}, body:JSON.stringify({query,variables}) });
    if (!response.ok) throw new Error(`AniList respondeu ${response.status}`);
    return response.json() as Promise<any>;
  }
  private normalize(media:any): CanonicalAnimeInput { return { provider:'anilist', externalId:String(media.id), title:media.title?.romaji ?? media.title?.english ?? media.title?.native, titleEnglish:media.title?.english ?? null, titleRomaji:media.title?.romaji ?? null, titleNative:media.title?.native ?? null, synopsis:media.description?.replace(/<[^>]+>/g,' ') ?? null, type:media.format?.toLowerCase() ?? null, status:media.status?.toLowerCase() ?? null, year:media.seasonYear ?? null, score:media.averageScore ? media.averageScore/10 : null, genres:media.genres ?? [] }; }
  async search(search:string, limit=20) { const q=`query($search:String,$perPage:Int){Page(perPage:$perPage){media(search:$search,type:ANIME){id title{romaji english native} description format status seasonYear averageScore genres}}}`; const d=await this.query(q,{search,perPage:Math.min(limit,50)}); return (d.data?.Page?.media ?? []).map((m:any)=>this.normalize(m)); }
  async getById(id:string) { const q=`query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native} description format status seasonYear averageScore genres}}`; const d=await this.query(q,{id:Number(id)}); return d.data?.Media ? this.normalize(d.data.Media) : null; }
}
