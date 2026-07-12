let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    const AudioContextClasse = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClasse();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tocarTom(freq, duracao, tipo = 'sine', volume = 0.15, atraso = 0) {
  try {
    const ctx = getCtx();
    const inicio = ctx.currentTime + atraso;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, inicio);
    gain.gain.setValueAtTime(volume, inicio);
    gain.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
    osc.connect(gain).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + duracao);
  } catch {
    // navegador sem suporte a Web Audio, ou ainda sem interação do usuário - ignora silenciosamente
  }
}

// som padrão de dado rolando (tipo um "clique" seco)
export function tocarSomDado() {
  tocarTom(180, 0.08, 'square', 0.12);
  tocarTom(140, 0.07, 'square', 0.09, 0.05);
}

// acerto crítico (natural 20): tilintar ascendente e brilhante
export function tocarSomCritico() {
  tocarTom(523, 0.15, 'sine', 0.18);
  tocarTom(659, 0.15, 'sine', 0.18, 0.08);
  tocarTom(784, 0.3, 'sine', 0.2, 0.16);
}

// falha crítica (natural 1): tom descendente e grave
export function tocarSomFalha() {
  tocarTom(220, 0.25, 'sawtooth', 0.15);
  tocarTom(160, 0.3, 'sawtooth', 0.13, 0.12);
  tocarTom(100, 0.35, 'sawtooth', 0.1, 0.24);
}
