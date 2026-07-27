const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERRO: variável de ambiente DATABASE_URL não configurada. Defina a connection string do seu banco Postgres (Supabase/Neon/etc).');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function iniciar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL CHECK(papel IN ('mestre','player')),
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS personagens (
      id SERIAL PRIMARY KEY,
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

      atributos JSONB DEFAULT '{}',
      protecoes JSONB DEFAULT '{}',

      pv_max INTEGER DEFAULT 0,
      pv_atual INTEGER DEFAULT 0,
      pv_temp INTEGER DEFAULT 0,
      dados_vida_total INTEGER DEFAULT 0,
      dados_vida_usados INTEGER DEFAULT 0,

      pontos_sombra JSONB DEFAULT '[false,false,false,false,false]',
      testes_morte JSONB DEFAULT '{"sucessos":0,"falhas":0}',

      catarse_atual INTEGER DEFAULT 0,
      catarse_total INTEGER DEFAULT 0,
      enfase_atual INTEGER DEFAULT 0,
      enfase_total INTEGER DEFAULT 0,

      deslocamento TEXT DEFAULT '9m',
      tamanho TEXT,
      reducao_dano INTEGER DEFAULT 0,
      iniciativa_bonus INTEGER DEFAULT 0,

      pericias JSONB DEFAULT '[]',
      idiomas JSONB DEFAULT '[]',
      ataques JSONB DEFAULT '[]',

      notas_mestre TEXT DEFAULT '',

      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS talentos (
      id SERIAL PRIMARY KEY,
      personagem_id INTEGER NOT NULL REFERENCES personagens(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      trilha TEXT,
      tipo TEXT,
      execucao TEXT,
      alcance TEXT,
      alvo TEXT,
      duracao TEXT,
      ataque TEXT,
      descritores TEXT,
      acerto TEXT,
      erro TEXT,
      efeito TEXT,
      especial TEXT,
      descricao TEXT,
      custo TEXT,
      camada TEXT,
      ordem INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventario (
      id SERIAL PRIMARY KEY,
      personagem_id INTEGER NOT NULL REFERENCES personagens(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      descritores TEXT,
      volume REAL DEFAULT 0,
      fragmentos_arcanos INTEGER DEFAULT 0,
      quantidade INTEGER DEFAULT 1,
      observacoes TEXT
    );

    CREATE TABLE IF NOT EXISTS pericias_personagem (
      id SERIAL PRIMARY KEY,
      personagem_id INTEGER NOT NULL REFERENCES personagens(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      proficiente BOOLEAN DEFAULT false,
      total INTEGER DEFAULT 0,
      outros TEXT,
      ordem INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      destino TEXT NOT NULL,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mapas (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      url TEXT NOT NULL,
      ativo BOOLEAN DEFAULT false,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mapa_pins (
      id SERIAL PRIMARY KEY,
      mapa_id INTEGER NOT NULL REFERENCES mapas(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      nome_jogador TEXT NOT NULL,
      cor TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      atualizado_em TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(mapa_id, usuario_id)
    );
  `);

  // migração incremental segura (não quebra se a coluna já existir)
  await pool.query('ALTER TABLE personagens ADD COLUMN IF NOT EXISTS notas_mestre TEXT DEFAULT \'\'');
  await pool.query('ALTER TABLE personagens ADD COLUMN IF NOT EXISTS foto_corpo_url TEXT');
  await pool.query('ALTER TABLE inventario ADD COLUMN IF NOT EXISTS dano TEXT');
  await pool.query('ALTER TABLE inventario ADD COLUMN IF NOT EXISTS resistencia TEXT');
  await pool.query('ALTER TABLE inventario ADD COLUMN IF NOT EXISTS imagem_url TEXT');
  await pool.query('ALTER TABLE inventario ADD COLUMN IF NOT EXISTS tipo TEXT');

  // migração de dados: mover perícias do JSONB antigo pra tabela própria (uma vez só por personagem)
  const { rows: comPericiasAntigas } = await pool.query(`
    SELECT id, pericias FROM personagens
    WHERE pericias IS NOT NULL
      AND jsonb_typeof(pericias) = 'array'
      AND NOT EXISTS (SELECT 1 FROM pericias_personagem WHERE personagem_id = personagens.id)
  `);
  let totalMigrados = 0;
  for (const p of comPericiasAntigas) {
    if (!Array.isArray(p.pericias) || p.pericias.length === 0) continue;
    totalMigrados++;
    let ordem = 0;
    for (const item of p.pericias) {
      await pool.query(
        'INSERT INTO pericias_personagem (personagem_id, nome, proficiente, total, outros, ordem) VALUES ($1,$2,$3,$4,$5,$6)',
        [p.id, item.nome || '', !!item.proficiente, Number(item.total) || 0, item.outros || null, ordem++]
      );
    }
  }
  if (totalMigrados > 0) {
    console.log(`Migradas as perícias de ${totalMigrados} personagem(ns) pro novo formato.`);
  }

  const { rows } = await pool.query("SELECT id FROM usuarios WHERE papel = 'mestre' LIMIT 1");
  if (rows.length === 0) {
    const hash = bcrypt.hashSync('mestre123', 10);
    await pool.query(
      "INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'mestre')",
      ['Mestre', 'mestre', hash]
    );
    console.log('Usuário mestre criado -> login: mestre / senha: mestre123 (TROQUE DEPOIS)');
  }
}

const prontoPromise = iniciar().catch((err) => {
  console.error('Erro ao iniciar o banco de dados:', err.message);
  throw err;
});

module.exports = { pool, pronto: prontoPromise };
