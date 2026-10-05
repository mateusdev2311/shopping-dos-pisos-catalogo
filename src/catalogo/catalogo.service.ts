import { Injectable, NotFoundException } from '@nestjs/common';
import * as dados from './dados/catalogo.json';
import { Categoria, ItemVendavel, Loja, Produto, RegraFrete } from './catalogo.types';

/**
 * Fonte dos produtos. Hoje lê o JSON fictício; para usar a API eCommerce-net,
 * troque o corpo destes métodos por chamadas a /category/findbyname, /product/all,
 * /product/findbuyitwithbysku e /freight/getfreight — o formato já é o mesmo.
 */
@Injectable()
export class CatalogoService {
  private readonly categorias = dados.categorias as Categoria[];
  private readonly produtos = dados.produtos as Produto[];
  private readonly compreJuntoPorSku = dados.compreJunto as Record<string, string[]>;
  private readonly lojasCadastradas = dados.lojas as Loja[];
  private readonly regraFrete = dados.frete as RegraFrete;

  listarCategorias(): Categoria[] {
    return this.categorias.filter((c) => c.status === 1).sort((a, b) => a.sort - b.sort);
  }

  listarProdutos(filtro: { categoriaId?: number; busca?: string } = {}): Produto[] {
    const termo = normalizar(filtro.busca || '');
    return this.produtos.filter((p) => {
      if (p.status !== 1) return false;
      if (filtro.categoriaId && p.category_id !== filtro.categoriaId) return false;
      if (!termo) return true;
      const texto = normalizar([p.name, p.sku, p.short_description, ...(p.children || []).map((v) => v.variety_name)].join(' '));
      return termo.split(/\s+/).every((palavra) => texto.includes(palavra));
    });
  }

  produto(sku: string): Produto {
    const produto = this.produtos.find((p) => p.sku === sku);
    if (!produto) throw new NotFoundException('Produto não encontrado.');
    return produto;
  }

  /** Resolve o SKU de um produto simples ou de uma variação. Produto com variação exige o SKU da variação. */
  itemVendavel(sku: string): ItemVendavel {
    for (const produto of this.produtos) {
      if (produto.sku === sku) {
        if (produto.children?.length) throw new NotFoundException(`Escolha a variação de "${produto.name}".`);
        return {
          produto, variacao: null, sku, nome: produto.name,
          preco: precoAtual(produto.price, produto.promotional_price), estoque: produto.stock,
        };
      }
      const variacao = produto.children?.find((v) => v.sku === sku);
      if (variacao) {
        return {
          produto, variacao, sku, nome: `${produto.name} — ${variacao.variety_name}`,
          preco: precoAtual(variacao.price, variacao.promotional_price), estoque: variacao.stock,
        };
      }
    }
    throw new NotFoundException('Produto não encontrado.');
  }

  itemVendavelOuNulo(sku: string): ItemVendavel | null {
    try {
      return this.itemVendavel(sku);
    } catch {
      return null;
    }
  }

  compreJunto(sku: string): Produto[] {
    const pai = this.produtoDoSku(sku);
    return (this.compreJuntoPorSku[pai.sku] || []).map((s) => this.produto(s));
  }

  lojas(): Loja[] {
    return this.lojasCadastradas;
  }

  loja(id: number): Loja {
    const loja = this.lojasCadastradas.find((l) => l.id === id);
    if (!loja) throw new NotFoundException('Loja não encontrada.');
    return loja;
  }

  frete(subtotal: number) {
    const gratis = subtotal >= this.regraFrete.gratisAcimaDe;
    return {
      titulo: this.regraFrete.titulo,
      prazo: this.regraFrete.prazo,
      valor: gratis ? 0 : this.regraFrete.valor,
      gratisAcimaDe: this.regraFrete.gratisAcimaDe,
    };
  }

  /** Produto (pai) de um SKU simples ou de variação. */
  produtoDoSku(sku: string): Produto {
    const produto = this.produtos.find((p) => p.sku === sku || p.children?.some((v) => v.sku === sku));
    if (!produto) throw new NotFoundException('Produto não encontrado.');
    return produto;
  }
}

export function precoAtual(preco: string, promocional: string): number {
  const promo = Number(promocional);
  return promo > 0 ? promo : Number(preco);
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
