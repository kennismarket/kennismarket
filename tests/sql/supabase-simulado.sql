-- Imita o mínimo do Supabase para testar as migrações num Postgres comum.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
-- Como no Supabase de verdade: tabelas novas do esquema public nascem com tudo liberado para o
-- navegador (anon/authenticated), e só o RLS segura. As migrações precisam fechar o que for preciso.
alter default privileges in schema public grant all on tables to anon, authenticated;

-- Storage do Supabase (só a tabela de pastas, que as migrações usam).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]
);
