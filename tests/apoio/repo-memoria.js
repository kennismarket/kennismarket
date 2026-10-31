// Banco em memória com as mesmas funções de server/lib/repo.js, para os testes.
import crypto from 'node:crypto';

const bate = (linha, condicoes = {}) => Object.entries(condicoes).every(([campo, valores]) =>
  [].concat(valores).some((v) => (v === null ? linha[campo] == null : linha[campo] === v)));

export function criarRepoMemoria() {
  const t = { usuarios: {}, lojas: {}, dadosRecebimento: {}, produtos: {}, pedidos: {}, reembolsos: {}, debitos: {}, cotacoes: [], eventos: new Set(), docs: {}, arquivos: {}, contas: {} };
  const copia = (x) => (x ? structuredClone(x) : null);
  const ultimasPorMoeda = (ate) => {
    const m = {};
    for (const c of t.cotacoes) if ((!ate || c.data <= ate) && (!m[c.moeda] || c.data > m[c.moeda].data)) m[c.moeda] = c;
    return Object.values(m).map(copia);
  };

  return {
    tabelas: t,
    async usuarioPorToken(token) { return copia(t.usuarios[token]); },

    // contas: t.contas[id] = { id, email, senha, nome, usuario, papel }
    async perfilPorUsuario(usuario) {
      const c = Object.values(t.contas).find((x) => x.usuario === usuario);
      return c ? { id: c.id, nome: c.nome, papel: c.papel, usuario: c.usuario } : null;
    },
    async perfil(id) { const c = t.contas[id]; return c ? { id: c.id, nome: c.nome, papel: c.papel, usuario: c.usuario } : null; },
    async emailDaConta(id) { return t.contas[id]?.email || null; },
    async criarConta({ email, senha, nome, usuario, papel }) {
      const todas = Object.values(t.contas);
      if (todas.some((c) => c.email === email)) throw Object.assign(new Error('e-mail já cadastrado'), { status: 409, codigo: 'email_em_uso' });
      if (usuario && todas.some((c) => c.usuario === usuario)) throw Object.assign(new Error('nome de usuário em uso'), { status: 409, codigo: 'usuario_em_uso' });
      const id = crypto.randomUUID();
      t.contas[id] = { id, email, senha, nome, usuario, papel };
      return { id };
    },
    async entrarComSenha(email, senha) {
      const c = Object.values(t.contas).find((x) => x.email === email);
      if (!c || c.senha !== senha) return null;
      if (c.banida) return { banida: true };
      const token = `tok-${crypto.randomUUID()}`;
      t.usuarios[token] = { id: c.id, email: c.email, nome: c.nome, papel: c.papel, usuario: c.usuario };
      return { access_token: token, refresh_token: `rt-${token}`, expires_in: 3600 };
    },
    async trocarSenha(id, senha) { t.contas[id].senha = senha; },
    async atualizarPerfil(id, { nome, usuario }) {
      if (usuario && Object.values(t.contas).some((c) => c.id !== id && c.usuario === usuario)) throw Object.assign(new Error('nome de usuário em uso'), { status: 409, codigo: 'usuario_em_uso' });
      Object.assign(t.contas[id], { nome, usuario });
      for (const u of Object.values(t.usuarios)) if (u.id === id) Object.assign(u, { nome, usuario });
    },
    async buscarContas(termo) {
      const busca = termo.toLowerCase();
      return Object.values(t.contas)
        .map((c) => ({ id: c.id, nome: c.nome, usuario: c.usuario, papel: c.papel, email: c.email, banida: Boolean(c.banida) }))
        .filter((c) => [c.nome, c.usuario, c.email].some((x) => x && x.toLowerCase().includes(busca)));
    },
    async banirConta(id, banir) {
      t.contas[id].banida = banir;
      if (banir) for (const [tok, u] of Object.entries(t.usuarios)) if (u.id === id) delete t.usuarios[tok];
    },
    async excluirConta(id) {
      for (const [tok, u] of Object.entries(t.usuarios)) if (u.id === id) delete t.usuarios[tok];
      if (Object.values(t.pedidos).some((p) => p.cliente_id === id)) {
        Object.assign(t.contas[id], { nome: 'Conta excluída', usuario: null, email: `excluida.${id}@sem-email.kennismarket.invalid`, senha: crypto.randomUUID(), banida: true });
        return { apagada: false };
      }
      delete t.contas[id];
      return { apagada: true };
    },
    async trocarEmail(id, email) {
      if (Object.values(t.contas).some((c) => c.id !== id && c.email === email)) throw Object.assign(new Error('e-mail já cadastrado'), { status: 409, codigo: 'email_em_uso' });
      t.contas[id].email = email;
      for (const u of Object.values(t.usuarios)) if (u.id === id) u.email = email;
    },
    async produto(id) { return copia(t.produtos[id]); },
    async loja(id) { return copia(t.lojas[id]); },
    async lojaDoVendedor(vendedorId) { return copia(Object.values(t.lojas).find((l) => l.vendedor_id === vendedorId)); },
    async dadosRecebimento(lojaId) { return copia(t.dadosRecebimento[lojaId]); },
    async salvarDadosRecebimento(linha) { t.dadosRecebimento[linha.loja_id] = { ...linha }; return copia(linha); },

    async salvarCotacoes(linhas) {
      for (const l of linhas) {
        const i = t.cotacoes.findIndex((c) => c.data === l.data && c.moeda === l.moeda);
        if (i >= 0) t.cotacoes[i] = { ...l }; else t.cotacoes.push({ ...l });
      }
    },
    async ultimasCotacoes() { return ultimasPorMoeda(); },
    async cotacoesEm(dia) { return ultimasPorMoeda(dia); },
    async historicoCotacao(moeda, dias) {
      return t.cotacoes.filter((c) => c.moeda === moeda).sort((a, b) => b.data.localeCompare(a.data)).slice(0, dias)
        .map(({ data, taxa, fonte }) => ({ data, taxa, fonte }));
    },

    async criarPedido(campos) {
      const p = { status: 'aguardando_pagamento', repasse_status: 'aguardando', cobranca_id: null, ...campos };
      t.pedidos[p.id] = p;
      return copia(p);
    },
    async pedido(id) { return copia(t.pedidos[id]); },
    async atualizarPedidos(onde, campos, condicoes) {
      const mudou = [];
      for (const p of Object.values(t.pedidos)) {
        if (Object.entries(onde).every(([k, v]) => p[k] === v) && bate(p, condicoes)) {
          Object.assign(p, campos);
          mudou.push(copia(p));
        }
      }
      return mudou;
    },

    async eventoJaProcessado(provedor, id) { return t.eventos.has(`${provedor}|${id}`); },
    async registrarEvento(provedor, id) { t.eventos.add(`${provedor}|${id}`); },

    async criarReembolso(campos) {
      if (Object.values(t.reembolsos).some((r) => r.pedido_id === campos.pedido_id && r.status === 'em_analise')) {
        throw Object.assign(new Error('Supabase: duplicate key'), { codigo: '23505' });
      }
      const r = { id: crypto.randomUUID(), status: 'em_analise', ...campos };
      t.reembolsos[r.id] = r;
      return copia(r);
    },
    async reembolso(id) { return copia(t.reembolsos[id]); },
    async atualizarReembolso(id, campos, condicoes) {
      const r = t.reembolsos[id];
      if (!r || !bate(r, condicoes)) return [];
      Object.assign(r, campos);
      return [copia(r)];
    },
    async criarDebito(campos) {
      if (Object.values(t.debitos).some((d) => d.reembolso_id === campos.reembolso_id)) {
        throw Object.assign(new Error('Supabase: duplicate key'), { codigo: '23505' });
      }
      const d = { id: crypto.randomUUID(), situacao: 'aberto', ...campos };
      t.debitos[d.id] = d;
      return copia(d);
    },
    async listarDebitos({ situacao, pedidoId } = {}) {
      return Object.values(t.debitos).filter((d) => (!situacao || d.situacao === situacao) && (!pedidoId || d.pedido_id === pedidoId)).map(copia);
    },
    async listarDocsPrototipo(colecao) {
      return Object.entries(t.docs[colecao] || {}).map(([id, dados]) => ({ id, dados: structuredClone(dados) }));
    },
    async salvarDocPrototipo(colecao, id, dados) { (t.docs[colecao] ||= {})[id] = structuredClone(dados); },
    async apagarDocPrototipo(colecao, id) { if (t.docs[colecao]) delete t.docs[colecao][id]; },
    async espacoUsadoPrototipo() { return Object.values(t.arquivos).reduce((s, a) => s + a.conteudo.length, 0); },
    async salvarArquivoPrototipo(id, tipo, conteudo) { t.arquivos[id] = { tipo, conteudo: Buffer.from(conteudo) }; },
    async lerArquivoPrototipo(id) { return t.arquivos[id] ? { ...t.arquivos[id] } : null; },
    async apagarArquivoPrototipo(id) { delete t.arquivos[id]; },
    async prepararDadosTeste() {
      const contas = { cliente: 'Cliente de Teste', vendedor: 'Vendedora de Teste', dono: 'Dono de Teste' };
      const tokens = {};
      for (const [papel, nome] of Object.entries(contas)) {
        const token = `tok-teste-${papel}-${crypto.randomUUID()}`;
        t.usuarios[token] = { id: `u-teste-${papel}`, email: `${papel}@teste.kennismarket.invalid`, nome, papel };
        tokens[papel] = token;
      }
      t.lojas['loja-teste'] = { id: 'loja-teste', vendedor_id: 'u-teste-vendedor', nome: 'Loja de Teste', publicada: true, banida: false };
      t.produtos['prod-teste'] = { id: 'prod-teste', loja_id: 'loja-teste', titulo: 'Mentoria de teste', preco_kn: 100, ativo: true };
      return { tokens, lojaId: 'loja-teste', produtoId: 'prod-teste' };
    },
  };
}
