require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { login, SECRET } = require('./auth');
const routes = require('./routes');

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

io.on('connection', (socket) => {
  socket.join(`usuario-${socket.usuario.id}`);
  socket.on('entrar-ficha', (personagemId) => socket.join(`personagem-${personagemId}`));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Servidor Skyfall rodando na porta ${PORT}`));
