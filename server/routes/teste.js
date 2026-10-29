import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { atualizarCotacoes } from '../lib/cotacoes.js';
import { linhaDoRecebedor } from '../lib/recebimento.js';
import { erro, rota } from '../lib/seguranca.js';
import { processarAviso } from './webhook-pagamento.js';

const pagina = fileURLToPath(new URL('../teste/pagamentos.html', import.meta.url));

// Página de teste do fluxo de pagamento: /teste/pagamentos.
// SÓ EXISTE com o provedor simulado. Com um banco de verdade, tudo aqui responde 404.
export function rotasTeste(deps) {
  const { repo, pagamentos } = deps;
  const pagina404 = (_req, _res, next) => next(pagamentos.provedor === 'simulado' ? undefined : erro(404, 'rota não encontrada'));

  const telas = Router();
  telas.get('/pagamentos', pagina404, (_req, res) => res.sendFile(pagina));

  const api = Router();
  api.use(pagina404);

  // Cria (ou reaproveita) cliente, vendedora e dono de teste, loja, produto e dados de recebimento.
  api.post('/preparar', rota(async (_req, res) => {
    const d = await repo.prepararDadosTeste();
    const recebedor = { nome: 'Vendedora de Teste', documento: '52998224725', pix: { chave: 'vendedor@teste.kennismarket.invalid', tipo: 'email' }, banco: null, recebedorId: null };
    const resposta = await pagamentos.cadastrarRecebedor(recebedor);
    await repo.salvarDadosRecebimento(linhaDoRecebedor(d.lojaId, recebedor, pagamentos.provedor, resposta));
    let cotacao = (await repo.ultimasCotacoes()).find((c) => c.moeda === 'BRL');
    if (!cotacao) {
      await atualizarCotacoes(repo);
      cotacao = (await repo.ultimasCotacoes()).find((c) => c.moeda === 'BRL');
    }
    if (!cotacao) throw erro(503, 'sem cotação do euro: as fontes de cotação não responderam, tente de novo mais tarde');
    res.json({ ...d, cotacao: { brl: Number(cotacao.taxa), data: cotacao.data }, formas: pagamentos.formas });
  }));

  // Faz o "banco simulado" mandar um aviso assinado, passando pelo mesmo caminho do aviso real.
  api.post('/simular', rota(async (req, res) => {
    const { pedidoId, tipo = 'pago' } = req.body || {};
    if (!['pago', 'cancelado'].includes(tipo)) throw erro(400, 'tipo: pago ou cancelado');
    const p = pedidoId && await repo.pedido(pedidoId);
    if (!p?.cobranca_id) throw erro(404, 'pedido não encontrado');
    const aviso = pagamentos.simulador.gerarAviso(p.cobranca_id, tipo);
    const r = await processarAviso(deps, aviso);
    res.status(r.status).json(r.corpo);
  }));

  api.get('/debitos/:pedidoId', rota(async (req, res) => {
    res.json(await repo.listarDebitos({ pedidoId: req.params.pedidoId }));
  }));

  return { telas, api };
}
