/* ============================================================
   Módulo: CAIXA  (abertura, sangria/suprimento e FECHAMENTO CEGO)
   - Caixa aberto: operador, abertura, fundo de troco e vendas em dinheiro
     desde a abertura. Sangria, suprimento e fechamento cego.
   - Fechamento cego: pede SÓ o valor contado (sem mostrar o esperado);
     ao confirmar revela Esperado · Contado · Diferença (Sobra/Falta/Exato).
   - Histórico de caixas fechados, com detalhe de sangrias/suprimentos.
   Usado pelos dois papéis (gestor e caixa).
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  function root() { return document.getElementById("content"); }
  function rerender() { render(root()); }

  // vendas em dinheiro desde a abertura da sessão
  function vendasDinheiroDesde(sessao) {
    var desde = new Date(sessao.abertura);
    return C.table("vendas").filter(function (v) {
      return v.formaPagamento === "Dinheiro" && new Date(v.datetime) >= desde;
    }).reduce(function (s, v) { return s + v.total; }, 0);
  }

  function somaSangrias(sessao) { return (sessao.sangrias || []).reduce(function (s, x) { return s + x.valor; }, 0); }
  function somaSuprimentos(sessao) { return (sessao.suprimentos || []).reduce(function (s, x) { return s + x.valor; }, 0); }

  function badgeDiferenca(dif) {
    if (dif > 0) return ui.badge("Sobra " + fmt.money(dif), "info");
    if (dif < 0) return ui.badge("Falta " + fmt.money(-dif), "danger");
    return ui.badge("Exato", "ok");
  }

  /* ---------- ABERTURA ---------- */

  function abrirCaixa() {
    var ops = (C.get().config.operadores || []).slice();
    if (!ops.length) { ui.toast("Cadastre operadores na configuração.", "warn"); return; }
    var atual = C.currentUser();
    ui.formModal({
      title: "Abrir caixa",
      size: "sm",
      values: { operador: (atual && ops.indexOf(atual.nome) >= 0) ? atual.nome : ops[0], fundoTroco: 0 },
      fields: [
        { name: "operador", label: "Operador", type: "select", options: ops, required: true, full: true },
        { name: "fundoTroco", label: "Fundo de troco", type: "money", prefix: "R$", min: 0, full: true, help: "Valor em dinheiro deixado no caixa para troco." }
      ]
    }).then(function (v) {
      if (!v) return;
      C.abrirCaixa({ operador: v.operador, fundoTroco: v.fundoTroco });
      ui.toast("Caixa aberto.", "ok");
      rerender();
    });
  }

  /* ---------- SANGRIA / SUPRIMENTO ---------- */

  function lancarMovimento(sessao, tipo) {
    var ehSangria = tipo === "sangria";
    ui.formModal({
      title: ehSangria ? "Sangria (retirada)" : "Suprimento (reforço)",
      size: "sm",
      fields: [
        { name: "valor", label: "Valor", type: "money", prefix: "R$", min: 0, required: true, full: true },
        { name: "motivo", label: "Motivo", type: "text", full: true, placeholder: ehSangria ? "Ex.: Retirada de segurança" : "Ex.: Reforço de troco" }
      ],
      validate: function (vals) {
        if (!(Number(vals.valor) > 0)) return "Informe um valor maior que zero.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      if (ehSangria) { C.registrarSangria(sessao.id, v.valor, v.motivo); ui.toast("Sangria registrada.", "ok"); }
      else { C.registrarSuprimento(sessao.id, v.valor, v.motivo); ui.toast("Suprimento registrado.", "ok"); }
      rerender();
    });
  }

  /* ---------- FECHAMENTO CEGO ---------- */

  function fecharCaixaCego(sessao) {
    ui.formModal({
      title: "Fechar caixa (cego)",
      size: "sm",
      fields: [
        { name: "contado", label: "Valor contado na gaveta", type: "money", prefix: "R$", min: 0, required: true, full: true, help: "Conte o dinheiro e informe o total. O esperado só aparece depois." }
      ],
      validate: function (vals) {
        if (vals.contado == null || Number(vals.contado) < 0) return "Informe o valor contado.";
        return null;
      },
      submitLabel: "Fechar e conferir"
    }).then(function (v) {
      if (!v) return;
      var fechada = C.fecharCaixa(sessao.id, v.contado);
      if (fechada) { ui.toast("Caixa fechado.", "ok"); mostrarResultado(fechada); rerender(); }
    });
  }

  // modal de resultado revelado após o fechamento cego
  function mostrarResultado(sessao) {
    var body = h("div", {});

    var breakdown = h("div", { class: "cost-breakdown" },
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Esperado" }), h("div", { class: "cb-val", text: fmt.money(sessao.esperado) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Contado" }), h("div", { class: "cb-val", text: fmt.money(sessao.contado) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Diferença" }),
        h("div", { class: "cb-val" }, badgeDiferenca(sessao.diferenca)))
    );
    body.appendChild(breakdown);

    body.appendChild(detalheMovimentos(sessao));

    var ok = ui.button("Concluir", { variant: "primary" });
    var m = ui.modal({ title: "Conferência do caixa", body: body, actions: [ok], size: "md" });
    ok.addEventListener("click", function () { m.close(); });
  }

  // bloco com a composição do esperado + sangrias e suprimentos da sessão
  function detalheMovimentos(sessao) {
    var box = h("div", { style: { marginTop: "16px" } });

    box.appendChild(h("div", { class: "list-row" },
      h("span", { class: "small muted", text: "Fundo de troco" }),
      h("span", { class: "cell-strong", text: fmt.money(sessao.fundoTroco) })));
    box.appendChild(h("div", { class: "list-row" },
      h("span", { class: "small muted", text: "Vendas em dinheiro" }),
      h("span", { class: "cell-strong", text: fmt.money(sessao.vendasDinheiro) })));

    var sangrias = sessao.sangrias || [];
    var suprimentos = sessao.suprimentos || [];

    box.appendChild(h("div", { class: "list-row" },
      h("span", { class: "small muted", text: "Sangrias (" + sangrias.length + ")" }),
      h("span", { class: "cell-strong text-warn", text: sangrias.length ? "− " + fmt.money(somaSangrias(sessao)) : "—" })));
    sangrias.forEach(function (s) {
      box.appendChild(h("div", { class: "list-row", style: { paddingLeft: "10px" } },
        h("span", { class: "small muted", text: (s.hora ? s.hora + " · " : "") + (s.motivo || "Sangria") }),
        h("span", { class: "small", text: "− " + fmt.money(s.valor) })));
    });

    box.appendChild(h("div", { class: "list-row" },
      h("span", { class: "small muted", text: "Suprimentos (" + suprimentos.length + ")" }),
      h("span", { class: "cell-strong", text: suprimentos.length ? "+ " + fmt.money(somaSuprimentos(sessao)) : "—" })));
    suprimentos.forEach(function (s) {
      box.appendChild(h("div", { class: "list-row", style: { paddingLeft: "10px" } },
        h("span", { class: "small muted", text: (s.hora ? s.hora + " · " : "") + (s.motivo || "Suprimento") }),
        h("span", { class: "small", text: "+ " + fmt.money(s.valor) })));
    });

    return box;
  }

  /* ---------- CAIXA ABERTO ---------- */

  function cardCaixaAberto(sessao) {
    var vendasDin = Math.round(vendasDinheiroDesde(sessao) * 100) / 100;

    var corpo = h("div", {});
    corpo.appendChild(h("div", { class: "grid grid-3 mb-2" },
      ui.kpi({ label: "Operador", value: sessao.operador, icon: "user", accent: "accent", foot: "Aberto às " + fmt.datetime(sessao.abertura) }),
      ui.kpi({ label: "Fundo de troco", value: fmt.money(sessao.fundoTroco), icon: "money", accent: "info" }),
      ui.kpi({ label: "Vendas em dinheiro", value: fmt.money(vendasDin), icon: "caixa", accent: "success", foot: "Desde a abertura" })
    ));

    var sangrias = sessao.sangrias || [];
    var suprimentos = sessao.suprimentos || [];
    if (sangrias.length || suprimentos.length) {
      var mov = h("div", { class: "stack mb-2" });
      sangrias.forEach(function (s) {
        mov.appendChild(h("div", { class: "list-row" },
          h("span", {}, ui.badge("Sangria", "warn"), " ", h("span", { class: "small muted", text: (s.hora ? s.hora + " · " : "") + (s.motivo || "—") })),
          h("span", { class: "cell-strong text-warn", text: "− " + fmt.money(s.valor) })));
      });
      suprimentos.forEach(function (s) {
        mov.appendChild(h("div", { class: "list-row" },
          h("span", {}, ui.badge("Suprimento", "info"), " ", h("span", { class: "small muted", text: (s.hora ? s.hora + " · " : "") + (s.motivo || "—") })),
          h("span", { class: "cell-strong", text: "+ " + fmt.money(s.valor) })));
      });
      corpo.appendChild(mov);
    }

    var acoes = h("div", { class: "flex", style: { gap: "10px", flexWrap: "wrap" } },
      ui.button("Sangria", { variant: "soft", icon: "arrowDown", onClick: function () { lancarMovimento(sessao, "sangria"); } }),
      ui.button("Suprimento", { variant: "soft", icon: "arrowUp", onClick: function () { lancarMovimento(sessao, "suprimento"); } }),
      ui.button("Fechar caixa (cego)", { variant: "danger", icon: "check", onClick: function () { fecharCaixaCego(sessao); } })
    );
    corpo.appendChild(acoes);

    return ui.card("Caixa aberto", corpo);
  }

  /* ---------- CAIXA FECHADO (sem sessão aberta) ---------- */

  function cardAbrir() {
    var corpo = h("div", { style: { textAlign: "center", padding: "12px 0" } });
    corpo.appendChild(h("p", { class: "muted mb-2", text: "Nenhum caixa aberto no momento. Abra o caixa para começar o turno." }));
    var btn = ui.button("Abrir caixa", { variant: "primary", icon: "plus", onClick: abrirCaixa });
    btn.style.padding = "12px 24px";
    corpo.appendChild(btn);
    return ui.card(null, corpo);
  }

  /* ---------- HISTÓRICO ---------- */

  function verDetalhe(sessao) {
    var body = h("div", {});
    body.appendChild(h("div", { class: "cost-breakdown" },
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Esperado" }), h("div", { class: "cb-val", text: fmt.money(sessao.esperado) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Contado" }), h("div", { class: "cb-val", text: fmt.money(sessao.contado) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Diferença" }), h("div", { class: "cb-val" }, badgeDiferenca(sessao.diferenca)))
    ));
    body.appendChild(h("p", { class: "small muted mt-2", text: sessao.operador + " · aberto " + fmt.datetime(sessao.abertura) + " · fechado " + fmt.datetime(sessao.fechamento) }));
    body.appendChild(detalheMovimentos(sessao));
    var ok = ui.button("Fechar", { variant: "ghost" });
    var m = ui.modal({ title: "Caixa de " + sessao.operador + " — " + fmt.date(sessao.abertura), body: body, actions: [ok], size: "md" });
    ok.addEventListener("click", function () { m.close(); });
  }

  function cardHistorico() {
    var fechados = C.table("caixaSessions").filter(function (c) { return c.status === "fechado"; })
      .slice().sort(function (a, b) { return new Date(b.fechamento) - new Date(a.fechamento); });

    var cols = [
      { key: "operador", label: "Operador", render: function (c) { return h("span", { class: "cell-strong", text: c.operador }); } },
      { key: "abertura", label: "Abertura", render: function (c) { return fmt.date(c.abertura); } },
      { key: "fechamento", label: "Fechamento", render: function (c) { return fmt.time(c.fechamento); } },
      { key: "fundoTroco", label: "Fundo", align: "right", render: function (c) { return fmt.money(c.fundoTroco); } },
      { key: "vendasDinheiro", label: "Vendas dinheiro", align: "right", render: function (c) { return fmt.money(c.vendasDinheiro); } },
      { key: "sangrias", label: "Sangrias", align: "right", render: function (c) { var s = somaSangrias(c); return s ? '<span class="text-warn">− ' + fmt.money(s) + "</span>" : "—"; } },
      { key: "esperado", label: "Esperado", align: "right", render: function (c) { return fmt.money(c.esperado); } },
      { key: "contado", label: "Contado", align: "right", render: function (c) { return h("span", { class: "cell-strong", text: fmt.money(c.contado) }); } },
      { key: "diferenca", label: "Diferença", align: "right", render: function (c) { return badgeDiferenca(c.diferenca); } }
    ];

    var tableHost = h("div", {});
    tableHost.appendChild(ui.table(cols, fechados, {
      emptyMsg: "Nenhum caixa fechado ainda.",
      dense: true,
      actions: function (c) {
        return [ui.button("Ver", { variant: "ghost", onClick: function () { verDetalhe(c); } })];
      }
    }));

    return ui.card("Histórico de caixas", tableHost, { class: "card-body" });
  }

  /* ---------- RENDER PRINCIPAL ---------- */

  function render(rootEl) {
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader("Caixa", "Abertura, sangria/suprimento e fechamento cego do caixa.", []));

    var aberto = C.caixaAberto();
    var topo = h("div", { class: "mb-2" });
    topo.appendChild(aberto ? cardCaixaAberto(aberto) : cardAbrir());
    rootEl.appendChild(topo);

    rootEl.appendChild(cardHistorico());
  }

  C.registerModule({ id: "caixa", label: "Caixa", icon: "caixa", order: 2.5, roles: ["gestor", "caixa"], render: render });
})();
