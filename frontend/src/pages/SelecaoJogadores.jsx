import { useEffect, useState, useCallback } from 'react';
import { api, conectarSocket } from '../api';

export default function SelecaoJogadores() {
  const [personagens, setPersonagens] = useState([]);
  const [online, setOnline] = useState([]);

  const carregar = useCallback(async () => {
    const { data } = await api.get('/personagens/publicos');
    setPersonagens(data);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const socket = conectarSocket();
    const aoAtualizarOnline = (lista) => setOnline(lista);
    const aoAtualizarPersonagem = (p) => setPersonagens((atual) => {
      const outros = atual.filter(x => x.id !== p.id);
      return [...outros, p];
    });
    socket.on('usuarios-online', aoAtualizarOnline);
    socket.on('personagem-publico-atualizado', aoAtualizarPersonagem);
    socket.emit('pedir-online');
    return () => {
      socket.off('usuarios-online', aoAtualizarOnline);
      socket.off('personagem-publico-atualizado', aoAtualizarPersonagem);
    };
  }, []);

  const idsUsuariosOnlinePlayers = online.filter(u => u.papel === 'player').map(u => u.id);
  const personagensOnline = personagens.filter(p => idsUsuariosOnlinePlayers.includes(p.usuario_id));

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="text-center mb-6">
        <h2 className="display text-2xl tracking-widest" style={{ color: 'var(--gold)' }}>QUEM ESTÁ NA MESA</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
          {personagensOnline.length} de {personagens.length} personagens online agora
        </p>
      </div>

      {personagensOnline.length === 0 && (
        <p className="text-center text-sm" style={{ color: 'var(--text-dim)' }}>Nenhum player online no momento.</p>
      )}

      <div className="flex flex-wrap justify-center gap-4">
        {personagensOnline.map(p => (
          <CardSelecao key={p.id} personagem={p} />
        ))}
      </div>
    </div>
  );
}

function CardSelecao({ personagem }) {
  return (
    <div className="w-40 sm:w-48 flex-shrink-0 rounded-md overflow-hidden"
      style={{ border: '3px solid var(--gold)', background: '#0a060a', boxShadow: '0 0 20px rgba(178,58,79,0.35)' }}>
      <div className="py-1.5 text-center" style={{ background: 'var(--gold)' }}>
        <span className="display font-bold text-sm tracking-wider uppercase" style={{ color: '#120810' }}>
          {personagem.nome || '???'}
        </span>
      </div>

      <div className="relative h-56 sm:h-64 flex items-end justify-center overflow-hidden"
        style={{ background: 'repeating-linear-gradient(45deg, #1d0f1a 0 10px, #180c16 10px 20px)' }}>
        {personagem.foto_corpo_url ? (
          <img src={personagem.foto_corpo_url} alt={personagem.nome}
            className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-5xl mb-6 opacity-30">🧍</span>
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 25px rgba(0,0,0,0.6)' }} />
      </div>

      <div className="py-1 text-center" style={{ background: 'rgba(178,58,79,0.9)' }}>
        <span className="text-[10px] tracking-widest uppercase" style={{ color: '#fff' }}>online</span>
      </div>
    </div>
  );
}
