import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { anime, animeExternalIds } from '../../database/schema';
import { AniListProvider } from './anilist.provider';
import { MalProvider } from './mal.provider';
import type { CanonicalAnimeInput } from './provider.types';

@Injectable()
export class MetadataService {
  constructor(private readonly database:DatabaseService, private readonly mal:MalProvider, private readonly anilist:AniListProvider) {}
  provider(name:string) { if(name==='mal') return this.mal; if(name==='anilist') return this.anilist; throw new Error('Provider não suportado'); }
  search(provider:string,q:string,limit?:number){ return this.provider(provider).search(q,limit); }
  async import(provider:string,id:string){ const data=await this.provider(provider).getById(id); if(!data) throw new Error('Título não encontrado no provider'); return this.upsert(data); }
  private slug(value:string){ return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  private async upsert(input:CanonicalAnimeInput){
    const [link]=await this.database.db.select().from(animeExternalIds).where(and(eq(animeExternalIds.provider,input.provider),eq(animeExternalIds.externalId,input.externalId))).limit(1);
    if(link){ const [updated]=await this.database.db.update(anime).set({title:input.title,titleEnglish:input.titleEnglish,titleRomaji:input.titleRomaji,titleNative:input.titleNative,synopsis:input.synopsis,type:input.type ?? 'tv',status:input.status ?? 'unknown',year:input.year,scoreBasisPoints:input.score?Math.round(input.score*100):null,genres:input.genres ?? [],updatedAt:new Date()}).where(eq(anime.id,link.animeId)).returning(); return updated; }
    const base=this.slug(input.title)||`anime-${input.externalId}`; const slug=`${base}-${input.provider}-${input.externalId}`;
    return this.database.db.transaction(async(tx)=>{ const [created]=await tx.insert(anime).values({slug,title:input.title,titleEnglish:input.titleEnglish,titleRomaji:input.titleRomaji,titleNative:input.titleNative,synopsis:input.synopsis,type:input.type ?? 'tv',status:input.status ?? 'unknown',year:input.year,scoreBasisPoints:input.score?Math.round(input.score*100):null,genres:input.genres ?? []}).returning(); await tx.insert(animeExternalIds).values({animeId:created.id,provider:input.provider,externalId:input.externalId}); return created; });
  }
}
