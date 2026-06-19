/* ============================================================
   Módulo: USUÁRIOS / CONTAS (somente gestor)
   - Gestão das contas de acesso ao sistema.
   - Papel 'gestor' vê tudo; papel 'caixa' não enxerga dados
     sensíveis (custos, lucro, margem, compras, valor em estoque).
   - CRUD seguindo o padrão de modules/limpeza.js (tabela + formModal).
   ============================================================ */
(function () {
  var C = window.Cellos;
  var ui = C.ui, h = ui.h, fmt = C.fmt;

  function root() { return document.getElementById("content"); }

  // valida se o nome de usuário já existe em OUTRO registro
  function usuarioExiste(nomeUsuario, ignorarId) {
    var alvo = String(nomeUsuario || "").trim().toLowerCase();
    return C.table("usuarios").some(function (u) {
      return u.id !== ignorarId && String(u.usuario || "").trim().toLowerCase() === alvo;
    });
  }

  function papelBadge(papel) {
    if (papel === "gestor") return ui.badge("Gestor", "accent");
    return ui.badge("Caixa", "neutral");
  }

  function ativoBadge(ativo) {
    return ativo ? ui.badge("Ativo", "ok") : ui.badge("Inativo", "neutral");
  }

  /* ---------- formulário (novo / editar) ---------- */
  function openForm(usuario) {
    var editing = !!usuario;
    ui.formModal({
      title: editing ? "Editar conta" : "Nova conta",
      size: "md",
      values: usuario || { papel: "caixa", ativo: true },
      fields: [
        { name: "nome", label: "Nome", type: "text", required: true, full: true, placeholder: "Ex.: Ana Souza" },
        { name: "usuario", label: "Usuário (login)", type: "text", required: true, placeholder: "Ex.: ana" },
        { name: "senha", label: "Senha", type: "text", required: true, placeholder: "Senha de acesso" },
        { name: "papel", label: "Papel", type: "select", required: true, options: [{ value: "gestor", label: "Gestor (vê tudo)" }, { value: "caixa", label: "Caixa (sem financeiro)" }] },
        { name: "ativo", label: "Conta ativa", type: "checkbox" }
      ],
      validate: function (v) {
        if (usuarioExiste(v.usuario, editing ? usuario.id : null)) {
          return "Já existe uma conta com o usuário \"" + String(v.usuario).trim() + "\".";
        }
        var atual = C.currentUser();
        if (editing && atual && atual.id === usuario.id) {
          if (v.papel !== "gestor") return "Você não pode tirar o seu próprio papel de gestor.";
          if (!v.ativo) return "Você não pode desativar a sua própria conta.";
        }
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      v.usuario = String(v.usuario).trim();
      if (editing) {
        C.update("usuarios", usuario.id, v);
        ui.toast("Conta atualizada.", "ok");
      } else {
        C.insert("usuarios", v);
        ui.toast("Conta criada.", "ok");
      }
      render(root());
    });
  }

  /* ---------- excluir ---------- */
  function excluir(usuario) {
    var atual = C.currentUser();
    if (atual && atual.id === usuario.id) {
      ui.toast("Você não pode excluir a sua própria conta.", "warn");
      return;
    }
    ui.confirm("Excluir a conta \"" + usuario.nome + "\" (usuário " + usuario.usuario + ")?", { danger: true, okLabel: "Excluir" }).then(function (ok) {
      if (ok) {
        C.remove("usuarios", usuario.id);
        ui.toast("Conta excluída.", "ok");
        render(root());
      }
    });
  }

  /* ---------- render principal ---------- */
  function render(rootEl) {
    ui.clear(rootEl);
    rootEl.appendChild(ui.pageHeader(
      "Contas",
      "Contas de acesso ao sistema. Somente o gestor gerencia.",
      [ui.button("Nova conta", { icon: "plus", onClick: function () { openForm(null); } })]
    ));

    // explicação dos papéis
    var explicacao = h("div", { class: "card-body" },
      h("p", { class: "small muted", style: { margin: "0 0 6px" } },
        "O gestor cadastra as contas de acesso e define o papel de cada pessoa."
      ),
      h("p", { class: "small muted", style: { margin: "0 0 6px" } },
        h("b", { text: "Caixa: " }),
        "opera o PDV mas NÃO enxerga dados sensíveis — custos, lucro, margem, compras e o valor parado em estoque ficam ocultos."
      ),
      h("p", { class: "small muted", style: { margin: "0" } },
        h("b", { text: "Gestor: " }),
        "vê tudo, incluindo o financeiro completo, e gerencia estas contas."
      )
    );
    rootEl.appendChild(ui.card("Como funcionam os papéis", explicacao));

    var atual = C.currentUser();
    var usuarios = C.table("usuarios");

    var tableHost = h("div", {});
    var card = ui.card(null, tableHost, { class: "card-body" });
    card.style.marginTop = "18px";
    rootEl.appendChild(card);

    tableHost.appendChild(ui.table([
      {
        key: "nome", label: "Nome", render: function (u) {
          var ehVoce = atual && atual.id === u.id;
          return h("span", {},
            h("span", { class: "cell-strong", text: u.nome }),
            ehVoce ? h("span", { class: "small muted", text: "  (você)" }) : null
          );
        }
      },
      { key: "usuario", label: "Usuário", render: function (u) { return h("span", { class: "cell-muted", text: u.usuario }); } },
      { key: "senha", label: "Senha", render: function () { return h("span", { class: "cell-muted", text: "••••" }); } },
      { key: "papel", label: "Papel", render: function (u) { return papelBadge(u.papel); } },
      { key: "ativo", label: "Ativo", align: "right", render: function (u) { return ativoBadge(u.ativo); } }
    ], usuarios, {
      emptyMsg: "Nenhuma conta cadastrada.",
      actions: function (u) {
        var ehVoce = atual && atual.id === u.id;
        var btnExcluir = ui.iconButton("trash", function () { excluir(u); }, ehVoce ? "Você não pode excluir a própria conta" : "Excluir");
        if (ehVoce) { btnExcluir.disabled = true; btnExcluir.style.opacity = "0.4"; btnExcluir.style.cursor = "not-allowed"; }
        return [
          ui.iconButton("edit", function () { openForm(u); }, "Editar"),
          btnExcluir
        ];
      }
    }));
  }

  C.registerModule({ id: "usuarios", label: "Contas", icon: "usuarios", order: 9, roles: ["gestor"], render: render });
})();
