const developmentApiUrl = 'http://localhost:3000';
const stagingApiUrl = 'https://nekoanimes-api-staging.john-alleff01.workers.dev';

export const API_URL = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? stagingApiUrl : developmentApiUrl);
