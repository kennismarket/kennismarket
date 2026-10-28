#!/bin/sh
# Testa as migrações e as regras do banco num Postgres DESCARTÁVEL (nunca no Supabase de verdade).
# Uso: BANCO_TESTE=postgres://usuario@localhost:5432/km_teste npm run test:banco
set -e
[ -n "$BANCO_TESTE" ] || { echo "Defina BANCO_TESTE com um banco Postgres vazio e descartável."; exit 1; }
cd "$(dirname "$0")/../.."
psql "$BANCO_TESTE" -v ON_ERROR_STOP=1 -q -f tests/sql/supabase-simulado.sql
for f in supabase/migrations/*.sql; do psql "$BANCO_TESTE" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$BANCO_TESTE" -v ON_ERROR_STOP=1 -q -f tests/sql/verificacoes.sql
