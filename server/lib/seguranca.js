import crypto from 'node:crypto';

// Contas criadas pela página de teste. Só funcionam com o provedor simulado.
export const DOMINIO_TESTE = '@teste.kennismarket.invalid';

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
export const exigirUsuario = (repo, pagamentos) => async (req, _res, next) => {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuario = token ? await repo.usuarioPorToken(token) : null;
    if (!usuario) return next(erro(401, 'faça login'));
    // Contas de teste nunca funcionam com um banco de verdade.
    if (usuario.email?.endsWith(DOMINIO_TESTE) && pagamentos?.provedor !== 'simulado') {
      return next(erro(403, 'conta de teste só funciona com o provedor simulado'));
    }
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
// Erros do módulo de pagamento já trazem o status certo (400, 501, 502).
export function tratarErros(e, _req, res, _next) {
  const status = e.status || 500;
  if (status === 500 || status === 502) console.error(e); // só erros inesperados vão para o log
  res.status(status).json({ erro: status === 500 ? 'erro interno' : e.message });
}
