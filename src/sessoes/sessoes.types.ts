export type StatusSessao = 'link_enviado' | 'navegando' | 'finalizado';

export interface ItemCarrinho {
  sku: string;
  skuProduto: string;
  nome: string;
  variacao: string | null;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  /** Metragem coberta pelas caixas (só pisos e revestimentos). */
  m2: number | null;
}

export interface Totais {
  itens: number;
  subtotal: number;
  frete: number;
  total: number;
}

export interface DadosEntrega {
  nome: string;
  telefone: string;
  cep: string;
  estado: string;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  complemento: string;
  referencia: string;
}

export interface Checkout {
  tipo: 'entrega' | 'retirada';
  entrega: DadosEntrega | null;
  loja: { id: number; nome: string; endereco: string; horario: string; orientacoes: string } | null;
  observacoes: string;
}

export interface Evento {
  em: string;
  texto: string;
}

export interface Sessao {
  token: string;
  chatId: string;
  cliente: { nome: string; telefone: string };
  status: StatusSessao;
  itens: ItemCarrinho[];
  totais: Totais;
  checkout: Checkout | null;
  eventos: Evento[];
  criadaEm: string;
  atualizadaEm: string;
  abertaEm: string | null;
  finalizadaEm: string | null;
}
