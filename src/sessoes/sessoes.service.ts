import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { CatalogoService } from '../catalogo/catalogo.service';
import { config } from '../config';
import { Checkout, DadosEntrega, ItemCarrinho, Sessao } from './sessoes.types';

const MAX_EVENTOS = 50;
const MAX_QUANTIDADE = 999;

@Injectable()
export class SessoesService {
  private readonly logger = new Logger(SessoesService.name);
  private readonly porToken = new Map<string, Sessao>();
  private readonly tokenPorChat = new Map<string, string>();
  private gravacaoPendente: NodeJS.Timeout | null = null;

  constructor(private readonly catalogo: CatalogoService) {
    this.carregar();
  }

  /** Link do atendimento: reaproveita a sessão aberta ou cria outra se a anterior já foi finalizada. */
  criarOuReaproveitar(chatId: string, nome: string, telefone: string): Sessao {
    chatId = String(chatId || '').trim();
    if (!chatId) throw new BadRequestException('Informe o chatId do atendimento.');
    const atual = this.porChat(chatId);
    if (atual && atual.status !== 'finalizado') {
      if (nome) atual.cliente.nome = nome;
      if (telefone) atual.cliente.telefone = telefone;
      this.salvar(atual);
      return atual;
    }
    const agora = new Date().toISOString();
    const sessao: Sessao = {
      token: randomBytes(9).toString('base64url'),
      chatId,
      cliente: { nome: nome || '', telefone: telefone || '' },
      status: 'link_enviado',
      itens: [],
      totais: { itens: 0, subtotal: 0, frete: 0, total: 0 },
      checkout: null,
      eventos: [{ em: agora, texto: 'Link do catálogo gerado' }],
      criadaEm: agora,
      atualizadaEm: agora,
      abertaEm: null,
      finalizadaEm: null,
    };
    this.porToken.set(sessao.token, sessao);
    this.tokenPorChat.set(chatId, sessao.token);
    this.salvar(sessao);
    return sessao;
  }

  porChat(chatId: string): Sessao | null {
    const token = this.tokenPorChat.get(String(chatId));
    return token ? this.porToken.get(token) || null : null;
  }

  obter(token: string): Sessao {
    const sessao = this.porToken.get(token);
    if (!sessao) throw new NotFoundException('Este link de catálogo não existe ou expirou. Peça um novo no WhatsApp.');
    return sessao;
  }

  /** O cliente abriu a página do catálogo. */
  registrarAbertura(token: string): Sessao {
    const sessao = this.obter(token);
    if (sessao.status === 'link_enviado') {
      sessao.status = 'navegando';
      sessao.abertaEm = new Date().toISOString();
      this.registrar(sessao, 'Cliente abriu o catálogo');
      this.salvar(sessao);
    }
    return sessao;
  }

  /** Substitui o carrinho. Preço, nome e estoque vêm sempre do catálogo, nunca do navegador. */
  definirCarrinho(token: string, pedidos: { sku: string; quantidade: number }[]): Sessao {
    const sessao = this.obter(token);
    if (sessao.status === 'finalizado') throw new ConflictException('Este pedido já foi enviado ao atendente.');
    if (!Array.isArray(pedidos)) throw new BadRequestException('Envie a lista de itens.');

    const quantidades = new Map<string, number>();
    for (const p of pedidos) {
      const quantidade = Math.floor(Number(p?.quantidade));
      if (!p?.sku || !(quantidade > 0)) continue;
      quantidades.set(p.sku, Math.min((quantidades.get(p.sku) || 0) + quantidade, MAX_QUANTIDADE));
    }

    const itens: ItemCarrinho[] = [];
    for (const [sku, pedida] of quantidades) {
      // SKU que saiu do catálogo (ou produto sem a variação escolhida) é descartado, sem derrubar o resto do carrinho.
      const item = this.catalogo.itemVendavelOuNulo(sku);
      if (!item) continue;
      const quantidade = Math.min(pedida, item.estoque);
      if (quantidade <= 0) continue;
      const m2PorUnidade = item.produto.unit_measurement === 'CX' ? item.produto.demo.m2PorUnidade || null : null;
      itens.push({
        sku,
        skuProduto: item.produto.sku,
        nome: item.produto.name,
        variacao: item.variacao?.variety_name || null,
        unidade: item.produto.unit_measurement,
        quantidade,
        precoUnitario: item.preco,
        subtotal: arredondar(item.preco * quantidade),
        m2: m2PorUnidade ? arredondar(m2PorUnidade * quantidade) : null,
      });
    }

    this.registrarMudancas(sessao, sessao.itens, itens);
    sessao.itens = itens;
    if (sessao.status === 'link_enviado') sessao.status = 'navegando';
    this.recalcular(sessao);
    this.salvar(sessao);
    return sessao;
  }

  async finalizar(token: string, corpo: Partial<Checkout> & { lojaId?: number }): Promise<Sessao> {
    const sessao = this.obter(token);
    if (sessao.status === 'finalizado') throw new ConflictException('Este pedido já foi enviado ao atendente.');
    if (!sessao.itens.length) throw new BadRequestException('O carrinho está vazio.');

    const observacoes = texto(corpo.observacoes, 500);
    if (corpo.tipo === 'entrega') {
      const entrega = validarEntrega(corpo.entrega);
      sessao.checkout = { tipo: 'entrega', entrega, loja: null, observacoes };
      if (entrega.nome) sessao.cliente.nome = entrega.nome;
      if (entrega.telefone) sessao.cliente.telefone = entrega.telefone;
    } else if (corpo.tipo === 'retirada') {
      const loja = this.catalogo.loja(Number(corpo.lojaId));
      sessao.checkout = { tipo: 'retirada', entrega: null, loja, observacoes };
    } else {
      throw new BadRequestException('Escolha entrega ou retirada.');
    }

    sessao.status = 'finalizado';
    sessao.finalizadaEm = new Date().toISOString();
    this.recalcular(sessao);
    this.registrar(sessao, `Cliente finalizou o pedido (${sessao.checkout.tipo}) — ${moeda(sessao.totais.total)}`);
    this.salvar(sessao);
    await this.avisarKentro(sessao);
    return sessao;
  }

  /** Texto do handoff para o atendente (o mesmo formato do escopo). */
  resumo(sessao: Sessao): string {
    const c = sessao.checkout;
    const linhas = [
      'Resumo do atendimento',
      '',
      `Cliente: ${sessao.cliente.nome || 'não informado'}`,
      `Telefone: ${sessao.cliente.telefone || 'não informado'}`,
    ];
    if (c?.tipo === 'entrega' && c.entrega) {
      const e = c.entrega;
      linhas.push('Tipo: Entrega');
      linhas.push(`Endereço: ${e.rua}, nº ${e.numero}${e.complemento ? ' — ' + e.complemento : ''} — ${e.bairro} — ${e.cidade}/${e.estado} — CEP ${e.cep}`);
      if (e.referencia) linhas.push(`Referência: ${e.referencia}`);
    } else if (c?.tipo === 'retirada' && c.loja) {
      linhas.push('Tipo: Retirada');
      linhas.push(`Loja: ${c.loja.nome} (${c.loja.endereco})`);
    } else {
      linhas.push('Tipo: ainda não escolhido');
    }
    linhas.push('', 'Produtos:');
    for (const i of sessao.itens) {
      linhas.push(`• ${i.nome}${i.variacao ? ' (' + i.variacao + ')' : ''} — ${i.quantidade} ${unidade(i.unidade, i.quantidade)}${i.m2 ? ' (' + num(i.m2) + ' m²)' : ''} — ${moeda(i.subtotal)}`);
    }
    linhas.push('', `Subtotal: ${moeda(sessao.totais.subtotal)}`);
    if (c?.tipo === 'entrega') linhas.push(`Frete: ${sessao.totais.frete ? moeda(sessao.totais.frete) : 'grátis'}`);
    linhas.push(`Total do carrinho: ${moeda(sessao.totais.total)}`);
    if (c?.observacoes) linhas.push('', `Observações: ${c.observacoes}`);
    return linhas.join('\n');
  }

  private recalcular(sessao: Sessao) {
    const subtotal = arredondar(sessao.itens.reduce((s, i) => s + i.subtotal, 0));
    const frete = sessao.checkout?.tipo === 'entrega' ? this.catalogo.frete(subtotal).valor : 0;
    sessao.totais = {
      itens: sessao.itens.reduce((s, i) => s + i.quantidade, 0),
      subtotal,
      frete,
      total: arredondar(subtotal + frete),
    };
  }

  private registrarMudancas(sessao: Sessao, antes: ItemCarrinho[], depois: ItemCarrinho[]) {
    const anterior = new Map(antes.map((i) => [i.sku, i]));
    for (const item of depois) {
      const velho = anterior.get(item.sku);
      const nome = item.nome + (item.variacao ? ` (${item.variacao})` : '');
      if (!velho) this.registrar(sessao, `Adicionou ${item.quantidade} ${unidade(item.unidade, item.quantidade)} de ${nome}`);
      else if (velho.quantidade !== item.quantidade) this.registrar(sessao, `Alterou ${nome}: ${velho.quantidade} → ${item.quantidade}`);
      anterior.delete(item.sku);
    }
    for (const removido of anterior.values()) {
      this.registrar(sessao, `Removeu ${removido.nome}${removido.variacao ? ` (${removido.variacao})` : ''}`);
    }
  }

  private registrar(sessao: Sessao, texto: string) {
    sessao.eventos.unshift({ em: new Date().toISOString(), texto });
    sessao.eventos.length = Math.min(sessao.eventos.length, MAX_EVENTOS);
  }

  private async avisarKentro(sessao: Sessao) {
    if (!config.kentroWebhookUrl) return;
    const corpo = {
      evento: 'carrinho_finalizado',
      chatId: sessao.chatId,
      token: sessao.token,
      cliente: sessao.cliente,
      tipo: sessao.checkout?.tipo,
      total: sessao.totais.total,
      itens: sessao.totais.itens,
      resumo: this.resumo(sessao),
    };
    try {
      const resposta = await fetch(config.kentroWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(8000),
      });
      this.logger.log(`Webhook Kentro (chat ${sessao.chatId}): HTTP ${resposta.status}`);
    } catch (erro) {
      // O pedido do cliente não pode falhar por causa do aviso; a extensão mostra o status de qualquer forma.
      this.logger.warn(`Webhook Kentro falhou (chat ${sessao.chatId}): ${(erro as Error).message}`);
    }
  }

  private salvar(sessao: Sessao) {
    sessao.atualizadaEm = new Date().toISOString();
    if (this.gravacaoPendente) return;
    this.gravacaoPendente = setTimeout(() => {
      this.gravacaoPendente = null;
      try {
        mkdirSync(dirname(config.arquivoSessoes), { recursive: true });
        writeFileSync(config.arquivoSessoes, JSON.stringify([...this.porToken.values()]));
      } catch (erro) {
        this.logger.warn(`Não foi possível gravar as sessões: ${(erro as Error).message}`);
      }
    }, 500);
  }

  private carregar() {
    if (!existsSync(config.arquivoSessoes)) return;
    try {
      const sessoes = JSON.parse(readFileSync(config.arquivoSessoes, 'utf8')) as Sessao[];
      for (const s of sessoes.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))) {
        this.porToken.set(s.token, s);
        this.tokenPorChat.set(s.chatId, s.token);
      }
      this.logger.log(`${sessoes.length} sessão(ões) carregada(s).`);
    } catch (erro) {
      this.logger.warn(`Arquivo de sessões ignorado: ${(erro as Error).message}`);
    }
  }
}

function validarEntrega(e: Partial<DadosEntrega> | null | undefined): DadosEntrega {
  const dados: DadosEntrega = {
    nome: texto(e?.nome, 120),
    telefone: texto(e?.telefone, 30),
    cep: String(e?.cep || '').replace(/\D/g, '').slice(0, 8),
    estado: texto(e?.estado, 2).toUpperCase(),
    cidade: texto(e?.cidade, 80),
    bairro: texto(e?.bairro, 80),
    rua: texto(e?.rua, 120),
    numero: texto(e?.numero, 20),
    complemento: texto(e?.complemento, 80),
    referencia: texto(e?.referencia, 160),
  };
  const faltando: string[] = (['nome', 'telefone', 'estado', 'cidade', 'bairro', 'rua', 'numero'] as const).filter((k) => !dados[k]);
  if (dados.cep.length !== 8) faltando.unshift('CEP');
  if (faltando.length) throw new BadRequestException(`Preencha: ${faltando.join(', ')}.`);
  dados.cep = `${dados.cep.slice(0, 5)}-${dados.cep.slice(5)}`;
  return dados;
}

function texto(valor: unknown, max: number): string {
  return String(valor ?? '').trim().slice(0, max);
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function num(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

const UNIDADES: Record<string, [string, string]> = {
  CX: ['caixa', 'caixas'], SC: ['saco', 'sacos'], UN: ['unidade', 'unidades'], KIT: ['kit', 'kits'], RL: ['rolo', 'rolos'],
};

export function unidade(sigla: string, quantidade: number): string {
  const nomes = UNIDADES[sigla] || [sigla, sigla];
  return quantidade === 1 ? nomes[0] : nomes[1];
}
