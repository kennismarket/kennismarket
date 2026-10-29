# Plano de construção

## Como o sistema funciona

- **Navegador** (`public/`): as telas. Abre em holandês, com seletor de idioma no topo.
- **Servidor** (`server/`): toda operação com dinheiro passa por aqui. O navegador nunca decide valores.
- **Supabase**: login, banco de dados e arquivos. Nada fica guardado em arquivo no servidor.
- **Asaas (sandbox)**: cobrança em R$ via Pix, boleto e cartão, e Pix para o vendedor.
- **GitHub Actions**: dispara as tarefas agendadas (cotação diária, nova tentativa de repasses).

## Fluxo de uma venda

1. O cliente escolhe um produto (preço em KN, 1 KN = 1 euro) e clica em comprar.
2. O servidor converte para reais com a cotação do dia, cria o pedido e a cobrança no Asaas.
3. O Asaas avisa que o pagamento foi aprovado: o pedido vira "pago" e o vendedor pode atender.
4. Assim que o dinheiro cai na conta do Kennismarket, metade do valor líquido vai por Pix para o vendedor.
   (Pix e boleto: na hora. Cartão: quando o Asaas libera, uns 30 dias depois.)
5. O vendedor entrega e o cliente confirma.
6. Se o cliente pedir reembolso, o suporte analisa e, se aprovar, devolve em dinheiro pelo Asaas
   (sai do caixa do Kennismarket, porque o vendedor já recebeu).

## Etapas

| # | Etapa | Status |
|---|---|---|
| 0 | Estrutura do projeto, servidor, marca, idiomas | feito |
| 0b | Um servidor só: pagamentos da km-api trazidos para cá, dados no Supabase, tarefas pelo GitHub, Render | feito |
| 1 | Cadastro e login (Supabase), perfis de cliente e vendedor | próximo |
| 2 | Lojas e produtos (com lojas e avaliações de mentira na versão de testes), upload de arquivos | |
| 3 | Tela de checkout no site (o servidor de pagamento já está pronto) | |
| 4 | Telas de pedidos, entrega e reembolso + painel do suporte | |
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
| Dinheiro fica retido até o cliente aprovar | Vendedor recebe assim que o dinheiro cai |
| Divisão ajustável de 10% a 90% | 50/50 em todas as vendas |
| Hexágonos no fundo dos banners | Sem hexágono (regra da marca) |
| Abre no modo escuro | Segue o modo do aparelho (claro ou escuro) |

Lojas, clientes e avaliações inventadas: **podem ficar na versão de testes**, como no protótipo. Na versão real, só dados reais.

Mantemos do protótipo: o layout em grade, as cores, a loja com chat ao lado (abas no celular),
o aviso quando alguém tenta levar a conversa para fora (WhatsApp, Pix direto, telefone),
o chat em tela cheia no celular e a tabela de conversão de moedas.

## Riscos aceitos pelos donos

- **Vendedor recebe antes da confirmação do cliente.** Num golpe, o dinheiro do vendedor já saiu: o reembolso ao cliente sai do caixa do Kennismarket, e o vendedor é banido.
- **Conta Asaas no CPF.** O Pix mostra o nome do dono da conta para quem paga, e não há como esconder sem CNPJ.
- **Cotação congelada na compra.** O cliente paga em reais pela cotação do dia; se o euro mudar depois, não muda nada no pedido.
