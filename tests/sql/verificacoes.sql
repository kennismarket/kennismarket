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
insert into dados_recebimento (loja_id, nome, cpf_cnpj, pix_chave, pix_tipo, situacao) values
  ('10000000-0000-0000-0000-000000000001', 'Vendedora', '12345678909', 'v@x.com', 'email', 'pronto');
insert into produtos (id, loja_id, categoria, titulo, preco_kn) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'mentoria', 'Mentoria', 100);
insert into cotacoes (data, moeda, taxa, fonte) values
  ('2026-10-26', 'BRL', 6.0, 'bce'), ('2026-10-27', 'BRL', 6.1234, 'bce'), ('2026-10-26', 'USD', 1.1, 'bce');
insert into pedidos (id, cliente_id, loja_id, produto_id, valor_kn, cotacao_brl, cotacao_data, valor_centavos, forma_pagamento,
                     taxa_percentual, vendedor_centavos, plataforma_centavos, provedor)
  values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001', 100, 6.1234, '2026-10-27', 61234, 'pix', 50, 30617, 30617, 'simulado');

-- cotações: a mais recente de cada moeda, e a válida num dia passado
do $$ begin
  assert (select taxa from cotacoes_atuais where moeda = 'BRL') = 6.1234, 'cotacoes_atuais BRL';
  assert (select data from cotacoes_atuais where moeda = 'USD') = '2026-10-26', 'cotacoes_atuais USD';
  assert (select taxa from cotacoes_em('2026-10-26') where moeda = 'BRL') = 6.0, 'cotacoes_em';
  assert (select count(*) from cotacoes_em('2026-10-25')) = 0, 'cotacoes_em antes de tudo';
end $$;

-- pedido novo começa aguardando, e a mudança condicional só pega uma vez
do $$ declare n int; begin
  assert (select repasse_status::text from pedidos where id = '30000000-0000-0000-0000-000000000001') = 'aguardando', 'repasse começa aguardando';
  update pedidos set status = 'pago', repasse_status = 'repassado' where id = '30000000-0000-0000-0000-000000000001' and status = 'aguardando_pagamento';
  get diagnostics n = row_count; assert n = 1, 'primeira mudança';
  update pedidos set status = 'pago', repasse_status = 'repassado' where id = '30000000-0000-0000-0000-000000000001' and status = 'aguardando_pagamento';
  get diagnostics n = row_count; assert n = 0, 'segunda mudança não pode pegar';
end $$;

-- forma de pagamento só com os nomes do site
do $$ begin
  begin
    update pedidos set forma_pagamento = 'PIX' where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'devia recusar forma de pagamento antiga';
  exception when check_violation then null; end;
end $$;

-- a divisão gravada tem que bater com o valor
do $$ begin
  begin
    update pedidos set vendedor_centavos = 30618 where id = '30000000-0000-0000-0000-000000000001';
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

-- dados de recebimento: chave Pix completa ou dados bancários completos
insert into lojas (id, vendedor_id, nome, slug) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'L2', 'l2');
do $$ begin
  begin
    insert into dados_recebimento (loja_id, nome, cpf_cnpj, pix_chave) values ('10000000-0000-0000-0000-000000000002', 'X', '1', 'semtipo');
    raise exception 'devia recusar chave Pix sem tipo';
  exception when check_violation then null; end;
  begin
    insert into dados_recebimento (loja_id, nome, cpf_cnpj, banco_codigo, agencia) values ('10000000-0000-0000-0000-000000000002', 'X', '1', '001', '1234');
    raise exception 'devia recusar dados bancários incompletos';
  exception when check_violation then null; end;
end $$;
insert into dados_recebimento (loja_id, nome, cpf_cnpj, banco_codigo, agencia, conta, conta_tipo)
  values ('10000000-0000-0000-0000-000000000002', 'Outro', '11144477735', '001', '1234', '56789-0', 'corrente');

-- débito do vendedor: um por reembolso
insert into debitos_vendedor (loja_id, pedido_id, reembolso_id, valor_centavos)
  select '10000000-0000-0000-0000-000000000001', pedido_id, id, 30617 from reembolsos limit 1;
do $$ begin
  begin
    insert into debitos_vendedor (loja_id, pedido_id, reembolso_id, valor_centavos)
      select '10000000-0000-0000-0000-000000000001', pedido_id, id, 1 from reembolsos limit 1;
    raise exception 'devia recusar dois débitos para o mesmo reembolso';
  exception when unique_violation then null; end;
end $$;

-- RLS: como usuário logado comum (não dono do banco)
grant usage on schema auth to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c'; -- outro vendedor
do $$ begin
  assert (select count(*) from dados_recebimento) = 1, 'outro vendedor vê só os próprios dados de recebimento';
  assert (select count(*) from dados_recebimento where pix_chave = 'v@x.com') = 0, 'outro vendedor NÃO pode ver chave Pix alheia';
  assert (select count(*) from debitos_vendedor) = 0, 'outro vendedor NÃO vê débito alheio';
  assert (select count(*) from pedidos) = 0, 'outro vendedor NÃO pode ver pedido alheio';
  assert (select count(*) from lojas where slug = 'loja') = 1, 'loja publicada é pública';
  assert (select count(*) from cotacoes) = 3, 'cotações são públicas';
  assert (select count(*) from reembolsos) = 0, 'reembolso alheio é privado';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b'; -- vendedora da loja
do $$ begin
  assert (select count(*) from dados_recebimento) = 1, 'vendedora vê a própria chave Pix';
  assert (select count(*) from debitos_vendedor) = 1, 'vendedora vê o próprio débito';
  assert (select count(*) from pedidos) = 1, 'vendedora vê o pedido da loja';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- cliente
do $$ begin
  assert (select count(*) from pedidos) = 1, 'cliente vê o próprio pedido';
  assert (select count(*) from reembolsos) = 1, 'cliente vê o próprio reembolso';
  assert (select count(*) from dados_recebimento) = 0, 'cliente NÃO vê chave Pix do vendedor';
  assert (select count(*) from debitos_vendedor) = 0, 'cliente NÃO vê débito do vendedor';
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
  assert (select count(*) from dados_recebimento) = 2, 'servidor vê todos os dados de recebimento';
end $$;

reset role;
update lojas set banida = true where slug = 'loja';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from lojas where slug = 'loja') = 0, 'loja banida some para o público';
  assert (select count(*) from produtos) = 0, 'produtos de loja banida somem';
end $$;

-- protótipo: só coleções conhecidas, ids seguros, e nada visível para o navegador
reset role;
insert into prototipo_docs (colecao, id, dados) values ('stores', 's1001', '{"store":{"id":1001}}');
do $$ begin
  begin
    insert into prototipo_docs (colecao, id, dados) values ('outra', 'x', '{}');
    raise exception 'devia recusar coleção desconhecida';
  exception when check_violation then null; end;
  begin
    insert into prototipo_docs (colecao, id, dados) values ('stores', '../x', '{}');
    raise exception 'devia recusar id com barra';
  exception when check_violation then null; end;
  assert (select public from storage.buckets where id = 'prototipo') = false, 'pasta de arquivos privada';
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from prototipo_docs;
    raise exception 'navegador NÃO pode ler o protótipo direto';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
\echo 'BANCO: todas as verificações passaram'
