/* ============================================================
   Módulo: CLIENTES  (CRM + Clube Cellos · foco em FIDELIDADE)
   - KPIs: total, VIPs, aniversariantes do mês, "quase ganhando"
   - DESTAQUE "Quase lá": a poucos selos do brinde + quase no próximo nível
     (com compositor de WhatsApp pré-preenchido via C.mensagemNudge)
   - Brindes para resgatar · Aniversariantes do mês · Reativar (em risco/sumidos)
   - Filtros: busca (nome/telefone/cpf) + chips de segmento (RFM)
   - Tabela: nível, segmento, colheres, selos (X/meta), última compra
   - "Ver": progresso de nível, cartão de selos, brindes, cashback, histórico
   - Form Novo/Editar: nome, telefone, cpf, aniversário, pontos, cashback
   Gestor only. Segue o padrão de modules/pdv.js e modules/limpeza.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // estado de navegação interna (filtros)
  var state = { busca: "", seg: "Todos" };

  /* ---------- helpers ---------- */

  function fidConfig() { return (C.get().config && C.get().config.fidelidade) || {}; }
  function selosMeta() { return fidConfig().selosMeta || 10; }

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

  // barra de progresso reutilizável (.bar-line + span com width)
  function barLine(pct, cor, altura) {
    pct = Math.max(0, Math.min(100, pct || 0));
    return h("div", { class: "bar-line", style: altura ? { height: altura } : null },
      h("span", { style: { width: pct + "%", background: cor || "var(--accent)" } })
    );
  }

  /* ---------- WHATSAPP (compositor pré-preenchido) ---------- */

  // abre o conversor com a mensagem do nudge já preenchida e editável
  function abrirWhatsApp(cliente, mensagem) {
    var msgInicial = mensagem != null ? mensagem : "";

    var msgInput = h("textarea", {
      rows: 4,
      style: { width: "100%", padding: "9px 11px", borderRadius: "9px", border: "1px solid var(--line-strong)", fontFamily: "inherit", fontSize: ".88rem", resize: "vertical" }
    });
    msgInput.value = msgInicial;

    var temTelefone = !!(cliente.telefone && cliente.telefone.replace(/\D/g, "").length >= 8);

    var body = h("div", { class: "stack", style: { gap: "12px" } },
      h("div", { class: "small muted" }, "Para ", h("b", { text: cliente.nome }), " · ", (cliente.telefone || "sem telefone")),
      h("div", {},
        h("label", { class: "small muted", text: "Mensagem (edite à vontade)" }),
        msgInput
      ),
      temTelefone ? null : h("div", { class: "small text-warn", text: "Este cliente não tem telefone cadastrado. Edite o cadastro para enviar." })
    );

    var enviar = ui.button("Abrir no WhatsApp", { variant: "primary", icon: "whatsapp" });
    if (!temTelefone) { enviar.disabled = true; enviar.style.opacity = "0.5"; enviar.style.cursor = "not-allowed"; }
    var m = ui.modal({ title: "Mensagem WhatsApp", body: body, actions: [enviar], size: "md" });
    enviar.addEventListener("click", function () {
      if (!temTelefone) return;
      var d = (cliente.telefone || "").replace(/\D/g, "");
      if (d.indexOf("55") !== 0) d = "55" + d;
      window.open("https://wa.me/" + d + "?text=" + encodeURIComponent(msgInput.value || ""), "_blank");
      m.close();
    });
  }

  // botão pequeno de WhatsApp que abre o compositor com o nudge do tipo informado
  function btnNudge(cliente, tipo, label) {
    var b = ui.button(label || "WhatsApp", {
      variant: "soft", icon: "whatsapp",
      onClick: function () { abrirWhatsApp(cliente, C.mensagemNudge(cliente, tipo)); }
    });
    b.classList.add("btn-sm");
    return b;
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
        { name: "telefone", label: "Telefone", type: "text", placeholder: "(51) 9XXXX-XXXX" },
        { name: "cpf", label: "CPF", type: "text", placeholder: "000.000.000-00" },
        { name: "aniversario", label: "Aniversário (MM-DD)", type: "text", placeholder: "Ex.: 06-15" },
        { name: "pontos", label: "Colheres (pontos)", type: "number", step: "1" },
        { name: "cashback", label: "Cashback", type: "money", prefix: "R$" }
      ],
      validate: function (v) {
        var aniv = (v.aniversario || "").trim();
        if (aniv) {
          var mm = /^(\d{2})-(\d{2})$/.exec(aniv);
          if (!mm) return "Aniversário no formato MM-DD (ex.: 06-15).";
          var mes = Number(mm[1]), dia = Number(mm[2]);
          if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "Aniversário inválido. Use MM-DD (mês 01-12, dia 01-31).";
        }
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      var pontos = Math.max(0, Number(v.pontos) || 0);
      var cashback = Math.round((Number(v.cashback) || 0) * 100) / 100;
      var aniv = (v.aniversario || "").trim();
      if (editing) {
        C.update("clientes", cliente.id, {
          nome: v.nome,
          telefone: v.telefone || "",
          cpf: v.cpf || "",
          aniversario: aniv,
          pontos: pontos,
          cashback: cashback,
          nivel: C.nivelCliente(pontos)
        });
        ui.toast("Cliente atualizado.", "ok");
      } else {
        C.insert("clientes", {
          nome: v.nome,
          telefone: v.telefone || "",
          cpf: v.cpf || "",
          aniversario: aniv,
          pontos: pontos,
          cashback: cashback,
          nivel: C.nivelCliente(pontos),
          selos: 0,
          brindesDisponiveis: 0,
          visitas: 0,
          totalGasto: 0,
          primeiraCompra: C.todayISO(),
          ultimaCompra: C.todayISO(),
          codigo: "",
          indicadoPor: null
        });
        ui.toast("Cliente cadastrado no Clube.", "ok");
      }
      render(document.getElementById("content"));
    });
  }

  /* ---------- VER (ficha do cliente) ---------- */

  function verCliente(cliente) {
    var seg = C.analytics.segmentoCliente(cliente);
    var prog = C.progressoNivel(cliente);
    var meta = selosMeta();
    var selos = cliente.selos || 0;

    var body = h("div", { class: "stack", style: { gap: "16px" } });

    // identificação + badges
    body.appendChild(h("div", {},
      h("div", { class: "flex items-center gap", style: { gap: "8px", flexWrap: "wrap" } },
        h("span", { class: "cell-strong", style: { fontSize: "1.05rem" }, text: cliente.nome }),
        ui.badge(cliente.nivel || "Bronze", "accent"),
        badgeSegmento(seg.segmento)
      ),
      h("div", { class: "small muted mt-1", text: [cliente.telefone, cliente.cpf, cliente.codigo].filter(Boolean).join(" · ") || "Sem contato cadastrado" })
    ));

    // saldos / RFM
    body.appendChild(h("div", { class: "cost-breakdown" },
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Colheres" }), h("div", { class: "cb-val", text: fmt.int(cliente.pontos || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Cashback" }), h("div", { class: "cb-val", text: fmt.money(cliente.cashback || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Total gasto" }), h("div", { class: "cb-val", text: fmt.money(cliente.totalGasto || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Visitas" }), h("div", { class: "cb-val", text: fmt.int(cliente.visitas || 0) })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Recência" }), h("div", { class: "cb-val", text: seg.recencia >= 999 ? "—" : fmt.int(seg.recencia) + "d" })),
      h("div", { class: "cb" }, h("div", { class: "cb-lbl", text: "Aniversário" }), h("div", { class: "cb-val", text: cliente.aniversario || "—" }))
    ));

    // barra de progresso até o próximo nível
    var progBox = h("div", {});
    progBox.appendChild(h("div", { class: "flex between small muted", style: { marginBottom: "5px" } },
      h("span", { text: "Nível " + prog.nivel }),
      prog.proximo
        ? h("span", { text: "faltam " + fmt.int(prog.faltam) + " colheres pro " + prog.proximo })
        : h("span", { class: "text-accent", text: "nível máximo atingido" })
    ));
    progBox.appendChild(barLine(prog.pct, "var(--accent)", "9px"));
    body.appendChild(progBox);

    // cartão de selos (visual)
    var selosBox = h("div", {});
    selosBox.appendChild(h("div", { class: "flex between small muted", style: { marginBottom: "5px" } },
      h("span", { text: "Cartão de selos" }),
      h("span", { text: fmt.int(selos) + "/" + fmt.int(meta) })
    ));
    selosBox.appendChild(barLine(meta ? (selos / meta) * 100 : 0, "var(--accent)", "9px"));
    var faltaSelo = meta - selos;
    selosBox.appendChild(h("div", { class: "small muted mt-1", text: faltaSelo > 0 ? ("Faltam " + fmt.int(faltaSelo) + " selo(s) pro " + (fidConfig().brindeNome || "brinde")) : "Cartão completo!" }));
    body.appendChild(selosBox);

    // brindes disponíveis
    if ((cliente.brindesDisponiveis || 0) > 0) {
      body.appendChild(h("div", { class: "flex items-center gap", style: { gap: "8px", padding: "10px 12px", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: "10px" } },
        h("span", { html: C.icon("presente", 16), style: { color: "var(--accent)" } }),
        h("span", { class: "small", html: "<b>" + fmt.int(cliente.brindesDisponiveis) + " brinde(s) disponível(is)</b> — resgate no caixa." })
      ));
    }

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
      {
        key: "resgate", label: "Resgate", render: function (v) {
          return v.resgate ? '<span class="text-accent small">' + v.resgate + "</span>" : '<span class="cell-muted">—</span>';
        }
      },
      { key: "total", label: "Total", align: "right", render: function (v) { return h("span", { class: "cell-strong", text: fmt.money(v.total) }); } }
    ], vendas, { emptyMsg: "Nenhuma compra registrada para este cliente.", dense: true }));
    body.appendChild(histHost);

    // ações do rodapé
    var btnEditar = ui.button("Editar", { variant: "ghost", icon: "edit" });
    var btnZap = ui.button("Mensagem WhatsApp", { variant: "primary", icon: "whatsapp" });
    var m = ui.modal({ title: "Cliente", body: body, actions: [btnEditar, btnZap], size: "lg" });
    btnEditar.addEventListener("click", function () { m.close(); abrirClienteForm(cliente); });
    btnZap.addEventListener("click", function () {
      // tipo de nudge mais relevante para a situação do cliente
      var tipo = "reativacao";
      if (faltaSelo > 0 && faltaSelo <= 2) tipo = "brinde";
      else if (prog.proximo && prog.faltam > 0 && prog.faltam <= 80) tipo = "nivel";
      abrirWhatsApp(cliente, C.mensagemNudge(cliente, tipo));
    });
  }

  /* ---------- BLOCO DESTAQUE "Quase lá" ---------- */

  // uma linha do destaque: nome + detalhe + botão WhatsApp
  function linhaQuase(cliente, detalhe, tipoNudge) {
    var info = h("div", { style: { minWidth: "0" } },
      h("span", { class: "cell-strong", text: cliente.nome }),
      h("div", { class: "small muted", text: detalhe })
    );
    return h("div", { class: "list-row" }, info, h("div", { style: { flex: "none" } }, btnNudge(cliente, tipoNudge)));
  }

  function cardQuaseSelos(lista) {
    var corpo = h("div", { class: "stack", style: { gap: "0" } });
    if (!lista.length) {
      corpo.appendChild(ui.empty("Ninguém a poucos selos agora. Bora vender mais gelato!"));
    } else {
      lista.forEach(function (x) {
        corpo.appendChild(linhaQuase(
          x.cliente,
          "faltam " + fmt.int(x.faltam) + " selo(s) pro " + (fidConfig().brindeNome || "brinde"),
          "brinde"
        ));
      });
    }
    return ui.card("A poucos selos do brinde", corpo);
  }

  function cardQuaseNivel(lista) {
    var corpo = h("div", { class: "stack", style: { gap: "0" } });
    if (!lista.length) {
      corpo.appendChild(ui.empty("Ninguém perto de subir de nível por enquanto."));
    } else {
      lista.forEach(function (x) {
        corpo.appendChild(linhaQuase(
          x.cliente,
          "faltam " + fmt.int(x.faltam) + " colheres pro " + x.proximo,
          "nivel"
        ));
      });
    }
    return ui.card("Quase no próximo nível", corpo);
  }

  /* ---------- CARDS: brindes · aniversariantes · reativar ---------- */

  function cardListaClientes(titulo, lista, vazioMsg, tipoNudge, detalheFn) {
    var corpo = h("div", { class: "stack", style: { gap: "0" } });
    if (!lista.length) {
      corpo.appendChild(ui.empty(vazioMsg));
    } else {
      lista.forEach(function (c) {
        var detalhe = detalheFn ? detalheFn(c) : ((c.telefone || "sem telefone") + " · " + haDias(c));
        corpo.appendChild(linhaQuase(c, detalhe, tipoNudge));
      });
    }
    return ui.card(titulo, corpo);
  }

  /* ---------- RENDER PRINCIPAL ---------- */

  function render(root) {
    ui.clear(root);
    root.appendChild(ui.pageHeader(
      "Clientes",
      "Clube Cellos — fidelidade, segmentação e reativação.",
      [ui.button("Novo cliente", { icon: "plus", onClick: function () { abrirClienteForm(null); } })]
    ));

    var clientes = C.table("clientes");
    var vips = clientes.filter(function (c) { return segOf(c) === "VIP"; });
    var aniversariantes = C.analytics.clientesAniversariantes();
    var quase = C.analytics.quaseGanhando();
    var quaseTotal = quase.selos.length + quase.nivel.length;
    var emRisco = C.analytics.clientesEmRisco();

    // KPIs (grid-4)
    root.appendChild(h("div", { class: "grid grid-4 mb-2" },
      ui.kpi({ label: "Total de clientes", value: fmt.int(clientes.length), icon: "clube", accent: "accent" }),
      ui.kpi({ label: "VIPs", value: fmt.int(vips.length), icon: "star", accent: "success" }),
      ui.kpi({ label: "Aniversariantes do mês", value: fmt.int(aniversariantes.length), icon: "sino", accent: "info" }),
      ui.kpi({ label: "Quase ganhando", value: fmt.int(quaseTotal), icon: "presente", accent: "warn", foot: "perto de um brinde ou novo nível" })
    ));

    // ---------- DESTAQUE "Quase lá" (o mais importante) ----------
    root.appendChild(h("h2", { class: "card-title", style: { margin: "4px 0 10px", fontFamily: "var(--serif)", fontSize: "1.15rem" } }, "Quase lá — chame no WhatsApp e traga de volta"));
    root.appendChild(h("div", { class: "grid grid-2 mb-2" },
      cardQuaseSelos(quase.selos),
      cardQuaseNivel(quase.nivel)
    ));

    // ---------- Brindes para resgatar ----------
    root.appendChild(cardListaClientes(
      "Brindes para resgatar",
      quase.comBrinde,
      "Nenhum brinde aguardando resgate.",
      "brinde",
      function (c) {
        return fmt.int(c.brindesDisponiveis || 0) + " brinde(s) · " + (c.telefone || "sem telefone") + " · " + haDias(c);
      }
    ));

    // ---------- Aniversariantes + Reativar (lado a lado) ----------
    root.appendChild(h("div", { class: "grid grid-2 mb-2" },
      cardListaClientes(
        "Aniversariantes do mês",
        aniversariantes,
        "Nenhum aniversariante neste mês.",
        "aniversario",
        function (c) { return "aniv. " + (c.aniversario || "—") + " · " + (c.telefone || "sem telefone"); }
      ),
      cardListaClientes(
        "Reativar (em risco / sumidos)",
        emRisco,
        "Nenhum cliente em risco. Carteira aquecida!",
        "reativacao"
      )
    ));

    // ---------- Filtros: busca + chips de segmento ----------
    var buscaInput = h("input", { type: "text", placeholder: "Buscar por nome, telefone ou CPF...", value: state.busca });
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

    // ---------- Tabela de clientes ----------
    var tableHost = h("div", {});
    root.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    var meta = selosMeta();

    function draw() {
      var termo = (state.busca || "").trim().toLowerCase();
      var digitos = termo.replace(/\D/g, "");
      var rows = C.table("clientes").filter(function (c) {
        if (state.seg !== "Todos" && segOf(c) !== state.seg) return false;
        if (termo) {
          var nomeOk = (c.nome || "").toLowerCase().indexOf(termo) >= 0;
          var telOk = digitos.length >= 3 && (c.telefone || "").replace(/\D/g, "").indexOf(digitos) >= 0;
          var cpfOk = digitos.length >= 3 && (c.cpf || "").replace(/\D/g, "").indexOf(digitos) >= 0;
          if (!nomeOk && !telOk && !cpfOk) return false;
        }
        return true;
      }).sort(function (a, b) { return (b.totalGasto || 0) - (a.totalGasto || 0); });

      var cols = [
        { key: "nome", label: "Nome", render: function (c) { return h("span", { class: "cell-strong", text: c.nome }); } },
        { key: "telefone", label: "Telefone", render: function (c) { return c.telefone || "—"; } },
        { key: "cpf", label: "CPF", render: function (c) { return c.cpf || "—"; } },
        { key: "nivel", label: "Nível", render: function (c) { return ui.badge(c.nivel || "Bronze", "accent"); } },
        { key: "segmento", label: "Segmento", render: function (c) { return badgeSegmento(segOf(c)); } },
        { key: "pontos", label: "Colheres", align: "right", render: function (c) { return fmt.int(c.pontos || 0); } },
        {
          key: "selos", label: "Selos", render: function (c) {
            var s = c.selos || 0;
            return h("div", { style: { minWidth: "84px" } },
              h("div", { class: "small muted", style: { marginBottom: "3px" }, text: fmt.int(s) + "/" + fmt.int(meta) }),
              barLine(meta ? (s / meta) * 100 : 0, "var(--accent)", "6px")
            );
          }
        },
        {
          key: "ultimaCompra", label: "Última compra", render: function (c) {
            if (!c.ultimaCompra) return '<span class="cell-muted">—</span>';
            return h("div", {},
              h("span", { text: fmt.date(c.ultimaCompra) }),
              h("div", { class: "small muted", text: haDias(c) })
            );
          }
        }
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
  }

  C.registerModule({ id: "clientes", label: "Clientes", icon: "clube", order: 4.5, roles: ["gestor"], render: render });
})();
