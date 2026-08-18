# Postgres init — extensions + initial schemas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- fuzzy search for cities
CREATE EXTENSION IF NOT EXISTS "postgis";      -- spatial queries for GPS pings
CREATE EXTENSION IF NOT EXISTS "vector";       -- pgvector for broker embeddings
