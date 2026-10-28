# Kennismarket API — pagamentos e repasse aos vendedores

Servidor pequeno (Node.js) que fica entre o site e o **Asaas**:

1. Cria a cobrança do pedido (Pix, boleto ou cartão) — o dinheiro cai na **conta do Kennismarket**.
2. O Asaas avisa (webhook) que o pagamento entrou → o pedido fica **na garantia**.
3. Quando o cliente confirma o recebimento (ou o prazo acaba sem reclamação), a API **repassa a porcentagem do vendedor** para ele.
4. Se houver chamado, a liberação trava; o suporte decide entre **reembolsar** ou **liberar**.

O resto (a parte do Kennismarket) simplesmente fica na sua conta.

---

## Como o dinheiro é dividido

```
parte do vendedor = valor líquido do pagamento × comissão da loja
parte do Kennismarket = valor líquido − parte do vendedor
```

- **Valor líquido** = o que entrou depois da taxa do Asaas (`SPLIT_BASE=net`). Com `SPLIT_BASE=gross`, a conta usa o valor cheio e a taxa sai só da parte do Kennismarket.
- **Comissão**: `DEFAULT_SELLER_PERCENT` (ex.: 50) ou a comissão própria da loja.
- Exemplo testado: pedido de R$ 100,00, líquido R$ 99,01, loja com 60% → vendedor R$ 59,41, Kennismarket R$ 39,60.

---

## Dois jeitos de pagar o vendedor

| Modo | Rota | Precisa de | Como o vendedor recebe |
|---|---|---|---|
| **Subconta Asaas** | `POST /sellers` | Conta principal com **CNPJ** | Na conta Asaas dele (transferência interna, instantânea) |
| **Chave Pix** | `POST /sellers/pix` | Só a chave Pix do vendedor | Pix direto na conta bancária dele |

⚠️ O Asaas só deixa **criar subcontas** se a conta principal for de empresa (CNPJ). Enquanto vocês estiverem no CPF, use o **modo chave Pix**. Quando abrirem o CNPJ, dá para migrar os vendedores para subcontas.

---

## Instalar e rodar

Precisa de **Node.js 18 ou mais novo**.

```bash
npm install
cp .env.example .env     # e preencha as chaves
npm start                # sobe em http://localhost:3000
npm test                 # testa o fluxo inteiro contra um Asaas simulado
```

### No painel do Asaas

1. Crie uma conta no **sandbox** (ambiente de testes): https://sandbox.asaas.com
2. **Integrações → Chave de API**: copie para `ASAAS_API_KEY`.
3. **Integrações → Webhooks**: crie um webhook
   - URL: `https://SEU-SERVIDOR/webhooks/asaas`
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - Eventos: **Cobranças** (`PAYMENT_*`) e **Transferências** (`TRANSFER_*`)
4. Quando tudo funcionar no sandbox, troque para `ASAAS_ENV=production` com a chave de produção.

Se a conta tiver **validação de eventos críticos** (token por SMS/app), as transferências podem ficar pendentes até alguém autorizar. Para o repasse automático, configure a autorização pela API nas configurações de segurança do Asaas.

### Onde hospedar

Qualquer serviço que rode Node com disco persistente (o banco é um arquivo SQLite): Railway, Render (com disco), Fly.io ou uma VPS. Precisa de **HTTPS** para o webhook.

---

## Rotas

Todas as rotas (menos o webhook) exigem o header `x-api-key: <KM_API_KEY>`. **Só o servidor do site chama esta API** — nunca coloque essa chave no navegador.

### Vendedores

**`POST /sellers`** — cria subconta no Asaas (exige CNPJ na conta principal)
```json
{ "id": "loja-123", "name": "Ana Souza", "email": "ana@email.com", "cpfCnpj": "12345678909",
  "birthDate": "1995-05-10", "mobilePhone": "54999999999", "incomeValue": 3000,
  "address": "Rua A", "addressNumber": "10", "province": "Centro", "postalCode": "95000000",
  "percent": 60 }
```
Resposta: `{ "walletId": "...", "asaasAccountId": "...", "percent": 60 }`

**`POST /sellers/pix`** — vendedor que recebe por chave Pix
```json
{ "id": "loja-123", "name": "Ana Souza", "email": "ana@email.com", "cpfCnpj": "12345678909",
  "pixKey": "ana@email.com", "pixKeyType": "EMAIL", "percent": 60 }
```
`pixKeyType`: `CPF`, `CNPJ`, `EMAIL`, `PHONE` ou `EVP` (chave aleatória).

**`POST /sellers/link`** — vendedor que já tem conta Asaas própria e vinculada (só `walletId`).

**`PATCH /sellers/:id`** — `{ "percent": 70 }` muda a comissão da loja; `{ "percent": null }` volta para a padrão.

### Pedidos

**`POST /orders`** — cria a cobrança
```json
{ "id": "ped-987", "sellerId": "loja-123", "value": 90.00, "billingType": "PIX",
  "description": "Destrave o faturamento + De autônomo a empresa",
  "buyer": { "name": "João Lima", "email": "joao@email.com", "cpfCnpj": "98765432100" } }
```
`billingType`: `PIX`, `BOLETO`, `CREDIT_CARD` ou `UNDEFINED` (o cliente escolhe na página do Asaas).

Resposta: `invoiceUrl` (página de pagamento do Asaas — use para cartão e boleto) e, no Pix, `pix.qrCodeImage` (imagem em base64) e `pix.copyPaste` (copia e cola).

> O **valor é em reais**. Se o site mostrar outra moeda, converta para BRL antes de chamar.
> Dados do cartão **nunca** passam pelo site nem por esta API: o cliente digita na página do Asaas (`invoiceUrl`).

**`GET /orders/:id`** — situação do pedido.

| status | significa |
|---|---|
| `awaiting_payment` | cobrança criada, ainda não pago |
| `held` | pago, **na garantia** |
| `disputed` | cliente abriu chamado (liberação travada) |
| `released` | parte do vendedor repassada |
| `refunded` | reembolsado |
| `canceled` | cobrança apagada antes do pagamento |

**`POST /orders/:id/delivered`** — o vendedor entregou. Começa a contar `AUTO_RELEASE_DAYS` (7) para liberar sozinho.

**`POST /orders/:id/release`** — o cliente clicou "Recebi, está tudo certo": repassa na hora.

**`POST /orders/:id/dispute`** — o cliente abriu chamado: trava a liberação.

**`POST /orders/:id/resolve`** — o suporte decidiu a favor do vendedor. Com `{ "release": true }` já repassa.

**`POST /orders/:id/refund`** — reembolsa o cliente (só enquanto o dinheiro está na garantia). `{ "value": 30 }` para reembolso parcial, `{ "reason": "..." }` opcional.

### Webhook

**`POST /webhooks/asaas`** — o Asaas chama sozinho. Confere o token, ignora eventos repetidos e atualiza:
- `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` → `held` (guarda o valor líquido)
- `PAYMENT_REFUNDED` → `refunded`
- `PAYMENT_CHARGEBACK_REQUESTED` → `disputed`
- `TRANSFER_DONE` / `TRANSFER_FAILED` → situação do repasse; se falhar, o pedido volta para `held` para tentar de novo.

---

## Como o site usa

| No site | Chamada |
|---|---|
| Loja criada pelo convite | `POST /sellers/pix` (ou `/sellers`) |
| Comissão por loja no painel do dono | `PATCH /sellers/:id` |
| "Pagar pedido" → Pix/boleto/cartão | `POST /orders` → mostra o QR ou abre `invoiceUrl` |
| Vendedor envia os arquivos | `POST /orders/:id/delivered` |
| "Recebi, está tudo certo" | `POST /orders/:id/release` |
| "Abrir chamado no suporte" | `POST /orders/:id/dispute` |
| Suporte decide | `POST /orders/:id/refund` ou `/resolve` |

---

## Cotações das moedas

A API busca as cotações **uma vez por dia** e guarda tudo no banco (tabela `fx_rates`, uma linha por dia e por moeda). **Nada é apagado**: as cotações antigas ficam como histórico.

- **Fonte principal:** [Frankfurter](https://frankfurter.dev), com os dados oficiais do Banco Central Europeu (USD, GBP, BRL, CAD, AUD, MXN). Grátis e sem chave.
- **Fonte reserva:** [ExchangeRate-API](https://www.exchangerate-api.com/docs/free) (acesso aberto, sem chave). Cobre o que o BCE não publica (ARS, UYU) e entra no lugar do BCE se ele falhar.
  ⚠️ Os termos dessa fonte pedem um link de crédito no site: `<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>` (pode ser discreto, no rodapé da tabela de conversões).
- **Quando:** todo dia depois de `FX_HOUR_UTC` (padrão 16h UTC), e ao ligar o servidor se ainda não houver cotação do dia. Se as duas fontes falharem, o site continua com a última cotação salva.

### Rotas (públicas, só leitura)

| Rota | O que devolve |
|---|---|
| `GET /rates` | Última cotação de cada moeda: `{ base: "EUR", date, rates: { EUR: 1, USD: 1.12, BRL: 5.66, ... } }` |
| `GET /rates/2026-10-27` | A cotação válida naquele dia |
| `GET /rates/history/USD?days=30` | Histórico de uma moeda |
| `POST /rates/refresh` | Força uma atualização agora (precisa do `x-api-key`) |

No site, é só colocar o endereço em `RATES_URL` (no código do site) — ex.: `https://api.seudominio.com/rates`. A tabela de Conversões, o checkout e a estimativa em reais passam a usar a cotação do dia.

### Pedidos em KN Coins

`POST /orders` agora aceita `valueKn` (valor em KN Coins) no lugar de `value`. A API converte para reais com a cotação do dia e guarda no pedido: o valor em KN, a moeda que o cliente escolheu (`displayCurrency`), a cotação usada e a data. Assim, num chamado ou reembolso, dá para saber exatamente quanto o cliente viu e pagou.

```json
{ "id": "ped-987", "sellerId": "loja-123", "valueKn": 90, "billingType": "PIX", "displayCurrency": "USD", "buyer": { ... } }
```

---

## Limites desta versão

- Não emite nota fiscal (o Asaas tem emissão de NFS-e, pode ser ligada depois).
- Reembolso depois do repasse ao vendedor não é automático: o dinheiro já saiu, então é tratado à parte.
- Testada contra um Asaas **simulado** (`npm test`). Antes de usar dinheiro real, rode o fluxo no **sandbox** do Asaas.
