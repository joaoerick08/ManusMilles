// Comprime uma imagem no navegador antes do upload, usando canvas.
// Evita erro 500 causado por fotos de celular grandes (8-15MB+) estourando
// o limite de upload do Render / Supabase (free tier, ~50MB no total da requisição,
// mas alguns proxies intermediários cortam bem antes disso).
//
// - Redimensiona mantendo a proporção, com no máximo `maxLargura`/`maxAltura`.
// - Reexporta como JPEG com a qualidade informada.
// - Se o arquivo não for uma imagem (ex: vídeo, PDF) ou já for pequeno o
//   suficiente, devolve o arquivo original sem mexer.

export async function comprimirImagem(arquivo, opcoes = {}) {
  const {
    maxLargura = 1600,
    maxAltura = 1600,
    qualidade = 0.8,
    tamanhoMinimoParaComprimir = 800 * 1024, // 800KB
  } = opcoes;

  if (!arquivo || !arquivo.type || !arquivo.type.startsWith('image/')) {
    return arquivo;
  }

  // GIF pode ser animado — comprimir via canvas destruiria a animação, então pula.
  if (arquivo.type === 'image/gif') {
    return arquivo;
  }

  if (arquivo.size <= tamanhoMinimoParaComprimir) {
    return arquivo;
  }

  try {
    const bitmap = await criarBitmap(arquivo);

    let { width, height } = bitmap;
    if (width > maxLargura || height > maxAltura) {
      const escala = Math.min(maxLargura / width, maxAltura / height);
      width = Math.round(width * escala);
      height = Math.round(height * escala);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', qualidade));
    if (!blob) return arquivo;

    // Se por algum motivo a versão comprimida ficou maior (imagem já pequena
    // em dimensões mas com metadata pesada), usa a original mesmo.
    if (blob.size >= arquivo.size) return arquivo;

    const novoNome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], novoNome, { type: 'image/jpeg' });
  } catch (erro) {
    console.warn('Falha ao comprimir imagem, enviando original:', erro);
    return arquivo;
  }
}

function criarBitmap(arquivo) {
  if (window.createImageBitmap) {
    return window.createImageBitmap(arquivo);
  }
  // Fallback pra navegadores sem createImageBitmap
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
