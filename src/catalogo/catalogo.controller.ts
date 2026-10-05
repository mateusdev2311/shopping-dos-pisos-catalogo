import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CatalogoService } from './catalogo.service';
import { svgDoProduto } from './imagens';

@Controller()
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('api/catalogo/categorias')
  categorias() {
    return { success: true, data: this.catalogo.listarCategorias() };
  }

  @Get('api/catalogo/produtos')
  produtos(@Query('categoria') categoria?: string, @Query('busca') busca?: string) {
    const produtos = this.catalogo.listarProdutos({ categoriaId: Number(categoria) || undefined, busca });
    return { success: true, data: produtos };
  }

  /** Usada pela automação "Consultar produtos" da assistente de IA. */
  @Get('api/catalogo/resumo-ia')
  resumoIa(@Query('busca') busca?: string, @Query('categoria') categoria?: string) {
    return { texto: this.catalogo.resumoParaIa({ busca: (busca || '').trim(), categoriaId: Number(categoria) || undefined }) };
  }

  @Get('api/catalogo/produtos/:sku')
  produto(@Param('sku') sku: string) {
    return { success: true, data: this.catalogo.produto(sku) };
  }

  @Get('api/catalogo/produtos/:sku/compre-junto')
  compreJunto(@Param('sku') sku: string) {
    return { success: true, data: this.catalogo.compreJunto(sku) };
  }

  @Get('api/catalogo/lojas')
  lojas() {
    return { success: true, data: this.catalogo.lojas() };
  }

  @Get('api/catalogo/frete')
  frete(@Query('subtotal') subtotal?: string) {
    return { success: true, data: this.catalogo.frete(Number(subtotal) || 0) };
  }

  @Get('img/:sku.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400')
  imagem(@Param('sku') sku: string) {
    const produto = this.catalogo.produtoDoSku(sku);
    const variacao = produto.children?.find((v) => v.sku === sku) || null;
    return svgDoProduto(produto, variacao);
  }
}
