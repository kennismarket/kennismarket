-- Testes do banco num Postgres comum (depois de supabase-simulado.sql e das migrações).
-- Cada bloco falha com erro se a regra não for respeitada.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'cliente@x.com'),
  ('00000000-0000-0000-0000-00000000000b', 'vendedor@x.com'),
  ('00000000-0000-0000-0000-00000000000c', 'outro@x.com');
insert into perfis (id, nome, papel) values
  ('00000000-0000-0000-0000-00000000000a', 'Cliente', 'cliente'),
  ('00000000-0000-0000-0000-00000000000b', 'Vendedora', 'vendedor'),
  ('00000000-0000-0000-0000-00000000000c', 'Outro', 'vendedor');
insert into lojas (id, vendedor_id, nome, slug, publicada) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Loja', 'loja', true);
insert into dados_repasse (loja_id, cpf_cnpj, pix_chave, pix_tipo) values
  ('10000000-0000-0000-0000-000000000001', '12345678909', 'v@x.com', 'EMAIL');
insert into produtos (id, loja_id, categoria, titulo, preco_kn) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'mentoria', 'Mentoria', 100);
insert into cotacoes (data, moeda, taxa, fonte) values
  ('2026-10-26', 'BRL', 6.0, 'bce'), ('2026-10-27', 'BRL', 6.1234, 'bce'), ('2026-10-26', 'USD', 1.1, 'bce');
insert into pedidos (id, cliente_id, loja_id, produto_id, valor_kn, cotacao_brl, cotacao_data, valor_centavos, forma_pagamento, repasse_status)
  values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', 100, 6.1234, '2026-10-27', 61234, 'PIX', 'pendente');

-- cotações: a mais recente de cada moeda, e a válida num dia passado
do $$ begin
  assert (select taxa from cotacoes_atuais where moeda = 'BRL') = 6.1234, 'cotacoes_atuais BRL';
  assert (select data from cotacoes_atuais where moeda = 'USD') = '2026-10-26', 'cotacoes_atuais USD';
  assert (select taxa from cotacoes_em('2026-10-26') where moeda = 'BRL') = 6.0, 'cotacoes_em';
  assert (select count(*) from cotacoes_em('2026-10-25')) = 0, 'cotacoes_em antes de tudo';
end $$;

-- trava do repasse: só a primeira atualização condicional pega o pedido
do $$ declare n int; begin
  update pedidos set repasse_status = 'enviando' where id = '30000000-0000-0000-0000-000000000001' and repasse_status in ('pendente', 'falhou');
  get diagnostics n = row_count; assert n = 1, 'primeira trava';
  update pedidos set repasse_status = 'enviando' where id = '30000000-0000-0000-0000-000000000001' and repasse_status in ('pendente', 'falhou');
  get diagnostics n = row_count; assert n = 0, 'segunda trava não pode pegar';
end $$;

-- a divisão gravada tem que bater com o valor
do $$ begin
  begin
    update pedidos set vendedor_centavos = 100, plataforma_centavos = 1 where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'devia recusar divisão que não bate';
  exception when check_violation then null; end;
end $$;

-- um só pedido de reembolso em análise por pedido
insert into reembolsos (pedido_id, motivo, status_anterior) values ('30000000-0000-0000-0000-000000000001', 'x', 'pago');
do $$ begin
  begin
    insert into reembolsos (pedido_id, motivo, status_anterior) values ('30000000-0000-0000-0000-000000000001', 'y', 'pago');
    raise exception 'devia recusar segundo reembolso aberto';
  exception when unique_violation then null; end;
end $$;

-- dados de repasse precisam de chave Pix completa ou walletId
do $$ begin
  begin
    insert into lojas (id, vendedor_id, nome, slug) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'L2', 'l2');
    insert into dados_repasse (loja_id, cpf_cnpj, pix_chave) values ('10000000-0000-0000-0000-000000000002', '1', 'semtipo');
    raise exception 'devia recusar chave Pix sem tipo';
  exception when check_violation then null; end;
end $$;

-- RLS: como usuário logado comum (não dono do banco)
grant usage on schema auth to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c'; -- outro vendedor
do $$ begin
  assert (select count(*) from dados_repasse) = 0, 'outro vendedor NÃO pode ver chave Pix alheia';
  assert (select count(*) from pedidos) = 0, 'outro vendedor NÃO pode ver pedido alheio';
  assert (select count(*) from lojas where slug = 'loja') = 1, 'loja publicada é pública';
  assert (select count(*) from cotacoes) = 3, 'cotações são públicas';
  assert (select count(*) from reembolsos) = 0, 'reembolso alheio é privado';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b'; -- vendedora da loja
do $$ begin
  assert (select count(*) from dados_repasse) = 1, 'vendedora vê a própria chave Pix';
  assert (select count(*) from pedidos) = 1, 'vendedora vê o pedido da loja';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- cliente
do $$ begin
  assert (select count(*) from pedidos) = 1, 'cliente vê o próprio pedido';
  assert (select count(*) from reembolsos) = 1, 'cliente vê o próprio reembolso';
  assert (select count(*) from dados_repasse) = 0, 'cliente NÃO vê chave Pix do vendedor';
end $$;

-- visitante sem login: vê vitrine e cotações, nada privado
reset role;
set local role anon;
do $$ begin
  assert (select count(*) from cotacoes_em('2026-10-27')) = 2, 'visitante lê cotações';
  assert (select count(*) from produtos) = 1, 'visitante vê produtos';
  begin
    perform 1 from pedidos;
    raise exception 'visitante NÃO pode ler pedidos';
  exception when insufficient_privilege then null; end;
end $$;

-- servidor (chave secreta) ignora o RLS e enxerga tudo
reset role;
set local role service_role;
do $$ begin
  assert (select count(*) from dados_repasse) = 1, 'servidor vê dados de repasse';
end $$;

reset role;
update lojas set banida = true where slug = 'loja';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from lojas where slug = 'loja') = 0, 'loja banida some para o público';
  assert (select count(*) from produtos) = 0, 'produtos de loja banida somem';
end $$;

rollback;
\echo 'BANCO: todas as verificações passaram'
