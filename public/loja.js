(function () {
  'use strict';

  var token = decodeURIComponent((location.pathname.match(/\/c\/([^/?#]+)/) || [])[1] || '');
  var UNIDADES = { CX: ['caixa', 'caixas'], SC: ['saco', 'sacos'], UN: ['unidade', 'unidades'], KIT: ['kit', 'kits'], RL: ['rolo', 'rolos'] };

  var estado = {
    categorias: [], produtos: [], lojas: [], sessao: null,
    categoria: 0, busca: '',
    carrinho: {},          // sku -> quantidade (espelho local, a resposta do servidor é a verdade)
    versao: 0,             // descarta respostas de sincronização fora de ordem
    tela: 'carrinho',      // carrinho | checkout | confirmado
    checkout: { tipo: '', lojaId: 0 }
  };

  var $ = function (id) { return document.getElementById(id); };

  // ── Utilitários ────────────────────────────────────────────────────────
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function num(v) { return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
  function unidade(sigla, q) { var n = UNIDADES[sigla] || [sigla, sigla]; return q === 1 ? n[0] : n[1]; }
  function preco(p, promo) { return Number(promo) > 0 ? Number(promo) : Number(p); }
  /** 5538988887777 → (38) 98888-7777 (o número vem da Kentro com DDI). */
  function telefone(t) {
    var d = String(t || '').replace(/\D/g, '');
    if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return t || '';
  }
  function imagem(sku) { return '/img/' + encodeURIComponent(sku) + '.svg'; }

  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    return fetch(caminho, {
      method: opcoes.method || 'GET',
      headers: opcoes.body ? { 'Content-Type': 'application/json' } : {},
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (dados) {
        if (!r.ok) {
          var msg = Array.isArray(dados.message) ? dados.message.join(' ') : dados.message;
          throw { status: r.status, mensagem: msg || 'Não foi possível concluir. Tente de novo.' };
        }
        return dados;
      });
    });
  }

  var avisoTimer;
  function aviso(texto, erro) {
    var a = $('aviso');
    a.textContent = texto;
    a.className = 'aviso-flutuante' + (erro ? ' erro' : '');
    a.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { a.hidden = true; }, 2600);
  }

  // ── Produtos ───────────────────────────────────────────────────────────
  function produtoDoSku(sku) {
    for (var i = 0; i < estado.produtos.length; i++) {
      var p = estado.produtos[i];
      if (p.sku === sku) return { produto: p, variacao: null };
      var v = (p.children || []).filter(function (c) { return c.sku === sku; })[0];
      if (v) return { produto: p, variacao: v };
    }
    return null;
  }

  function faixaDePreco(p) {
    if (!p.children || !p.children.length) return { valor: preco(p.price, p.promotional_price), de: Number(p.promotional_price) > 0 ? Number(p.price) : 0, aPartir: false };
    var precos = p.children.map(function (v) { return preco(v.price, v.promotional_price); });
    var min = Math.min.apply(null, precos);
    return { valor: min, de: 0, aPartir: Math.max.apply(null, precos) > min };
  }

  function quantidadeDoProduto(p) {
    var skus = p.children && p.children.length ? p.children.map(function (v) { return v.sku; }) : [p.sku];
    return skus.reduce(function (s, sku) { return s + (estado.carrinho[sku] || 0); }, 0);
  }

  function seloDe(p) {
    var tag = (p.demo.tags || [])[0];
    if (!tag) return '';
    var classe = /oferta/i.test(tag) ? ' oferta' : /últimas/i.test(tag) ? ' alerta' : '';
    return '<span class="selo' + classe + '">' + esc(tag) + '</span>';
  }

  function renderCategorias() {
    var html = '<button type="button" data-cat="0" class="' + (estado.categoria === 0 ? 'ativa' : '') + '">Todos</button>';
    estado.categorias.forEach(function (c) {
      html += '<button type="button" data-cat="' + c.id + '" class="' + (estado.categoria === c.id ? 'ativa' : '') + '">' + esc(c.name) + '</button>';
    });
    $('categorias').innerHTML = html;
  }

  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  function renderGrade() {
    var termo = normalizar(estado.busca).trim();
    var lista = estado.produtos.filter(function (p) {
      if (estado.categoria && p.category_id !== estado.categoria) return false;
      if (!termo) return true;
      var texto = normalizar([p.name, p.sku, p.short_description].concat((p.children || []).map(function (v) { return v.variety_name; })).join(' '));
      return termo.split(/\s+/).every(function (palavra) { return texto.indexOf(palavra) >= 0; });
    });
    var cat = estado.categorias.filter(function (c) { return c.id === estado.categoria; })[0];
    $('resultado').textContent = lista.length + ' produto' + (lista.length === 1 ? '' : 's') + (cat ? ' em ' + cat.name : '') + (termo ? ' para "' + estado.busca.trim() + '"' : '');
    $('destaque').hidden = !!(termo || estado.categoria);
    if (!lista.length) {
      $('grade').innerHTML = '<p class="vazio">Nenhum produto encontrado. Tente outra palavra ou fale com a gente no WhatsApp.</p>';
      return;
    }
    $('grade').innerHTML = lista.map(function (p) {
      var f = faixaDePreco(p);
      var m2 = p.unit_measurement === 'CX' && p.demo.m2PorUnidade
        ? '<span class="produto-m2">' + brl(f.valor / p.demo.m2PorUnidade) + ' o m²</span>'
        : '<span class="produto-m2">Vendido por ' + unidade(p.unit_measurement, 1) + '</span>';
      var q = quantidadeDoProduto(p);
      return '<button type="button" class="produto" data-sku="' + esc(p.sku) + '">' +
        '<div class="produto-imagem"><img src="' + imagem(p.children && p.children.length ? p.children[0].sku : p.sku) + '" alt="" loading="lazy">' + seloDe(p) + '</div>' +
        '<div class="produto-info"><span class="produto-nome">' + esc(p.name) + '</span>' + m2 +
        '<div class="preco">' + (f.de ? '<div class="preco-de">' + brl(f.de) + '</div>' : '') +
        '<div class="preco-por">' + (f.aPartir ? '<small>a partir de </small>' : '') + brl(f.valor) + ' <small>/' + unidade(p.unit_measurement, 1) + '</small></div>' +
        (q ? '<div class="no-carrinho">✓ ' + q + ' no carrinho</div>' : '') +
        '</div></div></button>';
    }).join('');
  }

  // ── Detalhe do produto ─────────────────────────────────────────────────
  var detalhe = null; // { produto, variacao, quantidade, metragem, perda }

  function abrirProduto(sku) {
    var achado = produtoDoSku(sku);
    if (!achado) return;
    var p = achado.produto;
    detalhe = { produto: p, variacao: achado.variacao || (p.children && p.children[0]) || null, quantidade: 1, metragem: '', perda: true };
    renderProduto();
    abrirPainel('painel-produto');
  }

  function skuDetalhe() { return detalhe.variacao ? detalhe.variacao.sku : detalhe.produto.sku; }

  function renderProduto() {
    var p = detalhe.produto, v = detalhe.variacao;
    var valor = v ? preco(v.price, v.promotional_price) : preco(p.price, p.promotional_price);
    var de = !v && Number(p.promotional_price) > 0 ? Number(p.price) : 0;
    var estoque = v ? v.stock : p.stock;
    var m2Unidade = p.unit_measurement === 'CX' ? p.demo.m2PorUnidade : 0;
    var noCarrinho = estado.carrinho[skuDetalhe()] || 0;

    var html = '<div class="detalhe">' +
      '<div class="detalhe-imagem"><img src="' + imagem(skuDetalhe()) + '" alt=""></div><div>' +
      '<span class="sku">Cód. ' + esc(skuDetalhe()) + '</span>' +
      '<h2 id="produto-nome">' + esc(p.name) + '</h2>' +
      '<div class="preco">' + (de ? '<div class="preco-de">' + brl(de) + '</div>' : '') +
      '<div class="preco-por">' + brl(valor) + ' <small>/' + unidade(p.unit_measurement, 1) + (m2Unidade ? ' · ' + brl(valor / m2Unidade) + '/m²' : '') + '</small></div></div>' +
      '<div class="estoque' + (estoque < 30 ? ' baixo' : '') + '">' + (estoque < 30 ? 'Últimas ' + estoque + ' ' + unidade(p.unit_measurement, estoque) : 'Em estoque') + '</div>' +
      '<p class="descricao">' + esc(p.description) + '</p>';

    if (p.children && p.children.length) {
      html += '<label class="campo">' + esc(p.variety_title || 'Opção') + ': ' + esc(v.variety_name) + '</label><div class="variacoes">' +
        p.children.map(function (c) {
          return '<button type="button" class="variacao' + (c.sku === v.sku ? ' ativa' : '') + '" data-variacao="' + esc(c.sku) + '">' +
            '<span class="amostra" style="background:linear-gradient(135deg,' + esc(c.color1) + ',' + esc(c.color2) + ')"></span>' + esc(c.variety_name) + '</button>';
        }).join('') + '</div>';
    }

    if (m2Unidade) {
      html += '<div class="calculadora"><strong>Quantas caixas eu preciso?</strong>' +
        '<div class="linha"><input class="entrada" id="calc-m2" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Área em m²" value="' + esc(detalhe.metragem) + '">' +
        '<label><input type="checkbox" id="calc-perda"' + (detalhe.perda ? ' checked' : '') + '> +10% de perda</label></div>' +
        '<small id="calc-resultado">' + textoCalculadora() + '</small></div>';
    }

    html += '<div class="comprar"><div class="quantidade">' +
      '<button type="button" data-qtd="-1" aria-label="Diminuir">−</button>' +
      '<input id="qtd-produto" type="number" inputmode="numeric" min="1" value="' + detalhe.quantidade + '" aria-label="Quantidade">' +
      '<button type="button" data-qtd="1" aria-label="Aumentar">+</button></div>' +
      '<button type="button" class="botao primario" id="adicionar">Adicionar</button></div>' +
      '<div class="total-linha" id="total-produto">' + textoTotalProduto(valor) + '</div>' +
      (noCarrinho ? '<div class="total-linha">Você já tem <strong>' + noCarrinho + ' ' + unidade(p.unit_measurement, noCarrinho) + '</strong> deste item no carrinho.</div>' : '') +
      '</div></div><div class="compre-junto" id="compre-junto"></div>';

    $('produto-conteudo').innerHTML = html;
    carregarCompreJunto();
  }

  function metragemDetalhe() {
    var m2 = detalhe.produto.demo.m2PorUnidade;
    return detalhe.produto.unit_measurement === 'CX' && m2 ? detalhe.quantidade * m2 : 0;
  }

  function textoCalculadora() {
    var m2 = metragemDetalhe();
    return detalhe.quantidade + ' ' + unidade('CX', detalhe.quantidade) + ' cobrem ' + num(m2) + ' m².';
  }

  function textoTotalProduto(valor) {
    var p = detalhe.produto;
    return detalhe.quantidade + ' ' + unidade(p.unit_measurement, detalhe.quantidade) + ' = <strong>' + brl(valor * detalhe.quantidade) + '</strong>';
  }

  function atualizarQuantidadeDetalhe(q) {
    detalhe.quantidade = Math.max(1, Math.min(999, Math.floor(q) || 1));
    var p = detalhe.produto, v = detalhe.variacao;
    var valor = v ? preco(v.price, v.promotional_price) : preco(p.price, p.promotional_price);
    $('qtd-produto').value = detalhe.quantidade;
    $('total-produto').innerHTML = textoTotalProduto(valor);
    if ($('calc-resultado')) $('calc-resultado').textContent = textoCalculadora();
    renderSugestoesQuantidades();
  }

  function calcularCaixas() {
    var m2 = parseFloat(String($('calc-m2').value).replace(',', '.'));
    detalhe.metragem = $('calc-m2').value;
    detalhe.perda = $('calc-perda').checked;
    if (!(m2 > 0)) return;
    var necessario = m2 * (detalhe.perda ? 1.1 : 1);
    atualizarQuantidadeDetalhe(Math.ceil(necessario / detalhe.produto.demo.m2PorUnidade));
  }

  // "Compre junto": sugere a quantidade pela metragem do piso escolhido.
  var sugestoes = [];
  function carregarCompreJunto() {
    var sku = detalhe.produto.sku;
    api('/api/catalogo/produtos/' + encodeURIComponent(sku) + '/compre-junto').then(function (r) {
      if (!detalhe || detalhe.produto.sku !== sku) return;
      sugestoes = (r.data || []).map(function (p) { return { produto: p, variacao: p.children && p.children.length ? p.children[0] : null }; });
      renderCompreJunto();
    }).catch(function () { /* sugestão é opcional */ });
  }

  function quantidadeSugerida(p) {
    var m2 = metragemDetalhe();
    if (!m2 || !p.demo.m2PorUnidade || p.unit_measurement === 'CX') return 1;
    return Math.max(1, Math.ceil(m2 / p.demo.m2PorUnidade));
  }

  function renderCompreJunto() {
    var alvo = $('compre-junto');
    if (!alvo || !sugestoes.length) { if (alvo) alvo.innerHTML = ''; return; }
    alvo.innerHTML = '<h3>Compre junto</h3><p>O que normalmente vai junto com este produto na obra.</p>' +
      sugestoes.map(function (s, i) {
        var p = s.produto, v = s.variacao;
        var valor = v ? preco(v.price, v.promotional_price) : preco(p.price, p.promotional_price);
        return '<div class="sugestao"><img src="' + imagem(v ? v.sku : p.sku) + '" alt="">' +
          '<div><strong>' + esc(p.name) + '</strong><small data-sugestao-texto="' + i + '"></small>' +
          (p.children && p.children.length ? '<select class="entrada" data-sugestao-variacao="' + i + '">' +
            p.children.map(function (c) { return '<option value="' + esc(c.sku) + '"' + (c.sku === v.sku ? ' selected' : '') + '>' + esc(c.variety_name) + '</option>'; }).join('') + '</select>' : '') +
          '</div><button type="button" class="botao" data-sugestao="' + i + '">+ ' + brl(valor) + '</button></div>';
      }).join('');
    renderSugestoesQuantidades();
  }

  function renderSugestoesQuantidades() {
    sugestoes.forEach(function (s, i) {
      var el = document.querySelector('[data-sugestao-texto="' + i + '"]');
      if (!el) return;
      var q = quantidadeSugerida(s.produto);
      var m2 = metragemDetalhe();
      el.textContent = m2 && s.produto.demo.m2PorUnidade && s.produto.unit_measurement !== 'CX'
        ? 'Para ' + num(m2) + ' m²: ' + q + ' ' + unidade(s.produto.unit_measurement, q)
        : 'Sugestão: ' + q + ' ' + unidade(s.produto.unit_measurement, q);
    });
  }

  // ── Carrinho ───────────────────────────────────────────────────────────
  var sincronizarTimer;
  var sincronizacaoPendente = false;
  function alterarCarrinho(sku, quantidade, mensagem) {
    if (finalizado()) { aviso('Seu pedido já foi enviado ao atendente.', true); return; }
    sincronizacaoPendente = true;
    if (quantidade > 0) estado.carrinho[sku] = Math.min(999, quantidade);
    else delete estado.carrinho[sku];
    if (mensagem) aviso(mensagem);
    renderTudo();
    pulsar();
    clearTimeout(sincronizarTimer);
    sincronizarTimer = setTimeout(sincronizar, 350);
  }

  function sincronizar() {
    sincronizacaoPendente = false;
    var versao = ++estado.versao;
    var itens = Object.keys(estado.carrinho).map(function (sku) { return { sku: sku, quantidade: estado.carrinho[sku] }; });
    api('/api/loja/' + encodeURIComponent(token) + '/carrinho', { method: 'PUT', body: { itens: itens } }).then(function (sessao) {
      if (versao !== estado.versao) return;
      var limitado = sessao.itens.filter(function (i) { return (estado.carrinho[i.sku] || 0) > i.quantidade; })[0];
      aplicarSessao(sessao);
      if (limitado) aviso('Só temos ' + limitado.quantidade + ' ' + unidade(limitado.unidade, limitado.quantidade) + ' de ' + limitado.nome + ' em estoque.', true);
    }).catch(function (e) { aviso(e.mensagem, true); });
  }

  function aplicarSessao(sessao) {
    estado.sessao = sessao;
    estado.carrinho = {};
    sessao.itens.forEach(function (i) { estado.carrinho[i.sku] = i.quantidade; });
    renderTudo();
  }

  function finalizado() { return estado.sessao && estado.sessao.status === 'finalizado'; }

  function totaisLocais() {
    var itens = 0, subtotal = 0;
    Object.keys(estado.carrinho).forEach(function (sku) {
      var achado = produtoDoSku(sku);
      if (!achado) return;
      var fonte = achado.variacao || achado.produto;
      itens += estado.carrinho[sku];
      subtotal += preco(fonte.price, fonte.promotional_price) * estado.carrinho[sku];
    });
    return { itens: itens, subtotal: Math.round(subtotal * 100) / 100 };
  }

  function pulsar() {
    var c = $('contador');
    c.classList.remove('pulsa'); void c.offsetWidth; c.classList.add('pulsa');
  }

  function renderBarra() {
    var t = totaisLocais();
    $('contador').hidden = !t.itens;
    $('contador').textContent = t.itens;
    var mostrar = t.itens > 0 && !finalizado() && $('painel-carrinho').hidden;
    $('barra-carrinho').hidden = !mostrar;
    $('barra-itens').textContent = t.itens + ' ' + (t.itens === 1 ? 'item' : 'itens') + ' no carrinho';
    $('barra-total').textContent = brl(t.subtotal);
  }

  function renderCarrinho() {
    var alvo = $('carrinho-conteudo');
    if (finalizado()) { alvo.innerHTML = htmlConfirmado(); return; }
    if (estado.tela === 'checkout') { alvo.innerHTML = htmlCheckout(); return; }
    var skus = Object.keys(estado.carrinho);
    if (!skus.length) {
      alvo.innerHTML = '<div class="carrinho"><h2 id="carrinho-titulo">Seu carrinho</h2><p class="vazio">Seu carrinho está vazio.<br>Escolha os produtos no catálogo.</p>' +
        '<button type="button" class="botao largo" data-fechar>Ver produtos</button></div>';
      return;
    }
    var t = totaisLocais();
    alvo.innerHTML = '<div class="carrinho"><h2 id="carrinho-titulo">Seu carrinho</h2>' +
      skus.map(function (sku) {
        var a = produtoDoSku(sku), p = a.produto, v = a.variacao, q = estado.carrinho[sku];
        var fonte = v || p;
        var m2 = p.unit_measurement === 'CX' && p.demo.m2PorUnidade ? ' · ' + num(q * p.demo.m2PorUnidade) + ' m²' : '';
        return '<div class="item"><img src="' + imagem(sku) + '" alt="">' +
          '<div class="item-info"><strong>' + esc(p.name) + '</strong>' +
          '<small>' + (v ? esc(v.variety_name) + ' · ' : '') + brl(preco(fonte.price, fonte.promotional_price)) + '/' + unidade(p.unit_measurement, 1) + m2 + '</small>' +
          '<div class="item-acoes"><div class="quantidade pequena">' +
          '<button type="button" data-item="' + esc(sku) + '" data-delta="-1" aria-label="Diminuir">−</button>' +
          '<input type="number" inputmode="numeric" min="0" value="' + q + '" data-item-qtd="' + esc(sku) + '" aria-label="Quantidade">' +
          '<button type="button" data-item="' + esc(sku) + '" data-delta="1" aria-label="Aumentar">+</button></div>' +
          '<span class="item-preco">' + brl(preco(fonte.price, fonte.promotional_price) * q) + '</span></div>' +
          '<button type="button" class="remover" data-remover="' + esc(sku) + '">Remover</button></div></div>';
      }).join('') +
      '<div class="totais"><div><span>Subtotal (' + t.itens + ' ' + (t.itens === 1 ? 'item' : 'itens') + ')</span><span>' + brl(t.subtotal) + '</span></div>' +
      '<div><span>Entrega</span><span class="dica">calculada no próximo passo</span></div>' +
      '<div class="total"><span>Total</span><span>' + brl(t.subtotal) + '</span></div></div>' +
      '<button type="button" class="botao primario largo" id="ir-checkout">Continuar</button>' +
      '<p class="dica" style="text-align:center">Nada é cobrado agora. Um atendente confirma o pedido com você.</p></div>';
  }

  // ── Finalização ────────────────────────────────────────────────────────
  var rascunho = {};

  function htmlCheckout() {
    var c = estado.checkout, s = estado.sessao || { cliente: {} };
    var t = totaisLocais();
    var html = '<div class="carrinho"><button type="button" class="botao-texto voltar" id="voltar-carrinho">‹ Voltar ao carrinho</button>' +
      '<h2 id="carrinho-titulo">Como você prefere receber?</h2>' +
      '<div class="opcoes">' +
      '<button type="button" class="opcao' + (c.tipo === 'entrega' ? ' ativa' : '') + '" data-tipo="entrega"><strong>Entrega</strong><small>Levamos até você</small></button>' +
      '<button type="button" class="opcao' + (c.tipo === 'retirada' ? ' ativa' : '') + '" data-tipo="retirada"><strong>Retirada</strong><small>Em uma das lojas</small></button></div>';

    if (c.tipo === 'entrega') {
      var r = rascunho;
      var campo = function (id, rotulo, valor, extra) {
        return '<label class="campo" for="f-' + id + '">' + rotulo + '</label><input class="entrada" id="f-' + id + '" value="' + esc(valor) + '" ' + (extra || '') + '>';
      };
      html += '<form id="form-entrega" novalidate>' +
        campo('nome', 'Nome completo', r.nome != null ? r.nome : s.cliente.nome, 'autocomplete="name" required') +
        campo('telefone', 'Telefone / WhatsApp', r.telefone != null ? r.telefone : telefone(s.cliente.telefone), 'type="tel" autocomplete="tel" required') +
        '<div class="linha"><div>' + campo('cep', 'CEP', r.cep || '', 'inputmode="numeric" autocomplete="postal-code" maxlength="9" required') + '</div>' +
        '<div class="estreito">' + campo('estado', 'UF', r.estado || '', 'maxlength="2" autocomplete="address-level1" required') + '</div></div>' +
        campo('cidade', 'Cidade', r.cidade || '', 'autocomplete="address-level2" required') +
        campo('bairro', 'Bairro', r.bairro || '', 'required') +
        '<div class="linha"><div>' + campo('rua', 'Rua', r.rua || '', 'autocomplete="address-line1" required') + '</div>' +
        '<div class="estreito">' + campo('numero', 'Número', r.numero || '', 'inputmode="numeric" required') + '</div></div>' +
        campo('complemento', 'Complemento (opcional)', r.complemento || '', 'autocomplete="address-line2"') +
        campo('referencia', 'Ponto de referência (opcional)', r.referencia || '') +
        '</form>';
    } else if (c.tipo === 'retirada') {
      html += estado.lojas.map(function (l) {
        return '<button type="button" class="loja' + (c.lojaId === l.id ? ' ativa' : '') + '" data-loja="' + l.id + '">' +
          '<strong>' + esc(l.nome) + '</strong><small>' + esc(l.endereco) + '</small><small>' + esc(l.horario) + '</small>' +
          (c.lojaId === l.id ? '<small style="margin-top:6px">' + esc(l.orientacoes) + '</small>' : '') + '</button>';
      }).join('');
    }

    if (c.tipo) {
      var frete = c.tipo === 'entrega' ? (estado.frete ? estado.frete.valor : null) : 0;
      var total = t.subtotal + (frete || 0);
      html += '<label class="campo" for="f-observacoes">Observações (opcional)</label>' +
        '<textarea class="entrada" id="f-observacoes" maxlength="500" placeholder="Ex.: preciso para sábado, tem escada…">' + esc(rascunho.observacoes || '') + '</textarea>' +
        '<div class="totais"><div><span>Produtos</span><span>' + brl(t.subtotal) + '</span></div>' +
        (c.tipo === 'entrega' ? '<div><span>' + (estado.frete ? esc(estado.frete.titulo) : 'Entrega') + '</span><span>' + (frete == null ? '…' : frete ? brl(frete) : 'Grátis') + '</span></div>' +
          (estado.frete ? '<div class="dica"><span>' + esc(estado.frete.prazo) + (estado.frete.valor ? ' · grátis acima de ' + brl(estado.frete.gratisAcimaDe) : '') + '</span></div>' : '') : '<div><span>Retirada na loja</span><span>Grátis</span></div>') +
        '<div class="total"><span>Total</span><span>' + brl(total) + '</span></div></div>' +
        '<div id="erro-checkout"></div>' +
        '<button type="button" class="botao primario largo" id="enviar-pedido">Enviar pedido para o atendente</button>' +
        '<p class="dica" style="text-align:center">O pagamento é combinado com o atendente pelo WhatsApp.</p>';
    }
    return html + '</div>';
  }

  function guardarRascunho() {
    ['nome', 'telefone', 'cep', 'estado', 'cidade', 'bairro', 'rua', 'numero', 'complemento', 'referencia', 'observacoes'].forEach(function (k) {
      var el = $('f-' + k);
      if (el) rascunho[k] = el.value;
    });
  }

  function carregarFrete() {
    api('/api/catalogo/frete?subtotal=' + totaisLocais().subtotal).then(function (r) {
      estado.frete = r.data;
      if (estado.tela === 'checkout') { guardarRascunho(); renderCarrinho(); }
    });
  }

  function buscarCep(cep) {
    fetch('https://viacep.com.br/ws/' + cep + '/json/').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.erro) return;
      [['rua', d.logradouro], ['bairro', d.bairro], ['cidade', d.localidade], ['estado', d.uf]].forEach(function (par) {
        var el = $('f-' + par[0]);
        if (el && par[1] && !el.value) { el.value = par[1]; rascunho[par[0]] = par[1]; }
      });
      var numero = $('f-numero');
      if (numero && !numero.value) numero.focus();
    }).catch(function () { /* preenchimento manual */ });
  }

  function enviarPedido() {
    guardarRascunho();
    var c = estado.checkout;
    var corpo = { tipo: c.tipo, observacoes: rascunho.observacoes || '' };
    if (c.tipo === 'entrega') {
      corpo.entrega = {};
      ['nome', 'telefone', 'cep', 'estado', 'cidade', 'bairro', 'rua', 'numero', 'complemento', 'referencia'].forEach(function (k) { corpo.entrega[k] = rascunho[k] || ''; });
    } else {
      if (!c.lojaId) { mostrarErroCheckout('Escolha a loja para retirada.'); return; }
      corpo.lojaId = c.lojaId;
    }
    var botao = $('enviar-pedido');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    clearTimeout(sincronizarTimer);
    // Garante que o servidor tem o carrinho mais recente antes de finalizar.
    var itens = Object.keys(estado.carrinho).map(function (sku) { return { sku: sku, quantidade: estado.carrinho[sku] }; });
    api('/api/loja/' + encodeURIComponent(token) + '/carrinho', { method: 'PUT', body: { itens: itens } }).then(function () {
      return api('/api/loja/' + encodeURIComponent(token) + '/finalizar', { method: 'POST', body: corpo });
    }).then(function (sessao) {
      aplicarSessao(sessao);
      window.scrollTo(0, 0);
    }).catch(function (e) {
      mostrarErroCheckout(e.mensagem);
      botao.disabled = false;
      botao.textContent = 'Enviar pedido para o atendente';
    });
  }

  function mostrarErroCheckout(texto) {
    var alvo = $('erro-checkout');
    if (alvo) alvo.innerHTML = '<div class="erro-form">' + esc(texto) + '</div>';
  }

  function htmlConfirmado() {
    var s = estado.sessao, c = s.checkout || {};
    var destino = c.tipo === 'entrega' && c.entrega
      ? c.entrega.rua + ', ' + c.entrega.numero + ' — ' + c.entrega.bairro + ', ' + c.entrega.cidade + '/' + c.entrega.estado
      : c.loja ? c.loja.nome + ' — ' + c.loja.endereco : '';
    return '<div class="carrinho confirmado"><div class="selo-ok">✓</div>' +
      '<h2 id="carrinho-titulo">Pedido enviado!</h2>' +
      '<p>Recebemos seu pedido. Um atendente vai conferir estoque, prazo e pagamento e confirmar tudo com você no WhatsApp.</p>' +
      '<div class="resumo-lista">' +
      s.itens.map(function (i) { return '<div><span>' + i.quantidade + '× ' + esc(i.nome) + (i.variacao ? ' (' + esc(i.variacao) + ')' : '') + '</span><span>' + brl(i.subtotal) + '</span></div>'; }).join('') +
      (c.tipo === 'entrega' ? '<div><span>Entrega</span><span>' + (s.totais.frete ? brl(s.totais.frete) : 'Grátis') + '</span></div>' : '') +
      '<div><span><strong>Total</strong></span><span><strong>' + brl(s.totais.total) + '</strong></span></div>' +
      '<div><span>' + (c.tipo === 'entrega' ? 'Entregar em' : 'Retirar em') + '</span><span style="text-align:right">' + esc(destino) + '</span></div>' +
      '</div><p style="margin-top:16px">Você já pode voltar para a conversa no WhatsApp.</p></div>';
  }

  // ── Painéis ────────────────────────────────────────────────────────────
  function abrirPainel(id) {
    $(id).hidden = false;
    document.body.style.overflow = 'hidden';
    renderBarra();
  }
  function fecharPainel(id) {
    $(id).hidden = true;
    if ($('painel-produto').hidden && $('painel-carrinho').hidden) document.body.style.overflow = '';
    if (id === 'painel-produto') detalhe = null;
    renderBarra();
  }
  function abrirCarrinho() {
    if (!finalizado()) estado.tela = 'carrinho';
    renderCarrinho();
    abrirPainel('painel-carrinho');
  }

  function renderTudo() {
    renderGrade();
    renderBarra();
    // Na finalização o formulário não é redesenhado a cada mudança (perderia o que foi digitado), exceto quando o pedido foi enviado.
    if (!$('painel-carrinho').hidden && (estado.tela !== 'checkout' || finalizado())) renderCarrinho();
    if (finalizado()) {
      $('saudacao').textContent = 'Pedido enviado ao atendente';
      if ($('painel-carrinho').hidden && !detalhe) abrirCarrinho();
    }
  }

  // ── Eventos ────────────────────────────────────────────────────────────
  document.addEventListener('click', function (ev) {
    var alvo = ev.target.closest('button, [data-fechar]');
    if (!alvo) return;
    var d = alvo.dataset;

    if (d.fechar !== undefined) { fecharPainel(alvo.closest('.painel').id); return; }
    if (d.cat !== undefined) { estado.categoria = Number(d.cat); renderCategorias(); renderGrade(); return; }
    if (alvo.classList.contains('produto')) { abrirProduto(d.sku); return; }
    if (d.variacao) {
      detalhe.variacao = detalhe.produto.children.filter(function (c) { return c.sku === d.variacao; })[0];
      renderProduto();
      return;
    }
    if (d.qtd) { atualizarQuantidadeDetalhe(detalhe.quantidade + Number(d.qtd)); return; }
    if (alvo.id === 'adicionar') {
      var sku = skuDetalhe();
      var p = detalhe.produto;
      alterarCarrinho(sku, (estado.carrinho[sku] || 0) + detalhe.quantidade,
        detalhe.quantidade + ' ' + unidade(p.unit_measurement, detalhe.quantidade) + ' adicionad' + (/^(caixa|unidade)/.test(unidade(p.unit_measurement, 1)) ? 'a' : 'o') + (detalhe.quantidade > 1 ? 's' : '') + ' ao carrinho');
      renderProduto();
      return;
    }
    if (d.sugestao !== undefined) {
      var s = sugestoes[Number(d.sugestao)];
      var skuS = s.variacao ? s.variacao.sku : s.produto.sku;
      var q = quantidadeSugerida(s.produto);
      alterarCarrinho(skuS, (estado.carrinho[skuS] || 0) + q, q + ' ' + unidade(s.produto.unit_measurement, q) + ' de ' + s.produto.name + ' no carrinho');
      return;
    }
    if (alvo.id === 'abrir-carrinho' || alvo.id === 'barra-ver') { abrirCarrinho(); return; }
    if (d.item) { alterarCarrinho(d.item, (estado.carrinho[d.item] || 0) + Number(d.delta)); return; }
    if (d.remover) { alterarCarrinho(d.remover, 0, 'Item removido'); return; }
    if (alvo.id === 'ir-checkout') { estado.tela = 'checkout'; carregarFrete(); renderCarrinho(); return; }
    if (alvo.id === 'voltar-carrinho') { guardarRascunho(); estado.tela = 'carrinho'; renderCarrinho(); return; }
    if (d.tipo) { guardarRascunho(); estado.checkout.tipo = d.tipo; renderCarrinho(); return; }
    if (d.loja) { guardarRascunho(); estado.checkout.lojaId = Number(d.loja); renderCarrinho(); return; }
    if (alvo.id === 'enviar-pedido') { enviarPedido(); }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.id === 'qtd-produto') atualizarQuantidadeDetalhe(Number(el.value));
    else if (el.id === 'calc-perda') calcularCaixas();
    else if (el.dataset.itemQtd) alterarCarrinho(el.dataset.itemQtd, Math.max(0, Math.floor(Number(el.value)) || 0));
    else if (el.dataset.sugestaoVariacao !== undefined) {
      var s = sugestoes[Number(el.dataset.sugestaoVariacao)];
      s.variacao = s.produto.children.filter(function (c) { return c.sku === el.value; })[0];
      renderCompreJunto();
    }
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.id === 'calc-m2') calcularCaixas();
    if (el.id === 'f-cep') {
      var digitos = el.value.replace(/\D/g, '').slice(0, 8);
      el.value = digitos.length > 5 ? digitos.slice(0, 5) + '-' + digitos.slice(5) : digitos;
      if (digitos.length === 8) buscarCep(digitos);
    }
  });

  // Ao voltar para a página (ex.: o cliente foi ao WhatsApp e voltou, ou abriu o link em outro aparelho),
  // recarrega o carrinho do servidor para não sobrescrever o que mudou em outro lugar.
  document.addEventListener('visibilitychange', function () {
    if (!estado.sessao || finalizado()) return;
    if (document.hidden) {
      // Saindo da página com alteração ainda não enviada: envia já, antes que o navegador congele a aba.
      if (sincronizacaoPendente) { clearTimeout(sincronizarTimer); sincronizar(); }
      return;
    }
    if (sincronizacaoPendente) return;
    var versao = ++estado.versao;
    api('/api/loja/' + encodeURIComponent(token)).then(function (sessao) {
      if (versao !== estado.versao) return;
      aplicarSessao(sessao);
    }).catch(function () { /* mantém o que está na tela */ });
  });

  $('busca').addEventListener('input', function () { estado.busca = this.value; renderGrade(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!$('painel-produto').hidden) fecharPainel('painel-produto');
    else if (!$('painel-carrinho').hidden) fecharPainel('painel-carrinho');
  });

  // ── Início ─────────────────────────────────────────────────────────────
  function mostrarErroLink(texto) {
    var tpl = $('tpl-erro-link').content.cloneNode(true);
    tpl.getElementById('erro-link-texto').textContent = texto;
    var main = $('vitrine');
    main.innerHTML = '';
    main.appendChild(tpl);
    document.querySelector('.busca').hidden = true;
    $('categorias').hidden = true;
    $('abrir-carrinho').hidden = true;
  }

  if (!token) { mostrarErroLink('Este endereço está incompleto. Use o link enviado no WhatsApp.'); return; }
  $('grade').innerHTML = '<p class="carregando">Carregando produtos…</p>';

  Promise.all([
    api('/api/loja/' + encodeURIComponent(token)),
    api('/api/catalogo/categorias'),
    api('/api/catalogo/produtos'),
    api('/api/catalogo/lojas')
  ]).then(function (r) {
    estado.categorias = r[1].data;
    estado.produtos = r[2].data;
    estado.lojas = r[3].data;
    var primeiroNome = String(r[0].cliente.nome || '').trim().split(/\s+/)[0];
    $('saudacao').textContent = primeiroNome ? 'Olá, ' + primeiroNome + '! Catálogo exclusivo' : 'Catálogo exclusivo';
    renderCategorias();
    aplicarSessao(r[0]);
  }).catch(function (e) {
    mostrarErroLink(e && e.status === 404 ? e.mensagem : 'Não conseguimos carregar o catálogo. Verifique sua conexão e tente de novo.');
  });
})();
