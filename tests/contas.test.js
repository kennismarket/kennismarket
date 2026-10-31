// Login real: clientes, donos e vendedores (pelo convite), com o banco em memória.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { criarRepoMemoria } from './apoio/repo-memoria.js';

let repo, base, servidor;

before(async () => {
  const { criarApp } = await import('../server/app.js');
  repo = criarRepoMemoria();
  servidor = criarApp({ repo }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

const pedir = async (metodo, caminho, corpo, token) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { s: r.status, j: await r.json() };
};
const doc = async (colecao, id) => (await repo.listarDocsPrototipo(colecao)).find((d) => d.id === id)?.dados;

test('cliente: cadastro sem e-mail, entra pelo usuário, e o e-mail interno nunca aparece', async () => {
  const c = await pedir('POST', '/api/contas/cadastro', { nome: 'Maria Souza', usuario: '@Maria_S', senha: 'segredo123' });
  assert.equal(c.s, 201);
  assert.equal(c.j.perfil.usuario, 'maria_s');
  assert.equal(c.j.perfil.papel, 'cliente');
  assert.equal(c.j.perfil.email, '');
  assert.ok(c.j.sessao.access_token);
  const conta = Object.values(repo.tabelas.contas).find((x) => x.usuario === 'maria_s');
  assert.match(conta.email, /^maria_s\.[0-9a-f]{8}@sem-email\.kennismarket\.invalid$/);

  const e = await pedir('POST', '/api/contas/entrar', { login: 'Maria_S', senha: 'segredo123' });
  assert.equal(e.s, 200);
  assert.equal(e.j.perfil.nome, 'Maria Souza');
  assert.equal((await pedir('GET', '/api/contas/eu', null, e.j.sessao.access_token)).j.perfil.usuario, 'maria_s');
});

test('cliente: com e-mail, entra pelo usuário ou pelo e-mail; erros conhecidos têm código', async () => {
  const c = await pedir('POST', '/api/contas/cadastro', { nome: 'João Lima', usuario: 'joao', senha: 'segredo123', email: 'Joao@Ex.com' });
  assert.equal(c.s, 201);
  assert.equal(c.j.perfil.email, 'joao@ex.com');
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'joao@ex.com', senha: 'segredo123' })).s, 200);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'joao', senha: 'errada123' })).j.codigo, 'login_invalido');
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'ninguem', senha: 'segredo123' })).j.codigo, 'login_invalido');

  const erro = async (corpo) => (await pedir('POST', '/api/contas/cadastro', corpo)).j.codigo;
  assert.equal(await erro({ nome: 'Outro Nome', usuario: 'joao', senha: 'segredo123' }), 'usuario_em_uso');
  assert.equal(await erro({ nome: 'Outro Nome', usuario: 'joao2', senha: 'segredo123', email: 'joao@ex.com' }), 'email_em_uso');
  assert.equal(await erro({ nome: 'Só', usuario: 'joao3', senha: 'segredo123' }), 'nome_invalido');
  assert.equal(await erro({ nome: 'Outro Nome', usuario: 'jo', senha: 'segredo123' }), 'usuario_invalido');
  assert.equal(await erro({ nome: 'Outro Nome', usuario: 'joao3', senha: 'curta' }), 'senha_curta');
  assert.equal(await erro({ nome: 'Outro Nome', usuario: 'joao3', senha: 'segredo123', email: 'x@y.invalid' }), 'email_invalido');
});

test('trocar a senha exige a senha atual', async () => {
  const { j } = await pedir('POST', '/api/contas/cadastro', { nome: 'Ana Reis', usuario: 'ana', senha: 'segredo123' });
  const t = j.sessao.access_token;
  assert.equal((await pedir('PUT', '/api/contas/senha', { atual: 'errada123', nova: 'novasenha1' }, t)).j.codigo, 'senha_errada');
  assert.equal((await pedir('PUT', '/api/contas/senha', { atual: 'segredo123', nova: 'novasenha1' }, t)).s, 200);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'ana', senha: 'novasenha1' })).s, 200);
  assert.equal((await pedir('PUT', '/api/contas/senha', { atual: 'x', nova: 'y' })).s, 401);
});

test('dono entra pela tela inicial com o e-mail', async () => {
  await repo.criarConta({ email: 'lucas@ex.com', senha: 'segredo123', nome: 'Lucas', usuario: null, papel: 'dono' });
  const e = await pedir('POST', '/api/contas/entrar', { login: 'lucas@ex.com', senha: 'segredo123' });
  assert.equal(e.s, 200);
  assert.equal(e.j.perfil.papel, 'dono');
  assert.equal((await pedir('GET', '/api/admin/eu', null, e.j.sessao.access_token)).s, 200);
});

test('vendedor: cria a conta pelo convite, que fica usado; entra pelo link e pela tela inicial', async () => {
  const exp = Date.now() + 7 * 864e5;
  await repo.salvarDocPrototipo('stores', 'inv-abc123', { invite: { token: 'abc123', email: 'vend@ex.com', created: Date.now(), exp, used: false } });
  const c = await pedir('POST', '/api/contas/vendedor/criar', { token: 'abc123', usuario: 'loja_bia', senha: 'segredo123' });
  assert.equal(c.s, 201);
  assert.equal(c.j.perfil.papel, 'vendedor');
  assert.equal(c.j.perfil.email, 'vend@ex.com');
  assert.equal(c.j.acc.userId, c.j.perfil.id);
  assert.equal((await doc('sellers', 'acc-abc123')).acc.userId, c.j.perfil.id);
  assert.equal((await doc('stores', 'inv-abc123')).invite.used, true);
  // o mesmo convite não cria outra conta
  assert.equal((await pedir('POST', '/api/contas/vendedor/criar', { token: 'abc123', usuario: 'outra', senha: 'segredo123' })).s, 410);
  // convite inexistente ou vencido
  await repo.salvarDocPrototipo('stores', 'inv-velho1', { invite: { token: 'velho1', email: 'x@ex.com', exp: Date.now() - 1, used: false } });
  assert.equal((await pedir('POST', '/api/contas/vendedor/criar', { token: 'velho1', usuario: 'outra', senha: 'segredo123' })).j.codigo, 'convite_invalido');

  const l = await pedir('POST', '/api/contas/vendedor/entrar', { token: 'abc123', usuario: 'loja_bia', senha: 'segredo123' });
  assert.equal(l.s, 200);
  assert.equal((await pedir('POST', '/api/contas/vendedor/entrar', { token: 'abc123', usuario: 'loja_bia', senha: 'errada123' })).s, 401);
  // pela tela inicial, a resposta traz o link do vendedor, para abrir a loja dele
  const t = await pedir('POST', '/api/contas/entrar', { login: 'loja_bia', senha: 'segredo123' });
  assert.equal(t.j.vendedor.token, 'abc123');
});

test('vendedor antigo do protótipo: entra com a mesma senha e passa para o Supabase', async () => {
  const salt = 'sal123';
  const hash = crypto.createHash('sha256').update(`${salt}|senhaantiga`).digest('hex');
  await repo.salvarDocPrototipo('stores', 'inv-old111', { invite: { token: 'old111', email: 'antigo@ex.com', used: true } });
  await repo.salvarDocPrototipo('sellers', 'acc-old111', { acc: { token: 'old111', username: 'antigo', salt, hash, store: { id: 777 } } });
  assert.equal((await pedir('POST', '/api/contas/vendedor/entrar', { token: 'old111', usuario: 'antigo', senha: 'errada' })).s, 401);
  const l = await pedir('POST', '/api/contas/vendedor/entrar', { token: 'old111', usuario: 'antigo', senha: 'senhaantiga' });
  assert.equal(l.s, 200);
  const acc = (await doc('sellers', 'acc-old111')).acc;
  assert.ok(acc.userId);
  assert.equal(acc.hash, undefined); // o hash fraco sai do documento
  assert.equal(acc.store.id, 777); // a loja continua ligada
  // depois de migrado, entra pelo Supabase normalmente (e pela tela inicial)
  assert.equal((await pedir('POST', '/api/contas/vendedor/entrar', { token: 'old111', usuario: 'antigo', senha: 'senhaantiga' })).s, 200);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'antigo', senha: 'senhaantiga' })).s, 200);
});

test('vendedor esqueceu a senha: só o link novo do dono (com "from") permite trocar', async () => {
  const exp = Date.now() + 864e5;
  await repo.salvarDocPrototipo('stores', 'inv-rst111', { invite: { token: 'rst111', email: 'r@ex.com', exp, used: false } });
  const c = await pedir('POST', '/api/contas/vendedor/criar', { token: 'rst111', usuario: 'resetada', senha: 'segredo123' });
  // link novo gerado pelo dono no painel: mesma conta, sem senha, com "from"
  await repo.salvarDocPrototipo('stores', 'inv-rst222', { invite: { token: 'rst222', email: 'r@ex.com', exp, used: false, from: 'rst111' } });
  await repo.salvarDocPrototipo('sellers', 'acc-rst222', { acc: { ...c.j.acc, token: 'rst222', salt: null, hash: null, resetFrom: 'rst111' } });
  // convite sem "from" (um convite comum) não serve para trocar senha
  await repo.salvarDocPrototipo('stores', 'inv-rst333', { invite: { token: 'rst333', email: 'r@ex.com', exp, used: false } });
  await repo.salvarDocPrototipo('sellers', 'acc-rst333', { acc: { ...c.j.acc, token: 'rst333' } });
  assert.equal((await pedir('POST', '/api/contas/vendedor/redefinir', { token: 'rst333', senha: 'invasor123' })).j.codigo, 'convite_invalido');

  const r = await pedir('POST', '/api/contas/vendedor/redefinir', { token: 'rst222', senha: 'novasenha9' });
  assert.equal(r.s, 200);
  assert.equal(r.j.perfil.id, c.j.perfil.id);
  assert.equal((await doc('sellers', 'acc-rst222')).acc.resetFrom, undefined);
  assert.equal((await doc('stores', 'inv-rst222')).invite.used, true);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'resetada', senha: 'novasenha9' })).s, 200);
  // o link de troca só vale uma vez
  assert.equal((await pedir('POST', '/api/contas/vendedor/redefinir', { token: 'rst222', senha: 'outra12345' })).s, 410);
});

test('minha conta: salva nome, usuário e e-mail no servidor', async () => {
  const { j } = await pedir('POST', '/api/contas/cadastro', { nome: 'Rita Alves', usuario: 'rita', senha: 'segredo123' });
  const t = j.sessao.access_token;
  await pedir('POST', '/api/contas/cadastro', { nome: 'Outra Pessoa', usuario: 'ocupado', senha: 'segredo123', email: 'ocupado@ex.com' });
  const salvar = (corpo) => pedir('PUT', '/api/contas/perfil', corpo, t);

  // coloca e-mail e troca o usuário; entra com os dados novos
  const r = await salvar({ nome: 'Rita A. Alves', usuario: 'rita_alves', email: 'Rita@Ex.com' });
  assert.equal(r.s, 200);
  assert.deepEqual([r.j.perfil.nome, r.j.perfil.usuario, r.j.perfil.email], ['Rita A. Alves', 'rita_alves', 'rita@ex.com']);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'rita_alves', senha: 'segredo123' })).s, 200);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'rita@ex.com', senha: 'segredo123' })).s, 200);
  assert.equal((await pedir('POST', '/api/contas/entrar', { login: 'rita', senha: 'segredo123' })).s, 401);

  // tira o e-mail: volta a ter um e-mail interno, que não aparece
  const sem = await salvar({ nome: 'Rita A. Alves', usuario: 'rita_alves', email: '' });
  assert.equal(sem.j.perfil.email, '');
  assert.match(Object.values(repo.tabelas.contas).find((c) => c.usuario === 'rita_alves').email, /@sem-email\.kennismarket\.invalid$/);

  // erros conhecidos
  assert.equal((await salvar({ nome: 'Rita', usuario: 'ocupado', email: '' })).j.codigo, 'usuario_em_uso');
  assert.equal((await salvar({ nome: 'Rita', usuario: 'rita_alves', email: 'ocupado@ex.com' })).j.codigo, 'email_em_uso');
  assert.equal((await salvar({ nome: 'R', usuario: 'rita_alves', email: '' })).j.codigo, 'nome_invalido');
  assert.equal((await salvar({ nome: 'Rita', usuario: 'R!', email: '' })).j.codigo, 'usuario_invalido');
  assert.equal((await salvar({ nome: 'Rita', usuario: 'rita_alves', email: 'nada' })).j.codigo, 'email_invalido');
  assert.equal((await pedir('PUT', '/api/contas/perfil', { nome: 'Rita', usuario: 'rita_alves' })).s, 401);
  // salvar sem mudar nada funciona
  assert.equal((await salvar({ nome: 'Rita A. Alves', usuario: 'rita_alves', email: '' })).s, 200);
});

test('minha conta: vendedor que troca o usuário entra pelo link com o usuário novo', async () => {
  await repo.salvarDocPrototipo('stores', 'inv-perf111', { invite: { token: 'perf111', email: 'p@ex.com', exp: Date.now() + 864e5, used: false } });
  const c = await pedir('POST', '/api/contas/vendedor/criar', { token: 'perf111', usuario: 'loja_velha', senha: 'segredo123' });
  const r = await pedir('PUT', '/api/contas/perfil', { nome: 'Loja Nova', usuario: 'loja_nova', email: 'p@ex.com' }, c.j.sessao.access_token);
  assert.equal(r.s, 200);
  assert.equal((await doc('sellers', 'acc-perf111')).acc.username, 'loja_nova');
  assert.equal((await pedir('POST', '/api/contas/vendedor/entrar', { token: 'perf111', usuario: 'loja_nova', senha: 'segredo123' })).s, 200);
  assert.equal((await pedir('POST', '/api/contas/vendedor/entrar', { token: 'perf111', usuario: 'loja_velha', senha: 'segredo123' })).s, 401);
});
