import crypto from 'node:crypto';
import { Router } from 'express';
import { knParaCentavos, centavosParaReais } from '../lib/dinheiro.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';

const FORMAS = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'];
const diaDaqui = (dias) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

export function rotasPedidos({ repo, asaas }) {
  const r = Router();
  r.use(exigirUsuario(repo));

  async function carregar(req, papeisPermitidos) {
    const p = await repo.pedido(req.params.id);
    if (!p) throw erro(404, 'pedido não encontrado');
    const loja = await repo.loja(p.loja_id);
    const papel = p.cliente_id === req.usuario.id ? 'cliente'
      : loja?.vendedor_id === req.usuario.id ? 'vendedor'
      : req.usuario.papel === 'dono' ? 'dono' : null;
    if (!papel || !papeisPermitidos.includes(papel)) throw erro(404, 'pedido não encontrado');
    return p;
  }

  // Muda a situação só se o pedido estiver numa das situações esperadas.
  async function mudar(p, de, campos) {
    const [novo] = await repo.atualizarPedidos({ id: p.id }, campos, { status: de });
    if (!novo) throw erro(409, `o pedido está "${p.status}"`);
    return novo;
  }

  // Cliente compra um produto: cria o pedido e a cobrança no Asaas no valor exato.
  r.post('/', rota(async (req, res) => {
    const { produtoId, formaPagamento, cpfCnpj, moedaExibida } = req.body || {};
    if (!FORMAS.includes(formaPagamento)) throw erro(400, `formaPagamento: ${FORMAS.join(', ')}`);
    const documento = soDigitos(cpfCnpj);
    if (![11, 14].includes(documento.length)) throw erro(400, 'CPF ou CNPJ inválido');

    const produto = produtoId && await repo.produto(produtoId);
    const loja = produto && await repo.loja(produto.loja_id);
    if (!produto?.ativo || !loja?.publicada || loja.banida) throw erro(404, 'produto não encontrado');
    if (loja.vendedor_id === req.usuario.id) throw erro(400, 'você não pode comprar da própria loja');

    // 1 KN = 1 euro: converte para reais com a cotação do dia e congela no pedido.
    const cotacoes = await repo.ultimasCotacoes();
    const brl = cotacoes.find((c) => c.moeda === 'BRL');
    if (!brl) throw erro(503, 'ainda sem cotação do euro salva');
    const exibida = moedaExibida ? String(moedaExibida).toUpperCase() : null;
    const valorCentavos = knParaCentavos(produto.preco_kn, brl.taxa);

    const pedido = await repo.criarPedido({
      id: crypto.randomUUID(),
      cliente_id: req.usuario.id,
      loja_id: loja.id,
      produto_id: produto.id,
      valor_kn: produto.preco_kn,
      cotacao_brl: Number(brl.taxa),
      cotacao_data: brl.data,
      moeda_exibida: exibida,
      cotacao_exibida: exibida === 'EUR' ? 1 : Number(cotacoes.find((c) => c.moeda === exibida)?.taxa) || null,
      valor_centavos: valorCentavos,
      forma_pagamento: formaPagamento,
    });

    try {
      const achado = await asaas.buscarClientePorEmail(req.usuario.email);
      const clienteId = achado?.data?.[0]?.id
        || (await asaas.criarCliente({ name: req.usuario.nome, email: req.usuario.email, cpfCnpj: documento })).id;
      const cobranca = await asaas.criarCobranca({
        customer: clienteId,
        billingType: formaPagamento,
        value: centavosParaReais(valorCentavos),
        dueDate: diaDaqui(formaPagamento === 'BOLETO' ? 3 : 1),
        description: `${produto.titulo} · Kennismarket`.slice(0, 500),
        externalReference: pedido.id,
      });
      await repo.atualizarPedidos({ id: pedido.id },
        { asaas_cobranca_id: cobranca.id, link_pagamento: cobranca.invoiceUrl }, { status: ['aguardando_pagamento'] });

      const resposta = {
        id: pedido.id,
        status: 'aguardando_pagamento',
        valorKn: produto.preco_kn,
        valorCentavos,
        cotacao: { brl: Number(brl.taxa), data: brl.data },
        linkPagamento: cobranca.invoiceUrl,
      };
      if (formaPagamento === 'PIX') {
        const qr = await asaas.qrCodePix(cobranca.id);
        resposta.pix = { imagem: qr.encodedImage, copiaECola: qr.payload, validoAte: qr.expirationDate };
      }
      res.status(201).json(resposta);
    } catch (e) {
      // A cobrança não foi criada: o pedido não vale.
      await repo.atualizarPedidos({ id: pedido.id }, { status: 'cancelado' }, { status: ['aguardando_pagamento'] }).catch(() => {});
      throw e;
    }
  }));

  r.get('/:id', rota(async (req, res) => {
    res.json(await carregar(req, ['cliente', 'vendedor', 'dono']));
  }));

  // Vendedor marca como entregue (só depois de pago).
  r.post('/:id/entregue', rota(async (req, res) => {
    const p = await carregar(req, ['vendedor']);
    res.json(await mudar(p, ['pago'], { status: 'entregue', entregue_em: new Date().toISOString() }));
  }));

  // Cliente confirma que recebeu.
  r.post('/:id/recebido', rota(async (req, res) => {
    const p = await carregar(req, ['cliente']);
    res.json(await mudar(p, ['entregue'], { status: 'concluido', concluido_em: new Date().toISOString() }));
  }));

  // Cliente pede reembolso. Nunca é automático: o suporte analisa.
  r.post('/:id/reembolso', rota(async (req, res) => {
    const p = await carregar(req, ['cliente']);
    const motivo = String(req.body?.motivo || '').trim();
    if (!motivo) throw erro(400, 'conte o motivo do reembolso');
    const anterior = p.status;
    await mudar(p, ['pago', 'entregue', 'concluido'], { status: 'reembolso_solicitado' });
    try {
      const pedidoReembolso = await repo.criarReembolso({ pedido_id: p.id, motivo: motivo.slice(0, 2000), status_anterior: anterior });
      res.status(201).json(pedidoReembolso);
    } catch (e) {
      await repo.atualizarPedidos({ id: p.id }, { status: anterior }, { status: ['reembolso_solicitado'] });
      throw e;
    }
  }));

  return r;
}
