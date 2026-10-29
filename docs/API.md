# Endereços do servidor

Respostas sempre em JSON. Erros vêm como `{ "erro": "mensagem" }`.

Endereços marcados com 🔒 exigem login: o navegador manda o token do Supabase no cabeçalho
`Authorization: Bearer <token>`. Os de 👑 são só para os donos (perfil com papel `dono`).

## Situação do site

| Endereço | O que faz |
|---|---|
| `GET /api/vivo` | Responde `{ok:true}`. O Render usa para saber se o site está de pé. |
| `GET /api/saude` | Mostra o que está configurado e testa a conexão com o Supabase (sem mostrar chaves). |
| `GET /api/config` | O que o navegador pode saber: endereço do Supabase e chave pública. |

## Cotações (públicas)

1 KN = 1 euro. As cotações dizem quanto 1 euro vale em cada moeda.

| Endereço | O que devolve |
|---|---|
| `GET /api/cotacoes` | Última cotação de cada moeda: `{ base: "EUR", data, taxas: { EUR: 1, BRL: 6.12, USD: 1.12, ... } }` |
| `GET /api/cotacoes/2026-10-27` | A cotação válida naquele dia |
| `GET /api/cotacoes/historico/BRL?dias=30` | Histórico de uma moeda |

Fontes: [Frankfurter](https://frankfurter.dev) (dados oficiais do Banco Central Europeu) e, como reserva e para ARS/UYU,
[ExchangeRate-API](https://www.exchangerate-api.com). Os termos da ExchangeRate-API pedem um link de crédito no site:
`<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>` (pode ser discreto, no rodapé da tabela de conversões).

## Pedidos 🔒

**`POST /api/pedidos`**: o cliente compra um produto.

```json
{ "produtoId": "…", "formaPagamento": "PIX", "cpfCnpj": "987.654.321-00", "moedaExibida": "USD" }
```

`formaPagamento`: `PIX`, `BOLETO`, `CREDIT_CARD` ou `UNDEFINED` (o cliente escolhe na página do Asaas).
O preço em KN do produto é convertido para reais com a cotação do dia, e o valor e a cotação ficam gravados no pedido.
Resposta: `linkPagamento` (página do Asaas, usada para cartão e boleto) e, no Pix, `pix.imagem` (QR em base64) e `pix.copiaECola`.
Dados de cartão **nunca** passam pelo site: o cliente digita na página do Asaas.

| Endereço | Quem | O que faz |
|---|---|---|
| `GET /api/pedidos/:id` | cliente, vendedor ou dono | Situação do pedido |
| `POST /api/pedidos/:id/entregue` | vendedor | Marca como entregue (só depois de pago) |
| `POST /api/pedidos/:id/recebido` | cliente | Confirma que recebeu |
| `POST /api/pedidos/:id/reembolso` | cliente | Pede reembolso: `{ "motivo": "…" }`. O suporte analisa. |

### Situações do pedido

| `status` | Significa |
|---|---|
| `aguardando_pagamento` | Cobrança criada, cliente ainda não pagou |
| `pago` | Pagamento aprovado: o vendedor já pode atender |
| `entregue` | Vendedor entregou |
| `concluido` | Cliente confirmou que recebeu |
| `reembolso_solicitado` | Suporte analisando |
| `reembolsado` | Dinheiro devolvido ao cliente |
| `contestado` | Cliente contestou o cartão no banco |
| `cancelado` | Cobrança apagada antes do pagamento |

### Repasse ao vendedor (`repasse_status`)

| Valor | Significa |
|---|---|
| `aguardando_dinheiro` | Cartão aprovado, dinheiro ainda não caiu (~30 dias) |
| `pendente` | Dinheiro na conta, repasse vai sair |
| `enviando` | Pedido de transferência a caminho do Asaas. **Se ficar parado aqui com `repasse_erro` "CONFERIR NO ASAAS"**, a resposta do Asaas se perdeu: confira no painel do Asaas se a transferência saiu antes de fazer qualquer coisa. |
| `enviado` | Asaas aceitou a transferência |
| `concluido` | Dinheiro chegou ao vendedor |
| `falhou` | Asaas recusou; a tarefa de hora em hora tenta de novo (até 5 vezes) |

## Suporte 👑

| Endereço | O que faz |
|---|---|
| `POST /api/admin/reembolsos/:id` | `{ "aprovar": true }` devolve tudo pelo Asaas; `{ "aprovar": true, "valorCentavos": 3000 }` devolve R$ 30,00; `{ "aprovar": false }` nega e o pedido volta para onde estava. |
| `POST /api/admin/pedidos/:id/repasse` | Repasse travado: `{ "acao": "tentar_de_novo" }` (só depois de conferir no Asaas que o dinheiro **não** saiu) ou `{ "acao": "marcar_enviado", "repasseId": "tra_…" }` (conferiu e saiu). |

## Avisos do Asaas

**`POST /api/webhooks/asaas`**: o Asaas chama sozinho. Confere o token, ignora avisos repetidos e:

- `PAYMENT_CONFIRMED` (cartão aprovado) → `pago`, repasse aguarda o dinheiro cair
- `PAYMENT_RECEIVED` (dinheiro na conta) → `pago` e envia a metade do vendedor por Pix
- `PAYMENT_REFUNDED` → `reembolsado`
- `PAYMENT_DELETED` → `cancelado`
- `PAYMENT_CHARGEBACK_REQUESTED` → `contestado`
- `TRANSFER_DONE` → repasse `concluido`; `TRANSFER_FAILED`/`TRANSFER_CANCELLED` → `falhou` (tenta de novo)

## Tarefas agendadas

Chamadas pelo GitHub (`.github/workflows/tarefas.yml`) com o cabeçalho `x-tarefas-token`.

| Endereço | Quando |
|---|---|
| `POST /api/tarefas/cotacoes` | Todo dia às 16h30 UTC (13h30 em Brasília) |
| `POST /api/tarefas/repasses` | De hora em hora |
