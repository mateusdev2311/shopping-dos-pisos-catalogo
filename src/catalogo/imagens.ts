import { Produto, Variacao } from './catalogo.types';

// Imagens ilustrativas geradas em SVG a partir do padrão e das cores do produto,
// para a demo não depender de fotos. Com a API real, use product_images.

const T = 400; // tamanho do quadro

export function svgDoProduto(produto: Produto, variacao: Variacao | null): string {
  const cor1 = variacao?.color1 || produto.demo.cor1;
  const cor2 = variacao?.color2 || produto.demo.cor2;
  const rnd = aleatorio(variacao?.sku || produto.sku);
  const desenho = (DESENHOS[produto.demo.padrao] || DESENHOS.liso)(cor1, cor2, rnd, produto);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${T}" height="${T}">${desenho}</svg>`;
}

type Desenho = (cor1: string, cor2: string, rnd: () => number, produto: Produto) => string;

const DESENHOS: Record<string, Desenho> = {
  marmore(c1, c2, rnd) {
    let veios = '';
    for (let i = 0; i < 7; i++) {
      const y = rnd() * T;
      const pontos = Array.from({ length: 5 }, (_, k) => `${(k * T) / 4},${y + (rnd() - 0.5) * 160}`);
      veios += `<path d="M${pontos[0]} C${pontos[1]} ${pontos[2]} ${pontos[3]} S${pontos[4]} ${T + 20},${y + (rnd() - 0.5) * 120}" fill="none" stroke="${c2}" stroke-width="${(0.6 + rnd() * 2.4).toFixed(1)}" opacity="${(0.25 + rnd() * 0.45).toFixed(2)}"/>`;
    }
    return `${textura('m', c1, 0.012, 3, 0.10)}${veios}${juntas(2, '#ffffff', 0.9)}${brilho()}`;
  },
  cimento: (c1) => `${textura('c', c1, 0.05, 4, 0.22)}${textura('c2', 'none', 0.006, 2, 0.12, true)}${juntas(1, '#6f6c68', 0.5)}`,
  travertino(c1, c2, rnd) {
    let faixas = '';
    for (let i = 0; i < 26; i++) {
      const y = rnd() * T;
      faixas += `<rect x="0" y="${y.toFixed(0)}" width="${T}" height="${(1 + rnd() * 5).toFixed(1)}" fill="${c2}" opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"/>`;
    }
    return `${textura('t', c1, 0.03, 3, 0.14)}${faixas}${juntas(2, '#f3ece0', 0.9)}`;
  },
  pedra: (c1) => `${textura('p', c1, 0.09, 5, 0.3)}${juntas(2, '#5d6160', 0.6)}`,
  liso: (c1, c2) => `<rect width="${T}" height="${T}" fill="${c1}"/>${textura('l', 'none', 0.02, 2, 0.08, true)}${juntas(3, c2, 0.9)}${brilho()}`,
  madeira(c1, c2, rnd) {
    const altura = 80;
    let reguas = '';
    for (let y = 0, i = 0; y < T; y += altura, i++) {
      const tom = i % 2 ? c2 : c1;
      const deslocamento = (rnd() * T) | 0;
      reguas += `<rect x="0" y="${y}" width="${T}" height="${altura}" fill="${tom}"/>`;
      for (let k = 0; k < 9; k++) {
        const yy = y + 6 + rnd() * (altura - 12);
        reguas += `<path d="M0,${yy.toFixed(1)} Q${T / 3},${(yy + (rnd() - 0.5) * 14).toFixed(1)} ${(2 * T) / 3},${yy.toFixed(1)} T${T},${(yy + (rnd() - 0.5) * 10).toFixed(1)}" fill="none" stroke="#3b2414" stroke-width="${(0.5 + rnd()).toFixed(1)}" opacity="0.18"/>`;
      }
      reguas += `<line x1="${deslocamento}" y1="${y}" x2="${deslocamento}" y2="${y + altura}" stroke="#2a1a0e" stroke-width="2" opacity="0.35"/>`;
      reguas += `<line x1="0" y1="${y}" x2="${T}" y2="${y}" stroke="#2a1a0e" stroke-width="2" opacity="0.4"/>`;
    }
    return reguas;
  },
  subway(c1, c2) {
    let tijolos = `<rect width="${T}" height="${T}" fill="${c2}"/>`;
    const l = 100, a = 50;
    for (let y = 0, linha = 0; y < T; y += a, linha++) {
      for (let x = linha % 2 ? -l / 2 : 0; x < T; x += l) {
        tijolos += `<rect x="${x + 2}" y="${y + 2}" width="${l - 4}" height="${a - 4}" rx="3" fill="${c1}"/>`;
        tijolos += `<rect x="${x + 6}" y="${y + 5}" width="${l - 30}" height="6" rx="3" fill="#fff" opacity="0.8"/>`;
      }
    }
    return tijolos;
  },
  ondas(c1, c2) {
    let ondas = `<rect width="${T}" height="${T}" fill="${c1}"/>`;
    for (let y = 0; y < T + 40; y += 40) {
      ondas += `<path d="M0,${y} q50,-25 100,0 t100,0 t100,0 t100,0 v40 h-400 z" fill="${c2}" opacity="0.35"/>`;
      ondas += `<path d="M0,${y} q50,-25 100,0 t100,0 t100,0 t100,0" fill="none" stroke="#fff" stroke-width="3" opacity="0.9"/>`;
    }
    return ondas;
  },
  hexagono(c1, c2) {
    let hex = `<rect width="${T}" height="${T}" fill="#f1efe9"/>`;
    const r = 46, w = Math.sqrt(3) * r;
    for (let linha = -1; linha < 7; linha++) {
      for (let col = -1; col < 6; col++) {
        const cx = col * w + (linha % 2 ? w / 2 : 0);
        const cy = linha * r * 1.5;
        const pts = Array.from({ length: 6 }, (_, k) => {
          const ang = (Math.PI / 180) * (60 * k - 30);
          return `${(cx + (r - 3) * Math.cos(ang)).toFixed(1)},${(cy + (r - 3) * Math.sin(ang)).toFixed(1)}`;
        }).join(' ');
        hex += `<polygon points="${pts}" fill="${(linha + col) % 3 === 0 ? c2 : c1}"/>`;
      }
    }
    return hex;
  },
  saco: (c1, c2, _rnd, produto) => embalagem(c1, c2, produto, `<path d="M110,70 L290,70 L305,340 Q200,365 95,340 Z" fill="${c1}" stroke="#00000022" stroke-width="2"/><path d="M110,70 L290,70 L295,95 L105,95 Z" fill="#00000014"/>`),
  balde: (c1, c2, _rnd, produto) => embalagem(c1, c2, produto, `<path d="M115,110 L285,110 L270,330 Q200,345 130,330 Z" fill="${c1}" stroke="#00000022" stroke-width="2"/><ellipse cx="200" cy="110" rx="88" ry="20" fill="#e9e9e6" stroke="#00000022" stroke-width="2"/><path d="M118,112 Q200,40 282,112" fill="none" stroke="#6b6b6b" stroke-width="5"/>`),
  kit(c1, c2) {
    let pecas = `<rect width="${T}" height="${T}" fill="#f4f2ee"/>`;
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 60;
      pecas += `<g transform="rotate(${-12 + i * 6} ${x + 20} 200)"><rect x="${x}" y="120" width="40" height="70" rx="4" fill="${c1}"/><rect x="${x + 14}" y="190" width="12" height="70" fill="${c1}" opacity="0.8"/></g>`;
      pecas += `<path d="M${x - 5},300 l50,0 l-10,30 l-30,0 z" fill="${c2}"/>`;
    }
    return pecas;
  },
  rodape: (c1, c2) => `<rect width="${T}" height="${T}" fill="#f4f2ee"/><g transform="rotate(-18 200 200)"><rect x="-40" y="170" width="480" height="70" fill="${c1}" stroke="${c2}" stroke-width="2"/><rect x="-40" y="170" width="480" height="14" fill="${c2}" opacity="0.5"/><rect x="-40" y="240" width="480" height="10" fill="#00000018"/></g>`,
  manta: (c1, c2) => `<rect width="${T}" height="${T}" fill="#f4f2ee"/><rect x="70" y="130" width="230" height="150" fill="${c1}"/><ellipse cx="300" cy="205" rx="40" ry="75" fill="${c2}"/><ellipse cx="300" cy="205" rx="14" ry="26" fill="#f4f2ee"/><path d="M70,280 L20,330 L250,330 L300,280 Z" fill="${c1}" opacity="0.7"/>`,
};

function embalagem(_c1: string, c2: string, produto: Produto, forma: string): string {
  const rotulo = produto.name.split(' ').slice(0, 2).join(' ');
  return `<rect width="${T}" height="${T}" fill="#f4f2ee"/>${forma}<rect x="135" y="170" width="130" height="80" rx="6" fill="${c2}"/><text x="200" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#fff">${esc(rotulo)}</text><text x="200" y="233" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#ffffffcc">Shopping dos Pisos</text>`;
}

function textura(id: string, base: string, frequencia: number, oitavas: number, opacidade: number, soSombra = false): string {
  const fundo = soSombra ? '' : `<rect width="${T}" height="${T}" fill="${base}"/>`;
  return `${fundo}<filter id="f${id}"><feTurbulence type="fractalNoise" baseFrequency="${frequencia}" numOctaves="${oitavas}" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.1"/></filter><rect width="${T}" height="${T}" filter="url(#f${id})" opacity="${opacidade}"/>`;
}

function juntas(divisoes: number, cor: string, opacidade: number): string {
  let linhas = '';
  for (let i = 1; i < divisoes; i++) {
    const p = (T / divisoes) * i;
    linhas += `<line x1="${p}" y1="0" x2="${p}" y2="${T}" stroke="${cor}" stroke-width="3" opacity="${opacidade}"/><line x1="0" y1="${p}" x2="${T}" y2="${p}" stroke="${cor}" stroke-width="3" opacity="${opacidade}"/>`;
  }
  return linhas;
}

function brilho(): string {
  return `<linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient><rect width="${T}" height="${T}" fill="url(#gb)"/>`;
}

/** Gerador pseudoaleatório estável por SKU (a mesma imagem toda vez). */
function aleatorio(semente: string): () => number {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function esc(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
