-- Kennismarket: estrutura do banco (Supabase / Postgres).
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Valores em reais sempre em CENTAVOS (inteiro). Preços dos produtos em KN Coins (1 KN = 1 euro).
-- Todas as tabelas têm RLS ligado: sem regra explícita, ninguém lê nem escreve pelo navegador.
-- Operações de dinheiro (pedidos, pagamentos, repasses, reembolsos) só passam pelo servidor,
-- que usa a chave secreta.

create type papel as enum ('cliente', 'vendedor', 'dono');
create type status_pedido as enum (
  'aguardando_pagamento', -- cobrança criada, cliente ainda não pagou
  'pago',                 -- pagamento aprovado: o vendedor já pode atender
  'entregue',             -- vendedor marcou como entregue
  'concluido',            -- cliente confirmou que recebeu
  'reembolso_solicitado', -- cliente pediu reembolso, suporte vai analisar
  'reembolsado',
  'contestado',           -- cliente contestou o cartão no banco (chargeback)
  'cancelado'             -- cobrança apagada antes do pagamento
);
create type status_repasse as enum (
  'aguardando_dinheiro', -- pagamento aprovado, mas o dinheiro ainda não caiu (cartão)
  'pendente',            -- dinheiro na conta, repasse ainda não enviado
  'enviando',            -- trava enquanto o pedido de transferência vai para o Asaas
  'enviado',             -- Asaas aceitou a transferência
  'concluido',           -- Asaas confirmou que o dinheiro chegou ao vendedor
  'falhou'               -- deu erro; a tarefa de hora em hora tenta de novo
);
create type status_reembolso as enum ('em_analise', 'aprovado', 'negado');
create type tipo_chave_pix as enum ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP');

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
  convite_token text references convites,
  publicada boolean not null default false,
  banida boolean not null default false,
  criada_em timestamptz not null default now()
);

-- Dados para pagar o vendedor. Tabela separada porque as lojas são públicas e isto não.
create table dados_repasse (
  loja_id uuid primary key references lojas on delete cascade,
  cpf_cnpj text not null,
  pix_chave text,
  pix_tipo tipo_chave_pix,
  asaas_wallet_id text,  -- só quando houver CNPJ e subcontas no Asaas
  check (asaas_wallet_id is not null or (pix_chave is not null and pix_tipo is not null))
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

-- Cotações diárias: quanto 1 euro (= 1 KN) vale em cada moeda. Histórico nunca é apagado.
create table cotacoes (
  data date not null,
  moeda text not null check (moeda ~ '^[A-Z]{3}$'),
  taxa numeric(18, 8) not null check (taxa > 0),
  fonte text not null,
  buscada_em timestamptz not null default now(),
  primary key (data, moeda)
);

-- Pedido = compra exata de KN Coins no valor do produto. Não existe saldo avulso.
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references perfis,
  loja_id uuid not null references lojas,
  produto_id uuid not null references produtos,
  status status_pedido not null default 'aguardando_pagamento',
  -- Valor e cotação congelados no momento da compra
  valor_kn integer not null check (valor_kn > 0),
  cotacao_brl numeric(18, 8) not null,
  cotacao_data date not null,
  moeda_exibida text,
  cotacao_exibida numeric(18, 8),
  valor_centavos integer not null check (valor_centavos > 0),
  forma_pagamento text not null check (forma_pagamento in ('PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED')),
  asaas_cobranca_id text unique,
  link_pagamento text,
  pago_em timestamptz,
  entregue_em timestamptz,
  concluido_em timestamptz,
  -- Repasse ao vendedor (50/50 sobre o valor líquido, depois da taxa do Asaas)
  valor_liquido_centavos integer,
  repasse_status status_repasse,
  repasse_tentativas integer not null default 0,
  repasse_id text,
  repasse_erro text,
  vendedor_centavos integer,
  plataforma_centavos integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (vendedor_centavos is null or vendedor_centavos + plataforma_centavos = coalesce(valor_liquido_centavos, valor_centavos))
);
create index pedidos_repasse_idx on pedidos (repasse_status) where repasse_status in ('pendente', 'falhou');

-- Reembolso: nunca automático, sempre em dinheiro, decidido pelo suporte.
create table reembolsos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos,
  motivo text not null check (length(motivo) between 1 and 2000),
  status status_reembolso not null default 'em_analise',
  status_anterior status_pedido not null,  -- para onde o pedido volta se for negado
  valor_centavos integer,                  -- reembolso parcial (vazio = total)
  decidido_por uuid references perfis,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
-- Só um pedido de reembolso em análise por vez para o mesmo pedido.
create unique index reembolsos_um_aberto on reembolsos (pedido_id) where status = 'em_analise';

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

-- Avisos já processados do Asaas, para não processar o mesmo duas vezes.
create table eventos_asaas (
  id text primary key,
  tipo text not null,
  recebido_em timestamptz not null default now()
);

-- ---------- Consultas de cotação ----------
-- Última cotação de cada moeda.
create view cotacoes_atuais with (security_invoker = true) as
  select distinct on (moeda) data, moeda, taxa, fonte
  from cotacoes order by moeda, data desc;

-- Cotação válida em um dia (a mais recente até aquela data).
create function cotacoes_em(dia date)
returns table (data date, moeda text, taxa numeric, fonte text)
language sql stable security invoker as $$
  select distinct on (c.moeda) c.data, c.moeda, c.taxa, c.fonte
  from cotacoes c where c.data <= dia order by c.moeda, c.data desc;
$$;

-- ---------- Regras de acesso (RLS) ----------
alter table perfis enable row level security;
alter table convites enable row level security;
alter table lojas enable row level security;
alter table dados_repasse enable row level security;
alter table produtos enable row level security;
alter table entregaveis enable row level security;
alter table cotacoes enable row level security;
alter table pedidos enable row level security;
alter table reembolsos enable row level security;
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table eventos_asaas enable row level security;

create policy "ver o próprio perfil" on perfis for select using (auth.uid() = id);

create policy "lojas publicadas são públicas" on lojas for select
  using ((publicada and not banida) or vendedor_id = auth.uid());
create policy "vendedor vê os próprios dados de repasse" on dados_repasse for select
  using (exists (select 1 from lojas l where l.id = loja_id and l.vendedor_id = auth.uid()));
create policy "produtos ativos de lojas publicadas são públicos" on produtos for select
  using (exists (select 1 from lojas l where l.id = loja_id
    and ((l.publicada and not l.banida and ativo) or l.vendedor_id = auth.uid())));
create policy "cotações são públicas" on cotacoes for select using (true);

create policy "cliente e vendedor veem o pedido" on pedidos for select
  using (cliente_id = auth.uid() or exists (select 1 from lojas l where l.id = loja_id and l.vendedor_id = auth.uid()));
create policy "cliente vê os próprios pedidos de reembolso" on reembolsos for select
  using (exists (select 1 from pedidos p where p.id = pedido_id and p.cliente_id = auth.uid()));

create policy "participantes veem a conversa" on conversas for select
  using (cliente_id = auth.uid() or exists (select 1 from lojas l where l.id = loja_id and l.vendedor_id = auth.uid()));
create policy "participantes leem mensagens" on mensagens for select
  using (exists (select 1 from conversas c where c.id = conversa_id and (c.cliente_id = auth.uid()
    or exists (select 1 from lojas l where l.id = c.loja_id and l.vendedor_id = auth.uid()))));
create policy "participantes enviam mensagens" on mensagens for insert
  with check (autor_id = auth.uid() and exists (select 1 from conversas c where c.id = conversa_id and (c.cliente_id = auth.uid()
    or exists (select 1 from lojas l where l.id = c.loja_id and l.vendedor_id = auth.uid()))));

-- ---------- Permissões ----------
-- Projetos novos do Supabase podem não liberar tabelas novas automaticamente.
-- O servidor (chave secreta = service_role) precisa de acesso total; o RLS acima continua
-- valendo para o navegador (anon = visitante, authenticated = logado).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function cotacoes_em(date) to anon, authenticated, service_role;
grant select on cotacoes, cotacoes_atuais, lojas, produtos to anon, authenticated;
grant select on perfis, dados_repasse, pedidos, reembolsos, conversas, mensagens to authenticated;
grant insert on mensagens to authenticated;
