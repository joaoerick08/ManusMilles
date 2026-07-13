import { Component } from 'react';

export default class ProtecaoErro extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error('Erro capturado pela proteção:', erro, info);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center" style={{ minHeight: '50vh' }}>
          <p className="text-2xl">⚠️</p>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Algo deu errado ao carregar essa parte da ficha.
          </p>
          <button onClick={() => window.location.reload()} className="text-xs px-4 py-2 rounded font-medium"
            style={{ background: 'var(--gold)', color: '#120810' }}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
