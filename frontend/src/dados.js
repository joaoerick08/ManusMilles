// Fórmulas de dados: "2d6+4d12+3", "1d20-2", "d8", "-1d4+5" etc.
// Cada termo é um grupo de dados (qtd x dLado) ou um número fixo, com sinal + ou -.

const LIMITE_QTD = 100;   // máx. de dados por termo
const LIMITE_LADO = 1000; // máx. de lados
const LIMITE_TERMOS = 20;

const TERMO = '(?:\\d*[dD]\\d+|\\d+)';
const PREFIXO_FORMULA = new RegExp(`^\\s*[+-]?\\s*${TERMO}(?:\\s*[+-]\\s*${TERMO})*`);

// Converte texto em lista de termos. Retorna null se for inválido.
export function parseFormula(texto) {
  const limpo = String(texto ?? '').replace(/\s+/g, '').toLowerCase();
  if (!limpo) return null;
  const partes = limpo.match(/[+-]?[^+-]+/g);
  if (!partes || partes.join('') !== limpo || partes.length > LIMITE_TERMOS) return null;

  const termos = [];
  for (const parte of partes) {
    const sinal = parte.startsWith('-') ? -1 : 1;
    const corpo = parte.replace(/^[+-]/, '');
    const dado = corpo.match(/^(\d*)d(\d+)$/);
    if (dado) {
      const qtd = dado[1] === '' ? 1 : Number(dado[1]);
      const lado = Number(dado[2]);
      if (qtd < 1 || qtd > LIMITE_QTD || lado < 2 || lado > LIMITE_LADO) return null;
      termos.push({ sinal, qtd, lado });
    } else if (/^\d+$/.test(corpo)) {
      termos.push({ sinal, fixo: Number(corpo) });
    } else {
      return null;
    }
  }
  return termos;
}

// Transforma termos de volta em texto padronizado: "2d6+4d12-1"
export function formatarFormula(termos) {
  return termos
    .map((t, i) => {
      const corpo = t.fixo !== undefined ? String(t.fixo) : `${t.qtd}d${t.lado}`;
      if (t.sinal < 0) return `-${corpo}`;
      return i === 0 ? corpo : `+${corpo}`;
    })
    .join('');
}

// Rola uma fórmula. Retorna { expressao, valores, grupos, resultado } ou null se inválida.
export function rolarFormula(texto) {
  const termos = parseFormula(texto);
  if (!termos) return null;

  const grupos = [];
  const valores = [];
  let resultado = 0;
  for (const t of termos) {
    if (t.fixo !== undefined) {
      resultado += t.sinal * t.fixo;
      grupos.push({ termo: `${t.sinal < 0 ? '-' : '+'}${t.fixo}`, fixo: t.sinal * t.fixo });
      continue;
    }
    const rolados = [];
    for (let i = 0; i < t.qtd; i++) rolados.push(1 + Math.floor(Math.random() * t.lado));
    const soma = rolados.reduce((a, b) => a + b, 0);
    resultado += t.sinal * soma;
    valores.push(...rolados);
    grupos.push({ termo: `${t.sinal < 0 ? '-' : '+'}${t.qtd}d${t.lado}`, valores: rolados, soma: t.sinal * soma });
  }
  return { expressao: formatarFormula(termos), valores, grupos, resultado };
}

// Aceita textos de ficha como "2d6+3 cortante" ou "+5" (neste caso, vira 1d20+5 se base for informada).
// Pega só o começo que for fórmula válida e ignora o resto do texto.
export function extrairFormula(texto, { baseD20 = false } = {}) {
  const m = String(texto ?? '').match(PREFIXO_FORMULA);
  if (!m) return null;
  let f = m[0].replace(/\s+/g, '');
  if (baseD20 && !/d/i.test(f)) {
    // só número (ex: "+5", "-1", "5"): é o bônus de um teste de d20
    f = `1d20${/^[+-]/.test(f) ? f : '+' + f}`;
  }
  return parseFormula(f) ? f : null;
}

// Soma/subtrai um dado da fórmula atual (usado pelos botões d4, d6, d8...)
export function adicionarDado(texto, lado, delta = 1) {
  const termos = parseFormula(texto) || [];
  const existente = termos.find(t => t.lado === lado && t.sinal > 0);
  if (existente) {
    existente.qtd += delta;
    if (existente.qtd < 1) termos.splice(termos.indexOf(existente), 1);
    else if (existente.qtd > LIMITE_QTD) existente.qtd = LIMITE_QTD;
  } else if (delta > 0) {
    // dados primeiro, números fixos no fim
    const idxFixo = termos.findIndex(t => t.fixo !== undefined);
    const novo = { sinal: 1, qtd: delta, lado };
    if (idxFixo === -1) termos.push(novo); else termos.splice(idxFixo, 0, novo);
  }
  return formatarFormula(termos);
}

// Texto bonito pro histórico: "2d6 [3, 4] + 4d12 [1, 9, 2, 12] + 3"
export function descreverRolagem(h) {
  if (Array.isArray(h.grupos) && h.grupos.length) {
    return h.grupos
      .map((g, i) => {
        const sinal = g.termo.startsWith('-') ? '− ' : (i === 0 ? '' : '+ ');
        const nome = g.termo.replace(/^[+-]/, '');
        return g.valores ? `${sinal}${nome} [${g.valores.join(', ')}]` : `${sinal}${nome}`;
      })
      .join(' ');
  }
  return `${h.expressao} [${(h.valores || []).join(', ')}]`;
}

// Som de crítico/falha só vale quando a rolagem começa com um único d20
export function ehD20Unico(expressao) {
  return /^1d20(?!\d)/.test(expressao || '');
}
