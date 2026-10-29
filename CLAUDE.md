# Kennismarket — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele resume as decisões já tomadas pelos donos.

## Quem somos
- Dois donos: Lucas e um amigo. **Nenhum dos dois sabe programar.** O Claude é o programador do projeto.
- Explique tudo em português simples, sem jargão. Antes de mudanças grandes, diga o plano em poucas linhas.
- Depois de cada mudança, diga o que mudou e como testar no navegador.
- Respostas diretas e sem enrolação. Se uma ideia for ruim ou arriscada, diga direto, uma vez.
- **Merge autorizado:** os donos autorizaram juntar na `main` sem pedir, sempre. Fluxo: branch → testes passando → pull request → merge.
- **No fim de toda mudança**, termine a resposta com estes 3 itens, sempre, mesmo quando a resposta for "não":
  1. **Merge no GitHub:** o que foi juntado na `main` (com o link do pull request), ou o que ficou pendente e por quê.
  2. **Variável nova no Render:** nome de cada variável e onde pegar o valor.
  3. **SQL no Supabase:** o SQL pronto para copiar e colar no SQL Editor, num bloco de código, e se ele pode ser rodado mais de uma vez.

## O que é o Kennismarket
Marketplace brasileiro de produtos digitais e serviços, sem entrega física:
- Foco principal: **mentorias, consultorias e serviços** (ex.: análise de empresa, criação de site, cardápio digital). Também **e-books**.
- Qualquer pessoa com um conhecimento útil pode vender, sem precisar ser profissional.
- Cada vendedor tem a **sua própria loja** e um **chat com o cliente**.
- A confiança é o ponto central do produto.

## Mercado, idioma e moeda
- Público e vendedores: **Brasil**. Cobrança em **reais (R$)** via **Asaas**.
- Interface: o site **abre sempre em holandês** pra qualquer visitante, com tradução opcional para inglês, espanhol e português. Isso é decisão confirmada dos donos, mesmo com o público sendo brasileiro: o seletor de idioma tem que ser fácil de achar.
- Moeda interna: **KN Coins** (símbolo K, abreviação KN). **1 KN = 1 euro**: o preço em reais acompanha a cotação diária do euro (Banco Central Europeu), congelada no pedido no momento da compra.
  - KN Coins **só podem ser comprados dentro da loja, no valor exato do pedido**. Não existe compra avulsa de moedas.
  - O cliente só é atendido com o pedido já pago.

## Pagamentos e dinheiro
- Processador: **Asaas**, em conta no CPF de um dos donos (ainda sem CNPJ). O plano é abrir o CNPJ (Kennismarket Ltda) com o dinheiro das primeiras vendas.
- O nome pessoal do dono não deve aparecer pros compradores no Pix (privacidade).
- Divisão de cada venda: **50/50 em todas as vendas**, sobre o valor líquido (depois da taxa do Asaas).
- **O vendedor recebe antes da confirmação do cliente**: assim que o dinheiro cai na conta do Kennismarket, a metade dele vai por Pix para a chave dele (sem subconta, porque a conta ainda é CPF). No cartão, isso só acontece quando o Asaas libera o dinheiro (~30 dias).
- Se houver golpe, os donos resolvem direto com o cliente e **banem o vendedor** (loja banida não recebe repasses).
- **Links de convite**: só os donos criam, e eles são enviados por e-mail pra vendedores/afiliados criarem a loja.
- **Garantia ao vendedor**: se o cliente receber e não pagar, o Kennismarket paga o vendedor e trata o caso juridicamente.

## Reembolsos
- **Nunca automáticos.** O cliente clica em "Solicitar reembolso", e o suporte analisa caso a caso (pra evitar golpe contra vendedor).
- O botão só aparece/libera quando o cliente pede.
- Reembolso **sempre em dinheiro**, nunca em KN Coins. Como o vendedor já recebeu, o dinheiro do reembolso sai do caixa do Kennismarket.
- Depois de receber o pedido, só tem reembolso se o que chegou não condiz com o pedido ou com o que a loja mostrava (conta/portfólio).

## Marca
- Logo: **K branco com a perna inferior verde, sobre fundo azul-escuro**. O **logo** não leva hexágono; no resto do site, hexágonos são permitidos (ex.: fundo dos banners, como no protótipo).
- Paleta: principal `#102A43`, base `#FFFFFF`, destaque financeiro `#16805D`, estrutura `#F3F6F9`, texto secundário `#526579`.
- Estética: design holandês, sóbrio e em grade. Tem que funcionar perfeito no celular e no computador.
- E-mail de suporte: kennismarket.support@protonmail.com

## Stack técnica (decidida)
- **Node.js**, com o código no **GitHub**.
- **Supabase** pra login, banco de dados e armazenamento de arquivos.
- **Asaas** pra pagamentos. Usar o **modo sandbox** até os donos autorizarem o dinheiro real.
- Hospedagem: **versão de testes no Render** (plano grátis, `render.yaml`). Depois, **Hostinger** (Node.js gerenciada, com deploy pelo GitHub).
- Tarefas agendadas (cotação diária, nova tentativa de repasses) rodam pelo **GitHub Actions** (`.github/workflows/tarefas.yml`), porque servidor grátis dorme.
- Nada de dados guardados em arquivo no servidor: tudo no Supabase.
- **Banco de dados:** o Supabase está ligado ao GitHub com **Deploy to production**: cada arquivo novo em `supabase/migrations/` é aplicado sozinho quando entra na `main`. Por isso:
  - nunca editar um arquivo de migração que já entrou na `main`; toda mudança vai num arquivo novo, com número maior (`0002_...sql`, `0003_...sql`);
  - os donos **não** rodam migrações na mão. O item 3 do fim da resposta só traz SQL avulso (consultas ou correções que não são migração), e diz isso;
  - antes de juntar, testar a migração num Postgres descartável (`npm run test:banco`).
- Ponto de partida visual: `kennismarket-prototipo.html` (protótipo de uma página só, com dados simulados). Use como referência de layout e comportamento.
- **Versão de testes**: pode ter lojas, clientes e avaliações inventadas como no protótipo (ninguém de verdade usa). Na versão real, só dados reais.

## Prioridades da primeira versão
1. Cadastro/login de clientes e vendedores
2. Lojas e cadastro de produtos/serviços
3. Checkout com Asaas (sandbox) e repasse 50/50 por Pix
4. Pedidos, entrega e solicitação de reembolso
5. Chat simples entre cliente e vendedor
6. Painel do vendedor com o valor a receber
7. Links de convite (só pros donos)

## Cuidados
- Pagamentos, saldos e reembolsos são as partes mais sensíveis. Teste muito e explique os riscos.
- Nunca colocar chaves de API no código nem no GitHub. Usar variáveis de ambiente.
- Antes de ligar os pagamentos reais, recomendar uma revisão de segurança por um dev.
