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
| 2 | Lojas e produtos (com lojas e avaliações de mentira na versão de testes), upload de arquivos | feito: lojas seguras, cópia nas tabelas reais, porcentagem por loja no pedido; trava "arquivos só para quem pagou" ligada nas lojas de vendedores reais |
| 3 | Tela de checkout no site (o servidor de pagamento já está pronto, com o simulado) | feito com o pagamento simulado (um produto por vez; vendedor cadastra o Pix). Falta: provedor real da Transfeera (etapa 0d), comprar vários produtos/tradução e pagar a proposta do chat (com a etapa 5) |
| 4 | Telas de pedidos, entrega e reembolso + painel do suporte | feito (03/11/2026) com o pagamento simulado. Falta: testar com a Transfeera (etapa 0d) e o chat real (etapa 5) |
| 5 | Chat cliente ↔ vendedor | |
| 6 | Painel do vendedor com o valor a receber | feito (04/11/2026): Faturamento da conta (Minha conta, soma todas as lojas) e Faturamento da loja (Minha loja); débitos quitados/perdoados pelo dono. Falta: testar o repasse com a Transfeera |
| 7 | Links de convite (só donos) | |
| — | Revisão de segurança por um dev antes de ligar dinheiro real | obrigatório |

## Etapa 4 — pedidos, entrega e reembolso (feita em 03/11/2026)

O que acontece **depois que o cliente paga**, ligado aos pedidos reais do servidor (só contas reais; contas de
demonstração e lojas do dono continuam com o pedido de mentira do protótipo).

```
Pago  →  Entregue  →  Concluído (o cliente confirma, ou sozinho 7 dias depois da entrega)
  │          │            │
  └──────────┴────────────┴──→  Reembolso pedido  →  Reembolsado, total ou parcial (dono aprova)
                                                  →  volta como estava (dono nega)
```

- **Cliente → Meus pedidos / chat da loja**: os pedidos reais aparecem; o robô do protótipo não entrega mais
  sozinho; "Recebi, está tudo certo" confirma; "Abrir chamado" (na entrega) ou "Solicitar reembolso" (pago ou
  concluído) pede reembolso com o motivo.
- **Vendedor → Minha loja → Pedidos**: os pedidos reais da loja, com "Entregar".
- **Dono → Chamados de suporte**: pedidos de reembolso reais com "Devolver ao comprador" (total ou parcial, mostra
  o débito do vendedor) e "Negar"; últimos decididos; débitos dos vendedores.
- Rotas novas: `GET /api/pedidos`, `GET /api/loja/pedidos`, `GET /api/admin/casos`, `POST /api/tarefas/pedidos`.

### Decisões tomadas (recomendações do plano)
1. **Confirmação automática em 7 dias** depois de "Entregue" (concluído ainda aceita pedido de reembolso).
2. **Trava dos PDFs ligada só nas lojas de vendedores reais** (as de demonstração continuam abertas).
3. **Reembolso parcial: sim.**

### O que ficou para depois
- Testar o caminho completo com a Transfeera de verdade (sandbox), quando chegar a documentação (etapa 0d).
- Etapa 5 (chat real): a conversa e a proposta paga pelo chat. Hoje, "Pedir ajuste" e as mensagens nos pedidos
  reais ficam só no navegador, e o "vendedor" ainda responde com as falas prontas do protótipo.
- ~~Marcar um débito como quitado/perdoado no painel~~ (feito na etapa 6).
- Carteira como histórico (os reembolsos ainda não aparecem lá).

## O que falta no projeto (lista completa, atualizada em 03/11/2026)

**Etapa 3 (checkout)**
- Provedor real da Transfeera (etapa 0d): QR Code, boleto e split de verdade; confirmar na documentação se o Pix
  aceita cobrança sem o CPF do pagador (decisão dos donos: CPF só no boleto) e como fica o nome do vendedor.
- Comprar vários produtos de uma vez e a tradução (+30%) no checkout real (hoje é um produto por vez).
- Pagar a proposta do chat (junto com a etapa 5).
- Vendedor receber em conta bancária, além do Pix (campos a confirmar com a Transfeera).
- Mais para frente: pagamento de verdade nas outras moedas (hoje só BRL; nas outras, a tela antiga do protótipo).

**Próximas etapas**
- **4**: feita (seção acima); falta testar com a Transfeera e marcar débitos como quitados.
- **5**: chat real cliente ↔ vendedor (hoje as respostas do vendedor são simuladas).
- **6**: feita (Faturamento da conta e da loja). Falta testar o repasse com a Transfeera.
- **Várias lojas por conta**: feito (04/11/2026). Até 10 lojas por conta, seletor e "Criar outra loja" em Minha loja,
  Pix e pedidos por loja; a conta de demonstração de vendedor mostra tudo isso no navegador.
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
