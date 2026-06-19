/* ============================================================
   Módulo: CLIENTES / CRM + CLUBE
   - KPIs de carteira (total, VIPs, aniversariantes, em risco)
   - Filtros: busca (nome/telefone) + chips de segmento (RFM)
   - Tabela com nível, segmento, pontos, cashback, última compra, total gasto
   - "Ver": ficha do cliente, progresso de nível, histórico de compras,
     ajuste de pontos/cashback e mensagem de WhatsApp
   - Cards de aniversariantes do mês e de reativação (em risco/sumidos)
   - Compositor de mensagens de WhatsApp ({{nome}}, {{cupom}})
   Tudo gestor — pode mostrar valores livremente.
   Segue o padrão de modules/limpeza.js, modules/estoque.js e modules/pdv.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // estado de navegação interna (filtros)
  var state = { busca: "", seg: "Todos" };

  // limites de pontos por nível (igual à landing / núcleo)
  var NIVEIS = [
    { nome: "Bronze", min: 0 },
    { nome: "Prata", min: 250 },
    { nome: "Ouro", min: 800 },
    { nome: "Diamante", min: 2000 }
  ];

  /* ---------- helpers ---------- */

  function segOf(c) { return C.analytics.segmentoCliente(c).segmento; }

  function badgeSegmento(seg) {
    var kind = seg === "VIP" ? "accent"
      : seg === "Fiel" ? "info"
        : seg === "Novo" ? "ok"
          : seg === "Em risco" ? "warn"
            : "danger"; // Sumido
    return ui.badge(seg, kind);
  }

  // texto "há X dias" a partir da última compra
  function haDias(c) {
    if (!c.ultimaCompra) return "—";
    var d = C.daysBetween(c.ultimaCompra, C.todayISO());
    if (d <= 0) return "hoje";
    if (d === 1) return "há 1 dia";
    return "há " + fmt.int(d) + " dias";
  }

  // próximo nível e quanto falta (pontos)
  function progressoNivel(pontos) {
    pontos = Number(pontos) || 0;
    var atualIdx = 0;
    for (var i = 0; i < NIVEIS.length; i++) {
      if (pontos >= NIVEIS[i].min) atualIdx = i;
    }
    var atual = NIVEIS[atualIdx];
    var prox = NIVEIS[atualIdx + 1] || null;
    if (!prox) {
      return { atual: atual, prox: null, perc: 100, faltam: 0 };
    }
    var span = prox.min - atual.min || 1;
    var perc = ((pontos - atual.min) / span) * 100;
    if (perc < 0) perc = 0;
    if (perc > 100) perc = 100;
    return { atual: atual, prox: prox, perc: perc, faltam: Math.max(0, prox.min - pontos) };
  }

  // dígitos do telefone com DDI 55 para o wa.me
  function whatsappDigits(telefone) {
    var digits = (telefone || "").replace(/\D/g, "");
    if (digits.indexOf("55") !== 0) digits = "55" + digits;
    return digits;
  }

  /* ---------- COMPOSITOR DE WHATSAPP ---------- */

  function abrirWhatsApp(cliente, textoPadrao, cupomPadrao) {
    var msgInicial = textoPadrao != null
      ? textoPadrao
      : "Oi {{nome}}! Sentimos sua falta na Cellos Gelato. Volte e ganhe {{cupom}}.";

    var msgInput = h("textarea", { rows: 4, style: { width: "100%", padding: "9px 11px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit", fontSize: ".88rem", resize: "vertical" } });
    msgInput.value = msgInicial;

    var cupomInput = h("input", { type: "text", placeholder: "Ex.: 20% de desconto", style: { width: "100%", padding: "9px 11px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit", fontSize: ".88rem" } });
    if (cupomPadrao) cupomInput.value = cupomPadrao;

    var preview = h("div", { class: "small", style: { whiteSpace: "pre-wrap", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px", minHeight: "44px", color: "var(--ink)" } });

    function textoFinal() {
      var t = msgInput.value || "";
      t = t.replace(/\{\{\s*nome\s*\}\}/g, cliente.nome || "");
      t = t.replace(/\{\{\s*cupom\s*\}\}/g, (cupomInput.value || "").trim() || "um presente especial");
      return t;
    }
    function atualizaPreview() { preview.textContent = textoFinal(); }
    msgInput.addEventListener("input", atualizaPreview);
    cupomInput.addEventListener("input", atualizaPreview);

    var body = h("div", { class: "stack", style: { gap: "12px" } },
      h("div", {},
        h("div", { class: "small muted mb-2" }, "Para ", h("b", { text: cliente.nome }), " · ", (cliente.telefone || "sem telefone")),
        h("label", { class: "small muted", text: "Mensagem (use {{nome}} e {{cupom}})" }),
        msgInput
      ),
      h("div", {},
        h("label", { class: "small muted", text: "Cupom / oferta (opcional)" }),
        cupomInput
      ),
      h("div", {},
        h("label", { class: "small muted", text: "Pré-visualização" }),
        preview
      )
    );
    atualizaPreview();

    var enviar = ui.button("Abrir no WhatsApp", { variant: "primary", icon: "check" });
    var m = ui.modal({ title: "Mensagem WhatsApp", body: body, actions: [enviar], size: "md" });
    enviar.addEventListener("click", function () {
      var digits = whatsappDigits(cliente.telefone);
      window.open("https://wa.me/" + digits + "?text=" + encodeURIComponent(textoFinal()), "_blank");
      m.close();
    });
  }

  /* ---------- FORM: novo / editar cliente ---------- */

  function abrirClienteForm(cliente) {
    var editing = !!cliente;
    ui.formModal({
      title: editing ? "Editar cliente" : "Novo cliente",
      size: "md",
      values: cliente || { pontos: 0, cashback: 0 },
      fields: [
        { name: "nome", label: "Nome", type: "text", required: true, full: true, placeholder: "Ex.: Maria Silva" },
        { name: "telefone", label: "Telefone", type: "text", required: true, placeholder: "(51) 9XXXX-XXXX" },
        { name: "aniversario", label: "Aniversário (MM-DD)", type: "text", placeholder: "Ex.: 06-15" },
        { name: "pontos", label: "Pontos (colheres)", type: "number", step: "1" },
        { name: "cashback", label: "Cashback", type: "money", prefix: "R$" }
      ],
      validate: function (v) {
        var aniv = (v.aniversario || "").trim();
        if (aniv) {
          var m = /^(\d{2})-(\d{2})$/.exec(aniv);
          if (!m) return "Aniversário no formato MM-DD (ex.: 06-15).";
          var mes = Number(m[1]), dia = Number(m[2]);
          if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "Aniversário inválido. Use MM-DD (mês 01-12, dia 01-31).";
        }
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      var pontos = Number(v.pontos) || 0;
      if (editing) {
        C.update("clientes", cliente.id, {
          nome: v.nome,
          telefone: v.telefone,
          aniversario: (v.aniversario || "").trim(),
          pontos: Math.max(0, pontos),
          cashback: Math.round((Number(v.cashback) || 0) * 100) / 100,
          nivel: C.nivelCliente(Math.max(0, pontos))
        });
        ui.toast("Cliente atualizado.", "ok");
      } else {
        C.insert("clientes", {
          nome: v.nome,
          telefone: v.telefone,
          pontos: Math.max(0, pontos),
          cashback: Math.round((Number(v.cashback) || 0) * 100) / 100,
          nivel: C.nivelCliente(Math.max(0, pontos)),
          visitas: 0,
          totalGasto: 0,
          primeiraCompra: C.todayISO(),
          ultimaCompra: C.todayISO(),
          aniversario: (v.aniversario || "").trim(),
          codigo: "",
          indicadoPor: null
        });
        ui.toast("Cliente cadastrado.", "ok");
      }
      render(document.getElementById("content"));
    });
  }

  // ajustar pontos/cashback de um cliente
  function ajustarSaldo(cliente, onDone) {
    ui.formModal({
      title: "Ajustar pontos / cashback",
      size: "sm",
      values: { pontos: cliente.pontos || 0, cashback: cliente.cashback || 0 },
      fields: [
        { name: "pontos", label: "Pontos (colheres)", type: "number", step: "1", full: true },
        { name: "cashback", label: "Cashback", type: "money", prefix: "R$", full: true }
      ]
    }).then(function (v) {
      if (!v) return;
      var pontos = Math.max(0, Number(v.pontos) || 0);
      C.update("clientes", cliente.id, {
        pontos: pontos,
        cashback: Math.round((Number(v.cashback) || 0) * 100) / 100,
        nivel: C.nivelCliente(pontos)
      });
      ui.toast("Saldo atualizado.", "ok");
      if (onDone) onDone();
    });
  }

  /* ---------- VER (ficha do cliente) ---------- */

  function verCliente(cliente) {
    var seg = C.analytics.segmentoCliente(cliente);
    var prog = progressoNivel(cliente.pontos);

    var body = h("div", { class: "stack", style: { gap: "16px" } });

    // cabeçalho de identificação + badges
    body.appendChild(h("div", {},
      h("div", { class: "flex items-center gap", style: { gap: "8px", flexWrap: "wrap" } },
        h("span", { class: "cell-strong", style: { fontSize: "1.05rem" }, text: cliente.nome }),
        ui.badge(cliente.nivel || "Bronze", "accent"),
        badgeSegmento(seg.segmento)
      ),
      h("div", { class: "small muted mt-1", text: (cliente.telefone || "sem telefone") + (cliente.codigo ? " · " + cliente.codigo : "") })
    ));

    // breakdown de saldos / RFM (reaproveita .cost-breakdown)
    body.appendChild(h("div", { class: "cost-breakdown" },
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Pontos" }), h("div", { class: "cb-val", text: fmt.int(cliente.pontos || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Cashback" }), h("div", { class: "cb-val", text: fmt.money(cliente.cashback || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Total gasto" }), h("div", { class: "cb-val", text: fmt.money(cliente.totalGasto || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Visitas" }), h("div", { class: "cb-val", text: fmt.int(cliente.visitas || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Recência" }), h("div", { class: "cb-val", text: seg.recencia >= 999 ? "—" : fmt.int(seg.recencia) + "d" })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Aniversário" }), h("div", { class: "cb-val", text: cliente.aniversario || "—" }))
    ));

    // barra de progresso até o próximo nível
    var progBox = h("div", {});
    if (prog.prox) {
      progBox.appendChild(h("div", { class: "flex between small muted", style: { marginBottom: "5px" } },
        h("span", { text: "Nível " + prog.atual.nome }),
        h("span", { text: "faltam " + fmt.int(prog.faltam) + " pts para " + prog.prox.nome })
      ));
    } else {
      progBox.appendChild(h("div", { class: "flex between small muted", style: { marginBottom: "5px" } },
        h("span", { text: "Nível " + prog.atual.nome }),
        h("span", { class: "text-accent", text: "nível máximo atingido" })
      ));
    }
    progBox.appendChild(h("div", { class: "bar-line", style: { height: "9px" } },
      h("span", { style: { width: prog.perc + "%", background: "var(--accent)" } })
    ));
    body.appendChild(progBox);

    // histórico de compras do cliente
    var vendas = C.table("vendas").filter(function (v) { return v.clienteId === cliente.id; })
      .sort(function (a, b) { return new Date(b.datetime) - new Date(a.datetime); });

    var histHost = h("div", {});
    histHost.appendChild(h("label", { class: "small muted", text: "Histórico de compras (" + fmt.int(vendas.length) + ")" }));
    histHost.appendChild(ui.table([
      { key: "data", label: "Data", render: function (v) { return fmt.date(v.datetime); } },
      { key: "hora", label: "Hora", render: function (v) { return fmt.time(v.datetime); } },
      {
        key: "itens", label: "Itens", render: function (v) {
          var nomes = (v.itens || []).map(function (l) { return l.qtd + "× " + l.nome; }).join(", ");
          return '<span class="cell-muted">' + (nomes || "—") + "</span>";
        }
      },
      { key: "total", label: "Total", align: "right", render: function (v) { return h("span", { class: "cell-strong", text: fmt.money(v.total) }); } }
    ], vendas, { emptyMsg: "Nenhuma compra registrada para este cliente.", dense: true }));
    body.appendChild(histHost);

    // ações do rodapé
    var btnSaldo = ui.button("Ajustar pontos/cashback", { variant: "ghost", icon: "edit" });
    var btnZap = ui.button("Mensagem WhatsApp", { variant: "primary", icon: "user" });
    var m = ui.modal({ title: "Cliente", body: body, actions: [btnSaldo, btnZap], size: "lg" });
    btnSaldo.addEventListener("click", function () {
      ajustarSaldo(cliente, function () { m.close(); render(document.getElementById("content")); });
    });
    btnZap.addEventListener("click", function () { abrirWhatsApp(cliente); });
  }

  /* ---------- CARDS LATERAIS (aniversariantes + reativar) ---------- */

  function cardListaClientes(titulo, lista, vazioMsg, textoPadrao, cupomPadrao) {
    var corpo = h("div", { class: "stack", style: { gap: "0" } });
    if (!lista.length) {
      corpo.appendChild(ui.empty(vazioMsg));
    } else {
      lista.forEach(function (c) {
        var zap = ui.button("WhatsApp", { variant: "soft", icon: "user", onClick: function () { abrirWhatsApp(c, textoPadrao, cupomPadrao); } });
        zap.classList.add("btn-sm");
        var info = h("div", { style: { minWidth: "0" } },
          h("span", { class: "cell-strong", text: c.nome }),
          h("div", { class: "small muted", text: (c.telefone || "sem telefone") + (c.aniversario ? " · aniv. " + c.aniversario : "") + " · " + haDias(c) })
        );
        corpo.appendChild(h("div", { class: "list-row" }, info, h("div", { style: { flex: "none" } }, zap)));
      });
    }
    return ui.card(titulo, corpo);
  }

  /* ---------- RENDER PRINCIPAL ---------- */

  function render(root) {
    ui.clear(root);
    root.appendChild(ui.pageHeader(
      "Clientes",
      "CRM + Clube Cellos — fidelidade, segmentação e reativação.",
      [ui.button("Novo cliente", { icon: "plus", onClick: function () { abrirClienteForm(null); } })]
    ));

    var clientes = C.table("clientes");
    var vips = clientes.filter(function (c) { return segOf(c) === "VIP"; });
    var aniversariantes = C.analytics.clientesAniversariantes();
    var emRisco = C.analytics.clientesEmRisco();
    var indicacoes = clientes.filter(function (c) { return c.indicadoPor; }).length;

    // KPIs (grid-4)
    root.appendChild(h("div", { class: "grid grid-4 mb-2" },
      ui.kpi({ label: "Total de clientes", value: fmt.int(clientes.length), icon: "clube", accent: "accent" }),
      ui.kpi({ label: "VIPs", value: fmt.int(vips.length), icon: "star", accent: "success" }),
      ui.kpi({ label: "Aniversariantes do mês", value: fmt.int(aniversariantes.length), icon: "sino", accent: "info" }),
      ui.kpi({ label: "Em risco / sumidos", value: fmt.int(emRisco.length), icon: "alert", accent: "warn" })
    ));

    // "Indique e ganhe"
    root.appendChild(h("p", { class: "small muted mb-2" },
      h("span", { html: C.icon("user", 14), style: { verticalAlign: "middle", marginRight: "5px" } }), "Indique e ganhe: ", h("b", { class: "text-accent", text: fmt.int(indicacoes) }),
      " " + (indicacoes === 1 ? "cliente veio por indicação" : "clientes vieram por indicação") + "."
    ));

    // filtros: busca + chips de segmento
    var buscaInput = h("input", { type: "text", placeholder: "Buscar por nome ou telefone...", value: state.busca });
    buscaInput.addEventListener("input", function () { state.busca = buscaInput.value; draw(); });

    var chips = h("div", { class: "chips" });
    ["Todos", "VIP", "Fiel", "Novo", "Em risco", "Sumido"].forEach(function (seg) {
      var chip = h("button", { class: "chip" + (state.seg === seg ? " active" : ""), type: "button", text: seg });
      chip.addEventListener("click", function () { state.seg = seg; render(document.getElementById("content")); });
      chips.appendChild(chip);
    });

    root.appendChild(h("div", { class: "filters" },
      h("div", { class: "search-box" }, h("span", { html: C.icon("search", 16) }), buscaInput),
      chips
    ));

    // tabela de clientes
    var tableHost = h("div", {});
    root.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    function draw() {
      var termo = (state.busca || "").trim().toLowerCase();
      var digitos = termo.replace(/\D/g, "");
      var rows = C.table("clientes").filter(function (c) {
        if (state.seg !== "Todos" && segOf(c) !== state.seg) return false;
        if (termo) {
          var nomeOk = (c.nome || "").toLowerCase().indexOf(termo) >= 0;
          var telOk = digitos.length >= 3 && (c.telefone || "").replace(/\D/g, "").indexOf(digitos) >= 0;
          if (!nomeOk && !telOk) return false;
        }
        return true;
      }).sort(function (a, b) { return (b.totalGasto || 0) - (a.totalGasto || 0); });

      var cols = [
        { key: "nome", label: "Nome", render: function (c) { return h("span", { class: "cell-strong", text: c.nome }); } },
        { key: "telefone", label: "Telefone", render: function (c) { return c.telefone || "—"; } },
        { key: "nivel", label: "Nível", render: function (c) { return ui.badge(c.nivel || "Bronze", "accent"); } },
        { key: "segmento", label: "Segmento", render: function (c) { return badgeSegmento(segOf(c)); } },
        { key: "pontos", label: "Pontos", align: "right", render: function (c) { return fmt.int(c.pontos || 0); } },
        { key: "cashback", label: "Cashback", align: "right", render: function (c) { return fmt.money(c.cashback || 0); } },
        {
          key: "ultimaCompra", label: "Última compra", render: function (c) {
            if (!c.ultimaCompra) return '<span class="cell-muted">—</span>';
            return h("div", {},
              h("span", { text: fmt.date(c.ultimaCompra) }),
              h("div", { class: "small muted", text: haDias(c) })
            );
          }
        },
        { key: "totalGasto", label: "Total gasto", align: "right", render: function (c) { return h("span", { class: "cell-strong", text: fmt.money(c.totalGasto || 0) }); } }
      ];

      ui.clear(tableHost);
      tableHost.appendChild(ui.table(cols, rows, {
        emptyMsg: "Nenhum cliente encontrado.",
        actions: function (c) {
          return [
            ui.iconButton("search", function () { verCliente(c); }, "Ver"),
            ui.iconButton("edit", function () { abrirClienteForm(c); }, "Editar"),
            ui.iconButton("trash", function () {
              ui.confirm("Excluir o cliente \"" + c.nome + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
                if (ok) { C.remove("clientes", c.id); ui.toast("Cliente excluído.", "ok"); render(document.getElementById("content")); }
              });
            }, "Excluir")
          ];
        }
      }));
    }
    draw();

    // cards de aniversariantes + reativação (lado a lado)
    var msgAniv = "Feliz aniversário, {{nome}}! A Cellos Gelato preparou {{cupom}} pra comemorar com você.";
    var msgReativa = "Oi {{nome}}! Sentimos sua falta na Cellos Gelato. Volte e ganhe {{cupom}}.";
    root.appendChild(h("div", { class: "grid grid-2 mt-2", style: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "18px" } },
      cardListaClientes("Aniversariantes do mês", aniversariantes, "Nenhum aniversariante neste mês.", msgAniv, "um presente especial"),
      cardListaClientes("Reativar (em risco / sumidos)", emRisco, "Nenhum cliente em risco. Carteira aquecida!", msgReativa, "10% de desconto")
    ));
  }

  C.registerModule({ id: "clientes", label: "Clientes", icon: "clube", order: 4.5, roles: ["gestor"], render: render });
})();
