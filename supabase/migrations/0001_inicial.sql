-- Kennismarket: estrutura inicial do banco (Supabase / Postgres).
-- RASCUNHO: revisar antes de aplicar. Valores de dinheiro sempre em centavos (inteiro).
-- Todas as tabelas têm RLS ligado: sem regra explícita, ninguém lê nem escreve pelo navegador.
-- Operações de dinheiro (pedidos, pagamentos, reembolsos) só passam pelo servidor.

create type papel as enum ('cliente', 'vendedor', 'dono');
create type origem_vendedor as enum ('inscricao', 'convite');
create type status_pedido as enum (
  'aguardando_pagamento', 'pago', 'em_andamento', 'entregue',
  'concluido', 'reembolso_solicitado', 'reembolsado', 'cancelado'
);
create type status_reembolso as enum ('em_analise', 'aprovado', 'negado');

-- Perfil de cada pessoa cadastrada (o login fica no auth.users do Supabase).
create table perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  papel papel not null default 'cliente',
  idioma text not null default 'nl' check (idioma in ('nl', 'en', 'es', 'pt')),
  criado_em timestamptz not null default now()
);

-- Links de convite: só os donos criam. Cada link vale uma vez.
create table convites (
  token text primary key,
  email text not null,
  criado_por uuid not null references perfis,
  expira_em timestamptz not null default now() + interval '7 days',
  usado_em timestamptz,
  usado_por uuid references perfis
);

create table lojas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null unique references perfis,
  nome text not null,
  slug text not null unique,
  descricao text not null default '',
  origem origem_vendedor not null default 'inscricao',
  convite_token text references convites,
  asaas_wallet_id text,            -- carteira do vendedor no Asaas, usada no split
  publicada boolean not null default false,
  criada_em timestamptz not null default now()
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  categoria text not null,         -- mentoria, consultoria, sites, cardapio, ebooks...
  titulo text not null,
  descricao text not null default '',
  preco_kn integer not null check (preco_kn > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Arquivos de entrega (e-books etc.) ficam no Storage, pasta privada por produto.
create table entregaveis (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos on delete cascade,
  caminho_storage text not null,
  nome text not null
);

-- Pedido = compra exata de KN Coins no valor do produto. Não existe saldo avulso.
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references perfis,
  loja_id uuid not null references lojas,
  produto_id uuid not null references produtos,
  valor_kn integer not null check (valor_kn > 0),
  valor_centavos integer not null check (valor_centavos > 0),
  taxa_percentual integer not null,         -- congelada no momento da compra
  vendedor_centavos integer not null,
  plataforma_centavos integer not null,
  status status_pedido not null default 'aguardando_pagamento',
  asaas_cobranca_id text unique,
  pago_em timestamptz,
  entregue_em timestamptz,
  criado_em timestamptz not null default now(),
  check (vendedor_centavos + plataforma_centavos = valor_centavos)
);

-- Reembolso: nunca automático, sempre em dinheiro, decidido pelo suporte.
create table reembolsos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references pedidos,
  motivo text not null,
  status status_reembolso not null default 'em_analise',
  decidido_por uuid references perfis,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Chat cliente ↔ vendedor (uma conversa por cliente e loja).
create table conversas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  cliente_id uuid not null references perfis,
  criada_em timestamptz not null default now(),
  unique (loja_id, cliente_id)
);

create table mensagens (
  id bigint generated always as identity primary key,
  conversa_id uuid not null references conversas on delete cascade,
  autor_id uuid not null references perfis,
  texto text not null check (length(texto) between 1 and 4000),
  enviada_em timestamptz not null default now()
);

-- Avisos recebidos do Asaas, guardados para conferência e para não processar duas vezes.
create table eventos_asaas (
  id text primary key,
  tipo text not null,
  corpo jsonb not null,
  recebido_em timestamptz not null default now()
);

-- ---------- Regras de acesso (RLS) ----------
alter table perfis enable row level security;
alter table convites enable row level security;
alter table lojas enable row level security;
alter table produtos enable row level security;
alter table entregaveis enable row level security;
alter table pedidos enable row level security;
alter table reembolsos enable row level security;
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table eventos_asaas enable row level security;

create policy "ver o próprio perfil" on perfis for select using (auth.uid() = id);

create policy "lojas publicadas são públicas" on lojas for select
  using (publicada or vendedor_id = auth.uid());
create policy "produtos ativos de lojas publicadas são públicos" on produtos for select
  using (exists (select 1 from lojas l where l.id = loja_id and (l.publicada and ativo or l.vendedor_id = auth.uid())));

create policy "cliente e vendedor veem o pedido" on pedidos for select
  using (cliente_id = auth.uid() or exists (select 1 from lojas l where l.id = loja_id and l.vendedor_id = auth.uid()));

create policy "participantes veem a conversa" on conversas for select
  using (cliente_id = auth.uid() or exists (select 1 from lojas l where l.id = loja_id and l.vendedor_id = auth.uid()));
create policy "participantes leem mensagens" on mensagens for select
  using (exists (select 1 from conversas c where c.id = conversa_id and (c.cliente_id = auth.uid()
    or exists (select 1 from lojas l where l.id = c.loja_id and l.vendedor_id = auth.uid()))));
create policy "participantes enviam mensagens" on mensagens for insert
  with check (autor_id = auth.uid() and exists (select 1 from conversas c where c.id = conversa_id and (c.cliente_id = auth.uid()
    or exists (select 1 from lojas l where l.id = c.loja_id and l.vendedor_id = auth.uid()))));
