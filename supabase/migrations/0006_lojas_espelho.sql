-- Etapa 2: as lojas do protótipo (documentos "stores/s<id>") passam a ter uma cópia nas
-- tabelas reais, que os pedidos usam. O servidor atualiza a cópia sozinho a cada gravação.
--
-- - lojas.prototipo_id: o id da loja no protótipo (o "123" de "stores/s123").
-- - lojas.vendedor_id passa a aceitar vazio: lojas criadas pelo dono no painel não têm
--   vendedor (e não vendem de verdade enquanto não tiverem quem receba).
-- - lojas.porcentagem_vendedor: a parte do vendedor em cada venda (decisão dos donos:
--   padrão 50, o dono ajusta por loja de 10 a 90). O pedido congela a porcentagem usada.
-- - produtos.prototipo_id: o id do produto dentro da loja do protótipo.
alter table lojas alter column vendedor_id drop not null;
alter table lojas add column prototipo_id bigint unique;
alter table lojas add column porcentagem_vendedor smallint not null default 50
  check (porcentagem_vendedor between 10 and 90);
alter table produtos add column prototipo_id text;
alter table produtos add constraint produtos_loja_prototipo_unico unique (loja_id, prototipo_id);
