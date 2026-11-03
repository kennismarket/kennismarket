import { Router } from 'express';
import { concluirEntreguesVencidos, pedidoParaTela, STATUS_DEPOIS_DE_PAGO, ultimoReembolsoPorPedido } from '../lib/pedidos.js';
import { linhaDoRecebedor, recebedorDoCadastro, recebedorDaLinha } from '../lib/recebimento.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';
import { resumoVendas } from '../lib/vendas.js';

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

  // "Minhas vendas" (página Minha conta do vendedor): as vendas reais da própria loja.
  r.get('/vendas', rota(async (req, res) => {
    const loja = await repo.lojaDoVendedor(req.usuario.id);
    if (!loja) return res.json({ loja: null, ...resumoVendas([]) });
    res.json({ loja: { nome: loja.nome, porcentagem: loja.porcentagem_vendedor }, ...resumoVendas(await repo.vendasDasLojas([loja.id])) });
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
