// Chat real entre cliente e vendedor (etapa 5): regras e o formato que as telas recebem.

// Os mesmos avisos que o protótipo mostra (OFF e SCAM em kennismarket-prototipo.html):
// - contato por fora (telefone, e-mail, "paga no Pix por fora"): não bloqueia; marca a conversa
//   para o suporte ver (decisão dos donos);
// - golpe: idem.
export const CONTATO_FORA = /(\bpix\b|whats|\bzap\b|phone|tel[eé]fono|telefone|celular|call me|ll[aá]mame|me liga|\(?\d{2,3}\)?[\s-]?\d{3,5}[\s-]?\d{4}|@gmail|@hotmail|@yahoo|bank transfer|wire|transferencia|transfer[eê]ncia|paypal\.me|venmo|zelle|outside alpha|por fuera|por fora)/i;
export const GOLPE = /(golp[eiao]|golpist|scam|fraud|estaf|oplicht|bedrieg|enganad|me roubaram|roubo)/i;
export const MAX_TEXTO = 2000;

// Texto da mensagem, limpo; null se vazio.
export function textoDaMensagem(v) {
  const t = String(v ?? '').replace(/\r\n?/g, '\n').trim();
  return t ? t.slice(0, MAX_TEXTO) : null;
}

// Por que marcar a conversa (null = não marca).
export function motivoDaMarcacao(texto) {
  if (GOLPE.test(texto)) return 'golpe';
  if (CONTATO_FORA.test(texto)) return 'contato_fora';
  return null;
}

export function mensagemParaTela(m) {
  return { id: m.id, de: m.de, texto: m.texto || '', chave: m.chave || null, params: m.params || null, em: m.enviada_em };
}

// papel: de que lado está quem vê ("cliente" ou "vendedor"). "nova": a última mensagem é do
// outro lado e chegou depois da última leitura.
export function conversaParaTela(c, papel) {
  const leu = papel === 'cliente' ? c.cliente_leu_em : c.vendedor_leu_em;
  const outro = papel === 'cliente' ? c.ultima_de !== 'cliente' : c.ultima_de !== 'vendedor';
  return {
    id: c.id,
    loja: { nome: c.loja_nome, prototipoId: c.loja_prototipo_id },
    cliente: (c.cliente_nome || '').split(' ')[0] || '',
    clienteId: c.cliente_id,
    ultimaEm: c.ultima_em || null,
    previa: c.ultima_previa || '',
    ultimaDe: c.ultima_de || null,
    nova: Boolean(c.ultima_em && outro && (!leu || c.ultima_em > leu)),
    marcada: c.marcada_em ? { em: c.marcada_em, motivo: c.marcada_motivo } : null,
  };
}

// Grava a mensagem de alguém e marca a conversa se tiver contato por fora ou golpe.
export async function enviarMensagem(repo, conversa, { autorId, de, texto }) {
  const m = await repo.criarMensagem({ conversa_id: conversa.id, autor_id: autorId, de, texto });
  const motivo = motivoDaMarcacao(texto);
  if (motivo && !conversa.marcada_em) await repo.atualizarConversa(conversa.id, { marcada_em: new Date().toISOString(), marcada_motivo: motivo });
  return { mensagem: mensagemParaTela(m), alerta: motivo };
}

// Mensagens automáticas quando o cliente paga (pedido dos donos: as mesmas do protótipo):
// "Você comprou … por N KN" e a resposta do vendedor "Combinado! Já comecei…".
// Ficam gravadas na conversa, para o cliente e o vendedor verem em qualquer aparelho.
// Nunca derruba o pagamento: erro aqui só vai para o log.
export async function avisarPagamento(repo, pedido) {
  try {
    const produto = pedido.produto_id ? await repo.produto(pedido.produto_id) : null;
    const conversa = await repo.abrirConversa(pedido.loja_id, pedido.cliente_id);
    await repo.criarMensagem({ conversa_id: conversa.id, de: 'sistema', chave: 'm_prodBought',
      params: { produto: produto?.prototipo_id ?? null, titulo: produto?.titulo || '', n: pedido.valor_kn, pedido: pedido.id } });
    await repo.criarMensagem({ conversa_id: conversa.id, de: 'vendedor', chave: 'm_started', params: { pedido: pedido.id } });
  } catch (e) {
    console.error('mensagens automáticas do pagamento não gravadas', pedido.id, e.message);
  }
}
