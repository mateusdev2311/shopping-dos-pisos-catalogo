// Teste de ponta a ponta: sobe o serviço compilado (dist/) e percorre o fluxo da demo.
// Rode com: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const http = require('node:http');

const PORTA = 3999;
const BASE = `http://127.0.0.1:${PORTA}`;
const CHAVE = 'chave-de-teste';
let servidor;
let webhookRecebido = null;
let webhook;

async function chamar(caminho, opcoes = {}) {
  const r = await fetch(BASE + caminho, {
    method: opcoes.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opcoes.chave ? { 'X-Api-Key': CHAVE } : {}), ...(opcoes.headers || {}) },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

before(async () => {
  webhook = http.createServer((req, res) => {
    let dados = '';
    req.on('data', (c) => (dados += c)).on('end', () => { webhookRecebido = JSON.parse(dados); res.end('ok'); });
  }).listen(4999);

  servidor = spawn(process.execPath, [join(__dirname, '..', 'dist', 'main.js')], {
    env: {
      ...process.env, PORT: String(PORTA), API_KEY: CHAVE,
      KENTRO_WEBHOOK_URL: 'http://127.0.0.1:4999/webhook',
      SESSOES_FILE: join(tmpdir(), `sdp-teste-${Date.now()}.json`),
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/')).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('serviço não subiu');
});

after(() => { servidor?.kill(); webhook?.close(); });

test('rotas da Kentro exigem a chave', async () => {
  const r = await chamar('/api/sessoes', { method: 'POST', body: { chatId: 1 } });
  assert.equal(r.status, 401);
});

test('fluxo completo: link → carrinho → finalização → aviso à Kentro', async () => {
  const criada = await chamar('/api/sessoes', {
    method: 'POST', chave: true,
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'catalogo.exemplo.com' },
    body: { chatId: 4521, nome: 'João da Silva', telefone: '5538999990000' },
  });
  assert.equal(criada.status, 201);
  assert.match(criada.corpo.url, /^https:\/\/catalogo\.exemplo\.com\/c\/[\w-]+$/);
  const token = criada.corpo.token;

  // Gerar de novo para o mesmo atendimento reaproveita o link.
  const denovo = await chamar('/api/sessoes', { method: 'POST', chave: true, body: { chatId: '4521' } });
  assert.equal(denovo.corpo.token, token);
  assert.equal(denovo.corpo.cliente.nome, 'João da Silva');

  const aberta = await chamar(`/api/loja/${token}`);
  assert.equal(aberta.corpo.status, 'navegando');
  assert.equal(aberta.corpo.chatId, undefined, 'o cliente não vê o ID do atendimento');

  const carrinho = await chamar(`/api/loja/${token}/carrinho`, {
    method: 'PUT',
    body: { itens: [
      { sku: 'PRC-6060-CAL', quantidade: 10 },
      { sku: 'ARG-AC3-20', quantidade: 4 },
      { sku: 'CER-6060-EXT', quantidade: 50 },   // estoque 15
      { sku: 'PRC-2090-MAD', quantidade: 1 },    // produto com variação sem a variação: descartado
      { sku: 'NAO-EXISTE', quantidade: 2 },
      { sku: 'REJ-EPX-1KG-CIN', quantidade: 2, precoUnitario: 0.01 }, // preço do navegador é ignorado
    ] },
  });
  assert.equal(carrinho.status, 200);
  const porSku = Object.fromEntries(carrinho.corpo.itens.map((i) => [i.sku, i]));
  assert.deepEqual(Object.keys(porSku).sort(), ['ARG-AC3-20', 'CER-6060-EXT', 'PRC-6060-CAL', 'REJ-EPX-1KG-CIN']);
  assert.equal(porSku['CER-6060-EXT'].quantidade, 15);
  assert.equal(porSku['PRC-6060-CAL'].precoUnitario, 119.9);
  assert.equal(porSku['PRC-6060-CAL'].m2, 14.4);
  assert.equal(porSku['REJ-EPX-1KG-CIN'].precoUnitario, 69.9);
  assert.equal(carrinho.corpo.totais.subtotal, 2546.9); // 1199 + 159,60 + 1048,50 + 139,80

  const invalido = await chamar(`/api/loja/${token}/finalizar`, { method: 'POST', body: { tipo: 'entrega', entrega: { nome: 'João' } } });
  assert.equal(invalido.status, 400);
  assert.match(invalido.corpo.message, /CEP/);

  const final = await chamar(`/api/loja/${token}/finalizar`, {
    method: 'POST',
    body: {
      tipo: 'entrega', observacoes: 'Entregar à tarde',
      entrega: { nome: 'João da Silva', telefone: '(38) 99999-0000', cep: '39400000', estado: 'mg', cidade: 'Montes Claros', bairro: 'Centro', rua: 'Rua X', numero: '100' },
    },
  });
  assert.equal(final.status, 201);
  assert.equal(final.corpo.status, 'finalizado');
  assert.equal(final.corpo.totais.frete, 0, 'frete grátis acima de R$ 2.000');
  assert.equal(final.corpo.checkout.entrega.cep, '39400-000');

  const kentro = await chamar('/api/sessoes/chat/4521', { chave: true });
  assert.match(kentro.corpo.resumo, /Tipo: Entrega/);
  assert.match(kentro.corpo.resumo, /Rua X, nº 100 — Centro — Montes Claros\/MG — CEP 39400-000/);
  assert.match(kentro.corpo.resumo, /Porcelanato Calacata Polido 60x60 — 10 caixas \(14,4 m²\)/);
  assert.match(kentro.corpo.resumo, /Observações: Entregar à tarde/);
  assert.ok(kentro.corpo.eventos.some((e) => /Adicionou 10 caixas de Porcelanato Calacata/.test(e.texto)));

  assert.equal(webhookRecebido?.evento, 'carrinho_finalizado');
  assert.equal(webhookRecebido.chatId, '4521');

  const depois = await chamar(`/api/loja/${token}/carrinho`, { method: 'PUT', body: { itens: [] } });
  assert.equal(depois.status, 409, 'pedido enviado não pode mais ser alterado');

  const novo = await chamar('/api/sessoes', { method: 'POST', chave: true, body: { chatId: 4521 } });
  assert.notEqual(novo.corpo.token, token, 'depois de finalizar, um novo link abre outro carrinho');
});

test('retirada exige uma loja válida', async () => {
  const { corpo } = await chamar('/api/sessoes', { method: 'POST', chave: true, body: { chatId: 777 } });
  await chamar(`/api/loja/${corpo.token}/carrinho`, { method: 'PUT', body: { itens: [{ sku: 'ARG-AC2-20', quantidade: 3 }] } });
  const semLoja = await chamar(`/api/loja/${corpo.token}/finalizar`, { method: 'POST', body: { tipo: 'retirada', lojaId: 99 } });
  assert.equal(semLoja.status, 404);
  const ok = await chamar(`/api/loja/${corpo.token}/finalizar`, { method: 'POST', body: { tipo: 'retirada', lojaId: 2 } });
  assert.equal(ok.corpo.checkout.loja.nome, 'Shopping dos Pisos — Loja Zona Norte');
  assert.equal(ok.corpo.totais.total, 83.7);
});

test('link inexistente responde 404 com mensagem para o cliente', async () => {
  const r = await chamar('/api/loja/nao-existe');
  assert.equal(r.status, 404);
  assert.match(r.corpo.message, /Peça um novo/);
});

test('imagens e catálogo', async () => {
  const img = await fetch(`${BASE}/img/REV-HEX-SAL-TER.svg`);
  assert.equal(img.status, 200);
  assert.match(await img.text(), /^<svg/);
  const busca = await chamar('/api/catalogo/produtos?busca=rejunte');
  assert.deepEqual(busca.corpo.data.map((p) => p.sku).sort(), ['REJ-CIM-5KG', 'REJ-EPX-1KG']);
  const junto = await chamar('/api/catalogo/produtos/PRC-2090-MAD-NOG/compre-junto');
  assert.deepEqual(junto.corpo.data.map((p) => p.sku), ['ARG-AC3-20', 'REJ-EPX-1KG', 'ACS-NIV-KIT']);
});
