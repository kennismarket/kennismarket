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
| 0e | Versão de demonstração: o site é o protótipo, com lojas, PDFs, convites e contas no Supabase | feito |
| 1 | Cadastro e login (Supabase), perfis de cliente e vendedor | feito (falta: recuperar senha do cliente por e-mail) |
| 2 | Lojas e produtos (com lojas e avaliações de mentira na versão de testes), upload de arquivos | feito: lojas seguras, cópia nas tabelas reais, porcentagem por loja no pedido; trava "arquivos só para quem pagou" pronta, a ligar com o checkout |
| 3 | Tela de checkout no site (o servidor de pagamento já está pronto, com o simulado) | |
| 4 | Telas de pedidos, entrega e reembolso + painel do suporte | |
| 5 | Chat cliente ↔ vendedor | |
| 6 | Painel do vendedor com o valor a receber | |
| 7 | Links de convite (só donos) | |
| — | Revisão de segurança por um dev antes de ligar dinheiro real | obrigatório |

## Protótipo × regras de negócio

O protótipo (`kennismarket-prototipo.html`) é a referência visual oficial: o site fica igual a ele,
e nada visual muda sem os donos aprovarem.

Algumas telas e textos do protótipo descrevem regras de negócio antigas. **Decisões dos donos (31/10/2026):**

| No protótipo | Como fica no site |
|---|---|
| Carteira ("Portemonnee") com saldo de KN Coins e compra de qualquer valor | Vira histórico: só pagamentos feitos e reembolsos recebidos, sem saldo |
| "Ongebruikte KN Coins krijg je terug" / reembolso volta como KN Coins | Reembolso sempre em dinheiro, depois da análise do suporte |
| "Reserveer KN Coins", vendedor manda proposta depois | Vendedor manda a proposta no chat, o cliente paga e só então o trabalho começa; preço fixo também pode ser pago direto |
| "Je KN Coins blijven in de garantie tot de verkoper levert" (dinheiro retido) | Proteção pelo suporte: se a entrega não bater, o Kennismarket devolve; split instantâneo continua |
| Divisão ajustável de 10% a 90% no painel do dono | **Mantida, por loja** (padrão 50/50): a regra 50/50 fixa mudou |
| Pagamento por iDEAL, PayPal, cartão e outras moedas | Pix e boleto; cartão aparece desativado com "em breve" |

Lojas, clientes e avaliações inventadas: **podem ficar na versão de testes**, como no protótipo. Na versão real, só dados reais.

## Riscos aceitos pelos donos

- **Split instantâneo, sem retenção.** Num reembolso, o Kennismarket devolve 100% ao cliente tendo recebido só 50%: a outra metade já está com o vendedor. O débito dele fica anotado e, num golpe, ele é banido.
- **Cotação congelada na compra.** O cliente paga em reais pela cotação do dia; se o euro mudar depois, não muda nada no pedido.
