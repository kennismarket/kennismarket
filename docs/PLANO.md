# Plano de construção

## Como o sistema funciona

- **Navegador** (`public/`): as telas. Abre em holandês, com seletor de idioma no topo.
- **Servidor** (`server/`): toda operação com dinheiro passa por aqui. O navegador nunca decide valores.
- **Supabase**: login, banco de dados e arquivos (e-books, entregas).
- **Asaas (sandbox)**: cobrança em R$ via Pix, boleto e cartão, com split automático para o vendedor.

## Fluxo de uma venda

1. O cliente escolhe um produto na loja e clica em comprar.
2. O servidor cria o pedido e uma cobrança no Asaas no valor exato (KN → R$), já com o split
   (15% ou 50/50, conforme a origem do vendedor).
3. O Asaas avisa o servidor que o pagamento caiu, e só aí o pedido vira "pago" e o vendedor pode atender.
4. O vendedor entrega pelo chat ou com arquivo, e o pedido vira "entregue".
5. Se o cliente pedir reembolso, o pedido fica "em análise". O suporte decide e devolve em dinheiro pelo Asaas.

## Etapas

| # | Etapa | Status |
|---|---|---|
| 0 | Estrutura do projeto, servidor, marca, idiomas, regras de split com testes | feito |
| 1 | Cadastro e login (Supabase), perfis de cliente e vendedor | próximo |
| 2 | Lojas e cadastro de produtos/serviços, upload de arquivos | |
| 3 | Checkout com Asaas sandbox, split e aviso de pagamento (webhook) | |
| 4 | Pedidos, entrega e solicitação de reembolso + painel do suporte | |
| 5 | Chat cliente ↔ vendedor | |
| 6 | Painel do vendedor com o valor a receber | |
| 7 | Links de convite (só donos) | |
| — | Revisão de segurança por um dev antes de ligar dinheiro real | obrigatório |

## O que do protótipo muda (o CLAUDE.md manda mais)

| No protótipo | Na versão real |
|---|---|
| Carteira com saldo de KN Coins e compra de qualquer valor | Sem saldo avulso: compra exata do pedido |
| Reembolso volta como KN Coins para a carteira | Reembolso sempre em dinheiro |
| "Reserva" antes do pagamento, vendedor manda proposta depois | Cliente paga primeiro, depois é atendido |
| Preços em euro, várias moedas (iDEAL, PayPal...) | Só reais (R$) via Asaas: Pix, boleto, cartão |
| Divisão ajustável de 10% a 90% | 15% (inscrição) ou 50/50 (convite) |
| Lojas, clientes e avaliações gerados automaticamente | Só lojas e avaliações reais |
| Hexágonos no fundo dos banners | Sem hexágono (regra da marca) |
| Abre no modo escuro | Segue o modo do aparelho (claro ou escuro) |

Mantemos do protótipo: o layout em grade, as cores, a loja com chat ao lado (abas no celular),
o aviso quando alguém tenta levar a conversa para fora (WhatsApp, Pix direto, telefone)
e o chat em tela cheia no celular.

## Perguntas em aberto para os donos

1. Quanto vale 1 KN Coin em reais? Por enquanto o código usa 1 KN = R$ 1,00.
2. Quando o vendedor recebe: na hora do pagamento (split imediato) ou só depois que o cliente
   confirma a entrega? Com split imediato, um reembolso aprovado sai do caixa do Kennismarket.
