import { useEffect, useState, useCallback, useRef } from 'react';
import { api, conectarSocket, getUsuario } from '../api';
import CampoNum from '../components/CampoNum';

const ATRIBUTOS = [
  ['forca', 'Força'], ['destreza', 'Destreza'], ['constituicao', 'Constituição'],
  ['inteligencia', 'Inteligência'], ['sabedoria', 'Sabedoria'], ['carisma', 'Carisma'],
];

export default function FichaJogador({ personagemId }) {
  const [ficha, setFicha] = useState(null);
  const [aba, setAba] = useState('ficha');
  const salvarTimeout = useRef(null);
  const pendentes = useRef({});

  const carregar = useCallback(async () => {
    const { data } = await api.get(`/personagens/${personagemId}`);
    setFicha(data);
  }, [personagemId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const socket = conectarSocket();
    socket.emit('entrar-ficha', personagemId);
    const aoAtualizar = (nova) => setFicha((atual) => atual && atual.id === nova.id ? nova : atual);
    const aoAtualizarParcial = (campos) => setFicha((atual) => atual ? { ...atual, ...campos } : atual);
    socket.on('ficha-atualizada', aoAtualizar);
    socket.on('ficha-atualizada-parcial', aoAtualizarParcial);
    return () => {
      socket.off('ficha-atualizada', aoAtualizar);
      socket.off('ficha-atualizada-parcial', aoAtualizarParcial);
    };
  }, [personagemId]);

  function atualizarLocal(campos) {
    setFicha((f) => ({ ...f, ...campos }));
    pendentes.current = { ...pendentes.current, ...campos };
    clearTimeout(salvarTimeout.current);
    salvarTimeout.current = setTimeout(() => {
      const paraSalvar = pendentes.current;
      pendentes.current = {};
      api.put(`/personagens/${personagemId}`, paraSalvar).catch(() => {});
    }, 500);
  }

  if (!ficha) return <div className="p-8 text-center" style={{ color: 'var(--text-dim)' }}>Carregando ficha...</div>;

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <Cabecalho ficha={ficha} atualizarLocal={atualizarLocal} personagemId={personagemId} setFicha={setFicha} />

      <div className="flex gap-1 px-4 mt-4 sticky top-0 z-10 py-2" style={{ background: 'var(--bg)' }}>
        {[['ficha', 'Ficha'], ['talentos', 'Habilidades'], ['magias', 'Magias'], ['inventario', 'Inventário']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            className="flex-1 py-2 rounded text-sm font-medium transition-colors"
            style={aba === id
              ? { background: 'var(--gold)', color: '#120810' }
              : { background: 'var(--surface)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4">
        {aba === 'ficha' && <AbaFicha ficha={ficha} atualizarLocal={atualizarLocal} personagemId={personagemId} recarregar={carregar} />}
        {aba === 'talentos' && (
          <AbaHabilidades personagemId={personagemId} talentos={ficha.talentos || []} recarregar={carregar}
            filtro={t => t.tipo !== 'Magia'} tipoPadrao="Habilidade" tituloAdicionar="nova habilidade/talento" />
        )}
        {aba === 'magias' && (
          <AbaHabilidades personagemId={personagemId} talentos={ficha.talentos || []} recarregar={carregar}
            filtro={t => t.tipo === 'Magia'} tipoPadrao="Magia" tituloAdicionar="nova magia" />
        )}
        {aba === 'inventario' && <AbaInventario personagemId={personagemId} itens={ficha.inventario || []} recarregar={carregar} />}
      </div>
    </div>
  );
}

function Cabecalho({ ficha, atualizarLocal, personagemId, setFicha }) {
  const inputRef = useRef(null);
  const inputCorpoRef = useRef(null);
  const inputPdfRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [enviandoCorpo, setEnviandoCorpo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [msgImport, setMsgImport] = useState('');

  async function importarPdf(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    setImportando(true);
    setMsgImport('');
    try {
      const form = new FormData();
      form.append('pdf', arquivo);
      const { data } = await api.post(`/personagens/${personagemId}/importar-pdf`, form);
      setFicha(data.ficha);
      setMsgImport(`Importado! ${data.habilidadesImportadas} habilidades/magias e ${data.itensImportados} itens.`);
    } catch (err) {
      setMsgImport(err.response?.data?.erro || 'Não foi possível importar esse PDF.');
    } finally {
      setImportando(false);
      e.target.value = '';
      setTimeout(() => setMsgImport(''), 6000);
    }
  }

  async function exportarPdf() {
    setExportando(true);
    try {
      const resp = await api.get(`/personagens/${personagemId}/exportar-pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(ficha.nome || 'ficha').replace(/[^a-z0-9]/gi, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsgImport('Não foi possível gerar o PDF agora.');
      setTimeout(() => setMsgImport(''), 6000);
    } finally {
      setExportando(false);
    }
  }

  async function trocarAvatar(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('avatar', arquivo);
      const { data } = await api.post(`/personagens/${personagemId}/avatar`, form);
      setFicha(data);
    } catch {
      alert('Não foi possível enviar o avatar. Tente uma imagem menor.');
    } finally {
      setEnviando(false);
    }
  }

  async function trocarFotoCorpo(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    setEnviandoCorpo(true);
    try {
      const form = new FormData();
      form.append('foto', arquivo);
      const { data } = await api.post(`/personagens/${personagemId}/foto-corpo`, form);
      setFicha(data);
    } catch {
      alert('Não foi possível enviar a foto. Tente uma imagem menor.');
    } finally {
      setEnviandoCorpo(false);
      e.target.value = '';
    }
  }

  return (
    <div className="p-4 flex gap-4 items-center" style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={() => inputRef.current?.click()}
        className="w-16 h-16 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center relative group"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--gold)' }}
        title="Trocar avatar">
        {ficha.foto_url
          ? <img src={ficha.foto_url} className="w-full h-full object-cover" alt="" />
          : <span style={{ color: 'var(--text-dim)' }}>{enviando ? '...' : '+'}</span>}
        <span className="absolute inset-0 flex items-center justify-center text-[9px] opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.55)', color: 'var(--text)' }}>
          {enviando ? 'enviando...' : 'trocar'}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={trocarAvatar} />

      <div className="flex-1 min-w-0">
        <input value={ficha.nome || ''} onChange={e => atualizarLocal({ nome: e.target.value })}
          className="display text-xl w-full bg-transparent outline-none" style={{ color: 'var(--text)' }} placeholder="Nome do personagem" />
        <p className="text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Nível {ficha.nivel || 0}</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <input value={ficha.legado || ''} onChange={e => atualizarLocal({ legado: e.target.value })}
              placeholder="Legado"
              className="w-full px-2 py-1 rounded text-xs font-medium outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--gold)', color: 'var(--gold)' }} />
          </div>
          <div className="flex-1">
            <input value={ficha.heranca || ''} onChange={e => atualizarLocal({ heranca: e.target.value })}
              placeholder="Herança"
              className="w-full px-2 py-1 rounded text-xs font-medium outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--shadow)', color: '#c9a8ec' }} />
          </div>
          <button onClick={() => inputPdfRef.current?.click()} title="Importar ficha de um PDF preenchido"
            className="px-2 py-1 rounded text-xs flex-shrink-0" style={{ border: '1px solid var(--gold)', color: 'var(--gold)' }}>
            {importando ? '...' : '📥 Importar'}
          </button>
          <input ref={inputPdfRef} type="file" accept="application/pdf" hidden onChange={importarPdf} />
          <button onClick={exportarPdf} title="Baixar a ficha em PDF (pode reimportar depois)"
            className="px-2 py-1 rounded text-xs flex-shrink-0" style={{ border: '1px solid var(--gold)', color: 'var(--gold)' }}>
            {exportando ? '...' : '📤 Salvar PDF'}
          </button>
          <button onClick={() => inputCorpoRef.current?.click()} title="Foto de corpo inteiro (aparece em Quem está online)"
            className="px-2 py-1 rounded text-xs flex-shrink-0" style={{ border: '1px solid var(--shadow)', color: '#c9a8ec' }}>
            {enviandoCorpo ? '...' : '🧍 Foto de corpo'}
          </button>
          <input ref={inputCorpoRef} type="file" accept="image/*" hidden onChange={trocarFotoCorpo} />
        </div>
        {msgImport && <p className="text-[10px] mt-1" style={{ color: 'var(--gold)' }}>{msgImport}</p>}
      </div>
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h3 className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--gold)' }}>{titulo}</h3>
      {children}
    </div>
  );
}

function AbaFicha({ ficha, atualizarLocal, personagemId, recarregar }) {
  const usuario = getUsuario();
  const atributos = ficha.atributos || {};
  const protecoes = ficha.protecoes || {};
  const sombra = Array.isArray(ficha.pontos_sombra) ? ficha.pontos_sombra : [false, false, false, false, false];

  return (
    <>
      <Secao titulo="Identidade">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <CampoTexto label="Antecedente" value={ficha.antecedente} onChange={v => atualizarLocal({ antecedente: v })} />
          <CampoTexto label="Maldição" value={ficha.maldicao} onChange={v => atualizarLocal({ maldicao: v })} />
          <CampoTexto label="Jogadore" value={ficha.jogadore} onChange={v => atualizarLocal({ jogadore: v })} />
          <CampoTexto label="Pronomes" value={ficha.pronomes} onChange={v => atualizarLocal({ pronomes: v })} />
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-dim)' }}>Nível</label>
            <input type="number" value={ficha.nivel ?? 0} onChange={e => atualizarLocal({ nivel: Number(e.target.value) })}
              className="px-2 py-1 rounded w-full" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-dim)' }}>Bônus de Proficiência</label>
            <input type="number" value={ficha.bonus_proficiencia ?? 2} onChange={e => atualizarLocal({ bonus_proficiencia: Number(e.target.value) })}
              className="px-2 py-1 rounded w-full" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Atributos">
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-dim)' }}>Valor do modificador (-2 a +4, pode ser maior em níveis altos)</p>
        <div className="grid grid-cols-3 gap-3">
          {ATRIBUTOS.map(([chave, label]) => (
            <div key={chave} className="text-center p-2 rounded" style={{ background: 'var(--surface-2)' }}>
              <label className="text-[10px] block mb-1" style={{ color: 'var(--text-dim)' }}>{label}</label>
              <input type="number" value={atributos[chave] ?? 0}
                onChange={e => atualizarLocal({ atributos: { ...atributos, [chave]: Number(e.target.value) } })}
                className="w-full text-center text-lg font-semibold bg-transparent outline-none" style={{ color: 'var(--text)' }} />
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Proteções">
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-dim)' }}>
          10 + atributo + bônus de proficiência ({ficha.bonus_proficiencia ?? 2}), se treinado
        </p>
        <div className="grid grid-cols-3 gap-3">
          {ATRIBUTOS.map(([chave, label]) => {
            const treinado = !!protecoes[chave];
            const valor = 10 + (atributos[chave] ?? 0) + (treinado ? (ficha.bonus_proficiencia ?? 2) : 0);
            return (
              <div key={chave} className="text-center p-2 rounded" style={{ background: 'var(--surface-2)' }}>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--text-dim)' }}>{label}</label>
                <p className="text-lg font-semibold" style={{ color: 'var(--gold)' }}>{valor}</p>
                <label className="flex items-center justify-center gap-1 mt-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={treinado}
                    onChange={e => atualizarLocal({ protecoes: { ...protecoes, [chave]: e.target.checked } })} />
                  treinado
                </label>
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Pontos de Vida">
        <BarraPV ficha={ficha} atualizarLocal={atualizarLocal} />
        <div className="flex justify-around flex-wrap gap-3 mt-4">
          <CampoNum label="Atual" value={ficha.pv_atual} onChange={v => atualizarLocal({ pv_atual: v })} />
          <CampoNum label="Máximo" value={ficha.pv_max} onChange={v => atualizarLocal({ pv_max: v })} />
          <CampoNum label="Temp." value={ficha.pv_temp} onChange={v => atualizarLocal({ pv_temp: v })} />
          <CampoNum label="Dados usados" value={ficha.dados_vida_usados} onChange={v => atualizarLocal({ dados_vida_usados: v })} />
          <CampoNum label="Dados totais" value={ficha.dados_vida_total} onChange={v => atualizarLocal({ dados_vida_total: v })} />
        </div>
        {(ficha.pv_atual || 0) <= 0 && <TestesDeMorte ficha={ficha} atualizarLocal={atualizarLocal} />}
      </Secao>

      <Secao titulo="Pontos de Sombra">
        <div className="flex gap-2 justify-center">
          {sombra.map((marcado, i) => (
            <button key={i}
              onClick={() => {
                const nova = [...sombra]; nova[i] = !nova[i];
                atualizarLocal({ pontos_sombra: nova });
              }}
              className="w-8 h-8 rounded-full border-2 transition-colors"
              style={{
                borderColor: 'var(--shadow)',
                background: marcado ? 'var(--shadow)' : 'transparent'
              }} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Catarse & Ênfase">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs mb-2 text-center" style={{ color: 'var(--text-dim)' }}>Pontos de Catarse</p>
            <div className="flex justify-center gap-3">
              <CampoNum label="Atual" value={ficha.catarse_atual} onChange={v => atualizarLocal({ catarse_atual: v })} />
              <CampoNum label="Total" value={ficha.catarse_total} onChange={v => atualizarLocal({ catarse_total: v })} />
            </div>
          </div>
          <div>
            <p className="text-xs mb-2 text-center" style={{ color: 'var(--text-dim)' }}>Pontos de Ênfase</p>
            <div className="flex justify-center gap-3">
              <CampoNum label="Atual" value={ficha.enfase_atual} onChange={v => atualizarLocal({ enfase_atual: v })} />
              <CampoNum label="Total" value={ficha.enfase_total} onChange={v => atualizarLocal({ enfase_total: v })} />
            </div>
          </div>
        </div>
      </Secao>

      <Secao titulo="Combate">
        <div className="flex justify-around flex-wrap gap-3">
          <CampoTexto label="Deslocamento" value={ficha.deslocamento} onChange={v => atualizarLocal({ deslocamento: v })} small />
          <CampoNum label="Redução de dano" value={ficha.reducao_dano} onChange={v => atualizarLocal({ reducao_dano: v })} />
          <CampoNum label="Iniciativa" value={ficha.iniciativa_bonus} onChange={v => atualizarLocal({ iniciativa_bonus: v })} />
        </div>
      </Secao>

      <SecaoPericias personagemId={personagemId} pericias={ficha.pericias || []} recarregar={recarregar} />

      <ListaEditavel
        titulo="Ataques"
        itens={ficha.ataques || []}
        onChange={v => atualizarLocal({ ataques: v })}
        novoItem={() => ({ nome: '', teste: '', dano: '', critico: '', tipo: '' })}
        renderItem={(item, atualizar, remover) => (
          <div className="grid grid-cols-5 gap-1 items-center">
            {['nome', 'teste', 'dano', 'critico', 'tipo'].map(campo => (
              <input key={campo} value={item[campo] || ''} placeholder={campo} onChange={e => atualizar({ ...item, [campo]: e.target.value })}
                className="px-1 py-1 rounded text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            ))}
            <button onClick={remover} className="col-span-5 text-xs text-right" style={{ color: 'var(--danger)' }}>remover</button>
          </div>
        )}
      />

      {usuario.papel === 'mestre' && (
        <Secao titulo="🔒 Notas do mestre (só você vê)">
          <textarea
            value={ficha.notas_mestre || ''}
            onChange={e => atualizarLocal({ notas_mestre: e.target.value })}
            placeholder="Segredos, ganchos de história, coisas que só o mestre sabe sobre esse personagem..."
            rows={5}
            className="w-full px-2 py-1.5 rounded text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--shadow)', color: 'var(--text)' }}
          />
        </Secao>
      )}
    </>
  );
}

function TestesDeMorte({ ficha, atualizarLocal }) {
  const testes = ficha.testes_morte && typeof ficha.testes_morte === 'object'
    ? ficha.testes_morte : { sucessos: 0, falhas: 0 };
  const morto = (ficha.pv_atual || 0) <= -(ficha.pv_max || 0) && (ficha.pv_max || 0) > 0;

  function rolar() {
    if (morto) return;
    const socket = conectarSocket();
    const d20 = 1 + Math.floor(Math.random() * 20);
    const sucesso = d20 >= 10;
    socket.emit('rolar-dado', {
      contexto: `${ficha.nome || 'Personagem'} · Teste de Morte`,
      expressao: '1d20 (10+ é sucesso)',
      valores: [d20],
      resultado: d20,
    });

    let { sucessos, falhas } = testes;
    if (sucesso) sucessos = Math.min(3, sucessos + 1); else falhas = Math.min(3, falhas + 1);
    atualizarLocal({ testes_morte: { sucessos, falhas } });
  }

  function resetar() {
    atualizarLocal({ testes_morte: { sucessos: 0, falhas: 0 } });
  }

  const estabilizado = testes.sucessos >= 3;
  const morreu = testes.falhas >= 3;

  return (
    <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(140,44,58,0.15)', border: '1px solid var(--danger)' }}>
      <p className="text-sm font-semibold mb-2" style={{ color: 'var(--danger)' }}>
        {morto ? '💀 MORTO — PV negativo igual ao máximo' : morreu ? '💀 MORREU (3 falhas)' : estabilizado ? '✅ ESTABILIZADO (3 sucessos)' : '⚠️ MORRENDO — faça um teste de morte no início do turno'}
      </p>

      <div className="flex items-center gap-4 mb-3">
        <div>
          <p className="text-[10px] mb-1" style={{ color: 'var(--text-dim)' }}>Sucessos</p>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-5 h-5 rounded-full border-2" style={{ borderColor: '#3a8c5a', background: i < testes.sucessos ? '#3a8c5a' : 'transparent' }} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] mb-1" style={{ color: 'var(--text-dim)' }}>Falhas</p>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'var(--danger)', background: i < testes.falhas ? 'var(--danger)' : 'transparent' }} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {!morto && !morreu && !estabilizado && (
          <button onClick={rolar} className="text-xs px-3 py-1.5 rounded font-medium" style={{ background: 'var(--gold)', color: '#120810' }}>
            🎲 Rolar teste de morte
          </button>
        )}
        <button onClick={resetar} className="text-xs px-3 py-1.5 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}>
          resetar
        </button>
      </div>
    </div>
  );
}

function BarraPV({ ficha, atualizarLocal }) {
  const [valor, setValor] = useState(1);
  const max = Math.max(ficha.pv_max || 0, 1);
  const atual = Math.max(ficha.pv_atual || 0, 0);
  const temp = Math.max(ficha.pv_temp || 0, 0);
  const pctAtual = Math.min(100, (atual / max) * 100);
  const pctTemp = Math.min(100 - pctAtual, (temp / max) * 100);

  const cor = pctAtual <= 25 ? '#8c2c3a' : pctAtual <= 50 ? '#b25a3a' : '#3a8c5a';

  function aplicarDano() {
    const n = Math.max(0, Number(valor) || 0);
    let novoTemp = temp - n;
    let restante = novoTemp < 0 ? -novoTemp : 0;
    novoTemp = Math.max(0, novoTemp);
    const novoAtual = Math.max(0, atual - restante);
    atualizarLocal({ pv_temp: novoTemp, pv_atual: novoAtual });
  }

  function aplicarCura() {
    const n = Math.max(0, Number(valor) || 0);
    const novoAtual = Math.min(ficha.pv_max || 0, atual + n);
    atualizarLocal({ pv_atual: novoAtual });
  }

  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-dim)' }}>
        <span>{atual}{temp > 0 && ` (+${temp})`} / {ficha.pv_max || 0} PV</span>
        <span>{Math.round(pctAtual)}%</span>
      </div>
      <div className="w-full h-5 rounded-full overflow-hidden relative" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${pctAtual}%`, background: cor, position: 'absolute', left: 0 }} />
        <div className="h-full transition-all duration-300" style={{ width: `${pctTemp}%`, background: 'var(--shadow)', opacity: 0.85, position: 'absolute', left: `${pctAtual}%` }} />
      </div>

      <div className="flex items-center gap-2 mt-3 justify-center">
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Aplicar</span>
        <input type="number" min="0" value={valor} onChange={e => setValor(e.target.value)}
          className="w-16 text-center py-1 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <button onClick={aplicarDano} className="text-xs px-3 py-1.5 rounded font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>
          − Dano
        </button>
        <button onClick={aplicarCura} className="text-xs px-3 py-1.5 rounded font-medium" style={{ background: '#3a8c5a', color: '#fff' }}>
          + Curar
        </button>
      </div>
    </div>
  );
}

function CampoTexto({ label, value, onChange, small }) {
  return (
    <div>
      <label className="text-[10px] block mb-1" style={{ color: 'var(--text-dim)' }}>{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)}
        className={`px-2 py-1 rounded ${small ? 'w-24 text-center' : 'w-full'}`}
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
    </div>
  );
}

function LinhaPericia({ item, salvar, remover, rolar }) {
  const [valores, setValores] = useState(item);
  const salvarTimeout = useRef(null);

  useEffect(() => {
    if (!salvarTimeout.current) setValores(item);
  }, [item]);

  function mudar(campos) {
    const novo = { ...valores, ...campos };
    setValores(novo);
    clearTimeout(salvarTimeout.current);
    salvarTimeout.current = setTimeout(() => salvar(novo), 400);
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => rolar(valores)} title="Rolar 1d20 + bônus"
        className="text-base flex-shrink-0 hover:opacity-70 transition-opacity">🎲</button>
      <input value={valores.nome} onChange={e => mudar({ nome: e.target.value })} placeholder="Nome"
        className="flex-1 px-2 py-1 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      <input type="checkbox" checked={!!valores.proficiente} onChange={e => mudar({ proficiente: e.target.checked })} />
      <input type="number" value={valores.total} onChange={e => mudar({ total: Number(e.target.value) })}
        className="w-14 px-2 py-1 rounded text-sm text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      <button onClick={remover} style={{ color: 'var(--danger)' }}>✕</button>
    </div>
  );
}

function SecaoPericias({ personagemId, pericias, recarregar }) {
  function rolar(item) {
    const socket = conectarSocket();
    const d20 = 1 + Math.floor(Math.random() * 20);
    const bonus = Number(item.total) || 0;
    socket.emit('rolar-dado', {
      contexto: item.nome && item.nome.trim() ? item.nome.trim() : 'Perícia sem nome',
      expressao: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
      valores: [d20],
      resultado: d20 + bonus,
    });
  }

  async function adicionar() {
    await api.post(`/personagens/${personagemId}/pericias`, { nome: '', proficiente: false, total: 0 });
    recarregar();
  }

  async function salvar(id, valores) {
    await api.put(`/pericias/${id}`, valores);
    recarregar();
  }

  async function remover(id) {
    await api.delete(`/pericias/${id}`);
    recarregar();
  }

  async function carregarPadrao() {
    await api.post(`/personagens/${personagemId}/pericias/carregar-padrao`);
    recarregar();
  }

  return (
    <Secao titulo="Perícias">
      <div className="flex justify-end mb-2">
        <button onClick={carregarPadrao} className="text-xs px-2 py-1 rounded" style={{ border: '1px dashed var(--gold)', color: 'var(--gold)' }}>
          carregar perícias oficiais do Skyfall
        </button>
      </div>
      <div className="space-y-2">
        {pericias.map(item => (
          <LinhaPericia key={item.id} item={item} rolar={rolar}
            salvar={(v) => salvar(item.id, v)} remover={() => remover(item.id)} />
        ))}
      </div>
      <button onClick={adicionar} className="mt-3 text-xs px-3 py-1.5 rounded" style={{ border: '1px dashed var(--gold)', color: 'var(--gold)' }}>
        + adicionar
      </button>
    </Secao>
  );
}

function ListaEditavel({ titulo, itens, onChange, novoItem, renderItem }) {
  return (
    <Secao titulo={titulo}>
      <div className="space-y-2">
        {itens.map((item, i) => (
          <div key={i}>
            {renderItem(item, (novo) => {
              const copia = [...itens]; copia[i] = novo; onChange(copia);
            }, () => onChange(itens.filter((_, idx) => idx !== i)))}
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...itens, novoItem()])}
        className="mt-3 text-xs px-3 py-1.5 rounded" style={{ border: '1px dashed var(--gold)', color: 'var(--gold)' }}>
        + adicionar
      </button>
    </Secao>
  );
}

const ICONES_EXECUCAO = {
  'Ação': '▶',
  'Ação Bônus': '⏩',
  'Reação': '↩',
  'Ação Livre': '◇',
  'Mais que uma ação': '✛',
};

const CAMPOS_VAZIOS_TALENTO = {
  nome: '', trilha: '', tipo: 'Habilidade', execucao: 'Ação', custo: '', alcance: '', alvo: '',
  duracao: '', ataque: '', descritores: '', acerto: '', erro: '', efeito: '', especial: '', descricao: ''
};

function FormularioTalento({ valores, setValores, onSalvar, onCancelar, textoBotao }) {
  const campo = (chave, placeholder, largura = '') => (
    <input placeholder={placeholder} value={valores[chave] || ''} onChange={e => setValores({ ...valores, [chave]: e.target.value })}
      className={`px-2 py-1.5 rounded text-sm ${largura}`} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
  );
  return (
    <div className="space-y-2">
      {campo('nome', 'Nome da habilidade/magia', 'w-full')}
      <div className="grid grid-cols-2 gap-2">
        <select value={valores.tipo} onChange={e => setValores({ ...valores, tipo: e.target.value })}
          className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="Habilidade">Habilidade</option>
          <option value="Magia">Magia</option>
          <option value="Talento">Talento</option>
        </select>
        <select value={valores.execucao} onChange={e => setValores({ ...valores, execucao: e.target.value })}
          className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {Object.keys(ICONES_EXECUCAO).map(op => <option key={op} value={op}>{op}</option>)}
        </select>
        {campo('trilha', 'Trilha')}
        {campo('custo', 'Custo (ex: 1 PE)')}
      </div>
      {campo('descritores', 'Tags (ex: Ataque, Mágico, Ígneo)', 'w-full')}
      <div className="grid grid-cols-2 gap-2">
        {campo('alcance', 'Alcance')}
        {campo('alvo', 'Alvo')}
        {campo('duracao', 'Duração')}
        {campo('ataque', 'Ataque (ex: mágico vs DES)')}
      </div>
      {campo('acerto', 'Acerto: efeito se acertar', 'w-full')}
      {campo('erro', 'Erro: efeito se errar', 'w-full')}
      {campo('efeito', 'Efeito: efeito base', 'w-full')}
      {campo('especial', 'Especial: requisitos/particularidades', 'w-full')}
      <textarea placeholder="Descrição livre (opcional)" value={valores.descricao} onChange={e => setValores({ ...valores, descricao: e.target.value })}
        className="w-full px-2 py-1.5 rounded text-sm" rows={2} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
      <div className="flex gap-2">
        <button onClick={onSalvar} className="text-xs px-3 py-1.5 rounded" style={{ background: 'var(--gold)', color: '#120810' }}>
          {textoBotao || 'Adicionar'}
        </button>
        <button onClick={onCancelar} className="text-xs px-3 py-1.5 rounded" style={{ color: 'var(--text-dim)' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function CardTalento({ t, remover, salvar, moverCima, moverBaixo, primeiro, ultimo }) {
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(t);
  const [descOculta, setDescOculta] = useState(false);

  useEffect(() => {
    if (!editando) setValores(t);
  }, [t, editando]);

  const tags = (t.descritores || '').split(',').map(s => s.trim()).filter(Boolean);

  if (editando) {
    return (
      <Secao titulo={`Editando: ${t.nome}`}>
        <FormularioTalento valores={valores} setValores={setValores} textoBotao="Salvar"
          onSalvar={async () => { await salvar(valores); setEditando(false); }}
          onCancelar={() => { setValores(t); setEditando(false); }} />
      </Secao>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden mb-4" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--shadow)' }}>
        <span className="text-sm font-semibold flex items-center gap-2" style={{ color: '#fff' }}>
          <span>{ICONES_EXECUCAO[t.execucao] || '▶'}</span>
          <span className="uppercase tracking-wide">{t.nome}</span>
        </span>
        <div className="flex items-center gap-2">
          {t.custo && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.25)', color: '#fff' }}>
              {t.custo}
            </span>
          )}
          <button onClick={moverCima} disabled={primeiro} className="text-xs px-1" style={{ color: primeiro ? 'rgba(255,255,255,0.3)' : '#fff' }} title="Mover pra cima">▲</button>
          <button onClick={moverBaixo} disabled={ultimo} className="text-xs px-1" style={{ color: ultimo ? 'rgba(255,255,255,0.3)' : '#fff' }} title="Mover pra baixo">▼</button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex gap-1.5 px-3 py-2 flex-wrap" style={{ background: 'var(--surface-2)' }}>
          {tags.map((tag, i) => (
            <span key={i} className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
              style={{ background: 'var(--surface)', color: 'var(--gold)', border: '1px solid var(--border)' }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="p-3 text-sm space-y-1.5" style={{ background: 'var(--surface)' }}>
        {t.trilha && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{t.trilha} {t.tipo && `· ${t.tipo}`}</p>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
          {t.alcance && <p><b style={{ color: 'var(--text)' }}>Alcance:</b> {t.alcance}</p>}
          {t.alvo && <p><b style={{ color: 'var(--text)' }}>Alvo:</b> {t.alvo}</p>}
          {t.duracao && <p><b style={{ color: 'var(--text)' }}>Duração:</b> {t.duracao}</p>}
          {t.ataque && <p><b style={{ color: 'var(--text)' }}>Ataque:</b> {t.ataque}</p>}
        </div>
        {t.acerto && <p><b style={{ color: 'var(--gold)' }}>Acerto:</b> {t.acerto}</p>}
        {t.erro && <p><b style={{ color: 'var(--gold)' }}>Erro:</b> {t.erro}</p>}
        {t.efeito && <p><b style={{ color: 'var(--gold)' }}>Efeito:</b> {t.efeito}</p>}
        {t.especial && <p><b style={{ color: 'var(--gold)' }}>Especial:</b> {t.especial}</p>}

        {t.descricao && !descOculta && <p className="italic" style={{ color: 'var(--text-dim)' }}>{t.descricao}</p>}

        <div className="flex gap-3 pt-1 flex-wrap">
          {t.descricao && (
            <button onClick={() => setDescOculta(!descOculta)} className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {descOculta ? 'mostrar descrição' : 'ocultar descrição'}
            </button>
          )}
          <button onClick={() => setEditando(true)} className="text-xs" style={{ color: 'var(--gold)' }}>editar</button>
          <button onClick={() => salvar({ tipo: t.tipo === 'Magia' ? 'Habilidade' : 'Magia' })} className="text-xs" style={{ color: '#c9a8ec' }}>
            {t.tipo === 'Magia' ? '↪ mover pra Habilidades' : '↪ mover pra Magias'}
          </button>
          <button onClick={remover} className="text-xs" style={{ color: 'var(--danger)' }}>remover</button>
        </div>
      </div>
    </div>
  );
}

function AbaHabilidades({ personagemId, talentos, recarregar, filtro, tipoPadrao, tituloAdicionar }) {
  const [novo, setNovo] = useState({ ...CAMPOS_VAZIOS_TALENTO, tipo: tipoPadrao });
  const [aberto, setAberto] = useState(false);

  const lista = talentos.filter(filtro);

  async function adicionar() {
    if (!novo.nome) return;
    await api.post(`/personagens/${personagemId}/talentos`, novo);
    setNovo({ ...CAMPOS_VAZIOS_TALENTO, tipo: tipoPadrao });
    setAberto(false);
    recarregar();
  }

  async function remover(id) {
    await api.delete(`/talentos/${id}`);
    recarregar();
  }

  async function salvar(id, valores) {
    await api.put(`/talentos/${id}`, valores);
    recarregar();
  }

  async function mover(index, direcao) {
    const outro = lista[index + direcao];
    const atual = lista[index];
    if (!outro) return;
    await Promise.all([
      api.put(`/talentos/${atual.id}`, { ordem: outro.ordem }),
      api.put(`/talentos/${outro.id}`, { ordem: atual.ordem }),
    ]);
    recarregar();
  }

  return (
    <>
      {lista.map((t, i) => (
        <CardTalento key={t.id} t={t}
          remover={() => remover(t.id)}
          salvar={(valores) => salvar(t.id, valores)}
          moverCima={() => mover(i, -1)}
          moverBaixo={() => mover(i, 1)}
          primeiro={i === 0}
          ultimo={i === lista.length - 1}
        />
      ))}

      {!aberto && (
        <button onClick={() => setAberto(true)} className="w-full py-2 rounded text-sm mb-4" style={{ border: '1px dashed var(--gold)', color: 'var(--gold)' }}>
          + {tituloAdicionar}
        </button>
      )}

      {aberto && (
        <Secao titulo={tituloAdicionar}>
          <FormularioTalento valores={novo} setValores={setNovo} onSalvar={adicionar}
            onCancelar={() => { setAberto(false); setNovo({ ...CAMPOS_VAZIOS_TALENTO, tipo: tipoPadrao }); }} />
        </Secao>
      )}
    </>
  );
}

function ItemInventario({ item, salvar, remover }) {
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(item);

  useEffect(() => {
    if (!editando) setValores(item);
  }, [item, editando]);

  if (editando) {
    return (
      <div className="p-2 rounded space-y-2" style={{ background: 'var(--surface-2)' }}>
        <input value={valores.nome} onChange={e => setValores({ ...valores, nome: e.target.value })} placeholder="Nome"
          className="w-full px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <div className="grid grid-cols-3 gap-2">
          <input type="number" value={valores.quantidade} onChange={e => setValores({ ...valores, quantidade: Number(e.target.value) })} placeholder="Qtd"
            className="px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <input type="number" value={valores.volume} onChange={e => setValores({ ...valores, volume: Number(e.target.value) })} placeholder="Volume"
            className="px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <input type="number" value={valores.fragmentos_arcanos} onChange={e => setValores({ ...valores, fragmentos_arcanos: Number(e.target.value) })} placeholder="Frag."
            className="px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
        <input value={valores.descritores || ''} onChange={e => setValores({ ...valores, descritores: e.target.value })} placeholder="Descritores"
          className="w-full px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input value={valores.observacoes || ''} onChange={e => setValores({ ...valores, observacoes: e.target.value })} placeholder="Observações"
          className="w-full px-2 py-1 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <div className="flex gap-2">
          <button onClick={async () => { await salvar(valores); setEditando(false); }} className="text-xs px-3 py-1 rounded" style={{ background: 'var(--gold)', color: '#120810' }}>Salvar</button>
          <button onClick={() => { setValores(item); setEditando(false); }} className="text-xs px-3 py-1" style={{ color: 'var(--text-dim)' }}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-sm p-2 rounded" style={{ background: 'var(--surface-2)' }}>
      <div>
        <p className="font-medium">{item.nome} {item.quantidade > 1 && `x${item.quantidade}`}</p>
        {item.descritores && <p className="text-xs" style={{ color: 'var(--gold)' }}>{item.descritores}</p>}
        {item.observacoes && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{item.observacoes}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setEditando(true)} className="text-xs" style={{ color: 'var(--gold)' }}>editar</button>
        <button onClick={remover} style={{ color: 'var(--danger)' }}>✕</button>
      </div>
    </div>
  );
}

function AbaInventario({ personagemId, itens, recarregar }) {
  const [novo, setNovo] = useState({ nome: '', descritores: '', volume: 0, fragmentos_arcanos: 0, quantidade: 1, observacoes: '' });

  async function adicionar() {
    if (!novo.nome) return;
    await api.post(`/personagens/${personagemId}/inventario`, novo);
    setNovo({ nome: '', descritores: '', volume: 0, fragmentos_arcanos: 0, quantidade: 1, observacoes: '' });
    recarregar();
  }

  async function remover(id) {
    await api.delete(`/inventario/${id}`);
    recarregar();
  }

  async function salvar(id, valores) {
    await api.put(`/inventario/${id}`, valores);
    recarregar();
  }

  const volumeTotal = itens.reduce((s, i) => s + (i.volume || 0) * (i.quantidade || 1), 0);

  return (
    <>
      <Secao titulo={`Itens · volume total ${volumeTotal}`}>
        <div className="space-y-2">
          {itens.map(item => (
            <ItemInventario key={item.id} item={item} remover={() => remover(item.id)} salvar={(v) => salvar(item.id, v)} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Adicionar item">
        <div className="space-y-2">
          <input placeholder="Nome" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" placeholder="Qtd" value={novo.quantidade} onChange={e => setNovo({ ...novo, quantidade: Number(e.target.value) })}
              className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="number" placeholder="Volume" value={novo.volume} onChange={e => setNovo({ ...novo, volume: Number(e.target.value) })}
              className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="number" placeholder="Frag. arcanos" value={novo.fragmentos_arcanos} onChange={e => setNovo({ ...novo, fragmentos_arcanos: Number(e.target.value) })}
              className="px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <input placeholder="Descritores" value={novo.descritores} onChange={e => setNovo({ ...novo, descritores: e.target.value })}
            className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button onClick={adicionar} className="text-xs px-3 py-1.5 rounded" style={{ background: 'var(--gold)', color: '#120810' }}>
            Adicionar
          </button>
        </div>
      </Secao>
    </>
  );
}
