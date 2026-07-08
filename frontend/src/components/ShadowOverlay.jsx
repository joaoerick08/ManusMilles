import { useEffect, useState } from 'react';
import { conectarSocket } from '../api';

export default function ShadowOverlay() {
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    const socket = conectarSocket();
    const aoInvocar = () => setAtivo(true);
    socket.on('invocar-sombra', aoInvocar);
    return () => socket.off('invocar-sombra', aoInvocar);
  }, []);

  if (!ativo) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden cursor-pointer sombra-overlay"
      onClick={() => setAtivo(false)}>
      <div className="sombra-tendril sombra-tendril-1" />
      <div className="sombra-tendril sombra-tendril-2" />
      <div className="sombra-tendril sombra-tendril-3" />

      <svg viewBox="0 0 300 400" className="sombra-silhueta" preserveAspectRatio="xMidYMax meet">
        <defs>
          <radialGradient id="olhoGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e8c9ff" stopOpacity="1" />
            <stop offset="100%" stopColor="#6d3f9e" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* corpo/manto */}
        <path d="M150 90 C110 110 70 160 60 260 C55 310 60 360 70 400 L230 400 C240 360 245 310 240 260 C230 160 190 110 150 90 Z"
          fill="#000" />
        {/* cabelo longo ondulado */}
        <path d="M150 60 C120 70 95 100 85 150 C75 210 65 280 40 340 C70 320 85 260 95 200 C90 260 80 320 60 380
                  M150 60 C180 70 205 100 215 150 C225 210 235 280 260 340 C230 320 215 260 205 200 C210 260 220 320 240 380"
          stroke="#000" strokeWidth="10" fill="none" strokeLinecap="round" />
        {/* topo da cabeça */}
        <ellipse cx="150" cy="95" rx="42" ry="46" fill="#000" />
        {/* olhos brilhando */}
        <circle className="sombra-olho" cx="132" cy="95" r="10" fill="url(#olhoGlow)" />
        <circle className="sombra-olho" cx="168" cy="95" r="10" fill="url(#olhoGlow)" />
        <circle cx="132" cy="95" r="2.5" fill="#fff" />
        <circle cx="168" cy="95" r="2.5" fill="#fff" />
      </svg>

      <div className="sombra-vinheta" />

      <p className="display sombra-texto relative z-10 text-center px-6">
        A sombra quer te oferecer um acordo
      </p>

      <style>{`
        .sombra-overlay {
          background: radial-gradient(ellipse at center, #140510 0%, #050205 78%);
          animation: sombraFadeIn 1.2s ease-out;
        }
        .sombra-vinheta {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.92) 100%);
          animation: sombraPulsar 4s ease-in-out infinite;
        }
        .sombra-silhueta {
          position: absolute;
          bottom: 0;
          height: 78%;
          opacity: 0.92;
          filter: drop-shadow(0 0 40px rgba(0,0,0,0.9));
          animation: silhuetaFlutuar 6s ease-in-out infinite;
        }
        .sombra-olho { animation: olhoPulsar 3s ease-in-out infinite; }
        @keyframes olhoPulsar { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes silhuetaFlutuar { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

        .sombra-tendril {
          position: absolute;
          width: 140%; height: 140%;
          background: repeating-conic-gradient(from 0deg, rgba(0,0,0,0.55) 0deg 8deg, transparent 8deg 20deg);
          border-radius: 45%;
          filter: blur(3px);
        }
        .sombra-tendril-1 { top: -40%; left: -30%; animation: girar1 30s linear infinite; }
        .sombra-tendril-2 { bottom: -50%; right: -30%; animation: girar2 40s linear infinite reverse;
          background: repeating-conic-gradient(from 0deg, rgba(0,0,0,0.45) 0deg 10deg, transparent 10deg 24deg); }
        .sombra-tendril-3 { top: 20%; left: 10%; width: 100%; height: 100%; animation: girar1 55s linear infinite reverse; opacity: 0.5; }

        @keyframes girar1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes girar2 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes sombraFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sombraPulsar { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }

        .sombra-texto {
          font-size: 1.6rem;
          color: #e7dde2;
          text-shadow: 0 0 20px rgba(109,63,158,0.9), 0 0 40px rgba(0,0,0,0.9);
          animation: textoSurgir 2.5s ease-out;
          max-width: 26rem;
        }
        @keyframes textoSurgir {
          0% { opacity: 0; letter-spacing: 0.3em; filter: blur(6px); }
          60% { opacity: 1; }
          100% { opacity: 1; letter-spacing: 0.02em; filter: blur(0); }
        }
      `}</style>

      <p className="absolute bottom-6 text-xs z-10" style={{ color: 'var(--text-dim)' }}>toque pra fechar</p>
    </div>
  );
}
