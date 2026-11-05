import { Router } from 'express';
import { conversaParaTela, enviarMensagem, mensagemParaTela, textoDaMensagem } from '../lib/chat.js';
import { limitePorIp } from '../lib/limite.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';

// Chat real entre cliente e vendedor (etapa 5). Uma conversa por cliente e loja.
// - O cliente fala com a loja pelo id da loja no protótipo (/loja/:pid), e a conversa nasce na
//   primeira mensagem. Lojas sem vendedor de verdade (as do dono) continuam com o robô do
//   protótipo: a resposta diz real: false.
// - O vendedor responde pelas conversas das lojas dele (/conversas/:id).
// - Abrir as mensagens marca a conversa como lida para quem abriu (aviso de mensagem nova).
export function rotasChat({ repo, pagamentos, limites = {} }) {
  const r = Router();
  r.use(exigirUsuario(repo, pagamentos));
  const envios = limites.desligados ? (_q, _s, n) => n() : limitePorIp({ max: 120, janelaMs: 10 * 60 * 1000 });
  const depoisDe = (req) => Math.max(0, Number.parseInt(req.query.depois, 10) || 0);

  // A loja (pelo id do protótipo) e se o cliente pode conversar de verdade com ela.
  async function lojaParaCliente(req) {
    const pid = Number(req.params.pid);
    const loja = Number.isInteger(pid) ? await repo.lojaPorPrototipo(pid) : null;
    if (!loja || !loja.vendedor_id) return { loja, real: false, motivo: 'sem_vendedor' };
    if (loja.vendedor_id === req.usuario.id) return { loja, real: false, motivo: 'propria_loja' };
    if (loja.banida || !loja.publicada) return { loja, real: false, motivo: 'indisponivel' };
    return { loja, real: true };
  }
  // A conversa e de que lado está quem pediu ("cliente" ou "vendedor"). Outra pessoa: 404.
  async function conversaDe(req) {
    const c = await repo.conversa(req.params.id);
    if (!c) throw erro(404, 'conversa não encontrada');
    if (c.cliente_id === req.usuario.id) return { c, papel: 'cliente' };
    const loja = await repo.loja(c.loja_id);
    if (loja?.vendedor_id === req.usuario.id) return { c, papel: 'vendedor', loja };
    throw erro(404, 'conversa não encontrada');
  }
  const marcarLida = (c, papel) => repo.atualizarConversa(c.id, { [papel === 'cliente' ? 'cliente_leu_em' : 'vendedor_leu_em']: new Date().toISOString() });

  // As conversas de quem pediu. ?papel=vendedor: as das lojas dele (?loja=<pid> para uma só).
  r.get('/conversas', rota(async (req, res) => {
    const papel = req.query.papel === 'vendedor' ? 'vendedor' : 'cliente';
    let lista;
    if (papel === 'vendedor') {
      let lojas = await repo.lojasDoVendedor(req.usuario.id);
      if (req.query.loja != null) lojas = lojas.filter((l) => String(l.prototipo_id) === String(req.query.loja));
      lista = await repo.listarConversas({ lojaIds: lojas.map((l) => l.id) });
    } else {
      lista = await repo.listarConversas({ clienteId: req.usuario.id });
    }
    res.json({ conversas: lista.filter((c) => c.ultima_em).map((c) => conversaParaTela(c, papel)) });
  }));

  // Cliente: a conversa com a loja (vazia se ainda não escreveu).
  r.get('/loja/:pid', rota(async (req, res) => {
    const { loja, real, motivo } = await lojaParaCliente(req);
    if (!real) return res.json({ real: false, motivo });
    const c = await repo.conversaPor(loja.id, req.usuario.id);
    if (!c) return res.json({ real: true, conversa: null, mensagens: [] });
    const mensagens = await repo.mensagensDaConversa(c.id, { depois: depoisDe(req) });
    await marcarLida(c, 'cliente');
    res.json({ real: true, conversa: conversaParaTela(c, 'cliente'), mensagens: mensagens.map(mensagemParaTela) });
  }));

  // Cliente escreve para a loja (a conversa nasce aqui).
  r.post('/loja/:pid/mensagens', envios, rota(async (req, res) => {
    const texto = textoDaMensagem(req.body?.texto);
    if (!texto) throw erro(400, 'mensagem vazia');
    const { loja, real, motivo } = await lojaParaCliente(req);
    if (!real) throw erro(409, motivo === 'propria_loja' ? 'esta loja é sua' : 'esta loja não tem chat de verdade');
    const c = await repo.abrirConversa(loja.id, req.usuario.id);
    const r2 = await enviarMensagem(repo, c, { autorId: req.usuario.id, de: 'cliente', texto });
    await marcarLida(c, 'cliente');
    res.status(201).json({ conversaId: c.id, ...r2 });
  }));

  // Participante lê as mensagens (marca como lida para o lado dele).
  r.get('/conversas/:id/mensagens', rota(async (req, res) => {
    const { c, papel } = await conversaDe(req);
    const mensagens = await repo.mensagensDaConversa(c.id, { depois: depoisDe(req) });
    await marcarLida(c, papel);
    res.json({ conversa: conversaParaTela(c, papel), mensagens: mensagens.map(mensagemParaTela) });
  }));

  // Participante escreve. A loja banida não responde mais.
  r.post('/conversas/:id/mensagens', envios, rota(async (req, res) => {
    const texto = textoDaMensagem(req.body?.texto);
    if (!texto) throw erro(400, 'mensagem vazia');
    const { c, papel, loja } = await conversaDe(req);
    if (papel === 'vendedor' && loja.banida) throw erro(403, 'loja banida');
    const r2 = await enviarMensagem(repo, c, { autorId: req.usuario.id, de: papel, texto });
    await marcarLida(c, papel);
    res.status(201).json({ conversaId: c.id, ...r2 });
  }));

  return r;
}
