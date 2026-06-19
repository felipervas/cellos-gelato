/* ============================================================
   Módulo: PDV / CAIXA
   - Catálogo de produtos base (sem escolher sabor) + status de disponibilidade
   - Carrinho com quantidade e adicionais/coberturas por linha
   - Cliente do Clube: identifica por telefone/nome, mostra pontos/nível, resgata cashback
   - Calculadora de dinheiro (troco) + vendas de hoje por número de pedido
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  var carrinho = [];
  var formaPagamento = "Pix";
  var valorRecebido = null;
  var clienteAtual = null;
  var usarCashback = false;

  function root() { return document.getElementById("content"); }

  function precoLinha(l) {
    var add = (l.adicionais || []).reduce(function (s, id) { var c = C.find("coberturas", id); return s + (c ? c.preco : 0); }, 0);
    return Math.round((l.precoUnit + add) * 100) / 100;
  }
  function chaveLinha(produtoId, adicionais) { return produtoId + "|" + (adicionais || []).slice().sort().join(","); }

  // ---- adicionar produto ----
  function addLinha(produto) {
    var chave = chaveLinha(produto.id, []);
    var existente = carrinho.find(function (l) { return l.chave === chave; });
    if (existente) { existente.qtd += 1; }
    else { carrinho.push({ chave: chave, produtoId: produto.id, nome: produto.nome, precoUnit: produto.precoVenda, qtd: 1, adicionais: [], adicionaisNomes: [] }); }
    desenhaCarrinho();
  }
  function clicaProduto(produto) {
    if ((produto.disponibilidade || "disponivel") === "esgotado") { ui.toast("Produto esgotado.", "warn"); return; }
    addLinha(produto);
  }

  // ---- adicionais / coberturas por linha ----
  function editarAdicionais(linha) {
    var cobs = C.table("coberturas");
    var sel = (linha.adicionais || []).slice();
    var box = h("div", { class: "stack", style: { gap: "8px" } });
    cobs.forEach(function (c) {
      var chk = h("input", { type: "checkbox" }); chk.checked = sel.indexOf(c.id) >= 0; chk.style.marginRight = "8px";
      chk.addEventListener("change", function () { if (chk.checked) { if (sel.indexOf(c.id) < 0) sel.push(c.id); } else { sel = sel.filter(function (x) { return x !== c.id; }); } });
      box.appendChild(h("label", { class: "flex between items-center", style: { padding: "9px 11px", border: "1px solid var(--line)", borderRadius: "9px", cursor: "pointer" } },
        h("span", { class: "flex items-center" }, chk, c.nome),
        h("span", { class: "cell-strong", text: "+ " + fmt.money(c.preco) })));
    });
    var ok = ui.button("Aplicar", { variant: "primary" });
    var m = ui.modal({ title: "Adicionais — " + linha.nome, body: box, actions: [ok], size: "sm" });
    ok.addEventListener("click", function () {
      linha.adicionais = sel;
      linha.adicionaisNomes = sel.map(function (id) { var c = C.find("coberturas", id); return c ? c.nome : null; }).filter(Boolean);
      linha.chave = chaveLinha(linha.produtoId, sel);
      m.close(); desenhaCarrinho();
    });
  }

  // ---- cliente / clube ----
  function blocoCliente(head) {
    var wrap = h("div", { class: "cart-cliente-wrap" }, h("label", { class: "small muted", text: "Cliente (Clube Cellos)" }));
    var box = h("div", {});
    if (clienteAtual) {
      var fechar = ui.iconButton("close", function () { clienteAtual = null; usarCashback = false; desenhaCarrinho(); }, "Remover cliente");
      var chip = h("div", { class: "cli-chip" },
        h("div", {}, h("b", { text: clienteAtual.nome }), " ", ui.badge(clienteAtual.nivel, "accent")),
        h("div", { class: "small muted", text: fmt.int(clienteAtual.pontos) + " pts · cashback " + fmt.money(clienteAtual.cashback) }),
        fechar
      );
      if (clienteAtual.cashback > 0) {
        var cashChk = h("input", { type: "checkbox" }); cashChk.checked = usarCashback; cashChk.style.marginRight = "6px";
        cashChk.addEventListener("change", function () { usarCashback = cashChk.checked; desenhaCarrinho(); });
        chip.appendChild(h("label", { class: "flex items-center small", style: { marginTop: "6px", cursor: "pointer" } }, cashChk, "Usar cashback (" + fmt.money(clienteAtual.cashback) + ")"));
      }
      box.appendChild(chip);
    } else {
      var inp = h("input", { type: "text", placeholder: "Telefone ou nome", style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit", fontSize: ".86rem" } });
      var btn = ui.button("Buscar", { variant: "ghost" }); btn.classList.add("btn-sm");
      function buscar() {
        var q = inp.value.trim(); if (!q) return;
        var digits = q.replace(/\D/g, "");
        var cli = C.table("clientes").find(function (c) {
          var cd = (c.telefone || "").replace(/\D/g, "");
          return (digits.length >= 4 && cd.indexOf(digits) >= 0) || c.nome.toLowerCase().indexOf(q.toLowerCase()) >= 0;
        });
        if (cli) { clienteAtual = cli; desenhaCarrinho(); }
        else {
          ui.confirm("Cliente não encontrado. Cadastrar \"" + q + "\" no Clube?", { title: "Novo cliente", okLabel: "Cadastrar" }).then(function (okc) {
            if (okc) {
              clienteAtual = C.insert("clientes", { nome: q, telefone: q, pontos: 0, cashback: 0, nivel: "Bronze", visitas: 0, totalGasto: 0, primeiraCompra: C.todayISO(), ultimaCompra: C.todayISO(), aniversario: "", codigo: "", indicadoPor: null });
              ui.toast("Cliente cadastrado.", "ok"); desenhaCarrinho();
            }
          });
        }
      }
      btn.addEventListener("click", buscar);
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); buscar(); } });
      box.appendChild(h("div", { class: "flex", style: { gap: "6px" } }, h("div", { style: { flex: "1" } }, inp), btn));
    }
    wrap.appendChild(box);
    head.appendChild(wrap);
  }

  // ---- carrinho ----
  var cartHost = null;
  function desenhaCarrinho() {
    if (!cartHost) return;
    ui.clear(cartHost);
    var operadores = C.get().config.operadores;
    var atual = C.currentUser();
    var head = h("div", { class: "cart-head" }, h("h3", { text: "Pedido atual" }));
    var operSel = h("select", { style: { width: "100%", marginTop: "8px", padding: "8px 10px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit" } });
    operadores.forEach(function (o) { var opt = h("option", { value: o, text: o }); if (atual && atual.nome === o) opt.selected = true; operSel.appendChild(opt); });
    head.appendChild(h("label", { class: "small muted", text: "Operador" }));
    head.appendChild(operSel);
    blocoCliente(head);
    cartHost.appendChild(head);

    var linesEl = h("div", { class: "cart-lines" });
    if (!carrinho.length) {
      linesEl.appendChild(h("div", { class: "cart-empty", text: "Nenhum item. Toque nos produtos ao lado." }));
    } else {
      carrinho.forEach(function (l) {
        var add = h("span", { class: "cl-add", html: C.icon("plus", 12) + "adicional" });
        add.addEventListener("click", function () { editarAdicionais(l); });
        var info = h("div", { class: "cl-info" },
          h("div", { class: "cl-name", text: l.nome }),
          l.adicionaisNomes && l.adicionaisNomes.length ? h("div", { class: "cl-adic", text: "+ " + l.adicionaisNomes.join(", ") }) : null,
          h("div", { class: "cl-price", text: fmt.money(precoLinha(l)) + " un." }),
          add
        );
        var menos = h("button", { type: "button", text: "−", title: "Menos" });
        var mais = h("button", { type: "button", text: "+", title: "Mais" });
        menos.addEventListener("click", function () { l.qtd -= 1; if (l.qtd <= 0) { var i = carrinho.indexOf(l); if (i >= 0) carrinho.splice(i, 1); } desenhaCarrinho(); });
        mais.addEventListener("click", function () { l.qtd += 1; desenhaCarrinho(); });
        var right = h("div", { class: "cl-right" },
          h("div", { class: "qty-ctl" }, menos, h("span", { text: l.qtd }), mais),
          h("div", { class: "cl-price cell-strong", text: fmt.money(precoLinha(l) * l.qtd) })
        );
        linesEl.appendChild(h("div", { class: "cart-line" }, info, right));
      });
    }
    cartHost.appendChild(linesEl);

    var totalBruto = carrinho.reduce(function (s, l) { return s + precoLinha(l) * l.qtd; }, 0);
    totalBruto = Math.round(totalBruto * 100) / 100;
    var descCashback = (clienteAtual && usarCashback) ? Math.min(clienteAtual.cashback || 0, totalBruto) : 0;
    descCashback = Math.round(descCashback * 100) / 100;
    var total = Math.round((totalBruto - descCashback) * 100) / 100;

    var foot = h("div", { class: "cart-foot" });
    if (descCashback > 0) {
      foot.appendChild(h("div", { class: "flex between small muted", style: { marginBottom: "4px" } }, h("span", { text: "Subtotal" }), h("span", { text: fmt.money(totalBruto) })));
      foot.appendChild(h("div", { class: "flex between small", style: { marginBottom: "4px", color: "var(--accent)" } }, h("span", { text: "Cashback do Clube" }), h("span", { text: "− " + fmt.money(descCashback) })));
    }
    foot.appendChild(h("div", { class: "cart-total" },
      h("span", { class: "ct-lbl", text: "Total (" + carrinho.reduce(function (s, l) { return s + l.qtd; }, 0) + " itens)" }),
      h("span", { class: "ct-val", text: fmt.money(total) })));

    var chips = h("div", { class: "pay-chips" });
    ["Pix", "Crédito", "Débito", "Dinheiro"].forEach(function (fp) {
      var c = h("div", { class: "pc" + (formaPagamento === fp ? " active" : ""), text: fp });
      c.addEventListener("click", function () { formaPagamento = fp; if (fp !== "Dinheiro") valorRecebido = null; desenhaCarrinho(); });
      chips.appendChild(c);
    });
    foot.appendChild(chips);

    var podeFinalizar = carrinho.length > 0;
    if (formaPagamento === "Dinheiro") {
      var calc = h("div", { class: "cash-calc" });
      var inp = h("input", { type: "number", step: "0.01", min: "0", value: valorRecebido != null ? valorRecebido : "", placeholder: "0,00" });
      var trocoLine = h("div", { class: "troco-line" });
      var recalcTroco = function () {
        var rec = inp.value === "" ? null : Number(inp.value);
        valorRecebido = rec;
        ui.clear(trocoLine);
        var troco = rec != null ? Math.round((rec - total) * 100) / 100 : null;
        trocoLine.className = "troco-line " + (troco == null ? "" : (troco < 0 ? "neg" : "ok"));
        if (troco == null) { trocoLine.appendChild(h("span", { text: "Troco" })); trocoLine.appendChild(h("span", { text: "—" })); }
        else if (troco < 0) { trocoLine.appendChild(h("span", { text: "Falta" })); trocoLine.appendChild(h("span", { text: fmt.money(-troco) })); }
        else { trocoLine.appendChild(h("span", { text: "Troco" })); trocoLine.appendChild(h("span", { text: fmt.money(troco) })); }
      };
      inp.addEventListener("input", recalcTroco);
      calc.appendChild(h("div", { class: "cc-row" }, h("span", { text: "Total a pagar" }), h("strong", { text: fmt.money(total) })));
      calc.appendChild(h("div", { class: "cc-row" }, h("span", { text: "Valor recebido" }), inp));
      var quick = h("div", { class: "cash-quick" });
      var valores = [total, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, 100];
      valores.filter(function (v, i, a) { return v >= total && a.indexOf(v) === i; }).slice(0, 4).forEach(function (v) {
        var b = h("button", { type: "button", text: v === total ? "Exato" : fmt.money(v) });
        b.addEventListener("click", function () { inp.value = v; recalcTroco(); });
        quick.appendChild(b);
      });
      calc.appendChild(quick);
      calc.appendChild(trocoLine);
      foot.appendChild(calc);
      recalcTroco();
      if (valorRecebido == null || valorRecebido < total) podeFinalizar = false;
    }

    var btn = ui.button("Finalizar venda", { variant: "primary", icon: "check" });
    btn.style.width = "100%"; btn.style.justifyContent = "center"; btn.style.padding = "12px";
    if (!podeFinalizar) { btn.disabled = true; btn.style.opacity = "0.5"; btn.style.cursor = "not-allowed"; }
    btn.addEventListener("click", function () {
      if (!carrinho.length) return;
      var venda = C.registrarVenda({
        operador: operSel.value, formaPagamento: formaPagamento, valorRecebido: valorRecebido,
        clienteId: clienteAtual ? clienteAtual.id : null,
        resgate: (clienteAtual && usarCashback) ? { cashback: clienteAtual.cashback } : null,
        itens: carrinho.map(function (l) { return { produtoId: l.produtoId, qtd: l.qtd, adicionais: l.adicionais }; })
      });
      if (venda) {
        carrinho = []; valorRecebido = null; clienteAtual = null; usarCashback = false;
        confirmacao(venda);
        render(root());
      }
    });
    foot.appendChild(btn);
    cartHost.appendChild(foot);
  }

  function confirmacao(venda) {
    var extra = "";
    if (venda.clienteId && venda.pontosGanhos) extra = " · +" + venda.pontosGanhos + " pts no Clube";
    if (venda.formaPagamento === "Dinheiro" && venda.troco != null) {
      var body = h("div", {},
        h("div", { style: { textAlign: "center", padding: "8px 0 16px" } },
          h("div", { class: "small muted", text: "Troco a devolver" }),
          h("div", { style: { fontSize: "2.4rem", fontWeight: "700", fontFamily: "var(--serif)", color: "var(--accent)" }, text: fmt.money(venda.troco) })
        ),
        h("div", { class: "small muted", style: { textAlign: "center" }, text: "Pedido #" + venda.numero + " · Recebido " + fmt.money(venda.valorRecebido) + " · Total " + fmt.money(venda.total) + extra })
      );
      var ok = ui.button("Concluir", { variant: "primary" });
      var m = ui.modal({ title: "Venda registrada", body: body, actions: [ok], size: "sm" });
      ok.addEventListener("click", function () { m.close(); });
    } else {
      ui.toast("Pedido #" + venda.numero + " registrado · " + fmt.money(venda.total) + extra, "ok");
    }
  }

  // ---- render principal ----
  function render(rootEl) {
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader("PDV / Caixa", "Lance o pedido e finalize a venda.", []));

    var layout = h("div", { class: "pdv-layout" });
    var cat = h("div", {});
    var produtos = C.table("produtos");
    var categorias = produtos.map(function (p) { return p.categoria; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    categorias.forEach(function (categoria) {
      var grupo = h("div", { class: "pdv-cat" }, h("h4", { text: categoria }));
      var grid = h("div", { class: "prod-grid" });
      produtos.filter(function (p) { return p.categoria === categoria; }).forEach(function (p) {
        var disp = p.disponibilidade || "disponivel";
        var btn = h("button", { class: "prod-btn" + (disp === "esgotado" ? " prod-esgotado" : ""), type: "button" },
          h("span", { class: "pn", text: p.nome }),
          h("span", { class: "pp", text: fmt.money(p.precoVenda) }),
          disp === "acabando" ? h("span", { class: "pstatus acabando", text: "acabando" })
            : disp === "esgotado" ? h("span", { class: "pstatus esgotado", text: "esgotado" })
              : ((p.tipo === "montavel" && p.bolas) ? h("span", { class: "pmeta", text: p.bolas + (p.bolas > 1 ? " bolas" : " bola") }) : null)
        );
        btn.addEventListener("click", function () { clicaProduto(p); });
        grid.appendChild(btn);
      });
      grupo.appendChild(grid);
      cat.appendChild(grupo);
    });
    layout.appendChild(cat);

    cartHost = h("div", { class: "cart" });
    layout.appendChild(cartHost);
    rootEl.appendChild(layout);
    desenhaCarrinho();

    rootEl.appendChild(vendasDeHoje());
  }

  function vendasDeHoje() {
    var hoje = C.todayISO();
    var vendas = C.table("vendas").filter(function (v) { return v.datetime.slice(0, 10) === hoje; })
      .sort(function (a, b) { return b.numero - a.numero; });
    var totalDia = vendas.reduce(function (s, v) { return s + v.total; }, 0);
    var caixa = C.analytics.caixaDinheiroHoje();

    var cols = [
      { key: "numero", label: "Pedido", render: function (v) { return h("span", { class: "cell-strong", text: "#" + v.numero }); } },
      { key: "hora", label: "Hora", render: function (v) { return fmt.time(v.datetime); } },
      { key: "operador", label: "Operador" },
      { key: "cliente", label: "Cliente", render: function (v) { if (!v.clienteId) return '<span class="cell-muted">—</span>'; var c = C.find("clientes", v.clienteId); return c ? c.nome : "—"; } },
      { key: "itens", label: "Itens", render: function (v) { return v.itens.reduce(function (s, l) { return s + l.qtd; }, 0) + " un."; } },
      { key: "formaPagamento", label: "Pagamento", render: function (v) { return ui.badge(v.formaPagamento, v.formaPagamento === "Dinheiro" ? "warn" : "neutral"); } },
      { key: "troco", label: "Troco", align: "right", render: function (v) { return v.troco != null ? '<span class="text-warn">' + fmt.money(v.troco) + "</span>" : "—"; } },
      { key: "total", label: "Total", align: "right", render: function (v) { return h("span", { class: "cell-strong", text: fmt.money(v.total) }); } }
    ];

    var card = ui.card(null, h("div", {},
      h("div", { class: "flex between items-center", style: { padding: "16px 18px", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: "10px" } },
        h("h3", { class: "card-title", text: "Vendas de hoje" }),
        h("div", { class: "flex", style: { gap: "18px", flexWrap: "wrap" } },
          h("span", { class: "small muted" }, vendas.length + " pedidos · ", h("b", { class: "text-accent", text: fmt.money(totalDia) })),
          h("span", { class: "small muted" }, "Dinheiro: entrou ", h("b", { text: fmt.money(caixa.entrou) }), " · troco ", h("b", { text: fmt.money(caixa.troco) }))
        )
      ),
      ui.table(cols, vendas, { emptyMsg: "Nenhuma venda hoje ainda.", dense: true })
    ));
    card.style.marginTop = "18px";
    return card;
  }

  C.registerModule({ id: "pdv", label: "PDV / Caixa", icon: "pdv", order: 2, roles: ["gestor", "caixa"], render: render });
})();
