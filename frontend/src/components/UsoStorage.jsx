import { useEffect, useState } from 'react';
import { api } from '../api';

const LIMITE_BYTES = 1024 * 1024 * 1024; // 1GB — teto do plano grátis do Supabase

function formatarMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(0);
}

export default function UsoStorage() {
  const [uso, setUso] = useState(null);
  const [erro, setErro] = useState(false);

  async function carregar() {
    try {
      const { data } = await api.get('/config/storage-uso');
      setUso(data);
      setErro(false);
    } catch {
      setErro(true);
    }
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 5 * 60 * 1000); // atualiza a cada 5min
    return () => clearInterval(intervalo);
  }, []);

  if (erro || !uso || !uso.configurado) return null;

  const pct = Math.min(100, (uso.bytes / LIMITE_BYTES) * 100);
  const cor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--gold)' : '#4fae6e';

  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>💾 Armazenamento</span>
        <span className="text-[11px] font-medium" style={{ color: cor }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
        {formatarMB(uso.bytes)}MB de 1024MB · {uso.arquivos} arquivo{uso.arquivos === 1 ? '' : 's'}
      </p>
    </div>
  );
}
