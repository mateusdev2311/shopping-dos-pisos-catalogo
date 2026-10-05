import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CatalogoController } from './catalogo/catalogo.controller';
import { CatalogoService } from './catalogo/catalogo.service';
import { LojaController, SessoesController } from './sessoes/sessoes.controller';
import { SessoesService } from './sessoes/sessoes.service';

@Module({
  controllers: [AppController, CatalogoController, SessoesController, LojaController],
  providers: [CatalogoService, SessoesService],
})
export class AppModule {}
