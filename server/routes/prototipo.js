import crypto from 'node:crypto';
import { Router } from 'express';
import { codigoDoErro, iaDisponivel, responderSuporte, validarTurnos } from '../lib/ia.js';
import { limitePorIp } from '../lib/limite.js';
import { erro, rota } from '../lib/seguranca.js';

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

export function rotasPrototipo({ repo }) {
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
    await repo.salvarDocPrototipo(c, id, dados);
    mudou(c);
    res.json({ ok: true, versao: versoes[c] });
  }));

  api.delete('/docs/:colecao/:id', gravacoes, rota(async (req, res) => {
    const c = colecao(req);
    await repo.apagarDocPrototipo(c, docId(req));
    mudou(c);
    res.json({ ok: true, versao: versoes[c] });
  }));

  // Envio de arquivo: o corpo é o próprio arquivo, e o tipo vai no cabeçalho Content-Type.
  api.post('/arquivos',
    limitePorIp({ max: 300, janelaMs: 60 * 60 * 1000, mensagem: 'muitos arquivos enviados: espere um pouco' }),
    rota(async (req, res) => {
      const tipo = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!TIPOS.includes(tipo)) return res.status(415).json({ erro: 'tipo de arquivo não aceito', codigo: 'unsupported_type' });
      const conteudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!conteudo.length) throw erro(400, 'arquivo vazio');
      if (conteudo.length > MAX_ARQUIVO) return res.status(413).json({ erro: 'arquivo maior que 20 MB', codigo: 'too_large' });
      if (await repo.espacoUsadoPrototipo() + conteudo.length > MAX_ESPACO) {
        return res.status(507).json({ erro: 'armazenamento cheio', codigo: 'quota_or_state' });
      }
      const id = crypto.randomBytes(16).toString('hex');
      await repo.salvarArquivoPrototipo(id, tipo, conteudo);
      res.status(201).json({ id, sizeBytes: conteudo.length, mimeType: tipo });
    }));

  api.delete('/arquivos/:id', gravacoes, rota(async (req, res) => {
    if (!ID_ARQUIVO.test(req.params.id)) throw erro(400, 'id inválido');
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

  return { api, blob };
}
