import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';

export default function UsuariosOnline() {
  const [lista, setLista] = useState([]);

  useEffect(() => {
    const socket = conectarSocket();
    const aoAtualizar = (l) => setLista(l);
    socket.on('usuarios-online', aoAtualizar);
    return () => socket.off('usuarios-online', aoAtualizar);
  }, []);

  return (
    <div>
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--gold)' }}>
        Online agora ({lista.length})
      </p>
      <div className="space-y-1">
        {lista.map(u => (
          <div key={u.id} className="flex items-center gap-2 text-sm">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3a8c5a' }} />
            <span style={{ color: u.papel === 'mestre' ? 'var(--gold)' : 'var(--text)' }}>
              {u.nome} {u.papel === 'mestre' && '(mestre)'}
            </span>
          </div>
        ))}
        {lista.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Ninguém online.</p>}
      </div>
    </div>
  );
}
