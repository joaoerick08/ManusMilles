const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { autenticar, apenasMestre } = require('./auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
  }),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB, dá espaço pra vídeos curtos
});

router.use('/uploads', express.static(uploadDir));
router.use(autenticar);

// ---------- USUÁRIOS (players) - só o mestre gerencia ----------
router.get('/usuarios', apenasMestre, (req, res) => {
  const usuarios = db.prepare("SELECT id, nome, login, papel FROM usuarios WHERE papel = 'player'").all();
  res.json(usuarios);
});

router.post('/usuarios', apenasMestre, (req, res) => {
  const { nome, login, senha } = req.body;
  if (!nome || !login || !senha) return res.status(400).json({ erro: 'Preencha nome, login e senha' });
  const hash = bcrypt.hashSync(senha, 10);
  try {
    const info = db.prepare("INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES (?, ?, ?, 'player')")
      .run(nome, login, hash);
    db.prepare('INSERT INTO personagens (usuario_id, nome) VALUES (?, ?)').run(info.lastInsertRowid, nome);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ erro: 'Login já existe' });
  }
});

router.delete('/usuarios/:id', apenasMestre, (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- PERSONAGENS ----------
function personagemCompleto(id) {
  const p = db.prepare('SELECT * FROM personagens WHERE id = ?').get(id);
  if (!p) return null;
  const jsonFields = ['atributos', 'protecoes', 'pontos_sombra', 'testes_morte', 'pericias', 'idiomas', 'ataques'];
  jsonFields.forEach(f => { try { p[f] = JSON.parse(p[f]); } catch { /* mantém string */ } });
  p.talentos = db.prepare('SELECT * FROM talentos WHERE personagem_id = ?').all(id);
  p.inventario = db.prepare('SELECT * FROM inventario WHERE personagem_id = ?').all(id);
  return p;
}

// Mestre vê todos; player vê só o seu
router.get('/personagens', (req, res) => {
  let ids;
  if (req.usuario.papel === 'mestre') {
    ids = db.prepare('SELECT id FROM personagens').all().map(r => r.id);
  } else {
    ids = db.prepare('SELECT id FROM personagens WHERE usuario_id = ?').all(req.usuario.id).map(r => r.id);
  }
  res.json(ids.map(personagemCompleto));
});

router.get('/personagens/:id', (req, res) => {
  const p = personagemCompleto(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  res.json(p);
});

const CAMPOS_EDITAVEIS = [
  'nome','jogadore','pronomes','legado','heranca','antecedente','maldicao','nivel',
  'bonus_proficiencia','foto_url','atributos','protecoes','pv_max','pv_atual','pv_temp',
  'dados_vida_total','dados_vida_usados','pontos_sombra','testes_morte','catarse_atual',
  'catarse_total','enfase_atual','enfase_total','deslocamento','tamanho','reducao_dano',
  'iniciativa_bonus','pericias','idiomas','ataques'
];

router.put('/personagens/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM personagens WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  const sets = [];
  const valores = [];
  for (const campo of CAMPOS_EDITAVEIS) {
    if (campo in req.body) {
      let v = req.body[campo];
      if (typeof v === 'object') v = JSON.stringify(v);
      sets.push(`${campo} = ?`);
      valores.push(v);
    }
  }
  if (sets.length === 0) return res.json(personagemCompleto(req.params.id));
  sets.push("atualizado_em = CURRENT_TIMESTAMP");
  valores.push(req.params.id);
  db.prepare(`UPDATE personagens SET ${sets.join(', ')} WHERE id = ?`).run(...valores);
  const atualizado = personagemCompleto(req.params.id);
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', atualizado);
  res.json(atualizado);
});

// ---------- TALENTOS (habilidades/magias) ----------
const CAMPOS_TALENTO = ['nome','trilha','tipo','execucao','custo','alcance','alvo','duracao','ataque','descritores','acerto','erro','efeito','especial','descricao','camada'];

router.post('/personagens/:id/talentos', (req, res) => {
  const valores = CAMPOS_TALENTO.map(c => req.body[c] ?? null);
  const info = db.prepare(`INSERT INTO talentos (personagem_id, ${CAMPOS_TALENTO.join(', ')})
    VALUES (?, ${CAMPOS_TALENTO.map(() => '?').join(', ')})`).run(req.params.id, ...valores);
  res.json({ id: info.lastInsertRowid });
});

router.put('/talentos/:id', (req, res) => {
  const sets = []; const valores = [];
  for (const c of CAMPOS_TALENTO) if (c in req.body) { sets.push(`${c} = ?`); valores.push(req.body[c]); }
  if (sets.length) { valores.push(req.params.id); db.prepare(`UPDATE talentos SET ${sets.join(', ')} WHERE id = ?`).run(...valores); }
  res.json({ ok: true });
});

router.delete('/talentos/:id', (req, res) => {
  db.prepare('DELETE FROM talentos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- INVENTÁRIO ----------
router.post('/personagens/:id/inventario', (req, res) => {
  const { nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes } = req.body;
  const info = db.prepare(`INSERT INTO inventario (personagem_id, nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes)
    VALUES (?,?,?,?,?,?,?)`).run(req.params.id, nome, descritores, volume || 0, fragmentos_arcanos || 0, quantidade || 1, observacoes);
  res.json({ id: info.lastInsertRowid });
});

router.put('/inventario/:id', (req, res) => {
  const campos = ['nome','descritores','volume','fragmentos_arcanos','quantidade','observacoes'];
  const sets = []; const valores = [];
  for (const c of campos) if (c in req.body) { sets.push(`${c} = ?`); valores.push(req.body[c]); }
  if (sets.length) { valores.push(req.params.id); db.prepare(`UPDATE inventario SET ${sets.join(', ')} WHERE id = ?`).run(...valores); }
  res.json({ ok: true });
});

router.delete('/inventario/:id', (req, res) => {
  db.prepare('DELETE FROM inventario WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- BROADCAST (mostrar imagem pra todos ou um player) ----------
router.post('/broadcast', apenasMestre, upload.single('imagem'), (req, res) => {
  const destino = req.body.destino || 'todos'; // 'todos' ou usuario_id
  let url;
  if (req.file) {
    url = `/api/uploads/${req.file.filename}`;
  } else if (req.body.url) {
    url = req.body.url;
  } else {
    return res.status(400).json({ erro: 'Envie uma imagem ou uma url' });
  }
  db.prepare('INSERT INTO broadcasts (url, destino) VALUES (?, ?)').run(url, destino);
  if (destino === 'todos') {
    req.io.emit('mostrar-imagem', { url });
  } else {
    req.io.to(`usuario-${destino}`).emit('mostrar-imagem', { url });
  }
  res.json({ ok: true, url });
});

router.post('/broadcast/limpar', apenasMestre, (req, res) => {
  const destino = req.body.destino || 'todos';
  if (destino === 'todos') req.io.emit('limpar-imagem');
  else req.io.to(`usuario-${destino}`).emit('limpar-imagem');
  res.json({ ok: true });
});

// ---------- AVATAR ----------
router.post('/personagens/:id/avatar', upload.single('avatar'), (req, res) => {
  const p = db.prepare('SELECT * FROM personagens WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  if (!req.file) return res.status(400).json({ erro: 'Envie uma imagem' });
  const url = `/api/uploads/${req.file.filename}`;
  db.prepare('UPDATE personagens SET foto_url = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(url, req.params.id);
  const atualizado = personagemCompleto(req.params.id);
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', atualizado);
  res.json(atualizado);
});

// ---------- INVOCAR A SOMBRA (mestre manda um "acordo sombrio" pra um player específico) ----------
router.post('/invocar-sombra', apenasMestre, (req, res) => {
  const { usuario_id } = req.body;
  if (!usuario_id) return res.status(400).json({ erro: 'Escolha um jogador' });
  req.io.to(`usuario-${usuario_id}`).emit('invocar-sombra');
  res.json({ ok: true });
});

module.exports = router;
