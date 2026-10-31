# Kennismarket — contexto do projeto

Leia este arquivo antes de qualquer tarefa. Ele resume as decisões já tomadas pelos donos.

## Quem somos
- Dois donos: Lucas e um amigo. **Nenhum dos dois sabe programar.** O Claude é o programador do projeto.
- Explique tudo em português simples, sem jargão. Antes de mudanças grandes, diga o plano em poucas linhas.
- Depois de cada mudança, diga o que mudou e como testar no navegador.
- Respostas diretas e sem enrolação. Se uma ideia for ruim ou arriscada, diga direto, uma vez.
- **Merge autorizado:** os donos autorizaram juntar na `main` sem pedir, sempre. Fluxo: branch → testes passando → pull request → merge.
- **Depois de cada etapa feita, dizer sempre o que falta** (pedido dos donos): o que ainda falta daquela etapa e o que vem depois.
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
- Público e vendedores: **Brasil**. Cobrança em **reais (R$)** via **Transfeera**.
- Interface: o site **abre sempre em holandês** pra qualquer visitante, com tradução opcional para inglês, espanhol e português. Isso é decisão confirmada dos donos, mesmo com o público sendo brasileiro: o seletor de idioma tem que ser fácil de achar.
- Moeda interna: **KN Coins** (símbolo K, abreviação KN). **1 KN = 1 euro**: o preço em reais acompanha a cotação diária do euro (Banco Central Europeu), congelada no pedido no momento da compra.
  - KN Coins **só podem ser comprados dentro da loja, no valor exato do pedido**. Não existe compra avulsa de moedas.
  - O cliente só é atendido com o pedido já pago.

## Pagamentos e dinheiro
- Processador: **Transfeera**. O Kennismarket abre já com **CNPJ** (Kennismarket Ltda), então o Pix mostra o nome da empresa, nunca o dos donos.
- **Split instantâneo** por Pix e boleto: a divisão vai na própria cobrança (QR Code/boleto). A parte do vendedor é repassada **na hora**, junto com o pagamento. **Não existe retenção** de dinheiro.
- O vendedor **não precisa de conta na Transfeera**: recebe pelo CPF/CNPJ + chave Pix ou dados bancários (campos exatos a confirmar na documentação).
- Divisão: **50/50 por padrão**, sobre o **valor cheio** cobrado do cliente. **O dono pode definir uma porcentagem diferente para cada loja** (de 10% a 90% para o vendedor, como no painel do protótipo; decisão dos donos). A porcentagem usada fica congelada no pedido na hora da compra. A taxa da Transfeera sai da parte do Kennismarket (confirmar na documentação como configurar).
- **Cartão de crédito**: ainda não confirmado. O código está preparado, mas **desligado** (`PAYMENT_CARD_ENABLED=false`).
- Se houver golpe, os donos resolvem direto com o cliente e **banem o vendedor** (loja banida não vende).
- **Links de convite**: só os donos criam, e eles são enviados por e-mail pra vendedores/afiliados criarem a loja.
- **Garantia ao vendedor**: se o cliente receber e não pagar, o Kennismarket paga o vendedor e trata o caso juridicamente.

### Módulo de pagamento (regra de arquitetura)
- Toda a comunicação com o banco fica **só** em `server/pagamentos/`. O resto do site (checkout, pedidos, painel do vendedor, reembolsos, admin) **nunca** fala direto com o banco: usa só `criarCobranca`, `confirmarPagamento`, `cadastrarRecebedor`, `consultarStatus` e `devolverPagamento`, no formato de `server/pagamentos/contrato.js`. Um teste automático (`tests/isolamento.test.js`) falha se isso for quebrado.
- O banco é escolhido por `PAYMENT_PROVIDER`: `simulado` (testes, sem dinheiro, com a página `/teste/pagamentos`) ou `transfeera`. Trocar de banco = escrever um provedor novo, sem mexer no resto do site.
- **Sandbox da Transfeera** até os donos autorizarem o modo real (`TRANSFEERA_AMBIENTE=sandbox` / `producao`).
- **Documentação da Transfeera ainda não chegou.** Até lá, **não inventar** endpoints, nomes de campos nem formatos da API: o provedor `transfeera` é só um esqueleto que responde "pendente" (HTTP 501), com o que falta marcado no código. Os nomes das variáveis `TRANSFEERA_*` são provisórios.
- Quando chegar a documentação: implementar o provedor real, ajustar os campos do cadastro do vendedor e testar no sandbox o caminho completo (compra → pagamento → split instantâneo → reembolso pelo suporte → débito do vendedor anotado).
- O aviso de pagamento (webhook, `/api/webhooks/pagamento`) só é aceito se o módulo confirmar que veio do banco, e nunca é processado duas vezes.
- Todo pedido guarda: valor em KN, valor em reais, cotação usada e data, porcentagem, parte do vendedor, parte do Kennismarket, situação do pagamento e do repasse.

## Telas do protótipo × regras (decisões dos donos)
- **Carteira:** vira **histórico** — sem saldo nem compra avulsa de KN Coins; mostra só os pagamentos feitos e os reembolsos recebidos.
- **Reembolso:** todos os textos dizem que o reembolso volta **em dinheiro**, depois da análise do suporte (nunca em KN Coins).
- **Garantia:** nada de "dinheiro retido até a entrega". O texto passa a ser **proteção pelo suporte**: se a entrega não bater com o combinado, o suporte analisa e o Kennismarket devolve o dinheiro.
- **Compra:** o cliente conversa no chat, o vendedor manda a **proposta com preço**, o cliente **paga a proposta** e só então o trabalho começa. Produtos de preço fixo da loja também podem ser pagos direto.
- **Divisão:** o controle do painel do dono continua, **por loja** (padrão 50/50). Ver "Pagamentos e dinheiro".
- **Pagamento:** a tela mostra **Pix e boleto**, e o **cartão desativado com a etiqueta "em breve"** até a Transfeera confirmar. Sem iDEAL, PayPal nem outras moedas.

## Reembolsos
- **Nunca automáticos.** O cliente clica em "Solicitar reembolso", e o suporte analisa caso a caso (pra evitar golpe contra vendedor).
- O botão só aparece/libera quando o cliente pede.
- Reembolso **sempre em dinheiro**, nunca em KN Coins. Como o vendedor já recebeu, o dinheiro do reembolso sai do caixa do Kennismarket.
- Ao aprovar um reembolso, o site **anota o débito do vendedor** (a parte dele, proporcional ao valor devolvido). É **só um registro**: a cobrança é feita por fora pelos donos.
- Depois de receber o pedido, só tem reembolso se o que chegou não condiz com o pedido ou com o que a loja mostrava (conta/portfólio).

## Referência visual (regra)
- O `kennismarket-prototipo.html` é a **referência visual oficial**. O site real tem que ficar **igual** a ele: mesmas telas, layout, cores, fontes, textos, ícones, espaçamentos, animações e versão de celular.
- **Reaproveitar o CSS e o HTML do protótipo** sempre que der, em vez de reescrever do zero.
- **Não mudar nem "melhorar" nada visual sem perguntar antes aos donos.** Isso inclui coisas que parecem pequenas (modo claro/escuro, um texto, um ícone).
- Se algo do protótipo não puder ficar igual (por exemplo, porque contradiz uma regra de negócio deste arquivo, ou porque é só simulação), **avisar e explicar por quê**, e esperar a decisão.
- Quando os donos atualizarem o protótipo, comparar com o site e listar o que ficou diferente.

## Versão de testes (demonstração) — como funciona
- O site mostra o **próprio** `kennismarket-prototipo.html` como página (sem cópia nem reescrita). O servidor só faz 4 ajustes na hora de entregar a página (`server/lib/pagina-prototipo.js`): carrega a ponte, troca o endereço dos links de convite, aponta as cotações para `/api/rates` e coloca o ícone da aba (a moeda K no hexágono, gerada pela própria função `coinSVG` do protótipo: `public/favicon.svg` e `public/favicon-32.png`).
- O protótipo foi feito para o claude.ai e usa `window.claude.use(...)`. A **ponte** `public/js/ponte-claude.js` oferece os mesmos recursos guardando tudo no Supabase pelo servidor (`server/routes/prototipo.js`): `db` (coleções `stores`, `delivfiles`, `sellers` → tabela `prototipo_docs`), `assets` (arquivos → Storage, pasta `prototipo`, abertos em `/_blob/<id>`), `downloads` e `sample` (IA do suporte, só com `ANTHROPIC_API_KEY`).
- Os dados do protótipo publicado no claude.ai (lojas, PDFs, contas de vendedor, convites) são levados com `scripts/importar-prototipo.mjs`.
- **Login real (etapa 1):** as telas de login do protótipo usam o Supabase Auth pelo servidor (`server/routes/contas.js`), ligadas por `public/js/contas.js` e pelos ajustes de `server/lib/pagina-prototipo.js`. Entra-se com o nome de usuário **ou** o e-mail. Cadastro de cliente com e-mail **opcional** (decisão dos donos): sem e-mail, a conta recebe um e-mail interno `…@sem-email.kennismarket.invalid`. Sem confirmação de e-mail por enquanto (ligar junto com um serviço de envio). Cada perfil tem um `usuario` único (migração `0004_contas.sql`). Vendedores criam a conta pelo link de convite (o convite fica usado); a ligação conta ↔ convite ↔ loja fica em `sellers/acc-<token>` (`userId`). Contas de vendedor antigas do protótipo passam para o Supabase no primeiro login, com a mesma senha. Senha esquecida do vendedor: link novo gerado pelo dono no painel (convite com `from`). Os botões de conta de demonstração continuam só no navegador.
- **Conta de dono:** entra pela mesma tela inicial (papel `dono` na tabela `perfis`). Só ela vê o botão "Painel do dono" e abre o painel e o editor de lojas; quem não é dono volta ao início. O servidor exige dono para criar e apagar convites, gravar `stores/cfg-*` (configuração do suporte) e apagar contas de vendedor.
- A página "Minha conta" de uma conta real salva nome, usuário e e-mail no servidor (`PUT /api/contas/perfil`); tirar o e-mail volta ao e-mail interno. Vendedor que troca o usuário passa a entrar pelo link com o usuário novo.
- **Excluir conta** (Minha conta, pede a senha): apaga o login e o perfil; se a conta tiver registros que precisam ficar (pedidos), apaga só nome, usuário e e-mail e desliga o login. Vendedor perde o link (a loja fica, para o dono decidir). Conta de dono não se exclui por aí.
- **Painel do dono → Contas:** buscar por nome, usuário ou e-mail; **Nova senha** (senha temporária mostrada uma vez para o dono passar à pessoa) e **Banir/Desbanir** (conta banida perde o acesso na hora e vê "conta suspensa"). Contas de dono não são alteradas por aí. A busca lê todos os logins de uma vez: serve até alguns milhares de contas.
- **Lojas seguras (etapa 2, `autorizar` em `server/routes/prototipo.js` e `server/lib/lojas-prototipo.js`):** ler continua aberto; gravar exige login. Cada loja (`stores/s<id>`) guarda de quem é (`contaDona`) e se está banida (`banida`); lojas antigas pegam a dona do documento do vendedor (`acc.storeId`/`acc.store`). O vendedor cria **uma** loja e edita/apaga só a dele (também a cópia da loja no documento dele); o dono do site edita qualquer uma. Nota, avaliações, vendas, selo "verificada" e a **porcentagem por loja (10% a 90%)** são só do dono. Arquivos de entrega: só o vendedor da loja do produto (ou o dono). Enviar arquivo: só vendedor ou dono; apagar, só quem enviou (`prototipo_arquivos.enviado_por`, migração `0005`) ou o dono. Banir um vendedor (Contas) tira a loja dele do catálogo e trava a edição; desbanir devolve. Contas de demonstração não gravam mais nada no servidor. O `scripts/importar-prototipo.mjs` precisa do token do dono em `KM_TOKEN`.
- **Cópia nas tabelas reais (`server/lib/espelho-lojas.js`):** cada loja do protótipo tem uma cópia em `lojas`/`produtos` (`prototipo_id`, migração `0006`), atualizada sozinha a cada gravação, publicação, banimento e exclusão, e por inteiro ao ligar o servidor (e pelo `POST /api/admin/lojas/copiar`). Textos copiados em português. Lojas do dono ficam sem vendedor (`vendedor_id` vazio) e não vendem de verdade. O pedido usa `lojas.porcentagem_vendedor` (10–90, padrão 50), congelada em `taxa_percentual`, `vendedor_centavos` e `plataforma_centavos`.
- **Arquivos de entrega só para quem pagou:** pronto, mas **desligado** (`ENTREGAS_SO_PAGAS`, padrão `false`), porque as compras do site ainda são simuladas no navegador. Ligado, o PDF de entrega só abre com link assinado de 10 minutos (`GET /api/prototipo/arquivos/<id>/link`), dado só a quem tem pedido pago do produto, ao vendedor da loja, a quem enviou e ao dono; o visualizador do protótipo (`openViewer`) pede o link sozinho. Logos e imagens continuam abertos. **Ligar junto com o checkout.** Arquivos antigos sem produto (`f-…`) ficam só para o dono e quem enviou.
- **Checkout de verdade (etapa 3, `public/js/checkout.js`):** conta real comprando **um** produto de preço fixo numa loja com vendedor de verdade que já disse como recebe → o "comprar" do protótipo abre a tela de pagamento (**Pix** e **boleto**, **cartão desativado "em breve"**; o campo **CPF/CNPJ só aparece no boleto** — decisão dos donos; no Pix o servidor não exige, a confirmar na documentação da Transfeera), que cria o pedido e a cobrança (`POST /api/pedidos`), mostra o Pix copia-e-cola (e o QR, se o banco mandar a imagem) ou a linha do boleto e confere sozinha até o pagamento; pago, a compra entra no site como no protótipo, ligada ao pedido real (`pedidoReal`). `GET /api/pedidos/preco` diz se a compra é de verdade e quanto custa. Conta real em loja sem vendedor, na própria loja, em loja sem dados de recebimento, ou com mais de um produto ou tradução: compra de demonstração do protótipo. **Conta de demonstração de cliente** (pedido dos donos, para ver como fica): a mesma tela, toda no navegador (valor pela cotação do site, Pix/boleto fictícios, aviso "Demonstração: nada é cobrado", nenhum pedido no servidor); o vendedor de demonstração continua com a compra antiga. Pagamento simulado: botão "Simular pagamento (teste)" (`/api/teste/simular`). Vendedor real: "Minha loja" ganha o painel **Como você recebe** (Pix; `PUT /api/loja/recebimento`).
- O que fica só no navegador de cada visitante continua igual ao protótipo (pedidos, carteira, chats, foto de perfil).
- Este projeto do Supabase é o da **versão de testes**. Na versão final, os donos vão criar **outro projeto do Supabase** só com dados reais.

## Marca
- Logo: **o do protótipo** (decisão dos donos): o texto **"Kennismarket."** com o ponto verde e o **K dentro do hexágono** prateado (login e página inicial do protótipo). Hexágonos são permitidos no site todo.
- Paleta: principal `#102A43`, base `#FFFFFF`, destaque financeiro `#16805D`, estrutura `#F3F6F9`, texto secundário `#526579`.
- Estética: design holandês, sóbrio e em grade. Tem que funcionar perfeito no celular e no computador.
- E-mail de suporte: kennismarket.support@protonmail.com

## Stack técnica (decidida)
- **Node.js**, com o código no **GitHub**.
- **Supabase** pra login, banco de dados e armazenamento de arquivos.
- **Transfeera** pra pagamentos (ver "Módulo de pagamento"). Usar o **sandbox** até os donos autorizarem o dinheiro real.
- Hospedagem: **versão de testes no Render** (plano grátis, `render.yaml`). Depois, **Hostinger** (Node.js gerenciada, com deploy pelo GitHub).
- Tarefa agendada (cotação diária do euro) roda pelo **GitHub Actions** (`.github/workflows/tarefas.yml`), porque servidor grátis dorme. Ela precisa da variável `SITE_URL` e do segredo `TAREFAS_TOKEN` no GitHub (e do mesmo `TAREFAS_TOKEN` no Render); sem eles, a tarefa acusa falha. Reserva: se as cotações estiverem faltando ou velhas (antes de anteontem), o próprio site busca quando alguém pede (`garantirCotacoes` em `server/lib/cotacoes.js`).
- Nada de dados guardados em arquivo no servidor: tudo no Supabase.
- **Banco de dados:** o Supabase está ligado ao GitHub com **Deploy to production**: cada arquivo novo em `supabase/migrations/` é aplicado sozinho quando entra na `main`. Por isso:
  - nunca editar um arquivo de migração que já entrou na `main`; toda mudança vai num arquivo novo, com número maior (`0002_...sql`, `0003_...sql`);
  - os donos **não** rodam migrações na mão. O item 3 do fim da resposta só traz SQL avulso (consultas ou correções que não são migração), e diz isso;
  - antes de juntar, testar a migração num Postgres descartável (`npm run test:banco`).
- Referência visual oficial: `kennismarket-prototipo.html` (protótipo de uma página só, com dados simulados). Ver "Referência visual (regra)".
- **Versão de testes**: pode ter lojas, clientes e avaliações inventadas como no protótipo (ninguém de verdade usa). Na versão real, só dados reais.

## Prioridades da primeira versão
1. Cadastro/login de clientes e vendedores
2. Lojas e cadastro de produtos/serviços
3. Checkout com a Transfeera (sandbox) e split instantâneo 50/50
4. Pedidos, entrega e solicitação de reembolso
5. Chat simples entre cliente e vendedor
6. Painel do vendedor com o valor a receber
7. Links de convite (só pros donos)

## Cuidados
- Pagamentos, saldos e reembolsos são as partes mais sensíveis. Teste muito e explique os riscos.
- Nunca colocar chaves de API no código nem no GitHub. Usar variáveis de ambiente.
- Antes de ligar os pagamentos reais, recomendar uma revisão de segurança por um dev.
