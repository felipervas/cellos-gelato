/* ============================================================
   Módulo: LIMPEZA  (checklist de higiene/operação com registro
   de quem fez e a que horas)
   Abas internas (.chip): Hoje · Tarefas · Histórico
   Segue o padrão de modules/produtos.js.
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  // estado de navegação interna (aba ativa + filtro do histórico)
  var state = { aba: "hoje", filtroData: "" };

  /* ---------- helpers ---------- */

  // registro de HOJE para uma tarefa (ou null)
  function registroHoje(tarefaId) {
    var hoje = C.todayISO();
    return C.table("limpezaRegistros").filter(function (r) {
      return r.tarefaId === tarefaId && r.data === hoje;
    })[0] || null;
  }

  function badgeFrequencia(freq) {
    if (freq === "semanal") return ui.badge("Semanal", "info");
    return ui.badge("Diária", "accent");
  }

  function operadorOptions() {
    return (C.get().config.operadores || []).slice();
  }

  /* ---------- ABA HOJE ---------- */

  // abre um pequeno modal pedindo o responsável e marca como feito
  function marcarFeito(tarefa) {
    var ops = operadorOptions();
    if (!ops.length) { ui.toast("Cadastre operadores na configuração.", "warn"); return; }
    ui.formModal({
      title: "Marcar como feito",
      size: "sm",
      values: { responsavel: ops[0] },
      fields: [
        { name: "tarefa", label: "Tarefa", type: "text", value: tarefa.nome, full: true },
        { name: "responsavel", label: "Quem realizou?", type: "select", options: ops, required: true, full: true }
      ]
    }).then(function (v) {
      if (!v) return;
      C.registrarLimpeza(tarefa.id, v.responsavel);
      ui.toast("Tarefa marcada como feita.", "ok");
      render(document.getElementById("content"));
    });
  }

  function renderHoje(host) {
    ui.clear(host);
    var tarefas = C.table("limpezaTarefas");

    // resumo das tarefas diárias concluídas hoje
    var diarias = tarefas.filter(function (t) { return t.frequencia === "diaria"; });
    var diariasFeitas = diarias.filter(function (t) { return registroHoje(t.id); }).length;

    host.appendChild(h("div", { class: "grid grid-3 mb-2" },
      ui.kpi({
        label: "Tarefas diárias hoje",
        value: fmt.int(diariasFeitas) + " de " + fmt.int(diarias.length),
        icon: "check",
        accent: diarias.length && diariasFeitas >= diarias.length ? "success" : "warn",
        foot: diarias.length ? fmt.pct(diarias.length ? diariasFeitas / diarias.length * 100 : 0) + " concluído" : "Sem tarefas diárias"
      }),
      ui.kpi({
        label: "Total de tarefas",
        value: fmt.int(tarefas.length),
        icon: "limpeza",
        accent: "accent"
      }),
      ui.kpi({
        label: "Registros de hoje",
        value: fmt.int(C.analytics.limpezasHoje().length),
        icon: "clock",
        accent: "info"
      })
    ));

    if (!tarefas.length) {
      host.appendChild(ui.card(null, ui.empty("Nenhuma tarefa de limpeza cadastrada. Use a aba Tarefas."), { class: "card-body" }));
      return;
    }

    var lista = h("div", { class: "stack" });
    tarefas.forEach(function (t) {
      var reg = registroHoje(t.id);

      var esquerda = h("div", { style: { minWidth: "0" } },
        h("div", { class: "flex items-center gap", style: { gap: "8px", flexWrap: "wrap" } },
          h("span", { class: "cell-strong", text: t.nome }),
          ui.badge(t.area || "Geral", "neutral"),
          badgeFrequencia(t.frequencia)
        ),
        t.descricao ? h("p", { class: "small muted mt-1", text: t.descricao }) : null
      );

      var direita;
      if (reg) {
        direita = ui.badge("Feito por " + reg.responsavel + " às " + (reg.hora || fmt.time(reg.datetime)), "ok");
      } else {
        direita = ui.button("Marcar como feito", {
          variant: "soft", icon: "check",
          onClick: function () { marcarFeito(t); }
        });
        direita.classList.add("btn-sm");
      }

      lista.appendChild(h("div", {
        class: "list-row",
        style: { alignItems: "flex-start" }
      }, esquerda, h("div", { style: { flex: "none" } }, direita)));
    });

    host.appendChild(ui.card("Checklist de hoje — " + fmt.date(C.todayISO()), lista));
  }

  /* ---------- ABA TAREFAS ---------- */

  function openTarefaForm(tarefa) {
    var editing = !!tarefa;
    ui.formModal({
      title: editing ? "Editar tarefa" : "Nova tarefa",
      size: "md",
      values: tarefa || { frequencia: "diaria" },
      fields: [
        { name: "nome", label: "Nome da tarefa", type: "text", required: true, full: true, placeholder: "Ex.: Higienizar a produtora" },
        { name: "area", label: "Área", type: "text", required: true, placeholder: "Ex.: Produção, Atendimento, Estoque, Financeiro" },
        { name: "frequencia", label: "Frequência", type: "select", options: [{ value: "diaria", label: "Diária" }, { value: "semanal", label: "Semanal" }], required: true },
        { name: "descricao", label: "Descrição / instruções", type: "textarea", rows: 3, full: true, placeholder: "O que fazer e como" }
      ]
    }).then(function (v) {
      if (!v) return;
      if (editing) { C.update("limpezaTarefas", tarefa.id, v); ui.toast("Tarefa atualizada.", "ok"); }
      else { C.insert("limpezaTarefas", v); ui.toast("Tarefa cadastrada.", "ok"); }
      render(document.getElementById("content"));
    });
  }

  function renderTarefas(host) {
    ui.clear(host);
    var tarefas = C.table("limpezaTarefas");

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    tableHost.appendChild(ui.table([
      { key: "nome", label: "Tarefa", render: function (t) { return h("span", { class: "cell-strong", text: t.nome }); } },
      { key: "area", label: "Área", render: function (t) { return ui.badge(t.area || "Geral", "neutral"); } },
      { key: "frequencia", label: "Frequência", render: function (t) { return badgeFrequencia(t.frequencia); } },
      {
        key: "descricao", label: "Descrição", render: function (t) {
          if (!t.descricao) return '<span class="cell-muted">—</span>';
          return '<span class="cell-muted">' + t.descricao + "</span>";
        }
      }
    ], tarefas, {
      emptyMsg: "Nenhuma tarefa cadastrada.",
      actions: function (t) {
        return [
          ui.iconButton("edit", function () { openTarefaForm(t); }, "Editar"),
          ui.iconButton("trash", function () {
            ui.confirm("Excluir a tarefa \"" + t.nome + "\"?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
              if (ok) { C.remove("limpezaTarefas", t.id); ui.toast("Tarefa excluída.", "ok"); render(document.getElementById("content")); }
            });
          }, "Excluir")
        ];
      }
    }));
  }

  /* ---------- ABA HISTÓRICO ---------- */

  function renderHistorico(host) {
    ui.clear(host);

    // filtro opcional por data
    var dataInput = h("input", { type: "date", value: state.filtroData });
    dataInput.addEventListener("change", function () { state.filtroData = dataInput.value; draw(); });
    var limpar = ui.button("Limpar filtro", { variant: "ghost" });
    limpar.classList.add("btn-sm");
    limpar.addEventListener("click", function () { state.filtroData = ""; dataInput.value = ""; draw(); });

    host.appendChild(h("div", { class: "filters" },
      h("div", { class: "search-box" },
        h("span", { html: C.icon("clock", 16) }),
        dataInput
      ),
      limpar
    ));

    var tableHost = h("div", {});
    host.appendChild(ui.card(null, tableHost, { class: "card-body" }));

    function draw() {
      var regs = C.table("limpezaRegistros").slice().sort(function (a, b) {
        return new Date(b.datetime) - new Date(a.datetime);
      });
      if (state.filtroData) {
        regs = regs.filter(function (r) { return r.data === state.filtroData; });
      }

      ui.clear(tableHost);
      tableHost.appendChild(ui.table([
        { key: "data", label: "Data", render: function (r) { return fmt.date(r.data); } },
        { key: "hora", label: "Hora", render: function (r) { return r.hora || fmt.time(r.datetime); } },
        {
          key: "tarefa", label: "Tarefa", render: function (r) {
            var t = C.find("limpezaTarefas", r.tarefaId);
            return h("span", { class: "cell-strong", text: t ? t.nome : "(tarefa removida)" });
          }
        },
        { key: "responsavel", label: "Responsável", render: function (r) { return r.responsavel || "—"; } },
        { key: "status", label: "Status", align: "right", render: function (r) { return ui.badge(r.status === "feito" ? "Feito" : (r.status || "—"), "ok"); } }
      ], regs, {
        emptyMsg: state.filtroData ? "Nenhum registro nesta data." : "Nenhum registro de limpeza ainda."
      }));
    }
    draw();
  }

  /* ---------- RENDER PRINCIPAL (abas) ---------- */

  function render(root) {
    ui.clear(root);
    root.appendChild(ui.pageHeader(
      "Limpeza",
      "Checklist de higiene e operação — quem fez e a que horas.",
      state.aba === "tarefas"
        ? [ui.button("Nova tarefa", { icon: "plus", onClick: function () { openTarefaForm(null); } })]
        : []
    ));

    // abas (.chip)
    var abas = [
      { id: "hoje", label: "Hoje" },
      { id: "tarefas", label: "Tarefas" },
      { id: "historico", label: "Histórico" }
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

    if (state.aba === "tarefas") renderTarefas(host);
    else if (state.aba === "historico") renderHistorico(host);
    else renderHoje(host);
  }

  C.registerModule({ id: "limpeza", label: "Limpeza", icon: "limpeza", order: 8, render: render });
})();
