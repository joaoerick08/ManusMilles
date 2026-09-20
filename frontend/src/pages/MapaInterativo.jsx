import { useEffect, useState, useCallback } from 'react';
import { api, conectarSocket, getUsuario } from '../api';

const TIPOS_MARCADOR = {
  npc: { icone: '🧑', label: 'NPC', cor: '#4f9de0' },
  inimigo: { icone: '☠️', label: 'Inimigo', cor: '#e0554f' },
  interesse: { icone: '⭐', label: 'Ponto de interesse', cor: '#e0c94f' },
};

export default function MapaInterativo() {
  const [mapa, setMapa] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const usuario = getUsuario();
  const souMestre = usuario?.papel === 'mestre';

  const [modoMarcador, setModoMarcador] = useState(false);
  const [nomeMarcador, setNomeMarcador] = useState('');
  const [tipoMarcador, setTipoMarcador] = useState('npc');

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
    const aoAdicionarMarcador = (marcador) => setMapa((m) => {
      if (!m || m.id !== marcador.mapa_id) return m;
      return { ...m, marcadores: [...(m.marcadores || []), marcador] };
    });
    const aoRemoverMarcador = ({ mapa_id, marcador_id }) => setMapa((m) => {
      if (!m || m.id !== mapa_id) return m;
      return { ...m, marcadores: (m.marcadores || []).filter(mk => mk.id !== marcador_id) };
    });
    socket.on('mapa-trocado', aoTrocarMapa);
    socket.on('mapa-pin-atualizado', aoAtualizarPin);
    socket.on('mapa-pin-removido', aoRemoverPin);
    socket.on('mapa-pins-limpos', aoLimparPins);
    socket.on('mapa-marcador-adicionado', aoAdicionarMarcador);
    socket.on('mapa-marcador-removido', aoRemoverMarcador);
    return () => {
      socket.off('mapa-trocado', aoTrocarMapa);
      socket.off('mapa-pin-atualizado', aoAtualizarPin);
      socket.off('mapa-pin-removido', aoRemoverPin);
      socket.off('mapa-pins-limpos', aoLimparPins);
      socket.off('mapa-marcador-adicionado', aoAdicionarMarcador);
      socket.off('mapa-marcador-removido', aoRemoverMarcador);
    };
  }, []);

  async function colocarPin(e) {
    if (!mapa) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (modoMarcador) {
      if (!nomeMarcador.trim()) return;
      const { data: marcadorSalvo } = await api.post(`/mapas/${mapa.id}/marcadores`, { nome: nomeMarcador.trim(), tipo: tipoMarcador, x, y });
      setMapa((m) => {
        if (!m || m.id !== marcadorSalvo.mapa_id) return m;
        return { ...m, marcadores: [...(m.marcadores || []), marcadorSalvo] };
      });
      setNomeMarcador('');
      setModoMarcador(false);
      return;
    }

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

  async function removerMarcador(marcadorId) {
    if (!mapa || !souMestre) return;
    await api.delete(`/mapas/${mapa.id}/marcadores/${marcadorId}`);
    setMapa((m) => m ? { ...m, marcadores: (m.marcadores || []).filter(mk => mk.id !== marcadorId) } : m);
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

      {souMestre && (
        <div className="mb-3 p-2 rounded space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap gap-2 items-center">
            <input placeholder="Nome (ex: Bandido, Lobo, Baú)" value={nomeMarcador} onChange={e => setNomeMarcador(e.target.value)}
              className="flex-1 min-w-[140px] px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <select value={tipoMarcador} onChange={e => setTipoMarcador(e.target.value)}
              className="px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {Object.entries(TIPOS_MARCADOR).map(([chave, info]) => (
                <option key={chave} value={chave}>{info.icone} {info.label}</option>
              ))}
            </select>
            <button
              onClick={() => setModoMarcador(v => !v)}
              disabled={!nomeMarcador.trim() && !modoMarcador}
              className="px-3 py-1 rounded text-sm font-medium"
              style={modoMarcador
                ? { background: 'var(--shadow)', color: '#fff' }
                : { background: 'var(--gold)', color: '#120810' }}>
              {modoMarcador ? 'Cancelar' : '+ Marcador'}
            </button>
          </div>
          {modoMarcador && (
            <p className="text-[10px]" style={{ color: 'var(--gold)' }}>Toque no mapa onde quer colocar "{nomeMarcador}".</p>
          )}
        </div>
      )}

      <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
        {modoMarcador ? 'Modo marcador ativo — toque no mapa pra posicionar.' : 'Toque no mapa pra marcar onde você quer ir. Todos veem os pins de todos.'}
      </p>

      <div className="relative w-full rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', cursor: modoMarcador ? 'copy' : 'crosshair' }} onClick={colocarPin}>
        <img src={mapa.url} alt={mapa.nome} className="w-full h-auto block select-none" draggable={false} />
        {mapa.pins.map(pin => (
          <div key={`pin-${pin.usuario_id}`}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            onClick={e => e.stopPropagation()}>
            <div className="w-5 h-5 rounded-full border-2 border-white shadow-lg" style={{ background: pin.cor }} />
            <span className="text-[10px] px-1 rounded mt-0.5 whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
              {pin.nome_jogador}
            </span>
          </div>
        ))}
        {(mapa.marcadores || []).map(marcador => {
          const info = TIPOS_MARCADOR[marcador.tipo] || TIPOS_MARCADOR.npc;
          return (
            <div key={`marcador-${marcador.id}`}
              className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center group"
              style={{ left: `${marcador.x}%`, top: `${marcador.y}%` }}
              onClick={e => { e.stopPropagation(); if (souMestre) removerMarcador(marcador.id); }}>
              <div className="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-xs"
                style={{ background: info.cor, cursor: souMestre ? 'pointer' : 'default' }}
                title={souMestre ? 'Clique pra remover' : undefined}>
                {info.icone}
              </div>
              <span className="text-[10px] px-1 rounded mt-0.5 whitespace-nowrap" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                {marcador.nome}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
