-- Várias lojas por conta (decisão dos donos, 04/11/2026): uma conta de vendedor pode ter até
-- 10 lojas. O limite fica no servidor (server/lib/lojas-prototipo.js, MAX_LOJAS_POR_CONTA);
-- aqui só sai a trava "uma loja por vendedor". Cada loja continua com os próprios dados de
-- recebimento (dados_recebimento.loja_id), a própria porcentagem e os próprios pedidos.
alter table lojas drop constraint if exists lojas_vendedor_id_key;
create index if not exists lojas_vendedor_idx on lojas (vendedor_id);
