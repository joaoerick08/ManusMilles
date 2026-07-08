const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'skyfall-dev-secret-troque-em-producao';

function login(req, res) {
  const { login, senha } = req.body;
  const usuario = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
  if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
    return res.status(401).json({ erro: 'Login ou senha inválidos' });
  }
  const token = jwt.sign(
    { id: usuario.id, nome: usuario.nome, papel: usuario.papel },
    SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel } });
}

function autenticar(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ erro: 'Token ausente' });
  try {
    const token = header.split(' ')[1];
    req.usuario = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

function apenasMestre(req, res, next) {
  if (req.usuario.papel !== 'mestre') return res.status(403).json({ erro: 'Apenas o mestre pode fazer isso' });
  next();
}

module.exports = { login, autenticar, apenasMestre, SECRET };
