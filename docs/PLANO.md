# Plano de construção

## Como o sistema funciona

- **Navegador** (`public/`): as telas. Abre em holandês, com seletor de idioma no topo.
- **Servidor** (`server/`): toda operação com dinheiro passa por aqui. O navegador nunca decide valores.
- **Módulo de pagamento** (`server/pagamentos/`): a única parte que fala com o banco. Hoje: provedor `simulado`
  (testes) e o esqueleto da `transfeera` (aguardando a documentação).
- **Supabase**: login, banco de dados e arquivos. Nada fica guardado em arquivo no servidor.
- **Transfeera**: cobrança em R$ por Pix e boleto, com split instantâneo (cartão preparado, desligado).
- **GitHub Actions**: dispara a cotação diária do euro.

## Fluxo de uma venda

1. O cliente escolhe um produto (preço em KN, 1 KN = 1 euro) e clica em comprar.
2. O servidor converte para reais com a cotação do dia, divide 50/50 sobre o valor cheio e cria a cobrança já com o split.
3. O cliente paga. O banco avisa o site, e a parte do vendedor vai para ele **na hora**, junto com o pagamento.
4. O vendedor atende, entrega, e o cliente confirma.
5. Se o cliente pedir reembolso, o suporte analisa. Se aprovar, o dinheiro volta ao cliente saindo do caixa do
   Kennismarket, e o site anota quanto o vendedor deve (só registro; a cobrança é por fora).

## Etapas

| # | Etapa | Status |
|---|---|---|
| 0 | Estrutura do projeto, servidor, marca, idiomas | feito |
| 0b | Um servidor só: dados no Supabase, tarefas pelo GitHub, Render | feito |
| 0c | Pagamentos reorganizados: módulo de pagamento, provedor simulado, página de teste, esqueleto da Transfeera | feito |
| 0d | Provedor real da Transfeera (sandbox), quando chegar a documentação e as credenciais | aguardando documentação |
| 1 | Cadastro e login (Supabase), perfis de cliente e vendedor | próximo |
| 2 | Lojas e produtos (com lojas e avaliações de mentira na versão de testes), upload de arquivos | |
| 3 | Tela de checkout no site (o servidor de pagamento já está pronto, com o simulado) | |
| 4 | Telas de pedidos, entrega e reembolso + painel do suporte | |
| 5 | Chat cliente ↔ vendedor | |
| 6 | Painel do vendedor com o valor a receber | |
| 7 | Links de convite (só donos) | |
| — | Revisão de segurança por um dev antes de ligar dinheiro real | obrigatório |

## Protótipo × regras de negócio

O protótipo (`kennismarket-prototipo.html`) é a referência visual oficial: o site fica igual a ele,
e nada visual muda sem os donos aprovarem.

Algumas telas e textos do protótipo descrevem regras de negócio antigas, que o CLAUDE.md mudou.
**Como cada uma aparece no site ainda depende de decisão dos donos:**

| No protótipo | Regra atual (CLAUDE.md) |
|---|---|
| Carteira ("Portemonnee") com saldo de KN Coins e compra de qualquer valor | Sem saldo avulso: compra exata do pedido |
| "Ongebruikte KN Coins krijg je terug" / reembolso volta como KN Coins | Reembolso sempre em dinheiro |
| "Reserveer KN Coins", vendedor manda proposta depois | Cliente paga primeiro, depois é atendido |
| "Je KN Coins blijven in de garantie tot de verkoper levert" (dinheiro retido) | Split instantâneo, sem retenção |
| Divisão ajustável de 10% a 90% no painel do dono | 50/50 em todas as vendas |
| Pagamento por iDEAL, PayPal, cartão e outras moedas, pelo processador antigo | Pix e boleto em R$ pela Transfeera (cartão desligado) |

Lojas, clientes e avaliações inventadas: **podem ficar na versão de testes**, como no protótipo. Na versão real, só dados reais.

## Riscos aceitos pelos donos

- **Split instantâneo, sem retenção.** Num reembolso, o Kennismarket devolve 100% ao cliente tendo recebido só 50%: a outra metade já está com o vendedor. O débito dele fica anotado e, num golpe, ele é banido.
- **Cotação congelada na compra.** O cliente paga em reais pela cotação do dia; se o euro mudar depois, não muda nada no pedido.
