import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';
import { tocarSomDado, tocarSomCritico, tocarSomFalha } from '../audio';
import { rolarFormula, parseFormula, adicionarDado, descreverRolagem, ehD20Unico } from '../dados';

const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100];

export default function DiceRoller() {
  const [aberto, setAberto] = useState(false);
  const [formula, setFormula] = useState('1d20');
  const [historico, setHistorico] = useState([]);
  const formulaValida = !!parseFormula(formula);

  useEffect(() => {
    const socket = conectarSocket();
    const aoRolar = (dados) => {
      setHistorico((h) => [dados, ...h].slice(0, 8));
      const d20Unico = ehD20Unico(dados.expressao);
      if (d20Unico && dados.valores[0] === 20) tocarSomCritico();
      else if (d20Unico && dados.valores[0] === 1) tocarSomFalha();
      else tocarSomDado();
    };
    socket.on('dado-rolado', aoRolar);
    return () => socket.off('dado-rolado', aoRolar);
  }, []);

  function rolar() {
    const r = rolarFormula(formula);
    if (!r) return;
    const socket = conectarSocket();
    socket.emit('rolar-dado', r);
  }

  return (
    <>
      <button onClick={() => setAberto(!aberto)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1 px-2 py-3 rounded-l-xl shadow-lg"
        style={{ background: 'var(--gold)', color: '#120810' }} title="Rolar dados">
        <span className="text-xl leading-none">🎲</span>
        <span className="text-[10px] font-semibold tracking-wide [writing-mode:vertical-rl]">DADOS</span>
      </button>

      {aberto && (
        <div className="fixed top-1/2 -translate-y-1/2 right-14 w-96 max-w-[85vw] rounded-lg p-4 z-40 shadow-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h4 className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--gold)' }}>Rolar dados</h4>

          <p className="text-[11px] mb-2" style={{ color: 'var(--text-dim)' }}>
            Clique nos dados para somar (clique de novo para aumentar a quantidade) ou digite a fórmula, ex: 2d6+4d12+3
          </p>

          <div className="flex gap-1 flex-wrap mb-3">
            {TIPOS_DADO.map(d => (
              <button key={d} onClick={() => setFormula(f => adicionarDado(f, d, 1))}
                onContextMenu={e => { e.preventDefault(); setFormula(f => adicionarDado(f, d, -1)); }}
                title="Clique: +1 dado · Botão direito: −1 dado"
                className="px-2.5 py-1 rounded text-xs font-medium"
                style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                d{d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <input value={formula} onChange={e => setFormula(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') rolar(); }}
              placeholder="2d6+4d12+3" spellCheck={false} autoCapitalize="off" autoCorrect="off"
              className="flex-1 min-w-0 px-2 py-1.5 rounded text-sm font-mono"
              style={{ background: 'var(--surface-2)', border: `1px solid ${formulaValida || !formula ? 'var(--border)' : 'var(--danger)'}`, color: 'var(--text)' }} />
            <button onClick={() => setFormula('')} title="Limpar"
              className="px-2 py-1.5 rounded text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
              limpar
            </button>
          </div>

          <button onClick={rolar} disabled={!formulaValida}
            className="w-full py-2 rounded text-sm font-medium mb-3 disabled:opacity-40" style={{ background: 'var(--shadow)', color: '#fff' }}>
            {formulaValida ? `Rolar ${formula.replace(/\s+/g, '')}` : 'Fórmula inválida (ex: 2d6+4d12+3)'}
          </button>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {historico.map((h, i) => (
              <div key={i} className="text-xs flex items-center justify-between gap-2 py-1" style={{ color: 'var(--text-dim)', borderBottom: i < historico.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className="min-w-0">
                  <b style={{ color: 'var(--text)' }}>{h.jogador}</b>
                  {h.contexto && <> · <span style={{ color: 'var(--gold)' }}>{h.contexto}</span></>}
                  {' '}· {descreverRolagem(h)}
                </span>
                <b className="flex-shrink-0 text-sm" style={{ color: 'var(--gold)' }}>{h.resultado}</b>
              </div>
            ))}
            {historico.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhuma rolagem ainda.</p>}
          </div>
        </div>
      )}
    </>
  );
}
