import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';

export default function ImageOverlay() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const socket = conectarSocket();
    const aoMostrar = ({ url }) => setUrl(url);
    const aoLimpar = () => setUrl(null);
    socket.on('mostrar-imagem', aoMostrar);
    socket.on('limpar-imagem', aoLimpar);
    return () => {
      socket.off('mostrar-imagem', aoMostrar);
      socket.off('limpar-imagem', aoLimpar);
    };
  }, []);

  if (!url) return null;

  const ehVideo = /\.(mp4|webm|mov|ogg)$/i.test(url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,9,14,0.96)' }}
      onClick={() => setUrl(null)}>
      {ehVideo
        ? <video src={url} autoPlay loop controls className="max-w-full max-h-full rounded shadow-2xl"
            style={{ border: '1px solid var(--gold)' }} onClick={e => e.stopPropagation()} />
        : <img src={url} alt="Cena" className="max-w-full max-h-full rounded shadow-2xl"
            style={{ border: '1px solid var(--gold)' }} />}
      <p className="absolute bottom-6 text-xs" style={{ color: 'var(--text-dim)' }}>toque fora pra fechar</p>
    </div>
  );
}
