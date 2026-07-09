const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('./db');
const { autenticar, apenasMestre } = require('./auth');
const { PDFDocument } = require('pdf-lib');
const fieldMap = require('./pdfFieldMap.json');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
});
const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use('/uploads', express.static(uploadDir));
router.use(autenticar);

// ---------- USUÁRIOS (players) ----------
router.get('/usuarios', apenasMestre, async (req, res) => {
  const { rows } = await pool.query("SELECT id, nome, login, papel FROM usuarios WHERE papel = 'player'");
  res.json(rows);
});

router.post('/usuarios', apenasMestre, async (req, res) => {
  const { nome, login, senha } = req.body;
  if (!nome || !login || !senha) return res.status(400).json({ erro: 'Preencha nome, login e senha' });
  const hash = bcrypt.hashSync(senha, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'player') RETURNING id",
      [nome, login, hash]
    );
    await pool.query('INSERT INTO personagens (usuario_id, nome) VALUES ($1, $2)', [rows[0].id, nome]);
    res.json({ id: rows[0].id });
  } catch (e) {
    res.status(400).json({ erro: 'Login já existe' });
  }
});

router.delete('/usuarios/:id', apenasMestre, async (req, res) => {
  await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---------- PERSONAGENS ----------
async function personagemCompleto(id) {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [id]);
  const p = rows[0];
  if (!p) return null;
  const talentos = await pool.query('SELECT * FROM talentos WHERE personagem_id = $1 ORDER BY ordem ASC, id ASC', [id]);
  const inventario = await pool.query('SELECT * FROM inventario WHERE personagem_id = $1', [id]);
  p.talentos = talentos.rows;
  p.inventario = inventario.rows;
  return p;
}

router.get('/personagens', async (req, res) => {
  let ids;
  if (req.usuario.papel === 'mestre') {
    const { rows } = await pool.query('SELECT id FROM personagens');
    ids = rows.map(r => r.id);
  } else {
    const { rows } = await pool.query('SELECT id FROM personagens WHERE usuario_id = $1', [req.usuario.id]);
    ids = rows.map(r => r.id);
  }
  res.json(await Promise.all(ids.map(personagemCompleto)));
});

router.get('/personagens/:id', async (req, res) => {
  const p = await personagemCompleto(req.params.id);
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

router.put('/personagens/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  const sets = []; const valores = [];
  let i = 1;
  for (const campo of CAMPOS_EDITAVEIS) {
    if (campo in req.body) {
      sets.push(`${campo} = $${i++}`);
      valores.push(req.body[campo]);
    }
  }
  if (sets.length > 0) {
    sets.push('atualizado_em = NOW()');
    valores.push(req.params.id);
    await pool.query(`UPDATE personagens SET ${sets.join(', ')} WHERE id = $${i}`, valores);
  }
  const atualizado = await personagemCompleto(req.params.id);
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', atualizado);
  res.json(atualizado);
});

// ---------- TALENTOS (habilidades/magias) ----------
const CAMPOS_TALENTO = ['nome','trilha','tipo','execucao','custo','alcance','alvo','duracao','ataque','descritores','acerto','erro','efeito','especial','descricao','camada','ordem'];

async function emitirFicha(req, personagemId) {
  const atualizado = await personagemCompleto(personagemId);
  if (atualizado) req.io.to(`personagem-${personagemId}`).emit('ficha-atualizada', atualizado);
}

router.post('/personagens/:id/talentos', async (req, res) => {
  if (!('ordem' in req.body)) {
    const { rows } = await pool.query('SELECT COALESCE(MAX(ordem), -1) AS m FROM talentos WHERE personagem_id = $1', [req.params.id]);
    req.body.ordem = rows[0].m + 1;
  }
  const valores = CAMPOS_TALENTO.map(c => req.body[c] ?? null);
  const placeholders = CAMPOS_TALENTO.map((_, i) => `$${i + 2}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO talentos (personagem_id, ${CAMPOS_TALENTO.join(', ')}) VALUES ($1, ${placeholders}) RETURNING id`,
    [req.params.id, ...valores]
  );
  await emitirFicha(req, req.params.id);
  res.json({ id: rows[0].id });
});

router.put('/talentos/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT personagem_id FROM talentos WHERE id = $1', [req.params.id]);
  const talento = rows[0];
  const sets = []; const valores = [];
  let i = 1;
  for (const c of CAMPOS_TALENTO) if (c in req.body) { sets.push(`${c} = $${i++}`); valores.push(req.body[c]); }
  if (sets.length) {
    valores.push(req.params.id);
    await pool.query(`UPDATE talentos SET ${sets.join(', ')} WHERE id = $${i}`, valores);
  }
  if (talento) await emitirFicha(req, talento.personagem_id);
  res.json({ ok: true });
});

router.delete('/talentos/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT personagem_id FROM talentos WHERE id = $1', [req.params.id]);
  const talento = rows[0];
  await pool.query('DELETE FROM talentos WHERE id = $1', [req.params.id]);
  if (talento) await emitirFicha(req, talento.personagem_id);
  res.json({ ok: true });
});

// ---------- INVENTÁRIO ----------
router.post('/personagens/:id/inventario', async (req, res) => {
  const { nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO inventario (personagem_id, nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [req.params.id, nome, descritores, volume || 0, fragmentos_arcanos || 0, quantidade || 1, observacoes]
  );
  await emitirFicha(req, req.params.id);
  res.json({ id: rows[0].id });
});

router.put('/inventario/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT personagem_id FROM inventario WHERE id = $1', [req.params.id]);
  const item = rows[0];
  const campos = ['nome','descritores','volume','fragmentos_arcanos','quantidade','observacoes'];
  const sets = []; const valores = [];
  let i = 1;
  for (const c of campos) if (c in req.body) { sets.push(`${c} = $${i++}`); valores.push(req.body[c]); }
  if (sets.length) {
    valores.push(req.params.id);
    await pool.query(`UPDATE inventario SET ${sets.join(', ')} WHERE id = $${i}`, valores);
  }
  if (item) await emitirFicha(req, item.personagem_id);
  res.json({ ok: true });
});

router.delete('/inventario/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT personagem_id FROM inventario WHERE id = $1', [req.params.id]);
  const item = rows[0];
  await pool.query('DELETE FROM inventario WHERE id = $1', [req.params.id]);
  if (item) await emitirFicha(req, item.personagem_id);
  res.json({ ok: true });
});

// ---------- AVATAR ----------
router.post('/personagens/:id/avatar', upload.single('avatar'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  if (!req.file) return res.status(400).json({ erro: 'Envie uma imagem' });
  const url = `/api/uploads/${req.file.filename}`;
  await pool.query('UPDATE personagens SET foto_url = $1, atualizado_em = NOW() WHERE id = $2', [url, req.params.id]);
  const atualizado = await personagemCompleto(req.params.id);
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', atualizado);
  res.json(atualizado);
});

// ---------- INVOCAR A SOMBRA ----------
router.post('/invocar-sombra', apenasMestre, (req, res) => {
  const { usuario_id } = req.body;
  if (!usuario_id) return res.status(400).json({ erro: 'Escolha um jogador' });
  req.io.to(`usuario-${usuario_id}`).emit('invocar-sombra');
  res.json({ ok: true });
});

// ---------- BROADCAST (imagem/gif/vídeo) ----------
router.post('/broadcast', apenasMestre, upload.single('imagem'), async (req, res) => {
  const destino = req.body.destino || 'todos';
  let url;
  if (req.file) {
    url = `/api/uploads/${req.file.filename}`;
  } else if (req.body.url) {
    url = req.body.url;
  } else {
    return res.status(400).json({ erro: 'Envie uma imagem ou uma url' });
  }
  await pool.query('INSERT INTO broadcasts (url, destino) VALUES ($1, $2)', [url, destino]);
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

// ---------- TROCA DE SENHA ----------
router.put('/minha-senha', async (req, res) => {
  const { senha_atual, senha_nova } = req.body;
  if (!senha_atual || !senha_nova) return res.status(400).json({ erro: 'Preencha a senha atual e a nova' });
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id]);
  const usuario = rows[0];
  if (!bcrypt.compareSync(senha_atual, usuario.senha_hash)) return res.status(401).json({ erro: 'Senha atual incorreta' });
  const hash = bcrypt.hashSync(senha_nova, 10);
  await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, req.usuario.id]);
  res.json({ ok: true });
});

// ---------- IMPORTAR FICHA DE PDF PREENCHIDO ----------
router.post('/personagens/:id/importar-pdf', uploadMemoria.single('pdf'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo PDF' });

  try {
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const form = pdfDoc.getForm();

    const lerTexto = (nomeCampo) => {
      try {
        const v = form.getTextField(nomeCampo).getText();
        return v ? v.trim() : '';
      } catch { return ''; }
    };
    const lerNumero = (nomeCampo) => {
      const v = lerTexto(nomeCampo);
      if (!v) return null;
      const n = parseFloat(v.replace(',', '.'));
      return isNaN(n) ? null : n;
    };

    const CAMPOS_NUMERICOS = new Set(['iniciativa_bonus','reducao_dano','pv_max','pv_atual','pv_temp',
      'dados_vida_total','dados_vida_usados','bonus_proficiencia','enfase_atual','enfase_total']);

    const atualizacoes = {};
    for (const [campoPdf, campoNosso] of Object.entries(fieldMap.diretos)) {
      if (CAMPOS_NUMERICOS.has(campoNosso)) {
        const n = lerNumero(campoPdf);
        if (n !== null) atualizacoes[campoNosso] = n;
      } else {
        const v = lerTexto(campoPdf);
        if (v) atualizacoes[campoNosso] = v;
      }
    }

    const atributos = { ...(p.atributos || {}) };
    for (const [campoPdf, chave] of Object.entries(fieldMap.atributos)) {
      const n = lerNumero(campoPdf);
      if (n !== null) atributos[chave] = n;
    }
    atualizacoes.atributos = atributos;

    const prof = atualizacoes.bonus_proficiencia ?? p.bonus_proficiencia ?? 2;
    const protecoes = { ...(p.protecoes || {}) };
    for (const [campoPdf, chave] of Object.entries(fieldMap.protecoes)) {
      const protValor = lerNumero(campoPdf);
      if (protValor === null) continue;
      const base = atributos[chave] ?? 0;
      const diferenca = protValor - 10 - base;
      protecoes[chave] = diferenca >= Math.max(1, Math.floor(prof / 2)) ? true : diferenca > 0;
    }
    atualizacoes.protecoes = protecoes;

    const catarseTxt = lerTexto(fieldMap.catarseCampo);
    if (catarseTxt) {
      const partes = catarseTxt.split('/').map(s => parseFloat(s.trim().replace(',', '.')));
      if (partes.length === 2 && !isNaN(partes[0]) && !isNaN(partes[1])) {
        atualizacoes.catarse_atual = partes[0];
        atualizacoes.catarse_total = partes[1];
      } else if (!isNaN(partes[0])) {
        atualizacoes.catarse_atual = partes[0];
      }
    }

    const pericias = [];
    for (const [abrev, nomeCompleto] of Object.entries(fieldMap.pericias)) {
      const total = lerNumero(`${abrev}Tot`);
      const outros = lerTexto(`${abrev}Out`);
      if (total !== null || outros) {
        pericias.push({ nome: nomeCompleto, total: total ?? 0, proficiente: false, outros: outros || undefined });
      }
    }
    if (pericias.length) atualizacoes.pericias = pericias;

    const CAMPOS_VALIDOS = ['nome','pronomes','jogadore','legado','heranca','antecedente','maldicao',
      'iniciativa_bonus','reducao_dano','deslocamento','tamanho','pv_max','pv_atual','pv_temp',
      'dados_vida_total','dados_vida_usados','bonus_proficiencia','enfase_atual','enfase_total',
      'catarse_atual','catarse_total','atributos','protecoes','pericias'];
    const sets = []; const valores = [];
    let i = 1;
    for (const campo of CAMPOS_VALIDOS) {
      if (campo in atualizacoes) {
        sets.push(`${campo} = $${i++}`);
        valores.push(atualizacoes[campo]);
      }
    }
    if (sets.length) {
      valores.push(req.params.id);
      await pool.query(`UPDATE personagens SET ${sets.join(', ')}, atualizado_em = NOW() WHERE id = $${i}`, valores);
    }

    let itensImportados = 0;
    for (const slot of fieldMap.itemSlots) {
      const nome = lerTexto(slot.nome);
      if (!nome) continue;
      const descritores = lerTexto(slot.descritores);
      const volume = lerNumero(slot.volume) || 0;
      const fragmentos = lerNumero(slot.fragmentos) || 0;
      const descricao = lerTexto(slot.descricao);
      await pool.query(
        `INSERT INTO inventario (personagem_id, nome, descritores, volume, fragmentos_arcanos, quantidade, observacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, nome, descritores, volume, fragmentos, 1, descricao]
      );
      itensImportados++;
    }

    let habilidadesImportadas = 0;
    const maxOrdemRes = await pool.query('SELECT COALESCE(MAX(ordem), -1) AS m FROM talentos WHERE personagem_id = $1', [req.params.id]);
    let ordemAtual = maxOrdemRes.rows[0].m + 1;
    for (const grupo of fieldMap.gruposHabilidade) {
      const nome = lerTexto(grupo.campoNome);
      if (!nome) continue;
      const valoresExtras = grupo.extras.map(lerTexto);
      let dados;
      if (grupo.extras.length === 4) {
        dados = {
          tipo: 'Magia',
          alcance: valoresExtras[0] || null,
          descritores: valoresExtras[1] || null,
          efeito: valoresExtras[2] || null,
          especial: valoresExtras[3] || null,
          descricao: null,
        };
      } else {
        dados = {
          tipo: 'Habilidade',
          alcance: null,
          descritores: valoresExtras[0] || null,
          efeito: null,
          especial: null,
          descricao: valoresExtras[1] || null,
        };
      }
      await pool.query(
        `INSERT INTO talentos (personagem_id, nome, tipo, trilha, execucao, custo, alcance, alvo, duracao, ataque, descritores, acerto, erro, efeito, especial, descricao, camada, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [req.params.id, nome, dados.tipo, null, 'Ação', null, dados.alcance, null, null, null,
          dados.descritores, null, null, dados.efeito, dados.especial, dados.descricao, null, ordemAtual++]
      );
      habilidadesImportadas++;
    }

    const atualizado = await personagemCompleto(req.params.id);
    req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', atualizado);
    res.json({ ok: true, itensImportados, habilidadesImportadas, ficha: atualizado });
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: 'Não consegui ler esse PDF. Confira se é o arquivo da ficha editável do Skyfall.' });
  }
});

// ---------- EXPORTAR FICHA EM PDF ----------
router.get('/personagens/:id/pdf', async (req, res) => {
  const p = await personagemCompleto(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  const PDFDocumentKit = require('pdfkit');
  const doc = new PDFDocumentKit({ margin: 40, size: 'A4' });
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
module.exports.personagemCompleto = personagemCompleto;
