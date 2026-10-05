import { Body, Controller, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { config } from '../config';
import { ApiKeyGuard } from './api-key.guard';
import { SessoesService } from './sessoes.service';
import { Sessao } from './sessoes.types';

/** Rotas usadas pela Kentro: a automação gera o link, a extensão acompanha o carrinho. */
@Controller('api/sessoes')
@UseGuards(ApiKeyGuard)
export class SessoesController {
  constructor(private readonly sessoes: SessoesService) {}

  @Post()
  criar(@Body() corpo: { chatId?: string | number; nome?: string; telefone?: string }, @Req() req: Request) {
    const sessao = this.sessoes.criarOuReaproveitar(String(corpo?.chatId ?? ''), corpo?.nome || '', corpo?.telefone || '');
    return this.paraKentro(sessao, req);
  }

  @Get('chat/:chatId')
  doChat(@Param('chatId') chatId: string, @Req() req: Request) {
    const sessao = this.sessoes.porChat(chatId);
    if (!sessao) throw new NotFoundException('Nenhum link de catálogo gerado para este atendimento.');
    return this.paraKentro(sessao, req);
  }

  private paraKentro(sessao: Sessao, req: Request) {
    const url = `${urlBase(req)}/c/${sessao.token}`;
    return { ...sessao, url, resumo: this.sessoes.resumo(sessao) };
  }
}

/** Rotas usadas pela página do catálogo, autenticadas pelo token do link. */
@Controller('api/loja/:token')
export class LojaController {
  constructor(private readonly sessoes: SessoesService) {}

  @Get()
  abrir(@Param('token') token: string) {
    return paraCliente(this.sessoes.registrarAbertura(token));
  }

  @Put('carrinho')
  carrinho(@Param('token') token: string, @Body() corpo: { itens?: { sku: string; quantidade: number }[] }) {
    return paraCliente(this.sessoes.definirCarrinho(token, corpo?.itens || []));
  }

  @Post('finalizar')
  async finalizar(@Param('token') token: string, @Body() corpo: Record<string, any>) {
    return paraCliente(await this.sessoes.finalizar(token, corpo || {}));
  }
}

/** O cliente não precisa ver o ID do atendimento nem o histórico interno. */
function paraCliente(s: Sessao) {
  return {
    cliente: s.cliente,
    status: s.status,
    itens: s.itens,
    totais: s.totais,
    checkout: s.checkout,
    finalizadaEm: s.finalizadaEm,
  };
}

function urlBase(req: Request): string {
  if (config.urlPublica) return config.urlPublica.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim();
  return `${proto}://${host}`;
}
