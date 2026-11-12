// Memória curta na frente do banco (12/11/2026): menos pedidos ao Supabase com muita gente no site.
//
// Com o site aberto, cada pessoa logada confere as listas a cada 5 segundos, e cada conferência
// perguntava ao Supabase "quem é essa pessoa?" (2 pedidos). Agora o servidor guarda as respostas:
//
// 1. Quem é a pessoa (usuarioPorToken): guardado por até 1 minuto, e nunca além do vencimento do
//    próprio login. Qualquer mudança na conta feita pelo site (banir/desbanir, nova senha, trocar
//    e-mail, nome ou usuário, excluir) apaga a memória daquela conta NA HORA: banir continua valendo
//    imediatamente. Login que não existe não é guardado.
// 2. Listas do protótipo (listarDocsPrototipo: lojas, vendedores, arquivos): guardadas até alguém
//    gravar ou apagar naquela coleção (aí a lista é jogada fora na hora) ou por no máximo 30 segundos
//    (para mudanças feitas por fora, ex.: direto no Supabase). Cada leitura recebe uma cópia.
//
// O site roda num servidor só (Render); com vários servidores, a memória seria de cada um.
const MARCA = Symbol('comCache');

// Vencimento do login (campo "exp" do token), em milissegundos; null se não der para ler.
export function vencimentoDoToken(token) {
  try {
    const exp = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function comCache(repo, { usuariosMs = 60_000, docsMs = 30_000, maxUsuarios = 20_000, agora = () => Date.now() } = {}) {
  if (repo[MARCA]) return repo; // já tem memória
  const usuarios = new Map(); // token → { usuario, ate }
  const docs = new Map(); // coleção → { docs, ate }
  const geracao = {}; // coleção → número (muda a cada gravação; leitura antiga não volta para a memória)
  const copia = (v) => structuredClone(v);

  const esquecerConta = (id) => { for (const [t, x] of usuarios) if (x.usuario?.id === id) usuarios.delete(t); };
  const esquecerColecao = (c) => { docs.delete(c); geracao[c] = (geracao[c] || 0) + 1; };
  const depois = (nome, fn) => (repo[nome] ? { [nome]: async (...a) => { try { return await repo[nome](...a); } finally { fn(...a); } } } : {});

  const extra = {
    [MARCA]: true,

    async usuarioPorToken(token) {
      const t = agora();
      const guardado = usuarios.get(token);
      if (guardado && guardado.ate > t) return copia(guardado.usuario);
      if (guardado) usuarios.delete(token);
      const usuario = await repo.usuarioPorToken(token);
      if (usuario) {
        const vence = vencimentoDoToken(token);
        const ate = Math.min(t + usuariosMs, vence ?? t + usuariosMs);
        if (ate > t) {
          if (usuarios.size >= maxUsuarios) {
            for (const [k, x] of usuarios) if (x.ate <= t) usuarios.delete(k);
            if (usuarios.size >= maxUsuarios) usuarios.delete(usuarios.keys().next().value);
          }
          usuarios.set(token, { usuario: copia(usuario), ate });
        }
      }
      return usuario;
    },

    async listarDocsPrototipo(c) {
      const t = agora();
      const guardado = docs.get(c);
      if (guardado && guardado.ate > t) return copia(guardado.docs);
      const g = geracao[c] || 0;
      const lista = await repo.listarDocsPrototipo(c);
      if ((geracao[c] || 0) === g) docs.set(c, { docs: copia(lista), ate: t + docsMs }); // ninguém gravou no meio
      return lista;
    },

    // gravações: jogam fora a memória do que mudou
    ...depois('salvarDocPrototipo', (c) => esquecerColecao(c)),
    ...depois('apagarDocPrototipo', (c) => esquecerColecao(c)),
    ...depois('trocarSenha', (id) => esquecerConta(id)),
    ...depois('atualizarPerfil', (id) => esquecerConta(id)),
    ...depois('banirConta', (id) => esquecerConta(id)),
    ...depois('excluirConta', (id) => esquecerConta(id)),
    ...depois('trocarEmail', (id) => esquecerConta(id)),
    ...depois('prepararDadosTeste', () => usuarios.clear()),

    // para o painel /api/saude e para os testes
    memoria: () => ({ usuarios: usuarios.size, colecoes: [...docs.keys()] }),
    esquecerTudo: () => { usuarios.clear(); for (const c of [...docs.keys()]) esquecerColecao(c); },
  };

  // Tudo o mais passa direto para o banco (o objeto original continua sendo usado por baixo).
  return new Proxy(repo, {
    get(alvo, nome) { return nome in extra ? extra[nome] : alvo[nome]; },
    has(alvo, nome) { return nome in extra || nome in alvo; },
  });
}
