import { AppManifestSchema, type AppManifest } from '@neko/contracts';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function fetchManifest(): Promise<AppManifest> {
  const response = await fetch(`${API_URL}/v1/app-manifest`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar app-manifest (${response.status})`);
  }

  return AppManifestSchema.parse(await response.json());
}
