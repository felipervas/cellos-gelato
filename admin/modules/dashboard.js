/* ============================================================
   Módulo: DASHBOARD  (visão executiva — KPIs, vendas, sazonalidade,
   categorias, ranking, alertas e operação do dia)
   Módulo só-gestor (financeiro): roles ['gestor'] — não precisa de
   checagem RBAC interna, pois o caixa nunca chega aqui.
   Segue o padrão de modules/pdv.js e modules/limpeza.js e a API
   window.Cellos (core.js).
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // paleta para gráficos/categorias (variáveis CSS do design system)
  var PALETA = [
    "var(--accent)", "var(--accent-2)", "var(--info)", "var(--warn)",
    "var(--danger)", "var(--ok)", "var(--ink-2)", "var(--muted)"
  ];

  // helper: monta o html de um delta percentual com seta e direção (trata zero)
  function deltaInfo(atual, anterior) {
    if (!anterior) return { html: null, dir: "up" };
    var variacao = (atual - anterior) / anterior * 100;
    var dir = variacao >= 0 ? "up" : "down";
    var seta = variacao >= 0 ? "arrowUp" : "arrowDown";
    var txt = C.icon(seta, 13) + fmt.pct(Math.abs(variacao)) + " vs. 30d anteriores";
    return { html: txt, dir: dir };
  }

  // injeta o delta (com seta SVG via html) num KPI já criado
  function aplicaDelta(kpiEl, info) {
    if (!info || !info.html) return;
    var d = h("div", { class: "kpi-delta " + (info.dir === "down" ? "down" : "up"), html: info.html });
    var foot = kpiEl.querySelector(".kpi-foot");
    if (foot) kpiEl.insertBefore(d, foot);
    else kpiEl.appendChild(d);
  }

  // bloco de estilos próprios do dashboard (usa apenas variáveis do design system)
  function injectStyles() {
    if (document.getElementById("db-styles")) return;
    var css =
      ".db-bar-row{margin-bottom:11px}" +
      ".db-bar-row:last-child{margin-bottom:0}" +
      ".db-bar-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:5px}" +
      ".db-bar-name{font-size:.85rem;color:var(--ink);font-weight:550;display:flex;align-items:center;min-width:0}" +
      ".db-bar-name .db-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".db-bar-val{font-size:.8rem;color:var(--muted);font-weight:600;flex:none;white-space:nowrap}" +
      ".db-rank{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:.72rem;font-weight:700;margin-right:8px;flex:none}" +
      ".db-insight{display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);font-size:.86rem;color:var(--ink-2);line-height:1.5}" +
      ".db-insight .db-ic{color:var(--accent);flex:none;margin-top:1px}" +
      ".db-insight strong{color:var(--ink);font-weight:680}" +
      ".db-alert-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}" +
      ".db-alert-row:last-child{border-bottom:none}" +
      ".db-alert-info{display:flex;flex-direction:column;gap:2px;min-width:0}" +
      ".db-alert-name{font-weight:550;color:var(--ink);font-size:.88rem}" +
      ".db-alert-sub{font-size:.76rem;color:var(--muted)}" +
      ".db-donut-wrap{display:flex;align-items:center;gap:20px;flex-wrap:wrap}" +
      ".db-op-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}" +
      ".db-op-cell{text-align:center;padding:14px 10px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm)}" +
      ".db-op-num{font-family:var(--serif);font-size:1.8rem;font-weight:680;line-height:1}" +
      ".db-op-label{font-size:.78rem;color:var(--muted);margin-top:6px}" +
      ".db-pos{display:flex;align-items:center;gap:9px;color:var(--ok);font-weight:550;font-size:.9rem;padding:6px 0}" +
      "@media(max-width:560px){.db-op-grid{grid-template-columns:1fr}}";
    document.head.appendChild(h("style", { id: "db-styles", html: css }));
  }

  /* ============================================================
     RENDER PRINCIPAL
     ============================================================ */
  function render(root) {
    ui.clear(root);
    injectStyles();

    root.appendChild(ui.pageHeader(
      "Dashboard",
      "Visão executiva da gelateria — vendas, lucro, sazonalidade, estoque e operação.",
      [ui.button("Ir ao caixa (PDV)", { variant: "soft", icon: "pdv", onClick: function () { C.navigate("pdv"); } })]
    ));

    /* ---------------- Linha de KPIs (grid-4): comercial ---------------- */
    var fatHoje = faturamentoHoje();

    var fat30 = C.analytics.faturamento(30);
    var fat60 = C.analytics.faturamento(60);
    var fatAnterior = fat60 - fat30;            // 30 dias anteriores aos últimos 30

    var qtd30 = C.analytics.qtdVendas(30);
    var qtd60 = C.analytics.qtdVendas(60);
    var qtdAnterior = qtd60 - qtd30;

    var ticket = C.analytics.ticketMedio(30);
    var ticketAnt = qtdAnterior > 0 ? fatAnterior / qtdAnterior : 0;

    var kHoje = ui.kpi({ label: "Faturamento hoje", value: fmt.money(fatHoje), icon: "money", accent: "accent", foot: "Vendas registradas até agora" });
    var kFat = ui.kpi({ label: "Faturamento 30 dias", value: fmt.money(fat30), icon: "pdv", accent: "accent", foot: "Últimos 30 dias" });
    var kTicket = ui.kpi({ label: "Ticket médio (30d)", value: fmt.money(ticket), icon: "money", accent: "info", foot: fmt.int(qtd30) + " vendas no período" });
    var kQtd = ui.kpi({ label: "Nº de vendas (30d)", value: fmt.int(qtd30), icon: "pdv", accent: "info", foot: "Pedidos nos últimos 30 dias" });

    aplicaDelta(kFat, deltaInfo(fat30, fatAnterior));
    aplicaDelta(kTicket, deltaInfo(ticket, ticketAnt));
    aplicaDelta(kQtd, deltaInfo(qtd30, qtdAnterior));

    root.appendChild(h("div", { class: "grid grid-4 mb-2" }, kHoje, kFat, kTicket, kQtd));

    /* ---------------- Linha de KPIs (grid-4): financeiro/operacional ---------------- */
    var lucro30 = C.analytics.lucro(30);
    var lucroAnterior = C.analytics.lucro(60) - lucro30;
    var margem = C.analytics.margemMedia(30);
    var caixa = C.analytics.caixaDinheiroHoje();   // {entrou, troco, liquido, vendas}

    var kLucro = ui.kpi({ label: "Lucro 30 dias", value: fmt.money(lucro30), icon: "money", accent: "success", foot: "Margem bruta acumulada" });
    aplicaDelta(kLucro, deltaInfo(lucro30, lucroAnterior));

    var kMargem = ui.kpi({ label: "Margem média (30d)", value: fmt.pct(margem), icon: "money", accent: "success", foot: "Lucro sobre faturamento" });
    var kEstoque = ui.kpi({ label: "Valor parado em estoque", value: fmt.money(C.analytics.valorEstoque()), icon: "box", accent: "warn", foot: fmt.int(C.table("itens").length) + " itens controlados" });
    var kCaixa = ui.kpi({
      label: "Caixa em dinheiro hoje",
      value: fmt.money(caixa.liquido),
      icon: "money",
      accent: "info",
      foot: "Entrou " + fmt.money(caixa.entrou) + " · troco " + fmt.money(caixa.troco) + " · " + fmt.int(caixa.vendas) + " venda(s)"
    });

    root.appendChild(h("div", { class: "grid grid-4 mb-2" }, kLucro, kMargem, kEstoque, kCaixa));

    /* ---------------- Vendas por dia (linha) ---------------- */
    var serieDia = C.analytics.vendasPorDia(30).map(function (d) {
      return { label: fmt.date(d.date).slice(0, 5), value: d.total };
    });
    root.appendChild(ui.card("Vendas por dia (últimos 30 dias)", ui.lineChart(serieDia, { labels: true, height: 200 }), { class: "mb-2" }));

    /* ---------------- Sazonalidade + categorias ---------------- */
    var col2 = h("div", { class: "grid grid-2 mb-2" });
    col2.appendChild(ui.card("Sazonalidade — vendas por mês", blocoSazonalidade()));
    col2.appendChild(ui.card("Vendas por categoria (30 dias)", blocoCategorias()));
    root.appendChild(col2);

    /* ---------------- Mais vendidos x saída mais fraca ---------------- */
    var col3 = h("div", { class: "grid grid-2 mb-2" });
    col3.appendChild(ui.card("Mais vendidos (30 dias)", blocoRanking(C.analytics.topProdutos(30, 5), false)));
    col3.appendChild(ui.card("Saída mais fraca (30 dias)", blocoRanking(C.analytics.bottomProdutos(30, 5), true)));
    root.appendChild(col3);

    /* ---------------- Alertas + Operação hoje ---------------- */
    var col4 = h("div", { class: "grid grid-2 mb-2" });
    col4.appendChild(ui.card("Alertas", blocoAlertas(), { action: badgeAlertas() }));
    col4.appendChild(ui.card("Operação hoje", blocoOperacao()));
    root.appendChild(col4);
  }

  /* ============================================================
     AUXILIARES
     ============================================================ */

  // faturamento de hoje: soma das vendas cuja data (YYYY-MM-DD) é a de hoje.
  // calculado por data exata para não depender da janela relativa de faturamento(0).
  function faturamentoHoje() {
    var hoje = C.todayISO();
    return C.table("vendas").filter(function (v) {
      return v.datetime.slice(0, 10) === hoje;
    }).reduce(function (s, v) { return s + v.total; }, 0);
  }

  /* ---------- Sazonalidade (barras + insight verão x inverno) ---------- */
  function blocoSazonalidade() {
    var meses = C.analytics.vendasPorMes(); // [{mes,label,total}]
    var wrap = h("div", {});

    if (!meses.length) {
      wrap.appendChild(ui.empty("Ainda não há vendas registradas."));
      return wrap;
    }

    var barras = meses.map(function (m, i) {
      return { label: m.label, value: m.total, color: PALETA[i % PALETA.length] };
    });
    wrap.appendChild(ui.barChart(barras, { height: 200, fmt: function (v) { return fmt.money(v); } }));

    // média por índice de mês (0-11) para o comparativo verão x inverno
    var porIndice = {};
    meses.forEach(function (m) {
      var idx = parseInt(m.mes.slice(5, 7), 10) - 1;
      (porIndice[idx] = porIndice[idx] || []).push(m.total);
    });
    function mediaDe(indices) {
      var soma = 0, n = 0;
      indices.forEach(function (idx) {
        (porIndice[idx] || []).forEach(function (t) { soma += t; n++; });
      });
      return n > 0 ? soma / n : 0;
    }
    var mediaVerao = mediaDe([11, 0, 1]);   // dez, jan, fev
    var mediaInverno = mediaDe([5, 6, 7]);  // jun, jul, ago

    var insight;
    if (mediaInverno > 0 && mediaVerao > 0) {
      var difPct = (mediaVerao - mediaInverno) / mediaInverno * 100;
      if (difPct >= 0) {
        insight = h("span", { html: "No verão a gelateria vende <strong>" + fmt.pct(difPct) + " a mais</strong> que no inverno (faturamento médio por mês: " + fmt.money(mediaVerao) + " no verão contra " + fmt.money(mediaInverno) + " no inverno)." });
      } else {
        insight = h("span", { html: "Neste recorte, no inverno vende <strong>" + fmt.pct(Math.abs(difPct)) + " a mais</strong> que no verão (verão " + fmt.money(mediaVerao) + " contra inverno " + fmt.money(mediaInverno) + ")." });
      }
    } else if (mediaVerao > 0 && mediaInverno === 0) {
      insight = h("span", { html: "Há vendas de verão (" + fmt.money(mediaVerao) + "/mês em média) mas ainda sem histórico de inverno para comparar." });
    } else if (mediaInverno > 0 && mediaVerao === 0) {
      insight = h("span", { html: "Há vendas de inverno (" + fmt.money(mediaInverno) + "/mês em média) mas ainda sem histórico de verão para comparar." });
    } else {
      insight = h("span", { text: "Histórico insuficiente para comparar verão e inverno. Conforme mais meses forem registrados, a sazonalidade aparecerá aqui." });
    }

    wrap.appendChild(h("div", { class: "db-insight" },
      h("span", { class: "db-ic", html: C.icon("snow", 18) }),
      insight
    ));
    return wrap;
  }

  /* ---------- Vendas por categoria (donut + legenda) ---------- */
  function blocoCategorias() {
    var itens = C.analytics.itensVendidos(30); // [{produtoId,nome,qtd,receita}]
    var porCat = {};
    itens.forEach(function (it) {
      var p = C.find("produtos", it.produtoId);
      var cat = (p && p.categoria) || "Outros";
      porCat[cat] = (porCat[cat] || 0) + it.receita;
    });

    var nomes = Object.keys(porCat);
    if (!nomes.length) return ui.empty("Sem vendas nos últimos 30 dias.");

    var segmentos = nomes
      .sort(function (a, b) { return porCat[b] - porCat[a]; })
      .map(function (cat, i) {
        return { label: cat, value: Math.round(porCat[cat] * 100) / 100, color: PALETA[i % PALETA.length] };
      });

    var totalCat = segmentos.reduce(function (s, x) { return s + x.value; }, 0);
    var qtdTotal = itens.reduce(function (s, x) { return s + x.qtd; }, 0);
    var donut = ui.donut(segmentos, { size: 170, thickness: 22, center: fmt.int(qtdTotal) });

    var legenda = h("div", { class: "legend", style: { flexDirection: "column", gap: "8px", marginTop: "0" } });
    segmentos.forEach(function (sg) {
      var pct = totalCat > 0 ? (sg.value / totalCat * 100) : 0;
      legenda.appendChild(h("div", { class: "legend-item" },
        h("span", { class: "legend-dot", style: { background: sg.color } }),
        h("span", { html: "<strong>" + sg.label + "</strong> · " + fmt.money(sg.value) + " (" + fmt.pct(pct) + ")" })
      ));
    });

    return h("div", { class: "db-donut-wrap" },
      h("div", { style: { flex: "none", width: "170px" } }, donut),
      h("div", { style: { flex: "1", minWidth: "180px" } }, legenda)
    );
  }

  /* ---------- Ranking (mini-barras .bar-line) ---------- */
  function blocoRanking(lista, fraca) {
    if (!lista || !lista.length) return ui.empty("Sem vendas no período.");

    var max = Math.max.apply(null, lista.map(function (x) { return x.qtd; }).concat([1]));
    var cor = fraca ? "var(--warn)" : "var(--accent)";
    var wrap = h("div", {});
    lista.forEach(function (it, i) {
      var pct = max > 0 ? Math.max(3, (it.qtd / max) * 100) : 0;
      var span = h("span", { style: { width: pct + "%", background: cor } });
      wrap.appendChild(h("div", { class: "db-bar-row" },
        h("div", { class: "db-bar-head" },
          h("span", { class: "db-bar-name" },
            h("span", { class: "db-rank", text: String(i + 1) }),
            h("span", { class: "db-txt", text: it.nome })
          ),
          h("span", { class: "db-bar-val", text: fmt.int(it.qtd) + " un · " + fmt.money(it.receita) })
        ),
        h("div", { class: "bar-line" }, span)
      ));
    });
    return wrap;
  }

  /* ---------- Alertas ---------- */
  function badgeAlertas() {
    var n = C.analytics.estoqueBaixo().length + C.analytics.validadeProxima(7).length;
    return ui.badge(fmt.int(n), n > 0 ? "danger" : "ok");
  }

  function blocoAlertas() {
    var baixo = C.analytics.estoqueBaixo();
    var venc = C.analytics.validadeProxima(7);
    var wrap = h("div", {});

    if (!baixo.length && !venc.length) {
      wrap.appendChild(h("div", { class: "db-pos" },
        h("span", { html: C.icon("check", 18) }),
        h("span", { text: "Tudo sob controle. Nenhum item abaixo do mínimo ou perto do vencimento." })
      ));
      return wrap;
    }

    baixo.forEach(function (it) {
      wrap.appendChild(h("div", { class: "db-alert-row" },
        h("div", { class: "db-alert-info" },
          h("span", { class: "db-alert-name", text: it.nome }),
          h("span", { class: "db-alert-sub", text: "Saldo " + fmt.num(it.qtd, 2) + " " + it.unidade + " · mínimo " + fmt.num(it.qtdMin, 2) + " " + it.unidade })
        ),
        ui.badge("Abaixo do mínimo", "danger")
      ));
    });

    venc.forEach(function (it) {
      var dias = C.daysBetween(C.todayISO(), it.validade);
      var txt = dias <= 0 ? "Vence hoje" : (dias === 1 ? "Vence amanhã" : "Vence em " + dias + " dias");
      wrap.appendChild(h("div", { class: "db-alert-row" },
        h("div", { class: "db-alert-info" },
          h("span", { class: "db-alert-name", text: it.nome }),
          h("span", { class: "db-alert-sub", text: "Validade " + fmt.date(it.validade) + " · saldo " + fmt.num(it.qtd, 2) + " " + it.unidade })
        ),
        ui.badge(txt, "warn")
      ));
    });

    return wrap;
  }

  /* ---------- Operação hoje ---------- */
  function blocoOperacao() {
    var prodPend = C.analytics.producaoPendente().length;
    var limpHoje = C.analytics.limpezasHoje().length;
    var diarias = C.table("limpezaTarefas").filter(function (t) { return t.frequencia === "diaria"; }).length;

    var wrap = h("div", {});
    wrap.appendChild(h("div", { class: "db-op-grid" },
      h("div", { class: "db-op-cell" },
        h("div", { class: "db-op-num text-accent", text: fmt.int(prodPend) }),
        h("div", { class: "db-op-label", text: "Produção pendente" })
      ),
      h("div", { class: "db-op-cell" },
        h("div", { class: "db-op-num " + (limpHoje >= diarias && diarias > 0 ? "text-ok" : "text-warn"), text: fmt.int(limpHoje) }),
        h("div", { class: "db-op-label", text: "Limpezas registradas hoje" })
      )
    ));

    var resumo;
    if (diarias > 0) {
      var falta = Math.max(0, diarias - limpHoje);
      if (falta <= 0) {
        resumo = h("div", { class: "db-pos", style: { marginTop: "14px" } },
          h("span", { html: C.icon("check", 18) }),
          h("span", { text: "Todas as " + diarias + " tarefas diárias de limpeza já têm registro hoje." })
        );
      } else {
        resumo = h("div", { class: "db-insight", style: { marginTop: "14px" } },
          h("span", { class: "db-ic", html: C.icon("limpeza", 18) }),
          h("span", { html: "Faltam <strong>" + falta + "</strong> de " + diarias + " tarefas diárias de limpeza serem registradas hoje." })
        );
      }
    } else {
      resumo = h("div", { class: "db-insight", style: { marginTop: "14px" } },
        h("span", { class: "db-ic", html: C.icon("clock", 18) }),
        h("span", { text: "Nenhuma tarefa diária de limpeza cadastrada." })
      );
    }
    wrap.appendChild(resumo);

    if (prodPend > 0) {
      wrap.appendChild(h("div", { class: "db-insight", style: { marginTop: "10px" } },
        h("span", { class: "db-ic", html: C.icon("producao", 18) }),
        h("span", { html: "<strong>" + prodPend + "</strong> lote(s) de produção aguardando conclusão." })
      ));
    }

    return wrap;
  }

  C.registerModule({ id: "dashboard", label: "Dashboard", icon: "dashboard", order: 1, roles: ["gestor"], render: render });
})();
