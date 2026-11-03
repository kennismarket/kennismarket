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
| 3 | Tela de checkout no site (o servidor de pagamento já está pronto, com o simulado) | feito com o pagamento simulado (um produto por vez; vendedor cadastra o Pix). Falta: provedor real da Transfeera (etapa 0d), comprar vários produtos/tradução e pagar a proposta do chat (com a etapa 5) |
| 4 | Telas de pedidos, entrega e reembolso + painel do suporte | próximo: plano e decisões pendentes em "Etapa 4" abaixo |
| 5 | Chat cliente ↔ vendedor | |
| 6 | Painel do vendedor com o valor a receber | |
| 7 | Links de convite (só donos) | |
| — | Revisão de segurança por um dev antes de ligar dinheiro real | obrigatório |

## Etapa 4 — pedidos, entrega e reembolso (próxima)

O que acontece **depois que o cliente paga**. Hoje o pagamento já é real (simulado), mas o depois ainda é a
demonstração do protótipo: o "vendedor" do chat é um robô que entrega sozinho, e os pedidos de reembolso
(`S.cases`) ficam só no navegador. A etapa 4 liga essas telas aos **pedidos reais** do servidor.

### Como o pedido anda

```
Pago  →  Entregue  →  Concluído
  │          │            │
  └──────────┴────────────┴──→  Reembolso pedido  →  Reembolsado  (dono aprova)
                                                  →  volta como estava (dono nega)
```

1. **Pago**: aparece para o cliente (Meus pedidos), para o vendedor (Minha loja → Pedidos) e para os donos
   (tabela de vendedores, que já existe).
2. **Entregue**: o vendedor entrega (arquivos ou serviço) e clica em "Marcar como entregue" (só depois de pago).
3. **Concluído**: o cliente clica em "Confirmar recebimento".
4. **Reembolso**: a qualquer momento depois de pago, o cliente clica em "Solicitar reembolso" e conta o motivo.
   Nunca automático: vai para Painel do dono → Casos de suporte. Aprovar = devolve em reais pelo módulo de
   pagamento (simulado por enquanto), saindo do caixa do Kennismarket, e anota o débito do vendedor (a parte
   dele, proporcional). Negar = o pedido volta à situação anterior.

### O que já existe no servidor (não precisa refazer)
- `POST /api/pedidos/:id/entregue` (vendedor, só de `pago`), `POST /api/pedidos/:id/recebido` (cliente, só de
  `entregue`), `POST /api/pedidos/:id/reembolso` (cliente, de `pago`/`entregue`/`concluido`, com motivo).
- `POST /api/admin/reembolsos/:id` (dono: aprovar com valor total ou parcial, ou negar; chama
  `devolverPagamento` e anota o débito), `GET /api/admin/debitos`.
- A compra real já cria a compra local do protótipo com `pedidoReal` (o id do pedido no servidor).

### O que falta fazer (telas, só para contas reais)
- **Cliente → Meus pedidos**: listar os pedidos reais (loja, produto, valor, data, situação), com
  "Confirmar recebimento" e "Solicitar reembolso". Rota nova para o cliente listar os próprios pedidos.
- **Vendedor → Minha loja**: listar os pedidos reais recebidos, com "Marcar como entregue". Rota nova para o
  vendedor listar os pedidos da loja. Nos pedidos reais, desligar o robô do protótipo que "entrega sozinho".
- **Dono → Casos de suporte** (seção que já existe no painel do protótipo): os pedidos de reembolso reais, com
  Aprovar (total ou parcial) e Negar, e a lista de débitos dos vendedores. Rota nova para listar os pedidos de
  reembolso em análise.
- **Contas de demonstração e lojas do dono**: continuam com o pedido de mentira do protótipo (decisão dos donos).
- Fica para a **etapa 5 (chat real)**: a conversa e a proposta paga pelo chat. Na etapa 4, a entrega de produtos
  prontos (PDFs) é pelos arquivos que o vendedor já sobe na loja.

### Decisões pendentes (perguntar aos donos antes de começar)
1. **Confirmação automática**: se o cliente não confirmar, o pedido vira Concluído sozinho depois de quantos dias
   do "Entregue"? Recomendado: **7 dias** (mesmo concluído, o cliente ainda pode pedir reembolso).
2. **Trava dos PDFs** (`ENTREGAS_SO_PAGAS`, pronta e desligada): recomendado ligar **só nas lojas de vendedores
   reais**, para os PDFs deles ficarem só para quem pagou e as lojas de demonstração continuarem abertas
   (precisa de um ajuste: hoje a trava vale para todas as lojas).
3. **Reembolso parcial**: permitir devolver só parte do valor ao aprovar? Recomendado: **sim** (o servidor já aceita).

## O que falta no projeto (lista completa, atualizada em 03/11/2026)

**Etapa 3 (checkout)**
- Provedor real da Transfeera (etapa 0d): QR Code, boleto e split de verdade; confirmar na documentação se o Pix
  aceita cobrança sem o CPF do pagador (decisão dos donos: CPF só no boleto) e como fica o nome do vendedor.
- Comprar vários produtos de uma vez e a tradução (+30%) no checkout real (hoje é um produto por vez).
- Pagar a proposta do chat (junto com a etapa 5).
- Vendedor receber em conta bancária, além do Pix (campos a confirmar com a Transfeera).
- Mais para frente: pagamento de verdade nas outras moedas (hoje só BRL; nas outras, a tela antiga do protótipo).

**Próximas etapas**
- **4**: pedidos, entrega e reembolso de verdade (seção acima).
- **5**: chat real cliente ↔ vendedor (hoje as respostas do vendedor são simuladas).
- **6**: painel do vendedor com o valor a receber ("Minhas vendas", em Minha conta, já adianta uma parte).
- **7**: convites enviados por e-mail (precisa do Resend).
- **Login**: recuperar senha do cliente por e-mail e confirmação de e-mail (precisam do Resend).
- **Textos**: Carteira como histórico (sem saldo) e os textos de garantia e reembolso do protótipo que ainda
  falam em "dinheiro retido até a entrega" e reembolso em KN Coins (inclusive na tela antiga "Pagar pedido").

**Antes do lançamento**
- Tirar o que é de teste: botões de conta de demonstração (os donos vão pedir), botão "Testes", página
  `/teste/pagamentos`, pagamento simulado, lojas e avaliações inventadas.
- Revisão de segurança por um dev (obrigatória antes de dinheiro real).
- Projeto novo do Supabase só com dados reais; mudança para a Hostinger; domínio próprio; backups.
- Fora do código: CNPJ, dados da empresa nos Termos e na Privacidade (tirados só na versão de testes) e
  contador para a nota fiscal da comissão.

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
