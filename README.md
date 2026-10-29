# Kennismarket

Marketplace de mentorias, consultorias, serviços e e-books. Contexto e decisões: veja `CLAUDE.md`.

- Plano de construção: `docs/PLANO.md`
- Como publicar a versão de testes no Render: `docs/PUBLICAR-NO-RENDER.md`
- Endereços do servidor (pedidos, cotações, avisos de pagamento): `docs/API.md`

## Como rodar no computador

1. Instale o Node.js 22 ou mais novo.
2. Copie `.env.example` para `.env` e preencha as chaves do Supabase. Os pagamentos começam no modo `simulado`.
3. No terminal, dentro desta pasta:

```bash
npm install
```

```bash
npm run dev
```

4. Abra http://localhost:3000 no navegador: o site é o próprio protótipo.
   Para conferir as configurações, abra http://localhost:3000/api/saude.
   Para testar o fluxo de pagamento (com o provedor simulado), abra http://localhost:3000/teste/pagamentos.

## Testes

Testes do servidor (usam o banco de pagamento simulado e um banco de dados em memória, não tocam em nada real):

```bash
npm test
```

Testes do banco de dados (precisam de um Postgres vazio e descartável, nunca o Supabase de verdade):

```bash
BANCO_TESTE=postgres://usuario@localhost:5432/km_teste npm run test:banco
```

## Pastas

| Pasta | O que tem |
|---|---|
| `server/` | O servidor (Node.js + Express). Fala com o Supabase e, pelo módulo de pagamento, com o banco. |
| `server/lib/dinheiro.js` | Regras de dinheiro: divisão 50/50, conversão KN (euro) → R$ e débito do vendedor no reembolso. |
| `server/pagamentos/` | **Módulo de pagamento**: a única parte que fala com o banco. Provedores `simulado` e `transfeera` (esqueleto). |
| `server/teste/` | Página de teste do fluxo de pagamento (só com o provedor simulado). |
| `server/routes/prototipo.js` + `public/js/ponte-claude.js` | Os recursos do claude.ai que o protótipo usava (dados compartilhados, arquivos, IA), agora no Supabase. |
| `scripts/importar-prototipo.mjs` | Leva para o site os dados do protótipo publicado no claude.ai. |
| `server/lib/cotacoes.js` | Cotação diária do euro (Banco Central Europeu, com fonte reserva). |
| `server/routes/` | Os endereços do servidor (pedidos, loja, reembolsos, aviso de pagamento, tarefas). |
| `public/` | Arquivos que o navegador baixa (a ponte do protótipo e os estilos da página de teste). |
| `supabase/migrations/` | Estrutura do banco de dados (tabelas e regras de acesso). |
| `.github/workflows/` | Tarefa agendada: cotação diária do euro. |
| `render.yaml` | Configuração do Render (versão de testes). |
| `tests/` | Testes automáticos. |
| `kennismarket-prototipo.html` | O protótipo: referência visual oficial **e** a página do site (versão de testes). |
