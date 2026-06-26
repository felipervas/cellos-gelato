/* ============================================================
   Módulo: PRODUÇÃO  (agenda de gelato/sorbet — fácil para o operador)
   - Agendar é simples: escolhe a RECEITA, a data e o responsável (sem quantidade).
   - Cada cartão tem "Ver receita" (ingredientes + modo de preparo) para o operador seguir.
   - Concluir registra QUEM finalizou e QUANDO, e o lote vai para o HISTÓRICO.
   - Excluir não apaga de vez: vai para a lixeira do histórico (quem excluiu/quando) e dá para restaurar.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  var state = { aba: "quadro" };
  function root() { return document.getElementById("content"); }
  function operadores() { return (C.get().config.operadores || []).slice(); }
  function receitaDe(p) { return C.find("receitas", p.receitaId); }
  function ehAtrasada(p) { return (p.status === "agendada" || p.status === "em_producao") && p.prazo && C.daysBetween(C.todayISO(), p.prazo) < 0; }

  function ensureStyles() {
    if (document.getElementById("producao-styles")) return;
    var css = ""
      + ".prod-board{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}"
      + ".prod-col{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:12px;min-height:120px}"
      + ".prod-col-head{display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-2)}"
      + ".prod-col-dot{width:9px;height:9px;border-radius:50%;flex:none}"
      + ".prod-col-count{margin-left:auto;background:var(--surface);border:1px solid var(--line);border-radius:20px;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.72rem;color:var(--muted)}"
      + ".prod-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);box-shadow:var(--shadow-sm);padding:14px;display:flex;flex-direction:column;gap:7px}"
      + ".prod-card.is-late{border-color:var(--danger);box-shadow:0 0 0 1px var(--danger-soft)}"
      + ".prod-card-name{font-family:var(--serif);font-weight:600;font-size:1.15rem;color:var(--ink);line-height:1.2}"
      + ".prod-card-acts{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding-top:10px;border-top:1px solid var(--line)}"
      + ".prod-empty{color:var(--muted);font-style:italic;font-size:.86rem;padding:18px 6px;text-align:center}";
    var s = document.createElement("style"); s.id = "producao-styles"; s.textContent = css; document.head.appendChild(s);
  }

  /* ---------- VER RECEITA (operador-friendly: ingredientes + preparo, sem custo) ---------- */
  function verReceita(p) {
    var r = receitaDe(p);
    if (!r) { ui.toast("Receita não encontrada para esta produção.", "warn"); return; }
    var body = h("div", {});
    body.appendChild(h("div", { class: "small muted mb-2", text: "Rende " + fmt.num(r.rendimento, 1) + " " + (r.rendimentoUnidade || "") + " · cerca de " + fmt.int(r.rendimentoBolas) + " bolas" }));
    var cols = [
      { key: "nome", label: "Ingrediente", render: function (i) { return h("span", { class: "cell-strong", text: i.tipo === "insumo" ? ((C.find("itens", i.itemId) || {}).nome || "—") : (i.nome || "—") }); } },
      { key: "qtd", label: "Quantidade", align: "right", render: function (i) { return fmt.num(i.qtd, 3) + " " + (i.unidade || ""); } }
    ];
    body.appendChild(ui.table(cols, r.ingredientes || [], { dense: true, emptyMsg: "Sem ingredientes cadastrados." }));
    if (r.modoPreparo) {
      body.appendChild(h("h4", { class: "mt-3", style: { fontFamily: "var(--serif)", marginBottom: "6px" }, text: "Modo de preparo" }));
      body.appendChild(h("p", { style: { whiteSpace: "pre-wrap", color: "var(--ink-2)", lineHeight: "1.75", fontSize: ".95rem" }, text: r.modoPreparo }));
    }
    if (r.obs) { body.appendChild(h("p", { class: "small muted mt-2", style: { whiteSpace: "pre-wrap" }, text: "Observações da receita: " + r.obs })); }
    if (p.obs) { body.appendChild(h("div", { class: "alert-banner", style: { marginTop: "14px", marginBottom: "0" } }, h("span", { class: "ab-ic", html: C.icon("alert", 18) }), h("div", { class: "ab-txt small", text: "Nota da produção: " + p.obs }))); }
    ui.modal({ title: "Receita · " + r.nome, body: body, size: "md" });
  }

  /* ---------- Agendar / Editar ---------- */
  function openForm(p) {
    var editing = !!p;
    var receitas = C.table("receitas");
    if (!receitas.length) { ui.toast("Cadastre uma receita antes de agendar a produção.", "warn"); return; }
    ui.formModal({
      title: editing ? "Editar produção" : "Agendar produção", size: "md",
      values: p || { dataAgendada: C.todayISO(), prazo: C.daysFromNow(1), responsavel: operadores()[0] || "" },
      fields: [
        { name: "receitaId", label: "Receita a produzir", type: "select", options: receitas.map(function (r) { return { value: r.id, label: r.nome }; }), required: true, full: true },
        { name: "dataAgendada", label: "Agendar para", type: "date" },
        { name: "prazo", label: "Pronto até", type: "date" },
        { name: "responsavel", label: "Responsável", type: "select", options: operadores() },
        { name: "obs", label: "Observações (opcional)", type: "textarea", rows: 2, full: true, placeholder: "Ex.: reposição da câmara, lote dobrado..." }
      ]
    }).then(function (v) {
      if (!v) return;
      var r = C.find("receitas", v.receitaId);
      var patch = { receitaId: v.receitaId, produto: r ? r.nome : "", dataAgendada: v.dataAgendada || C.todayISO(), prazo: v.prazo || null, responsavel: v.responsavel, obs: v.obs || "" };
      if (editing) { C.update("producao", p.id, patch); ui.toast("Produção atualizada.", "ok"); }
      else { patch.status = "agendada"; patch.criadoEm = C.nowISO(); C.insert("producao", patch); ui.toast("Produção agendada.", "ok"); }
      render(root());
    });
  }

  /* ---------- Ações de fluxo ---------- */
  function iniciar(p) {
    var quem = (C.currentUser() || {}).nome || p.responsavel || "—";
    C.update("producao", p.id, { status: "em_producao", iniciadoPor: quem, iniciadoEm: C.nowISO() });
    ui.toast("Produção iniciada.", "ok"); render(root());
  }
  function concluir(p) {
    var sel = h("select", { style: { width: "100%", padding: "9px 11px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit" } });
    operadores().forEach(function (o) { var op = h("option", { value: o, text: o }); if (o === p.responsavel) op.selected = true; sel.appendChild(op); });
    var body = h("div", {}, h("p", { class: "small muted mb-2", text: "Confirma que a produção de “" + p.produto + "” foi concluída? Ela vai para o histórico." }), h("label", { class: "small muted", text: "Quem finalizou?" }), sel);
    var ok = ui.button("Concluir", { variant: "primary", icon: "check" });
    var cancel = ui.button("Cancelar", { variant: "ghost" });
    var m = ui.modal({ title: "Concluir produção", body: body, actions: [cancel, ok], size: "sm" });
    cancel.addEventListener("click", function () { m.close(); });
    ok.addEventListener("click", function () { C.update("producao", p.id, { status: "concluida", concluidoPor: sel.value, concluidoEm: C.nowISO() }); m.close(); ui.toast("Produção concluída e enviada ao histórico.", "ok"); render(root()); });
  }
  function excluir(p) {
    ui.confirm("Excluir a produção de “" + p.produto + "”? Ela vai para a lixeira do histórico (com quem excluiu) e pode ser restaurada.", { danger: true, okLabel: "Excluir" }).then(function (okc) {
      if (!okc) return;
      var quem = (C.currentUser() || {}).nome || "—";
      C.update("producao", p.id, { status: "excluida", excluidoPor: quem, excluidoEm: C.nowISO(), statusAnterior: p.status });
      ui.toast("Produção movida para a lixeira do histórico.", "ok"); render(root());
    });
  }
  function restaurar(p) {
    C.update("producao", p.id, { status: p.statusAnterior || "agendada", excluidoPor: null, excluidoEm: null });
    ui.toast("Produção restaurada para o quadro.", "ok"); render(root());
  }

  /* ---------- Cartão do quadro ---------- */
  function card(p) {
    var r = receitaDe(p), atrasada = ehAtrasada(p);
    var el = h("div", { class: "prod-card" + (atrasada ? " is-late" : "") });
    el.appendChild(h("div", { class: "prod-card-name", text: p.produto }));
    if (r) el.appendChild(h("div", { class: "small muted", text: "Rende ~" + fmt.num(r.rendimento, 1) + " " + (r.rendimentoUnidade || "") }));
    el.appendChild(h("div", { class: "small muted", text: "Responsável: " + (p.responsavel || "—") }));
    el.appendChild(h("div", { class: "small muted" }, "Pronto até: ", atrasada ? ui.badge(fmt.date(p.prazo) + " · atrasada", "danger") : h("b", { text: fmt.date(p.prazo) })));
    if (p.obs) el.appendChild(h("p", { class: "small", style: { fontStyle: "italic", color: "var(--muted)" }, text: p.obs }));

    var ver = ui.button("Ver receita", { variant: "soft", icon: "receitas", onClick: function () { verReceita(p); } }); ver.classList.add("btn-sm");
    var right = h("div", { class: "flex", style: { gap: "6px", alignItems: "center" } });
    if (p.status === "agendada") { var ib = ui.button("Iniciar", { variant: "primary", icon: "fire", onClick: function () { iniciar(p); } }); ib.classList.add("btn-sm"); right.appendChild(ib); }
    if (p.status === "em_producao") { var cb = ui.button("Concluir", { variant: "primary", icon: "check", onClick: function () { concluir(p); } }); cb.classList.add("btn-sm"); right.appendChild(cb); }
    right.appendChild(ui.iconButton("edit", function () { openForm(p); }, "Editar"));
    right.appendChild(ui.iconButton("trash", function () { excluir(p); }, "Excluir"));
    el.appendChild(h("div", { class: "prod-card-acts" }, ver, right));
    return el;
  }

  function coluna(titulo, cor, lista) {
    var col = h("div", { class: "prod-col" },
      h("div", { class: "prod-col-head" }, h("span", { class: "prod-col-dot", style: { background: cor } }), titulo, h("span", { class: "prod-col-count", text: lista.length })));
    if (!lista.length) col.appendChild(h("div", { class: "prod-empty", text: "Nada por aqui." }));
    lista.forEach(function (p) { col.appendChild(card(p)); });
    return col;
  }

  /* ---------- KPIs ---------- */
  function renderKpis(host) {
    var prod = C.table("producao");
    var ag = prod.filter(function (p) { return p.status === "agendada"; });
    var emp = prod.filter(function (p) { return p.status === "em_producao"; });
    var conc = prod.filter(function (p) { return p.status === "concluida"; });
    var atras = prod.filter(ehAtrasada);
    host.appendChild(h("div", { class: "grid grid-4 mb-2" },
      ui.kpi({ label: "Agendadas", value: fmt.int(ag.length), icon: "clock", accent: "accent" }),
      ui.kpi({ label: "Em produção", value: fmt.int(emp.length), icon: "fire", accent: "warn" }),
      ui.kpi({ label: "Concluídas", value: fmt.int(conc.length), icon: "check", accent: "success" }),
      ui.kpi({ label: "Atrasadas", value: fmt.int(atras.length), icon: "alert", accent: atras.length ? "danger" : "success", foot: atras.length ? "Passou do prazo" : "Tudo em dia" })
    ));
  }

  /* ---------- Histórico ---------- */
  function renderHistorico(host) {
    var prod = C.table("producao");
    var concluidas = prod.filter(function (p) { return p.status === "concluida"; }).sort(function (a, b) { return new Date(b.concluidoEm || b.prazo) - new Date(a.concluidoEm || a.prazo); });
    var excluidas = prod.filter(function (p) { return p.status === "excluida"; }).sort(function (a, b) { return new Date(b.excluidoEm || 0) - new Date(a.excluidoEm || 0); });

    var colsConc = [
      { key: "produto", label: "Receita", render: function (p) { return h("span", { class: "cell-strong", text: p.produto }); } },
      { key: "responsavel", label: "Responsável", render: function (p) { return p.responsavel || "—"; } },
      { key: "concluidoPor", label: "Quem finalizou", render: function (p) { return h("span", { class: "cell-strong", text: p.concluidoPor || p.responsavel || "—" }); } },
      { key: "dataAgendada", label: "Agendada", render: function (p) { return fmt.date(p.dataAgendada); } },
      { key: "concluidoEm", label: "Concluída em", render: function (p) { return p.concluidoEm ? fmt.datetime(p.concluidoEm) : fmt.date(p.prazo); } }
    ];
    host.appendChild(ui.card("Concluídas — " + concluidas.length + " lote(s)",
      ui.table(colsConc, concluidas, { dense: true, emptyMsg: "Nenhuma produção concluída ainda.", actions: function (p) { return [ui.iconButton("receitas", function () { verReceita(p); }, "Ver receita")]; } })));

    var colsExc = [
      { key: "produto", label: "Receita", render: function (p) { return h("span", { class: "cell-strong", text: p.produto }); } },
      { key: "excluidoPor", label: "Quem excluiu", render: function (p) { return h("span", { class: "text-danger", text: p.excluidoPor || "—" }); } },
      { key: "excluidoEm", label: "Excluída em", render: function (p) { return p.excluidoEm ? fmt.datetime(p.excluidoEm) : "—"; } },
      { key: "obs", label: "Motivo / nota", render: function (p) { return p.obs || '<span class="cell-muted">—</span>'; } }
    ];
    var cardExc = ui.card("Lixeira — " + excluidas.length + " excluída(s)",
      ui.table(colsExc, excluidas, { dense: true, emptyMsg: "Nada na lixeira.", actions: function (p) { var b = ui.button("Restaurar", { variant: "ghost", onClick: function () { restaurar(p); } }); b.classList.add("btn-sm"); return [b]; } }));
    cardExc.style.marginTop = "16px";
    host.appendChild(cardExc);
  }

  /* ---------- RENDER ---------- */
  function render(rootEl) {
    ensureStyles();
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader("Produção", "Agenda de gelato e sorbet — receita à mão para o operador.",
      [ui.button("Agendar produção", { icon: "plus", onClick: function () { openForm(null); } })]));

    renderKpis(rootEl);

    var abas = [{ id: "quadro", label: "Quadro" }, { id: "historico", label: "Histórico" }];
    var chips = h("div", { class: "chips mb-2" });
    abas.forEach(function (a) {
      var chip = h("button", { class: "chip" + (state.aba === a.id ? " active" : ""), type: "button", text: a.label });
      chip.addEventListener("click", function () { state.aba = a.id; render(root()); });
      chips.appendChild(chip);
    });
    rootEl.appendChild(chips);

    var host = h("div", {});
    rootEl.appendChild(host);
    if (state.aba === "historico") { renderHistorico(host); return; }

    var prod = C.table("producao");
    host.appendChild(h("div", { class: "prod-board" },
      coluna("Agendada", "var(--accent)", prod.filter(function (p) { return p.status === "agendada"; })),
      coluna("Em produção", "var(--warn)", prod.filter(function (p) { return p.status === "em_producao"; }))
    ));
  }

  C.registerModule({ id: "producao", label: "Produção", icon: "producao", order: 7, render: render });
})();
