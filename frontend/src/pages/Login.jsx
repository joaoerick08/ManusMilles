import { useState } from 'react';
import { api, salvarSessao } from '../api';

export default function Login({ aoLogar }) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const { data } = await api.post('/login', { login, senha });
      salvarSessao(data.token, data.usuario);
      aoLogar(data.usuario);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível entrar');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(10,4,8,0.55) 0%, rgba(10,4,8,0.75) 55%, rgba(10,4,8,0.96) 100%), url('/hero-sombra.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 20%',
      }}>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <h1 className="display text-4xl tracking-wide" style={{ color: 'var(--text)', textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>Manus Milles</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Fichas de Skyfall RPG</p>
        </div>

        <form onSubmit={enviar} className="rounded-lg p-6 space-y-4 backdrop-blur-sm"
          style={{ background: 'rgba(29,15,26,0.85)', border: '1px solid var(--border)' }}>
          <div>
            <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>Login</label>
            <input value={login} onChange={e => setLogin(e.target.value)} required
              className="w-full mt-1 px-3 py-2 rounded outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>Senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required
              className="w-full mt-1 px-3 py-2 rounded outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          {erro && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erro}</p>}
          <button disabled={carregando} type="submit"
            className="w-full py-2 rounded font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--gold)', color: '#120810' }}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-[11px] mt-6" style={{ color: 'var(--text-dim)' }}>
          feito por João Erick
        </p>
      </div>
    </div>
  );
}
