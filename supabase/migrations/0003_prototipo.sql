-- Kennismarket: dados da VERSÃO DE TESTES (demonstração igual ao protótipo).
-- Aplicado SOZINHO pelo Supabase quando entra na main (não rode na mão).
--
-- O protótipo guardava lojas, arquivos de entrega e contas de vendedor num banco
-- simples do claude.ai (coleções de documentos). Estas tabelas fazem o mesmo papel no
-- Supabase, para o protótipo funcionar igual no site. Só o servidor lê e grava aqui.
-- Na versão final, os donos vão criar outro projeto do Supabase só com dados reais.

-- Documentos do protótipo, como no claude.ai: coleção + id + conteúdo.
create table prototipo_docs (
  colecao text not null check (colecao in ('stores', 'delivfiles', 'sellers')),
  id text not null check (id ~ '^[A-Za-z0-9_.:@+~-]{1,200}$'),
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (colecao, id)
);

-- Arquivos enviados pelo protótipo (PDFs, imagens, vídeos). O conteúdo fica no
-- Storage do Supabase (pasta "prototipo"); aqui fica o tipo e o tamanho.
create table prototipo_arquivos (
  id text primary key check (id ~ '^[0-9a-f]{32}$'),
  tipo text not null,
  tamanho integer not null check (tamanho > 0),
  criado_em timestamptz not null default now()
);

alter table prototipo_docs enable row level security;
alter table prototipo_arquivos enable row level security;
-- Sem regras para o navegador: só o servidor (chave secreta) acessa.
grant all on prototipo_docs, prototipo_arquivos to service_role;

-- Pasta privada no Storage para os arquivos do protótipo (até 20 MB cada).
insert into storage.buckets (id, name, public, file_size_limit)
values ('prototipo', 'prototipo', false, 20971520)
on conflict (id) do nothing;
