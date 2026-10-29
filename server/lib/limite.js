// Limite simples de uso por visitante (endereço IP), guardado na memória do servidor.
// Serve para ninguém encher o banco ou gastar a IA à toa na versão de testes, que é aberta.
import { erro } from './seguranca.js';

export function limitePorIp({ max, janelaMs, mensagem }) {
  const contagem = new Map();
  return (req, _res, next) => {
    const agora = Date.now();
    const ip = req.ip || 'desconhecido';
    let c = contagem.get(ip);
    if (!c || agora - c.inicio > janelaMs) c = { inicio: agora, n: 0 };
    c.n += 1;
    contagem.set(ip, c);
    if (contagem.size > 10000) contagem.clear(); // não deixa a memória crescer sem fim
    next(c.n > max ? erro(429, mensagem || 'muitas ações seguidas: espere um pouco e tente de novo') : undefined);
  };
}
