/* ============================================================
   Módulo: FIDELIDADE (Clube Cellos)
   - Painel: KPIs do programa + "quase ganhando" (passivo de colheres/brindes)
   - Prêmios: catálogo trocado por colheres no caixa (CRUD)
   - Configurações: regras do programa (config.fidelidade) — NÃO é tabela
   Abas internas (.chip): Painel · Prêmios · Configurações
   Segue o padrão de modules/limpeza.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  var state = { aba: "painel" };

  function content() { return document.getElementById("content"); }
  function rerender() { render(content()); }

  /* ---------- ABA PAINEL ---------- */

  function renderPainel(host) {
    ui.clear(host);
    var k = C.analytics.fidelidadeKPIs(30);

    host.appendChild(h("div", { class: "grid grid-4 mb-2" },
      ui.kpi({ label: "Membros do Clube", value: fmt.int(k.membros), icon: "clube", accent: "accent" }),
      ui.kpi({ label: "Vendas com membro (30d)", value: fmt.pct(k.pctVendasMembros), icon: "grafico", accent: "info", foot: "Participação no faturamento" }),
      ui.kpi({ label: "Ticket do membro", value: fmt.money(k.ticketMembro), icon: "money", accent: "success", foot: "Média por venda identificada" }),
      ui.kpi({ label: "Taxa de retorno", value: fmt.pct(k.taxaRetorno), icon: "user", accent: "accent", foot: "Clientes com mais de uma visita" })
    ));

    host.appendChild(h("div", { class: "grid grid-3 mb-2" },
      ui.kpi({ label: "Colheres em circulação", value: fmt.int(k.colheresCirculacao), icon: "star", accent: "warn", foot: "Pontos acumulados pelos clientes" }),
      ui.kpi({ label: "Brindes pendentes", value: fmt.int(k.brindesPendentes), icon: "presente", accent: "warn", foot: "Já conquistados, ainda não retirados" }),
      ui.kpi({ label: "Resgates (30d)", value: fmt.int(k.resgatesPeriodo), icon: "check", accent: "info", foot: "Vendas com recompensa aplicada" })
    ));

    // resumo do "quase ganhando" — quem está perto de uma recompensa
    var q = C.analytics.quaseGanhando();
    var nSelos = q.selos.length, nNivel = q.nivel.length, nBrinde = q.comBrinde.length;

    function linhaAcao(icone, texto, total) {
      var btn = ui.button("Ver na lista de clientes", { variant: "soft", icon: "user", onClick: function () { C.navigate("clientes"); } });
      btn.classList.add("btn-sm");
      return h("div", { class: "list-row", style: { alignItems: "center" } },
        h("div", { class: "flex items-center", style: { gap: "10px", minWidth: "0" } },
          h("span", { class: "kpi-ic", html: C.icon(icone, 18) }),
          h("div", {},
            h("div", { class: "cell-strong", text: total + " " + texto }),
            null
          )
        ),
        h("div", { style: { flex: "none" } }, total > 0 ? btn : ui.badge("Nada por agora", "neutral"))
      );
    }

    var lista = h("div", { class: "stack" },
      linhaAcao("presente", "cliente(s) a poucos selos do brinde", nSelos),
      linhaAcao("star", "cliente(s) quase no próximo nível", nNivel),
      linhaAcao("clube", "cliente(s) com brinde para resgatar", nBrinde)
    );

    host.appendChild(ui.card("Oportunidades — quem está quase ganhando", lista));

    // explicação do passivo
    host.appendChild(ui.card("O que é o passivo do Clube", h("div", {},
      h("p", { class: "muted", style: { margin: "0 0 8px", lineHeight: "1.55" },
        text: "As colheres em circulação e os brindes pendentes são o \"passivo\" do programa: recompensas que os clientes já acumularam e que a casa ainda \"deve\" entregar. Cada colher vale um direito futuro de desconto ou brinde, então acompanhe esse saldo como acompanharia uma conta a pagar." }),
      h("p", { class: "muted", style: { margin: "0", lineHeight: "1.55" },
        text: "Quanto maior o passivo, maior o engajamento — mas também maior o impacto quando os clientes resgatam. Use as oportunidades acima para trazer de volta quem está a poucos passos de uma recompensa." })
    )));
  }

  /* ---------- ABA PRÊMIOS ---------- */

  function badgeTipo(tipo) {
    if (tipo === "produto") return ui.badge("Produto", "accent");
    if (tipo === "desconto") return ui.badge("Desconto", "info");
    if (tipo === "cobertura") return ui.badge("Cobertura", "warn");
    return ui.badge(tipo || "—", "neutral");
  }

  function openPremioForm(premio) {
    var editing = !!premio;
    var produtos = C.table("produtos").map(function (p) { return { value: p.id, label: p.nome }; });
    var vals = premio
      ? { nome: premio.nome, custoPontos: premio.custoPontos, tipo: premio.tipo, produtoId: premio.produtoId || (produtos[0] && produtos[0].value), valor: premio.valor, ativo: premio.ativo !== false }
      : { tipo: "produto", produtoId: produtos[0] && produtos[0].value, ativo: true };

    ui.formModal({
      title: editing ? "Editar prêmio" : "Novo prêmio",
      size: "md",
      values: vals,
      fields: [
        { name: "nome", label: "Nome do prêmio", type: "text", required: true, full: true, placeholder: "Ex.: Casquinha 1 bola grátis" },
        { name: "custoPontos", label: "Custo (colheres)", type: "number", required: true, min: 0, step: "1" },
        { name: "tipo", label: "Tipo", type: "select", required: true, options: [
          { value: "produto", label: "Produto grátis" },
          { value: "desconto", label: "Desconto em reais" },
          { value: "cobertura", label: "Cobertura / adicional" }
        ] },
        { name: "produtoId", label: "Produto (se tipo Produto)", type: "select", options: produtos },
        { name: "valor", label: "Valor do desconto (R$, se tipo Desconto)", type: "money", min: 0 },
        { name: "ativo", label: "Ativo no catálogo", type: "checkbox" }
      ],
      validate: function (v) {
        if (v.custoPontos == null || v.custoPontos < 0) return "Informe o custo em colheres.";
        if (v.tipo === "produto" && !v.produtoId) return "Escolha o produto do prêmio.";
        if (v.tipo === "desconto" && (v.valor == null || v.valor <= 0)) return "Informe o valor do desconto.";
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      var row = {
        nome: v.nome,
        custoPontos: Number(v.custoPontos) || 0,
        tipo: v.tipo,
        ativo: !!v.ativo,
        // limpa campos que não pertencem ao tipo (evita resíduo ao trocar o tipo na edição)
        produtoId: v.tipo === "produto" ? v.produtoId : null,
        valor: v.tipo === "desconto" ? (Number(v.valor) || 0) : null
      };

      if (editing) { C.update("premios", premio.id, row); ui.toast("Prêmio atualizado.", "ok"); }
      else { C.insert("premios", row); ui.toast("Prêmio cadastrado.", "ok"); }
      rerender();
    });
  }

  function detalhePremio(p) {
    if (p.tipo === "produto") {
      var prod = C.find("produtos", p.produtoId);
      return prod ? prod.nome : "(produto removido)";
    }
    if (p.tipo === "desconto") return fmt.money(p.valor);
    return "—";
  }

  function renderPremios(host) {
    ui.clear(host);
    var premios = C.table("premios");

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    ui.clear(tableHost);
    tableHost.appendChild(ui.table([
      { key: "nome", label: "Prêmio", render: function (p) { return h("span", { class: "cell-strong", text: p.nome }); } },
      { key: "custoPontos", label: "Custo", render: function (p) { return fmt.int(p.custoPontos) + " colheres"; } },
      { key: "tipo", label: "Tipo", render: function (p) { return badgeTipo(p.tipo); } },
      { key: "detalhe", label: "Detalhe", render: function (p) { return detalhePremio(p); } },
      { key: "ativo", label: "Ativo", align: "right", render: function (p) { return p.ativo !== false ? ui.badge("Ativo", "ok") : ui.badge("Inativo", "neutral"); } }
    ], premios, {
      emptyMsg: "Nenhum prêmio cadastrado. Use \"Novo prêmio\".",
      actions: function (p) {
        return [
          ui.iconButton("edit", function () { openPremioForm(p); }, "Editar"),
          ui.iconButton("trash", function () {
            ui.confirm("Excluir o prêmio \"" + p.nome + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
              if (ok) { C.remove("premios", p.id); ui.toast("Prêmio excluído.", "ok"); rerender(); }
            });
          }, "Excluir")
        ];
      }
    }));
  }

  /* ---------- ABA CONFIGURAÇÕES ---------- */

  function renderConfig(host) {
    ui.clear(host);
    var fid = C.get().config.fidelidade || {};
    var niveis = fid.niveis || [];

    // helpers de campo
    function field(label, input, help) {
      var wrap = h("div", { class: "form-field" }, h("label", { text: label }), input);
      if (help) wrap.appendChild(h("span", { class: "field-help", text: help }));
      return wrap;
    }
    function inputNumber(value, step, min) {
      var i = h("input", { type: "number" });
      if (step) i.step = step;
      if (min != null) i.min = min;
      if (value != null) i.value = value;
      return i;
    }
    function inputText(value) {
      var i = h("input", { type: "text" });
      if (value != null) i.value = value;
      return i;
    }
    function inputArea(value) {
      var t = h("textarea", { rows: 3 });
      if (value != null) t.value = value;
      return t;
    }
    function nivelMin(nome) {
      var n = niveis.filter(function (x) { return x.nome === nome; })[0];
      return n ? n.min : null;
    }

    // ----- regras gerais -----
    var inPontos = inputNumber(fid.pontosPorReal, "0.1", 0);
    var inSelos = inputNumber(fid.selosMeta, "1", 1);
    var inBrinde = inputText(fid.brindeNome);
    var inValidade = inputNumber(fid.validadeDias, "1", 0);
    var inDia = h("select", {});
    ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].forEach(function (nome, idx) {
      var opt = h("option", { value: idx, text: nome });
      if (Number(fid.diaEmDobro) === idx) opt.selected = true;
      inDia.appendChild(opt);
    });

    var gridRegras = h("div", { class: "form-grid" },
      field("Colheres por R$ 1", inPontos, "Quantos pontos o cliente ganha por real gasto."),
      field("Selos para o brinde", inSelos, "Compras necessárias para fechar o cartão."),
      field("Nome do brinde do cartão", inBrinde),
      field("Dia em dobro", inDia, "Dia da semana em que as colheres contam em dobro."),
      field("Validade dos pontos (dias)", inValidade, "Após quantos dias as colheres expiram.")
    );
    host.appendChild(ui.card("Regras do programa", gridRegras));

    // ----- níveis -----
    var inPrata = inputNumber(nivelMin("Prata"), "1", 0);
    var inOuro = inputNumber(nivelMin("Ouro"), "1", 0);
    var inDiamante = inputNumber(nivelMin("Diamante"), "1", 0);
    var gridNiveis = h("div", { class: "form-grid" },
      field("Prata — colheres mínimas", inPrata),
      field("Ouro — colheres mínimas", inOuro),
      field("Diamante — colheres mínimas", inDiamante)
    );
    host.appendChild(ui.card("Faixas de nível (mínimo de colheres)", h("div", {},
      h("p", { class: "muted", style: { margin: "0 0 12px", lineHeight: "1.5" },
        text: "Bronze começa em 0. Defina a partir de quantas colheres o cliente sobe para cada nível." }),
      gridNiveis
    )));

    // ----- mensagens -----
    var inQuaseBrinde = inputArea(fid.msgQuaseBrinde);
    var inQuaseNivel = inputArea(fid.msgQuaseNivel);
    var inAniversario = inputArea(fid.msgAniversario);
    var inReativacao = inputArea(fid.msgReativacao);

    var msgsBody = h("div", {},
      h("p", { class: "muted", style: { margin: "0 0 12px", lineHeight: "1.5" } },
        "Variáveis disponíveis: ",
        h("code", { text: "{{nome}}" }), " ",
        h("code", { text: "{{faltam}}" }), " ",
        h("code", { text: "{{nivel}}" }), " ",
        h("code", { text: "{{selos}}" }), " ",
        h("code", { text: "{{recompensa}}" }),
        " — elas são trocadas pelos dados do cliente ao enviar a mensagem."),
      h("div", { class: "stack" },
        field("Quase no brinde (cartão de selos)", inQuaseBrinde),
        field("Quase no próximo nível", inQuaseNivel),
        field("Aniversário", inAniversario),
        field("Reativação (cliente sumido)", inReativacao)
      )
    );
    host.appendChild(ui.card("Modelos de mensagem", msgsBody));

    // ----- salvar -----
    var salvar = ui.button("Salvar configurações", { variant: "primary", icon: "check", onClick: function () {
      var cfg = C.get().config.fidelidade;

      cfg.pontosPorReal = inPontos.value === "" ? 1 : Number(inPontos.value);
      cfg.selosMeta = inSelos.value === "" ? 10 : Number(inSelos.value);
      cfg.brindeNome = inBrinde.value;
      cfg.diaEmDobro = Number(inDia.value);
      cfg.validadeDias = inValidade.value === "" ? 0 : Number(inValidade.value);

      cfg.msgQuaseBrinde = inQuaseBrinde.value;
      cfg.msgQuaseNivel = inQuaseNivel.value;
      cfg.msgAniversario = inAniversario.value;
      cfg.msgReativacao = inReativacao.value;

      // limites de nível
      function setMin(nome, input) {
        var n = (cfg.niveis || []).filter(function (x) { return x.nome === nome; })[0];
        if (n && input.value !== "") n.min = Number(input.value);
      }
      setMin("Prata", inPrata);
      setMin("Ouro", inOuro);
      setMin("Diamante", inDiamante);

      C.save();
      ui.toast("Configurações salvas.", "ok");
      rerender();
    } });

    host.appendChild(h("div", { class: "flex", style: { justifyContent: "flex-end", marginTop: "4px" } }, salvar));
  }

  /* ---------- RENDER PRINCIPAL (abas) ---------- */

  function render(root) {
    ui.clear(root);
    root.appendChild(ui.pageHeader(
      "Fidelidade",
      "Programa de pontos, prêmios e regras do Clube Cellos.",
      state.aba === "premios"
        ? [ui.button("Novo prêmio", { icon: "plus", onClick: function () { openPremioForm(null); } })]
        : []
    ));

    var abas = [
      { id: "painel", label: "Painel" },
      { id: "premios", label: "Prêmios" },
      { id: "config", label: "Configurações" }
    ];
    var chips = h("div", { class: "chips mb-2" });
    abas.forEach(function (a) {
      var chip = h("button", { class: "chip" + (state.aba === a.id ? " active" : ""), type: "button", text: a.label });
      chip.addEventListener("click", function () { state.aba = a.id; rerender(); });
      chips.appendChild(chip);
    });
    root.appendChild(chips);

    var host = h("div", {});
    root.appendChild(host);

    if (state.aba === "premios") renderPremios(host);
    else if (state.aba === "config") renderConfig(host);
    else renderPainel(host);
  }

  C.registerModule({ id: "fidelidade", label: "Fidelidade", icon: "presente", order: 4.6, roles: ["gestor"], render: render });
})();
