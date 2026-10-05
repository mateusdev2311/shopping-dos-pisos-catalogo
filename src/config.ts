// A tela de deploy da VPS não tem campo de variáveis de ambiente, então cada valor
// tem um padrão aqui. Variáveis de ambiente, quando existirem, têm prioridade.
export const config = {
  porta: Number(process.env.PORT) || 3000,

  // Chave que a extensão e as automações da Kentro enviam no cabeçalho X-Api-Key.
  apiKey: process.env.API_KEY || 'DdOUWmPqzCnWPzKQXJMU7heNfOh6vueA',

  // Endereço público do serviço (ex.: https://catalogo.suaempresa.com). Vazio = deduzido
  // da requisição (cabeçalhos X-Forwarded-Proto/Host do proxy da VPS).
  urlPublica: process.env.PUBLIC_URL || '',

  // Captura de webhook da Kentro avisada quando o cliente finaliza o carrinho.
  // Vazio = não avisa (a extensão continua mostrando o pedido finalizado).
  kentroWebhookUrl: process.env.KENTRO_WEBHOOK_URL || 'https://kentro.atenderbem.com/webhookcapture/capture/catalogo-sdp-a9dc6c9f9979f8012ace465b',

  // Onde as sessões são gravadas para sobreviver a um reinício do container.
  arquivoSessoes: process.env.SESSOES_FILE || 'data/sessoes.json',
};
