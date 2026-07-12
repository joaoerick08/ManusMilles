import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';
import { tocarSomDado, tocarSomCritico, tocarSomFalha } from '../audio';

const TIPOS_DADO = [4, 6, 8, 10, 12, 20, 100];

function rolarExpressao(qtd, lado, mod) {
  const valores = [];
  for (let i = 0; i < qtd; i++) valores.push(1 + Math.floor(Math.random() * lado));
  const soma = valores.reduce((a, b) => a + b, 0) + mod;
  return { valores, soma };
}

export default function DiceRoller() {
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState(1);
  const [lado, setLado] = useState(20);
  const [mod, setMod] = useState(0);
  const [historico, setHistorico] = useState([]);

  useEffect(() => {
    const socket = conectarSocket();
    const aoRolar = (dados) => {
      setHistorico((h) => [dados, ...h].slice(0, 8));
      const ehD20Unico = /1d20/.test(dados.expressao || '');
      if (ehD20Unico && dados.valores[0] === 20) tocarSomCritico();
      else if (ehD20Unico && dados.valores[0] === 1) tocarSomFalha();
      else tocarSomDado();
    };
    socket.on('dado-rolado', aoRolar);
    return () => socket.off('dado-rolado', aoRolar);
  }, []);

  function rolar() {
    const { valores, soma } = rolarExpressao(qtd, lado, Number(mod) || 0);
    const socket = conectarSocket();
    socket.emit('rolar-dado', {
      expressao: `${qtd}d${lado}${mod > 0 ? '+' + mod : mod < 0 ? mod : ''}`,
      valores,
      resultado: soma,
    });
  }

  return (
    <>
      <button onClick={() => setAberto(!aberto)}
        className="fixed bottom-5 right-5 w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg z-40"
        style={{ background: 'var(--gold)', color: '#120810' }} title="Rolar dados">
        🎲
      </button>

      {aberto && (
        <div className="fixed bottom-24 right-5 w-96 max-w-[92vw] rounded-lg p-4 z-40 shadow-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h4 className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--gold)' }}>Rolar dados</h4>

          <div className="flex gap-1 flex-wrap mb-3">
            {TIPOS_DADO.map(d => (
              <button key={d} onClick={() => setLado(d)}
                className="px-2.5 py-1 rounded text-xs font-medium"
                style={lado === d ? { background: 'var(--gold)', color: '#120810' } : { background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                d{d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Qtd</label>
            <input type="number" min="1" value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
              className="w-14 text-center py-1 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <label className="text-xs" style={{ color: 'var(--text-dim)' }}>Mod</label>
            <input type="number" value={mod} onChange={e => setMod(e.target.value)}
              className="w-14 text-center py-1 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          <button onClick={rolar} className="w-full py-2 rounded text-sm font-medium mb-3" style={{ background: 'var(--shadow)', color: '#fff' }}>
            Rolar {qtd}d{lado}{mod > 0 ? `+${mod}` : mod < 0 ? mod : ''}
          </button>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {historico.map((h, i) => (
              <div key={i} className="text-xs flex items-center justify-between gap-2 py-1" style={{ color: 'var(--text-dim)', borderBottom: i < historico.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className="min-w-0">
                  <b style={{ color: 'var(--text)' }}>{h.jogador}</b>
                  {h.contexto && <> · <span style={{ color: 'var(--gold)' }}>{h.contexto}</span></>}
                  {' '}· {h.expressao} [{h.valores.join(', ')}]
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
