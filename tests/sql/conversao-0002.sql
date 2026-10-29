-- Confere a conversão dos dados antigos feita pelo 0002 e apaga esses dados de teste.
\set ON_ERROR_STOP 1
do $$ declare p record; begin
  select * into p from pedidos where id = '93000000-0000-0000-0000-000000000001';
  assert p.cobranca_id = 'cob_antiga_1', 'cobrança renomeada';
  assert p.forma_pagamento = 'pix', 'forma convertida';
  assert p.repasse_status = 'repassado', 'repasse concluído vira repassado';
  assert p.taxa_percentual = 50, 'taxa 50';
  -- divisão refeita sobre o valor cheio: 6101 → vendedor 3051, plataforma 3050
  assert p.vendedor_centavos = 3051 and p.plataforma_centavos = 3050, 'divisão sobre o valor cheio';
  select * into p from pedidos where id = '93000000-0000-0000-0000-000000000002';
  assert p.forma_pagamento = 'cartao' and p.repasse_status = 'aguardando', 'pedido sem pagamento';
  assert p.vendedor_centavos + p.plataforma_centavos = 6100, 'divisão preenchida';
  assert (select pix_tipo::text from dados_recebimento where loja_id = '91000000-0000-0000-0000-000000000001') = 'email', 'tipo Pix convertido';
  assert (select nome from dados_recebimento where loja_id = '91000000-0000-0000-0000-000000000001') = 'Vendedora Antiga', 'nome preenchido';
  assert (select provedor from eventos_pagamento where id = 'evt_antigo') = 'antigo', 'evento antigo preservado';
end $$;
delete from eventos_pagamento where id = 'evt_antigo';
delete from pedidos where id::text like '93000000%';
delete from dados_recebimento where loja_id = '91000000-0000-0000-0000-000000000001';
delete from produtos where id = '92000000-0000-0000-0000-000000000001';
delete from lojas where id = '91000000-0000-0000-0000-000000000001';
delete from perfis where id::text like '90000000%';
delete from auth.users where id::text like '90000000%';
\echo 'CONVERSÃO 0002: ok'
