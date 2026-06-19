/* ============================================================
   Módulo: RECEITAS  (caderno de receitas com custo automático)
   - Ingrediente do estoque: puxa o preço da última compra (item.custoUnit) e a unidade.
   - Ingrediente avulso: preço por unidade de referência (kg, 100g, L...).
   - Custo total, por kg/L e por bola calculados na hora.
   - Custos são sensíveis: o caixa não vê (C.podeVerFinanceiro()).
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  var state = { busca: "", cat: "Todas" };

  function root() { return document.getElementById("content"); }

  function nomeIngrediente(ing) {
    if (ing.tipo === "insumo") { var it = C.find("itens", ing.itemId); return it ? it.nome : "(item removido)"; }
    return ing.nome || "—";
  }

  // ---------- editor de ingredientes com custo automático ----------
  function ingredientesEditor(valor) {
    var linhas = C.clone(valor || []);
    var itens = C.table("itens");
    var wrap = h("div", { class: "ingr-editor" });
    var list = h("div", { class: "stack", style: { gap: "8px" } });
    var totalEl = h("div", { class: "ingr-total" });

    function unidadeSelect(sel) {
      var s = h("select", {});
      C.UNIDADES.forEach(function (u) { var o = h("option", { value: u, text: u }); if (u === sel) o.selected = true; s.appendChild(o); });
      return s;
    }
    function custoDe(l) {
      if (l.tipo === "insumo") { var it = C.find("itens", l.itemId); if (!it) return 0; return C.custoQuantidade(l.qtd, l.unidade, it.custoUnit, it.unidade); }
      return C.custoQuantidade(l.qtd, l.unidade, l.preco, l.precoPor);
    }
    function atualizaTotal() {
      var t = linhas.reduce(function (s, l) { return s + custoDe(l); }, 0);
      ui.clear(totalEl);
      totalEl.appendChild(h("span", { text: "Custo total dos ingredientes" }));
      totalEl.appendChild(h("b", { text: fmt.money(t) }));
    }

    function row(l, idx) {
      var r = h("div", { class: "ingr-row" });
      var fonte = h("select", { class: "ingr-fonte" });
      fonte.appendChild(h("option", { value: "insumo", text: "Do estoque" }));
      fonte.appendChild(h("option", { value: "livre", text: "Avulso" }));
      fonte.value = l.tipo || "insumo";
      var campos = h("div", { class: "ingr-campos" });
      var custoEl = h("span", { class: "ingr-custo" });

      function recalc() { ui.clear(custoEl); custoEl.appendChild(h("b", { text: fmt.money(custoDe(l)) })); atualizaTotal(); }

      function redrawCampos() {
        ui.clear(campos);
        if (l.tipo === "insumo") {
          var selIt = h("select", {});
          selIt.appendChild(h("option", { value: "", text: "— item do estoque —" }));
          itens.forEach(function (it) { var o = h("option", { value: it.id, text: it.nome }); if (it.id === l.itemId) o.selected = true; selIt.appendChild(o); });
          var qtd = h("input", { type: "number", step: "0.001", min: "0", value: l.qtd != null ? l.qtd : "", placeholder: "qtd", style: { width: "78px" } });
          var un = unidadeSelect(l.unidade);
          var preco = h("span", { class: "ingr-preco" });
          function refPreco() { ui.clear(preco); var it = C.find("itens", l.itemId); if (it) preco.appendChild(h("span", { class: "small muted", text: fmt.money(it.custoUnit) + "/" + it.unidade + " (últ. compra)" })); }
          selIt.addEventListener("change", function () { l.itemId = selIt.value; var it = C.find("itens", l.itemId); if (it) l.unidade = it.unidade; redrawCampos(); recalc(); });
          qtd.addEventListener("input", function () { l.qtd = Number(qtd.value) || 0; recalc(); });
          un.addEventListener("change", function () { l.unidade = un.value; recalc(); });
          campos.appendChild(selIt); campos.appendChild(qtd); campos.appendChild(un); campos.appendChild(preco);
          refPreco();
        } else {
          var nome = h("input", { type: "text", value: l.nome || "", placeholder: "ingrediente", style: { width: "128px" } });
          var qtd2 = h("input", { type: "number", step: "0.001", min: "0", value: l.qtd != null ? l.qtd : "", placeholder: "qtd", style: { width: "66px" } });
          var un2 = unidadeSelect(l.unidade);
          var preco2 = h("input", { type: "number", step: "0.01", min: "0", value: l.preco != null ? l.preco : "", placeholder: "preço", style: { width: "78px" } });
          var porSel = unidadeSelect(l.precoPor || "kg");
          nome.addEventListener("input", function () { l.nome = nome.value; });
          qtd2.addEventListener("input", function () { l.qtd = Number(qtd2.value) || 0; recalc(); });
          un2.addEventListener("change", function () { l.unidade = un2.value; recalc(); });
          preco2.addEventListener("input", function () { l.preco = Number(preco2.value) || 0; recalc(); });
          porSel.addEventListener("change", function () { l.precoPor = porSel.value; recalc(); });
          campos.appendChild(nome); campos.appendChild(qtd2); campos.appendChild(un2);
          campos.appendChild(preco2); campos.appendChild(h("span", { class: "small muted", text: "por" })); campos.appendChild(porSel);
        }
      }
      fonte.addEventListener("change", function () {
        l.tipo = fonte.value;
        if (l.tipo === "insumo") { delete l.nome; delete l.preco; delete l.precoPor; }
        else { delete l.itemId; if (!l.precoPor) l.precoPor = "kg"; }
        redrawCampos(); recalc();
      });
      var del = ui.iconButton("trash", function () { linhas.splice(idx, 1); redraw(); }, "Remover");
      r.appendChild(fonte); r.appendChild(campos); r.appendChild(custoEl); r.appendChild(del);
      redrawCampos();
      ui.clear(custoEl); custoEl.appendChild(h("b", { text: fmt.money(custoDe(l)) }));
      return r;
    }
    function redraw() {
      ui.clear(list);
      if (!linhas.length) list.appendChild(h("p", { class: "small muted", text: "Nenhum ingrediente. Adicione abaixo." }));
      linhas.forEach(function (l, i) { list.appendChild(row(l, i)); });
      atualizaTotal();
    }
    redraw();
    var addIns = ui.button("Item do estoque", { variant: "ghost", icon: "plus" }); addIns.classList.add("btn-sm");
    addIns.addEventListener("click", function () { linhas.push({ tipo: "insumo", itemId: "", qtd: 1, unidade: "g" }); redraw(); });
    var addLiv = ui.button("Ingrediente avulso", { variant: "ghost", icon: "plus" }); addLiv.classList.add("btn-sm");
    addLiv.addEventListener("click", function () { linhas.push({ tipo: "livre", nome: "", qtd: 1, unidade: "g", preco: 0, precoPor: "kg" }); redraw(); });

    wrap.appendChild(list);
    wrap.appendChild(h("div", { class: "mt-1 flex gap", style: { gap: "8px" } }, addIns, addLiv));
    wrap.appendChild(totalEl);
    return {
      el: wrap,
      getValue: function () { return linhas.filter(function (l) { return l.tipo === "insumo" ? l.itemId : (l.nome || l.preco); }); }
    };
  }

  function categorias() {
    var base = ["Gelato", "Sorbetto", "Creme", "Outro"];
    C.table("receitas").forEach(function (r) { if (r.categoria && base.indexOf(r.categoria) < 0) base.push(r.categoria); });
    return base;
  }

  function openForm(receita) {
    var editing = !!receita;
    ui.formModal({
      title: editing ? "Editar receita" : "Nova receita",
      size: "lg",
      values: receita || { rendimentoUnidade: "kg", rendimentoBolas: 50, ingredientes: [] },
      fields: [
        { name: "nome", label: "Nome da receita", type: "text", required: true, full: true, placeholder: "Ex.: Gelato de Pistache" },
        { name: "categoria", label: "Categoria", type: "createSelect", options: categorias(), novoPlaceholder: "Nova categoria" },
        { name: "rendimento", label: "Rendimento", type: "number", step: "0.1", help: "Quanto a receita rende (para o custo por kg/L)" },
        { name: "rendimentoUnidade", label: "Unidade do rendimento", type: "select", options: ["kg", "L", "g", "un"] },
        { name: "rendimentoBolas", label: "Rende quantas bolas", type: "number", step: "1", help: "Usado para o custo por bola" },
        { name: "ingredientes", label: "Ingredientes (custo calculado automaticamente)", type: "custom", full: true, render: ingredientesEditor, help: "Escolha um item do estoque (puxa o preço da última compra) ou lance um ingrediente avulso." },
        { name: "modoPreparo", label: "Modo de preparo", type: "textarea", full: true, rows: 4 },
        { name: "obs", label: "Observações", type: "textarea", full: true, rows: 2 }
      ]
    }).then(function (v) {
      if (!v) return;
      v.rendimento = Number(v.rendimento) || 0;
      v.rendimentoBolas = Number(v.rendimentoBolas) || 0;
      // custoEstimado vira um cache do custo calculado (mas o app sempre recalcula ao vivo)
      v.custoEstimado = C.custoReceita({ ingredientes: v.ingredientes });
      if (editing) { C.update("receitas", receita.id, v); ui.toast("Receita atualizada.", "ok"); }
      else { C.insert("receitas", v); ui.toast("Receita cadastrada.", "ok"); }
      render(root());
    });
  }

  function verReceita(r) {
    var fin = C.podeVerFinanceiro();
    var custoTotal = C.custoReceita(r);
    var body = h("div", {});

    // tabela de ingredientes
    var cols = [
      { key: "nome", label: "Ingrediente", render: function (i) { return nomeIngrediente(i); } },
      { key: "qtd", label: "Quantidade", align: "right", render: function (i) { return fmt.num(i.qtd, 3) + " " + (i.unidade || ""); } }
    ];
    if (fin) cols.push({ key: "custo", label: "Custo", align: "right", render: function (i) { return fmt.money(C.custoIngrediente(i)); } });
    body.appendChild(ui.table(cols, r.ingredientes || [], { dense: true, emptyMsg: "Sem ingredientes." }));

    if (fin) {
      var porRend = r.rendimento ? custoTotal / r.rendimento : 0;
      var porBola = r.rendimentoBolas ? custoTotal / r.rendimentoBolas : 0;
      body.appendChild(h("div", { class: "cost-breakdown" },
        h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Custo total" }), h("div", { class: "cb-val", text: fmt.money(custoTotal) })),
        h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Por " + (r.rendimentoUnidade || "kg") }), h("div", { class: "cb-val", text: fmt.money(porRend) })),
        h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Por bola" }), h("div", { class: "cb-val", text: fmt.money(porBola) }))
      ));
    }
    if (r.modoPreparo) {
      body.appendChild(h("h4", { class: "mt-3", style: { fontFamily: "var(--serif)", marginBottom: "6px" }, text: "Modo de preparo" }));
      body.appendChild(h("p", { class: "small", style: { whiteSpace: "pre-wrap", color: "var(--ink-2)" }, text: r.modoPreparo }));
    }
    if (r.obs) {
      body.appendChild(h("h4", { class: "mt-2", style: { fontFamily: "var(--serif)", marginBottom: "6px" }, text: "Observações" }));
      body.appendChild(h("p", { class: "small muted", style: { whiteSpace: "pre-wrap" }, text: r.obs }));
    }
    ui.modal({ title: r.nome, body: body, size: "md" });
  }

  function render(rootEl) {
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader("Receitas", "Caderno da casa — o custo é calculado pelos ingredientes, com o preço da última compra.",
      [ui.button("Nova receita", { icon: "plus", onClick: function () { openForm(null); } })]));

    var receitas = C.table("receitas");
    var cats = ["Todas"].concat(receitas.map(function (r) { return r.categoria; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }));

    var search = h("input", { type: "text", placeholder: "Buscar receita...", value: state.busca });
    search.addEventListener("input", function () { state.busca = search.value; draw(); });
    var catSel = h("select", {});
    cats.forEach(function (c) { var o = h("option", { value: c, text: c }); if (c === state.cat) o.selected = true; catSel.appendChild(o); });
    catSel.addEventListener("change", function () { state.cat = catSel.value; draw(); });
    rootEl.appendChild(h("div", { class: "filters" },
      h("div", { class: "search-box" }, h("span", { html: C.icon("search", 16) }), search), catSel));

    var grid = h("div", { class: "grid grid-3" });
    rootEl.appendChild(grid);

    function draw() {
      var fin = C.podeVerFinanceiro();
      ui.clear(grid);
      var rows = receitas.filter(function (r) {
        var okc = state.cat === "Todas" || r.categoria === state.cat;
        var okb = !state.busca || r.nome.toLowerCase().indexOf(state.busca.toLowerCase()) >= 0;
        return okc && okb;
      });
      if (!rows.length) { grid.appendChild(ui.empty("Nenhuma receita encontrada.")); return; }
      rows.forEach(function (r) {
        var custoTotal = C.custoReceita(r);
        var info = h("div", {},
          h("div", { class: "flex between items-center", style: { marginBottom: "8px" } },
            ui.badge(r.categoria || "—", "accent"),
            h("span", { class: "small muted", text: (r.ingredientes || []).length + " ingred." })
          ),
          h("h3", { style: { fontFamily: "var(--serif)", fontSize: "1.15rem", marginBottom: "6px" }, text: r.nome }),
          h("p", { class: "small muted", text: "Rende " + fmt.num(r.rendimento, 1) + " " + (r.rendimentoUnidade || "") + " · " + fmt.int(r.rendimentoBolas) + " bolas" })
        );
        if (fin) {
          info.appendChild(h("div", { class: "divider" }));
          info.appendChild(h("div", { class: "list-row", style: { padding: "4px 0", border: "none" } },
            h("span", { class: "small muted", text: "Custo total" }), h("b", { text: fmt.money(custoTotal) })));
          info.appendChild(h("div", { class: "list-row", style: { padding: "4px 0", border: "none" } },
            h("span", { class: "small muted", text: "Por bola" }), h("b", { class: "text-accent", text: fmt.money(r.rendimentoBolas ? custoTotal / r.rendimentoBolas : 0) })));
        }
        var acoes = h("div", { class: "flex gap mt-2", style: { gap: "8px" } },
          ui.button("Ver", { variant: "ghost", onClick: function () { verReceita(r); } }),
          ui.button("Editar", { variant: "ghost", onClick: function () { openForm(r); } }),
          ui.iconButton("trash", function () {
            ui.confirm("Excluir a receita \"" + r.nome + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
              if (ok) { C.remove("receitas", r.id); ui.toast("Receita excluída.", "ok"); render(root()); }
            });
          }, "Excluir")
        );
        info.appendChild(acoes);
        grid.appendChild(ui.card(null, info));
      });
    }
    draw();
  }

  C.registerModule({ id: "receitas", label: "Receitas", icon: "receitas", order: 6, roles: ["gestor", "caixa"], render: render });
})();
