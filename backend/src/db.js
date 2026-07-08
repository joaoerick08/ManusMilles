const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new DatabaseSync(path.join(__dirname, '..', 'skyfall.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK(papel IN ('mestre','player')),
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT,
  jogadore TEXT,
  pronomes TEXT,
  legado TEXT,
  heranca TEXT,
  antecedente TEXT,
  maldicao TEXT,
  nivel INTEGER DEFAULT 0,
  bonus_proficiencia INTEGER DEFAULT 2,
  foto_url TEXT,

  -- Atributos (JSON: {forca, destreza, constituicao, inteligencia, sabedoria, carisma})
  atributos TEXT DEFAULT '{}',

  -- Testes de proteção (JSON: {forca: bool, destreza: bool, ...})
  protecoes TEXT DEFAULT '{}',

  -- Pontos de vida
  pv_max INTEGER DEFAULT 0,
  pv_atual INTEGER DEFAULT 0,
  pv_temp INTEGER DEFAULT 0,
  dados_vida_total INTEGER DEFAULT 0,
  dados_vida_usados INTEGER DEFAULT 0,

  -- Pontos de sombra (JSON array de 5 booleans)
  pontos_sombra TEXT DEFAULT '[false,false,false,false,false]',
  testes_morte TEXT DEFAULT '{"sucessos":0,"falhas":0}',

  -- Pontos de catarse / ênfase
  catarse_atual INTEGER DEFAULT 0,
  catarse_total INTEGER DEFAULT 0,
  enfase_atual INTEGER DEFAULT 0,
  enfase_total INTEGER DEFAULT 0,

  deslocamento TEXT DEFAULT '9m',
  tamanho TEXT,
  reducao_dano INTEGER DEFAULT 0,
  iniciativa_bonus INTEGER DEFAULT 0,

  -- Perícias (JSON: [{nome, proficiente, total}, ...])
  pericias TEXT DEFAULT '[]',

  -- Idiomas e outras proficiências
  idiomas TEXT DEFAULT '[]',

  -- Ataques/armas (JSON: [{nome, teste, dano, critico, tipo}, ...])
  ataques TEXT DEFAULT '[]',

  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS talentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personagem_id INTEGER NOT NULL REFERENCES personagens(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  trilha TEXT,
  tipo TEXT, -- habilidade / magia / talento
  alcance TEXT,
  duracao TEXT,
  descritores TEXT,
  descricao TEXT,
  custo TEXT,
  camada TEXT
);

-- migrações incrementais (ignora erro se a coluna já existir)
`);

const novasColunasTalentos = ['execucao TEXT', 'alvo TEXT', 'ataque TEXT', 'acerto TEXT', 'erro TEXT', 'efeito TEXT', 'especial TEXT'];
for (const coluna of novasColunasTalentos) {
  try { db.exec(`ALTER TABLE talentos ADD COLUMN ${coluna}`); } catch { /* já existe */ }
}

db.exec(`

CREATE TABLE IF NOT EXISTS inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personagem_id INTEGER NOT NULL REFERENCES personagens(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descritores TEXT,
  volume REAL DEFAULT 0,
  fragmentos_arcanos INTEGER DEFAULT 0,
  quantidade INTEGER DEFAULT 1,
  observacoes TEXT
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  destino TEXT NOT NULL, -- 'todos' ou usuario_id específico
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Cria usuário mestre padrão se não existir nenhum
const mestreExiste = db.prepare("SELECT id FROM usuarios WHERE papel = 'mestre' LIMIT 1").get();
if (!mestreExiste) {
  const hash = bcrypt.hashSync('mestre123', 10);
  db.prepare("INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES (?, ?, ?, 'mestre')")
    .run('Mestre', 'mestre', hash);
  console.log('Usuário mestre criado -> login: mestre / senha: mestre123 (TROQUE DEPOIS)');
}

module.exports = db;
