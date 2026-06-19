/* ============================================================
   Módulo: PRODUÇÃO  (agenda de produção de gelato/sorbet — quadro kanban)
   Segue o padrão de produtos.js (módulo de referência).
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // pequeno bloco de estilo (apenas o necessário p/ o quadro kanban)
  function ensureStyles() {
    if (document.getElementById("producao-styles")) return;
    var css = ""
      + ".prod-board{align-items:start}"
      + ".prod-col{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:12px}"
      + ".prod-col-head{display:flex;align-items:center;justify-content:space-between;gap:8px}"
      + ".prod-col-title{font-size:.82rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-2);display:flex;align-items:center;gap:7px}"
      + ".prod-col-dot{width:9px;height:9px;border-radius:50%;flex:none}"
      + ".prod-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);box-shadow:var(--shadow-sm);padding:13px 14px;display:flex;flex-direction:column;gap:9px}"
      + ".prod-card.is-late{border-color:var(--danger);box-shadow:0 0 0 1px var(--danger-soft)}"
      + ".prod-card-name{font-weight:600;font-size:.95rem;color:var(--ink);line-height:1.25}"
      + ".prod-card-meta{display:flex;flex-direction:column;gap:4px;font-size:.8rem;color:var(--ink-2)}"
      + ".prod-card-meta .lbl{color:var(--muted)}"
      + ".prod-card-obs{font-size:.78rem;color:var(--muted);font-style:italic;border-top:1px dashed var(--line);padding-top:8px}"
      + ".prod-card-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}"
      + ".prod-card-foot .spacer{flex:1}"
      + ".prod-qty{font-family:var(--serif);font-weight:600;font-size:1.05rem;color:var(--accent)}"
      + ".prod-col-empty{font-size:.82rem;color:var(--muted);font-style:italic;text-align:center;padding:18px 6px}";
    var st = h("style", { id: "producao-styles", html: css });
    document.head.appendChild(st);
  }

  var COLUNAS = [
    { status: "agendada", titulo: "Agendada", cor: "var(--info)" },
    { status: "em_producao", titulo: "Em produção", cor: "var(--warn)" },
    { status: "concluida", titulo: "Concluída", cor: "var(--ok)" }
  ];

  // produção atrasada: não concluída E prazo já passou
  function atrasada(p) {
    if (p.status === "concluida" || !p.prazo) return false;
    return C.daysBetween(C.todayISO(), p.prazo) < 0;
  }

  function rerender() {
    render(document.getElementById("content"));
  }

  function openForm(item) {
    var editing = !!item;
    var receitas = C.table("receitas");
    var operadores = C.get().config.operadores || [];

    // opções de produto a partir das receitas (+ texto livre do registro em edição)
    var nomesReceitas = receitas.map(function (r) { return r.nome; });
    var produtoOpts = nomesReceitas.slice();
    if (editing && item.produto && produtoOpts.indexOf(item.produto) < 0) {
      produtoOpts.unshift(item.produto);
    }

    var temReceitas = produtoOpts.length > 0;

    var receitaOpts = [{ value: "", label: "— sem receita vinculada —" }].concat(
      receitas.map(function (r) { return { value: r.id, label: r.nome }; })
    );

    var fields = [];
    if (temReceitas) {
      fields.push({ name: "produto", label: "Produto", type: "select", options: produtoOpts, required: true, full: true });
    } else {
      fields.push({ name: "produto", label: "Produto", type: "text", required: true, full: true, placeholder: "Ex.: Gelato de Pistache" });
    }
    fields.push({ name: "receitaId", label: "Receita vinculada (opcional)", type: "select", options: receitaOpts });
    fields.push({ name: "qtdPlanejada", label: "Quantidade planejada", type: "number", step: "0.5", min: "0", required: true });
    fields.push({ name: "unidade", label: "Unidade", type: "text", placeholder: "kg" });
    fields.push({ name: "dataAgendada", label: "Data agendada", type: "date", required: true });
    fields.push({ name: "prazo", label: "Pronto até (prazo)", type: "date" });
    fields.push({
      name: "responsavel", label: "Responsável", type: "select",
      options: [{ value: "", label: "— a definir —" }].concat(operadores.map(function (o) { return { value: o, label: o }; }))
    });
    fields.push({
      name: "status", label: "Status", type: "select",
      options: [
        { value: "agendada", label: "Agendada" },
        { value: "em_producao", label: "Em produção" },
        { value: "concluida", label: "Concluída" }
      ]
    });
    fields.push({ name: "obs", label: "Observações", type: "textarea", full: true, placeholder: "Notas do lote, conferências, etc." });

    var valores = item || {
      unidade: "kg",
      dataAgendada: C.todayISO(),
      prazo: C.daysFromNow(1),
      status: "agendada"
    };

    ui.formModal({
      title: editing ? "Editar produção" : "Agendar produção",
      size: "lg",
      values: valores,
      fields: fields,
      validate: function (v) {
        if (v.qtdPlanejada != null && v.qtdPlanejada <= 0) return "A quantidade planejada deve ser maior que zero.";
        if (v.dataAgendada && v.prazo && C.daysBetween(v.dataAgendada, v.prazo) < 0) return "O prazo não pode ser antes da data agendada.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      // normaliza
      if (!v.unidade) v.unidade = "kg";
      if (!v.status) v.status = "agendada";
      if (editing) {
        C.update("producao", item.id, v);
        ui.toast("Produção atualizada.", "ok");
      } else {
        C.insert("producao", v);
        ui.toast("Produção agendada.", "ok");
      }
      rerender();
    });
  }

  function moverStatus(item, novoStatus, msg) {
    C.update("producao", item.id, { status: novoStatus });
    ui.toast(msg, "ok");
    rerender();
  }

  function excluir(item) {
    ui.confirm("Excluir a produção de \"" + item.produto + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
      if (!ok) return;
      C.remove("producao", item.id);
      ui.toast("Produção excluída.", "ok");
      rerender();
    });
  }

  function metaLinha(label, valor) {
    return h("div", {}, h("span", { class: "lbl", text: label + " " }), valor);
  }

  function card(item) {
    var late = atrasada(item);
    var box = h("div", { class: "prod-card" + (late ? " is-late" : "") });

    box.appendChild(h("div", { class: "prod-card-name", text: item.produto || "(sem nome)" }));

    var meta = h("div", { class: "prod-card-meta" });
    meta.appendChild(h("div", {},
      h("span", { class: "prod-qty", text: fmt.num(item.qtdPlanejada, 2) + " " + (item.unidade || "kg") })
    ));
    if (item.responsavel) meta.appendChild(metaLinha("Responsável:", h("span", { text: item.responsavel })));
    meta.appendChild(metaLinha("Agendada:", h("span", { text: fmt.date(item.dataAgendada) })));

    // prazo (badge danger se atrasada e não concluída)
    var prazoVal;
    if (late) {
      prazoVal = ui.badge(fmt.date(item.prazo) + " — atrasada", "danger");
    } else {
      prazoVal = h("span", { text: fmt.date(item.prazo) });
    }
    meta.appendChild(metaLinha("Pronto até:", prazoVal));
    box.appendChild(meta);

    if (item.obs) box.appendChild(h("div", { class: "prod-card-obs", text: item.obs }));

    // botões de ação
    var foot = h("div", { class: "prod-card-foot" });
    if (item.status === "agendada") {
      var iniciar = ui.button("Iniciar", { variant: "soft", icon: "fire" });
      iniciar.classList.add("btn-sm");
      iniciar.addEventListener("click", function () { moverStatus(item, "em_producao", "Produção iniciada."); });
      foot.appendChild(iniciar);
    } else if (item.status === "em_producao") {
      var concluir = ui.button("Concluir", { variant: "primary", icon: "check" });
      concluir.classList.add("btn-sm");
      concluir.addEventListener("click", function () { moverStatus(item, "concluida", "Produção concluída."); });
      foot.appendChild(concluir);
    }
    foot.appendChild(h("span", { class: "spacer" }));
    foot.appendChild(ui.iconButton("edit", function () { openForm(item); }, "Editar"));
    foot.appendChild(ui.iconButton("trash", function () { excluir(item); }, "Excluir"));
    box.appendChild(foot);

    return box;
  }

  function coluna(def, registros) {
    var lista = registros.filter(function (p) { return p.status === def.status; });
    // ordena por prazo (mais próximo primeiro), atrasadas no topo
    lista.sort(function (a, b) {
      var pa = a.prazo || a.dataAgendada || "9999-12-31";
      var pb = b.prazo || b.dataAgendada || "9999-12-31";
      return pa < pb ? -1 : (pa > pb ? 1 : 0);
    });

    var head = h("div", { class: "prod-col-head" },
      h("div", { class: "prod-col-title" },
        h("span", { class: "prod-col-dot", style: { background: def.cor } }),
        def.titulo
      ),
      ui.badge(fmt.int(lista.length), "neutral")
    );

    var col = h("div", { class: "prod-col" }, head);
    if (!lista.length) {
      col.appendChild(h("div", { class: "prod-col-empty", text: "Nenhuma produção aqui." }));
    } else {
      lista.forEach(function (p) { col.appendChild(card(p)); });
    }
    return col;
  }

  function render(root) {
    ui.clear(root);
    ensureStyles();

    root.appendChild(ui.pageHeader(
      "Produção",
      "Agenda de produção de gelato e sorbet — acompanhe cada lote no quadro.",
      [ui.button("Agendar produção", { icon: "plus", onClick: function () { openForm(null); } })]
    ));

    var registros = C.table("producao");

    // KPIs
    var agendadas = registros.filter(function (p) { return p.status === "agendada"; }).length;
    var emProducao = registros.filter(function (p) { return p.status === "em_producao"; }).length;
    var concluidas = registros.filter(function (p) { return p.status === "concluida"; }).length;
    var atrasadas = registros.filter(atrasada).length;

    root.appendChild(h("div", { class: "grid grid-4 mb-2" },
      ui.kpi({ label: "Agendadas", value: fmt.int(agendadas), icon: "clock", accent: "info" }),
      ui.kpi({ label: "Em produção", value: fmt.int(emProducao), icon: "fire", accent: "warn" }),
      ui.kpi({ label: "Concluídas", value: fmt.int(concluidas), icon: "check", accent: "success" }),
      ui.kpi({ label: "Atrasadas", value: fmt.int(atrasadas), icon: "alert", accent: "danger", foot: atrasadas ? "Prazo vencido sem concluir" : "Tudo em dia" })
    ));

    // quadro kanban
    var board = h("div", { class: "grid grid-3 prod-board" });
    COLUNAS.forEach(function (def) { board.appendChild(coluna(def, registros)); });
    root.appendChild(board);

    if (!registros.length) {
      root.appendChild(h("div", { class: "mt-2" }, ui.empty("Nenhuma produção agendada ainda. Use \"Agendar produção\" para começar.")));
    }
  }

  C.registerModule({ id: "producao", label: "Produção", icon: "producao", order: 7, render: render });
})();
