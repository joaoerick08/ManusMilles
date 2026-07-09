# Manus Milles — Fichas de Skyfall RPG

Site pra sua mesa de Skyfall: cada player vê a própria ficha (atributos, PV, pontos de
sombra, catarse/ênfase, talentos e inventário), e você, como mestre, tem um painel pra
gerenciar todas as fichas e mostrar imagens pra todos ou só pra um player específico,
em tempo real.

## Estrutura

```
skyfall-app/
  backend/     -> API (Node/Express + Socket.io + PostgreSQL)
  frontend/    -> Site (React/Vite)
```

## Banco de dados (Supabase, gratuito e persistente)

1. Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto (gratuito)
2. No painel do projeto, vá em **Project Settings → Database → Connection string**
   e copie a URI no formato `postgresql://postgres:[SUA-SENHA]@...`
3. Copie o arquivo `backend/.env.example` pra `backend/.env` e cole essa URL em
   `DATABASE_URL`

> ⚠️ Se o projeto do Supabase ficar **7 dias sem nenhum acesso**, ele pausa sozinho
> (não perde nada, só precisa entrar no painel do Supabase e clicar em "reativar"
> antes de usar de novo). É bem diferente de perder os dados — é só uma pausa.

## Armazenamento de imagens (avatares e imagens transmitidas)

Usa o mesmo projeto do Supabase acima, pelo recurso de Storage (arquivos), que também
é gratuito e não depende do disco do Render (que é temporário).

1. No painel do Supabase, vá em **Project Settings → API**
2. Copie a **Project URL** → cole em `SUPABASE_URL` no `.env`
3. Copie a **service_role key** (não é a `anon` key — precisa ser a `service_role`,
   que tem permissão de criar arquivos) → cole em `SUPABASE_SERVICE_KEY` no `.env`
4. Não precisa criar o bucket manualmente — o servidor cria sozinho na primeira vez
   que rodar (`bucket "uploads"` público)

## Rodando localmente (pra testar)

Abra dois terminais.

**Terminal 1 — backend:**
```bash
cd backend
npm install
node src/server.js
```
Na primeira vez ele cria as tabelas no banco e um usuário mestre padrão:
- login: `mestre`
- senha: `mestre123`

**Troque essa senha assim que possível** (tem uma tela de "Trocar senha" no topo do
site depois de logar).

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
npm run dev
```
Abra o link que aparecer (geralmente `http://localhost:5173`).

> O frontend já vem com um arquivo `.env` apontando pra
> `VITE_API_URL=http://localhost:3001` (o backend rodando localmente). Isso faz o
> site falar direto com o backend, sem depender do proxy de desenvolvimento do Vite
> (que causava erro de rede em uploads de imagem/vídeo). Quando for colocar no ar,
> troque esse valor pra URL pública do backend hospedado.

## Como usar

1. Entre como mestre (`mestre` / `mestre123`).
2. Na aba **Jogadores**, crie um login e senha pra cada um dos 6 players. Isso já cria
   a ficha em branco de cada um automaticamente.
3. Na aba **Fichas**, clique no nome de um player pra abrir e preencher a ficha dele
   (atributos, PV, talentos, inventário — tudo editável ali mesmo, salva sozinho).
4. Na aba **Transmitir**, escolha "Todos" ou um player específico e mande uma imagem
   (upload de arquivo ou uma URL). Ela aparece na hora, em tela cheia, pro(s)
   destinatário(s) — sem precisar dar refresh.
5. Cada player entra com o próprio login e só vê a ficha dele.

## Colocando no ar de graça no Render

Você vai criar **dois serviços** no Render: um pro backend (API) e um pro frontend (site).
Antes de tudo, seu código precisa estar num repositório do GitHub, e você precisa já
ter criado o banco no Supabase (seção acima) com a `DATABASE_URL` em mãos.

> ℹ️ Com o banco no Supabase e as imagens também no Supabase Storage, nada mais
> depende do disco do Render — fichas, avatares e imagens transmitidas ficam seguros
> mesmo quando o backend reinicia ou "dorme" por inatividade.

### 1. Backend (API)

1. Entre em [render.com](https://render.com) e crie uma conta (dá pra usar login do GitHub)
2. Clique em **New +** → **Web Service**
3. Conecte seu repositório do GitHub
4. Preencha:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Instance Type:** Free
5. Antes de criar, adicione as **Environment Variables**:
   - **Key:** `DATABASE_URL` → **Value:** a connection string do Supabase
   - **Key:** `JWT_SECRET` → **Value:** qualquer texto aleatório grande (ex: gere um em [randomkeygen.com](https://randomkeygen.com))
   - **Key:** `SUPABASE_URL` → **Value:** a Project URL do Supabase
   - **Key:** `SUPABASE_SERVICE_KEY` → **Value:** a service_role key do Supabase
6. Clique em **Create Web Service** e espere o deploy terminar
7. Copie a URL que o Render gerou (algo como `https://manus-milles-api.onrender.com`)

### 2. Frontend (site)

1. No Render, clique em **New +** → **Static Site**
2. Conecte o mesmo repositório
3. Preencha:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Antes de criar, adicione uma **Environment Variable**:
   - **Key:** `VITE_API_URL`
   - **Value:** a URL do backend que você copiou no passo anterior (sem barra no final)
5. Clique em **Create Static Site**

Pronto — depois do deploy, o link do site (frontend) é o que você compartilha com os
6 players. Cada vez que você mudar o código e quiser atualizar o site no ar, é só dar
push no GitHub que o Render redesenha sozinho.

### Detalhe sobre o plano free

O backend free do Render "dorme" depois de alguns minutos sem uso, e demora uns 30-60
segundos pra acordar na primeira requisição depois disso — é normal, só avise os
players que a primeira ficha pode demorar um pouco pra carregar no começo da sessão.
O banco no Supabase, separadamente, pausa depois de 7 dias sem acesso — se isso
acontecer, entre no painel do Supabase e clique em "reativar" antes da próxima sessão.

## Próximos passos possíveis

Me chama quando quiser evoluir qualquer parte do site.
