-- Kennismarket: troca de processador de pagamento (Transfeera) e split instantâneo.
-- Aplicado SOZINHO pelo Supabase quando entra na main (não rode na mão).
-- Os nomes antigos que aparecem abaixo só existem para serem renomeados.
--
-- O que muda:
--  * o banco de pagamento vira um campo "provedor" (simulado, transfeera...), sem nome fixo nas colunas;
--  * o split é definido quando a cobrança é criada: 50/50 sobre o valor cheio, guardado no pedido;
--  * o repasse ao vendedor acontece junto com o pagamento (sem retenção, sem nova tentativa pelo site);
--  * dados de recebimento do vendedor: chave Pix OU dados bancários, sem conta no banco de pagamento;
--  * reembolso aprovado anota o débito do vendedor (só registro).

-- ---------- Pedidos ----------
alter table pedidos rename column asaas_cobranca_id to cobranca_id;
alter table pedidos rename constraint pedidos_asaas_cobranca_id_key to pedidos_cobranca_id_key;
alter table pedidos add column provedor text;
alter table pedidos add column pix_copia_cola text;
alter table pedidos add column linha_digitavel text;
alter table pedidos add column taxa_percentual integer;

-- Forma de pagamento com nomes próprios do site (não do banco).
alter table pedidos drop constraint pedidos_forma_pagamento_check;
update pedidos set forma_pagamento = case forma_pagamento
  when 'PIX' then 'pix' when 'BOLETO' then 'boleto' when 'CREDIT_CARD' then 'cartao' else 'pix' end;
alter table pedidos add constraint pedidos_forma_pagamento_check check (forma_pagamento in ('pix', 'boleto', 'cartao'));

-- Divisão 50/50 sobre o valor cheio, decidida na criação da cobrança (o centavo quebrado fica com o vendedor).
alter table pedidos drop constraint pedidos_check;
update pedidos set
  taxa_percentual = 50,
  plataforma_centavos = floor(valor_centavos * 50 / 100.0)::integer,
  vendedor_centavos = valor_centavos - floor(valor_centavos * 50 / 100.0)::integer;
alter table pedidos
  alter column taxa_percentual set not null,
  alter column vendedor_centavos set not null,
  alter column plataforma_centavos set not null,
  add constraint pedidos_taxa_percentual_check check (taxa_percentual between 0 and 100),
  add constraint pedidos_divisao_check check (
    vendedor_centavos >= 0 and plataforma_centavos >= 0 and vendedor_centavos + plataforma_centavos = valor_centavos);
alter table pedidos drop column valor_liquido_centavos, drop column repasse_tentativas, drop column repasse_id;

-- Situação do repasse no split instantâneo.
drop index if exists pedidos_repasse_idx;
create type status_repasse_novo as enum (
  'aguardando',  -- pagamento ainda não confirmado
  'processando', -- pago; o banco está fazendo o split
  'repassado',   -- a parte do vendedor chegou a ele
  'falhou'       -- o banco avisou que o split falhou (o suporte resolve com o banco)
);
alter table pedidos alter column repasse_status drop default;
alter table pedidos alter column repasse_status type status_repasse_novo using (
  case repasse_status::text
    when 'concluido' then 'repassado'
    when 'falhou' then 'falhou'
    when 'enviado' then 'processando'
    when 'enviando' then 'processando'
    when 'pendente' then 'processando'
    else 'aguardando'
  end)::status_repasse_novo;
drop type status_repasse;
alter type status_repasse_novo rename to status_repasse;
update pedidos set repasse_status = 'aguardando' where repasse_status is null;
alter table pedidos alter column repasse_status set default 'aguardando', alter column repasse_status set not null;

-- ---------- Dados de recebimento do vendedor ----------
alter table dados_repasse rename to dados_recebimento;
alter table dados_recebimento rename constraint dados_repasse_pkey to dados_recebimento_pkey;
alter table dados_recebimento drop constraint dados_repasse_check;
alter table dados_recebimento drop column asaas_wallet_id;
alter policy "vendedor vê os próprios dados de repasse" on dados_recebimento rename to "vendedor vê os próprios dados de recebimento";

-- Tipos de chave Pix com nomes próprios do site.
create type tipo_chave_pix_novo as enum ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');
alter table dados_recebimento alter column pix_tipo type tipo_chave_pix_novo using (
  case pix_tipo::text
    when 'CPF' then 'cpf' when 'CNPJ' then 'cnpj' when 'EMAIL' then 'email'
    when 'PHONE' then 'telefone' when 'EVP' then 'aleatoria'
  end)::tipo_chave_pix_novo;
drop type tipo_chave_pix;
alter type tipo_chave_pix_novo rename to tipo_chave_pix;

-- ⚠️ Campos bancários comuns no Brasil. Ajustar ao que a Transfeera exigir quando chegar a documentação.
alter table dados_recebimento
  add column nome text,
  add column banco_codigo text check (banco_codigo ~ '^\d{3}$'),
  add column agencia text,
  add column conta text,
  add column conta_tipo text check (conta_tipo in ('corrente', 'poupanca')),
  add column provedor text,
  add column provedor_recebedor_id text, -- código que o banco devolveu no cadastro, se devolver
  add column situacao text not null default 'pendente' check (situacao in ('pendente', 'pronto', 'recusado')),
  add column atualizado_em timestamptz not null default now();
update dados_recebimento d set nome = coalesce(d.nome, p.nome, l.nome)
  from lojas l left join perfis p on p.id = l.vendedor_id where l.id = d.loja_id;
alter table dados_recebimento
  alter column nome set not null,
  add constraint dados_recebimento_destino_check check (
    (pix_chave is not null and pix_tipo is not null)
    or (banco_codigo is not null and agencia is not null and conta is not null and conta_tipo is not null));

-- ---------- Avisos do banco (webhooks) já processados ----------
alter table eventos_asaas rename to eventos_pagamento;
alter table eventos_pagamento add column provedor text not null default 'antigo';
alter table eventos_pagamento alter column provedor drop default;
alter table eventos_pagamento drop constraint eventos_asaas_pkey;
alter table eventos_pagamento add constraint eventos_pagamento_pkey primary key (provedor, id);

-- ---------- Reembolsos e débito do vendedor ----------
alter table reembolsos add column devolucao_id text;

-- Débito do vendedor: quando um reembolso é aprovado, o Kennismarket devolve tudo ao cliente,
-- mas o vendedor já recebeu a parte dele. Aqui fica anotado quanto ele deve (só registro; a
-- cobrança é feita por fora pelos donos).
create table debitos_vendedor (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas,
  pedido_id uuid not null references pedidos,
  reembolso_id uuid not null unique references reembolsos,
  valor_centavos integer not null check (valor_centavos > 0),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'quitado', 'perdoado')),
  observacao text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
alter table debitos_vendedor enable row level security;
create policy "vendedor vê os próprios débitos" on debitos_vendedor for select
  using (exists (select 1 from lojas l where l.id = loja_id and l.vendedor_id = auth.uid()));

-- ---------- Permissões ----------
grant all on debitos_vendedor to service_role;
grant select on debitos_vendedor to authenticated;
