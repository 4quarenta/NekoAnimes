-- NekoAnimes STAGING seed only. No production media URLs are included.
INSERT INTO app_config (id, version, mode, payload)
VALUES (1, 1, 'streaming', '{"ads":{"enabled":false,"engine":"max","banner":{"enabled":false},"appOpen":{"enabled":false,"minIntervalMinutes":60,"skipFirstOpens":3},"interstitial":{"enabled":false,"minIntervalMinutes":30,"maxPerSession":2}}}')
ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, payload = EXCLUDED.payload;

INSERT INTO anime (id, slug, title, title_english, title_romaji, title_native, synopsis, type, status, year, score_basis_points, genres)
VALUES
('11111111-1111-1111-1111-111111111111','bleach-staging','Bleach','Bleach','Bleach','BLEACH','Um teste de catálogo marcado para o ambiente de staging.','tv','finished',2004,8200,'["Ação","Aventura"]'),
('22222222-2222-2222-2222-222222222222','cowboy-bebop-staging','Cowboy Bebop','Cowboy Bebop','Cowboy Bebop','Uma tripulação atravessa o espaço em busca de recompensas e novas histórias.','tv','finished',1998,8900,'["Ação","Ficção científica"]'),
('33333333-3333-3333-3333-333333333333','frieren-staging','Frieren: Beyond Journey''s End','Frieren: Beyond Journey''s End','Sousou no Frieren','葬送のフリーレン','Uma maga elfa revisita as memórias deixadas por uma antiga jornada.','tv','releasing',2023,9100,'["Fantasia","Aventura"]'),
('44444444-4444-4444-4444-444444444444','mob-psycho-100-staging','Mob Psycho 100','Mob Psycho 100','Mob Psycho 100','モブサイコ100','Um estudante com poderes psíquicos tenta levar uma vida comum.','tv','finished',2016,8800,'["Comédia","Ação"]'),
('55555555-5555-5555-5555-555555555555','one-piece-staging','One Piece','One Piece','One Piece','Uma tripulação parte em uma grande aventura pelos mares.','tv','releasing',1999,9000,'["Ação","Aventura"]')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, synopsis = EXCLUDED.synopsis, genres = EXCLUDED.genres, updated_at = now();

INSERT INTO anime_seasons (id, anime_id, number, title, episodes_count)
VALUES
('21111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',1,'Temporada 1',10),
('21111111-1111-1111-1111-111111111112','11111111-1111-1111-1111-111111111111',2,'Temporada 2',2),
('22222222-2222-2222-2222-222222222221','22222222-2222-2222-2222-222222222222',1,'Temporada única',4),
('33333333-3333-3333-3333-333333333331','33333333-3333-3333-3333-333333333333',1,'Temporada 1',3),
('44444444-4444-4444-4444-444444444441','44444444-4444-4444-4444-444444444444',1,'Temporada 1',2),
('55555555-5555-5555-5555-555555555551','55555555-5555-5555-5555-555555555555',1,'Temporada 1',2)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, episodes_count = EXCLUDED.episodes_count;

INSERT INTO episodes (id, season_id, number, title, duration_seconds)
SELECT ('31111111-1111-1111-1111-' || lpad(n::text, 12, '0'))::uuid, '21111111-1111-1111-1111-111111111111', n, 'Episódio de teste ' || n, 1440
FROM generate_series(1,10) AS n
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, duration_seconds = EXCLUDED.duration_seconds;
INSERT INTO episodes (id, season_id, number, title, duration_seconds) VALUES
('32222222-2222-2222-2222-000000000001','21111111-1111-1111-1111-111111111112',1,'Retorno de teste',1500),
('32222222-2222-2222-2222-000000000002','21111111-1111-1111-1111-111111111112',2,'Encerramento de teste',1500),
('33333333-3333-3333-3333-000000000001','22222222-2222-2222-2222-222222222221',1,'Asteroid Blues',1440),
('33333333-3333-3333-3333-000000000002','22222222-2222-2222-2222-222222222221',2,'Stray Dog Strut',1440),
('33333333-3333-3333-3333-000000000003','22222222-2222-2222-2222-222222222221',3,'Honky Tonk Women',1440),
('33333333-3333-3333-3333-000000000004','22222222-2222-2222-2222-222222222221',4,'Gateway Shuffle',1440),
('43333333-3333-3333-3333-000000000001','33333333-3333-3333-3333-333333333331',1,'O fim da jornada',1500),
('43333333-3333-3333-3333-000000000002','33333333-3333-3333-3333-333333333331',2,'Memórias',1500),
('43333333-3333-3333-3333-000000000003','33333333-3333-3333-3333-333333333331',3,'O próximo passo',1500),
('53333333-3333-3333-3333-000000000001','44444444-4444-4444-4444-444444444441',1,'A primeira missão',1380),
('53333333-3333-3333-3333-000000000002','44444444-4444-4444-4444-444444444441',2,'Controle',1380),
('63333333-3333-3333-3333-000000000001','55555555-5555-5555-5555-555555555551',1,'O começo',1380),
('63333333-3333-3333-3333-000000000002','55555555-5555-5555-5555-555555555551',2,'No mar',1380)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, duration_seconds = EXCLUDED.duration_seconds;

INSERT INTO news_sources (id, name, site_url, enabled, allow_remote_images)
VALUES ('71111111-1111-1111-1111-111111111111','NekoAnimes Editorial','https://nekoanimes.example/staging',true,false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO news_articles (id, source_id, external_id, slug, title, summary, category, source_name, source_url, image_allowed, published_at)
VALUES
('81111111-1111-1111-1111-111111111111','71111111-1111-1111-1111-111111111111','staging-1','staging-catalogo-disponivel','Catálogo de staging disponível para testes','Dados fictícios do ambiente de staging foram publicados para validar catálogo, busca e detalhes.','Anime','NekoAnimes Editorial','https://nekoanimes.example/staging/catalogo',false,'2026-09-11T12:00:00Z'),
('82222222-2222-2222-2222-222222222222','71111111-1111-1111-1111-111111111111','staging-2','staging-player-sem-midia','Player mostra erro controlado sem mídia configurada','Os episódios de teste não possuem fonte de reprodução; a API deve retornar indisponibilidade de forma controlada.','Produto','NekoAnimes Editorial','https://nekoanimes.example/staging/player',false,'2026-09-10T12:00:00Z'),
('83333333-3333-3333-3333-333333333333','71111111-1111-1111-1111-111111111111','staging-3','staging-atualizacao-direta','Atualização direta preparada para o canal de testes','A versão direct do Android consulta o manifesto de atualização e valida o SHA-256 antes de instalar.','Android','NekoAnimes Editorial','https://nekoanimes.example/staging/android',false,'2026-09-09T12:00:00Z')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, updated_at = now();
