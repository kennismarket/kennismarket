# Publicar a versão de testes no Render

Por enquanto os pagamentos são **simulados** (`PAYMENT_PROVIDER=simulado`): nenhum dinheiro de verdade.
A Transfeera entra quando chegar a documentação da API (veja "Transfeera" no fim). Faça na ordem.

## 1. Supabase: as tabelas são criadas sozinhas

O Supabase está ligado ao GitHub com a opção **Deploy to production**. Toda vez que algo entra na `main`,
ele aplica sozinho os arquivos novos da pasta `supabase/migrations`.

**Não rode esses arquivos na mão no SQL Editor.** Se rodar, o Supabase não fica sabendo que já foram
aplicados, tenta de novo, dá erro e trava as próximas mudanças do banco.

Para conferir se as tabelas existem: Supabase → **Table Editor**. Devem aparecer `pedidos`, `cotacoes`, `lojas` e as outras.
Se algo der errado na aplicação automática, aparece um **X vermelho** "Supabase Preview" no commit, na página do GitHub.

## 2. Render: criar o site

1. Crie uma conta em https://render.com entrando com o GitHub.
2. **New → Blueprint** → escolha o repositório `kennismarket`.
3. O Render lê o arquivo `render.yaml` e pede os valores que não ficam no GitHub:

| Nome | O que colocar |
|---|---|
| `SUPABASE_URL` | Supabase → botão **Connect** (ou Project Settings → Data API) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret keys (`sb_secret_...`) |
| `TRANSFEERA_CLIENT_ID`, `TRANSFEERA_CLIENT_SECRET`, `TRANSFEERA_WEBHOOK_SECRET` | **Deixe em branco por enquanto** (nomes provisórios, até chegar a documentação) |

`PAYMENT_PROVIDER` (`simulado`), `PAYMENT_CARD_ENABLED` (`false`) e `TRANSFEERA_AMBIENTE` (`sandbox`) já vêm preenchidos.
`TAREFAS_TOKEN` o Render inventa sozinho. Você vai precisar copiá-lo no passo 3:
no Render, abra o serviço → **Environment** → clique no olho ao lado dele.

4. Clique em **Apply**. Quando terminar, o Render mostra o endereço, tipo `https://kennismarket.onrender.com`.
5. Abra `https://SEU-ENDERECO/api/saude`. Deve mostrar `"conexao":{"ok":true}` e `"provedor":"simulado"`.
6. Abra `https://SEU-ENDERECO/teste/pagamentos` e siga os botões, de cima para baixo, para testar o fluxo de pagamento inteiro.

## 3. GitHub: tarefa agendada

No GitHub, repositório `kennismarket` → **Settings → Secrets and variables → Actions**:

- Aba **Variables** → **New repository variable**: nome `SITE_URL`, valor `https://SEU-ENDERECO`
- Aba **Secrets** → **New repository secret**: nome `TAREFAS_TOKEN`, valor igual ao `TAREFAS_TOKEN` do Render

Para testar na hora: aba **Actions** → **Tarefas agendadas** → **Run workflow** → escolha `cotacoes` → **Run**.
Deve terminar com o check verde. Depois, abra `https://SEU-ENDERECO/api/cotacoes`: aparecem as cotações do dia.

A tarefa só roda sozinha a partir da branch principal (`main`).

## Limites do plano grátis do Render (normais para teste)

- O site **dorme depois de 15 minutos** sem visitas. A primeira visita depois disso demora **cerca de 1 minuto**.
- Avisos de pagamento que chegam com o site dormindo podem falhar na primeira tentativa; o banco costuma tentar de novo
  (confirmar como a Transfeera faz isso quando chegar a documentação).
- Com o provedor simulado, as cobranças ficam na memória do servidor: se ele dormir no meio de um teste,
  comece de novo pelo botão "Preparar".

## Transfeera (quando chegar a documentação)

1. Eu implemento o provedor da Transfeera e ajusto o cadastro do vendedor.
2. No Render → **Environment**: preencha as credenciais `TRANSFEERA_*` (sandbox) e troque `PAYMENT_PROVIDER` para `transfeera`.
3. No painel da Transfeera, cadastre o aviso de pagamento (webhook) com o endereço `https://SEU-ENDERECO/api/webhooks/pagamento`.
4. `TRANSFEERA_AMBIENTE=producao` só com autorização dos donos (dinheiro de verdade).

Com `PAYMENT_PROVIDER=transfeera`, a página de teste some e as contas de teste param de funcionar.
