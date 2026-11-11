// Trava por conta contra força bruta (item 7 do relatório de segurança, 11/11/2026).
//
// O limite por endereço de internet (limite.js) não segura quem usa muitos endereços. Aqui a conta
// conta os erros de senha, venham de onde vierem: 10 senhas erradas em 15 minutos travam aquela conta
// por 15 minutos (até a senha certa é recusada nesse tempo). Acertar zera a contagem.
// Fica na memória do servidor (o Render tem um só servidor; reiniciar zera, o que é aceitável).
export const MAX_ERROS = 10;
export const JANELA_MS = 15 * 60 * 1000;
export const TRAVA_MS = 15 * 60 * 1000;

export function criarTravaContas({ max = MAX_ERROS, janelaMs = JANELA_MS, travaMs = TRAVA_MS, agora = () => Date.now() } = {}) {
  const contas = new Map(); // chave → { inicio, erros, ate }
  const chaveDe = (v) => String(v || '').trim().toLowerCase();
  const limpar = () => {
    if (contas.size < 50000) return;
    const t = agora();
    for (const [k, c] of contas) if (c.ate < t && t - c.inicio > janelaMs) contas.delete(k);
  };
  return {
    // Milissegundos que faltam para destravar (0 = livre).
    travada(chave) {
      const c = contas.get(chaveDe(chave));
      return c && c.ate > agora() ? c.ate - agora() : 0;
    },
    errou(chave) {
      const k = chaveDe(chave);
      if (!k) return;
      const t = agora();
      let c = contas.get(k);
      if (!c || t - c.inicio > janelaMs) c = { inicio: t, erros: 0, ate: 0 };
      c.erros += 1;
      if (c.erros >= max) { c.ate = t + travaMs; c.inicio = t; c.erros = 0; }
      contas.set(k, c);
      limpar();
    },
    acertou(chave) { contas.delete(chaveDe(chave)); },
  };
}
