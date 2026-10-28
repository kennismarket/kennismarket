# Kennismarket

Marketplace de mentorias, consultorias, serviços e e-books. Contexto e decisões: veja `CLAUDE.md`.
O plano de construção está em `docs/PLANO.md`.

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

```bash
npm test
```

## Pastas

| Pasta | O que tem |
|---|---|
| `server/` | O servidor (Node.js + Express). Fala com o Supabase e o Asaas. |
| `server/lib/dinheiro.js` | Regras de dinheiro: taxa de 15%, divisão 50/50 e conversão KN → R$. |
| `public/` | O que aparece no navegador: páginas, estilos, logo e textos nos 4 idiomas. |
| `supabase/migrations/` | Estrutura do banco de dados (tabelas e regras de acesso). |
| `tests/` | Testes automáticos. |
| `docs/` | Plano e documentação. |
| `kennismarket-prototipo.html` | Protótipo original, só como referência visual. |
