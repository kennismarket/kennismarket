-- Segurança (relatório de 11/11/2026).
--
-- Item 4: nada é gravado no banco direto pelo navegador. O site grava tudo pelo servidor (chave
-- secreta = service_role). Antes, a regra "participantes enviam mensagens" deixava qualquer
-- participante gravar mensagens direto (com a chave pública), escolhendo o lado (cliente, vendedor,
-- sistema) e pulando a marcação de contato por fora. Ler continua igual (regras de leitura do RLS).
drop policy if exists "participantes enviam mensagens" on mensagens;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
-- tabelas criadas depois por este mesmo usuário também nascem sem gravação pelo navegador
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
-- Visitante sem login: só lê o que é público (vitrine e cotações). O Supabase libera leitura de
-- tudo por padrão e só as regras do RLS seguravam; agora a permissão também fecha.
revoke select on all tables in schema public from anon;
alter default privileges in schema public revoke select on tables from anon;
grant select on cotacoes, cotacoes_atuais, lojas, produtos to anon;

-- Item 6: registro das trocas de dados de recebimento (chave Pix), mostrado no painel do dono.
-- Guarda só um resumo (tipo e final da chave; no e-mail, o começo e o domínio), nunca a chave inteira.
create table trocas_recebimento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  vendedor_id uuid references perfis(id) on delete set null,
  em timestamptz not null default now(),
  antes text,
  depois text not null
);
create index trocas_recebimento_em on trocas_recebimento (em desc);
alter table trocas_recebimento enable row level security;
grant all on trocas_recebimento to service_role;
revoke all on trocas_recebimento from anon, authenticated;
