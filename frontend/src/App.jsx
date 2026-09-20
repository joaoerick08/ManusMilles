import { useEffect, useState } from 'react';
import { getUsuario, sair, api } from './api';
import Login from './pages/Login';
import FichaJogador from './pages/FichaJogador';
import PainelMestre from './pages/PainelMestre';
import MapaInterativo from './pages/MapaInterativo';
import PainelCombate from './pages/PainelCombate';
import SelecaoJogadores from './pages/SelecaoJogadores';
import Galeria from './pages/Galeria';
import ImageOverlay from './components/ImageOverlay';
import ShadowOverlay from './components/ShadowOverlay';
import TrocarSenha from './components/TrocarSenha';
import DiceRoller from './components/DiceRoller';
import MaxuelGame from './components/MaxuelGame';
import ProtecaoErro from './components/ProtecaoErro';
import ItemGanhoOverlay from './components/ItemGanhoOverlay';
import FundoAmbiente from './components/FundoAmbiente';

const ABAS_PLAYER = [
  { key: 'ficha', label: 'Ficha', icone: '📜' },
  { key: 'mapa', label: 'Mapa', icone: '🗺️' },
  { key: 'combate', label: 'Combate', icone: '⚔️' },
  { key: 'selecao', label: 'Online', icone: '🟢' },
  { key: 'galeria', label: 'Galeria', icone: '🖼️' },
];

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
      <header className="flex justify-between items-center px-4 sm:px-6 py-3 flex-wrap gap-3 sticky top-0 z-30"
        style={{ background: 'rgba(18,8,16,0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <span className="display text-lg sm:text-xl" style={{ color: 'var(--gold)' }}>Manus Milles</span>
        <div className="flex items-center gap-3 flex-wrap">
          {usuario.papel === 'player' && (
            <div className="flex gap-1.5 flex-wrap">
              {ABAS_PLAYER.map(({ key, label, icone }) => (
                <button key={key} onClick={() => setViewPlayer(key)}
                  className="flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg font-medium transition-colors"
                  style={viewPlayer === key
                    ? { background: 'var(--gold)', color: '#120810' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                  <span>{icone}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}
          <span className="text-sm hidden md:inline" style={{ color: 'var(--text-dim)' }}>{usuario.nome}</span>
          <button onClick={() => setTrocandoSenha(true)} className="text-xs px-2.5 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Trocar senha
          </button>
          <button onClick={() => { sair(); setUsuario(null); }} className="text-xs px-2.5 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
            Sair
          </button>
        </div>
      </header>

      {usuario.papel === 'mestre'
        ? <ProtecaoErro><PainelMestre /></ProtecaoErro>
        : viewPlayer === 'mapa'
          ? <ProtecaoErro><MapaInterativo /></ProtecaoErro>
          : viewPlayer === 'combate'
            ? <ProtecaoErro><PainelCombate editavel={false} /></ProtecaoErro>
            : viewPlayer === 'selecao'
              ? <ProtecaoErro><SelecaoJogadores /></ProtecaoErro>
              : viewPlayer === 'galeria'
                ? <ProtecaoErro><Galeria /></ProtecaoErro>
                : (meuPersonagem
                    ? <ProtecaoErro><FichaJogador personagemId={meuPersonagem} /></ProtecaoErro>
                    : <p className="text-center mt-10" style={{ color: 'var(--text-dim)' }}>Nenhuma ficha vinculada ainda. Fale com o mestre.</p>)}

      <FundoAmbiente />
      <ImageOverlay />
      <ShadowOverlay />
      <DiceRoller />
      <MaxuelGame />
      <ItemGanhoOverlay />
      {trocandoSenha && <TrocarSenha aoFechar={() => setTrocandoSenha(false)} />}
    </div>
  );
}
