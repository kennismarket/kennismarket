# Publicar a versão de testes no Render

Tudo aqui usa o **sandbox do Asaas** (dinheiro de mentira). Faça na ordem.

## 1. Supabase: criar as tabelas

1. Entre no seu projeto em supabase.com.
2. Menu da esquerda → **SQL Editor** → **New query**.
3. Abra o arquivo `supabase/migrations/0001_inicial.sql` aqui do GitHub, copie tudo e cole.
4. Clique em **Run**. Deve aparecer "Success".

Só rode esse arquivo **uma vez**. Se rodar de novo, ele dá erro dizendo que as tabelas já existem (não estraga nada).

## 2. Asaas sandbox: pegar a chave

1. Crie uma conta em https://sandbox.asaas.com (é separada da conta real).
2. **Integrações → Chave de API** → gere e copie. Guarde para o passo 3.

## 3. Render: criar o site

1. Crie uma conta em https://render.com entrando com o GitHub.
2. **New → Blueprint** → escolha o repositório `kennismarket`.
3. O Render lê o arquivo `render.yaml` e pede os valores que não ficam no GitHub:

| Nome | O que colocar |
|---|---|
| `SUPABASE_URL` | Supabase → botão **Connect** (ou Project Settings → Data API) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret keys (`sb_secret_...`) |
| `ASAAS_API_KEY` | A chave do passo 2 |

`ASAAS_WEBHOOK_TOKEN` e `TAREFAS_TOKEN` o Render inventa sozinho. Você vai precisar copiá-los nos passos 4 e 5:
no Render, abra o serviço → **Environment** → clique no olho ao lado de cada um.

4. Clique em **Apply**. Quando terminar, o Render mostra o endereço, tipo `https://kennismarket.onrender.com`.
5. Abra `https://SEU-ENDERECO/api/saude`. Deve mostrar `"conexao":{"ok":true}`.

## 4. Asaas: avisos de pagamento (webhook)

No sandbox do Asaas → **Integrações → Webhooks → Adicionar**:

- **URL:** `https://SEU-ENDERECO/api/webhooks/asaas`
- **Token de autenticação:** o valor de `ASAAS_WEBHOOK_TOKEN` do Render
- **Eventos:** marque **Cobranças** e **Transferências**
- Deixe a fila ativa.

## 5. GitHub: tarefas agendadas

No GitHub, repositório `kennismarket` → **Settings → Secrets and variables → Actions**:

- Aba **Variables** → **New repository variable**: nome `SITE_URL`, valor `https://SEU-ENDERECO`
- Aba **Secrets** → **New repository secret**: nome `TAREFAS_TOKEN`, valor igual ao `TAREFAS_TOKEN` do Render

Para testar na hora: aba **Actions** → **Tarefas agendadas** → **Run workflow** → escolha `cotacoes` → **Run**.
Deve terminar com o check verde. Depois, abra `https://SEU-ENDERECO/api/cotacoes`: aparecem as cotações do dia.

As tarefas só rodam sozinhas depois que este código estiver na branch principal (`main`).

## Limites do plano grátis do Render (normais para teste)

- O site **dorme depois de 15 minutos** sem visitas. A primeira visita depois disso demora **cerca de 1 minuto**.
- Avisos do Asaas que chegam com o site dormindo podem falhar na primeira tentativa; o Asaas tenta de novo sozinho.
  Se muitos falharem seguidos, o Asaas **pausa a fila de avisos**: confira em Integrações → Webhooks e reative se precisar.
- A tarefa de hora em hora acorda o site a cada hora; isso cabe nas horas grátis do mês.
