import { useEffect, useState } from 'react';
import { api, conectarSocket, getUsuario } from '../api';

function ehVideo(url) {
  return /\.(mp4|webm|mov|ogg|m4v|avi|mkv|3gp)$/i.test(url || '');
}

export default function Galeria() {
  const [itens, setItens] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const usuario = getUsuario();

  useEffect(() => {
    api.get('/broadcasts').then(({ data }) => { setItens(data); setCarregando(false); });
  }, []);

  useEffect(() => {
    const socket = conectarSocket();
    const aoChegar = (novo) => setItens((atual) => {
      if (atual.some(i => i.id === novo.id)) return atual;
      return [novo, ...atual];
    });
    const aoRemover = ({ id }) => setItens((atual) => atual.filter(i => i.id !== id));
    socket.on('galeria-novo-item', aoChegar);
    socket.on('galeria-item-removido', aoRemover);
    return () => {
      socket.off('galeria-novo-item', aoChegar);
      socket.off('galeria-item-removido', aoRemover);
    };
  }, []);

  async function excluir(id, e) {
    e.stopPropagation();
    if (!confirm('Apagar essa imagem/vídeo pra sempre? Não tem como desfazer.')) return;
    await api.delete(`/broadcasts/${id}`);
    setItens((atual) => atual.filter(i => i.id !== id));
    if (aberto?.id === id) setAberto(null);
  }

  if (carregando) return <div className="p-8 text-center" style={{ color: 'var(--text-dim)' }}>Carregando galeria...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="text-center mb-6">
        <h2 className="display text-2xl" style={{ color: 'var(--gold)' }}>Galeria</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
          Tudo que já foi mostrado na mesa ({itens.length})
        </p>
      </div>

      {itens.length === 0 && (
        <p className="text-center text-sm" style={{ color: 'var(--text-dim)' }}>Nada foi transmitido ainda.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {itens.map(item => (
          <div key={item.id} className="relative">
            <button onClick={() => setAberto(item)}
              className="aspect-square w-full rounded-lg overflow-hidden relative block"
              style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {ehVideo(item.url) ? (
                <video src={item.url} className="w-full h-full object-cover" muted />
              ) : (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
              {ehVideo(item.url) && (
                <span className="absolute bottom-1 right-1 text-xs px-1 rounded" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>▶</span>
              )}
            </button>
            {usuario.papel === 'mestre' && (
              <button onClick={(e) => excluir(item.id, e)} title="Apagar pra sempre"
                className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--danger)' }}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,2,5,0.92)' }}
          onClick={() => setAberto(null)}>
          {usuario.papel === 'mestre' && (
            <button onClick={(e) => excluir(aberto.id, e)}
              className="absolute top-4 right-4 text-xs px-3 py-1.5 rounded" style={{ background: 'var(--danger)', color: '#fff' }}>
              ✕ Apagar
            </button>
          )}
          {ehVideo(aberto.url)
            ? <video src={aberto.url} controls autoPlay className="max-w-full max-h-full rounded" style={{ border: '1px solid var(--gold)' }} onClick={e => e.stopPropagation()} />
            : <img src={aberto.url} alt="" className="max-w-full max-h-full rounded" style={{ border: '1px solid var(--gold)' }} onClick={e => e.stopPropagation()} />}
        </div>
      )}
    </div>
  );
}
