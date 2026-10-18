// Regras de perícias do Skyfall RPG (Livro Básico, Cap. 1):
// teste = 1d20 + modificador do atributo + bônus de proficiência (1x se proficiente, 2x se expert)

export const ATRIBUTOS_ABREV = {
  forca: 'FOR', destreza: 'DES', constituicao: 'CON',
  inteligencia: 'INT', sabedoria: 'SAB', carisma: 'CAR',
};

// Tabela 1-1: +2 (níveis 1-4), +3 (5-8), +4 (9-12). Acima de 12 segue o mesmo padrão.
export function bonusPorNivel(nivel) {
  const n = Math.max(1, Math.floor(Number(nivel)) || 1);
  return Math.floor((n - 1) / 4) + 2;
}

// "+2", "-1", "2 (anel)" -> número. Texto sem número vale 0.
export function numeroDe(texto) {
  const m = String(texto ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export function nivelProficiencia(per) {
  return per.expert ? 2 : (per.proficiente ? 1 : 0);
}

// Com atributo escolhido o total é calculado; sem atributo vale o total digitado à mão (fichas antigas).
export function totalPericia(per, atributos, bonus) {
  if (!per.atributo) return Number(per.total) || 0;
  return (Number(atributos?.[per.atributo]) || 0) + nivelProficiencia(per) * (Number(bonus) || 0) + numeroDe(per.outros);
}

export function comSinal(n) {
  return `${n >= 0 ? '+' : ''}${n}`;
}
