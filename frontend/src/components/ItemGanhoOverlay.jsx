import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';
import { tocarSomItem } from '../audio';

export default function ItemGanhoOverlay() {
  const [item, setItem] = useState(null);

  useEffect(() => {
    const socket = conectarSocket();
    const aoGanhar = (dados) => {
      setItem(dados);
      tocarSomItem();
      setTimeout(() => setItem(null), 5000);
    };
    socket.on('item-ganho', aoGanhar);
    return () => socket.off('item-ganho', aoGanhar);
  }, []);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center cursor-pointer"
      style={{ background: 'rgba(5,2,5,0.8)' }}
      onClick={() => setItem(null)}>
      <div className="relative flex flex-col items-center px-6 py-8 rounded-lg item-ganho-caixa"
        style={{ background: 'var(--surface)', border: '2px solid var(--gold)', boxShadow: '0 0 40px rgba(178,58,79,0.6)' }}>
        <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--gold)' }}>Item conseguido!</p>

        <div className="w-28 h-28 rounded-lg overflow-hidden flex items-center justify-center mb-3 item-ganho-icone"
          style={{ background: 'var(--surface-2)', border: '2px solid var(--gold)' }}>
          {item.imagem_url
            ? <img src={item.imagem_url} alt={item.nome} className="w-full h-full object-cover" />
            : <span className="text-4xl">🎁</span>}
        </div>

        <p className="display text-xl font-bold text-center" style={{ color: 'var(--text)' }}>{item.nome}</p>
        {item.tipo && <p className="text-xs uppercase tracking-wide mt-1" style={{ color: 'var(--text-dim)' }}>{item.tipo}</p>}

        <div className="flex gap-4 mt-2">
          {item.dano && <p className="text-sm" style={{ color: 'var(--gold)' }}>⚔️ Dano: {item.dano}</p>}
          {item.resistencia && <p className="text-sm" style={{ color: 'var(--gold)' }}>🛡️ Resistência: {item.resistencia}</p>}
        </div>

        <p className="text-xs mt-3" style={{ color: 'var(--text-dim)' }}>{item.personagemNome} recebeu um item!</p>
      </div>

      <style>{`
        .item-ganho-caixa { animation: itemSurgir 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .item-ganho-icone { animation: itemBrilho 1.6s ease-in-out infinite; }
        @keyframes itemSurgir {
          0% { transform: scale(0.3); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes itemBrilho {
          0%, 100% { box-shadow: 0 0 10px rgba(178,58,79,0.4); }
          50% { box-shadow: 0 0 25px rgba(178,58,79,0.9); }
        }
      `}</style>
    </div>
  );
}
