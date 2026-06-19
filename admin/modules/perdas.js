/* ============================================================
   Módulo: PERDAS / DESPERDÍCIO
   Registro de perda de insumo ou produto, com baixa no estoque,
   motivo e custo (calculado pela última compra via C.registrarPerda).
   RBAC: o valor em R$ (custo) é sensível.
     - O CAIXA registra perdas, mas NÃO vê os R$.
     - if (C.podeVerFinanceiro()) protege: KPIs "Perdido em 30 dias" e
       "Top motivo", a coluna "Custo" da tabela e o card "Top motivos".
   Segue o padrão de modules/limpeza.js, modules/estoque.js e modules/pdv.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // motivos sugeridos (createSelect permite cadastrar outros na hora)
  var MOTIVOS = [
    "Derreteu / queda de energia",
    "Vencido",
    "Quebrou",
    "Sobra de fim de dia",
    "Erro de preparo",
    "Cortesia / degustação"
  ];

  function operadorOptions() {
    return (C.get().config.operadores || []).slice();
  }

  function badgeTipo(tipo) {
    if (tipo === "produto") return ui.badge("Produto", "info");
    return ui.badge("Insumo", "neutral");
  }

  /* ---------- registrar perda ---------- */

  // Campo custom: um <select> de TIPO (insumo/produto) e um segundo <select>
  // de ITEM que troca conforme o tipo. getValue retorna {tipo, refId}.
  function campoItem(initial) {
    var itens = C.table("itens");
    var produtos = C.table("produtos");

    var tipoSel = h("select", {});
    tipoSel.appendChild(h("option", { value: "insumo", text: "Insumo (estoque)" }));
    tipoSel.appendChild(h("option", { value: "produto", text: "Produto (catálogo)" }));

    var itemSel = h("select", { style: { marginTop: "8px" } });

    function preencheItens() {
      ui.clear(itemSel);
      var lista = tipoSel.value === "produto" ? produtos : itens;
      if (!lista.length) {
        itemSel.appendChild(h("option", { value: "", text: "— Nenhum cadastrado —" }));
        return;
      }
      lista.forEach(function (x) {
        var label = x.nome + (tipoSel.value === "insumo" && x.unidade ? " (" + x.unidade + ")" : "");
        itemSel.appendChild(h("option", { value: x.id, text: label }));
      });
    }

    tipoSel.value = (initial && initial.tipo) || "insumo";
    preencheItens();
    tipoSel.addEventListener("change", preencheItens);

    var el = h("div", {}, tipoSel, itemSel);
    return {
      el: el,
      getValue: function () { return { tipo: tipoSel.value, refId: itemSel.value }; }
    };
  }

  function abrirPerdaForm() {
    var ops = operadorOptions();
    if (!ops.length) { ui.toast("Cadastre operadores na configuração.", "warn"); return; }

    ui.formModal({
      title: "Registrar perda",
      size: "md",
      values: { responsavel: ops[0] },
      fields: [
        {
          name: "item", label: "O que foi perdido?", type: "custom", full: true,
          render: function (val) { return campoItem(val); }
        },
        { name: "qtd", label: "Quantidade perdida", type: "number", step: "0.001", required: true },
        {
          name: "motivo", label: "Motivo", type: "createSelect", required: true,
          options: MOTIVOS, novoPlaceholder: "Outro motivo (ex.: Acidente)"
        },
        { name: "responsavel", label: "Responsável", type: "select", options: ops, required: true }
      ],
      validate: function (v) {
        if (!v.item || !v.item.refId) return "Selecione o item perdido.";
        if (v.qtd == null || Number(v.qtd) <= 0) return "Informe uma quantidade válida.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      C.registrarPerda({
        tipo: v.item.tipo,
        refId: v.item.refId,
        qtd: Number(v.qtd),
        motivo: v.motivo,
        responsavel: v.responsavel
      });
      ui.toast("Perda registrada e baixada do estoque.", "ok");
      render(document.getElementById("content"));
    });
  }

  /* ---------- KPIs ---------- */

  function renderKpis(host) {
    var podeFin = C.podeVerFinanceiro();

    var kpis = h("div", { class: "grid grid-3 mb-2" });
    kpis.appendChild(ui.kpi({
      label: "Ocorrências (30d)",
      value: fmt.int(C.analytics.perdasNoPeriodo(30).length),
      icon: "perda",
      accent: "accent"
    }));

    if (podeFin) {
      kpis.appendChild(ui.kpi({
        label: "Perdido em 30 dias",
        value: fmt.money(C.analytics.perdasTotal(30)),
        icon: "money",
        accent: "danger"
      }));
      var top = C.analytics.perdasPorMotivo(30)[0];
      kpis.appendChild(ui.kpi({
        label: "Top motivo",
        value: top ? top.motivo : "—",
        icon: "alert",
        accent: "warn",
        foot: top ? fmt.money(top.custo) + " · " + fmt.int(top.qtd) + " ocorrência(s)" : "Sem perdas no período"
      }));
    }

    host.appendChild(kpis);
  }

  /* ---------- tabela de perdas ---------- */

  function renderTabela(host) {
    var podeFin = C.podeVerFinanceiro();

    var rows = C.table("perdas").slice().sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });

    var cols = [
      { key: "datetime", label: "Data", render: function (p) { return fmt.datetime(p.datetime); } },
      { key: "tipo", label: "Tipo", render: function (p) { return badgeTipo(p.tipo); } },
      { key: "nome", label: "Item", render: function (p) { return h("span", { class: "cell-strong", text: p.nome || "—" }); } },
      {
        key: "qtd", label: "Qtd", align: "right",
        render: function (p) { return fmt.num(p.qtd, 3) + " " + (p.unidade || ""); }
      },
      { key: "motivo", label: "Motivo", render: function (p) { return '<span class="cell-muted">' + (p.motivo || "—") + "</span>"; } },
      { key: "responsavel", label: "Responsável", render: function (p) { return p.responsavel || "—"; } }
    ];
    // coluna Custo somente para gestor
    if (podeFin) {
      cols.push({
        key: "custo", label: "Custo", align: "right",
        render: function (p) { return h("span", { class: "cell-strong text-danger", text: fmt.money(p.custo) }); }
      });
    }

    var tableHost = h("div", {});
    tableHost.appendChild(ui.table(cols, rows, {
      emptyMsg: "Nenhuma perda registrada ainda.",
      dense: true
    }));
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));
  }

  /* ---------- card "Top motivos (30 dias)" (SÓ GESTOR) ---------- */

  function renderTopMotivos(host) {
    var motivos = C.analytics.perdasPorMotivo(30);
    if (!motivos.length) {
      host.appendChild(ui.card("Top motivos (30 dias)", ui.empty("Sem perdas nos últimos 30 dias.")));
      return;
    }

    var max = Math.max.apply(null, motivos.map(function (m) { return m.custo; }).concat([1]));
    var lista = h("div", { class: "stack" });
    motivos.forEach(function (m) {
      var perc = (m.custo / max) * 100;
      if (perc < 2) perc = 2;
      lista.appendChild(h("div", { style: { marginBottom: "4px" } },
        h("div", { class: "flex between items-center", style: { marginBottom: "5px" } },
          h("span", { class: "cell-strong", text: m.motivo }),
          h("span", { class: "small muted" },
            h("b", { class: "text-danger", text: fmt.money(m.custo) }),
            " · " + fmt.int(m.qtd) + "x"
          )
        ),
        h("div", { class: "bar-line" }, h("span", { style: { width: perc + "%", background: "var(--danger)" } }))
      ));
    });

    host.appendChild(ui.card("Top motivos (30 dias)", lista));
  }

  /* ---------- RENDER PRINCIPAL ---------- */

  function render(root) {
    ui.clear(root);
    var podeFin = C.podeVerFinanceiro();

    root.appendChild(ui.pageHeader(
      "Perdas",
      "Registre o desperdício de insumos e produtos — baixa no estoque com motivo e custo.",
      [ui.button("Registrar perda", { icon: "plus", onClick: function () { abrirPerdaForm(); } })]
    ));

    renderKpis(root);

    var host = h("div", {});
    root.appendChild(host);
    renderTabela(host);

    // card "Top motivos (30 dias)" só para gestor
    if (podeFin) {
      var topHost = h("div", { class: "mt-2" });
      topHost.style.marginTop = "16px";
      renderTopMotivos(topHost);
      root.appendChild(topHost);
    }
  }

  C.registerModule({ id: "perdas", label: "Perdas", icon: "perda", order: 8.5, roles: ["gestor", "caixa"], render: render });
})();
