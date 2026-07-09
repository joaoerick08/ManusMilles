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
  p.talentos = db.prepare('SELECT * FROM talentos WHERE personagem_id = ? ORDER BY ordem ASC, id ASC').all(id);
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
const CAMPOS_TALENTO = ['nome','trilha','tipo','execucao','custo','alcance','alvo','duracao','ataque','descritores','acerto','erro','efeito','especial','descricao','camada','ordem'];

function emitirFicha(req, personagemId) {
  const atualizado = personagemCompleto(personagemId);
  if (atualizado) req.io.to(`personagem-${personagemId}`).emit('ficha-atualizada', atualizado);
}

router.post('/personagens/:id/talentos', (req, res) => {
  if (!('ordem' in req.body)) {
    const max = db.prepare('SELECT COALESCE(MAX(ordem), -1) AS m FROM talentos WHERE personagem_id = ?').get(req.params.id);
    req.body.ordem = max.m + 1;
  }
  const valores = CAMPOS_TALENTO.map(c => req.body[c] ?? null);
  const info = db.prepare(`INSERT INTO talentos (personagem_id, ${CAMPOS_TALENTO.join(', ')})
    VALUES (?, ${CAMPOS_TALENTO.map(() => '?').join(', ')})`).run(req.params.id, ...valores);
  emitirFicha(req, req.params.id);
  res.json({ id: info.lastInsertRowid });
});

router.put('/talentos/:id', (req, res) => {
  const talento = db.prepare('SELECT personagem_id FROM talentos WHERE id = ?').get(req.params.id);
  const sets = []; const valores = [];
  for (const c of CAMPOS_TALENTO) if (c in req.body) { sets.push(`${c} = ?`); valores.push(req.body[c]); }
  if (sets.length) { valores.push(req.params.id); db.prepare(`UPDATE talentos SET ${sets.join(', ')} WHERE id = ?`).run(...valores); }
  if (talento) emitirFicha(req, talento.personagem_id);
  res.json({ ok: true });
});

router.delete('/talentos/:id', (req, res) => {
  const talento = db.prepare('SELECT personagem_id FROM talentos WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM talentos WHERE id = ?').run(req.params.id);
  if (talento) emitirFicha(req, talento.personagem_id);
  res.json({ ok: true });
});

// ---------- INVENTÁRIO ----------
router.post('/personagens/:id/inventario', (req, res) => {
  const { nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes } = req.body;
  const info = db.prepare(`INSERT INTO inventario (personagem_id, nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes)
    VALUES (?,?,?,?,?,?,?)`).run(req.params.id, nome, descritores, volume || 0, fragmentos_arcanos || 0, quantidade || 1, observacoes);
  emitirFicha(req, req.params.id);
  res.json({ id: info.lastInsertRowid });
});

router.put('/inventario/:id', (req, res) => {
  const item = db.prepare('SELECT personagem_id FROM inventario WHERE id = ?').get(req.params.id);
  const campos = ['nome','descritores','volume','fragmentos_arcanos','quantidade','observacoes'];
  const sets = []; const valores = [];
  for (const c of campos) if (c in req.body) { sets.push(`${c} = ?`); valores.push(req.body[c]); }
  if (sets.length) { valores.push(req.params.id); db.prepare(`UPDATE inventario SET ${sets.join(', ')} WHERE id = ?`).run(...valores); }
  if (item) emitirFicha(req, item.personagem_id);
  res.json({ ok: true });
});

router.delete('/inventario/:id', (req, res) => {
  const item = db.prepare('SELECT personagem_id FROM inventario WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM inventario WHERE id = ?').run(req.params.id);
  if (item) emitirFicha(req, item.personagem_id);
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

// ---------- TROCA DE SENHA ----------
router.put('/minha-senha', (req, res) => {
  const { senha_atual, senha_nova } = req.body;
  if (!senha_atual || !senha_nova) return res.status(400).json({ erro: 'Preencha a senha atual e a nova' });
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!bcrypt.compareSync(senha_atual, usuario.senha_hash)) return res.status(401).json({ erro: 'Senha atual incorreta' });
  const hash = bcrypt.hashSync(senha_nova, 10);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, req.usuario.id);
  res.json({ ok: true });
});

// ---------- EXPORTAR FICHA EM PDF ----------
router.get('/personagens/:id/pdf', (req, res) => {
  const p = personagemCompleto(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${(p.nome || 'ficha').replace(/[^a-z0-9]/gi, '_')}.pdf"`);
  doc.pipe(res);

  const cor = '#5a2a63';
  doc.fontSize(22).fillColor(cor).text(p.nome || 'Personagem', { align: 'left' });
  doc.fontSize(11).fillColor('#333')
    .text(`Nível ${p.nivel || 0}  ·  Legado: ${p.legado || '-'}  ·  Herança: ${p.heranca || '-'}`);
  doc.text(`Antecedente: ${p.antecedente || '-'}   Maldição: ${p.maldicao || '-'}`);
  doc.moveDown();

  doc.fontSize(14).fillColor(cor).text('Atributos e Proteções');
  doc.fontSize(10).fillColor('#333');
  const bonus = p.bonus_proficiencia ?? 2;
  const nomesAtr = { forca: 'Força', destreza: 'Destreza', constituicao: 'Constituição', inteligencia: 'Inteligência', sabedoria: 'Sabedoria', carisma: 'Carisma' };
  for (const chave of Object.keys(nomesAtr)) {
    const valor = p.atributos?.[chave] ?? 0;
    const treinado = !!p.protecoes?.[chave];
    const protecao = 10 + valor + (treinado ? bonus : 0);
    doc.text(`${nomesAtr[chave]}: ${valor}   |   Proteção: ${protecao}${treinado ? ' (treinado)' : ''}`);
  }
  doc.moveDown();

  doc.fontSize(14).fillColor(cor).text('Pontos de Vida e Recursos');
  doc.fontSize(10).fillColor('#333');
  doc.text(`PV: ${p.pv_atual}/${p.pv_max} (temp: ${p.pv_temp || 0})   Dados de vida: ${p.dados_vida_usados}/${p.dados_vida_total}`);
  doc.text(`Catarse: ${p.catarse_atual}/${p.catarse_total}   Ênfase: ${p.enfase_atual}/${p.enfase_total}`);
  doc.text(`Deslocamento: ${p.deslocamento || '-'}   Redução de dano: ${p.reducao_dano || 0}   Iniciativa: ${p.iniciativa_bonus || 0}`);
  doc.moveDown();

  if (p.pericias?.length) {
    doc.fontSize(14).fillColor(cor).text('Perícias');
    doc.fontSize(10).fillColor('#333');
    p.pericias.forEach(per => doc.text(`${per.nome || '-'}: ${per.total ?? 0}${per.proficiente ? ' (treinado)' : ''}`));
    doc.moveDown();
  }

  if (p.ataques?.length) {
    doc.fontSize(14).fillColor(cor).text('Ataques');
    doc.fontSize(10).fillColor('#333');
    p.ataques.forEach(a => doc.text(`${a.nome || '-'} · Teste: ${a.teste || '-'} · Dano: ${a.dano || '-'} · Crítico: ${a.critico || '-'} · Tipo: ${a.tipo || '-'}`));
    doc.moveDown();
  }

  if (p.talentos?.length) {
    doc.fontSize(14).fillColor(cor).text('Talentos, Habilidades e Magias');
    p.talentos.forEach(t => {
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor(cor).text(`${t.nome}${t.custo ? '  (' + t.custo + ')' : ''}`);
      doc.fontSize(9).fillColor('#333');
      const linha1 = [t.trilha, t.tipo, t.execucao].filter(Boolean).join(' · ');
      if (linha1) doc.text(linha1);
      const linha2 = [t.alcance && `Alcance: ${t.alcance}`, t.alvo && `Alvo: ${t.alvo}`, t.duracao && `Duração: ${t.duracao}`].filter(Boolean).join('   ');
      if (linha2) doc.text(linha2);
      if (t.acerto) doc.text(`Acerto: ${t.acerto}`);
      if (t.erro) doc.text(`Erro: ${t.erro}`);
      if (t.efeito) doc.text(`Efeito: ${t.efeito}`);
      if (t.especial) doc.text(`Especial: ${t.especial}`);
      if (t.descricao) doc.text(t.descricao, { oblique: true });
    });
    doc.moveDown();
  }

  if (p.inventario?.length) {
    doc.fontSize(14).fillColor(cor).text('Inventário');
    doc.fontSize(10).fillColor('#333');
    p.inventario.forEach(i => doc.text(`${i.nome}${i.quantidade > 1 ? ` x${i.quantidade}` : ''} · Volume: ${i.volume || 0} ${i.descritores ? '· ' + i.descritores : ''}`));
  }

  doc.end();
});

module.exports = router;
