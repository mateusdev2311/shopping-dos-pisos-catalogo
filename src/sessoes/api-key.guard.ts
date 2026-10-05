import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { config } from '../config';

/** Rotas chamadas pela Kentro (extensão e automações) exigem o cabeçalho X-Api-Key. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const recebida = Buffer.from(String(contexto.switchToHttp().getRequest<Request>().headers['x-api-key'] || ''));
    const esperada = Buffer.from(config.apiKey);
    if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
      throw new UnauthorizedException('Chave de API inválida (cabeçalho X-Api-Key).');
    }
    return true;
  }
}
