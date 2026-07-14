const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('./db');
const { autenticar, apenasMestre } = require('./auth');
const { PDFDocument } = require('pdf-lib');
const fieldMap = require('./pdfFieldMap.json');
const { enviarArquivo } = require('./storage');

const router = express.Router();

const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const uploadPdfMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(autenticar);

// ---------- USUÁRIOS (players) ----------
router.get('/usuarios', apenasMestre, async (req, res) => {
  const { rows } = await pool.query("SELECT id, nome, login, papel FROM usuarios WHERE papel = 'player'");
  res.json(rows);
});

const PERICIAS_PADRAO = [
  'Apresentação', 'Arcanismo', 'Cultura', 'Diplomacia', 'Doutrinas', 'Furtividade',
  'Intimidação', 'Intuição', 'Magitec', 'Malandragem', 'Manipulação', 'Medicina',
  'Natureza', 'Percepção', 'Preparo Físico',
  'Aptidão com ___', 'Aptidão com ___', 'Aptidão com ___',
].map(nome => ({ nome, proficiente: false, total: 0 }));

router.post('/usuarios', apenasMestre, async (req, res) => {
  const { nome, login, senha } = req.body;
  if (!nome || !login || !senha) return res.status(400).json({ erro: 'Preencha nome, login e senha' });
  const hash = bcrypt.hashSync(senha, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'player') RETURNING id",
      [nome, login, hash]
    );
    const { rows: personagemRows } = await pool.query(
      'INSERT INTO personagens (usuario_id, nome) VALUES ($1, $2) RETURNING id',
      [rows[0].id, nome]
    );
    const personagemId = personagemRows[0].id;
    let ordem = 0;
    for (const item of PERICIAS_PADRAO) {
      await pool.query(
        'INSERT INTO pericias_personagem (personagem_id, nome, proficiente, total, ordem) VALUES ($1,$2,$3,$4,$5)',
        [personagemId, item.nome, false, 0, ordem++]
      );
    }
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
  const pericias = await pool.query('SELECT * FROM pericias_personagem WHERE personagem_id = $1 ORDER BY ordem ASC, id ASC', [id]);
  p.talentos = talentos.rows;
  p.inventario = inventario.rows;
  p.pericias = pericias.rows;
  return p;
}

// Notas do mestre são privadas: nunca vazam pra quem não é mestre (nem em HTTP, nem em socket)
function ocultarNotasSeNaoMestre(p, usuario) {
  if (!p || usuario.papel === 'mestre') return p;
  const { notas_mestre, ...resto } = p;
  return resto;
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
  const todos = await Promise.all(ids.map(personagemCompleto));
  res.json(todos.map(p => ocultarNotasSeNaoMestre(p, req.usuario)));
});

// lista básica (sem dados sensíveis) de todos os personagens, pra tela de "quem está online"
// (precisa vir ANTES de /personagens/:id, senão o Express trata "publicos" como se fosse um :id)
router.get('/personagens/publicos', async (req, res) => {
  const { rows } = await pool.query('SELECT id, usuario_id, nome, foto_corpo_url FROM personagens');
  res.json(rows);
});

router.get('/personagens/:id', async (req, res) => {
  const p = await personagemCompleto(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  res.json(ocultarNotasSeNaoMestre(p, req.usuario));
});

const CAMPOS_EDITAVEIS = [
  'nome','jogadore','pronomes','legado','heranca','antecedente','maldicao','nivel',
  'bonus_proficiencia','foto_url','atributos','protecoes','pv_max','pv_atual','pv_temp',
  'dados_vida_total','dados_vida_usados','pontos_sombra','testes_morte','catarse_atual',
  'catarse_total','enfase_atual','enfase_total','deslocamento','tamanho','reducao_dano',
  'iniciativa_bonus','idiomas','ataques'
];
const CAMPOS_SO_MESTRE = ['notas_mestre'];

router.put('/personagens/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  const campos = req.usuario.papel === 'mestre' ? [...CAMPOS_EDITAVEIS, ...CAMPOS_SO_MESTRE] : CAMPOS_EDITAVEIS;
  const sets = []; const valores = [];
  let i = 1;
  for (const campo of campos) {
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
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', ocultarNotasSeNaoMestre(atualizado, { papel: 'player' }));
  res.json(ocultarNotasSeNaoMestre(atualizado, req.usuario));
});

// ---------- TALENTOS (habilidades/magias) ----------
const CAMPOS_TALENTO = ['nome','trilha','tipo','execucao','custo','alcance','alvo','duracao','ataque','descritores','acerto','erro','efeito','especial','descricao','camada','ordem'];

async function emitirFicha(req, personagemId) {
  const atualizado = await personagemCompleto(personagemId);
  if (atualizado) req.io.to(`personagem-${personagemId}`).emit('ficha-atualizada', ocultarNotasSeNaoMestre(atualizado, { papel: 'player' }));
}

// Confere se quem está fazendo a requisição é o mestre ou o dono desse personagem.
// Use sempre antes de criar/editar/apagar talentos, perícias ou itens de inventário.
async function podeEditarPersonagem(req, personagemId) {
  if (req.usuario.papel === 'mestre') return { ok: true };
  const { rows } = await pool.query('SELECT usuario_id FROM personagens WHERE id = $1', [personagemId]);
  const p = rows[0];
  if (!p) return { ok: false, status: 404, erro: 'Personagem não encontrado' };
  if (p.usuario_id !== req.usuario.id) return { ok: false, status: 403, erro: 'Sem permissão' };
  return { ok: true };
}

router.post('/personagens/:id/talentos', async (req, res) => {
  const permissao = await podeEditarPersonagem(req, req.params.id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
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
  if (!talento) return res.status(404).json({ erro: 'Não encontrado' });
  const permissao = await podeEditarPersonagem(req, talento.personagem_id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
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
  if (!talento) return res.status(404).json({ erro: 'Não encontrado' });
  const permissao = await podeEditarPersonagem(req, talento.personagem_id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
  await pool.query('DELETE FROM talentos WHERE id = $1', [req.params.id]);
  if (talento) await emitirFicha(req, talento.personagem_id);
  res.json({ ok: true });
});

// ---------- PERÍCIAS (cada uma salva separada, evita conflito quando duas pessoas editam ao mesmo tempo) ----------
router.post('/personagens/:id/pericias', async (req, res) => {
  const permissao = await podeEditarPersonagem(req, req.params.id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
  const { nome, proficiente, total, outros } = req.body;
  if (!('ordem' in req.body)) {
    const { rows } = await pool.query('SELECT COALESCE(MAX(ordem), -1) AS m FROM pericias_personagem WHERE personagem_id = $1', [req.params.id]);
    req.body.ordem = rows[0].m + 1;
  }
  const { rows } = await pool.query(
    'INSERT INTO pericias_personagem (personagem_id, nome, proficiente, total, outros, ordem) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.params.id, nome || '', !!proficiente, total || 0, outros || null, req.body.ordem]
  );
  await emitirFicha(req, req.params.id);
  res.json({ id: rows[0].id });
});

router.put('/pericias/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT personagem_id FROM pericias_personagem WHERE id = $1', [req.params.id]);
  const pericia = rows[0];
  if (!pericia) return res.status(404).json({ erro: 'Não encontrado' });
  const permissao = await podeEditarPersonagem(req, pericia.personagem_id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
  const CAMPOS_PERICIA = ['nome', 'proficiente', 'total', 'outros', 'ordem'];
  const sets = []; const valores = [];
  let i = 1;
  for (const c of CAMPOS_PERICIA) if (c in req.body) { sets.push(`${c} = $${i++}`); valores.push(req.body[c]); }
  if (sets.length) {
    valores.push(req.params.id);
    await pool.query(`UPDATE pericias_personagem SET ${sets.join(', ')} WHERE id = $${i}`, valores);
  }
  if (pericia) await emitirFicha(req, pericia.personagem_id);
  res.json({ ok: true });
});

router.delete('/pericias/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT personagem_id FROM pericias_personagem WHERE id = $1', [req.params.id]);
  const pericia = rows[0];
  if (!pericia) return res.status(404).json({ erro: 'Não encontrado' });
  const permissao = await podeEditarPersonagem(req, pericia.personagem_id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
  await pool.query('DELETE FROM pericias_personagem WHERE id = $1', [req.params.id]);
  if (pericia) await emitirFicha(req, pericia.personagem_id);
  res.json({ ok: true });
});

// adiciona as perícias oficiais que ainda faltarem pra esse personagem (não duplica as já existentes)
router.post('/personagens/:id/pericias/carregar-padrao', async (req, res) => {
  const permissao = await podeEditarPersonagem(req, req.params.id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
  const { rows: existentes } = await pool.query('SELECT nome FROM pericias_personagem WHERE personagem_id = $1', [req.params.id]);
  const nomesExistentes = existentes.map(p => p.nome.toLowerCase());
  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(ordem), -1) AS m FROM pericias_personagem WHERE personagem_id = $1', [req.params.id]);
  let ordem = maxRows[0].m + 1;
  for (const item of PERICIAS_PADRAO) {
    if (nomesExistentes.includes(item.nome.toLowerCase())) continue;
    await pool.query(
      'INSERT INTO pericias_personagem (personagem_id, nome, proficiente, total, ordem) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, item.nome, false, 0, ordem++]
    );
  }
  await emitirFicha(req, req.params.id);
  res.json({ ok: true });
});

// ---------- INVENTÁRIO ----------
router.post('/personagens/:id/inventario', async (req, res) => {
  const permissao = await podeEditarPersonagem(req, req.params.id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
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
  if (!item) return res.status(404).json({ erro: 'Não encontrado' });
  const permissao = await podeEditarPersonagem(req, item.personagem_id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
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
  if (!item) return res.status(404).json({ erro: 'Não encontrado' });
  const permissao = await podeEditarPersonagem(req, item.personagem_id);
  if (!permissao.ok) return res.status(permissao.status).json({ erro: permissao.erro });
  await pool.query('DELETE FROM inventario WHERE id = $1', [req.params.id]);
  if (item) await emitirFicha(req, item.personagem_id);
  res.json({ ok: true });
});

// ---------- AVATAR ----------
router.post('/personagens/:id/avatar', uploadMemoria.single('avatar'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  if (!req.file) return res.status(400).json({ erro: 'Envie uma imagem' });
  let url;
  try {
    url = await enviarArquivo(req.file.buffer, req.file.originalname, req.file.mimetype);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Não foi possível enviar a imagem pro armazenamento.' });
  }
  await pool.query('UPDATE personagens SET foto_url = $1, atualizado_em = NOW() WHERE id = $2', [url, req.params.id]);
  const atualizado = await personagemCompleto(req.params.id);
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', ocultarNotasSeNaoMestre(atualizado, { papel: 'player' }));
  res.json(ocultarNotasSeNaoMestre(atualizado, req.usuario));
});

router.post('/personagens/:id/foto-corpo', uploadMemoria.single('foto'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM personagens WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }
  if (!req.file) return res.status(400).json({ erro: 'Envie uma imagem' });
  let url;
  try {
    url = await enviarArquivo(req.file.buffer, req.file.originalname, req.file.mimetype);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Não foi possível enviar a imagem pro armazenamento.' });
  }
  await pool.query('UPDATE personagens SET foto_corpo_url = $1, atualizado_em = NOW() WHERE id = $2', [url, req.params.id]);
  const atualizado = await personagemCompleto(req.params.id);
  req.io.to(`personagem-${req.params.id}`).emit('ficha-atualizada', ocultarNotasSeNaoMestre(atualizado, { papel: 'player' }));
  req.io.emit('personagem-publico-atualizado', { id: atualizado.id, usuario_id: atualizado.usuario_id, nome: atualizado.nome, foto_corpo_url: atualizado.foto_corpo_url });
  res.json(ocultarNotasSeNaoMestre(atualizado, req.usuario));
});

// ---------- INVOCAR A SOMBRA ----------
router.post('/invocar-sombra', apenasMestre, (req, res) => {
  const { usuario_id } = req.body;
  if (!usuario_id) return res.status(400).json({ erro: 'Escolha um jogador' });
  req.io.to(`usuario-${usuario_id}`).emit('invocar-sombra');
  res.json({ ok: true });
});

// ---------- BROADCAST (imagem/gif/vídeo) ----------
router.post('/broadcast', apenasMestre, uploadMemoria.single('imagem'), async (req, res) => {
  const destino = req.body.destino || 'todos';
  let url;
  if (req.file) {
    try {
      url = await enviarArquivo(req.file.buffer, req.file.originalname, req.file.mimetype);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Não foi possível enviar o arquivo pro armazenamento.' });
    }
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
// ---------- EXPORTAR FICHA PREENCHIDA EM PDF (pode ser reimportada depois) ----------
router.get('/personagens/:id/exportar-pdf', async (req, res) => {
  const p = await personagemCompleto(req.params.id);
  if (!p) return res.status(404).json({ erro: 'Não encontrado' });
  if (req.usuario.papel !== 'mestre' && p.usuario_id !== req.usuario.id) {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  try {
    const templateBytes = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ficha-template.pdf'));
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    function set(nomeCampo, valor) {
      if (valor === null || valor === undefined || valor === '') return;
      try {
        form.getTextField(nomeCampo).setText(String(valor));
      } catch { /* campo não existe nessa versão do PDF ou não é de texto - ignora */ }
    }

    for (const [campoPdf, chaveFicha] of Object.entries(fieldMap.diretos)) set(campoPdf, p[chaveFicha]);
    for (const [campoPdf, chaveAtributo] of Object.entries(fieldMap.atributos)) set(campoPdf, p.atributos?.[chaveAtributo] ?? 0);

    const bonus = p.bonus_proficiencia ?? 2;
    for (const [campoPdf, chaveAtributo] of Object.entries(fieldMap.protecoes)) {
      const valorAtributo = p.atributos?.[chaveAtributo] ?? 0;
      const treinado = !!p.protecoes?.[chaveAtributo];
      set(campoPdf, 10 + valorAtributo + (treinado ? bonus : 0));
    }

    set(fieldMap.catarseCampo, `${p.catarse_atual ?? 0}/${p.catarse_total ?? 0}`);

    for (const [abrev, nomeCompleto] of Object.entries(fieldMap.pericias)) {
      const pericia = (p.pericias || []).find(x => (x.nome || '').toLowerCase() === nomeCompleto.toLowerCase());
      if (pericia) {
        set(`${abrev}Tot`, pericia.total ?? 0);
        if (pericia.outros) set(`${abrev}Out`, pericia.outros);
      }
    }

    (p.inventario || []).slice(0, fieldMap.itemSlots.length).forEach((item, i) => {
      const slot = fieldMap.itemSlots[i];
      set(slot.nome, item.nome);
      set(slot.descritores, item.descritores);
      set(slot.volume, item.volume);
      set(slot.fragmentos, item.fragmentos_arcanos);
      set(slot.descricao, item.observacoes);
    });

    (p.talentos || []).slice(0, fieldMap.gruposHabilidade.length).forEach((t, i) => {
      const grupo = fieldMap.gruposHabilidade[i];
      set(grupo.campoNome, t.nome);
      const detalhes = [
        t.trilha && `Trilha: ${t.trilha}`,
        t.execucao,
        t.custo && `Custo: ${t.custo}`,
        t.alcance && `Alcance: ${t.alcance}`,
        t.alvo && `Alvo: ${t.alvo}`,
        t.duracao && `Duração: ${t.duracao}`,
        t.ataque && `Ataque: ${t.ataque}`,
        t.descritores && `Descritores: ${t.descritores}`,
        t.acerto && `Acerto: ${t.acerto}`,
        t.erro && `Erro: ${t.erro}`,
        t.efeito && `Efeito: ${t.efeito}`,
        t.especial && `Especial: ${t.especial}`,
        t.descricao,
      ].filter(Boolean);
      grupo.extras.forEach((campoExtra, idx) => { if (detalhes[idx]) set(campoExtra, detalhes[idx]); });
      if (grupo.extras.length > 0 && detalhes.length > grupo.extras.length) {
        const ultimo = grupo.extras[grupo.extras.length - 1];
        set(ultimo, detalhes.slice(grupo.extras.length - 1).join(' | '));
      }
    });

    form.updateFieldAppearances();
    const bytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(p.nome || 'ficha').replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('Erro ao exportar PDF:', err);
    res.status(500).json({ erro: 'Não foi possível gerar o PDF da ficha.' });
  }
});

router.post('/personagens/:id/importar-pdf', uploadPdfMemoria.single('pdf'), async (req, res) => {
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
    let periciasParaSalvar;
    if (pericias.length) {
      // completa com as perícias oficiais que não vieram preenchidas no PDF, sem perder nada
      const nomesImportados = pericias.map(p => p.nome.toLowerCase());
      const importouAptidao = nomesImportados.some(n => n.startsWith('aptidão'));
      const faltantes = PERICIAS_PADRAO.filter(p => {
        const nomeMin = p.nome.toLowerCase();
        if (importouAptidao && nomeMin.startsWith('aptidão')) return false;
        return !nomesImportados.includes(nomeMin);
      });
      periciasParaSalvar = [...pericias, ...faltantes];
    } else {
      periciasParaSalvar = PERICIAS_PADRAO;
    }

    const CAMPOS_VALIDOS = ['nome','pronomes','jogadore','legado','heranca','antecedente','maldicao',
      'iniciativa_bonus','reducao_dano','deslocamento','tamanho','pv_max','pv_atual','pv_temp',
      'dados_vida_total','dados_vida_usados','bonus_proficiencia','enfase_atual','enfase_total',
      'catarse_atual','catarse_total','atributos','protecoes'];
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

    // substitui as perícias desse personagem pelas importadas (ação explícita e única, sem risco de conflito concorrente)
    await pool.query('DELETE FROM pericias_personagem WHERE personagem_id = $1', [req.params.id]);
    let ordemPericia = 0;
    for (const item of periciasParaSalvar) {
      await pool.query(
        'INSERT INTO pericias_personagem (personagem_id, nome, proficiente, total, outros, ordem) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, item.nome, !!item.proficiente, item.total || 0, item.outros || null, ordemPericia++]
      );
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


// ---------- MAPAS INTERATIVOS ----------
const CORES_PIN = ['#e0554f', '#4f9de0', '#4fe08a', '#e0c94f', '#b04fe0', '#e08a4f', '#4fd8e0', '#e04f9e'];

router.get('/mapas', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM mapas ORDER BY criado_em DESC');
  res.json(rows);
});

router.get('/mapas/ativo', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM mapas WHERE ativo = true LIMIT 1');
  if (!rows[0]) return res.json(null);
  const pins = await pool.query('SELECT * FROM mapa_pins WHERE mapa_id = $1', [rows[0].id]);
  res.json({ ...rows[0], pins: pins.rows });
});

router.post('/mapas', apenasMestre, uploadMemoria.single('mapa'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Envie uma imagem do mapa' });
  const nome = req.body.nome || 'Mapa sem nome';
  try {
    const url = await enviarArquivo(req.file.buffer, req.file.originalname, req.file.mimetype);
    const { rows } = await pool.query('INSERT INTO mapas (nome, url) VALUES ($1, $2) RETURNING *', [nome, url]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message || 'Erro ao enviar o mapa' });
  }
});

router.put('/mapas/:id/ativar', apenasMestre, async (req, res) => {
  await pool.query('UPDATE mapas SET ativo = false');
  const { rows } = await pool.query('UPDATE mapas SET ativo = true WHERE id = $1 RETURNING *', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Mapa não encontrado' });
  const pins = await pool.query('SELECT * FROM mapa_pins WHERE mapa_id = $1', [rows[0].id]);
  const mapaCompleto = { ...rows[0], pins: pins.rows };
  req.io.emit('mapa-trocado', mapaCompleto);
  res.json(mapaCompleto);
});

router.delete('/mapas/:id', apenasMestre, async (req, res) => {
  await pool.query('DELETE FROM mapas WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/mapas/:id/pins', async (req, res) => {
  const { x, y } = req.body;
  const cor = CORES_PIN[req.usuario.id % CORES_PIN.length];
  const { rows } = await pool.query(
    `INSERT INTO mapa_pins (mapa_id, usuario_id, nome_jogador, cor, x, y)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (mapa_id, usuario_id) DO UPDATE SET x = $5, y = $6, atualizado_em = NOW()
     RETURNING *`,
    [req.params.id, req.usuario.id, req.usuario.nome, cor, x, y]
  );
  req.io.emit('mapa-pin-atualizado', rows[0]);
  res.json(rows[0]);
});

router.delete('/mapas/:id/pins/mine', async (req, res) => {
  await pool.query('DELETE FROM mapa_pins WHERE mapa_id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
  req.io.emit('mapa-pin-removido', { mapa_id: Number(req.params.id), usuario_id: req.usuario.id });
  res.json({ ok: true });
});

router.delete('/mapas/:id/pins', apenasMestre, async (req, res) => {
  await pool.query('DELETE FROM mapa_pins WHERE mapa_id = $1', [req.params.id]);
  req.io.emit('mapa-pins-limpos', { mapa_id: Number(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
module.exports.personagemCompleto = personagemCompleto;
