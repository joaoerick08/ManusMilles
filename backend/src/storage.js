const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'uploads';

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  console.error('ERRO: SUPABASE_URL e/ou SUPABASE_SERVICE_KEY não configurados. Uploads de imagem/avatar não vão funcionar.');
}

async function garantirBucket() {
  if (!supabase) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  const existe = buckets?.some(b => b.name === BUCKET);
  if (!existe) {
    await supabase.storage.createBucket(BUCKET, { public: true });
    console.log(`Bucket "${BUCKET}" criado no Supabase Storage.`);
  }
}

async function enviarArquivo(buffer, nomeOriginal, mimetype) {
  if (!supabase) throw new Error('Armazenamento de arquivos não configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes).');
  const nomeArquivo = `${Date.now()}-${nomeOriginal.replace(/\s+/g, '_')}`;
  const { error } = await supabase.storage.from(BUCKET).upload(nomeArquivo, buffer, {
    contentType: mimetype,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

// apaga o arquivo do armazenamento a partir da URL pública (pra não ficar acumulando espaço à toa)
async function removerArquivo(url) {
  if (!supabase || !url) return;
  const marcador = `/public/${BUCKET}/`;
  const indice = url.indexOf(marcador);
  if (indice === -1) return;
  const nomeArquivo = decodeURIComponent(url.slice(indice + marcador.length));
  const { error } = await supabase.storage.from(BUCKET).remove([nomeArquivo]);
  if (error) console.error('Erro ao remover arquivo do armazenamento:', error.message);
}

module.exports = { garantirBucket, enviarArquivo, removerArquivo };
