# Endereços do servidor

Respostas sempre em JSON. Erros vêm como `{ "erro": "mensagem" }`.

Endereços marcados com 🔒 exigem login: o navegador manda o token do Supabase no cabeçalho
`Authorization: Bearer <token>`. Os de 👑 são só para os donos (perfil com papel `dono`).

## Situação do site

| Endereço | O que faz |
|---|---|
| `GET /api/vivo` | Responde `{ok:true}`. O Render usa para saber se o site está de pé. |
| `GET /api/saude` | Mostra o que está configurado (Supabase e banco de pagamento) e testa a conexão com o Supabase. Nunca mostra chaves. |
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

## Pagamentos: como funciona por dentro

Toda conversa com o banco de pagamento fica no **módulo de pagamento** (`server/pagamentos/`).
As rotas abaixo nunca falam direto com o banco. O banco é escolhido pela variável `PAYMENT_PROVIDER`:

- `simulado`: banco de mentira, para testes. Ativa a página `/teste/pagamentos`.
- `transfeera`: ainda é só um esqueleto. Responde "pendente" (HTTP 501) até chegar a documentação da API.

## Loja do vendedor 🔒

**`PUT /api/loja/recebimento`**: o vendedor informa como recebe a parte dele. Não cria conta em banco nenhum.

```json
{ "nome": "Ana Souza", "cpfCnpj": "529.982.247-25", "pix": { "chave": "ana@email.com", "tipo": "email" } }
```

ou com dados bancários:

```json
{ "nome": "Ana Souza", "cpfCnpj": "529.982.247-25", "banco": { "codigo": "001", "agencia": "1234", "conta": "56789-0", "tipoConta": "corrente" } }
```

Tipo da chave Pix: `cpf`, `cnpj`, `email`, `telefone` ou `aleatoria`. Tipo de conta: `corrente` ou `poupanca`.
⚠️ Os campos vão ser ajustados quando chegar a documentação da Transfeera.

**`GET /api/loja/recebimento`**: situação do cadastro (`pronto`, `pendente`, `recusado`, `nao_cadastrado` ou
`confirmar_de_novo`, quando o banco de pagamento mudou desde o cadastro).

Uma loja só vende depois que o cadastro de recebimento está `pronto`.

## Pedidos 🔒

**`POST /api/pedidos`**: o cliente compra um produto.

```json
{ "produtoId": "…", "formaPagamento": "pix", "cpfCnpj": "111.444.777-35", "moedaExibida": "USD" }
```

`formaPagamento`: `pix` ou `boleto`. O `cartao` só aparece quando `PAYMENT_CARD_ENABLED=true`.

1. O preço em KN do produto é convertido para reais com a cotação do dia.
2. A divisão é calculada: 50% para o vendedor e 50% para o Kennismarket, sobre o valor cheio. O centavo quebrado fica com o vendedor.
3. A cobrança é criada já com o split.

O pedido guarda o valor em KN, o valor em reais, a cotação e a data, a porcentagem, as duas partes e as situações.
A resposta traz `divisao`, e `pix.copiaECola` no Pix, `boleto.linhaDigitavel` no boleto ou `linkPagamento` no cartão.

| Endereço | Quem | O que faz |
|---|---|---|
| `GET /api/pedidos/:id` | cliente, vendedor ou dono | Situação do pedido |
| `POST /api/pedidos/:id/entregue` | vendedor | Marca como entregue (só depois de pago) |
| `POST /api/pedidos/:id/recebido` | cliente | Confirma que recebeu |
| `POST /api/pedidos/:id/reembolso` | cliente | Pede reembolso: `{ "motivo": "…" }`. O suporte analisa. |

### Situação do pagamento (`status`)

| Valor | Significa |
|---|---|
| `aguardando_pagamento` | Cobrança criada, cliente ainda não pagou |
| `pago` | Pagamento confirmado: o vendedor já pode atender |
| `entregue` | Vendedor entregou |
| `concluido` | Cliente confirmou que recebeu |
| `reembolso_solicitado` | Suporte analisando |
| `reembolsado` | Dinheiro devolvido ao cliente |
| `contestado` | Cliente contestou no banco (só com cartão) |
| `cancelado` | Cobrança cancelada ou não criada |

### Situação do repasse ao vendedor (`repasse_status`)

O split é instantâneo: a parte do vendedor sai junto com o pagamento.

| Valor | Significa |
|---|---|
| `aguardando` | Pagamento ainda não confirmado |
| `processando` | Pago; o banco está fazendo o split |
| `repassado` | A parte do vendedor chegou a ele |
| `falhou` | O banco avisou que o split falhou: o suporte resolve com o banco |

## Suporte 👑

| Endereço | O que faz |
|---|---|
| `POST /api/admin/reembolsos/:id` | `{ "aprovar": true }` devolve tudo; `{ "aprovar": true, "valorCentavos": 3000 }` devolve R$ 30,00; `{ "aprovar": false }` nega, e o pedido volta para onde estava. O dinheiro sai do caixa do Kennismarket, e o **débito do vendedor** (a parte dele, proporcional ao valor devolvido) fica anotado. |
| `GET /api/admin/debitos?situacao=aberto` | Débitos de vendedores anotados nos reembolsos (só registro; a cobrança é por fora). |
| `POST /api/admin/pedidos/:id/atualizar-status` | Pergunta ao banco a situação da cobrança e do split, e corrige o pedido se algum aviso se perdeu. |

## Aviso do banco (webhook)

**`POST /api/webhooks/pagamento`**: o banco chama sozinho. O módulo de pagamento confere se o aviso veio
mesmo do banco (assinatura); se não veio, responde 401. Cada aviso é processado uma vez só.

| Evento (formato do módulo) | Efeito no pedido |
|---|---|
| `pago` | `pago`; repasse `processando` ou o que o aviso disser (no split instantâneo, normalmente `repassado`) |
| `repasse_concluido` | repasse `repassado` |
| `repasse_falhou` | repasse `falhou` |
| `devolvido` | `reembolsado` |
| `cancelado` | `cancelado` (se ainda não pago) |

⚠️ Como a Transfeera assina os avisos e quais eventos manda: pendente da documentação.

## Página de teste (só com `PAYMENT_PROVIDER=simulado`)

`/teste/pagamentos` percorre o fluxo inteiro: prepara contas e loja de teste, compra, simula o pagamento,
pede e decide o reembolso e mostra o débito anotado. Com qualquer outro banco, a página e os endereços
`/api/teste/*` respondem 404, e as contas de teste (`@teste.kennismarket.invalid`) param de funcionar.

## Tarefa agendada

Chamada pelo GitHub (`.github/workflows/tarefas.yml`) com o cabeçalho `x-tarefas-token`.

| Endereço | Quando |
|---|---|
| `POST /api/tarefas/cotacoes` | Todo dia às 16h30 UTC (13h30 em Brasília) |
