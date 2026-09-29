-- Extensión para búsqueda difusa (fuzzy search) de nombres de cartas.
-- Se usa similarity() y los operadores % en las queries de búsqueda.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índice GIN trigram sobre el nombre de la carta: aceleraILIKE '%término%'
-- y similarity() para el buscador.
CREATE INDEX IF NOT EXISTS cards_name_trgm_idx ON cards USING GIN (name gin_trgm_ops);

-- Índice GIN trigram sobre nombres de sets, para filtrar/autocompletar sets.
CREATE INDEX IF NOT EXISTS card_sets_name_trgm_idx ON card_sets USING GIN (name gin_trgm_ops);
