/* ============================================================
   Módulo: PRODUTOS  (somente gestor)
   Modelo v2 com duas abas (.chip):
   - Bases: produtos vendáveis (casquinha, potinho, viagem, bebidas).
            Têm custo FIXO (embalagem) + bolas de sabor (custo variável).
   - Sabores: cada sabor é uma receita = um custo por bola diferente.
   O gestor escolhe, via checkbox consomeEstoque, o que dá baixa de estoque.
   Segue o padrão de modules/limpeza.js (abas) e modules/pdv.js (modelo novo).
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // estado de navegação interna (aba ativa)
  var state = { aba: "bases" };

  /* ---------- editor do campo "consome" (item de estoque + qtd) ---------- */
  function consomeEditor(valor) {
    var linhas = C.clone(valor || []);
    var itens = C.table("itens");
    var wrap = h("div", { class: "consome-editor" });
    var list = h("div", { class: "stack", style: { gap: "8px" } });

    function itemOptions(sel) {
      var s = h("select", {});
      s.appendChild(h("option", { value: "", text: "— selecionar item —" }));
      itens.forEach(function (it) {
        var o = h("option", { value: it.id, text: it.nome + " (" + it.unidade + ")" });
        if (it.id === sel) o.selected = true;
        s.appendChild(o);
      });
      return s;
    }
    function row(linha, idx) {
      var sel = itemOptions(linha.itemId);
      var qty = h("input", { type: "number", step: "0.001", min: "0", value: linha.qtd != null ? linha.qtd : 1, style: { width: "92px" } });
      sel.addEventListener("change", function () { linhas[idx].itemId = sel.value; });
      qty.addEventListener("input", function () { linhas[idx].qtd = Number(qty.value) || 0; });
      var del = ui.iconButton("trash", function () { linhas.splice(idx, 1); redraw(); }, "Remover");
      return h("div", { class: "flex items-center gap", style: { gap: "8px" } }, h("div", { style: { flex: "1" } }, sel), qty, del);
    }
    function redraw() {
      ui.clear(list);
      if (!linhas.length) list.appendChild(h("p", { class: "small muted", text: "Nenhum item dá baixa por enquanto." }));
      linhas.forEach(function (l, i) { list.appendChild(row(l, i)); });
    }
    redraw();
    var add = ui.button("Adicionar item", { variant: "ghost", icon: "plus" });
    add.classList.add("btn-sm");
    add.addEventListener("click", function () { linhas.push({ itemId: "", qtd: 1 }); redraw(); });
    wrap.appendChild(list);
    wrap.appendChild(h("div", { class: "mt-1" }, add));
    return { el: wrap, getValue: function () { return linhas.filter(function (l) { return l.itemId; }); } };
  }

  // chips dos itens consumidos (para a coluna "Baixa estoque")
  function consomeChips(consome) {
    var box = h("div", { class: "chips" });
    (consome || []).forEach(function (c) {
      var it = C.find("itens", c.itemId);
      if (it) box.appendChild(ui.badge(fmt.num(c.qtd, 3) + "× " + it.nome, "accent"));
    });
    if (!box.childNodes.length) box.appendChild(ui.badge("sem itens", "neutral"));
    return box;
  }

  /* ============================================================
     ABA BASES (produtos vendáveis)
     ============================================================ */
  function openProdutoForm(produto) {
    var editing = !!produto;
    var fin = C.podeVerFinanceiro();
    var cats = ["Casquinha", "Potinho", "Viagem", "Bebida", "Outro"];
    C.table("produtos").forEach(function (p) { if (p.categoria && cats.indexOf(p.categoria) < 0) cats.push(p.categoria); });
    var fields = [
      { name: "nome", label: "Nome do produto", type: "text", required: true, full: true, placeholder: "Ex.: Casquinha 2 bolas" },
      { name: "categoria", label: "Categoria", type: "createSelect", options: cats, novoPlaceholder: "Nova categoria" },
      { name: "tipo", label: "Tipo", type: "select", options: [{ value: "montavel", label: "Montável (recebe sabor)" }, { value: "simples", label: "Simples (bebida / fechado)" }], help: "Montável leva bolas de sabor; simples é fechado." },
      { name: "disponibilidade", label: "Disponibilidade", type: "select", options: [{ value: "disponivel", label: "Disponível" }, { value: "acabando", label: "Acabando" }, { value: "esgotado", label: "Esgotado" }] },
      { name: "precoVenda", label: "Preço de venda", type: "money", prefix: "R$", required: true }
    ];
    // Custo fixo e % operacional são financeiros: só gestor edita.
    if (fin) {
      fields.push({ name: "custoFixo", label: "Custo fixo (embalagem)", type: "money", prefix: "R$", help: "Casquinha, pote, lata... O custo das bolas vem do sabor." });
    }
    fields.push({ name: "bolas", label: "Bolas de sabor", type: "number", step: "1", min: 0, help: "Quantas bolas de sabor o produto leva; 0 para bebidas." });
    if (fin) {
      fields.push({ name: "percOperacional", label: "% operacional", type: "number", step: "0.5", help: "Aluguel, energia, cartão... aplicado sobre o preço." });
    }
    fields.push({ name: "consomeEstoque", label: "A embalagem dá baixa no estoque", type: "checkbox", help: "Você decide: marque para a embalagem sair do estoque a cada venda." });
    fields.push({
      name: "consome", label: "Itens consumidos por unidade (embalagem)", type: "custom", full: true,
      render: consomeEditor,
      help: "Embalagens e bebidas saem do estoque. As bolas de gelato não saem por aqui (cada sabor controla o seu)."
    });
    ui.formModal({
      title: editing ? "Editar produto base" : "Novo produto base",
      size: "lg",
      values: produto || { tipo: "montavel", disponibilidade: "disponivel", bolas: 1, consomeEstoque: true, percOperacional: C.get().config.percOperacionalPadrao, consome: [] },
      fields: fields,
      validate: function (v) {
        if (fin && v.precoVenda != null && v.custoFixo != null && v.custoFixo > v.precoVenda) return "O custo fixo está maior que o preço de venda.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      // normaliza números
      v.bolas = Number(v.bolas) || 0;
      v.precoVenda = Number(v.precoVenda) || 0;
      // campos financeiros só existem no form do gestor; sem eles, C.update (merge) preserva os valores atuais.
      if (fin) {
        v.custoFixo = Number(v.custoFixo) || 0;
        v.percOperacional = Number(v.percOperacional) || 0;
      } else if (!editing) {
        // novo produto criado por não-gestor: garante defaults seguros.
        v.custoFixo = 0;
        v.percOperacional = Number(C.get().config.percOperacionalPadrao) || 0;
      }
      if (editing) { C.update("produtos", produto.id, v); ui.toast("Produto atualizado.", "ok"); }
      else { C.insert("produtos", v); ui.toast("Produto cadastrado.", "ok"); }
      render(document.getElementById("content"));
    });
  }

  function renderBases(host) {
    ui.clear(host);
    var produtos = C.table("produtos");

    // KPIs rápidos. Preço médio de catálogo é financeiro: só gestor vê.
    var montaveis = produtos.filter(function (p) { return p.tipo === "montavel"; }).length;
    var kpis = [
      ui.kpi({ label: "Produtos base", value: fmt.int(produtos.length), icon: "produtos", accent: "accent" }),
      ui.kpi({ label: "Montáveis (com sabor)", value: fmt.int(montaveis), icon: "snow", accent: "info" })
    ];
    if (C.podeVerFinanceiro()) {
      var ticket = produtos.length ? produtos.reduce(function (s, p) { return s + (Number(p.precoVenda) || 0); }, 0) / produtos.length : 0;
      kpis.push(ui.kpi({ label: "Preço médio de catálogo", value: fmt.money(ticket), icon: "money", accent: "success" }));
    }
    host.appendChild(h("div", { class: "grid grid-3 mb-2" }, kpis));

    host.appendChild(h("p", { class: "small muted mb-2", text: "O custo de um montável depende do sabor escolhido na venda. O gestor decide o que sai do estoque pelo campo \"a embalagem dá baixa no estoque\"." }));

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    var cols = [
      { key: "nome", label: "Nome", render: function (p) { return h("span", { class: "cell-strong", text: p.nome }); } },
      { key: "categoria", label: "Categoria", render: function (p) { return ui.badge(p.categoria || "Outro", "neutral"); } },
      {
        key: "tipo", label: "Tipo", render: function (p) {
          return p.tipo === "montavel" ? ui.badge("Montável", "accent") : ui.badge("Simples", "info");
        }
      },
      {
        key: "disponibilidade", label: "Status", render: function (p) {
          var d = p.disponibilidade || "disponivel";
          if (d === "esgotado") return ui.badge("Esgotado", "danger");
          if (d === "acabando") return ui.badge("Acabando", "warn");
          return ui.badge("Disponível", "ok");
        }
      },
      { key: "precoVenda", label: "Preço", align: "right", render: function (p) { return fmt.money(p.precoVenda); } },
      { key: "bolas", label: "Bolas", align: "center", render: function (p) { return fmt.int(p.bolas || 0); } }
    ];
    // Custo fixo e margem são financeiros: só gestor vê.
    if (C.podeVerFinanceiro()) {
      cols.push({ key: "custoFixo", label: "Custo fixo", align: "right", render: function (p) { return '<span class="cell-muted">' + fmt.money(p.custoFixo) + "</span>"; } });
      cols.push({
        key: "margem", label: "Margem fixa", align: "right", render: function (p) {
          if (p.tipo === "montavel") return '<span class="cell-muted">+ sabor</span>';
          var preco = Number(p.precoVenda) || 0;
          var m = preco ? (preco - (Number(p.custoFixo) || 0)) / preco * 100 : 0;
          var kind = m >= 60 ? "ok" : (m >= 40 ? "warn" : "danger");
          return ui.badge(fmt.pct(m), kind);
        }
      });
    }
    cols.push({
      key: "consome", label: "Baixa estoque", render: function (p) {
        if (!p.consomeEstoque) return '<span class="cell-muted">não controla</span>';
        return consomeChips(p.consome);
      }
    });

    tableHost.appendChild(ui.table(cols, produtos, {
      emptyMsg: "Nenhum produto base cadastrado.",
      actions: function (p) {
        return [
          ui.iconButton("edit", function () { openProdutoForm(p); }, "Editar"),
          ui.iconButton("trash", function () {
            ui.confirm("Excluir o produto \"" + p.nome + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
              if (ok) { C.remove("produtos", p.id); ui.toast("Produto excluído.", "ok"); render(document.getElementById("content")); }
            });
          }, "Excluir")
        ];
      }
    }));
  }

  /* ============================================================
     ABA SABORES (cada sabor = uma receita = um custo por bola)
     ============================================================ */
  function receitaOptions() {
    var opts = [{ value: "", label: "— nenhuma —" }];
    C.table("receitas").forEach(function (r) { opts.push({ value: r.id, label: r.nome }); });
    return opts;
  }

  function openSaborForm(sabor) {
    var editing = !!sabor;
    var fin = C.podeVerFinanceiro();
    var cats = ["Gelato", "Sorbetto", "Creme", "Outro"];
    C.table("sabores").forEach(function (s) { if (s.categoria && cats.indexOf(s.categoria) < 0) cats.push(s.categoria); });
    var fields = [
      { name: "nome", label: "Nome do sabor", type: "text", required: true, full: true, placeholder: "Ex.: Pistache Siciliano" },
      { name: "categoria", label: "Categoria", type: "createSelect", options: cats, novoPlaceholder: "Nova categoria" },
      { name: "receitaId", label: "Receita vinculada", type: "select", options: receitaOptions(), help: "Liga o sabor a uma receita para puxar o custo por bola." }
    ];
    // Custo por bola é financeiro: só gestor edita.
    if (fin) {
      fields.push({ name: "custoPorBola", label: "Custo por bola", type: "number", step: "0.01", prefix: "R$", help: "Deixe vazio para usar o custo da receita (custo estimado ÷ rendimento em bolas)." });
    }
    fields.push({ name: "consomeEstoque", label: "Este sabor dá baixa de matéria-prima", type: "checkbox", help: "Você decide: marque para a matéria-prima sair do estoque a cada bola vendida." });
    fields.push({
      name: "consome", label: "Matéria-prima consumida por bola", type: "custom", full: true,
      render: consomeEditor,
      help: "Quanto de cada insumo sai do estoque por bola. Só dá baixa se a opção acima estiver marcada."
    });
    ui.formModal({
      title: editing ? "Editar sabor" : "Novo sabor",
      size: "lg",
      values: sabor || { categoria: "Gelato", receitaId: "", consomeEstoque: false, consome: [] },
      fields: fields
    }).then(function (v) {
      if (!v) return;
      // receitaId vazio vira null.
      if (!v.receitaId) v.receitaId = null;
      // custoPorBola só existe no form do gestor. Sem ele, C.update (merge) preserva o valor atual.
      if (fin) {
        if (v.custoPorBola == null || v.custoPorBola === "") v.custoPorBola = null;
        else v.custoPorBola = Number(v.custoPorBola);
      } else if (!editing) {
        v.custoPorBola = null; // novo sabor por não-gestor usa custo da receita.
      }
      if (editing) { C.update("sabores", sabor.id, v); ui.toast("Sabor atualizado.", "ok"); }
      else { C.insert("sabores", v); ui.toast("Sabor cadastrado.", "ok"); }
      render(document.getElementById("content"));
    });
  }

  function renderSabores(host) {
    ui.clear(host);
    var sabores = C.table("sabores");

    // KPIs rápidos. Custo médio por bola é financeiro: só gestor vê.
    var comReceita = sabores.filter(function (s) { return s.receitaId; }).length;
    var kpis = [
      ui.kpi({ label: "Sabores cadastrados", value: fmt.int(sabores.length), icon: "snow", accent: "accent" }),
      ui.kpi({ label: "Com receita vinculada", value: fmt.int(comReceita), icon: "receitas", accent: "info" })
    ];
    if (C.podeVerFinanceiro()) {
      var custoMedio = sabores.length ? sabores.reduce(function (s, sb) { return s + C.custoPorBola(sb); }, 0) / sabores.length : 0;
      kpis.push(ui.kpi({ label: "Custo médio por bola", value: fmt.money(custoMedio), icon: "money", accent: "success" }));
    }
    host.appendChild(h("div", { class: "grid grid-3 mb-2" }, kpis));

    host.appendChild(h("p", { class: "small muted mb-2", text: "Cada sabor é uma receita diferente, com custo por bola próprio. O gestor decide se o sabor dá baixa de matéria-prima pelo campo \"este sabor dá baixa de matéria-prima\"." }));

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    var cols = [
      { key: "nome", label: "Nome", render: function (s) { return h("span", { class: "cell-strong", text: s.nome }); } },
      { key: "categoria", label: "Categoria", render: function (s) { return ui.badge(s.categoria || "Outro", "neutral"); } },
      {
        key: "receita", label: "Receita vinculada", render: function (s) {
          if (!s.receitaId) return '<span class="cell-muted">—</span>';
          var r = C.find("receitas", s.receitaId);
          return r ? r.nome : '<span class="cell-muted">(receita removida)</span>';
        }
      }
    ];
    // Custo por bola é financeiro: só gestor vê.
    if (C.podeVerFinanceiro()) {
      cols.push({
        key: "custoPorBola", label: "Custo por bola", align: "right", render: function (s) {
          var c = C.custoPorBola(s);
          var tag = (s.custoPorBola == null && s.receitaId) ? " (receita)" : "";
          return h("span", { class: "cell-strong" }, fmt.money(c), h("span", { class: "cell-muted", text: tag }));
        }
      });
    }
    cols.push({
      key: "consome", label: "Baixa estoque", render: function (s) {
        if (!s.consomeEstoque) return ui.badge("não sai do estoque", "neutral");
        return consomeChips(s.consome);
      }
    });

    tableHost.appendChild(ui.table(cols, sabores, {
      emptyMsg: "Nenhum sabor cadastrado.",
      actions: function (s) {
        return [
          ui.iconButton("edit", function () { openSaborForm(s); }, "Editar"),
          ui.iconButton("trash", function () {
            ui.confirm("Excluir o sabor \"" + s.nome + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
              if (ok) { C.remove("sabores", s.id); ui.toast("Sabor excluído.", "ok"); render(document.getElementById("content")); }
            });
          }, "Excluir")
        ];
      }
    }));
  }

  /* ============================================================
     RENDER PRINCIPAL (abas .chip)
     ============================================================ */
  function render(root) {
    ui.clear(root);
    root.appendChild(ui.pageHeader(
      "Produtos",
      "Bases vendáveis e sabores — custo, margem e baixa de estoque.",
      state.aba === "simulador"
        ? []
        : state.aba === "sabores"
          ? [ui.button("Novo sabor", { icon: "plus", onClick: function () { openSaborForm(null); } })]
          : [ui.button("Novo produto base", { icon: "plus", onClick: function () { openProdutoForm(null); } })]
    ));

    // abas (.chip)
    var abas = [
      { id: "bases", label: "Bases" },
      { id: "sabores", label: "Sabores" },
      { id: "simulador", label: "Simulador de custo" }
    ];
    var chips = h("div", { class: "chips mb-2" });
    abas.forEach(function (a) {
      var chip = h("button", {
        class: "chip" + (state.aba === a.id ? " active" : ""),
        type: "button",
        text: a.label
      });
      chip.addEventListener("click", function () { state.aba = a.id; render(document.getElementById("content")); });
      chips.appendChild(chip);
    });
    root.appendChild(chips);

    var host = h("div", {});
    root.appendChild(host);

    if (state.aba === "sabores") renderSabores(host);
    else if (state.aba === "simulador") renderSimulador(host);
    else renderBases(host);
  }

  /* ============================================================
     SIMULADOR DE CUSTO (achar o custo de cada combinação base + sabor)
     ============================================================ */
  function renderSimulador(host) {
    ui.clear(host);
    host.appendChild(h("p", { class: "small muted mb-2", text: "Monte uma combinação para ver o custo e o lucro de cada coisa. No caixa não se escolhe sabor — isto aqui é só para análise." }));
    var montaveis = C.table("produtos").filter(function (p) { return p.tipo === "montavel"; });
    var sabores = C.table("sabores");
    if (!montaveis.length || !sabores.length) { host.appendChild(ui.empty("Cadastre ao menos um produto montável e um sabor.")); return; }

    var selBase = h("select", {});
    montaveis.forEach(function (p) { selBase.appendChild(h("option", { value: p.id, text: p.nome + " — " + fmt.money(p.precoVenda) })); });
    var slotsWrap = h("div", { class: "scoop-slots" });
    var resultado = h("div", { class: "mt-2" });

    function rebuild() {
      var base = C.find("produtos", selBase.value);
      ui.clear(slotsWrap);
      var nSlots = Math.min(base.bolas || 1, 3);
      var slots = [];
      for (var i = 0; i < nSlots; i++) {
        var s = h("select", {});
        sabores.forEach(function (sb) { s.appendChild(h("option", { value: sb.id, text: sb.nome })); });
        slots.push(s);
        slotsWrap.appendChild(h("div", { class: "scoop-slot" }, h("label", { text: "Bola " + (i + 1) }), s));
      }
      function calc() {
        var ids = slots.map(function (s) { return s.value; });
        var custo = C.custoLinha(base, ids);
        var lucro = Math.round((base.precoVenda - custo) * 100) / 100;
        var margem = base.precoVenda ? lucro / base.precoVenda * 100 : 0;
        ui.clear(resultado);
        resultado.appendChild(h("div", { class: "cost-breakdown" },
          h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Preço" }), h("div", { class: "cb-val", text: fmt.money(base.precoVenda) })),
          h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Custo" }), h("div", { class: "cb-val", text: fmt.money(custo) })),
          h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Lucro" }), h("div", { class: "cb-val text-accent", text: fmt.money(lucro) }))
        ));
        resultado.appendChild(h("p", { class: "small muted mt-1", text: "Custo fixo (embalagem) " + fmt.money(base.custoFixo || 0) + " + sabor. Margem: " + fmt.pct(margem) }));
      }
      slots.forEach(function (s) { s.addEventListener("change", calc); });
      calc();
    }
    selBase.addEventListener("change", rebuild);

    host.appendChild(ui.card("Simulador de custo", h("div", {},
      h("div", { class: "form-field", style: { maxWidth: "380px" } }, h("label", { text: "Produto base" }), selBase),
      h("div", { class: "mt-2" }, slotsWrap),
      resultado
    )));
    rebuild();
  }

  C.registerModule({ id: "produtos", label: "Produtos", icon: "produtos", order: 5, roles: ["gestor"], render: render });
})();
