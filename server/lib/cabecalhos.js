// Proteções do navegador (item 8 do relatório de segurança, 11/11/2026). Nada visual muda.
//
// - O site só pode ser aberto dentro de uma página do próprio site (o visualizador de PDF usa isso),
//   nunca escondido dentro de outro site (golpe do "clique escondido").
// - Sempre HTTPS (o navegador lembra por 1 ano).
// - O navegador não "adivinha" o tipo dos arquivos, não manda o endereço completo para outros sites
//   e não libera câmera, microfone, localização nem pagamento do navegador.
// - Regra de onde pode vir código e para onde podem ir dados (CSP): por enquanto SÓ OBSERVA
//   ("Report-Only"): não bloqueia nada, e o navegador conta em /api/csp o que bloquearia (aparece no
//   registro do Render como "CSP:"). Depois de conferir que nada legítimo aparece, dá para ligar de vez.
import express from 'express';
import { limitePorIp } from './limite.js';

export function cabecalhosSeguranca(req, res, next) {
  res.set({
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// A regra da página (só observando). Fontes do Google e o leitor de PDF (pdf.js) do cdnjs são usados
// pelo protótipo; o navegador fala com o Supabase só para renovar o login.
export const CSP_PAGINA_OBSERVAR = (supabaseUrl) => [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  `connect-src 'self' https://cdnjs.cloudflare.com${supabaseUrl ? ` ${supabaseUrl}` : ''}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'report-uri /api/csp',
].join('; ');

// Recebe os avisos do navegador e escreve no registro (resumido; com limite por visitante).
export function rotaRelatorioCsp() {
  const limite = limitePorIp({ max: 60, janelaMs: 10 * 60 * 1000 });
  return [limite, express.json({ type: () => true, limit: '16kb' }), (req, res) => {
    const r = req.body?.['csp-report'] || req.body || {};
    const bloqueado = String(r['blocked-uri'] || r.blockedURL || '').slice(0, 200);
    const regra = String(r['violated-directive'] || r.effectiveDirective || '').slice(0, 80);
    if (bloqueado || regra) console.warn(`CSP: ${regra} bloquearia ${bloqueado} (${String(r['document-uri'] || '').slice(0, 120)})`);
    res.status(204).end();
  }];
}
