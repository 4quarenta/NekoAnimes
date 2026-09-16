export type ContinuityEpisode = { number: number; reference?: string | null };
export type ContinuitySeason = {
  number: number;
  episodes?: readonly ContinuityEpisode[];
  episodesCount?: number | null;
};

function normalizedReference(value: string | null | undefined) {
  return value?.replace(/\/$/, '') ?? '';
}

function orderedSeasons<T extends ContinuitySeason>(seasons: readonly T[]) {
  return [...seasons].sort((left, right) => left.number - right.number);
}

function orderedEpisodes<T extends ContinuityEpisode>(season: ContinuitySeason & { episodes?: readonly T[] }) {
  return [...(season.episodes ?? [])].sort((left, right) => left.number - right.number);
}

/** Returns the 1-based position of an episode across all seasons. */
export function episodeOrdinal<T extends ContinuitySeason>(
  seasons: readonly T[],
  seasonNumber: number,
  episodeNumber: number,
  episodeReference?: string | null
) {
  let ordinal = 0;
  for (const season of orderedSeasons(seasons)) {
    const episodes = orderedEpisodes(season);
    const count = Math.max(season.episodesCount ?? 0, episodes.length);
    if (season.number !== seasonNumber) {
      ordinal += count;
      continue;
    }

    const indexByReference = episodeReference
      ? episodes.findIndex((episode) => normalizedReference(episode.reference) === normalizedReference(episodeReference))
      : -1;
    const index = indexByReference >= 0 ? indexByReference : episodes.findIndex((episode) => episode.number === episodeNumber);
    const position = index >= 0 ? index + 1 : episodeNumber;
    return position >= 1 && position <= Math.max(count, position) ? ordinal + position : null;
  }
  return null;
}

/** Resolves a 1-based cross-season position into a provider episode. */
export function episodeAtOrdinal<TSeason extends ContinuitySeason, TEpisode extends ContinuityEpisode>(
  seasons: readonly (TSeason & { episodes: readonly TEpisode[] })[],
  ordinal: number
) {
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  let position = ordinal;
  for (const season of orderedSeasons(seasons)) {
    const episodes = orderedEpisodes(season);
    if (position <= episodes.length) return { season, episode: episodes[position - 1]! };
    position -= episodes.length;
  }
  return null;
}

/** Resolves a cross-season position using only canonical season episode counts. */
export function seasonEpisodeAtOrdinal<T extends ContinuitySeason>(seasons: readonly T[], ordinal: number) {
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  let position = ordinal;
  for (const season of orderedSeasons(seasons)) {
    const count = Math.max(season.episodesCount ?? 0, season.episodes?.length ?? 0);
    if (position <= count) return { season, episodeNumber: position };
    position -= count;
  }
  return null;
}
