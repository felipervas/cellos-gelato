/* ============================================================
   Módulo: COMPRAS  (somente gestor) — ligado ao ESTOQUE
   - Alerta de reposição: estoque baixo aparece no menu (badge) e numa faixa.
   - Nova compra FÁCIL: cadastra fornecedor e item ali mesmo, custo já puxado,
     e botão "puxar itens em falta".
   - Receber -> entra AUTOMATICAMENTE no estoque (qtd + custo + validade).
   - Rastreio: quem comprou, de quem, quando, previsão, recebido, valor, status.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  function root() { return document.getElementById("content"); }
  function nomeFornecedor(id) { var f = C.find("fornecedores", id); return f ? f.nome : "(fornecedor removido)"; }
  function valorCompra(c) { return (c.itens || []).reduce(function (s, li) { return s + (Number(li.qtd) || 0) * (Number(li.custoUnit) || 0); }, 0); }
  function operadorOptions() { return (C.get().config.operadores || []).slice(); }
  function badgeStatus(st) { return st === "recebido" ? ui.badge("Recebido", "ok") : ui.badge("Pedido", "warn"); }
  function fieldWrap(label, el, full) { return h("div", { class: "form-field" + (full ? " full" : "") }, label ? h("label", { text: label }) : null, el); }
  function itemCategorias() { var cats = ["Embalagem", "Bebida", "Matéria-prima"]; C.table("itens").forEach(function (it) { if (it.categoria && cats.indexOf(it.categoria) < 0) cats.push(it.categoria); }); return cats; }

  /* ---------- cadastros rápidos inline ---------- */
  function novoFornecedorInline(cb) {
    ui.formModal({
      title: "Cadastrar fornecedor", size: "sm", fields: [
        { name: "nome", label: "Nome", type: "text", required: true, full: true, placeholder: "Ex.: Distribuidora Polo Sul" },
        { name: "contato", label: "Contato", type: "text", placeholder: "Telefone, e-mail..." },
        { name: "segmento", label: "Segmento", type: "text", placeholder: "Ex.: Embalagens, Bebidas" }
      ]
    }).then(function (v) { if (!v) return; var f = C.insert("fornecedores", { nome: v.nome, contato: v.contato || "", segmento: v.segmento || "" }); ui.toast("Fornecedor cadastrado.", "ok"); cb(f); });
  }
  function novoItemInline(cb) {
    var locais = C.table("locais").map(function (l) { return { value: l.id, label: l.nome }; });
    ui.formModal({
      title: "Cadastrar item de estoque", size: "md", values: { unidade: "un", qtdMin: 0, qtdMax: 0 },
      fields: [
        { name: "nome", label: "Nome do item", type: "text", required: true, full: true, placeholder: "Ex.: Casquinha tradicional" },
        { name: "categoria", label: "Categoria", type: "createSelect", options: itemCategorias(), required: true, novoPlaceholder: "Nova categoria" },
        { name: "unidade", label: "Unidade", type: "text", required: true, placeholder: "un, kg, L" },
        { name: "localId", label: "Localidade", type: "select", options: locais, required: true },
        { name: "qtdMin", label: "Estoque mínimo", type: "number", step: "0.001" },
        { name: "qtdMax", label: "Estoque máximo", type: "number", step: "0.001" },
        { name: "custoUnit", label: "Custo unitário", type: "money", prefix: "R$" }
      ]
    }).then(function (v) {
      if (!v) return;
      var it = C.insert("itens", { nome: v.nome, categoria: v.categoria, unidade: v.unidade, localId: v.localId, fornecedorId: null, qtd: 0, qtdMin: Number(v.qtdMin) || 0, qtdMax: Number(v.qtdMax) || 0, custoUnit: Number(v.custoUnit) || 0, validade: null });
      ui.toast("Item cadastrado no estoque.", "ok"); cb(it);
    });
  }

  /* ---------- Nova compra (modal custom, fácil) ---------- */
  function openCompraForm(prefill) {
    prefill = prefill || {};
    var ops = operadorOptions(), fin = C.podeVerFinanceiro();
    var st = {
      fornecedorId: prefill.fornecedorId || ((C.table("fornecedores")[0] || {}).id || ""),
      comprador: prefill.comprador || (ops[0] || ""),
      dataPrevista: prefill.dataPrevista || C.daysFromNow(3),
      obs: prefill.obs || "",
      linhas: C.clone(prefill.itens || [])
    };
    var body = h("div", {});

    // cabeçalho: fornecedor / comprador / previsão
    var fornSel = h("select", {});
    function fillForn() { ui.clear(fornSel); C.table("fornecedores").forEach(function (f) { var o = h("option", { value: f.id, text: f.nome }); if (f.id === st.fornecedorId) o.selected = true; fornSel.appendChild(o); }); fornSel.appendChild(h("option", { value: "__new__", text: "+ Cadastrar fornecedor" })); }
    fillForn();
    fornSel.addEventListener("change", function () { if (fornSel.value === "__new__") { fornSel.value = st.fornecedorId; novoFornecedorInline(function (f) { st.fornecedorId = f.id; fillForn(); }); } else st.fornecedorId = fornSel.value; });
    var compSel = h("select", {}); ops.forEach(function (o) { var op = h("option", { value: o, text: o }); if (o === st.comprador) op.selected = true; compSel.appendChild(op); }); compSel.addEventListener("change", function () { st.comprador = compSel.value; });
    var prevInp = h("input", { type: "date", value: st.dataPrevista }); prevInp.addEventListener("input", function () { st.dataPrevista = prevInp.value; });
    body.appendChild(h("div", { class: "form-grid" }, fieldWrap("Fornecedor", fornSel, true), fieldWrap("Comprador", compSel), fieldWrap("Previsão de entrega", prevInp)));

    // itens
    var selStyle = { padding: "8px 10px", border: "1px solid var(--line-strong)", borderRadius: "9px", fontFamily: "inherit", fontSize: ".88rem", background: "var(--surface)" };
    var itensList = h("div", { class: "stack", style: { gap: "8px" } });
    var totalEl = h("div", { class: "flex between items-center", style: { marginTop: "10px", padding: "10px 12px", background: "var(--surface-2)", borderRadius: "9px" } });
    function custoL(l) { return (Number(l.qtd) || 0) * (Number(l.custoUnit) || 0); }
    function atualizaTotal() { ui.clear(totalEl); totalEl.appendChild(h("span", { class: "small muted", text: st.linhas.length + " item(ns)" })); if (fin) totalEl.appendChild(h("b", { text: fmt.money(st.linhas.reduce(function (s, l) { return s + custoL(l); }, 0)) })); }
    function itemRow(l, idx) {
      var sel = h("select", { style: Object.assign({ flex: "1", minWidth: "0" }, selStyle) });
      function fillItens() { ui.clear(sel); sel.appendChild(h("option", { value: "", text: "— escolher item —" })); C.table("itens").forEach(function (it) { var o = h("option", { value: it.id, text: it.nome + " (" + it.unidade + ")" }); if (it.id === l.itemId) o.selected = true; sel.appendChild(o); }); sel.appendChild(h("option", { value: "__new__", text: "+ Cadastrar item novo" })); }
      fillItens();
      var qty = h("input", { type: "number", step: "0.01", min: "0", value: l.qtd != null ? l.qtd : 1, style: { width: "70px" }, title: "Quantidade" });
      var custo = h("input", { type: "number", step: "0.01", min: "0", value: l.custoUnit != null ? l.custoUnit : "", placeholder: "custo", style: { width: "86px" }, title: "Custo unitário" });
      sel.addEventListener("change", function () {
        if (sel.value === "__new__") { sel.value = l.itemId || ""; novoItemInline(function (it) { l.itemId = it.id; if (!l.custoUnit) l.custoUnit = it.custoUnit || 0; redraw(); }); return; }
        l.itemId = sel.value; var it = C.find("itens", sel.value);
        if (it && (!l.custoUnit || Number(l.custoUnit) === 0)) { l.custoUnit = it.custoUnit || 0; custo.value = l.custoUnit || ""; }
        atualizaTotal();
      });
      qty.addEventListener("input", function () { l.qtd = Number(qty.value) || 0; atualizaTotal(); });
      custo.addEventListener("input", function () { l.custoUnit = Number(custo.value) || 0; atualizaTotal(); });
      var del = ui.iconButton("trash", function () { st.linhas.splice(idx, 1); redraw(); }, "Remover");
      var children = [sel, h("div", { class: "input-prefix", style: { width: "92px" } }, h("span", { text: "x" }), qty)];
      if (fin) children.push(h("div", { class: "input-prefix", style: { width: "118px" } }, h("span", { text: "R$" }), custo));
      children.push(del);
      return h("div", { class: "flex items-center gap", style: { gap: "8px" } }, children);
    }
    function redraw() { ui.clear(itensList); if (!st.linhas.length) itensList.appendChild(h("p", { class: "small muted", text: "Nenhum item ainda. Adicione abaixo ou puxe os que estão em falta." })); st.linhas.forEach(function (l, i) { itensList.appendChild(itemRow(l, i)); }); atualizaTotal(); }
    redraw();
    var addItem = ui.button("Adicionar item", { variant: "ghost", icon: "plus" }); addItem.classList.add("btn-sm");
    addItem.addEventListener("click", function () { st.linhas.push({ itemId: "", qtd: 1, custoUnit: 0 }); redraw(); });
    var puxar = ui.button("Puxar itens em falta", { variant: "soft", icon: "alert" }); puxar.classList.add("btn-sm");
    puxar.addEventListener("click", function () {
      var sug = C.analytics.sugestaoReposicao();
      if (!sug.length) { ui.toast("Nada abaixo do mínimo no momento.", "ok"); return; }
      sug.forEach(function (s) { if (!st.linhas.some(function (l) { return l.itemId === s.item.id; })) st.linhas.push({ itemId: s.item.id, qtd: s.sugerido, custoUnit: s.custoUnit }); });
      redraw(); ui.toast(sug.length + " item(ns) em falta adicionado(s).", "ok");
    });

    body.appendChild(h("label", { class: "small muted", style: { marginTop: "16px", display: "block", fontWeight: "600" }, text: "Itens do pedido" }));
    body.appendChild(itensList);
    body.appendChild(h("div", { class: "flex gap mt-1", style: { gap: "8px" } }, addItem, puxar));
    body.appendChild(totalEl);
    var obsArea = h("textarea", { rows: 2, placeholder: "Ex.: reposição urgente, condição de pagamento...", style: { width: "100%", padding: "9px 11px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit", fontSize: ".88rem", marginTop: "14px" } });
    obsArea.value = st.obs; obsArea.addEventListener("input", function () { st.obs = obsArea.value; });
    body.appendChild(h("label", { class: "small muted", style: { marginTop: "14px", display: "block" }, text: "Observações" }));
    body.appendChild(obsArea);

    var salvar = ui.button("Salvar pedido", { variant: "primary", icon: "check" });
    var cancelar = ui.button("Cancelar", { variant: "ghost" });
    var m = ui.modal({ title: "Nova compra", body: body, actions: [cancelar, salvar], size: "lg", lock: true });
    cancelar.addEventListener("click", function () { m.close(); });
    salvar.addEventListener("click", function () {
      var itens = st.linhas.filter(function (l) { return l.itemId && Number(l.qtd) > 0; }).map(function (l) { var it = C.find("itens", l.itemId); return { itemId: l.itemId, nome: it ? it.nome : "", qtd: Number(l.qtd) || 0, custoUnit: Number(l.custoUnit) || 0 }; });
      if (!itens.length) { ui.toast("Adicione ao menos um item com quantidade.", "warn"); return; }
      if (!st.fornecedorId) { ui.toast("Escolha o fornecedor.", "warn"); return; }
      C.insert("compras", { fornecedorId: st.fornecedorId, comprador: st.comprador, data: C.todayISO(), dataPrevista: st.dataPrevista || null, dataRecebido: null, status: "pedido", itens: itens, obs: st.obs || "" });
      m.close(); ui.toast("Compra registrada como pedido.", "ok"); render(root());
    });
  }

  /* ---------- Receber compra (confere qtd + validade -> entra no estoque) ---------- */
  function receberCompraModal(c) {
    var linhas = (c.itens || []).map(function (li) { var it = C.find("itens", li.itemId); return { li: li, it: it, qtd: li.qtd, validade: (it && it.validade) || "" }; });
    var rows = h("div", { class: "stack", style: { gap: "8px" } });
    linhas.forEach(function (r) {
      var qtdInp = h("input", { type: "number", step: "0.01", min: "0", value: r.qtd, style: { width: "80px" } }); qtdInp.addEventListener("input", function () { r.qtd = Number(qtdInp.value) || 0; });
      var valInp = h("input", { type: "date", value: r.validade, style: { padding: "7px 9px", border: "1px solid var(--line-strong)", borderRadius: "8px", fontFamily: "inherit" } }); valInp.addEventListener("input", function () { r.validade = valInp.value; });
      rows.appendChild(h("div", { class: "flex items-center gap", style: { gap: "10px", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--line)" } },
        h("div", { style: { flex: "1", minWidth: "120px" } }, h("span", { class: "cell-strong", text: r.it ? r.it.nome : (r.li.nome || "item") }), r.it ? h("span", { class: "small muted", text: " (" + r.it.unidade + ")" }) : null),
        h("div", { class: "input-prefix", style: { width: "108px" } }, h("span", { text: "qtd" }), qtdInp),
        h("div", {}, h("div", { class: "small muted", text: "Validade do lote" }), valInp)
      ));
    });
    var body = h("div", {}, h("p", { class: "small muted mb-2", text: "Confira a quantidade recebida e a validade do lote. Ao confirmar, tudo entra AUTOMATICAMENTE no estoque." }), rows);
    var ok = ui.button("Confirmar recebimento", { variant: "primary", icon: "check" });
    var cancel = ui.button("Cancelar", { variant: "ghost" });
    var m = ui.modal({ title: "Receber · " + nomeFornecedor(c.fornecedorId), body: body, actions: [cancel, ok], size: "md" });
    cancel.addEventListener("click", function () { m.close(); });
    ok.addEventListener("click", function () {
      C.receberCompra(c.id, { responsavel: "Estoque", itens: linhas.map(function (r) { return { itemId: r.li.itemId, qtd: r.qtd, validade: r.validade || null }; }) });
      m.close();
      var resumo = linhas.slice(0, 3).map(function (r) { return "+" + fmt.num(r.qtd, 2) + " " + (r.it ? r.it.nome : ""); }).join(", ");
      ui.toast("Estoque atualizado: " + resumo + (linhas.length > 3 ? "…" : ""), "ok");
      render(root());
    });
  }

  /* ---------- Ver detalhes da compra ---------- */
  function verCompra(c) {
    var cols = [
      { key: "nome", label: "Item", render: function (li) { return h("span", { class: "cell-strong", text: li.nome || (C.find("itens", li.itemId) || {}).nome || "—" }); } },
      { key: "qtd", label: "Qtd", align: "right", render: function (li) { return fmt.num(li.qtd, 2); } }
    ];
    if (C.podeVerFinanceiro()) {
      cols.push({ key: "custoUnit", label: "Custo un.", align: "right", render: function (li) { return fmt.money(li.custoUnit); } });
      cols.push({ key: "subtotal", label: "Subtotal", align: "right", render: function (li) { return h("span", { class: "cell-strong", text: fmt.money((Number(li.qtd) || 0) * (Number(li.custoUnit) || 0)) }); } });
    }
    var info = h("div", { class: "stack", style: { gap: "6px", marginBottom: "14px" } },
      h("div", { class: "flex between wrap", style: { gap: "10px" } }, h("span", { class: "small muted" }, "Fornecedor: ", h("b", { class: "cell-strong", text: nomeFornecedor(c.fornecedorId) })), badgeStatus(c.status)),
      h("div", { class: "flex between wrap small muted", style: { gap: "10px" } }, h("span", {}, "Comprador: ", h("b", { text: c.comprador || "—" })), h("span", {}, "Pedido em: ", h("b", { text: fmt.date(c.data) }))),
      h("div", { class: "flex between wrap small muted", style: { gap: "10px" } }, h("span", {}, "Previsão: ", h("b", { text: fmt.date(c.dataPrevista) })), h("span", {}, "Recebido em: ", h("b", { text: c.dataRecebido ? fmt.date(c.dataRecebido) : "—" }))),
      c.obs ? h("p", { class: "small muted mt-1", text: "Obs.: " + c.obs }) : null
    );
    var body = h("div", {}, info, ui.table(cols, c.itens || [], { dense: true, emptyMsg: "Sem itens." }),
      C.podeVerFinanceiro() ? h("div", { class: "flex between items-center", style: { padding: "12px 2px 0", borderTop: "1px solid var(--line)", marginTop: "8px" } }, h("span", { class: "small muted", text: "Valor total do pedido" }), h("span", { class: "cell-strong", style: { fontSize: "1.15rem", fontFamily: "var(--serif)" }, text: fmt.money(valorCompra(c)) })) : null);
    var actions = [];
    if (c.status === "pedido") { var rec = ui.button("Receber", { variant: "primary", icon: "check" }); rec.addEventListener("click", function () { m.close(); receberCompraModal(c); }); actions.push(rec); }
    var fechar = ui.button("Fechar", { variant: "ghost" }); actions.push(fechar);
    var m = ui.modal({ title: "Compra · " + nomeFornecedor(c.fornecedorId), body: body, actions: actions, size: "md" });
    fechar.addEventListener("click", function () { m.close(); });
  }

  /* ---------- Fornecedores (lista + cadastro) ---------- */
  function openFornecedoresModal() {
    var listHost = h("div", {});
    function drawList() {
      ui.clear(listHost);
      listHost.appendChild(ui.table([
        { key: "nome", label: "Fornecedor", render: function (f) { return h("span", { class: "cell-strong", text: f.nome }); } },
        { key: "segmento", label: "Segmento", render: function (f) { return f.segmento ? ui.badge(f.segmento, "neutral") : '<span class="cell-muted">—</span>'; } },
        { key: "contato", label: "Contato", render: function (f) { return f.contato || '<span class="cell-muted">—</span>'; } }
      ], C.table("fornecedores"), { dense: true, emptyMsg: "Nenhum fornecedor cadastrado." }));
    }
    drawList();
    var add = ui.button("Adicionar fornecedor", { variant: "primary", icon: "plus" });
    add.addEventListener("click", function () { novoFornecedorInline(function () { drawList(); render(root()); }); });
    var fechar = ui.button("Fechar", { variant: "ghost" });
    var m = ui.modal({ title: "Fornecedores", body: listHost, actions: [add, fechar], size: "md" });
    fechar.addEventListener("click", function () { m.close(); });
  }

  /* ---------- KPIs ---------- */
  function renderKpis(host) {
    var compras = C.table("compras");
    var pendentes = compras.filter(function (c) { return c.status === "pedido"; });
    var kpis = [ui.kpi({ label: "Pedidos pendentes", value: fmt.int(pendentes.length), icon: "clock", accent: pendentes.length ? "warn" : "success", foot: pendentes.length ? "Aguardando recebimento" : "Tudo recebido" })];
    if (C.podeVerFinanceiro()) {
      var valorPendente = pendentes.reduce(function (s, c) { return s + valorCompra(c); }, 0);
      var limite = C.daysFromNow(-30);
      var gasto30 = compras.filter(function (c) { return c.status === "recebido" && c.dataRecebido && c.dataRecebido >= limite; }).reduce(function (s, c) { return s + valorCompra(c); }, 0);
      kpis.push(ui.kpi({ label: "Valor pendente", value: fmt.money(valorPendente), icon: "money", accent: "info", foot: "Em pedidos não recebidos" }));
      kpis.push(ui.kpi({ label: "Gasto últimos 30 dias", value: fmt.money(gasto30), icon: "compras", accent: "accent", foot: "Compras recebidas no período" }));
    }
    host.appendChild(h("div", { class: "grid grid-3 mb-2" }, kpis));
  }

  /* ---------- Tabela / rastreio ---------- */
  function renderTabela(host) {
    var compras = C.table("compras").slice().sort(function (a, b) { return new Date(b.data) - new Date(a.data); });
    var cols = [
      { key: "comprador", label: "Comprador", render: function (c) { return c.comprador || "—"; } },
      { key: "fornecedor", label: "Fornecedor", render: function (c) { return h("span", { class: "cell-strong", text: nomeFornecedor(c.fornecedorId) }); } },
      { key: "data", label: "Pedido", render: function (c) { return fmt.date(c.data); } },
      { key: "dataPrevista", label: "Previsão", render: function (c) { return fmt.date(c.dataPrevista); } },
      { key: "dataRecebido", label: "Recebido", render: function (c) { return c.dataRecebido ? fmt.date(c.dataRecebido) : "—"; } },
      { key: "itens", label: "Itens", align: "center", render: function (c) { return fmt.int((c.itens || []).length); } }
    ];
    if (C.podeVerFinanceiro()) cols.push({ key: "valor", label: "Valor", align: "right", render: function (c) { return h("span", { class: "cell-strong", text: fmt.money(valorCompra(c)) }); } });
    cols.push({ key: "status", label: "Status", align: "center", render: function (c) { return badgeStatus(c.status); } });
    var tableHost = h("div", {});
    tableHost.appendChild(ui.table(cols, compras, {
      emptyMsg: "Nenhuma compra registrada.",
      onRow: function (c) { verCompra(c); },
      actions: function (c) {
        var acts = [];
        if (c.status === "pedido") acts.push(ui.iconButton("check", function () { receberCompraModal(c); }, "Receber"));
        acts.push(ui.iconButton("search", function () { verCompra(c); }, "Ver detalhes"));
        return acts;
      }
    }));
    host.appendChild(ui.card("Histórico e rastreio de compras", tableHost));
  }

  /* ---------- RENDER ---------- */
  function render(rootEl) {
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader("Compras", "Pedidos, recebimento e reposição — ligado ao estoque.", [
      ui.button("Fornecedores", { variant: "ghost", icon: "user", onClick: openFornecedoresModal }),
      ui.button("Nova compra", { icon: "plus", onClick: function () { openCompraForm(); } })
    ]));

    // FAIXA DE ALERTA: estoque baixo -> reposição
    var baixos = C.analytics.estoqueBaixo();
    if (baixos.length) {
      rootEl.appendChild(h("div", { class: "alert-banner" },
        h("span", { class: "ab-ic", html: C.icon("alert", 22) }),
        h("div", { class: "ab-txt" }, h("b", { text: baixos.length + " " }), (baixos.length === 1 ? "item está" : "itens estão") + " abaixo do mínimo no estoque. Hora de repor."),
        ui.button("Gerar pedido com eles", {
          variant: "primary", icon: "plus", onClick: function () {
            var sug = C.analytics.sugestaoReposicao();
            openCompraForm({ itens: sug.map(function (s) { return { itemId: s.item.id, nome: s.item.nome, qtd: s.sugerido, custoUnit: s.custoUnit }; }) });
          }
        })
      ));
    }

    renderKpis(rootEl);
    renderTabela(rootEl);
  }

  C.registerModule({
    id: "compras", label: "Compras", icon: "compras", order: 4, roles: ["gestor"],
    badge: function () { return C.analytics.estoqueBaixo().length; },
    render: render
  });
})();
