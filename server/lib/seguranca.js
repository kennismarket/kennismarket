import crypto from 'node:crypto';
import { AsaasError } from './asaas.js';

// Compara senhas sem vazar, pelo tempo de resposta, quantas letras estavam certas.
export function iguais(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

// Exige login: o navegador manda "Authorization: Bearer <token do Supabase>".
export const exigirUsuario = (repo) => async (req, _res, next) => {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuario = token ? await repo.usuarioPorToken(token) : null;
    if (!usuario) return next(erro(401, 'faça login'));
    req.usuario = usuario;
    next();
  } catch (e) {
    next(e);
  }
};

export function exigirDono(req, _res, next) {
  next(req.usuario?.papel === 'dono' ? undefined : erro(403, 'só os donos'));
}

// Envolve rotas assíncronas para que qualquer erro chegue ao tratamento de erros.
export const rota = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Responde erros sempre no mesmo formato: { erro: "..." }.
export function tratarErros(e, _req, res, _next) {
  const status = e instanceof AsaasError ? (e.status < 500 ? 400 : 502) : e.status || 500;
  if (status === 500 || status === 502) console.error(e); // só erros inesperados vão para o log
  res.status(status).json({ erro: status >= 500 && !(e instanceof AsaasError) ? 'erro interno' : e.message });
}
