-- Dados no formato do 0001, para testar se o 0002 converte tudo direito.
-- Roda entre o 0001 e o 0002; o conversao-0002.sql confere e apaga.
insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-00000000000a', 'antigo-cliente@x.com'),
  ('90000000-0000-0000-0000-00000000000b', 'antigo-vendedor@x.com');
insert into perfis (id, nome, papel) values
  ('90000000-0000-0000-0000-00000000000a', 'Cliente Antigo', 'cliente'),
  ('90000000-0000-0000-0000-00000000000b', 'Vendedora Antiga', 'vendedor');
insert into lojas (id, vendedor_id, nome, slug, publicada) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-00000000000b', 'Loja Antiga', 'loja-antiga', true);
insert into dados_repasse (loja_id, cpf_cnpj, pix_chave, pix_tipo) values
  ('91000000-0000-0000-0000-000000000001', '12345678909', 'antiga@x.com', 'EMAIL');
insert into produtos (id, loja_id, categoria, titulo, preco_kn) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'mentoria', 'Antigo', 10);
insert into pedidos (id, cliente_id, loja_id, produto_id, valor_kn, cotacao_brl, cotacao_data, valor_centavos,
                     forma_pagamento, asaas_cobranca_id, status, repasse_status, valor_liquido_centavos, vendedor_centavos, plataforma_centavos)
values
  ('93000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001',
   '92000000-0000-0000-0000-000000000001', 10, 6.1, '2026-10-27', 6101, 'PIX', 'cob_antiga_1', 'pago', 'concluido', 6000, 3000, 3000),
  ('93000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001',
   '92000000-0000-0000-0000-000000000001', 10, 6.1, '2026-10-27', 6100, 'CREDIT_CARD', null, 'aguardando_pagamento', null, null, null, null);
insert into eventos_asaas (id, tipo) values ('evt_antigo', 'PAYMENT_RECEIVED');
