import crypto from 'node:crypto';
import { Router } from 'express';
import { limitePorIp } from '../lib/limite.js';
import { erro, exigirUsuario, rota } from '../lib/seguranca.js';

// Login real (Supabase Auth) de clientes, vendedores e donos.
// O navegador fala com isto por public/js/contas.js, que liga as telas do protótipo aqui.
//
// - Entrar: com o nome de usuário OU com o e-mail, e a senha.
// - Cadastro de cliente: nome, nome de usuário, senha e e-mail (opcional, decisão dos donos).
//   Sem e-mail, a conta recebe um e-mail interno terminado em ".invalid" (não recebe nada).
// - Vendedor: a conta nasce pelo link de convite (#convite-<token>), que fica marcado como usado.
//   A ligação conta ↔ convite ↔ loja fica no documento "sellers/acc-<token>" do protótipo.
//   Contas de vendedor antigas do protótipo (senha com hash no documento) passam para o
//   Supabase no primeiro login, com a mesma senha.
// - Senha esquecida do vendedor: o dono gera um link novo no painel (como no protótipo);
//   pelo link, o vendedor escolhe uma senha nova para a mesma conta.

export const USUARIO = /^[a-z0-9_.]{3,20}$/;
const EMAIL = /^\S+@\S+\.\S+$/;
export const DOMINIO_SEM_EMAIL = '@sem-email.kennismarket.invalid';

const limpar = (v) => String(v ?? '').trim();
const nomeDeUsuario = (v) => limpar(v).replace(/^@/, '').toLowerCase();
const emailInterno = (usuario) => `${usuario}.${crypto.randomBytes(4).toString('hex')}${DOMINIO_SEM_EMAIL}`;
const emailVisivel = (email) => (email && !email.endsWith('.invalid') ? email : '');
const falha = (status, codigo, mensagem) => Object.assign(erro(status, mensagem), { codigo });

export function rotasContas({ repo, pagamentos, mudouPrototipo = () => {} }) {
  const r = Router();
  const tentativas = limitePorIp({ max: 30, janelaMs: 10 * 60 * 1000, mensagem: 'muitas tentativas: espere alguns minutos' });
  const cadastros = limitePorIp({ max: 20, janelaMs: 60 * 60 * 1000, mensagem: 'muitos cadastros: espere um pouco' });

  // Responde os erros com { erro, codigo }, que a tela traduz.
  const responder = (fn) => rota(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (!e.codigo || !e.status || e.status >= 500) throw e;
      res.status(e.status).json({ erro: e.message, codigo: e.codigo });
    }
  });

  // ---------- documentos do protótipo (convites e contas de vendedor) ----------
  const doc = async (colecao, id) => (await repo.listarDocsPrototipo(colecao)).find((d) => d.id === id)?.dados || null;
  const gravar = async (colecao, id, dados) => { await repo.salvarDocPrototipo(colecao, id, dados); mudouPrototipo(colecao); };
  const conviteValido = (c) => c && !c.used && (!c.exp || c.exp > Date.now());
  // Token de vendedor ligado a uma conta (para o vendedor também entrar pela tela inicial).
  const vendedorDaConta = async (id) => {
    const d = (await repo.listarDocsPrototipo('sellers')).find((x) => x.dados?.acc?.userId === id);
    return d ? { token: d.dados.acc.token, acc: d.dados.acc } : null;
  };

  // Resposta de login: a sessão (tokens do Supabase) e o perfil.
  const resposta = async (sessao, id) => {
    const perfil = await repo.perfil(id);
    const email = emailVisivel(await repo.emailDaConta(id));
    const vendedor = perfil?.papel === 'vendedor' ? await vendedorDaConta(id) : null;
    return {
      sessao,
      perfil: { id, nome: perfil?.nome || '', usuario: perfil?.usuario || null, papel: perfil?.papel || 'cliente', email },
      vendedor,
    };
  };

  const validarSenha = (senha) => {
    if (typeof senha !== 'string' || senha.length < 8) throw falha(400, 'senha_curta', 'senha com menos de 8 caracteres');
    if (senha.length > 72) throw falha(400, 'senha_longa', 'senha com mais de 72 caracteres');
  };

  // ---------- clientes (e qualquer conta) ----------
  r.post('/entrar', tentativas, responder(async (req, res) => {
    const login = limpar(req.body?.login).toLowerCase();
    const senha = String(req.body?.senha ?? '');
    if (!login || !senha) throw falha(400, 'login_invalido', 'informe o usuário e a senha');
    let email = login;
    if (!login.includes('@')) {
      const p = USUARIO.test(nomeDeUsuario(login)) ? await repo.perfilPorUsuario(nomeDeUsuario(login)) : null;
      email = p ? await repo.emailDaConta(p.id) : null;
    }
    const sessao = email ? await repo.entrarComSenha(email, senha) : null;
    if (!sessao) throw falha(401, 'login_invalido', 'usuário ou senha incorretos');
    const usuario = await repo.usuarioPorToken(sessao.access_token);
    res.json(await resposta(sessao, usuario.id));
  }));

  r.post('/cadastro', cadastros, responder(async (req, res) => {
    const nome = limpar(req.body?.nome).replace(/\s+/g, ' ');
    const usuario = nomeDeUsuario(req.body?.usuario);
    const emailInformado = limpar(req.body?.email).toLowerCase();
    const senha = req.body?.senha;
    if (nome.split(' ').length < 2 || nome.length > 100) throw falha(400, 'nome_invalido', 'informe nome e sobrenome');
    if (!USUARIO.test(usuario)) throw falha(400, 'usuario_invalido', 'nome de usuário inválido');
    if (emailInformado && (!EMAIL.test(emailInformado) || emailInformado.endsWith('.invalid'))) throw falha(400, 'email_invalido', 'e-mail inválido');
    validarSenha(senha);
    if (await repo.perfilPorUsuario(usuario)) throw falha(409, 'usuario_em_uso', 'nome de usuário em uso');
    const email = emailInformado || emailInterno(usuario);
    const { id } = await repo.criarConta({ email, senha, nome, usuario, papel: 'cliente' });
    const sessao = await repo.entrarComSenha(email, senha);
    res.status(201).json(await resposta(sessao, id));
  }));

  // Quem está logado (o navegador confere a sessão guardada ao abrir o site).
  r.get('/eu', exigirUsuario(repo, pagamentos), responder(async (req, res) => {
    const { perfil, vendedor } = await resposta(null, req.usuario.id);
    res.json({ perfil, vendedor });
  }));

  r.put('/senha', exigirUsuario(repo, pagamentos), tentativas, responder(async (req, res) => {
    const { atual, nova } = req.body || {};
    validarSenha(nova);
    const email = await repo.emailDaConta(req.usuario.id);
    if (!email || !(await repo.entrarComSenha(email, String(atual ?? '')))) throw falha(401, 'senha_errada', 'senha atual incorreta');
    await repo.trocarSenha(req.usuario.id, nova);
    res.json({ ok: true });
  }));

  // ---------- vendedores (pelo link de convite) ----------
  const tokenDe = (req) => {
    const t = limpar(req.body?.token);
    if (!/^[a-z0-9]{4,40}$/.test(t)) throw falha(400, 'convite_invalido', 'link de convite inválido');
    return t;
  };
  const salvarAcc = (token, acc) => gravar('sellers', `acc-${token}`, { acc, ts: Date.now() });
  const usarConvite = async (token, contaId) => {
    const d = await doc('stores', `inv-${token}`);
    if (d?.invite) await gravar('stores', `inv-${token}`, { ...d, invite: { ...d.invite, used: true, usedAt: Date.now(), usedBy: contaId }, ts: Date.now() });
  };
  // E-mail da conta do vendedor: o do convite, se for válido e ainda não tiver conta.
  const emailDoVendedor = async (convite, usuario) => {
    const e = limpar(convite?.email).toLowerCase();
    return EMAIL.test(e) && !e.endsWith('.invalid') ? e : emailInterno(usuario);
  };
  const criarVendedor = async (convite, usuario, senha) => {
    if (await repo.perfilPorUsuario(usuario)) throw falha(409, 'usuario_em_uso', 'nome de usuário em uso');
    let email = await emailDoVendedor(convite, usuario);
    try {
      return { ...(await repo.criarConta({ email, senha, nome: usuario, usuario, papel: 'vendedor' })), email };
    } catch (e) {
      if (e.codigo !== 'email_em_uso') throw e;
      email = emailInterno(usuario); // o e-mail do convite já tem conta: usa um interno
      return { ...(await repo.criarConta({ email, senha, nome: usuario, usuario, papel: 'vendedor' })), email };
    }
  };

  // Primeira vez pelo link: cria a conta de vendedor.
  r.post('/vendedor/criar', cadastros, responder(async (req, res) => {
    const token = tokenDe(req);
    const usuario = nomeDeUsuario(req.body?.usuario);
    const senha = req.body?.senha;
    if (!USUARIO.test(usuario)) throw falha(400, 'usuario_invalido', 'nome de usuário inválido');
    validarSenha(senha);
    const convite = (await doc('stores', `inv-${token}`))?.invite;
    if (!conviteValido(convite)) throw falha(410, 'convite_invalido', 'convite inválido, usado ou vencido');
    if (await doc('sellers', `acc-${token}`)) throw falha(409, 'convite_usado', 'este convite já tem uma conta');
    const { id, email } = await criarVendedor(convite, usuario, senha);
    const acc = { token, username: usuario, userId: id, created: Date.now(), pwAt: Date.now() };
    await salvarAcc(token, acc);
    await usarConvite(token, id);
    res.status(201).json({ ...(await resposta(await repo.entrarComSenha(email, senha), id)), acc });
  }));

  // Login pelo link do vendedor. Conta antiga do protótipo: confere o hash e passa para o Supabase.
  r.post('/vendedor/entrar', tentativas, responder(async (req, res) => {
    const token = tokenDe(req);
    const usuario = nomeDeUsuario(req.body?.usuario);
    const senha = String(req.body?.senha ?? '');
    const errado = () => falha(401, 'login_invalido', 'usuário ou senha incorretos');
    let acc = (await doc('sellers', `acc-${token}`))?.acc;
    if (!acc || acc.username !== usuario) throw errado();
    let id = acc.userId;
    if (!id) {
      const hash = acc.salt && crypto.createHash('sha256').update(`${acc.salt}|${senha}`).digest('hex');
      if (!acc.hash || hash !== acc.hash) throw errado();
      if (senha.length > 72) throw errado();
      const convite = (await doc('stores', `inv-${token}`))?.invite;
      ({ id } = await criarVendedor(convite, usuario, senha));
      const { salt: _s, hash: _h, ...resto } = acc;
      acc = { ...resto, userId: id, migradoEm: Date.now() };
      await salvarAcc(token, acc);
    }
    const email = await repo.emailDaConta(id);
    const sessao = email ? await repo.entrarComSenha(email, senha) : null;
    if (!sessao) throw errado();
    res.json({ ...(await resposta(sessao, id)), acc });
  }));

  // Senha nova pelo link que o dono gerou no painel (o convite tem "from": o link antigo).
  r.post('/vendedor/redefinir', cadastros, responder(async (req, res) => {
    const token = tokenDe(req);
    const senha = req.body?.senha;
    validarSenha(senha);
    const convite = (await doc('stores', `inv-${token}`))?.invite;
    let acc = (await doc('sellers', `acc-${token}`))?.acc;
    if (!conviteValido(convite) || !convite.from || !acc) throw falha(410, 'convite_invalido', 'link inválido, usado ou vencido');
    let id = acc.userId;
    let email;
    if (id) {
      await repo.trocarSenha(id, senha);
      email = await repo.emailDaConta(id);
    } else {
      // conta antiga do protótipo que ainda não tinha passado para o Supabase
      ({ id, email } = await criarVendedor(convite, acc.username, senha));
    }
    const { salt: _s, hash: _h, resetFrom: _r, ...resto } = acc;
    acc = { ...resto, userId: id, pwAt: Date.now() };
    await salvarAcc(token, acc);
    await usarConvite(token, id);
    res.json({ ...(await resposta(await repo.entrarComSenha(email, senha), id)), acc });
  }));

  return r;
}
