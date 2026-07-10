import { useEffect, useState } from 'react';
import { conectarSocket, api } from '../api';

function novoId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export default function PainelCombate({ editavel }) {
  const [combate, setCombate] = useState({ ativo: false, participantes: [], turnoIndex: 0 });
  const [personagens, setPersonagens] = useState([]);
  const [nomeNovo, setNomeNovo] = useState('');
  const [pvNovo, setPvNovo] = useState(10);
  const [iniNovo, setIniNovo] = useState(10);

  useEffect(() => {
    const socket = conectarSocket();
    const aoAtualizar = (c) => setCombate(c);
    socket.on('combate-atualizado', aoAtualizar);
    return () => socket.off('combate-atualizado', aoAtualizar);
  }, []);

  useEffect(() => {
    if (editavel) api.get('/personagens').then(({ data }) => setPersonagens(data));
  }, [editavel]);

  function enviar(novoEstado) {
    const socket = conectarSocket();
    socket.emit('combate:definir', novoEstado);
  }

  function adicionarNpc() {
    if (!nomeNovo) return;
    const participante = { id: novoId(), nome: nomeNovo, iniciativa: Number(iniNovo), pv_atual: Number(pvNovo), pv_max: Number(pvNovo), npc: true };
    const lista = [...combate.participantes, participante].sort((a, b) => b.iniciativa - a.iniciativa);
    enviar({ ...combate, ativo: true, participantes: lista });
    setNomeNovo(''); setPvNovo(10); setIniNovo(10);
  }

  function adicionarPersonagem(p) {
    if (combate.participantes.some(part => part.personagemId === p.id)) return;
    const participante = { id: novoId(), nome: p.nome, iniciativa: p.iniciativa_bonus || 0, pv_atual: p.pv_atual, pv_max: p.pv_max, npc: false, personagemId: p.id };
    const lista = [...combate.participantes, participante].sort((a, b) => b.iniciativa - a.iniciativa);
    enviar({ ...combate, ativo: true, participantes: lista });
  }

  function atualizarParticipante(id, campos) {
    const lista = combate.participantes.map(p => p.id === id ? { ...p, ...campos } : p);
    enviar({ ...combate, participantes: lista });
  }

  function removerParticipante(id) {
    const lista = combate.participantes.filter(p => p.id !== id);
    enviar({ ...combate, participantes: lista });
  }

  function reordenarPorIniciativa() {
    const lista = [...combate.participantes].sort((a, b) => b.iniciativa - a.iniciativa);
    enviar({ ...combate, participantes: lista, turnoIndex: 0 });
  }

  function proximoTurno() {
    const total = combate.participantes.length;
    if (total === 0) return;
    enviar({ ...combate, turnoIndex: (combate.turnoIndex + 1) % total });
  }

  function encerrar() {
    const socket = conectarSocket();
    socket.emit('combate:encerrar');
  }

  if (!combate.ativo && !editavel) {
    return <p className="text-center mt-10" style={{ color: 'var(--text-dim)' }}>Nenhum combate em andamento.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="display text-lg" style={{ color: 'var(--gold)' }}>Combate</h2>
        {editavel && combate.ativo && (
          <div className="flex gap-2">
            <button onClick={reordenarPorIniciativa} className="text-xs px-2 py-1 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
              reordenar
            </button>
            <button onClick={encerrar} className="text-xs px-2 py-1 rounded" style={{ border: '1px solid var(--danger)', color: 'var(--danger)' }}>
              encerrar
            </button>
          </div>
        )}
      </div>

      {combate.participantes.length === 0 && (
        <p className="text-sm mb-4" style={{ color: 'var(--text-dim)' }}>Nenhum participante ainda.</p>
      )}

      <div className="space-y-2 mb-6">
        {combate.participantes.map((p, i) => {
          const daVez = i === combate.turnoIndex;
          return (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded"
              style={{ background: daVez ? 'var(--surface-2)' : 'var(--surface)', border: daVez ? '1px solid var(--gold)' : '1px solid var(--border)' }}>
              <span className="text-lg font-bold w-8 text-center flex-shrink-0" style={{ color: daVez ? 'var(--gold)' : 'var(--text-dim)' }}>
                {p.iniciativa}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {p.nome} {p.npc && <span style={{ color: 'var(--text-dim)' }}>(NPC)</span>} {daVez && <span style={{ color: 'var(--gold)' }}>· turno atual</span>}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>PV: {p.pv_atual}/{p.pv_max}</p>
              </div>
              {editavel && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input type="number" value={p.pv_atual} onChange={e => atualizarParticipante(p.id, { pv_atual: Number(e.target.value) })}
                    className="w-14 text-center py-1 rounded text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <input type="number" value={p.iniciativa} onChange={e => atualizarParticipante(p.id, { iniciativa: Number(e.target.value) })}
                    className="w-12 text-center py-1 rounded text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <button onClick={() => removerParticipante(p.id)} style={{ color: 'var(--danger)' }}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editavel && combate.participantes.length > 0 && (
        <button onClick={proximoTurno} className="w-full py-2 rounded text-sm font-medium mb-6" style={{ background: 'var(--gold)', color: '#120810' }}>
          Próximo turno →
        </button>
      )}

      {editavel && (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--gold)' }}>Adicionar à luta</p>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {personagens.map(p => (
              <button key={p.id} onClick={() => adicionarPersonagem(p)} className="text-xs px-2 py-1 rounded"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
                + {p.nome || '(sem nome)'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <input placeholder="Nome do NPC" value={nomeNovo} onChange={e => setNomeNovo(e.target.value)}
              className="px-2 py-1.5 rounded text-sm col-span-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="number" placeholder="PV" value={pvNovo} onChange={e => setPvNovo(e.target.value)}
              className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="number" placeholder="Iniciativa" value={iniNovo} onChange={e => setIniNovo(e.target.value)}
              className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <button onClick={adicionarNpc} className="w-full py-1.5 rounded text-sm" style={{ background: 'var(--shadow)', color: '#fff' }}>
            + Adicionar NPC
          </button>
        </div>
      )}
    </div>
  );
}
