import { useState } from 'react';
import { api } from '../api';

export default function TrocarSenha({ aoFechar }) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setMsg('');
    if (senhaNova.length < 4) { setMsg('A nova senha precisa ter pelo menos 4 caracteres'); return; }
    if (senhaNova !== confirmar) { setMsg('As senhas novas não coincidem'); return; }
    setEnviando(true);
    try {
      await api.put('/minha-senha', { senha_atual: senhaAtual, senha_nova: senhaNova });
      setMsg('Senha alterada com sucesso!');
      setTimeout(aoFechar, 1200);
    } catch (err) {
      setMsg(err.response?.data?.erro || 'Erro ao trocar a senha');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={aoFechar}>
      <div className="w-full max-w-sm rounded-lg p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <h3 className="display text-lg" style={{ color: 'var(--gold)' }}>Trocar senha</h3>
        <input type="password" placeholder="Senha atual" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input type="password" placeholder="Nova senha" value={senhaNova} onChange={e => setSenhaNova(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input type="password" placeholder="Confirmar nova senha" value={confirmar} onChange={e => setConfirmar(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        {msg && <p className="text-xs" style={{ color: 'var(--gold)' }}>{msg}</p>}
        <div className="flex gap-2">
          <button onClick={salvar} disabled={enviando} className="flex-1 py-2 rounded text-sm font-medium" style={{ background: 'var(--gold)', color: '#120810' }}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={aoFechar} className="px-4 py-2 rounded text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
