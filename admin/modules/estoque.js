/* ============================================================
   Módulo: ESTOQUE (controle multi-localidade)
   Três abas (.chip): Itens · Movimentações · Histórico de compras
   RBAC: o CAIXA não vê custo nem valores.
     - if (C.podeVerFinanceiro()) protege: coluna "Custo unit.",
       KPI "Valor em estoque" e a aba inteira "Histórico de compras".
   Segue o padrão de modules/limpeza.js e modules/pdv.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // estado de navegação interna (aba ativa + filtros de cada aba)
  var state = {
    aba: "itens",
    busca: "",
    local: "todas",
    cat: "todas",
    movTipo: "todos",
    movItem: "todos"
  };

  /* ---------- helpers ---------- */

  function nomeLocal(localId) {
    var l = C.find("locais", localId);
    return l ? l.nome : "—";
  }

  function operadorOptions() {
    return (C.get().config.operadores || []).slice();
  }

  // categorias distintas dos itens cadastrados
  function categoriasItens() {
    var cats = [];
    C.table("itens").forEach(function (it) {
      if (it.categoria && cats.indexOf(it.categoria) < 0) cats.push(it.categoria);
    });
    return cats;
  }

  // badge de status do saldo em relação a mínimo/máximo
  function statusSaldo(it) {
    if (it.qtd <= it.qtdMin) return ui.badge("Baixo", "danger");
    if (it.qtdMax != null && it.qtd >= it.qtdMax) return ui.badge("Excesso", "warn");
    return ui.badge("OK", "ok");
  }

  // barra .bar-line posicionando o saldo entre mínimo e máximo
  function barraSaldo(it) {
    var min = Number(it.qtdMin) || 0;
    var max = Number(it.qtdMax) || (min || 1);
    var span = (max - min) || 1;
    var perc = ((it.qtd - min) / span) * 100;
    if (perc < 0) perc = 0;
    if (perc > 100) perc = 100;
    var cor = it.qtd <= it.qtdMin ? "var(--danger)" : (it.qtdMax != null && it.qtd >= it.qtdMax ? "var(--warn)" : "var(--accent)");
    return h("div", { class: "bar-line", style: { marginTop: "5px", maxWidth: "150px" } },
      h("span", { style: { width: perc + "%", background: cor } }));
  }

  // célula de validade com badge de alerta (warn <=15 dias, danger se vencido)
  function celulaValidade(it) {
    if (!it.validade) return '<span class="cell-muted">—</span>';
    var dias = C.daysBetween(C.todayISO(), it.validade);
    if (dias < 0) return ui.badge(fmt.date(it.validade), "danger");
    if (dias <= 15) return ui.badge(fmt.date(it.validade), "warn");
    return fmt.date(it.validade);
  }

  /* ---------- formulários (CRUD) ---------- */

  // abrir form de movimentação (entrada/saida/ajuste) -> C.movimentar
  function abrirMovimentacao(it) {
    var ops = operadorOptions();
    ui.formModal({
      title: "Movimentar — " + it.nome,
      size: "sm",
      values: { tipo: "entrada", responsavel: ops[0] || "" },
      fields: [
        { name: "tipo", label: "Tipo de movimentação", type: "select", required: true, full: true,
          options: [
            { value: "entrada", label: "Entrada (somar ao saldo)" },
            { value: "saida", label: "Saída (subtrair do saldo)" },
            { value: "ajuste", label: "Ajuste (definir o saldo)" }
          ] },
        { name: "qtd", label: "Quantidade (" + (it.unidade || "un") + ")", type: "number", step: "0.001", required: true },
        { name: "responsavel", label: "Responsável", type: "select", options: ops, required: true },
        { name: "motivo", label: "Motivo / observação", type: "text", full: true, placeholder: "Ex.: Conferência, perda, transferência" }
      ],
      validate: function (v) {
        if (v.qtd == null || Number(v.qtd) < 0) return "Informe uma quantidade válida.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      C.movimentar({
        itemId: it.id,
        tipo: v.tipo,
        qtd: Number(v.qtd),
        localId: it.localId,
        motivo: v.motivo || "Movimentação manual",
        responsavel: v.responsavel
      });
      ui.toast("Movimentação registrada.", "ok");
      render(document.getElementById("content"));
    });
  }

  // abrir form de item (novo ou edição) -> C.insert / C.update
  function abrirItemForm(it) {
    var editing = !!it;
    var locais = C.table("locais").map(function (l) { return { value: l.id, label: l.nome }; });
    var fornecedores = [{ value: "", label: "— Nenhum —" }].concat(
      C.table("fornecedores").map(function (f) { return { value: f.id, label: f.nome }; })
    );
    var podeFin = C.podeVerFinanceiro();

    var fields = [
      { name: "nome", label: "Nome do item", type: "text", required: true, full: true, placeholder: "Ex.: Casquinha tradicional" },
      { name: "categoria", label: "Categoria", type: "createSelect", required: true, options: categoriasItens(), novoPlaceholder: "Nova categoria (ex.: Embalagem)" },
      { name: "unidade", label: "Unidade", type: "text", required: true, placeholder: "un, kg, L" },
      { name: "localId", label: "Localidade", type: "select", options: locais, required: true },
      { name: "fornecedorId", label: "Fornecedor", type: "select", options: fornecedores },
      { name: "qtdMin", label: "Estoque mínimo", type: "number", step: "0.001", required: true },
      { name: "qtdMax", label: "Estoque máximo", type: "number", step: "0.001", required: true }
    ];
    // custo unit. só para gestor
    if (podeFin) {
      fields.push({ name: "custoUnit", label: "Custo unitário", type: "money", prefix: "R$" });
    }
    fields.push({ name: "validade", label: "Validade", type: "date" });

    ui.formModal({
      title: editing ? "Editar item" : "Novo item",
      size: "md",
      values: it || { unidade: "un", qtdMin: 0, qtdMax: 0 },
      fields: fields
    }).then(function (v) {
      if (!v) return;
      var patch = {
        nome: v.nome,
        categoria: v.categoria,
        unidade: v.unidade,
        localId: v.localId,
        fornecedorId: v.fornecedorId || null,
        qtdMin: Number(v.qtdMin) || 0,
        qtdMax: Number(v.qtdMax) || 0,
        validade: v.validade || null
      };
      if (podeFin) patch.custoUnit = Number(v.custoUnit) || 0;
      if (editing) {
        C.update("itens", it.id, patch);
        ui.toast("Item atualizado.", "ok");
      } else {
        patch.qtd = 0;
        if (!podeFin) patch.custoUnit = 0;
        C.insert("itens", patch);
        ui.toast("Item cadastrado.", "ok");
      }
      render(document.getElementById("content"));
    });
  }

  // abrir form de nova localidade -> C.insert('locais', {nome, tipo})
  function abrirLocalForm() {
    ui.formModal({
      title: "Nova localidade",
      size: "sm",
      values: { tipo: "Seco" },
      fields: [
        { name: "nome", label: "Nome da localidade", type: "text", required: true, full: true, placeholder: "Ex.: Câmara Fria (-18°C)" },
        { name: "tipo", label: "Tipo", type: "select", required: true, full: true,
          options: ["Congelado", "Refrigerado", "Seco", "Loja"] }
      ]
    }).then(function (v) {
      if (!v) return;
      C.insert("locais", { nome: v.nome, tipo: v.tipo });
      ui.toast("Localidade cadastrada.", "ok");
      render(document.getElementById("content"));
    });
  }

  /* ---------- ABA ITENS ---------- */

  function renderItens(host) {
    ui.clear(host);
    var podeFin = C.podeVerFinanceiro();
    var itens = C.table("itens");

    // KPIs (grid-3)
    var kpis = h("div", { class: "grid grid-3 mb-2" });
    kpis.appendChild(ui.kpi({
      label: "Itens cadastrados",
      value: fmt.int(itens.length),
      icon: "box",
      accent: "accent"
    }));
    kpis.appendChild(ui.kpi({
      label: "Abaixo do mínimo",
      value: fmt.int(C.analytics.estoqueBaixo().length),
      icon: "alert",
      accent: "danger"
    }));
    // "Valor em estoque" só para gestor
    if (podeFin) {
      kpis.appendChild(ui.kpi({
        label: "Valor em estoque",
        value: fmt.money(C.analytics.valorEstoque()),
        icon: "money",
        accent: "success"
      }));
    }
    host.appendChild(kpis);

    // filtros: busca + localidade + categoria
    var buscaInput = h("input", { type: "text", placeholder: "Buscar item...", value: state.busca });
    buscaInput.addEventListener("input", function () { state.busca = buscaInput.value; draw(); });

    var localSel = h("select", {});
    localSel.appendChild(h("option", { value: "todas", text: "Todas as localidades" }));
    C.table("locais").forEach(function (l) {
      var opt = h("option", { value: l.id, text: l.nome });
      if (state.local === l.id) opt.selected = true;
      localSel.appendChild(opt);
    });
    localSel.addEventListener("change", function () { state.local = localSel.value; draw(); });

    var catSel = h("select", {});
    catSel.appendChild(h("option", { value: "todas", text: "Todas as categorias" }));
    categoriasItens().forEach(function (c) {
      var opt = h("option", { value: c, text: c });
      if (state.cat === c) opt.selected = true;
      catSel.appendChild(opt);
    });
    catSel.addEventListener("change", function () { state.cat = catSel.value; draw(); });

    host.appendChild(h("div", { class: "filters" },
      h("div", { class: "search-box" }, h("span", { html: C.icon("search", 16) }), buscaInput),
      localSel,
      catSel
    ));

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    function draw() {
      var termo = (state.busca || "").trim().toLowerCase();
      var rows = C.table("itens").filter(function (it) {
        if (state.local !== "todas" && it.localId !== state.local) return false;
        if (state.cat !== "todas" && it.categoria !== state.cat) return false;
        if (termo && (it.nome || "").toLowerCase().indexOf(termo) < 0) return false;
        return true;
      });

      var cols = [
        { key: "nome", label: "Nome", render: function (it) { return h("span", { class: "cell-strong", text: it.nome }); } },
        { key: "categoria", label: "Categoria", render: function (it) { return ui.badge(it.categoria || "—", "neutral"); } },
        { key: "local", label: "Localidade", render: function (it) { return nomeLocal(it.localId); } },
        {
          key: "saldo", label: "Saldo", render: function (it) {
            return h("div", {},
              h("span", { class: "cell-strong", text: fmt.num(it.qtd, 2) + " " + (it.unidade || "") }),
              barraSaldo(it)
            );
          }
        }
      ];
      // coluna Custo unit. somente para gestor
      if (podeFin) {
        cols.push({ key: "custoUnit", label: "Custo unit.", align: "right", render: function (it) { return fmt.money(it.custoUnit); } });
      }
      cols.push({ key: "validade", label: "Validade", render: function (it) { return celulaValidade(it); } });
      cols.push({ key: "status", label: "Status", align: "center", render: function (it) { return statusSaldo(it); } });

      ui.clear(tableHost);
      tableHost.appendChild(ui.table(cols, rows, {
        emptyMsg: "Nenhum item encontrado.",
        actions: function (it) {
          return [
            ui.iconButton("arrowUp", function () { abrirMovimentacao(it); }, "Movimentar"),
            ui.iconButton("edit", function () { abrirItemForm(it); }, "Editar")
          ];
        }
      }));
    }
    draw();
  }

  /* ---------- ABA MOVIMENTAÇÕES ---------- */

  function badgeTipoMov(tipo) {
    if (tipo === "entrada") return ui.badge("Entrada", "ok");
    if (tipo === "saida") return ui.badge("Saída", "danger");
    return ui.badge("Ajuste", "info");
  }

  function renderMovimentacoes(host) {
    ui.clear(host);

    // filtros: tipo + item
    var tipoSel = h("select", {});
    [
      { v: "todos", l: "Todos os tipos" },
      { v: "entrada", l: "Entrada" },
      { v: "saida", l: "Saída" },
      { v: "ajuste", l: "Ajuste" }
    ].forEach(function (o) {
      var opt = h("option", { value: o.v, text: o.l });
      if (state.movTipo === o.v) opt.selected = true;
      tipoSel.appendChild(opt);
    });
    tipoSel.addEventListener("change", function () { state.movTipo = tipoSel.value; draw(); });

    var itemSel = h("select", {});
    itemSel.appendChild(h("option", { value: "todos", text: "Todos os itens" }));
    C.table("itens").forEach(function (it) {
      var opt = h("option", { value: it.id, text: it.nome });
      if (state.movItem === it.id) opt.selected = true;
      itemSel.appendChild(opt);
    });
    itemSel.addEventListener("change", function () { state.movItem = itemSel.value; draw(); });

    host.appendChild(h("div", { class: "filters" }, tipoSel, itemSel));

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    function draw() {
      var rows = C.table("movimentacoes").slice().sort(function (a, b) {
        return new Date(b.datetime) - new Date(a.datetime);
      });
      if (state.movTipo !== "todos") rows = rows.filter(function (m) { return m.tipo === state.movTipo; });
      if (state.movItem !== "todos") rows = rows.filter(function (m) { return m.itemId === state.movItem; });

      ui.clear(tableHost);
      tableHost.appendChild(ui.table([
        { key: "datetime", label: "Data/hora", render: function (m) { return fmt.datetime(m.datetime); } },
        {
          key: "item", label: "Item", render: function (m) {
            var it = C.find("itens", m.itemId);
            return h("span", { class: "cell-strong", text: it ? it.nome : "(item removido)" });
          }
        },
        { key: "tipo", label: "Tipo", render: function (m) { return badgeTipoMov(m.tipo); } },
        { key: "qtd", label: "Qtd", align: "right", render: function (m) { return fmt.num(m.qtd, 3); } },
        { key: "local", label: "Localidade", render: function (m) { return nomeLocal(m.localId); } },
        { key: "motivo", label: "Motivo", render: function (m) { return '<span class="cell-muted">' + (m.motivo || "—") + "</span>"; } },
        { key: "responsavel", label: "Responsável", render: function (m) { return m.responsavel || "—"; } }
      ], rows, {
        emptyMsg: "Nenhuma movimentação registrada.",
        dense: true
      }));
    }
    draw();
  }

  /* ---------- ABA HISTÓRICO DE COMPRAS (SÓ GESTOR) ---------- */

  function valorCompra(c) {
    return (c.itens || []).reduce(function (s, li) {
      return s + (Number(li.qtd) || 0) * (Number(li.custoUnit) || 0);
    }, 0);
  }

  function renderCompras(host) {
    ui.clear(host);

    host.appendChild(h("p", { class: "small muted mb-2",
      text: "Histórico de entradas/compras do estoque — quem comprou, quando e quanto foi pago. As compras recebidas geram entradas no estoque." }));

    var rows = C.table("compras").slice().sort(function (a, b) {
      return new Date(b.data) - new Date(a.data);
    });

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    tableHost.appendChild(ui.table([
      { key: "comprador", label: "Comprador", render: function (c) { return h("span", { class: "cell-strong", text: c.comprador || "—" }); } },
      {
        key: "data", label: "Data", render: function (c) {
          var base = fmt.date(c.data);
          if (c.dataRecebido) return base + ' <span class="cell-muted">· recebido em ' + fmt.date(c.dataRecebido) + "</span>";
          return base;
        }
      },
      {
        key: "fornecedor", label: "Fornecedor", render: function (c) {
          var f = C.find("fornecedores", c.fornecedorId);
          return f ? f.nome : "—";
        }
      },
      { key: "itens", label: "Itens", align: "center", render: function (c) { return fmt.int((c.itens || []).length); } },
      { key: "valor", label: "Valor pago", align: "right", render: function (c) { return h("span", { class: "cell-strong", text: fmt.money(valorCompra(c)) }); } },
      { key: "status", label: "Status", align: "center", render: function (c) { return ui.badge(c.status === "recebido" ? "Recebido" : "Pedido", c.status === "recebido" ? "ok" : "warn"); } }
    ], rows, {
      emptyMsg: "Nenhuma compra registrada."
    }));
  }

  /* ---------- ABA VALIDADE (FEFO) ---------- */

  // farol de vencimento por faixa de dias
  function farolValidade(dias) {
    if (dias < 0) return ui.badge("Vencido", "danger");
    if (dias <= 7) return ui.badge("Crítico", "danger");
    if (dias <= 30) return ui.badge("Atenção", "warn");
    return ui.badge("OK", "ok");
  }

  function descartarItem(x) {
    ui.confirm("Descartar todo o saldo de \"" + x.item.nome + "\" (" + fmt.num(x.item.qtd, 2) + " " + (x.item.unidade || "") + ") como perda?", {
      title: "Descartar item vencido",
      danger: true,
      okLabel: "Descartar"
    }).then(function (ok) {
      if (!ok) return;
      C.registrarPerda({
        tipo: "insumo",
        refId: x.item.id,
        qtd: x.item.qtd,
        motivo: "Vencido",
        responsavel: (C.currentUser() || {}).nome || "—"
      });
      ui.toast("Item descartado e registrado como perda.", "ok");
      render(document.getElementById("content"));
    });
  }

  function renderValidade(host) {
    ui.clear(host);
    var podeFin = C.podeVerFinanceiro();

    // KPI "Vence em 7 dias (R$)" só para gestor
    if (podeFin) {
      var kpis = h("div", { class: "grid grid-3 mb-2" });
      kpis.appendChild(ui.kpi({
        label: "Vence em 7 dias (R$)",
        value: fmt.money(C.analytics.valorVencendo(7)),
        icon: "alert",
        accent: "danger"
      }));
      host.appendChild(kpis);
    }

    host.appendChild(h("p", { class: "small muted mb-2",
      text: "FEFO = usar primeiro o que vence antes." }));

    var rows = C.analytics.validadeFEFO();

    var cols = [
      { key: "item", label: "Item", render: function (x) { return h("span", { class: "cell-strong", text: x.item.nome }); } },
      { key: "local", label: "Localidade", render: function (x) { return nomeLocal(x.item.localId); } },
      { key: "saldo", label: "Saldo", render: function (x) { return fmt.num(x.item.qtd, 2) + " " + (x.item.unidade || ""); } },
      { key: "validade", label: "Validade", render: function (x) { return fmt.date(x.item.validade); } },
      { key: "dias", label: "Dias para vencer", align: "right", render: function (x) { return fmt.int(x.diasParaVencer); } },
      { key: "farol", label: "Farol", align: "center", render: function (x) { return farolValidade(x.diasParaVencer); } }
    ];
    // coluna Valor só para gestor
    if (podeFin) {
      cols.push({ key: "valor", label: "Valor", align: "right", render: function (x) { return fmt.money(x.valor); } });
    }

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    tableHost.appendChild(ui.table(cols, rows, {
      emptyMsg: "Nenhum item com validade cadastrada.",
      actions: function (x) {
        return [
          ui.iconButton("trash", function () { descartarItem(x); }, "Descartar")
        ];
      }
    }));
  }

  /* ---------- RENDER PRINCIPAL (abas) ---------- */

  function render(root) {
    ui.clear(root);

    var podeFin = C.podeVerFinanceiro();

    // ações do cabeçalho: na aba Itens, "Novo item" e "Nova localidade"
    var acoes = state.aba === "itens"
      ? [
          ui.button("Nova localidade", { variant: "ghost", icon: "plus", onClick: function () { abrirLocalForm(); } }),
          ui.button("Novo item", { icon: "plus", onClick: function () { abrirItemForm(null); } })
        ]
      : [];

    root.appendChild(ui.pageHeader(
      "Estoque",
      "Controle de itens por localidade, movimentações e entradas.",
      acoes
    ));

    // abas (.chip) — "Histórico de compras" só aparece para gestor
    var abas = [
      { id: "itens", label: "Itens" },
      { id: "movimentacoes", label: "Movimentações" },
      { id: "validade", label: "Validade (FEFO)" }
    ];
    if (podeFin) abas.push({ id: "compras", label: "Histórico de compras" });

    // se o caixa estava numa aba indisponível, volta para Itens
    var existe = abas.some(function (a) { return a.id === state.aba; });
    if (!existe) state.aba = "itens";

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

    if (state.aba === "movimentacoes") renderMovimentacoes(host);
    else if (state.aba === "validade") renderValidade(host);
    else if (state.aba === "compras" && podeFin) renderCompras(host);
    else renderItens(host);
  }

  C.registerModule({ id: "estoque", label: "Estoque", icon: "estoque", order: 3, roles: ["gestor", "caixa"], render: render });
})();
