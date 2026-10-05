# Demo: catálogo + extensão Kentro — Shopping dos Pisos

## Objetivo
Demo para apresentar ao cliente (Paulo): a IA da Kentro envia um link de catálogo
com cara de e-commerce; o cliente monta o carrinho e finaliza (entrega ou retirada);
o atendente acompanha o carrinho ao vivo numa extensão da Kentro e recebe o resumo
do handoff. Produtos fictícios, no formato das respostas da API eCommerce-net,
para trocar pela API real depois sem mexer nas telas.

## Componentes
1. **Serviço `catalogo-service`** (NestJS, porta 3000, sobe na VPS como "API ou microsserviço")
   - `GET /` — verificação de saúde.
   - `POST /api/sessoes` (X-Api-Key) — `{chatId, nome, telefone}` → cria/reaproveita a sessão do atendimento e devolve `{token, url}`.
   - `GET /api/sessoes/chat/:chatId` (X-Api-Key) — carrinho e status do atendimento (a extensão consulta).
   - `GET /c/:token` — página do catálogo (cliente).
   - `GET /api/loja/:token`, `PUT /api/loja/:token/carrinho`, `POST /api/loja/:token/finalizar` — usadas pela página. Preços sempre recalculados no servidor.
   - `GET /api/catalogo/*` — categorias, produtos, compre-junto, lojas, frete (dados fictícios em JSON no formato eCommerce-net).
   - Ao finalizar, POST na captura de webhook da Kentro (se configurada) com chatId e resumo.
   - Sessões em memória + arquivo `data/sessoes.json` (perde-se em novo deploy; aceitável na demo).
2. **Extensão `mateus.shoppingdospisos`** (chatPanel) — gera/copia o link, mostra o carrinho ao vivo (consulta a cada 5 s via `omni.http.request`, limite 30/min) e o resumo do handoff com "Copiar resumo". Config: `api_url`, `api_key`.
3. **Kentro**
   - Automação "Enviar catálogo": request `POST /api/sessoes` com `chat_id`, nome e telefone → envia botão com o link. Usada pela função `enviar_link_catalogo` do assistente (`endsturn=1`).
   - Captura de webhook + automação "Carrinho finalizado": associa o atendimento pelo chatId e provoca o assistente com o resumo (`aiProvokeAssistant`).

## Fora do escopo
API real eCommerce-net, banco de dados, pagamento, autenticação de cliente.
