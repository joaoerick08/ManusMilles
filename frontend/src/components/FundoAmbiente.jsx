import { useEffect, useState } from 'react';
import { api, conectarSocket } from '../api';

export default function FundoAmbiente() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    api.get('/config/fundo').then(({ data }) => setUrl(data.url)).catch(() => {});
  }, []);

  useEffect(() => {
    const socket = conectarSocket();
    const aoAtualizar = (dados) => setUrl(dados.url);
    socket.on('fundo-atualizado', aoAtualizar);
    return () => socket.off('fundo-atualizado', aoAtualizar);
  }, []);

  if (!url) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: -1 }}>
      <div
        className="w-full h-full"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(10,4,8,0.75) 0%, rgba(10,4,8,0.88) 100%), url('${url}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      />
    </div>
  );
}
