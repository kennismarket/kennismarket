#!/bin/sh
# Testa as migrações e as regras do banco num Postgres DESCARTÁVEL (nunca no Supabase de verdade).
# Uso: BANCO_TESTE=postgres://usuario@localhost:5432/km_teste npm run test:banco
# Ordem: Supabase simulado → 0001 → dados no formato antigo → 0002... → confere a conversão → regras.
set -e
[ -n "$BANCO_TESTE" ] || { echo "Defina BANCO_TESTE com um banco Postgres vazio e descartável."; exit 1; }
cd "$(dirname "$0")/../.."
P="psql $BANCO_TESTE -v ON_ERROR_STOP=1 -q"
$P -f tests/sql/supabase-simulado.sql
$P -f supabase/migrations/0001_inicial.sql
$P -f tests/sql/dados-antigos.sql
for f in supabase/migrations/*.sql; do
  [ "$f" = supabase/migrations/0001_inicial.sql ] || $P -f "$f"
done
$P -f tests/sql/conversao-0002.sql
$P -f tests/sql/verificacoes.sql
