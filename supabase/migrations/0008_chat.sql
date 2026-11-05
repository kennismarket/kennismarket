-- Etapa 5: chat real entre cliente e vendedor.
-- Aplicado SOZINHO pelo Supabase quando entra na main (não rode na mão).
--
-- - mensagens: além do texto escrito por alguém, mensagens automáticas (chave + params), como
--   as que o protótipo mostra quando o cliente paga ("Você comprou…", "Combinado! Já comecei…").
--   "de" diz de que lado a mensagem aparece: cliente, vendedor ou sistema.
-- - conversas: a última mensagem (para a lista e o aviso de mensagem nova), quando cada lado
--   leu pela última vez, e a marcação de "contato por fora" (telefone, e-mail, pagar fora),
--   que libera a conversa para o suporte ler.
-- - entrega_arquivos: arquivos que o vendedor anexa ao entregar um pedido (só aquele cliente,
--   o vendedor e o suporte abrem).
alter table mensagens alter column autor_id drop not null;
alter table mensagens add column de text not null default 'cliente' check (de in ('cliente', 'vendedor', 'sistema'));
alter table mensagens add column chave text check (chave is null or chave ~ '^[A-Za-z0-9_]{1,40}$');
alter table mensagens add column params jsonb;
alter table mensagens alter column texto set default '';
alter table mensagens drop constraint if exists mensagens_texto_check;
alter table mensagens add constraint mensagens_texto_check
  check (length(texto) <= 4000 and (chave is not null or length(texto) >= 1));
create index if not exists mensagens_conversa_idx on mensagens (conversa_id, id);

alter table conversas add column ultima_em timestamptz;
alter table conversas add column ultima_previa text;
alter table conversas add column ultima_de text;
alter table conversas add column cliente_leu_em timestamptz;
alter table conversas add column vendedor_leu_em timestamptz;
alter table conversas add column marcada_em timestamptz;
alter table conversas add column marcada_motivo text;

create table entrega_arquivos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references pedidos on delete cascade,
  arquivo_id text not null references prototipo_arquivos (id),
  nome text not null check (length(nome) between 1 and 200),
  tipo text not null,
  tamanho integer,
  enviado_em timestamptz not null default now(),
  unique (pedido_id, arquivo_id)
);
create index entrega_arquivos_arquivo_idx on entrega_arquivos (arquivo_id);
alter table entrega_arquivos enable row level security;
-- Sem regras para o navegador: só o servidor (chave secreta) acessa.
grant all on entrega_arquivos to service_role;
