import crypto from 'node:crypto';
import { Router } from 'express';
import { documentoValido } from '../lib/documentos.js';
import { dividirVenda, knParaCentavos, PORCENTAGEM_VENDEDOR } from '../lib/dinheiro.js';
import { arquivosPorPedido, concluirEntreguesVencidos, pedidoParaTela, STATUS_DEPOIS_DE_PAGO, ultimoReembolsoPorPedido } from '../lib/pedidos.js';
import { recebedorDaLinha } from '../lib/recebimento.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';

const diaDaqui = (dias) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);

export function rotasPedidos({ repo, pagamentos }) {
  const r = Router();
  r.use(exigirUsuario(repo, pagamentos));

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

  // Antes do checkout: o produto (da loja do protótipo) pode ser comprado de verdade? Quanto em reais?
  // Lojas sem vendedor (do dono), sem dados de recebimento ou a própria loja usam a compra de
  // demonstração do protótipo (motivo diz por quê).
  r.get('/preco', rota(async (req, res) => {
    const lojaPid = Number(req.query.loja);
    const loja = Number.isInteger(lojaPid) ? await repo.lojaPorPrototipo(lojaPid) : null;
    const produto = loja && await repo.produtoPorPrototipo(loja.id, String(req.query.produto || ''));
    const nao = (motivo) => res.json({ pode: false, motivo });
    if (!produto?.ativo || !loja.publicada || loja.banida) return nao('indisponivel');
    if (!loja.vendedor_id) return nao('sem_vendedor');
    if (loja.vendedor_id === req.usuario.id) return nao('propria_loja');
    const recebimento = await repo.dadosRecebimento(loja.id);
    if (!recebimento || recebimento.situacao !== 'pronto' || recebimento.provedor !== pagamentos.provedor) return nao('sem_recebimento');
    const brl = (await repo.ultimasCotacoes()).find((c) => c.moeda === 'BRL');
    if (!brl) return nao('sem_cotacao');
    res.json({
      pode: true,
      produtoId: produto.id,
      titulo: produto.titulo,
      valorKn: produto.preco_kn,
      valorCentavos: knParaCentavos(produto.preco_kn, brl.taxa),
      cotacao: { brl: Number(brl.taxa), data: brl.data },
      formas: pagamentos.formas,
      simulado: pagamentos.provedor === 'simulado',
    });
  }));

  // Cliente compra um produto: cria o pedido e a cobrança com o split no valor exato.
  // A divisão usa a porcentagem da loja (padrão 50/50), congelada no pedido.
  r.post('/', rota(async (req, res) => {
    const { produtoId, formaPagamento, cpfCnpj, moedaExibida } = req.body || {};
    if (!pagamentos.formas.includes(formaPagamento)) throw erro(400, `formaPagamento: ${pagamentos.formas.join(', ')}`);
    // CPF/CNPJ de quem paga: obrigatório no boleto (e cartão); no Pix, só se a pessoa mandar (decisão dos donos).
    const documento = cpfCnpj ? documentoValido(cpfCnpj) : null;
    if (cpfCnpj && !documento) throw erro(400, 'CPF ou CNPJ inválido');
    if (!documento && formaPagamento !== 'pix') throw erro(400, 'CPF ou CNPJ obrigatório no boleto');

    const produto = produtoId && await repo.produto(produtoId);
    const loja = produto && await repo.loja(produto.loja_id);
    if (!produto?.ativo || !loja?.publicada || loja.banida) throw erro(404, 'produto não encontrado');
    if (loja.vendedor_id === req.usuario.id) throw erro(400, 'você não pode comprar da própria loja');
    const recebimento = await repo.dadosRecebimento(loja.id);
    if (!recebimento || recebimento.situacao !== 'pronto' || recebimento.provedor !== pagamentos.provedor) {
      throw erro(409, 'esta loja ainda não cadastrou (ou precisa confirmar de novo) como recebe os pagamentos');
    }

    // 1 KN = 1 euro: converte para reais com a cotação do dia e congela no pedido.
    const cotacoes = await repo.ultimasCotacoes();
    const brl = cotacoes.find((c) => c.moeda === 'BRL');
    if (!brl) throw erro(503, 'ainda sem cotação do euro salva');
    const exibida = moedaExibida ? String(moedaExibida).toUpperCase() : null;
    const valorCentavos = knParaCentavos(produto.preco_kn, brl.taxa);
    const porcentagemVendedor = loja.porcentagem_vendedor ?? PORCENTAGEM_VENDEDOR;
    const { vendedor, plataforma } = dividirVenda(valorCentavos, porcentagemVendedor);

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
      taxa_percentual: 100 - porcentagemVendedor,
      vendedor_centavos: vendedor,
      plataforma_centavos: plataforma,
      forma_pagamento: formaPagamento,
      provedor: pagamentos.provedor,
      repasse_status: 'aguardando',
    });

    try {
      const cobranca = await pagamentos.criarCobranca({
        pedidoId: pedido.id,
        valorCentavos,
        forma: formaPagamento,
        descricao: `${produto.titulo} · Kennismarket`.slice(0, 140),
        vencimento: diaDaqui(formaPagamento === 'boleto' ? 3 : 1),
        pagador: { nome: req.usuario.nome, email: req.usuario.email, documento },
        divisao: { vendedor: { centavos: vendedor, recebedor: recebedorDaLinha(recebimento) }, plataforma: { centavos: plataforma } },
      });
      await repo.atualizarPedidos({ id: pedido.id }, {
        cobranca_id: cobranca.cobrancaId,
        link_pagamento: cobranca.linkPagamento ?? null,
        pix_copia_cola: cobranca.pix?.copiaECola ?? null,
        linha_digitavel: cobranca.boleto?.linhaDigitavel ?? null,
      }, { status: ['aguardando_pagamento'] });

      res.status(201).json({
        id: pedido.id,
        status: 'aguardando_pagamento',
        valorKn: produto.preco_kn,
        valorCentavos,
        cotacao: { brl: Number(brl.taxa), data: brl.data },
        divisao: { vendedorCentavos: vendedor, plataformaCentavos: plataforma },
        pix: cobranca.pix ?? null,
        boleto: cobranca.boleto ?? null,
        linkPagamento: cobranca.linkPagamento ?? null,
      });
    } catch (e) {
      // A cobrança não foi criada: o pedido não vale.
      await repo.atualizarPedidos({ id: pedido.id }, { status: 'cancelado' }, { status: ['aguardando_pagamento'] }).catch(() => {});
      throw e;
    }
  }));

  // "Meus pedidos": os pedidos reais pagos do cliente (com o reembolso mais recente de cada um).
  // Antes, conclui os entregues há mais de 7 dias sem confirmação.
  r.get('/', rota(async (req, res) => {
    await concluirEntreguesVencidos(repo);
    const lista = await repo.listarPedidos({ clienteId: req.usuario.id, status: STATUS_DEPOIS_DE_PAGO });
    const rbs = ultimoReembolsoPorPedido(await repo.listarReembolsos({ pedidoIds: lista.map((p) => p.id), limite: 1000 }));
    const arquivos = arquivosPorPedido(await repo.arquivosDasEntregas(lista.map((p) => p.id)));
    res.json({ pedidos: lista.map((p) => pedidoParaTela(p, { reembolso: rbs[p.id], arquivos: arquivos[p.id] })) });
  }));

  r.get('/:id', rota(async (req, res) => {
    res.json(await carregar(req, ['cliente', 'vendedor', 'dono']));
  }));

  // Vendedor marca como entregue (só depois de pago). Pode anexar arquivos feitos para este
  // cliente (etapa 5): { arquivos: [{ id, nome }] }, enviados antes por POST /api/prototipo/arquivos.
  // Só o cliente do pedido, o vendedor e o suporte abrem esses arquivos.
  r.post('/:id/entregue', rota(async (req, res) => {
    const p = await carregar(req, ['vendedor']);
    const anexos = Array.isArray(req.body?.arquivos) ? req.body.arquivos : [];
    if (anexos.length > 10) throw erro(400, 'no máximo 10 arquivos por entrega');
    const linhas = [];
    for (const a of anexos) {
      const id = String(a?.id || '');
      const info = /^[0-9a-f]{32}$/.test(id) ? await repo.infoArquivoPrototipo(id) : null;
      if (!info || info.enviado_por !== req.usuario.id) throw erro(400, 'arquivo inválido');
      const nome = String(a.nome || 'arquivo').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 200) || 'arquivo';
      linhas.push({ pedido_id: p.id, arquivo_id: id, nome, tipo: info.tipo, tamanho: info.tamanho });
    }
    const novo = await mudar(p, ['pago'], { status: 'entregue', entregue_em: new Date().toISOString() });
    const arquivos = await repo.salvarArquivosEntrega(linhas);
    res.json({ ...novo, arquivos: arquivos.map((x) => ({ id: x.arquivo_id, nome: x.nome, tipo: x.tipo, tamanho: x.tamanho })) });
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
      res.status(201).json(await repo.criarReembolso({ pedido_id: p.id, motivo: motivo.slice(0, 2000), status_anterior: anterior }));
    } catch (e) {
      await repo.atualizarPedidos({ id: p.id }, { status: anterior }, { status: ['reembolso_solicitado'] });
      throw e;
    }
  }));

  return r;
}
