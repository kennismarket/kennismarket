# Kennismarket — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele resume as decisões já tomadas pelos donos.

## Quem somos
- Dois donos: Lucas e um amigo. **Nenhum dos dois sabe programar.** O Claude é o programador do projeto.
- Explique tudo em português simples, sem jargão. Antes de mudanças grandes, diga o plano em poucas linhas.
- Depois de cada mudança, diga o que mudou e como testar no navegador.
- Respostas diretas e sem enrolação. Se uma ideia for ruim ou arriscada, diga direto, uma vez.

## O que é o Kennismarket
Marketplace brasileiro de produtos digitais e serviços, sem entrega física:
- Foco principal: **mentorias, consultorias e serviços** (ex.: análise de empresa, criação de site, cardápio digital). Também **e-books**.
- Qualquer pessoa com um conhecimento útil pode vender, sem precisar ser profissional.
- Cada vendedor tem a **sua própria loja** e um **chat com o cliente**.
- A confiança é o ponto central do produto.

## Mercado, idioma e moeda
- Público e vendedores: **Brasil**. Cobrança em **reais (R$)** via **Asaas**.
- Interface: o site **abre sempre em holandês** pra qualquer visitante, com tradução opcional para inglês, espanhol e português. Isso é decisão confirmada dos donos, mesmo com o público sendo brasileiro: o seletor de idioma tem que ser fácil de achar.
- Moeda interna: **KN Coins** (símbolo K, abreviação KN).
  - KN Coins **só podem ser comprados dentro da loja, no valor exato do pedido**. Não existe compra avulsa de moedas.
  - O cliente só é atendido com o pedido já pago.

## Pagamentos e dinheiro
- Processador: **Asaas**, em conta no CPF de um dos donos (ainda sem CNPJ). O plano é abrir o CNPJ (Kennismarket Ltda) com o dinheiro das primeiras vendas.
- O nome pessoal do dono não deve aparecer pros compradores no Pix (privacidade).
- Divisão de cada venda (split do Asaas):
  - Vendedor que abre loja normalmente, por inscrição: **taxa de 15%** pro Kennismarket.
  - Vendedor que entrou por **link de convite**: **divisão 50/50**. É um acordo à parte e não aparece nos termos de uso.
- **Links de convite**: só os donos criam, e eles são enviados por e-mail pra vendedores/afiliados criarem a loja.
- **Garantia ao vendedor**: se o cliente receber e não pagar, o Kennismarket paga o vendedor e trata o caso juridicamente.

## Reembolsos
- **Nunca automáticos.** O cliente clica em "Solicitar reembolso", e o suporte analisa caso a caso (pra evitar golpe contra vendedor).
- O botão só aparece/libera quando o cliente pede.
- Reembolso **sempre em dinheiro**, nunca em KN Coins.
- Depois de receber o pedido, só tem reembolso se o que chegou não condiz com o pedido ou com o que a loja mostrava (conta/portfólio).

## Marca
- Logo: **K branco com a perna inferior verde, sobre fundo azul-escuro**, sem hexágono.
- Paleta: principal `#102A43`, base `#FFFFFF`, destaque financeiro `#16805D`, estrutura `#F3F6F9`, texto secundário `#526579`.
- Estética: design holandês, sóbrio e em grade. Tem que funcionar perfeito no celular e no computador.
- E-mail de suporte: kennismarket.support@protonmail.com

## Stack técnica (decidida)
- **Node.js**, com o código no **GitHub**.
- **Supabase** pra login, banco de dados e armazenamento de arquivos.
- **Asaas** pra pagamentos. Usar o **modo sandbox** até os donos autorizarem o dinheiro real.
- Hospedagem prevista: **Hostinger** (plano de hospedagem Node.js gerenciada, com deploy pelo GitHub).
- Ponto de partida visual: `kennismarket-prototipo.html` (protótipo de uma página só, com dados simulados). Use como referência de layout e comportamento.

## Prioridades da primeira versão
1. Cadastro/login de clientes e vendedores
2. Lojas e cadastro de produtos/serviços
3. Checkout com Asaas (sandbox) e split
4. Pedidos, entrega e solicitação de reembolso
5. Chat simples entre cliente e vendedor
6. Painel do vendedor com o valor a receber
7. Links de convite (só pros donos)

## Cuidados
- Pagamentos, saldos e reembolsos são as partes mais sensíveis. Teste muito e explique os riscos.
- Nunca colocar chaves de API no código nem no GitHub. Usar variáveis de ambiente.
- Antes de ligar os pagamentos reais, recomendar uma revisão de segurança por um dev.
