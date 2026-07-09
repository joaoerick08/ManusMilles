require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { login, SECRET } = require('./auth');
const routes = require('./routes');
const { pool, pronto } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

app.use((req, res, next) => { req.io = io; next(); });

app.post('/api/login', login);
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ erro: err.message || 'Erro ao processar a requisição' });
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    socket.usuario = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    next(new Error('Não autorizado'));
  }
});

let gatoAtivo = null; // { id, x, y, enfaseValor }

io.on('connection', (socket) => {
  socket.join(`usuario-${socket.usuario.id}`);
  socket.on('entrar-ficha', (personagemId) => socket.join(`personagem-${personagemId}`));

  socket.on('rolar-dado', (dados) => {
    io.emit('dado-rolado', { ...dados, jogador: socket.usuario.nome, quando: Date.now() });
  });

  socket.on('soltar-gato', ({ enfaseValor }) => {
    if (socket.usuario.papel !== 'mestre') return;
    gatoAtivo = {
      id: Date.now(),
      x: Math.random() * 85 + 5,
      y: Math.random() * 75 + 12,
      enfaseValor: enfaseValor || 1,
    };
    io.emit('gato-solto', gatoAtivo);
  });

  socket.on('gato-encontrado', async ({ id }) => {
    if (!gatoAtivo || gatoAtivo.id !== id) return;
    const catarseValor = gatoAtivo.enfaseValor;
    gatoAtivo = null;
    try {
      const { rows } = await pool.query('SELECT * FROM personagens WHERE usuario_id = $1', [socket.usuario.id]);
      const personagem = rows[0];
      if (personagem) {
        const atualizado = await pool.query(
          'UPDATE personagens SET catarse_atual = catarse_atual + $1 WHERE id = $2 RETURNING catarse_atual',
          [catarseValor, personagem.id]
        );
        io.to(`personagem-${personagem.id}`).emit('ficha-atualizada-parcial', { catarse_atual: atualizado.rows[0].catarse_atual });
      }
    } catch (err) {
      console.error('Erro ao creditar catarse do Maxuel:', err);
    }
    io.emit('gato-capturado', { vencedor: socket.usuario.nome, enfaseValor: catarseValor });
  });
});

const PORT = process.env.PORT || 3001;

pronto.then(() => {
  server.listen(PORT, () => console.log(`Servidor Skyfall rodando na porta ${PORT}`));
}).catch((err) => {
  console.error('Não foi possível iniciar o servidor (erro no banco de dados):', err);
  process.exit(1);
});
