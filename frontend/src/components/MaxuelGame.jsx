import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';

export default function MaxuelGame() {
  const [gato, setGato] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const socket = conectarSocket();
    const aoSoltar = (g) => setGato(g);
    const aoCapturar = ({ vencedor, enfaseValor }) => {
      setGato(null);
      setToast(`O Maxuel foi encontrado por ${vencedor}! (+${enfaseValor} Catarse)`);
      setTimeout(() => setToast(null), 4000);
    };
    socket.on('gato-solto', aoSoltar);
    socket.on('gato-capturado', aoCapturar);
    return () => {
      socket.off('gato-solto', aoSoltar);
      socket.off('gato-capturado', aoCapturar);
    };
  }, []);

  function clicar() {
    if (!gato) return;
    const socket = conectarSocket();
    socket.emit('gato-encontrado', { id: gato.id });
    setGato(null);
  }

  return (
    <>
      {gato && (
        <button onClick={clicar}
          className="fixed z-50 w-11 h-11 rounded-full overflow-hidden animate-bounce"
          style={{ top: `${gato.y}%`, left: `${gato.x}%`, boxShadow: '0 0 12px rgba(0,0,0,0.6)' }}
          title="É o Maxuel!">
          <img src="/maxuel.png" alt="Maxuel" className="w-full h-full object-cover" />
        </button>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{ background: 'var(--gold)', color: '#120810' }}>
          🐈 {toast}
        </div>
      )}
    </>
  );
}
