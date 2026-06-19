/* ============================================================
   Módulo: RELATÓRIOS (somente gestor)
   Duas abas (.chip):
     - Variância de CMV (janela de 7 dias)
     - Engenharia de cardápio (janela de 30 dias)
   Usa C.analytics.variancaCMV(7) e C.analytics.engenhariaCardapio(30).
   Segue o padrão de modules/limpeza.js e modules/estoque.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // estado de navegação interna (aba ativa)
  var state = { aba: "cmv" };

  /* ---------- ABA VARIÂNCIA DE CMV ---------- */

  // badge a partir do status calculado pelo analytics
  function badgeStatusCMV(status) {
    if (status === "danger") return ui.badge("Verificar", "danger");
    if (status === "warn") return ui.badge("Atenção", "warn");
    return ui.badge("OK", "ok");
  }

  // diagnóstico curto conforme o sinal do não explicado
  function diagnosticoCMV(naoExplicado) {
    if (naoExplicado < -0.001) return "Saiu menos que o esperado — conferir lançamentos.";
    if (naoExplicado > 0.001) return "Saiu mais que o vendido — porcionamento / perda / furto.";
    return "Dentro do esperado.";
  }

  function renderCMV(host) {
    ui.clear(host);

    var linhas = C.analytics.variancaCMV(7);

    // soma do custo não explicado (em módulo, para indicar o tamanho do problema)
    var custoNaoExpl = linhas.reduce(function (s, x) {
      return s + Math.abs(x.custoNaoExplicado || 0);
    }, 0);
    var accent = custoNaoExpl >= 30 ? "danger" : custoNaoExpl >= 10 ? "warn" : "success";

    // explicação
    host.appendChild(ui.card(null,
      h("p", { class: "muted", style: { margin: "0", lineHeight: "1.55" } },
        "Compara o que ", h("b", { text: "saiu do estoque" }), " de verdade (movimentações de saída) com o que as ",
        h("b", { text: "vendas" }), " deveriam ter consumido somado às ", h("b", { text: "perdas" }),
        " registradas. A diferença é o ", h("b", { text: "não explicado" }),
        " — porcionamento fora do padrão, furto ou erro de lançamento. Janela: últimos 7 dias."
      )
    ));

    // KPI
    host.appendChild(h("div", { class: "grid grid-3 mt-2 mb-2" },
      ui.kpi({
        label: "Não explicado (R$)",
        value: fmt.money(custoNaoExpl),
        icon: "alert",
        accent: accent,
        foot: linhas.length + (linhas.length === 1 ? " item com saída" : " itens com saída no período")
      })
    ));

    // tabela
    var cols = [
      { key: "item", label: "Item", render: function (x) { return h("span", { class: "cell-strong", text: x.item ? x.item.nome : "—" }); } },
      { key: "real", label: "Saída real", align: "right", render: function (x) { return fmt.num(x.real, 3) + " " + (x.item ? x.item.unidade : ""); } },
      { key: "vendas", label: "Explicado por vendas", align: "right", render: function (x) { return fmt.num(x.vendas, 3) + " " + (x.item ? x.item.unidade : ""); } },
      { key: "perdas", label: "Perdas", align: "right", render: function (x) { return fmt.num(x.perdas, 3) + " " + (x.item ? x.item.unidade : ""); } },
      {
        key: "naoExplicado", label: "Não explicado", align: "right", render: function (x) {
          var cor = x.status === "danger" ? "text-danger" : x.status === "warn" ? "text-warn" : "";
          return h("div", {},
            h("span", { class: "cell-strong " + cor, text: fmt.num(x.naoExplicado, 3) + " " + (x.item ? x.item.unidade : "") }),
            h("div", { class: "cell-muted", text: fmt.money(x.custoNaoExplicado) })
          );
        }
      },
      { key: "status", label: "Status", align: "center", render: function (x) { return badgeStatusCMV(x.status); } },
      { key: "diag", label: "Diagnóstico", render: function (x) { return h("span", { class: "cell-muted", text: diagnosticoCMV(x.naoExplicado) }); } }
    ];

    host.appendChild(ui.card(null, ui.table(cols, linhas, {
      emptyMsg: "Sem saídas de estoque nos últimos 7 dias para analisar.",
      dense: true
    }), { class: "card-body" }));
  }

  /* ---------- ABA ENGENHARIA DE CARDÁPIO ---------- */

  // metadados de cada quadrante (cor do badge e da borda do cartão)
  var QUADRANTES = [
    { nome: "Estrela", kind: "ok", cor: "var(--ok)", desc: "Alta popularidade + alta margem" },
    { nome: "Cavalo de batalha", kind: "info", cor: "var(--info)", desc: "Alta popularidade + baixa margem" },
    { nome: "Quebra-cabeça", kind: "warn", cor: "var(--warn)", desc: "Baixa popularidade + alta margem" },
    { nome: "Abacaxi", kind: "danger", cor: "var(--danger)", desc: "Baixa popularidade + baixa margem" }
  ];

  function cardQuadrante(meta, linhas) {
    var doQuadrante = linhas.filter(function (l) { return l.quadrante === meta.nome; });

    var corpo = h("div", { style: { padding: "14px 16px" } });
    // cabeçalho do cartão: nome do quadrante + badge + descrição
    corpo.appendChild(h("div", { class: "flex items-center", style: { gap: "8px", flexWrap: "wrap" } },
      h("span", { class: "cell-strong", style: { fontSize: "1rem" }, text: meta.nome }),
      ui.badge(meta.kind === "ok" ? "Estrela" : meta.kind === "info" ? "Cavalo" : meta.kind === "warn" ? "Quebra-cabeça" : "Abacaxi", meta.kind)
    ));
    corpo.appendChild(h("p", { class: "small muted", style: { margin: "4px 0 10px" }, text: meta.desc }));

    if (!doQuadrante.length) {
      corpo.appendChild(h("div", { class: "cell-muted small", text: "Nenhum produto neste quadrante." }));
    } else {
      var lista = h("div", { class: "stack", style: { gap: "8px" } });
      doQuadrante.sort(function (a, b) { return b.qtd - a.qtd; }).forEach(function (l) {
        lista.appendChild(h("div", { class: "list-row", style: { padding: "8px 0" } },
          h("div", { style: { minWidth: "0" } },
            h("div", { class: "cell-strong", text: l.produto.nome }),
            h("div", { class: "cell-muted", text: fmt.int(l.qtd) + " vendidos · margem " + fmt.money(l.margemUnit) + "/un" })
          ),
          h("div", { class: "cell-strong", style: { flex: "none" }, text: fmt.money(l.margemTotal) })
        ));
      });
      corpo.appendChild(lista);
    }

    var card = ui.card(null, corpo, { class: "card-body" });
    card.style.borderLeft = "4px solid " + meta.cor;
    return card;
  }

  function renderEngenharia(host) {
    ui.clear(host);

    var dados = C.analytics.engenhariaCardapio(30);
    var linhas = dados.linhas || [];

    // explicação
    host.appendChild(ui.card(null,
      h("p", { class: "muted", style: { margin: "0", lineHeight: "1.55" } },
        "Cruza ", h("b", { text: "popularidade" }), " (quanto cada produto vende) com a ",
        h("b", { text: "margem de contribuição" }), " (preço menos custo médio) e classifica o cardápio em quatro quadrantes. ",
        "Medianas de corte: ", h("b", { text: fmt.int(dados.medianaQtd) + " vendas" }),
        " e ", h("b", { text: fmt.money(dados.medianaMargem) + " de margem" }), ". Janela: últimos 30 dias."
      )
    ));

    // quadro 2x2 (grid grid-2 com os quatro cartões)
    var grid = h("div", { class: "grid grid-2 mt-2 mb-2" });
    QUADRANTES.forEach(function (meta) { grid.appendChild(cardQuadrante(meta, linhas)); });
    host.appendChild(grid);

    // tabela complementar ordenada por margem total desc
    var ordenadas = linhas.slice().sort(function (a, b) { return b.margemTotal - a.margemTotal; });
    var cols = [
      { key: "produto", label: "Produto", render: function (l) { return h("span", { class: "cell-strong", text: l.produto.nome }); } },
      { key: "qtd", label: "Vendidos", align: "right", render: function (l) { return fmt.int(l.qtd); } },
      { key: "margemUnit", label: "Margem unitária", align: "right", render: function (l) { return fmt.money(l.margemUnit); } },
      { key: "margemTotal", label: "Margem total", align: "right", render: function (l) { return h("span", { class: "cell-strong", text: fmt.money(l.margemTotal) }); } },
      {
        key: "quadrante", label: "Quadrante", render: function (l) {
          var meta = QUADRANTES.filter(function (q) { return q.nome === l.quadrante; })[0];
          return ui.badge(l.quadrante, meta ? meta.kind : "neutral");
        }
      },
      { key: "acao", label: "Ação", render: function (l) { return h("span", { class: "cell-muted", text: l.acao }); } }
    ];

    host.appendChild(ui.card(null, ui.table(cols, ordenadas, {
      emptyMsg: "Sem produtos para analisar.",
      dense: true
    }), { class: "card-body" }));
  }

  /* ---------- RENDER PRINCIPAL (abas) ---------- */

  function render(root) {
    ui.clear(root);
    root.appendChild(ui.pageHeader(
      "Relatórios",
      "Inteligência de custo e cardápio para decidir com dados.",
      []
    ));

    // abas (.chip)
    var abas = [
      { id: "cmv", label: "Variância de CMV" },
      { id: "cardapio", label: "Engenharia de cardápio" }
    ];
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

    if (state.aba === "cardapio") renderEngenharia(host);
    else renderCMV(host);
  }

  C.registerModule({ id: "relatorios", label: "Relatórios", icon: "grafico", order: 1.5, roles: ["gestor"], render: render });
})();
