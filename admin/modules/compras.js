/* ============================================================
   Módulo: COMPRAS  (gestão de compras + rastreio de pedidos)
   - SOMENTE GESTOR (roles:['gestor']) — módulo financeiro.
   - KPIs: pedidos pendentes, valor pendente, gasto últimos 30 dias.
   - Sugestão de reposição (estoque baixo) -> gera pedido pré-preenchido.
   - Tabela/rastreio: quem comprou, de quem, quando, previsão, recebido, valor, status.
   - Receber pedido -> C.receberCompra (dá entrada no estoque).
   - Nova compra e cadastro de fornecedores.
   Segue os padrões de modules/pdv.js e modules/limpeza.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  /* ---------- helpers ---------- */

  function root() { return document.getElementById("content"); }

  function nomeFornecedor(id) {
    var f = C.find("fornecedores", id);
    return f ? f.nome : "(fornecedor removido)";
  }

  // valor total de uma compra = soma de qtd * custoUnit dos itens
  function valorCompra(c) {
    return (c.itens || []).reduce(function (s, li) {
      return s + (Number(li.qtd) || 0) * (Number(li.custoUnit) || 0);
    }, 0);
  }

  function operadorOptions() {
    return (C.get().config.operadores || []).slice();
  }

  function badgeStatus(status) {
    if (status === "recebido") return ui.badge("Recebido", "ok");
    return ui.badge("Pedido", "warn");
  }

  /* ---------- editor do campo "itens" da compra ----------
     Cada linha: item de estoque (select) + qtd + custoUnit.
     Retorna {el, getValue} no padrão de field type:'custom'. */
  function itensEditor(valor) {
    var linhas = C.clone(valor || []);
    var itens = C.table("itens");
    var wrap = h("div", { class: "compra-itens-editor" });
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

    var verFinanceiro = C.podeVerFinanceiro();

    function row(linha, idx) {
      var sel = itemOptions(linha.itemId);
      var qty = h("input", { type: "number", step: "0.01", min: "0", value: linha.qtd != null ? linha.qtd : 1, style: { width: "84px" }, title: "Quantidade" });
      var custo = h("input", { type: "number", step: "0.01", min: "0", value: linha.custoUnit != null ? linha.custoUnit : "", placeholder: "0,00", style: { width: "96px" }, title: "Custo unitário (R$)" });

      // ao escolher o item, sugere o custo unitário cadastrado se ainda vazio
      sel.addEventListener("change", function () {
        linhas[idx].itemId = sel.value;
        var it = C.find("itens", sel.value);
        if (it && (custo.value === "" || Number(custo.value) === 0)) {
          custo.value = it.custoUnit != null ? it.custoUnit : "";
          linhas[idx].custoUnit = it.custoUnit != null ? it.custoUnit : 0;
        }
      });
      qty.addEventListener("input", function () { linhas[idx].qtd = Number(qty.value) || 0; });
      custo.addEventListener("input", function () { linhas[idx].custoUnit = Number(custo.value) || 0; });

      var del = ui.iconButton("trash", function () { linhas.splice(idx, 1); redraw(); }, "Remover item");
      // o campo de custo unitário (financeiro) só aparece para gestor
      var custoCol = verFinanceiro
        ? h("div", { class: "input-prefix", style: { width: "126px" } }, h("span", { text: "R$" }), custo)
        : null;
      return h("div", { class: "flex items-center gap", style: { gap: "8px" } },
        h("div", { style: { flex: "1", minWidth: "0" } }, sel),
        h("div", { class: "input-prefix", style: { width: "104px" } }, h("span", { text: "x" }), qty),
        custoCol,
        del
      );
    }

    function redraw() {
      ui.clear(list);
      if (!linhas.length) list.appendChild(h("p", { class: "small muted", text: "Nenhum item no pedido. Adicione ao menos um." }));
      linhas.forEach(function (l, i) { list.appendChild(row(l, i)); });
    }
    redraw();

    var add = ui.button("Adicionar item", { variant: "ghost", icon: "plus" });
    add.classList.add("btn-sm");
    add.addEventListener("click", function () { linhas.push({ itemId: "", qtd: 1, custoUnit: 0 }); redraw(); });

    wrap.appendChild(list);
    wrap.appendChild(h("div", { class: "mt-1" }, add));

    return {
      el: wrap,
      getValue: function () {
        return linhas.filter(function (l) { return l.itemId; }).map(function (l) {
          var it = C.find("itens", l.itemId);
          return {
            itemId: l.itemId,
            nome: it ? it.nome : "",
            qtd: Number(l.qtd) || 0,
            custoUnit: Number(l.custoUnit) || 0
          };
        });
      }
    };
  }

  /* ---------- Nova compra (formModal) ---------- */
  function openCompraForm(prefill) {
    prefill = prefill || {};
    var fornecedores = C.table("fornecedores");
    if (!fornecedores.length) {
      ui.toast("Cadastre um fornecedor antes de lançar a compra.", "warn");
      openFornecedoresModal();
      return;
    }
    var ops = operadorOptions();
    var fornecedorOptions = fornecedores.map(function (f) { return { value: f.id, label: f.nome }; });

    ui.formModal({
      title: "Nova compra",
      size: "lg",
      values: {
        fornecedorId: prefill.fornecedorId || fornecedores[0].id,
        comprador: prefill.comprador || (ops[0] || ""),
        dataPrevista: prefill.dataPrevista || C.daysFromNow(3),
        obs: prefill.obs || "",
        itens: prefill.itens || []
      },
      fields: [
        { name: "fornecedorId", label: "Fornecedor", type: "select", options: fornecedorOptions, required: true },
        { name: "comprador", label: "Comprador", type: "select", options: ops, required: true },
        { name: "dataPrevista", label: "Previsão de entrega", type: "date" },
        { name: "obs", label: "Observações", type: "textarea", rows: 2, full: true, placeholder: "Ex.: reposição urgente, condição de pagamento..." },
        {
          name: "itens", label: "Itens do pedido", type: "custom", full: true,
          render: itensEditor,
          help: "Selecione o item de estoque, a quantidade comprada e o custo unitário."
        }
      ],
      validate: function (v) {
        if (!v.itens || !v.itens.length) return "Adicione ao menos um item ao pedido.";
        var semQtd = v.itens.some(function (li) { return !(Number(li.qtd) > 0); });
        if (semQtd) return "Informe a quantidade de cada item.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      C.insert("compras", {
        fornecedorId: v.fornecedorId,
        comprador: v.comprador,
        data: C.todayISO(),
        dataPrevista: v.dataPrevista || null,
        dataRecebido: null,
        status: "pedido",
        itens: v.itens,
        obs: v.obs || ""
      });
      ui.toast("Compra registrada como pedido.", "ok");
      render(root());
    });
  }

  /* ---------- Receber compra ---------- */
  function receberCompra(c) {
    ui.confirm(
      "Confirmar o recebimento desta compra de " + nomeFornecedor(c.fornecedorId) + "? Os itens darão entrada no estoque.",
      { title: "Receber compra", okLabel: "Receber" }
    ).then(function (ok) {
      if (!ok) return;
      C.receberCompra(c.id, { responsavel: "Estoque" });
      ui.toast("Compra recebida e estoque atualizado.", "ok");
      render(root());
    });
  }

  /* ---------- Ver detalhes da compra (modal) ---------- */
  function verCompra(c) {
    var cols = [
      { key: "nome", label: "Item", render: function (li) { return h("span", { class: "cell-strong", text: li.nome || (C.find("itens", li.itemId) || {}).nome || "—" }); } },
      { key: "qtd", label: "Qtd", align: "right", render: function (li) { return fmt.num(li.qtd, 2); } }
    ];
    // custos e subtotais (financeiro) somente para gestor
    if (C.podeVerFinanceiro()) {
      cols.push({ key: "custoUnit", label: "Custo un.", align: "right", render: function (li) { return fmt.money(li.custoUnit); } });
      cols.push({ key: "subtotal", label: "Subtotal", align: "right", render: function (li) { return h("span", { class: "cell-strong", text: fmt.money((Number(li.qtd) || 0) * (Number(li.custoUnit) || 0)) }); } });
    }

    var info = h("div", { class: "stack", style: { gap: "6px", marginBottom: "14px" } },
      h("div", { class: "flex between wrap", style: { gap: "10px" } },
        h("span", { class: "small muted" }, "Fornecedor: ", h("b", { class: "cell-strong", text: nomeFornecedor(c.fornecedorId) })),
        badgeStatus(c.status)
      ),
      h("div", { class: "flex between wrap small muted", style: { gap: "10px" } },
        h("span", {}, "Comprador: ", h("b", { text: c.comprador || "—" })),
        h("span", {}, "Pedido em: ", h("b", { text: fmt.date(c.data) }))
      ),
      h("div", { class: "flex between wrap small muted", style: { gap: "10px" } },
        h("span", {}, "Previsão: ", h("b", { text: fmt.date(c.dataPrevista) })),
        h("span", {}, "Recebido em: ", h("b", { text: c.dataRecebido ? fmt.date(c.dataRecebido) : "—" }))
      ),
      c.obs ? h("p", { class: "small muted mt-1", text: "Obs.: " + c.obs }) : null
    );

    var body = h("div", {},
      info,
      ui.table(cols, c.itens || [], { dense: true, emptyMsg: "Sem itens." }),
      C.podeVerFinanceiro() ? h("div", { class: "flex between items-center", style: { padding: "12px 2px 0", borderTop: "1px solid var(--line)", marginTop: "8px" } },
        h("span", { class: "small muted", text: "Valor total do pedido" }),
        h("span", { class: "cell-strong", style: { fontSize: "1.15rem", fontFamily: "var(--serif)" }, text: fmt.money(valorCompra(c)) })
      ) : null
    );

    var actions = [];
    if (c.status === "pedido") {
      var rec = ui.button("Receber", { variant: "primary", icon: "check" });
      rec.addEventListener("click", function () { m.close(); receberCompra(c); });
      actions.push(rec);
    }
    var fechar = ui.button("Fechar", { variant: "ghost" });
    actions.push(fechar);
    var m = ui.modal({ title: "Compra · " + nomeFornecedor(c.fornecedorId), body: body, actions: actions, size: "md" });
    fechar.addEventListener("click", function () { m.close(); });
  }

  /* ---------- Fornecedores (modal de lista + cadastro) ---------- */
  function openFornecedoresModal() {
    var listHost = h("div", {});

    function drawList() {
      ui.clear(listHost);
      var fornecedores = C.table("fornecedores");
      listHost.appendChild(ui.table([
        { key: "nome", label: "Fornecedor", render: function (f) { return h("span", { class: "cell-strong", text: f.nome }); } },
        { key: "segmento", label: "Segmento", render: function (f) { return f.segmento ? ui.badge(f.segmento, "neutral") : '<span class="cell-muted">—</span>'; } },
        { key: "contato", label: "Contato", render: function (f) { return f.contato || '<span class="cell-muted">—</span>'; } }
      ], fornecedores, { dense: true, emptyMsg: "Nenhum fornecedor cadastrado." }));
    }

    function addFornecedor() {
      ui.formModal({
        title: "Novo fornecedor",
        size: "md",
        fields: [
          { name: "nome", label: "Nome", type: "text", required: true, full: true, placeholder: "Ex.: Distribuidora Polo Sul" },
          { name: "contato", label: "Contato", type: "text", placeholder: "Telefone, e-mail..." },
          { name: "segmento", label: "Segmento", type: "text", placeholder: "Ex.: Embalagens, Bebidas, Matéria-prima" }
        ]
      }).then(function (v) {
        if (!v) return;
        C.insert("fornecedores", { nome: v.nome, contato: v.contato || "", segmento: v.segmento || "" });
        ui.toast("Fornecedor cadastrado.", "ok");
        drawList();
        render(root());
      });
    }

    drawList();
    var add = ui.button("Adicionar fornecedor", { variant: "primary", icon: "plus" });
    add.addEventListener("click", addFornecedor);
    var fechar = ui.button("Fechar", { variant: "ghost" });
    var m = ui.modal({ title: "Fornecedores", body: listHost, actions: [add, fechar], size: "md" });
    fechar.addEventListener("click", function () { m.close(); });
  }

  /* ---------- KPIs (grid-3) ---------- */
  function renderKpis(host) {
    var compras = C.table("compras");
    var pendentes = compras.filter(function (c) { return c.status === "pedido"; });

    var kpis = [
      ui.kpi({
        label: "Pedidos pendentes",
        value: fmt.int(pendentes.length),
        icon: "clock",
        accent: pendentes.length ? "warn" : "success",
        foot: pendentes.length ? "Aguardando recebimento" : "Tudo recebido"
      })
    ];

    // valores financeiros somente para quem pode ver o financeiro (gestor)
    if (C.podeVerFinanceiro()) {
      var valorPendente = pendentes.reduce(function (s, c) { return s + valorCompra(c); }, 0);
      // gasto últimos 30 dias: compras recebidas com dataRecebido nos últimos 30 dias
      var limite = C.daysFromNow(-30);
      var gasto30 = compras.filter(function (c) {
        return c.status === "recebido" && c.dataRecebido && c.dataRecebido >= limite;
      }).reduce(function (s, c) { return s + valorCompra(c); }, 0);

      kpis.push(ui.kpi({
        label: "Valor pendente",
        value: fmt.money(valorPendente),
        icon: "money",
        accent: "info",
        foot: "Em pedidos não recebidos"
      }));
      kpis.push(ui.kpi({
        label: "Gasto últimos 30 dias",
        value: fmt.money(gasto30),
        icon: "compras",
        accent: "accent",
        foot: "Compras recebidas no período"
      }));
    }

    host.appendChild(h("div", { class: "grid grid-3 mb-2" }, kpis));
  }

  /* ---------- Sugestão de reposição ---------- */
  function renderSugestao(host) {
    var baixos = C.analytics.estoqueBaixo();
    if (!baixos.length) {
      host.appendChild(ui.card("Sugestão de reposição",
        ui.empty("Nenhum item abaixo do mínimo. Estoque saudável.")));
      return;
    }

    var lista = h("div", { class: "stack" });
    baixos.forEach(function (it) {
      // quantidade sugerida: repor até o máximo (ou o mínimo, se não houver máximo)
      var alvo = it.qtdMax != null ? it.qtdMax : it.qtdMin;
      var sugerido = Math.max(0, Math.round((alvo - it.qtd) * 100) / 100);

      var esquerda = h("div", { style: { minWidth: "0" } },
        h("div", { class: "flex items-center gap", style: { gap: "8px", flexWrap: "wrap" } },
          h("span", { class: "cell-strong", text: it.nome }),
          ui.badge(fmt.num(it.qtd, 2) + " " + it.unidade + " em estoque", "danger")
        ),
        h("p", { class: "small muted mt-1" },
          "Mínimo " + fmt.num(it.qtdMin, 2) + " " + it.unidade +
          " · Fornecedor: " + nomeFornecedor(it.fornecedorId) +
          (sugerido > 0 ? " · Sugerido comprar " + fmt.num(sugerido, 2) + " " + it.unidade : "")
        )
      );

      var btn = ui.button("Gerar pedido", { variant: "soft", icon: "plus" });
      btn.classList.add("btn-sm");
      btn.addEventListener("click", function () {
        openCompraForm({
          fornecedorId: it.fornecedorId,
          itens: [{ itemId: it.id, nome: it.nome, qtd: sugerido > 0 ? sugerido : it.qtdMin, custoUnit: it.custoUnit || 0 }]
        });
      });

      lista.appendChild(h("div", { class: "list-row", style: { alignItems: "flex-start" } },
        esquerda, h("div", { style: { flex: "none" } }, btn)));
    });

    host.appendChild(ui.card("Sugestão de reposição — " + baixos.length + " item(ns) abaixo do mínimo", lista, {
      action: ui.button("Nova compra", { variant: "ghost", icon: "plus", onClick: function () { openCompraForm(); } })
    }));
  }

  /* ---------- Tabela / rastreio de compras ---------- */
  function renderTabela(host) {
    var compras = C.table("compras").slice().sort(function (a, b) {
      return new Date(b.data) - new Date(a.data);
    });

    var cols = [
      { key: "comprador", label: "Comprador", render: function (c) { return c.comprador || "—"; } },
      { key: "fornecedor", label: "Fornecedor", render: function (c) { return h("span", { class: "cell-strong", text: nomeFornecedor(c.fornecedorId) }); } },
      { key: "data", label: "Pedido", render: function (c) { return fmt.date(c.data); } },
      { key: "dataPrevista", label: "Previsão", render: function (c) { return fmt.date(c.dataPrevista); } },
      { key: "dataRecebido", label: "Recebido", render: function (c) { return c.dataRecebido ? fmt.date(c.dataRecebido) : "—"; } },
      { key: "itens", label: "Itens", align: "center", render: function (c) { return fmt.int((c.itens || []).length); } }
    ];
    // coluna de valor (financeiro) somente para gestor
    if (C.podeVerFinanceiro()) {
      cols.push({ key: "valor", label: "Valor", align: "right", render: function (c) { return h("span", { class: "cell-strong", text: fmt.money(valorCompra(c)) }); } });
    }
    cols.push({ key: "status", label: "Status", align: "center", render: function (c) { return badgeStatus(c.status); } });

    var tableHost = h("div", {});
    tableHost.appendChild(ui.table(cols, compras, {
      emptyMsg: "Nenhuma compra registrada.",
      onRow: function (c) { verCompra(c); },
      actions: function (c) {
        var acts = [];
        if (c.status === "pedido") {
          acts.push(ui.iconButton("check", function () { receberCompra(c); }, "Receber"));
        }
        acts.push(ui.iconButton("search", function () { verCompra(c); }, "Ver detalhes"));
        return acts;
      }
    }));

    host.appendChild(ui.card("Histórico e rastreio de compras", tableHost));
  }

  /* ---------- RENDER PRINCIPAL ---------- */
  function render(rootEl) {
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader(
      "Compras",
      "Pedidos, recebimento e reposição de estoque — quem comprou, de quem e quanto.",
      [
        ui.button("Fornecedores", { variant: "ghost", icon: "user", onClick: openFornecedoresModal }),
        ui.button("Nova compra", { icon: "plus", onClick: function () { openCompraForm(); } })
      ]
    ));

    renderKpis(rootEl);

    var sugestaoHost = h("div", { class: "mb-2" });
    rootEl.appendChild(sugestaoHost);
    renderSugestao(sugestaoHost);

    renderTabela(rootEl);
  }

  C.registerModule({ id: "compras", label: "Compras", icon: "compras", order: 4, roles: ["gestor"], render: render });
})();
