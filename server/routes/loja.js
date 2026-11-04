import { Router } from 'express';
import { concluirEntreguesVencidos, pedidoParaTela, STATUS_DEPOIS_DE_PAGO, ultimoReembolsoPorPedido } from '../lib/pedidos.js';
import { linhaDoRecebedor, recebedorDoCadastro, recebedorDaLinha } from '../lib/recebimento.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';
import { resumoFaturamento } from '../lib/vendas.js';

// Área do vendedor sobre a própria loja.
export function rotasLoja({ repo, pagamentos }) {
  const r = Router();
  r.use(exigirUsuario(repo, pagamentos));

  async function minhaLoja(req) {
    const loja = await repo.lojaDoVendedor(req.usuario.id);
    if (!loja) throw erro(404, 'você ainda não tem loja');
    return loja;
  }

  // Como o vendedor recebe. Não cria conta em banco nenhum: só os dados para o split.
  // ⚠️ Campos a ajustar quando chegar a documentação do banco de pagamento.
  // Corpo: { nome, cpfCnpj, pix: { chave, tipo } }  ou  { nome, cpfCnpj, banco: { codigo, agencia, conta, tipoConta } }
  r.put('/recebimento', rota(async (req, res) => {
    const loja = await minhaLoja(req);
    const recebedor = recebedorDoCadastro(req.body);
    const resposta = await pagamentos.cadastrarRecebedor(recebedor); // valida e registra no banco, se o banco pedir
    const linha = await repo.salvarDadosRecebimento(linhaDoRecebedor(loja.id, recebedor, pagamentos.provedor, resposta));
    if (resposta.situacao === 'recusado') throw erro(400, `o banco recusou os dados de recebimento: ${resposta.motivo || 'sem motivo informado'}`);
    res.json({ situacao: linha.situacao, recebedor: recebedorDaLinha(linha) });
  }));

  // Faturamento (etapa 6): o da conta inteira (soma de todas as lojas da conta, em "Minha conta")
  // e o de cada loja (em "Minha loja"). Vendas, parte do vendedor, repasse (recebido, processando,
  // a receber), débitos dos reembolsos e saldo.
  r.get('/vendas', rota(async (req, res) => {
    const lojas = await repo.lojasDoVendedor(req.usuario.id);
    const ids = lojas.map((l) => l.id);
    const [vendas, debitos] = await Promise.all([repo.vendasDasLojas(ids), repo.listarDebitos({ lojaIds: ids })]);
    const nomeDaLoja = Object.fromEntries(lojas.map((l) => [l.id, l.nome]));
    const produtoDe = (pedidoId) => vendas.find((v) => v.id === pedidoId)?.produto_titulo || '';
    res.json({
      ...resumoFaturamento(vendas.map((v) => ({ ...v, loja_nome: nomeDaLoja[v.loja_id] || '' })), debitos, { produtoDe }),
      lojas: lojas.map((l) => ({
        nome: l.nome, prototipoId: l.prototipo_id, porcentagem: l.porcentagem_vendedor, publicada: l.publicada, banida: l.banida,
        ...resumoFaturamento(vendas.filter((v) => v.loja_id === l.id), debitos.filter((d) => d.loja_id === l.id), { produtoDe }),
      })),
    });
  }));

  // "Minha loja → Pedidos": os pedidos reais pagos da própria loja, com o primeiro nome do cliente.
  r.get('/pedidos', rota(async (req, res) => {
    const loja = await repo.lojaDoVendedor(req.usuario.id);
    if (!loja) return res.json({ loja: null, pedidos: [] });
    await concluirEntreguesVencidos(repo);
    const lista = await repo.listarPedidos({ lojaId: loja.id, status: STATUS_DEPOIS_DE_PAGO });
    const rbs = ultimoReembolsoPorPedido(await repo.listarReembolsos({ pedidoIds: lista.map((p) => p.id), limite: 1000 }));
    res.json({
      loja: { nome: loja.nome, prototipoId: loja.prototipo_id, porcentagem: loja.porcentagem_vendedor },
      pedidos: lista.map((p) => pedidoParaTela(p, { comCliente: true, reembolso: rbs[p.id] })),
    });
  }));

  r.get('/recebimento', rota(async (req, res) => {
    const loja = await minhaLoja(req);
    const linha = await repo.dadosRecebimento(loja.id);
    if (!linha) return res.json({ situacao: 'nao_cadastrado' });
    res.json({ situacao: linha.provedor === pagamentos.provedor ? linha.situacao : 'confirmar_de_novo', recebedor: recebedorDaLinha(linha) });
  }));

  return r;
}
