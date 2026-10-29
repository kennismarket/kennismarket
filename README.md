# Kennismarket

Marketplace de mentorias, consultorias, serviços e e-books. Contexto e decisões: veja `CLAUDE.md`.

- Plano de construção: `docs/PLANO.md`
- Como publicar a versão de testes no Render: `docs/PUBLICAR-NO-RENDER.md`
- Endereços do servidor (pedidos, cotações, avisos do Asaas): `docs/API.md`

## Como rodar no computador

1. Instale o Node.js 22 ou mais novo.
2. Copie `.env.example` para `.env` e preencha as chaves (Supabase e Asaas sandbox).
3. No terminal, dentro desta pasta:

```bash
npm install
```

```bash
npm run dev
```

4. Abra http://localhost:3000 no navegador.
   Para conferir as configurações, abra http://localhost:3000/api/saude.

## Testes

Testes do servidor (usam um Asaas e um banco simulados, não tocam em nada real):

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
| `server/` | O servidor (Node.js + Express). Fala com o Supabase e o Asaas. |
| `server/lib/dinheiro.js` | Regras de dinheiro: divisão 50/50 e conversão KN (euro) → R$. |
| `server/lib/repasse.js` | Pagamento da parte do vendedor por Pix, com trava contra pagar duas vezes. |
| `server/lib/cotacoes.js` | Cotação diária do euro (Banco Central Europeu, com fonte reserva). |
| `server/routes/` | Os endereços do servidor (pedidos, reembolsos, avisos do Asaas, tarefas). |
| `public/` | O que aparece no navegador: páginas, estilos, logo e textos nos 4 idiomas. |
| `supabase/migrations/` | Estrutura do banco de dados (tabelas e regras de acesso). |
| `.github/workflows/` | Tarefas agendadas: cotação diária e nova tentativa de repasses. |
| `render.yaml` | Configuração do Render (versão de testes). |
| `tests/` | Testes automáticos. |
| `kennismarket-prototipo.html` | Protótipo original, só como referência visual. |
