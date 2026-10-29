// Asaas de mentira: responde como a API real e guarda cada chamada para conferência.
import http from 'node:http';

export async function iniciarAsaasSimulado() {
  const chamadas = [];
  const falhas = {}; // ex.: falhas['/v3/transfers'] = { status: 400 } ou 'cair'
  let n = 0;
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => {
      const j = corpo ? JSON.parse(corpo) : null;
      chamadas.push({ metodo: req.method, url: req.url, corpo: j, chave: req.headers.access_token });
      const enviar = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      const f = falhas[req.url];
      if (f === 'cair') return req.socket.destroy();
      if (f) return enviar({ errors: [{ description: 'recusado no teste' }] }, f.status);
      if (req.url.startsWith('/v3/customers?')) return enviar({ data: [] });
      if (req.url === '/v3/customers') return enviar({ id: 'cus_' + ++n });
      if (req.url === '/v3/payments') return enviar({ id: 'pay_' + ++n, invoiceUrl: 'https://sandbox/i/' + n, value: j.value });
      if (/\/pixQrCode$/.test(req.url)) return enviar({ encodedImage: 'BASE64', payload: '000201...', expirationDate: '2026-12-31' });
      if (/\/refund$/.test(req.url)) return enviar({ status: 'REFUNDED' });
      if (req.url === '/v3/transfers') return enviar({ id: 'tra_' + ++n, status: 'PENDING', value: j.value });
      enviar({ errors: [{ description: 'rota não simulada' }] }, 404);
    });
  });
  await new Promise((r) => srv.listen(0, r));
  return { url: `http://localhost:${srv.address().port}/v3`, chamadas, falhas, fechar: () => srv.close() };
}
