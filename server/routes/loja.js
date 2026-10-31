import { Router } from 'express';
import { linhaDoRecebedor, recebedorDoCadastro, recebedorDaLinha } from '../lib/recebimento.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';

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
  // A tela do site manda só o Pix (decisão dos donos): sem nome, usa o da conta; sem CPF/CNPJ,
  // usa a própria chave quando ela é do tipo CPF ou CNPJ.
  r.put('/recebimento', rota(async (req, res) => {
    const loja = await minhaLoja(req);
    const corpo = { ...(req.body || {}) };
    const tipo = String(corpo.pix?.tipo || '').toLowerCase();
    if (!String(corpo.nome || '').trim()) corpo.nome = req.usuario.nome;
    if (!corpo.cpfCnpj && ['cpf', 'cnpj'].includes(tipo)) corpo.cpfCnpj = corpo.pix?.chave;
    const recebedor = recebedorDoCadastro(corpo);
    const resposta = await pagamentos.cadastrarRecebedor(recebedor); // valida e registra no banco, se o banco pedir
    const linha = await repo.salvarDadosRecebimento(linhaDoRecebedor(loja.id, recebedor, pagamentos.provedor, resposta));
    if (resposta.situacao === 'recusado') throw erro(400, `o banco recusou os dados de recebimento: ${resposta.motivo || 'sem motivo informado'}`);
    res.json({ situacao: linha.situacao, recebedor: recebedorDaLinha(linha) });
  }));

  r.get('/recebimento', rota(async (req, res) => {
    const loja = await minhaLoja(req);
    const linha = await repo.dadosRecebimento(loja.id);
    if (!linha) return res.json({ situacao: 'nao_cadastrado' });
    res.json({ situacao: linha.provedor === pagamentos.provedor ? linha.situacao : 'confirmar_de_novo', recebedor: recebedorDaLinha(linha) });
  }));

  return r;
}
