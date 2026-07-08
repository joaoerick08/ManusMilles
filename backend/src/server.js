require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { login, SECRET } = require('./auth');
const routes = require('./routes');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// injeta io em toda requisição pra rotas poderem emitir eventos
app.use((req, res, next) => { req.io = io; next(); });

app.post('/api/login', login);
app.use('/api', routes);

// Tratamento de erros (ex: multer - arquivo grande demais, tipo inválido, etc.)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ erro: err.message || 'Erro ao processar a requisição' });
});

// Socket.io: cada cliente entra em salas conforme usuário/personagem
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

  // ---- rolagem de dados (visível pra mesa toda) ----
  socket.on('rolar-dado', (dados) => {
    io.emit('dado-rolado', { ...dados, jogador: socket.usuario.nome, quando: Date.now() });
  });

  // ---- jogo do Maxuel ----
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

  socket.on('gato-encontrado', ({ id }) => {
    if (!gatoAtivo || gatoAtivo.id !== id) return;
    const enfaseValor = gatoAtivo.enfaseValor;
    gatoAtivo = null;
    const personagem = db.prepare('SELECT * FROM personagens WHERE usuario_id = ?').get(socket.usuario.id);
    if (personagem) {
      db.prepare('UPDATE personagens SET enfase_atual = enfase_atual + ? WHERE id = ?').run(enfaseValor, personagem.id);
      const atualizado = db.prepare('SELECT * FROM personagens WHERE id = ?').get(personagem.id);
      io.to(`personagem-${personagem.id}`).emit('ficha-atualizada-parcial', { enfase_atual: atualizado.enfase_atual });
    }
    io.emit('gato-capturado', { vencedor: socket.usuario.nome, enfaseValor });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Servidor Skyfall rodando na porta ${PORT}`));
