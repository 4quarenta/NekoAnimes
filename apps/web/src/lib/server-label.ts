const SERVER_LABELS: Record<string, string> = {
  goyabu: 'BR1',
  animesonlinecc: 'BR2',
  animesdigital: 'BR3'
};

/** Public server labels. Provider hostnames remain an internal API concern. */
export function serverLabel(serverId: string | null | undefined): string {
  return serverId ? SERVER_LABELS[serverId] ?? 'BR' : 'Servidor';
}
