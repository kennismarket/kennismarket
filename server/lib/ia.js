// IA do chat de suporte do protótipo (o recurso "sample" do claude.ai).
// Só funciona se ANTHROPIC_API_KEY estiver configurada; sem ela, o protótipo usa
// as respostas prontas dele ("suporte fora do ar, mande um e-mail").
import Anthropic from '@anthropic-ai/sdk';

const MODELO = 'claude-opus-5-5';
const MAX_TURNOS = 14;
const MAX_CARACTERES_TURNO = 40000;
const MAX_CARACTERES_TOTAL = 80000;

const chave = (process.env.ANTHROPIC_API_KEY || '').trim();
const cliente = chave ? new Anthropic({ apiKey: chave }) : null;

export const iaDisponivel = () => Boolean(cliente);

// Confere as mensagens que o navegador mandou, no formato do protótipo: [{ role, content }].
export function validarTurnos(turns) {
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > MAX_TURNOS) return null;
  let total = 0;
  const limpos = [];
  for (const t of turns) {
    if (!t || !['user', 'assistant'].includes(t.role) || typeof t.content !== 'string') return null;
    const texto = t.content.slice(0, MAX_CARACTERES_TURNO);
    if (!texto.trim()) continue;
    total += texto.length;
    limpos.push({ role: t.role, content: texto });
  }
  if (!limpos.length || total > MAX_CARACTERES_TOTAL || limpos[0].role !== 'user') return null;
  return limpos;
}

// Responde aos poucos: chama aoEscrever(textoAteAgora) a cada pedaço e devolve o texto final.
// "sinal" permite cancelar quando o visitante fecha o chat.
export async function responderSuporte(turnos, { aoEscrever, sinal }) {
  if (!cliente) throw Object.assign(new Error('IA desligada'), { codigo: 'sampling_disabled' });
  const stream = cliente.beta.messages.stream({
    model: MODELO,
    max_tokens: 4000, // resposta curta de chat
    output_config: { effort: 'low' },
    // Se o modelo recusar por regra de segurança, a Anthropic tenta outro modelo sozinha.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: turnos,
  }, { signal: sinal });

  let texto = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      texto += ev.delta.text;
      aoEscrever(texto);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') throw Object.assign(new Error('recusado'), { codigo: 'refused' });
  return texto;
}

// Traduz os erros da API para os códigos que o protótipo entende.
export function codigoDoErro(e) {
  if (e?.codigo) return e.codigo;
  if (e instanceof Anthropic.APIUserAbortError) return 'aborted';
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.AuthenticationError) return 'sampling_disabled';
  return 'error';
}
