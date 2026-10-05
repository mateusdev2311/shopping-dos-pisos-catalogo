// Formato das respostas da API eCommerce-net (só os campos que a demo usa).

export interface Categoria {
  id: number;
  name: string;
  url: string;
  sort: number;
  status: number;
}

export interface Variacao {
  id_variety: number;
  sku: string;
  variety_name: string;
  price: string;
  promotional_price: string;
  stock: number;
  color1: string;
  color2: string;
  status: number;
}

export interface DadosDemo {
  padrao: string;
  cor1: string;
  cor2: string;
  m2PorUnidade?: number;
  tags: string[];
}

export interface Produto {
  id: number;
  sku: string;
  category_id: number;
  type: number; // 1 = simples, 4 = variação
  name: string;
  short_description: string;
  description: string;
  price: string;
  promotional_price: string;
  stock: number;
  unit_measurement: string;
  status: number;
  variety_title?: string;
  children?: Variacao[];
  demo: DadosDemo;
}

export interface Loja {
  id: number;
  nome: string;
  endereco: string;
  horario: string;
  orientacoes: string;
}

export interface RegraFrete {
  valor: number;
  gratisAcimaDe: number;
  titulo: string;
  prazo: string;
}

/** Um SKU vendável: o produto simples ou uma variação dele. */
export interface ItemVendavel {
  produto: Produto;
  variacao: Variacao | null;
  sku: string;
  nome: string;
  preco: number;
  estoque: number;
}
