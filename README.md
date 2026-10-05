# Catálogo Shopping dos Pisos — demo Kentro

Demonstração do fluxo **IA → catálogo → carrinho → entrega/retirada → atendente**:

- **Catálogo para o cliente** (`/c/<token>`): página com cara de e-commerce, pensada para celular. Tem busca, categorias, variações, calculadora de caixas por m², "Compre junto", carrinho e finalização com entrega (CEP preenchido via ViaCEP) ou retirada na loja.
- **Extensão da Kentro** (`extensao/index.html`, publicada como `mateus.shoppingdospisos`): painel lateral do atendimento. Gera e copia o link, mostra o carrinho ao vivo e, quando o cliente finaliza, o resumo do pedido.
- **Aviso para a Kentro**: ao finalizar, o serviço chama uma captura de webhook. A automação deixa o resumo como nota interna e provoca a assistente.

Os produtos são **fictícios**, no formato da API eCommerce-net (`src/catalogo/dados/catalogo.json`). Para usar a API real, troque o corpo dos métodos de `src/catalogo/catalogo.service.ts`.

## Rodar localmente

```bash
npm install
npm run start:dev   # http://localhost:3000
npm test            # testes de ponta a ponta
```

Para criar um link de teste:

```bash
curl -X POST http://localhost:3000/api/sessoes \
  -H "X-Api-Key: <chave>" -H "Content-Type: application/json" \
  -d '{"chatId":"123","nome":"João da Silva","telefone":"5538999990000"}'
```

## Configuração (`src/config.ts`)

A tela de deploy da VPS não tem variáveis de ambiente, então cada valor tem um padrão no código. Se existir uma variável de ambiente, ela vale por cima do padrão.

| Variável | Uso |
|---|---|
| `API_KEY` | Chave exigida no cabeçalho `X-Api-Key` (extensão e automação da Kentro) |
| `KENTRO_WEBHOOK_URL` | Captura de webhook avisada quando o cliente finaliza |
| `PUBLIC_URL` | URL pública. Vazia = deduzida da requisição |
| `SESSOES_FILE` | Arquivo das sessões (padrão `data/sessoes.json`) |

As sessões ficam em memória e num arquivo JSON. Um novo deploy apaga os carrinhos, o que não é problema para a demo.

## Rotas

| Rota | Quem usa |
|---|---|
| `GET /` | Verificação de saúde da VPS |
| `POST /api/sessoes` 🔑 | Automação/extensão: cria ou reaproveita o link do atendimento |
| `GET /api/sessoes/chat/:chatId` 🔑 | Extensão: carrinho, status, atividade e resumo |
| `GET /c/:token` | Cliente: página do catálogo |
| `GET/PUT/POST /api/loja/:token…` | Página do catálogo (abrir, carrinho, finalizar) |
| `GET /api/catalogo/*`, `GET /img/:sku.svg` | Produtos, lojas, frete e imagens ilustrativas |

🔑 = exige `X-Api-Key`.

## Na Kentro (kentro.atenderbem.com)

- Extensão **Catálogo Shopping dos Pisos** (`mateus.shoppingdospisos`, id 15): manifest em `https://cdn.a-tend.online/mateus.shoppingdospisos/manifest.json`. A instalação pede `api_url` (URL da VPS) e `api_key`.
- Automação **108 — Cliente finalizou o carrinho**: disparada pela captura de webhook `catalogo-sdp-…`.
- Automação **109 — Enviar link do catálogo**: usada pela função `enviar_link_catalogo` da assistente. Troque `URL-DO-CATALOGO` pela URL da VPS.
- Automação **110 — Consultar produtos**: usada pela função `consultar_produtos`. Chama `GET /api/catalogo/resumo-ia?busca=`. Também tem `URL-DO-CATALOGO` (no elemento `montar_url`).
- Assistente **2 — Shopping dos Pisos — Vendas (catálogo)** ("Ana"): faz o pré-atendimento do escopo e usa as duas funções acima. Ao receber o evento de pedido finalizado, confirma e transfere com o marcador `pedido_finalizado`.
