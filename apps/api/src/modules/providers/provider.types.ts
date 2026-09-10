export type CanonicalAnimeInput = {
  provider: 'mal' | 'anilist' | 'tmdb';
  externalId: string;
  title: string;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleNative?: string | null;
  synopsis?: string | null;
  type?: string | null;
  status?: string | null;
  year?: number | null;
  score?: number | null;
  genres?: string[];
};

export interface AnimeMetadataProvider {
  readonly name: CanonicalAnimeInput['provider'];
  search(query: string, limit?: number): Promise<CanonicalAnimeInput[]>;
  getById(id: string): Promise<CanonicalAnimeInput | null>;
}
