import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

export const PASTA_PUBLICA = join(__dirname, '..', 'public');

@Controller()
export class AppController {
  /** Rota de verificação da VPS. */
  @Get()
  saude() {
    return { ok: true, servico: 'Catálogo Shopping dos Pisos', em: new Date().toISOString() };
  }

  /** Página do catálogo. O token é validado pela própria página ao chamar a API. */
  @Get('c/:token')
  catalogo(@Param('token') _token: string, @Res() res: Response) {
    res.sendFile(join(PASTA_PUBLICA, 'loja.html'));
  }
}
