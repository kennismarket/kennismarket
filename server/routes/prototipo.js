import crypto from 'node:crypto';
import { Router } from 'express';
import { codigoDoErro, iaDisponivel, responderSuporte, validarTurnos } from '../lib/ia.js';
import { limitePorIp } from '../lib/limite.js';
import { CAMPOS_DO_DONO, SPLIT_MAX, SPLIT_MIN, donasDasLojas, idDaLoja, lojaDoProduto, pkeyDoArquivo } from '../lib/lojas-prototipo.js';
import { DOMINIO_TESTE, erro, rota } from '../lib/seguranca.js';

// Recursos que o protótipo usava do claude.ai, agora guardados no Supabase:
// - "db": coleções de documentos (lojas, arquivos de entrega, contas de vendedor);
// - "assets": envio de arquivos, que depois abrem em /_blob/<id>;
// - "sample": a IA do chat de suporte (só com ANTHROPIC_API_KEY).
// O navegador fala com isto pela ponte public/js/ponte-claude.js.

export const COLECOES = ['stores', 'delivfiles', 'sellers'];
const ID_DOC = /^[A-Za-z0-9_.:@+~-]{1,200}$/;
const ID_ARQUIVO = /^[0-9a-f]{32}$/;
const MAX_DOC = 256 * 1024;
const MAX_ARQUIVO = 20 * 1024 * 1024;
const MAX_ESPACO = 900 * 1024 * 1024; // o plano grátis do Supabase guarda 1 GB
// Mesmos tipos que o protótipo aceita (FTYPES).
export const TIPOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'text/plain', 'text/csv', 'text/markdown', 'application/json'];

// Quem grava o quê (etapa 2: lojas seguras). Ler continua aberto, como no protótipo.
// - stores/cfg-*: só o dono do site (e-mail do suporte).
// - stores/inv-*: criar e apagar convite, só o dono; atualizar um convite, quem tem login.
// - stores/s<id> (lojas): o dono do site, qualquer loja; o vendedor, só a dele (e cria
//   uma, se ainda não tiver). Nota, vendas, selo e porcentagem são só do dono do site.
//   Loja banida: o vendedor não grava, e ela fica fora do catálogo.
// - delivfiles (arquivos de entrega): o dono do site, ou o vendedor da loja do produto.
// - sellers/acc-*: o dono do site; o vendedor, só o próprio documento (sem trocar a conta).
// Contas de demonstração (sem login) não gravam nada.
export function rotasPrototipo({ repo, pagamentos }) {
  const api = Router();
  // "Versão" de cada coleção: muda a cada gravação, para o navegador saber quando buscar de novo.
  const versoes = Object.fromEntries(COLECOES.map((c) => [c, Date.now()]));
  const mudou = (c) => { versoes[c] += 1; };
  const colecao = (req) => {
    if (!COLECOES.includes(req.params.colecao)) throw erro(404, 'coleção desconhecida');
    return req.params.colecao;
  };
  const docId = (req) => {
    if (!ID_DOC.test(req.params.id)) throw erro(400, 'id inválido');
    return req.params.id;
  };
  const gravacoes = limitePorIp({ max: 300, janelaMs: 10 * 60 * 1000 });
  const usuarioDe = async (req) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuario = token ? await repo.usuarioPorToken(token) : null;
    if (usuario?.email?.endsWith(DOMINIO_TESTE) && pagamentos?.provedor !== 'simulado') throw erro(403, 'conta de teste só funciona com o provedor simulado');
    return usuario;
  };
  const negar = (u, mensagem = 'sem permissão') => erro(u ? 403 : 401, u ? mensagem : 'faça login');

  // Confere a permissão e devolve os dados que de fato serão gravados (PUT).
  const autorizar = async (req, metodo, c, id, dados) => {
    const u = await usuarioDe(req);
    const dono = u?.papel === 'dono';
    const vendedor = u?.papel === 'vendedor';
    const atual = (await repo.listarDocsPrototipo(c)).find((d) => d.id === id)?.dados || null;

    if (c === 'stores' && id.startsWith('cfg-')) {
      if (!dono) throw negar(u, 'só os donos');
      return dados;
    }
    if (c === 'stores' && id.startsWith('inv-')) {
      if ((metodo === 'DELETE' || !atual) && !dono) throw negar(u, 'só os donos');
      if (!u) throw negar(u);
      return dados;
    }
    if (c === 'stores') {
      const lojaId = idDaLoja(id);
      if (lojaId == null) { if (!dono) throw negar(u, 'só os donos'); return dados; }
      if (metodo === 'PUT' && dados.store?.id !== lojaId) throw erro(400, 'id da loja diferente do documento');
      if (dono) {
        if (metodo === 'DELETE') return null;
        const store = { ...dados.store };
        if (store.split != null && store.split !== '') {
          const v = Number(store.split);
          if (!Number.isInteger(v) || v < SPLIT_MIN || v > SPLIT_MAX) throw erro(400, `porcentagem do vendedor entre ${SPLIT_MIN}% e ${SPLIT_MAX}%`);
        }
        if (atual?.banida) store.pub = false;
        // loja de vendedor que só existia no documento dele continua dele
        const contaDona = atual?.contaDona ?? (await donasDasLojas(repo))[lojaId] ?? null;
        return { ...dados, store, contaDona, banida: Boolean(atual?.banida) };
      }
      if (!vendedor) throw negar(u, 'só o vendedor da loja');
      const donas = await donasDasLojas(repo);
      if (atual) {
        if (donas[lojaId] !== u.id) throw negar(u, 'esta loja não é sua');
        if (atual.banida) throw erro(403, 'loja banida');
        if (metodo === 'DELETE') return null;
        const store = { ...dados.store };
        for (const campo of CAMPOS_DO_DONO) {
          if (atual.store && campo in atual.store) store[campo] = atual.store[campo]; else delete store[campo];
        }
        return { ...dados, store, contaDona: atual.contaDona ?? u.id, banida: false };
      }
      if (metodo === 'DELETE') return null;
      // uma loja por vendedor (a dele pode já existir só no documento do vendedor)
      if (donas[lojaId] !== u.id && Object.values(donas).includes(u.id)) throw erro(409, 'você já tem uma loja');
      if (donas[lojaId] != null && donas[lojaId] !== u.id) throw negar(u, 'esta loja não é sua');
      const store = { ...dados.store };
      delete store.split;
      return { ...dados, store, contaDona: u.id, banida: false };
    }
    if (c === 'delivfiles') {
      if (dono) return dados;
      if (!vendedor) throw negar(u, 'só o vendedor da loja');
      const donas = await donasDasLojas(repo);
      const banidas = new Set((await repo.listarDocsPrototipo('stores')).filter((d) => d.dados?.banida).map((d) => idDaLoja(d.id)));
      if (metodo === 'DELETE' && !atual) return null;
      const chaves = [];
      if (atual) chaves.push(pkeyDoArquivo(id, atual)); // o arquivo que já existe é da loja dele
      if (metodo === 'PUT') chaves.push(pkeyDoArquivo(id, dados)); // e o novo também
      for (const pkey of chaves) {
        const loja = await lojaDoProduto(repo, pkey);
        if (loja == null || donas[loja] !== u.id) throw negar(u, 'este arquivo não é da sua loja');
        if (banidas.has(loja)) throw erro(403, 'loja banida');
      }
      return dados;
    }
    // sellers
    if (metodo === 'DELETE' && !dono) throw negar(u, 'só os donos');
    if (dono) return dados;
    if (!u || !atual?.acc?.userId || atual.acc.userId !== u.id) throw negar(u, 'só o próprio vendedor');
    if (atual.acc.banida) throw erro(403, 'loja banida');
    const acc = { ...dados.acc, userId: u.id, username: atual.acc.username, token: atual.acc.token };
    // A cópia da loja no documento do vendedor (o protótipo mostra ela no catálogo):
    // só pode ser uma loja dele (ou nova), e nota, vendas, selo e porcentagem não mudam.
    const lojaNova = acc.storeId ?? acc.store?.id ?? null;
    const lojaAntes = atual.acc.storeId ?? atual.acc.store?.id ?? null;
    if (lojaNova != null && lojaNova !== lojaAntes) {
      const doc = (await repo.listarDocsPrototipo('stores')).find((d) => idDaLoja(d.id) === Number(lojaNova))?.dados;
      if (doc && doc.contaDona !== u.id) throw negar(u, 'esta loja não é sua');
    }
    if (acc.store && typeof acc.store === 'object') {
      const store = { ...acc.store };
      for (const campo of CAMPOS_DO_DONO) {
        if (atual.acc.store && campo in atual.acc.store) store[campo] = atual.acc.store[campo]; else delete store[campo];
      }
      acc.store = store;
    }
    return { ...dados, acc };
  };

  // Lista uma coleção. Se o navegador já tem a versão atual, responde sem os documentos.
  api.get('/colecoes/:colecao', rota(async (req, res) => {
    const c = colecao(req);
    const versao = versoes[c];
    if (String(req.query.versao) === String(versao)) return res.json({ versao, inalterado: true });
    res.json({ versao, docs: await repo.listarDocsPrototipo(c) });
  }));

  api.put('/docs/:colecao/:id', gravacoes, rota(async (req, res) => {
    const c = colecao(req);
    const id = docId(req);
    const dados = req.body?.dados;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw erro(400, 'dados inválidos');
    if (JSON.stringify(dados).length > MAX_DOC) throw erro(413, 'documento grande demais');
    await repo.salvarDocPrototipo(c, id, await autorizar(req, 'PUT', c, id, dados));
    mudou(c);
    res.json({ ok: true, versao: versoes[c] });
  }));

  api.delete('/docs/:colecao/:id', gravacoes, rota(async (req, res) => {
    const c = colecao(req);
    const id = docId(req);
    await autorizar(req, 'DELETE', c, id);
    await repo.apagarDocPrototipo(c, id);
    mudou(c);
    res.json({ ok: true, versao: versoes[c] });
  }));

  // Envio de arquivo: o corpo é o próprio arquivo, e o tipo vai no cabeçalho Content-Type.
  api.post('/arquivos',
    limitePorIp({ max: 300, janelaMs: 60 * 60 * 1000, mensagem: 'muitos arquivos enviados: espere um pouco' }),
    rota(async (req, res) => {
      const u = await usuarioDe(req);
      if (!u || !['dono', 'vendedor'].includes(u.papel)) throw negar(u, 'só vendedores e donos enviam arquivos');
      const tipo = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!TIPOS.includes(tipo)) return res.status(415).json({ erro: 'tipo de arquivo não aceito', codigo: 'unsupported_type' });
      const conteudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!conteudo.length) throw erro(400, 'arquivo vazio');
      if (conteudo.length > MAX_ARQUIVO) return res.status(413).json({ erro: 'arquivo maior que 20 MB', codigo: 'too_large' });
      if (await repo.espacoUsadoPrototipo() + conteudo.length > MAX_ESPACO) {
        return res.status(507).json({ erro: 'armazenamento cheio', codigo: 'quota_or_state' });
      }
      const id = crypto.randomBytes(16).toString('hex');
      await repo.salvarArquivoPrototipo(id, tipo, conteudo, u.id);
      res.status(201).json({ id, sizeBytes: conteudo.length, mimeType: tipo });
    }));

  api.delete('/arquivos/:id', gravacoes, rota(async (req, res) => {
    if (!ID_ARQUIVO.test(req.params.id)) throw erro(400, 'id inválido');
    const u = await usuarioDe(req);
    if (u?.papel !== 'dono') {
      const quem = await repo.quemEnviouArquivoPrototipo(req.params.id);
      if (!u || quem !== u.id) throw negar(u, 'só quem enviou o arquivo');
    }
    await repo.apagarArquivoPrototipo(req.params.id);
    res.json({ ok: true });
  }));

  // IA do suporte: diz se está ligada e responde aos poucos (formato "server-sent events").
  api.get('/ia', (_req, res) => res.json({ disponivel: iaDisponivel() }));
  api.post('/ia', limitePorIp({ max: 30, janelaMs: 60 * 60 * 1000, mensagem: 'rate_limited' }), async (req, res) => {
    const turnos = validarTurnos(req.body?.turns);
    if (!iaDisponivel()) return res.status(503).json({ codigo: 'sampling_disabled' });
    if (!turnos) return res.status(400).json({ codigo: 'invalid' });
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const enviar = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const cancelar = new AbortController();
    res.on('close', () => cancelar.abort()); // visitante fechou ou cancelou
    try {
      const texto = await responderSuporte(turnos, { aoEscrever: (t) => enviar({ text: t }), sinal: cancelar.signal });
      enviar({ fim: true, text: texto });
    } catch (e) {
      const codigo = codigoDoErro(e);
      if (codigo !== 'aborted') console.error('IA do suporte', codigo, e.message);
      enviar({ erro: codigo });
    }
    res.end();
  });

  // Arquivos abrem em /_blob/<id>, como no claude.ai.
  const blob = Router();
  blob.get('/:id', rota(async (req, res) => {
    if (!ID_ARQUIVO.test(req.params.id)) throw erro(404, 'arquivo não encontrado');
    const a = await repo.lerArquivoPrototipo(req.params.id);
    if (!a) throw erro(404, 'arquivo não encontrado');
    res.set({
      'Content-Type': a.tipo,
      'Cache-Control': 'public, max-age=31536000, immutable', // o conteúdo de um id nunca muda
      'X-Content-Type-Options': 'nosniff',
      // Um arquivo enviado (ex.: SVG) nunca roda código no site, nem aberto sozinho numa aba.
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    res.send(a.conteudo);
  }));

  // mudou: outras partes do servidor (contas) avisam quando gravam direto num documento.
  return { api, blob, mudou: (c) => { if (COLECOES.includes(c)) mudou(c); } };
}
