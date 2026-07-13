import { useEffect, useState } from 'react';
import { api, conectarSocket } from '../api';
import FichaJogador from './FichaJogador';
import MapaInterativo from './MapaInterativo';
import PainelCombate from './PainelCombate';
import SelecaoJogadores from './SelecaoJogadores';
import UsuariosOnline from '../components/UsuariosOnline';

export default function PainelMestre() {
  const [personagens, setPersonagens] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [abaLateral, setAbaLateral] = useState('fichas');

  async function carregar() {
    const [{ data: p }, { data: u }] = await Promise.all([
      api.get('/personagens'),
      api.get('/usuarios'),
    ]);
    setPersonagens(p);
    setUsuarios(u);
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <aside className="w-full md:w-64 flex-shrink-0 p-4" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        <h2 className="display text-lg mb-4" style={{ color: 'var(--gold)' }}>Mesa</h2>

        <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <UsuariosOnline />
        </div>

        <div className="flex gap-1 mb-4 flex-wrap">
          <button onClick={() => setAbaLateral('fichas')} className="flex-1 py-1.5 rounded text-xs"
            style={abaLateral === 'fichas' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Fichas
          </button>
          <button onClick={() => setAbaLateral('transmitir')} className="flex-1 py-1.5 rounded text-xs"
            style={abaLateral === 'transmitir' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Transmitir
          </button>
          <button onClick={() => setAbaLateral('jogadores')} className="flex-1 py-1.5 rounded text-xs"
            style={abaLateral === 'jogadores' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Jogadores
          </button>
          <button onClick={() => setAbaLateral('mapa')} className="flex-1 py-1.5 rounded text-xs"
            style={abaLateral === 'mapa' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Mapa
          </button>
          <button onClick={() => setAbaLateral('combate')} className="flex-1 py-1.5 rounded text-xs"
            style={abaLateral === 'combate' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Combate
          </button>
          <button onClick={() => setAbaLateral('selecao')} className="flex-1 py-1.5 rounded text-xs"
            style={abaLateral === 'selecao' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Online
          </button>
        </div>

        {abaLateral === 'fichas' && (
          <div className="space-y-1">
            {personagens.map(p => (
              <button key={p.id} onClick={() => setSelecionado(p.id)}
                className="w-full text-left px-3 py-2 rounded text-sm"
                style={selecionado === p.id ? { background: 'var(--surface-2)', color: 'var(--gold)' } : { color: 'var(--text)' }}>
                {p.nome || '(sem nome)'}
              </button>
            ))}
          </div>
        )}

        {abaLateral === 'transmitir' && <PainelTransmitir usuarios={usuarios} />}
        {abaLateral === 'jogadores' && <PainelJogadores usuarios={usuarios} recarregar={carregar} />}
        {abaLateral === 'mapa' && <PainelMapas />}
      </aside>

      <main className="flex-1 py-4">
        {abaLateral === 'mapa'
          ? <MapaInterativo />
          : abaLateral === 'combate'
            ? <PainelCombate editavel={true} />
            : abaLateral === 'selecao'
              ? <SelecaoJogadores />
              : (selecionado
                  ? <FichaJogador personagemId={selecionado} />
                  : <p className="text-center mt-10" style={{ color: 'var(--text-dim)' }}>Selecione uma ficha na barra lateral</p>)}
      </main>
    </div>
  );
}

function PainelMapas() {
  const [mapas, setMapas] = useState([]);
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');

  async function carregar() {
    const { data } = await api.get('/mapas');
    setMapas(data);
  }

  useEffect(() => { carregar(); }, []);

  async function enviar() {
    if (!arquivo) { setMsg('Escolhe uma imagem primeiro'); return; }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('mapa', arquivo);
      form.append('nome', nome || 'Mapa sem nome');
      await api.post('/mapas', form);
      setNome(''); setArquivo(null); setMsg('Mapa adicionado!');
      carregar();
    } catch (err) {
      const detalhe = err.response
        ? `Erro ${err.response.status}: ${typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : 'resposta inesperada do servidor'}`
        : `Sem resposta do servidor (${err.message}).`;
      setMsg(detalhe);
      console.error('Falha ao enviar mapa:', err);
    } finally {
      setEnviando(false);
    }
  }

  async function ativar(id) {
    await api.put(`/mapas/${id}/ativar`);
    carregar();
  }

  async function excluir(id) {
    if (!confirm('Excluir esse mapa?')) return;
    await api.delete(`/mapas/${id}`);
    carregar();
  }

  async function limparPins(id) {
    await api.delete(`/mapas/${id}/pins`);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <input placeholder="Nome do mapa" value={nome} onChange={e => setNome(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input type="file" accept="image/*" onChange={e => setArquivo(e.target.files[0])} className="w-full text-xs" style={{ color: 'var(--text-dim)' }} />
        <button onClick={enviar} disabled={enviando} className="w-full py-1.5 rounded text-sm" style={{ background: 'var(--gold)', color: '#120810' }}>
          {enviando ? 'Enviando...' : '+ Adicionar mapa'}
        </button>
        {msg && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{msg}</p>}
      </div>

      <div className="space-y-2">
        {mapas.map(m => (
          <div key={m.id} className="p-2 rounded text-sm" style={{ background: m.ativo ? 'var(--surface-2)' : 'transparent', border: '1px solid var(--border)' }}>
            <p className="font-medium" style={{ color: m.ativo ? 'var(--gold)' : 'var(--text)' }}>
              {m.nome} {m.ativo && '· ativo'}
            </p>
            <div className="flex gap-2 mt-1">
              {!m.ativo && <button onClick={() => ativar(m.id)} className="text-xs" style={{ color: 'var(--gold)' }}>usar este</button>}
              {m.ativo && <button onClick={() => limparPins(m.id)} className="text-xs" style={{ color: 'var(--text-dim)' }}>limpar pins</button>}
              <button onClick={() => excluir(m.id)} className="text-xs" style={{ color: 'var(--danger)' }}>excluir</button>
            </div>
          </div>
        ))}
        {mapas.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Nenhum mapa ainda.</p>}
      </div>
    </div>
  );
}

function PainelTransmitir({ usuarios }) {
  const [destino, setDestino] = useState('todos');
  const [arquivo, setArquivo] = useState(null);
  const [urlExterna, setUrlExterna] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const [destinoSombra, setDestinoSombra] = useState(usuarios[0]?.id ?? '');
  const [enfaseMaxuel, setEnfaseMaxuel] = useState(1);

  function soltarMaxuel() {
    const socket = conectarSocket();
    socket.emit('soltar-gato', { enfaseValor: Number(enfaseMaxuel) || 1 });
  }

  async function invocarSombra() {
    if (!destinoSombra) { setMsg('Escolha um jogador'); return; }
    try {
      await api.post('/invocar-sombra', { usuario_id: destinoSombra });
      setMsg('Sombra invocada!');
    } catch {
      setMsg('Erro ao invocar a sombra');
    }
  }

  async function enviar() {
    setEnviando(true); setMsg('');
    try {
      const form = new FormData();
      form.append('destino', destino);
      if (arquivo) form.append('imagem', arquivo);
      else if (urlExterna) form.append('url', urlExterna);
      else { setMsg('Escolha uma imagem ou cole uma URL'); setEnviando(false); return; }
      await api.post('/broadcast', form);
      setMsg('Enviado!');
      setArquivo(null); setUrlExterna('');
    } catch (err) {
      const detalhe = err.response
        ? `Erro ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : `Sem resposta do servidor (${err.message}). Confira se o backend está rodando.`;
      setMsg(detalhe);
      console.error('Falha ao transmitir:', err);
    } finally {
      setEnviando(false);
    }
  }

  async function limpar() {
    await api.post('/broadcast/limpar', { destino });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Mostrar para</label>
        <select value={destino} onChange={e => setDestino(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="todos">Todos os jogadores</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>Imagem, GIF ou vídeo (arquivo)</label>
        <input type="file" accept="image/*,video/*" onChange={e => setArquivo(e.target.files[0])}
          className="w-full text-xs" style={{ color: 'var(--text-dim)' }} />
      </div>

      <div className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>ou</div>

      <input placeholder="Cole uma URL de imagem" value={urlExterna} onChange={e => setUrlExterna(e.target.value)}
        className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />

      <button onClick={enviar} disabled={enviando}
        className="w-full py-2 rounded text-sm font-medium" style={{ background: 'var(--gold)', color: '#120810' }}>
        {enviando ? 'Enviando...' : 'Mostrar imagem'}
      </button>
      <button onClick={limpar} className="w-full py-2 rounded text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
        Limpar tela
      </button>

      {msg && <p className="text-xs text-center" style={{ color: 'var(--gold)' }}>{msg}</p>}

      <div className="pt-3 mt-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
        <label className="text-xs block mb-1" style={{ color: 'var(--shadow)' }}>Invocar a Sombra</label>
        <select value={destinoSombra} onChange={e => setDestinoSombra(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <button onClick={invocarSombra} className="w-full py-2 rounded text-sm font-medium"
          style={{ background: 'var(--shadow)', color: 'var(--text)' }}>
          A sombra quer te oferecer um acordo...
        </button>
      </div>

      <div className="pt-3 mt-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
        <label className="text-xs block mb-1" style={{ color: 'var(--gold)' }}>🐈 Soltar o Maxuel</label>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Catarse</span>
          <input type="number" min="1" value={enfaseMaxuel} onChange={e => setEnfaseMaxuel(Math.max(1, Number(e.target.value)))}
            className="w-14 text-center py-1 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button onClick={soltarMaxuel} className="flex-1 py-1.5 rounded text-sm font-medium" style={{ background: 'var(--gold)', color: '#120810' }}>
            Soltar na tela de todos
          </button>
        </div>
        <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
          Ele aparece pequeno em um lugar aleatório da tela. Quem clicar primeiro ganha a Catarse.
        </p>
      </div>
    </div>
  );
}

function PainelJogadores({ usuarios, recarregar }) {
  const [novo, setNovo] = useState({ nome: '', login: '', senha: '' });
  const [msg, setMsg] = useState('');

  async function adicionar() {
    if (!novo.nome || !novo.login || !novo.senha) { setMsg('Preencha tudo'); return; }
    try {
      await api.post('/usuarios', novo);
      setNovo({ nome: '', login: '', senha: '' });
      setMsg('Jogador criado!');
      recarregar();
    } catch (e) {
      setMsg(e.response?.data?.erro || 'Erro');
    }
  }

  async function remover(id) {
    if (!confirm('Remover este jogador e sua ficha?')) return;
    await api.delete(`/usuarios/${id}`);
    recarregar();
  }

  return (
    <div className="space-y-3">
      {usuarios.map(u => (
        <div key={u.id} className="flex justify-between items-center text-sm p-2 rounded" style={{ background: 'var(--surface-2)' }}>
          <div>
            <p>{u.nome}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>login: {u.login}</p>
          </div>
          <button onClick={() => remover(u.id)} style={{ color: 'var(--danger)' }}>✕</button>
        </div>
      ))}

      <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
        <input placeholder="Nome do jogador" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input placeholder="Login" value={novo.login} onChange={e => setNovo({ ...novo, login: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input placeholder="Senha" value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <button onClick={adicionar} className="w-full py-1.5 rounded text-sm" style={{ background: 'var(--gold)', color: '#120810' }}>
          Criar jogador
        </button>
        {msg && <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>{msg}</p>}
      </div>
    </div>
  );
}
