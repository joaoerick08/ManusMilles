import { useEffect, useState, useCallback } from 'react';
import { api, conectarSocket, getUsuario } from '../api';

export default function MapaInterativo() {
  const [mapa, setMapa] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const usuario = getUsuario();

  const carregar = useCallback(async () => {
    const { data } = await api.get('/mapas/ativo');
    setMapa(data);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const socket = conectarSocket();
    const aoTrocarMapa = (novoMapa) => setMapa(novoMapa);
    const aoAtualizarPin = (pin) => setMapa((m) => {
      if (!m || m.id !== pin.mapa_id) return m;
      const outros = m.pins.filter(p => p.usuario_id !== pin.usuario_id);
      return { ...m, pins: [...outros, pin] };
    });
    const aoRemoverPin = ({ mapa_id, usuario_id }) => setMapa((m) => {
      if (!m || m.id !== mapa_id) return m;
      return { ...m, pins: m.pins.filter(p => p.usuario_id !== usuario_id) };
    });
    const aoLimparPins = ({ mapa_id }) => setMapa((m) => {
      if (!m || m.id !== mapa_id) return m;
      return { ...m, pins: [] };
    });
    socket.on('mapa-trocado', aoTrocarMapa);
    socket.on('mapa-pin-atualizado', aoAtualizarPin);
    socket.on('mapa-pin-removido', aoRemoverPin);
    socket.on('mapa-pins-limpos', aoLimparPins);
    return () => {
      socket.off('mapa-trocado', aoTrocarMapa);
      socket.off('mapa-pin-atualizado', aoAtualizarPin);
      socket.off('mapa-pin-removido', aoRemoverPin);
      socket.off('mapa-pins-limpos', aoLimparPins);
    };
  }, []);

  async function colocarPin(e) {
    if (!mapa) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const { data: pinSalvo } = await api.post(`/mapas/${mapa.id}/pins`, { x, y });
    // atualização otimista: garante que o próprio pin apareça na hora, sem depender do socket
    setMapa((m) => {
      if (!m || m.id !== pinSalvo.mapa_id) return m;
      const outros = m.pins.filter(p => p.usuario_id !== pinSalvo.usuario_id);
      return { ...m, pins: [...outros, pinSalvo] };
    });
  }

  async function removerMeuPin() {
    if (!mapa) return;
    await api.delete(`/mapas/${mapa.id}/pins/mine`);
    setMapa((m) => m ? { ...m, pins: m.pins.filter(p => p.usuario_id !== usuario.id) } : m);
  }

  // reforço: busca o estado mais recente periodicamente, além do tempo real via socket
  useEffect(() => {
    const intervalo = setInterval(() => { carregar(); }, 6000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  if (carregando) return <div className="p-8 text-center" style={{ color: 'var(--text-dim)' }}>Carregando mapa...</div>;
  if (!mapa) return <div className="p-8 text-center" style={{ color: 'var(--text-dim)' }}>Nenhum mapa ativo ainda. Peça pro mestre subir um.</div>;

  const meuPin = mapa.pins.find(p => p.usuario_id === usuario.id);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="display text-lg" style={{ color: 'var(--gold)' }}>{mapa.nome}</h2>
        {meuPin && (
          <button onClick={removerMeuPin} className="text-xs px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            remover meu pin
          </button>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>Toque no mapa pra marcar onde você quer ir. Todos veem os pins de todos.</p>

      <div className="relative w-full rounded-lg overflow-hidden cursor-crosshair" style={{ border: '1px solid var(--border)' }} onClick={colocarPin}>
        <img src={mapa.url} alt={mapa.nome} className="w-full h-auto block select-none" draggable={false} />
        {mapa.pins.map(pin => (
          <div key={pin.usuario_id}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            onClick={e => e.stopPropagation()}>
            <div className="w-5 h-5 rounded-full border-2 border-white shadow-lg" style={{ background: pin.cor }} />
            <span className="text-[10px] px-1 rounded mt-0.5 whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
              {pin.nome_jogador}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
