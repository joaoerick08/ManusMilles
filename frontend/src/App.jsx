import { useEffect, useState } from 'react';
import { getUsuario, sair, api } from './api';
import Login from './pages/Login';
import FichaJogador from './pages/FichaJogador';
import PainelMestre from './pages/PainelMestre';
import MapaInterativo from './pages/MapaInterativo';
import PainelCombate from './pages/PainelCombate';
import ImageOverlay from './components/ImageOverlay';
import ShadowOverlay from './components/ShadowOverlay';
import TrocarSenha from './components/TrocarSenha';
import DiceRoller from './components/DiceRoller';
import MaxuelGame from './components/MaxuelGame';

export default function App() {
  const [usuario, setUsuario] = useState(getUsuario());
  const [meuPersonagem, setMeuPersonagem] = useState(null);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [viewPlayer, setViewPlayer] = useState('ficha');

  useEffect(() => {
    if (usuario && usuario.papel === 'player') {
      api.get('/personagens').then(({ data }) => setMeuPersonagem(data[0]?.id ?? null));
    }
  }, [usuario]);

  if (!usuario) return <Login aoLogar={setUsuario} />;

  return (
    <div>
      <header className="flex justify-between items-center px-4 py-3 flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="display text-lg" style={{ color: 'var(--gold)' }}>Manus Milles</span>
        <div className="flex items-center gap-3 flex-wrap">
          {usuario.papel === 'player' && (
            <div className="flex gap-1">
              <button onClick={() => setViewPlayer('ficha')} className="text-xs px-2 py-1 rounded"
                style={viewPlayer === 'ficha' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                Ficha
              </button>
              <button onClick={() => setViewPlayer('mapa')} className="text-xs px-2 py-1 rounded"
                style={viewPlayer === 'mapa' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                Mapa
              </button>
              <button onClick={() => setViewPlayer('combate')} className="text-xs px-2 py-1 rounded"
                style={viewPlayer === 'combate' ? { background: 'var(--gold)', color: '#120810' } : { border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                Combate
              </button>
            </div>
          )}
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>{usuario.nome}</span>
          <button onClick={() => setTrocandoSenha(true)} className="text-xs px-2 py-1 rounded"
            style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Trocar senha
          </button>
          <button onClick={() => { sair(); setUsuario(null); }} className="text-xs px-2 py-1 rounded"
            style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Sair
          </button>
        </div>
      </header>

      {usuario.papel === 'mestre'
        ? <PainelMestre />
        : viewPlayer === 'mapa'
          ? <MapaInterativo />
          : viewPlayer === 'combate'
            ? <PainelCombate editavel={false} />
            : (meuPersonagem
                ? <FichaJogador personagemId={meuPersonagem} />
                : <p className="text-center mt-10" style={{ color: 'var(--text-dim)' }}>Nenhuma ficha vinculada ainda. Fale com o mestre.</p>)}

      <ImageOverlay />
      <ShadowOverlay />
      <DiceRoller />
      <MaxuelGame />
      {trocandoSenha && <TrocarSenha aoFechar={() => setTrocandoSenha(false)} />}
    </div>
  );
}
