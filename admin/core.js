/* ============================================================
   Cellos Gelato — Núcleo do sistema de gestão
   - Camada de dados (localStorage)
   - Dados de demonstração (seed)
   - Operações de domínio (venda dá baixa no estoque, compra dá entrada)
   - Utilitários de formatação, UI (tabelas, formulários, modais, gráficos)
   - Registro e roteamento de módulos
   ============================================================ */
window.Cellos = (function () {
  "use strict";

  const KEY = "cellos_db_v7";

  /* ---------- utilitários básicos ---------- */
  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowISO() { return new Date().toISOString(); }
  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(aISO, bISO) {
    const a = new Date(aISO), b = new Date(bISO);
    return Math.round((b - a) / 86400000);
  }
  // unidades e conversão (base: g para massa, ml para volume, un para contagem)
  const UNIDADES = ["g", "kg", "100g", "mg", "ml", "L", "un"];
  function fatorUnidade(u) {
    const f = { g: 1, kg: 1000, "100g": 100, mg: 0.001, ml: 1, l: 1000, L: 1000, un: 1, und: 1, dz: 12, cx: 1 };
    return f[u] != null ? f[u] : 1;
  }
  // custo de uma quantidade usada (qtd/unidade) dado um preço por unidade de referência
  function custoQuantidade(qtd, unidade, preco, precoPor) {
    return (Number(qtd) || 0) * fatorUnidade(unidade) / fatorUnidade(precoPor || unidade) * (Number(preco) || 0);
  }

  /* ---------- formatação ---------- */
  const fmt = {
    money(n) {
      n = Number(n) || 0;
      return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    int(n) { return (Number(n) || 0).toLocaleString("pt-BR"); },
    num(n, d) {
      d = d == null ? 1 : d;
      return (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d });
    },
    pct(n) { return (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"; },
    date(iso) {
      if (!iso) return "—";
      const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
      return d.toLocaleDateString("pt-BR");
    },
    datetime(iso) {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    },
    time(iso) {
      if (!iso) return "—";
      return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    },
    weekday(iso) {
      const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
      return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getDay()];
    },
    monthName(m) {
      return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][m];
    }
  };

  /* ---------- ícones (SVG de traço, sem emojis) ---------- */
  const ICONS = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z"/>',
    pdv: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L23 7H6"/>',
    estoque: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    compras: '<path d="M1 4h13v10H1z"/><path d="M14 8h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    produtos: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    receitas: '<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    producao: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4"/>',
    limpeza: '<path d="M9 3h6l1 5H8z"/><path d="M10 8v3a2 2 0 0 0-2 2v8h8v-8a2 2 0 0 0-2-2V8"/>',
    usuarios: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6M17 14a6 6 0 0 1 4 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    clube: '<path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z"/>',
    caixa: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 8l2-5h14l2 5M8 12h8M12 8v13"/>',
    perda: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M14 10l-4 6M10 10l4 6"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 4-6"/>',
    star: '<path d="M12 3l2.4 6.9H22l-6 4.4 2.3 7-6.3-4.5L5.7 21l2.3-7-6-4.4h7.6z"/>',
    sino: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.5 21a1.5 1.5 0 0 0 3 0"/>',
    alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    snow: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/>',
    fire: '<path d="M12 2c2 4-1 5-1 8a3 3 0 0 0 6 0c0-1-.5-2-1-3 2 1 4 4 4 7a8 8 0 0 1-16 0c0-5 5-7 8-12z"/>'
  };
  function icon(name, size) {
    size = size || 20;
    const p = ICONS[name] || "";
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  /* ============================================================
     DADOS DE DEMONSTRAÇÃO
     ============================================================ */
  function seed() {
    const locais = [
      { id: "loc_camara", nome: "Câmara Fria (-18°C)", tipo: "Congelado" },
      { id: "loc_resfri", nome: "Câmara de Resfriados (4°C)", tipo: "Refrigerado" },
      { id: "loc_seco", nome: "Estoque Seco — Mezanino", tipo: "Seco" },
      { id: "loc_balcao", nome: "Frente de Loja / Balcão", tipo: "Loja" }
    ];

    const fornecedores = [
      { id: "for_polo", nome: "Distribuidora Polo Sul", contato: "(51) 3344-1100", segmento: "Embalagens e descartáveis" },
      { id: "for_aguas", nome: "Águas da Serra", contato: "(54) 9988-2010", segmento: "Bebidas" },
      { id: "for_coro", nome: "Bebidas Coronado", contato: "(51) 3220-7788", segmento: "Refrigerantes" },
      { id: "for_sicilia", nome: "Importadora Siciliana", contato: "(11) 4002-8922", segmento: "Pastas e matéria-prima" },
      { id: "for_bela", nome: "Laticínios Bela Vista", contato: "(54) 3025-4410", segmento: "Leite e creme" }
    ];

    // itens de estoque (insumos com saldo controlado)
    const itens = [
      // embalagens / descartáveis
      { id: "it_casq_trad", nome: "Casquinha tradicional", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 420, qtdMin: 200, qtdMax: 1200, custoUnit: 0.45, validade: daysFromNow(160) },
      { id: "it_casq_choc", nome: "Casquinha de chocolate", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 180, qtdMin: 150, qtdMax: 800, custoUnit: 0.78, validade: daysFromNow(140) },
      { id: "it_casq_gig", nome: "Casquinha gigante", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 90, qtdMin: 100, qtdMax: 500, custoUnit: 0.95, validade: daysFromNow(150) },
      { id: "it_pot_100", nome: "Potinho 100ml", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 640, qtdMin: 300, qtdMax: 2000, custoUnit: 0.22, validade: daysFromNow(400) },
      { id: "it_pot_200", nome: "Potinho 200ml", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 510, qtdMin: 300, qtdMax: 2000, custoUnit: 0.30, validade: daysFromNow(400) },
      { id: "it_pot_300", nome: "Potinho 300ml", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 270, qtdMin: 250, qtdMax: 1500, custoUnit: 0.41, validade: daysFromNow(400) },
      { id: "it_via_1l", nome: "Pote viagem 1L (c/ tampa)", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 130, qtdMin: 80, qtdMax: 600, custoUnit: 1.85, validade: daysFromNow(500) },
      { id: "it_via_2l", nome: "Pote viagem 2L (c/ tampa)", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 70, qtdMin: 50, qtdMax: 400, custoUnit: 2.60, validade: daysFromNow(500) },
      { id: "it_colher", nome: "Colher degustação", categoria: "Embalagem", unidade: "un", localId: "loc_seco", fornecedorId: "for_polo", qtd: 1500, qtdMin: 800, qtdMax: 5000, custoUnit: 0.04, validade: daysFromNow(700) },
      // bebidas
      { id: "it_agua", nome: "Água mineral 500ml", categoria: "Bebida", unidade: "un", localId: "loc_balcao", fornecedorId: "for_aguas", qtd: 96, qtdMin: 48, qtdMax: 240, custoUnit: 2.00, validade: daysFromNow(220) },
      { id: "it_refri", nome: "Refrigerante lata 350ml", categoria: "Bebida", unidade: "un", localId: "loc_balcao", fornecedorId: "for_coro", qtd: 60, qtdMin: 48, qtdMax: 240, custoUnit: 2.80, validade: daysFromNow(180) },
      { id: "it_agua_gas", nome: "Água com gás 500ml", categoria: "Bebida", unidade: "un", localId: "loc_balcao", fornecedorId: "for_aguas", qtd: 30, qtdMin: 24, qtdMax: 120, custoUnit: 2.40, validade: daysFromNow(210) },
      // matéria-prima (produção / receitas)
      { id: "it_leite", nome: "Leite integral", categoria: "Matéria-prima", unidade: "L", localId: "loc_resfri", fornecedorId: "for_bela", qtd: 80, qtdMin: 40, qtdMax: 200, custoUnit: 4.20, validade: daysFromNow(12) },
      { id: "it_creme", nome: "Creme de leite fresco", categoria: "Matéria-prima", unidade: "L", localId: "loc_resfri", fornecedorId: "for_bela", qtd: 34, qtdMin: 20, qtdMax: 100, custoUnit: 18.50, validade: daysFromNow(4) },
      { id: "it_acucar", nome: "Açúcar refinado", categoria: "Matéria-prima", unidade: "kg", localId: "loc_seco", fornecedorId: "for_sicilia", qtd: 120, qtdMin: 50, qtdMax: 300, custoUnit: 4.10, validade: daysFromNow(300) },
      { id: "it_pistache", nome: "Pasta de pistache siciliano", categoria: "Matéria-prima", unidade: "kg", localId: "loc_resfri", fornecedorId: "for_sicilia", qtd: 6.5, qtdMin: 4, qtdMax: 20, custoUnit: 230.00, validade: daysFromNow(45) },
      { id: "it_morango", nome: "Polpa de morango", categoria: "Matéria-prima", unidade: "kg", localId: "loc_camara", fornecedorId: "for_sicilia", qtd: 18, qtdMin: 10, qtdMax: 60, custoUnit: 22.00, validade: daysFromNow(70) },
      { id: "it_cacau", nome: "Cacau em pó 100%", categoria: "Matéria-prima", unidade: "kg", localId: "loc_seco", fornecedorId: "for_sicilia", qtd: 9, qtdMin: 6, qtdMax: 30, custoUnit: 48.00, validade: daysFromNow(120) },
      { id: "it_avela", nome: "Pasta de avelã", categoria: "Matéria-prima", unidade: "kg", localId: "loc_resfri", fornecedorId: "for_sicilia", qtd: 3.2, qtdMin: 4, qtdMax: 18, custoUnit: 165.00, validade: daysFromNow(40) }
    ];

    // produtos vendáveis (catálogo do PDV).
    // tipo "montavel" = casquinha/potinho/viagem: tem CUSTO FIXO (a embalagem) + bolas de SABOR (custo variável da receita).
    // tipo "simples"  = bebidas: produto fechado, sem sabor.
    // custoFixo = custo da parte fixa (casquinha, pote...). O custo das bolas vem do sabor escolhido.
    // bolas = quantas bolas/porções de sabor o produto comporta.
    // consomeEstoque = se a parte fixa (embalagem) dá baixa no estoque. consome = quais itens.
    const produtos = [
      { id: "pr_casq_1", nome: "Casquinha 1 bola", categoria: "Casquinha", tipo: "montavel", precoVenda: 12.00, custoFixo: 0.45, bolas: 1, percOperacional: 10, consomeEstoque: true, consome: [{ itemId: "it_casq_trad", qtd: 1 }] },
      { id: "pr_casq_2", nome: "Casquinha 2 bolas", categoria: "Casquinha", tipo: "montavel", precoVenda: 16.00, custoFixo: 0.45, bolas: 2, percOperacional: 10, consomeEstoque: true, consome: [{ itemId: "it_casq_trad", qtd: 1 }] },
      { id: "pr_casq_choc", nome: "Casquinha de Chocolate (2 bolas)", categoria: "Casquinha", tipo: "montavel", precoVenda: 18.00, custoFixo: 0.78, bolas: 2, percOperacional: 10, consomeEstoque: true, disponibilidade: "acabando", consome: [{ itemId: "it_casq_choc", qtd: 1 }] },
      { id: "pr_pot_p", nome: "Potinho Pequeno (1 bola)", categoria: "Potinho", tipo: "montavel", precoVenda: 11.00, custoFixo: 0.26, bolas: 1, percOperacional: 10, consomeEstoque: true, consome: [{ itemId: "it_pot_100", qtd: 1 }, { itemId: "it_colher", qtd: 1 }] },
      { id: "pr_pot_m", nome: "Potinho Médio (2 bolas)", categoria: "Potinho", tipo: "montavel", precoVenda: 15.00, custoFixo: 0.34, bolas: 2, percOperacional: 10, consomeEstoque: true, consome: [{ itemId: "it_pot_200", qtd: 1 }, { itemId: "it_colher", qtd: 1 }] },
      { id: "pr_pot_g", nome: "Potinho Grande (3 bolas)", categoria: "Potinho", tipo: "montavel", precoVenda: 20.00, custoFixo: 0.45, bolas: 3, percOperacional: 10, consomeEstoque: true, consome: [{ itemId: "it_pot_300", qtd: 1 }, { itemId: "it_colher", qtd: 1 }] },
      { id: "pr_via_1l", nome: "Pote Viagem 1L", categoria: "Viagem", tipo: "montavel", precoVenda: 45.00, custoFixo: 1.85, bolas: 6, percOperacional: 12, consomeEstoque: true, consome: [{ itemId: "it_via_1l", qtd: 1 }] },
      { id: "pr_via_2l", nome: "Pote Viagem 2L", categoria: "Viagem", tipo: "montavel", precoVenda: 80.00, custoFixo: 2.60, bolas: 12, percOperacional: 12, consomeEstoque: true, consome: [{ itemId: "it_via_2l", qtd: 1 }] },
      { id: "pr_agua", nome: "Água Mineral 500ml", categoria: "Bebida", tipo: "simples", precoVenda: 7.00, custoFixo: 2.00, bolas: 0, percOperacional: 5, consomeEstoque: true, consome: [{ itemId: "it_agua", qtd: 1 }] },
      { id: "pr_refri", nome: "Refrigerante Lata", categoria: "Bebida", tipo: "simples", precoVenda: 8.00, custoFixo: 2.80, bolas: 0, percOperacional: 5, consomeEstoque: true, consome: [{ itemId: "it_refri", qtd: 1 }] },
      { id: "pr_agua_gas", nome: "Água com Gás 500ml", categoria: "Bebida", tipo: "simples", precoVenda: 8.00, custoFixo: 2.40, bolas: 0, percOperacional: 5, consomeEstoque: true, consome: [{ itemId: "it_agua_gas", qtd: 1 }] }
    ];

    // SABORES — cada um é uma receita diferente, com custo por bola diferente.
    // custoPorBola: vem da receita (custoEstimado / rendimentoBolas) ou é informado direto.
    // consomeEstoque: se o sabor dá baixa de matéria-prima no estoque (padrão NÃO — gelato é relativo ao pedido).
    const sabores = [
      { id: "sb_pistache", nome: "Pistache Siciliano", categoria: "Gelato", receitaId: "rec_pistache", custoPorBola: null, consomeEstoque: false, consome: [{ itemId: "it_pistache", qtd: 0.012 }] },
      { id: "sb_strac", nome: "Stracciatella", categoria: "Gelato", receitaId: "rec_strac", custoPorBola: null, consomeEstoque: false, consome: [{ itemId: "it_cacau", qtd: 0.004 }] },
      { id: "sb_avela", nome: "Avelã", categoria: "Gelato", receitaId: "rec_avela", custoPorBola: null, consomeEstoque: false, consome: [{ itemId: "it_avela", qtd: 0.010 }] },
      { id: "sb_morango", nome: "Morango (sorbet)", categoria: "Sorbetto", receitaId: "rec_morango", custoPorBola: null, consomeEstoque: false, consome: [{ itemId: "it_morango", qtd: 0.05 }] },
      { id: "sb_chocolate", nome: "Chocolate Belga", categoria: "Gelato", receitaId: null, custoPorBola: 1.40, consomeEstoque: false, consome: [{ itemId: "it_cacau", qtd: 0.012 }] },
      { id: "sb_creme", nome: "Creme (Fior di Latte)", categoria: "Gelato", receitaId: null, custoPorBola: 1.05, consomeEstoque: false, consome: [] },
      { id: "sb_doce", nome: "Doce de Leite", categoria: "Creme", receitaId: null, custoPorBola: 1.30, consomeEstoque: false, consome: [] },
      { id: "sb_limao", nome: "Limão Siciliano (sorbet)", categoria: "Sorbetto", receitaId: null, custoPorBola: 0.95, consomeEstoque: false, consome: [] }
    ];

    // ingrediente: {tipo:'insumo', itemId, qtd, unidade}  -> puxa preço (custoUnit) e unidade do item
    //              {tipo:'livre', nome, qtd, unidade, preco, precoPor}  -> preço informado por unidade de referência
    function custoIngredienteSeed(ing) {
      let preco, precoPor;
      if (ing.tipo === "insumo") {
        const it = itens.find(function (x) { return x.id === ing.itemId; });
        if (!it) return 0;
        preco = it.custoUnit; precoPor = it.unidade;
      } else { preco = ing.preco || 0; precoPor = ing.precoPor || ing.unidade; }
      return (ing.qtd * fatorUnidade(ing.unidade)) / fatorUnidade(precoPor) * preco;
    }
    const receitas = [
      {
        id: "rec_pistache", nome: "Gelato de Pistache", categoria: "Gelato", rendimento: 5, rendimentoUnidade: "kg", rendimentoBolas: 55,
        ingredientes: [
          { tipo: "insumo", itemId: "it_leite", qtd: 2.5, unidade: "L" },
          { tipo: "insumo", itemId: "it_creme", qtd: 1.0, unidade: "L" },
          { tipo: "insumo", itemId: "it_acucar", qtd: 0.9, unidade: "kg" },
          { tipo: "insumo", itemId: "it_pistache", qtd: 550, unidade: "g" },
          { tipo: "livre", nome: "Base neutra (zafiro)", qtd: 50, unidade: "g", preco: 4.00, precoPor: "100g" }
        ],
        modoPreparo: "Aquecer o leite a 85°C com metade do açúcar. Incorporar a pasta de pistache e o creme. Maturar 6h a 4°C. Mantecar até 8°C.",
        obs: "Não passar de 8°C na mantecação para manter a cor."
      },
      {
        id: "rec_morango", nome: "Sorbet de Morango", categoria: "Sorbetto", rendimento: 4, rendimentoUnidade: "kg", rendimentoBolas: 45,
        ingredientes: [
          { tipo: "insumo", itemId: "it_morango", qtd: 2.2, unidade: "kg" },
          { tipo: "insumo", itemId: "it_acucar", qtd: 0.8, unidade: "kg" },
          { tipo: "livre", nome: "Água", qtd: 1.0, unidade: "L", preco: 0, precoPor: "L" }
        ],
        modoPreparo: "Dissolver o açúcar na água morna. Misturar à polpa, bater e mantecar. Vegano.",
        obs: "Sem leite — produto vegano."
      },
      {
        id: "rec_avela", nome: "Gelato de Avelã", categoria: "Gelato", rendimento: 5, rendimentoUnidade: "kg", rendimentoBolas: 55,
        ingredientes: [
          { tipo: "insumo", itemId: "it_leite", qtd: 2.6, unidade: "L" },
          { tipo: "insumo", itemId: "it_creme", qtd: 0.9, unidade: "L" },
          { tipo: "insumo", itemId: "it_acucar", qtd: 0.85, unidade: "kg" },
          { tipo: "insumo", itemId: "it_avela", qtd: 450, unidade: "g" }
        ],
        modoPreparo: "Base branca a 85°C, incorporar a pasta de avelã, maturar e mantecar.",
        obs: ""
      },
      {
        id: "rec_strac", nome: "Stracciatella", categoria: "Gelato", rendimento: 5, rendimentoUnidade: "kg", rendimentoBolas: 55,
        ingredientes: [
          { tipo: "insumo", itemId: "it_leite", qtd: 3.0, unidade: "L" },
          { tipo: "insumo", itemId: "it_creme", qtd: 1.0, unidade: "L" },
          { tipo: "insumo", itemId: "it_acucar", qtd: 0.9, unidade: "kg" },
          { tipo: "insumo", itemId: "it_cacau", qtd: 0.2, unidade: "kg" }
        ],
        modoPreparo: "Base de creme (fior di latte). Ao final, fio de chocolate derretido para formar as lascas.",
        obs: "Chocolate a 35°C para a lasca ficar fina."
      }
    ];
    receitas.forEach(function (r) { r.custoEstimado = Math.round(r.ingredientes.reduce(function (s, i) { return s + custoIngredienteSeed(i); }, 0) * 100) / 100; });

    const producao = [
      { id: uid("prod"), produto: "Gelato de Pistache", receitaId: "rec_pistache", qtdPlanejada: 5, unidade: "kg", dataAgendada: daysFromNow(0), prazo: daysFromNow(1), status: "em_producao", responsavel: "Marco", obs: "Reposição da câmara." },
      { id: uid("prod"), produto: "Sorbet de Morango", receitaId: "rec_morango", qtdPlanejada: 4, unidade: "kg", dataAgendada: daysFromNow(1), prazo: daysFromNow(2), status: "agendada", responsavel: "Júlia", obs: "" },
      { id: uid("prod"), produto: "Stracciatella", receitaId: "rec_strac", qtdPlanejada: 5, unidade: "kg", dataAgendada: daysFromNow(-1), prazo: daysFromNow(0), status: "concluida", responsavel: "Marco", obs: "Lote dentro do padrão." },
      { id: uid("prod"), produto: "Gelato de Avelã", receitaId: "rec_avela", qtdPlanejada: 5, unidade: "kg", dataAgendada: daysFromNow(2), prazo: daysFromNow(3), status: "agendada", responsavel: "Marco", obs: "Conferir estoque de avelã (abaixo do mínimo)." }
    ];

    const limpezaTarefas = [
      { id: "lp_produtora", nome: "Higienizar a produtora (mantecadora)", area: "Produção", frequencia: "diaria", descricao: "Desmontar, lavar e sanitizar peças em contato com o produto." },
      { id: "lp_salao", nome: "Limpeza do salão", area: "Atendimento", frequencia: "diaria", descricao: "Mesas, piso, vitrine e balcão." },
      { id: "lp_caixa", nome: "Fechamento de caixa", area: "Financeiro", frequencia: "diaria", descricao: "Conferência de valores e sangria." },
      { id: "lp_bancada", nome: "Desinfecção de bancadas", area: "Produção", frequencia: "diaria", descricao: "Álcool 70% nas superfícies de manipulação." },
      { id: "lp_camara", nome: "Limpeza da câmara fria", area: "Estoque", frequencia: "semanal", descricao: "Organização e degelo programado." }
    ];

    function reg(tarefaId, diaOffset, hora, resp) {
      const dia = daysFromNow(diaOffset);
      return { id: uid("lreg"), tarefaId: tarefaId, data: dia, hora: hora, datetime: dia + "T" + hora + ":00", responsavel: resp, status: "feito" };
    }
    const limpezaRegistros = [
      reg("lp_produtora", -1, "22:10", "Júlia"),
      reg("lp_salao", -1, "22:25", "Pedro"),
      reg("lp_caixa", -1, "22:40", "Ana"),
      reg("lp_bancada", -1, "14:05", "Júlia"),
      reg("lp_produtora", 0, "09:15", "Marco"),
      reg("lp_bancada", 0, "09:20", "Marco")
    ];

    const config = {
      nome: "Cellos Gelato",
      percOperacionalPadrao: 10,
      operadores: ["Ana", "Pedro", "Júlia", "Marco", "Bruna"],
      criadoEm: nowISO()
    };

    /* --- histórico de vendas e movimentações dos últimos 75 dias --- */
    const vendas = [];
    const movimentacoes = [];

    // entradas iniciais de estoque (para o histórico fazer sentido)
    itens.forEach(function (it) {
      movimentacoes.push({
        id: uid("mov"), datetime: daysFromNow(-75) + "T08:00:00", itemId: it.id, tipo: "entrada",
        qtd: it.qtd, localId: it.localId, motivo: "Saldo inicial", responsavel: "Sistema", refId: null
      });
    });

    // gera vendas com peso sazonal (verão vende mais) e fim de semana mais forte
    const pesoMes = { 0: 1.5, 1: 1.45, 2: 1.2, 3: 1.0, 4: 0.85, 5: 0.7, 6: 0.7, 7: 0.75, 8: 0.9, 9: 1.05, 10: 1.25, 11: 1.45 };
    const produtoPeso = [
      ["pr_casq_1", 26], ["pr_casq_2", 16], ["pr_casq_choc", 9], ["pr_pot_p", 14], ["pr_pot_m", 12],
      ["pr_pot_g", 7], ["pr_via_1l", 4], ["pr_via_2l", 2], ["pr_agua", 11], ["pr_refri", 8], ["pr_agua_gas", 3]
    ];
    function pickProduto() {
      const total = produtoPeso.reduce(function (s, p) { return s + p[1]; }, 0);
      let r = Math.random() * total;
      for (let i = 0; i < produtoPeso.length; i++) { r -= produtoPeso[i][1]; if (r <= 0) return produtoPeso[i][0]; }
      return produtoPeso[0][0];
    }
    const prodById = {}; produtos.forEach(function (p) { prodById[p.id] = p; });
    // custo por bola de cada sabor (da receita ou informado)
    const saborPorBola = {};
    sabores.forEach(function (s) {
      let c = s.custoPorBola;
      if (c == null && s.receitaId) {
        const r = receitas.find(function (x) { return x.id === s.receitaId; });
        if (r && r.rendimentoBolas) c = r.custoEstimado / r.rendimentoBolas;
      }
      saborPorBola[s.id] = c || 1.5;
    });
    const saborIds = sabores.map(function (s) { return s.id; });
    let numeroPedido = 0;

    for (let d = 75; d >= 0; d--) {
      const dataDia = daysFromNow(-d);
      const dow = new Date(dataDia + "T12:00:00").getDay();
      const mes = new Date(dataDia + "T12:00:00").getMonth();
      const fimDeSemana = (dow === 0 || dow === 5 || dow === 6) ? 1.6 : 1.0;
      const base = 10 * (pesoMes[mes] || 1) * fimDeSemana;
      const nVendas = Math.max(2, Math.round(base + (Math.random() * 6 - 3)));
      for (let v = 0; v < nVendas; v++) {
        const hora = 12 + Math.floor(Math.random() * 11); // 12h-22h
        const min = Math.floor(Math.random() * 60);
        const dt = dataDia + "T" + String(hora).padStart(2, "0") + ":" + String(min).padStart(2, "0") + ":00";
        const nItens = 1 + Math.floor(Math.random() * 3);
        const linhas = [];
        let total = 0, custoVenda = 0;
        for (let li = 0; li < nItens; li++) {
          const pid = pickProduto();
          const p = prodById[pid];
          const q = 1 + (Math.random() < 0.25 ? 1 : 0);
          // sabores para produtos montáveis (1 a 2 sabores distintos)
          let saboresLinha = [], custoUnit = p.custoFixo || 0;
          if (p.tipo === "montavel" && p.bolas > 0) {
            const nSab = Math.min(p.bolas, 1 + Math.floor(Math.random() * 2));
            let soma = 0;
            for (let s = 0; s < nSab; s++) {
              const sid = saborIds[Math.floor(Math.random() * saborIds.length)];
              saboresLinha.push(sid); soma += saborPorBola[sid];
            }
            custoUnit = (p.custoFixo || 0) + p.bolas * (soma / nSab);
          }
          custoUnit = Math.round(custoUnit * 100) / 100;
          const nomesSab = saboresLinha.map(function (sid) { const s = sabores.find(function (x) { return x.id === sid; }); return s ? s.nome : null; }).filter(Boolean);
          linhas.push({ produtoId: pid, nome: p.nome, qtd: q, saboresIds: saboresLinha, sabores: nomesSab, precoUnit: p.precoVenda, custoUnit: custoUnit, subtotal: Math.round(p.precoVenda * q * 100) / 100 });
          total += p.precoVenda * q;
          custoVenda += custoUnit * q;
          // baixa de estoque (embalagens) só nos últimos 7 dias (janela usada na variância de CMV)
          if (d <= 7 && p.consomeEstoque) {
            p.consome.forEach(function (c) {
              const it = itens.find(function (x) { return x.id === c.itemId; });
              if (it) it.qtd = Math.max(0, it.qtd - c.qtd * q);
              movimentacoes.push({ id: uid("mov"), datetime: dt, itemId: c.itemId, tipo: "saida", qtd: c.qtd * q, localId: it ? it.localId : null, motivo: "Venda automática (PDV)", responsavel: config.operadores[Math.floor(Math.random() * config.operadores.length)], refId: null });
            });
          }
        }
        total = Math.round(total * 100) / 100;
        custoVenda = Math.round(custoVenda * 100) / 100;
        const forma = ["Pix", "Crédito", "Débito", "Dinheiro"][Math.floor(Math.random() * 4)];
        let valorRecebido = null, troco = null;
        if (forma === "Dinheiro") {
          valorRecebido = Math.max(total, Math.ceil(total / 5) * 5);
          troco = Math.round((valorRecebido - total) * 100) / 100;
        }
        vendas.push({
          id: uid("vnd"), numero: ++numeroPedido, datetime: dt,
          operador: config.operadores[Math.floor(Math.random() * config.operadores.length)],
          itens: linhas, total: total, custoTotal: custoVenda, lucro: Math.round((total - custoVenda) * 100) / 100,
          formaPagamento: forma, valorRecebido: valorRecebido, troco: troco
        });
      }
    }
    config.proximoPedido = numeroPedido + 1;
    // um acerto de inventário não explicado (alimenta a variância de CMV na demonstração)
    movimentacoes.push({ id: uid("mov"), datetime: daysFromNow(-2) + "T23:35:00", itemId: "it_casq_trad", tipo: "saida", qtd: 9, localId: "loc_seco", motivo: "Acerto de inventário", responsavel: "Marco", refId: null });
    const _acerto = itens.find(function (x) { return x.id === "it_casq_trad"; }); if (_acerto) _acerto.qtd = Math.max(0, _acerto.qtd - 9);

    // compras: recebidas (histórico) + pendentes (tracking)
    const compras = [
      {
        id: uid("cmp"), fornecedorId: "for_polo", data: daysFromNow(-20), dataPrevista: daysFromNow(-18), dataRecebido: daysFromNow(-18),
        status: "recebido", comprador: "Marco", itens: [{ itemId: "it_casq_trad", nome: "Casquinha tradicional", qtd: 500, custoUnit: 0.45 }, { itemId: "it_pot_200", nome: "Potinho 200ml", qtd: 800, custoUnit: 0.30 }], obs: "Entrega no prazo."
      },
      {
        id: uid("cmp"), fornecedorId: "for_sicilia", data: daysFromNow(-10), dataPrevista: daysFromNow(-7), dataRecebido: daysFromNow(-7),
        status: "recebido", comprador: "Marco", itens: [{ itemId: "it_pistache", nome: "Pasta de pistache siciliano", qtd: 5, custoUnit: 230.00 }], obs: ""
      },
      {
        id: uid("cmp"), fornecedorId: "for_sicilia", data: daysFromNow(-1), dataPrevista: daysFromNow(3), dataRecebido: null,
        status: "pedido", comprador: "Bruna", itens: [{ itemId: "it_avela", nome: "Pasta de avelã", qtd: 8, custoUnit: 165.00 }, { itemId: "it_cacau", nome: "Cacau em pó 100%", qtd: 6, custoUnit: 48.00 }], obs: "Reposição urgente de avelã." },
      {
        id: uid("cmp"), fornecedorId: "for_aguas", data: todayISO(), dataPrevista: daysFromNow(2), dataRecebido: null,
        status: "pedido", comprador: "Bruna", itens: [{ itemId: "it_agua", nome: "Água mineral 500ml", qtd: 120, custoUnit: 2.00 }], obs: "" }
    ];
    // garante movimentações de entrada para as compras já recebidas
    compras.filter(function (c) { return c.status === "recebido"; }).forEach(function (c) {
      c.itens.forEach(function (li) {
        movimentacoes.push({ id: uid("mov"), datetime: c.dataRecebido + "T10:00:00", itemId: li.itemId, tipo: "entrada", qtd: li.qtd, localId: (itens.find(function (x) { return x.id === li.itemId; }) || {}).localId, motivo: "Compra recebida", responsavel: "Estoque", refId: c.id });
      });
    });

    // contas de acesso. papel 'gestor' vê tudo; 'caixa' não vê custo, margem, lucro nem compras.
    const usuarios = [
      { id: "us_gestor", nome: "Gestor", usuario: "gestor", senha: "cellos", papel: "gestor", ativo: true },
      { id: "us_ana", nome: "Ana", usuario: "ana", senha: "123", papel: "caixa", ativo: true },
      { id: "us_pedro", nome: "Pedro", usuario: "pedro", senha: "123", papel: "caixa", ativo: true }
    ];

    // coberturas / adicionais (montador do PDV)
    const coberturas = [
      { id: "cb_granulado", nome: "Granulado", preco: 2.00, consomeEstoque: false, consome: [] },
      { id: "cb_calda_choc", nome: "Calda de chocolate", preco: 3.00, consomeEstoque: false, consome: [] },
      { id: "cb_calda_morango", nome: "Calda de morango", preco: 3.00, consomeEstoque: false, consome: [] },
      { id: "cb_pacoca", nome: "Paçoca", preco: 2.50, consomeEstoque: false, consome: [] },
      { id: "cb_chantilly", nome: "Chantilly", preco: 3.50, consomeEstoque: false, consome: [] },
      { id: "cb_casquinha_extra", nome: "Casquinha extra", preco: 2.00, consomeEstoque: true, consome: [{ itemId: "it_casq_trad", qtd: 1 }] }
    ];

    // clientes (Clube + CRM). pontos = "colheres"; nível por faixas (igual à landing).
    function nivelPorPontos(p) { return p >= 2000 ? "Diamante" : p >= 800 ? "Ouro" : p >= 250 ? "Prata" : "Bronze"; }
    const nomesClientes = ["Maria Silva", "João Souza", "Ana Beatriz", "Carlos Pereira", "Beatriz Rocha", "Felipe Alves", "Juliana Costa", "Rafael Dias", "Camila Nunes", "Bruno Martins", "Larissa Gomes", "Diego Fernandes", "Patrícia Ramos", "Eduardo Pinto", "Sofia Carvalho"];
    const recencias = [1, 2, 3, 5, 8, 12, 18, 28, 45, 65, 95, 140, 4, 9, 22];
    const clientes = nomesClientes.map(function (nome, i) {
      const visitas = 1 + Math.floor(Math.random() * 32);
      const ticket = 16 + Math.random() * 42;
      const totalGasto = Math.round(visitas * ticket * 100) / 100;
      const rec = recencias[i % recencias.length];
      const pontos = Math.floor(totalGasto) - Math.floor(Math.random() * 80);
      const aniversario = (i < 3 ? "06" : String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")) + "-" + String(1 + Math.floor(Math.random() * 27)).padStart(2, "0");
      return {
        id: uid("cli"), nome: nome,
        telefone: "(51) 9" + (8100 + i * 37).toString().slice(0, 4) + "-" + (1000 + i * 53).toString().slice(0, 4),
        pontos: Math.max(0, pontos), cashback: Math.round(Math.random() * 18 * 100) / 100, nivel: nivelPorPontos(Math.max(0, pontos)),
        visitas: visitas, totalGasto: totalGasto,
        primeiraCompra: daysFromNow(-(rec + 30 + Math.floor(Math.random() * 320))),
        ultimaCompra: daysFromNow(-rec), aniversario: aniversario,
        codigo: "CELLOS" + (100 + i), indicadoPor: null
      };
    });
    clientes[5].indicadoPor = clientes[0].id;
    clientes[9].indicadoPor = clientes[2].id;

    // perdas / desperdício
    function custoInsumoSeed(itemId, qtd) { const it = itens.find(function (x) { return x.id === itemId; }); return it ? Math.round(it.custoUnit * qtd * 100) / 100 : 0; }
    const perdas = [
      { id: uid("perda"), datetime: daysFromNow(-1) + "T20:35:00", tipo: "produto", refId: "pr_pot_m", nome: "Potinho Médio (2 bolas)", qtd: 3, unidade: "un", custo: 12.90, motivo: "Sobra de fim de dia", responsavel: "Pedro" },
      { id: uid("perda"), datetime: daysFromNow(-2) + "T15:10:00", tipo: "insumo", refId: "it_morango", nome: "Polpa de morango", qtd: 1.5, unidade: "kg", custo: custoInsumoSeed("it_morango", 1.5), motivo: "Vencido", responsavel: "Marco" },
      { id: uid("perda"), datetime: daysFromNow(-4) + "T12:05:00", tipo: "insumo", refId: "it_casq_trad", nome: "Casquinha tradicional", qtd: 12, unidade: "un", custo: custoInsumoSeed("it_casq_trad", 12), motivo: "Quebrou", responsavel: "Ana" },
      { id: uid("perda"), datetime: daysFromNow(-6) + "T19:40:00", tipo: "insumo", refId: "it_leite", nome: "Leite integral", qtd: 2, unidade: "L", custo: custoInsumoSeed("it_leite", 2), motivo: "Queda de energia", responsavel: "Júlia" }
    ];
    // perdas dão baixa no estoque e geram movimentação (consistência com a variância de CMV)
    perdas.forEach(function (perda) {
      if (perda.tipo === "insumo") {
        const it = itens.find(function (x) { return x.id === perda.refId; });
        if (it) { it.qtd = Math.max(0, Math.round((it.qtd - perda.qtd) * 1000) / 1000); movimentacoes.push({ id: uid("mov"), datetime: perda.datetime, itemId: it.id, tipo: "saida", qtd: perda.qtd, localId: it.localId, motivo: "Perda: " + perda.motivo, responsavel: perda.responsavel, refId: perda.id }); }
      } else {
        const p = produtos.find(function (x) { return x.id === perda.refId; });
        if (p && p.consomeEstoque) (p.consome || []).forEach(function (c) { const it = itens.find(function (x) { return x.id === c.itemId; }); if (it) { it.qtd = Math.max(0, Math.round((it.qtd - c.qtd * perda.qtd) * 1000) / 1000); movimentacoes.push({ id: uid("mov"), datetime: perda.datetime, itemId: it.id, tipo: "saida", qtd: c.qtd * perda.qtd, localId: it.localId, motivo: "Perda: " + perda.motivo, responsavel: perda.responsavel, refId: perda.id }); } });
      }
    });

    // sessões de caixa (fechamento cego) — uma fechada de ontem como exemplo
    const caixaSessions = [
      {
        id: uid("cx"), operador: "Ana", abertura: daysFromNow(-1) + "T11:30:00", fundoTroco: 150.00,
        sangrias: [{ valor: 300.00, motivo: "Sangria de segurança", hora: "17:05" }], suprimentos: [],
        fechamento: daysFromNow(-1) + "T23:10:00", vendasDinheiro: 612.00, esperado: 462.00, contado: 460.00, diferenca: -2.00, status: "fechado"
      }
    ];

    return {
      locais: locais, fornecedores: fornecedores, itens: itens, produtos: produtos, sabores: sabores, coberturas: coberturas,
      vendas: vendas, movimentacoes: movimentacoes, compras: compras, receitas: receitas,
      producao: producao, limpezaTarefas: limpezaTarefas, limpezaRegistros: limpezaRegistros,
      clientes: clientes, perdas: perdas, caixaSessions: caixaSessions,
      usuarios: usuarios, config: config
    };
  }

  /* ============================================================
     PERSISTÊNCIA
     ============================================================ */
  let db = null;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { db = JSON.parse(raw); return; }
    } catch (e) { /* ignore */ }
    db = seed();
    save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function reset() { db = seed(); save(); }
  function get() { return db; }
  function table(name) { return db[name] || []; }
  function find(name, id) { return (db[name] || []).find(function (r) { return r.id === id; }); }
  function insert(name, row) { if (!row.id) row.id = uid(name.slice(0, 3)); db[name].push(row); save(); return row; }
  function update(name, id, patch) {
    const row = find(name, id);
    if (row) { Object.assign(row, patch); save(); }
    return row;
  }
  function remove(name, id) {
    db[name] = db[name].filter(function (r) { return r.id !== id; });
    save();
  }

  /* ============================================================
     OPERAÇÕES DE DOMÍNIO
     ============================================================ */
  // custo de um ingrediente: se for insumo, puxa o preço da ÚLTIMA COMPRA (item.custoUnit) e a unidade do item.
  function custoIngrediente(ing) {
    if (!ing) return 0;
    let preco, precoPor;
    if (ing.tipo === "insumo") {
      const it = find("itens", ing.itemId);
      if (!it) return 0;
      preco = it.custoUnit; precoPor = it.unidade;
    } else { preco = ing.preco || 0; precoPor = ing.precoPor || ing.unidade; }
    return Math.round(custoQuantidade(ing.qtd, ing.unidade, preco, precoPor) * 1000) / 1000;
  }
  // custo total da receita = soma dos ingredientes (ao vivo, com preços atuais do estoque)
  function custoReceita(receita) {
    if (!receita) return 0;
    if (receita.ingredientes && receita.ingredientes.length) {
      return Math.round(receita.ingredientes.reduce(function (s, i) { return s + custoIngrediente(i); }, 0) * 100) / 100;
    }
    return receita.custoEstimado || 0;
  }
  // custo por bola de um sabor: do campo direto OU da receita (custoReceita / rendimentoBolas).
  function custoPorBola(sabor) {
    if (!sabor) return 0;
    if (sabor.custoPorBola != null) return sabor.custoPorBola;
    if (sabor.receitaId) {
      const r = find("receitas", sabor.receitaId);
      if (r && r.rendimentoBolas) return Math.round(custoReceita(r) / r.rendimentoBolas * 100) / 100;
    }
    return 0;
  }
  // custo médio de um produto base (sem escolher sabor): custoFixo + bolas × média dos sabores.
  function custoMedioProduto(produto) {
    if (!produto) return 0;
    const fix = produto.custoFixo || 0;
    if (!produto.bolas) return fix;
    const sabores = table("sabores");
    if (!sabores.length) return fix;
    const media = sabores.reduce(function (s, sb) { return s + custoPorBola(sb); }, 0) / sabores.length;
    return Math.round((fix + produto.bolas * media) * 100) / 100;
  }
  // custo de uma unidade do produto = custo fixo (embalagem) + bolas × média dos sabores escolhidos.
  function custoLinha(produto, saboresIds) {
    if (!produto) return 0;
    const fix = produto.custoFixo || 0;
    const chosen = (saboresIds || []).map(function (id) { return find("sabores", id); }).filter(Boolean);
    let varc = 0;
    if (produto.bolas && chosen.length) {
      const media = chosen.reduce(function (s, sb) { return s + custoPorBola(sb); }, 0) / chosen.length;
      varc = produto.bolas * media;
    }
    return Math.round((fix + varc) * 100) / 100;
  }
  function _darBaixa(itemId, baixa, venda, extra) {
    const it = find("itens", itemId);
    if (!it) return;
    baixa = Math.round(baixa * 1000) / 1000;
    it.qtd = Math.max(0, Math.round((it.qtd - baixa) * 1000) / 1000);
    db.movimentacoes.push({
      id: uid("mov"), datetime: venda.datetime, itemId: it.id, tipo: "saida", qtd: baixa,
      localId: it.localId, motivo: "Venda PDV #" + venda.numero + (extra ? " · " + extra : ""), responsavel: venda.operador, refId: venda.id
    });
  }
  function nivelCliente(pontos) { return pontos >= 2000 ? "Diamante" : pontos >= 800 ? "Ouro" : pontos >= 250 ? "Prata" : "Bronze"; }
  function custoCobertura(a) {
    return (a.consome || []).reduce(function (s, c) { const it = find("itens", c.itemId); return s + (it ? custoQuantidade(c.qtd, it.unidade, it.custoUnit, it.unidade) : 0); }, 0);
  }

  // Registra uma venda do PDV.
  // payload.itens: [{produtoId, qtd, saboresIds:[...], adicionais:[coberturaId,...]}]
  // payload: {operador, formaPagamento, valorRecebido, clienteId, resgate:{cashback}}
  function registrarVenda(payload) {
    const linhas = [];
    let total = 0, custoTotal = 0;
    payload.itens.forEach(function (l) {
      const p = find("produtos", l.produtoId);
      if (!p) return;
      const q = Number(l.qtd) || 0;
      if (q <= 0) return;
      const saboresIds = l.saboresIds || [];
      const nomesSab = saboresIds.map(function (id) { const s = find("sabores", id); return s ? s.nome : null; }).filter(Boolean);
      const adicIds = l.adicionais || [];
      const adic = adicIds.map(function (id) { return find("coberturas", id); }).filter(Boolean);
      const adicPreco = adic.reduce(function (s, a) { return s + (a.preco || 0); }, 0);
      const adicCusto = adic.reduce(function (s, a) { return s + custoCobertura(a); }, 0);
      const custoBase = saboresIds.length ? custoLinha(p, saboresIds) : custoMedioProduto(p);
      const custoUnit = Math.round((custoBase + adicCusto) * 100) / 100;
      const precoUnit = Math.round((p.precoVenda + adicPreco) * 100) / 100;
      linhas.push({ produtoId: p.id, nome: p.nome, qtd: q, saboresIds: saboresIds, sabores: nomesSab, adicionais: adicIds, adicionaisNomes: adic.map(function (a) { return a.nome; }), precoUnit: precoUnit, custoUnit: custoUnit, subtotal: Math.round(precoUnit * q * 100) / 100 });
      total += precoUnit * q;
      custoTotal += custoUnit * q;
    });
    if (!linhas.length) return null;
    total = Math.round(total * 100) / 100;
    custoTotal = Math.round(custoTotal * 100) / 100;

    // cliente + resgate de cashback
    let cliente = payload.clienteId ? find("clientes", payload.clienteId) : null;
    let descontoResgate = 0;
    if (cliente && payload.resgate && payload.resgate.cashback) {
      descontoResgate = Math.min(Number(payload.resgate.cashback) || 0, cliente.cashback || 0, total);
      descontoResgate = Math.round(descontoResgate * 100) / 100;
    }
    const totalPago = Math.round((total - descontoResgate) * 100) / 100;

    const numero = db.config.proximoPedido || (table("vendas").length + 1);
    db.config.proximoPedido = numero + 1;
    const dinheiro = payload.formaPagamento === "Dinheiro";
    const valorRecebido = (dinheiro && payload.valorRecebido != null) ? Number(payload.valorRecebido) : null;
    const troco = (valorRecebido != null) ? Math.round((valorRecebido - totalPago) * 100) / 100 : null;
    const venda = {
      id: uid("vnd"), numero: numero, datetime: nowISO(), operador: payload.operador || "—",
      itens: linhas, total: totalPago, totalBruto: total, descontoResgate: descontoResgate,
      custoTotal: custoTotal, lucro: Math.round((totalPago - custoTotal) * 100) / 100,
      formaPagamento: payload.formaPagamento || "Dinheiro", valorRecebido: valorRecebido, troco: troco,
      clienteId: cliente ? cliente.id : null
    };
    insert("vendas", venda);
    // baixa de estoque
    linhas.forEach(function (l) {
      const p = find("produtos", l.produtoId);
      if (p.consomeEstoque) { (p.consome || []).forEach(function (c) { _darBaixa(c.itemId, c.qtd * l.qtd, venda); }); }
      const chosen = (l.saboresIds || []).map(function (id) { return find("sabores", id); }).filter(Boolean);
      if (chosen.length && p.bolas) {
        const porBola = p.bolas / chosen.length;
        chosen.forEach(function (sb) {
          if (sb.consomeEstoque) { (sb.consome || []).forEach(function (c) { _darBaixa(c.itemId, c.qtd * porBola * l.qtd, venda, "Sabor " + sb.nome); }); }
        });
      }
      (l.adicionais || []).forEach(function (aid) { const a = find("coberturas", aid); if (a && a.consomeEstoque) { (a.consome || []).forEach(function (c) { _darBaixa(c.itemId, c.qtd * l.qtd, venda, "Adicional " + a.nome); }); } });
    });
    // fidelidade: pontos, cashback, estatísticas do cliente
    if (cliente) {
      cliente.cashback = Math.round(((cliente.cashback || 0) - descontoResgate) * 100) / 100;
      const pontosGanhos = Math.floor(totalPago);
      cliente.pontos = (cliente.pontos || 0) + pontosGanhos;
      cliente.visitas = (cliente.visitas || 0) + 1;
      cliente.totalGasto = Math.round(((cliente.totalGasto || 0) + totalPago) * 100) / 100;
      cliente.ultimaCompra = todayISO();
      cliente.nivel = nivelCliente(cliente.pontos);
      venda.pontosGanhos = pontosGanhos;
    }
    save();
    return venda;
  }

  // PERDAS / DESPERDÍCIO — dá baixa no estoque e registra com motivo + custo (última compra).
  function registrarPerda(payload) {
    const tipo = payload.tipo || "insumo";
    let nome = payload.nome, custo = 0;
    const qtd = Number(payload.qtd) || 0;
    const perda = {
      id: uid("perda"), datetime: nowISO(), tipo: tipo, refId: payload.refId, nome: nome,
      qtd: qtd, unidade: payload.unidade || "un", motivo: payload.motivo || "Não informado", responsavel: payload.responsavel || "—"
    };
    if (tipo === "insumo") {
      const it = find("itens", payload.refId);
      if (it) {
        perda.nome = it.nome; perda.unidade = it.unidade;
        custo = Math.round(it.custoUnit * qtd * 100) / 100;
        it.qtd = Math.max(0, Math.round((it.qtd - qtd) * 1000) / 1000);
        db.movimentacoes.push({ id: uid("mov"), datetime: perda.datetime, itemId: it.id, tipo: "saida", qtd: qtd, localId: it.localId, motivo: "Perda: " + perda.motivo, responsavel: perda.responsavel, refId: perda.id });
      }
    } else {
      const p = find("produtos", payload.refId);
      if (p) {
        perda.nome = p.nome;
        custo = Math.round(custoMedioProduto(p) * qtd * 100) / 100;
        if (p.consomeEstoque) { (p.consome || []).forEach(function (c) { const it = find("itens", c.itemId); if (it) { it.qtd = Math.max(0, Math.round((it.qtd - c.qtd * qtd) * 1000) / 1000); db.movimentacoes.push({ id: uid("mov"), datetime: perda.datetime, itemId: it.id, tipo: "saida", qtd: c.qtd * qtd, localId: it.localId, motivo: "Perda: " + perda.motivo, responsavel: perda.responsavel, refId: perda.id }); } }); }
      }
    }
    perda.custo = custo;
    insert("perdas", perda);
    return perda;
  }

  // CAIXA — abertura, sangria/suprimento e fechamento cego (revela sobra/falta).
  function abrirCaixa(payload) {
    const cx = { id: uid("cx"), operador: payload.operador || "—", abertura: nowISO(), fundoTroco: Number(payload.fundoTroco) || 0, sangrias: [], suprimentos: [], fechamento: null, vendasDinheiro: 0, esperado: null, contado: null, diferenca: null, status: "aberto" };
    insert("caixaSessions", cx);
    return cx;
  }
  function caixaAberto() { return table("caixaSessions").find(function (c) { return c.status === "aberto"; }); }
  function _hora() { const d = new Date(); return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function registrarSangria(cxId, valor, motivo) { const cx = find("caixaSessions", cxId); if (!cx) return null; cx.sangrias.push({ valor: Number(valor) || 0, motivo: motivo || "Sangria", hora: _hora() }); save(); return cx; }
  function registrarSuprimento(cxId, valor, motivo) { const cx = find("caixaSessions", cxId); if (!cx) return null; cx.suprimentos.push({ valor: Number(valor) || 0, motivo: motivo || "Suprimento", hora: _hora() }); save(); return cx; }
  function fecharCaixa(cxId, contado) {
    const cx = find("caixaSessions", cxId);
    if (!cx) return null;
    const desde = new Date(cx.abertura);
    const vendasDinheiro = table("vendas").filter(function (v) { return v.formaPagamento === "Dinheiro" && new Date(v.datetime) >= desde; }).reduce(function (s, v) { return s + v.total; }, 0);
    const sangrias = cx.sangrias.reduce(function (s, x) { return s + x.valor; }, 0);
    const suprimentos = cx.suprimentos.reduce(function (s, x) { return s + x.valor; }, 0);
    cx.vendasDinheiro = Math.round(vendasDinheiro * 100) / 100;
    cx.esperado = Math.round((cx.fundoTroco + vendasDinheiro + suprimentos - sangrias) * 100) / 100;
    cx.contado = Math.round((Number(contado) || 0) * 100) / 100;
    cx.diferenca = Math.round((cx.contado - cx.esperado) * 100) / 100;
    cx.fechamento = nowISO();
    cx.status = "fechado";
    save();
    return cx;
  }

  // Movimentação manual de estoque (entrada/saida/ajuste)
  function movimentar(m) {
    const it = find("itens", m.itemId);
    if (!it) return null;
    const q = Number(m.qtd) || 0;
    if (m.tipo === "entrada") it.qtd = Math.round((it.qtd + q) * 1000) / 1000;
    else if (m.tipo === "saida") it.qtd = Math.max(0, Math.round((it.qtd - q) * 1000) / 1000);
    else if (m.tipo === "ajuste") it.qtd = q; // ajuste define o saldo
    const mov = {
      id: uid("mov"), datetime: nowISO(), itemId: m.itemId, tipo: m.tipo, qtd: q,
      localId: m.localId || it.localId, motivo: m.motivo || "Movimentação manual", responsavel: m.responsavel || "—", refId: m.refId || null
    };
    db.movimentacoes.push(mov);
    save();
    return mov;
  }

  // Recebe uma compra: dá entrada no estoque, registra movimentações e atualiza custo/validade.
  function receberCompra(compraId, opts) {
    opts = opts || {};
    const c = find("compras", compraId);
    if (!c || c.status === "recebido") return null;
    c.status = "recebido";
    c.dataRecebido = todayISO();
    c.itens.forEach(function (li) {
      const it = find("itens", li.itemId);
      if (it) {
        it.qtd = Math.round((it.qtd + (Number(li.qtd) || 0)) * 1000) / 1000;
        if (li.custoUnit) it.custoUnit = li.custoUnit;
        if (opts.validade) it.validade = opts.validade;
        db.movimentacoes.push({
          id: uid("mov"), datetime: nowISO(), itemId: it.id, tipo: "entrada", qtd: Number(li.qtd) || 0,
          localId: it.localId, motivo: "Compra recebida", responsavel: opts.responsavel || "Estoque", refId: c.id
        });
      }
    });
    save();
    return c;
  }

  function registrarLimpeza(tarefaId, responsavel) {
    const d = new Date();
    const reg = {
      id: uid("lreg"), tarefaId: tarefaId, data: todayISO(),
      hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      datetime: nowISO(), responsavel: responsavel || "—", status: "feito"
    };
    insert("limpezaRegistros", reg);
    return reg;
  }

  /* ============================================================
     ANALÍTICA (para o Dashboard / KPIs)
     ============================================================ */
  const analytics = {
    vendasNoPeriodo: function (dias) {
      const limite = new Date(); limite.setDate(limite.getDate() - dias);
      return table("vendas").filter(function (v) { return new Date(v.datetime) >= limite; });
    },
    faturamento: function (dias) {
      return this.vendasNoPeriodo(dias).reduce(function (s, v) { return s + v.total; }, 0);
    },
    ticketMedio: function (dias) {
      const vs = this.vendasNoPeriodo(dias);
      return vs.length ? vs.reduce(function (s, v) { return s + v.total; }, 0) / vs.length : 0;
    },
    qtdVendas: function (dias) { return this.vendasNoPeriodo(dias).length; },
    itensVendidos: function (dias) {
      const map = {};
      this.vendasNoPeriodo(dias).forEach(function (v) {
        v.itens.forEach(function (l) {
          if (!map[l.produtoId]) map[l.produtoId] = { produtoId: l.produtoId, nome: l.nome, qtd: 0, receita: 0 };
          map[l.produtoId].qtd += l.qtd; map[l.produtoId].receita += l.subtotal;
        });
      });
      return Object.values(map);
    },
    topProdutos: function (dias, n) {
      return this.itensVendidos(dias).sort(function (a, b) { return b.qtd - a.qtd; }).slice(0, n || 5);
    },
    bottomProdutos: function (dias, n) {
      return this.itensVendidos(dias).sort(function (a, b) { return a.qtd - b.qtd; }).slice(0, n || 5);
    },
    vendasPorDia: function (dias) {
      const out = [];
      for (let i = dias - 1; i >= 0; i--) {
        const dia = daysFromNow(-i);
        const total = table("vendas").filter(function (v) { return v.datetime.slice(0, 10) === dia; })
          .reduce(function (s, v) { return s + v.total; }, 0);
        out.push({ date: dia, total: Math.round(total * 100) / 100 });
      }
      return out;
    },
    vendasPorMes: function () {
      const map = {};
      table("vendas").forEach(function (v) {
        const k = v.datetime.slice(0, 7);
        map[k] = (map[k] || 0) + v.total;
      });
      return Object.keys(map).sort().map(function (k) {
        const m = parseInt(k.slice(5, 7), 10) - 1;
        return { mes: k, label: fmt.monthName(m), total: Math.round(map[k] * 100) / 100 };
      });
    },
    estoqueBaixo: function () {
      return table("itens").filter(function (it) { return it.qtd <= it.qtdMin; });
    },
    validadeProxima: function (dias) {
      return table("itens").filter(function (it) {
        if (!it.validade) return false;
        const d = daysBetween(todayISO(), it.validade);
        return d >= 0 && d <= dias;
      }).sort(function (a, b) { return new Date(a.validade) - new Date(b.validade); });
    },
    valorEstoque: function () {
      return table("itens").reduce(function (s, it) { return s + it.qtd * (it.custoUnit || 0); }, 0);
    },
    lucro: function (dias) {
      return this.vendasNoPeriodo(dias).reduce(function (s, v) { return s + (v.lucro != null ? v.lucro : 0); }, 0);
    },
    custoVendido: function (dias) {
      return this.vendasNoPeriodo(dias).reduce(function (s, v) { return s + (v.custoTotal != null ? v.custoTotal : 0); }, 0);
    },
    margemMedia: function (dias) {
      const vs = this.vendasNoPeriodo(dias || 30);
      const fat = vs.reduce(function (s, v) { return s + v.total; }, 0);
      const luc = vs.reduce(function (s, v) { return s + (v.lucro != null ? v.lucro : 0); }, 0);
      if (fat > 0) return luc / fat * 100;
      const ps = table("produtos");
      if (!ps.length) return 0;
      return ps.reduce(function (s, p) { return s + (p.precoVenda ? (p.precoVenda - (p.custoFixo || 0)) / p.precoVenda * 100 : 0); }, 0) / ps.length;
    },
    // caixa do dia em dinheiro: quanto entrou, quanto saiu de troco, líquido na gaveta
    caixaDinheiroHoje: function () {
      const hoje = todayISO();
      const vs = table("vendas").filter(function (v) { return v.formaPagamento === "Dinheiro" && v.datetime.slice(0, 10) === hoje; });
      const entrou = vs.reduce(function (s, v) { return s + (v.valorRecebido != null ? v.valorRecebido : v.total); }, 0);
      const troco = vs.reduce(function (s, v) { return s + (v.troco != null ? v.troco : 0); }, 0);
      const liquido = vs.reduce(function (s, v) { return s + v.total; }, 0);
      return { entrou: Math.round(entrou * 100) / 100, troco: Math.round(troco * 100) / 100, liquido: Math.round(liquido * 100) / 100, vendas: vs.length };
    },
    limpezasHoje: function () {
      const hoje = todayISO();
      return table("limpezaRegistros").filter(function (r) { return r.data === hoje; });
    },
    producaoPendente: function () {
      return table("producao").filter(function (p) { return p.status !== "concluida"; });
    },
    // perdas
    perdasNoPeriodo: function (dias) {
      const limite = new Date(); limite.setDate(limite.getDate() - dias);
      return table("perdas").filter(function (p) { return new Date(p.datetime) >= limite; });
    },
    perdasTotal: function (dias) { return this.perdasNoPeriodo(dias).reduce(function (s, p) { return s + (p.custo || 0); }, 0); },
    perdasPorMotivo: function (dias) {
      const map = {};
      this.perdasNoPeriodo(dias).forEach(function (p) { if (!map[p.motivo]) map[p.motivo] = { motivo: p.motivo, custo: 0, qtd: 0 }; map[p.motivo].custo += p.custo || 0; map[p.motivo].qtd += 1; });
      return Object.values(map).sort(function (a, b) { return b.custo - a.custo; });
    },
    // validade FEFO (itens ordenados por vencimento mais próximo)
    validadeFEFO: function () {
      return table("itens").filter(function (it) { return it.validade; })
        .map(function (it) { return { item: it, diasParaVencer: daysBetween(todayISO(), it.validade), valor: Math.round(it.qtd * (it.custoUnit || 0) * 100) / 100 }; })
        .sort(function (a, b) { return a.diasParaVencer - b.diasParaVencer; });
    },
    valorVencendo: function (dias) {
      return this.validadeFEFO().filter(function (x) { return x.diasParaVencer >= 0 && x.diasParaVencer <= dias; }).reduce(function (s, x) { return s + x.valor; }, 0);
    },
    // variância de CMV: saída real x explicada por vendas x perdas -> não explicado
    variancaCMV: function (dias) {
      const vendas = this.vendasNoPeriodo(dias);
      const limite = new Date(); limite.setDate(limite.getDate() - dias);
      const out = {};
      function add(itemId, campo, q) { if (!out[itemId]) out[itemId] = { itemId: itemId, real: 0, vendas: 0, perdas: 0 }; out[itemId][campo] += q; }
      // real = movimentações de saída no período
      table("movimentacoes").forEach(function (m) { if (m.tipo === "saida" && new Date(m.datetime) >= limite) add(m.itemId, "real", m.qtd); });
      // teórico por vendas (embalagens/bebidas + sabor que consome)
      vendas.forEach(function (v) {
        v.itens.forEach(function (l) {
          const p = find("produtos", l.produtoId);
          if (p && p.consomeEstoque) (p.consome || []).forEach(function (c) { add(c.itemId, "vendas", c.qtd * l.qtd); });
          (l.saboresIds || []).forEach(function (sid) { const sb = find("sabores", sid); if (sb && sb.consomeEstoque) (sb.consome || []).forEach(function (c) { add(c.itemId, "vendas", c.qtd * l.qtd / Math.max(1, l.saboresIds.length)); }); });
          (l.adicionais || []).forEach(function (aid) { const a = find("coberturas", aid); if (a && a.consomeEstoque) (a.consome || []).forEach(function (c) { add(c.itemId, "vendas", c.qtd * l.qtd); }); });
        });
      });
      // perdas no período
      this.perdasNoPeriodo(dias).forEach(function (perda) {
        if (perda.tipo === "insumo") add(perda.refId, "perdas", perda.qtd);
        else { const p = find("produtos", perda.refId); if (p && p.consomeEstoque) (p.consome || []).forEach(function (c) { add(c.itemId, "perdas", c.qtd * perda.qtd); }); }
      });
      return Object.keys(out).map(function (id) {
        const it = find("itens", id); const r = out[id];
        const naoExplicado = Math.round((r.real - r.vendas - r.perdas) * 1000) / 1000;
        const pct = r.real ? Math.abs(naoExplicado) / r.real * 100 : 0;
        return {
          item: it, real: Math.round(r.real * 1000) / 1000, vendas: Math.round(r.vendas * 1000) / 1000, perdas: Math.round(r.perdas * 1000) / 1000,
          naoExplicado: naoExplicado, custoNaoExplicado: Math.round(naoExplicado * (it ? it.custoUnit || 0 : 0) * 100) / 100,
          pct: pct, status: pct <= 2 ? "ok" : pct <= 5 ? "warn" : "danger"
        };
      }).filter(function (x) { return x.item && x.real > 0; }).sort(function (a, b) { return Math.abs(b.custoNaoExplicado) - Math.abs(a.custoNaoExplicado); });
    },
    // engenharia de cardápio: popularidade x margem -> quadrantes
    engenhariaCardapio: function (dias) {
      const vendidos = {};
      this.vendasNoPeriodo(dias).forEach(function (v) { v.itens.forEach(function (l) { vendidos[l.produtoId] = (vendidos[l.produtoId] || 0) + l.qtd; }); });
      const linhas = table("produtos").map(function (p) {
        const qtd = vendidos[p.id] || 0;
        const margem = Math.round((p.precoVenda - custoMedioProduto(p)) * 100) / 100;
        return { produto: p, qtd: qtd, margemUnit: margem, margemTotal: Math.round(margem * qtd * 100) / 100 };
      });
      const qtds = linhas.map(function (l) { return l.qtd; }).sort(function (a, b) { return a - b; });
      const margens = linhas.map(function (l) { return l.margemUnit; }).sort(function (a, b) { return a - b; });
      function mediana(arr) { if (!arr.length) return 0; const m = Math.floor(arr.length / 2); return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2; }
      const medQ = mediana(qtds), medM = mediana(margens);
      linhas.forEach(function (l) {
        const pop = l.qtd >= medQ, lucr = l.margemUnit >= medM;
        if (pop && lucr) { l.quadrante = "Estrela"; l.acao = "Destaque no balcão e na vitrine"; }
        else if (pop && !lucr) { l.quadrante = "Cavalo de batalha"; l.acao = "Vende muito, margem baixa: ajustar porção/custo"; }
        else if (!pop && lucr) { l.quadrante = "Quebra-cabeça"; l.acao = "Margem boa, vende pouco: promover/renomear"; }
        else { l.quadrante = "Abacaxi"; l.acao = "Vende pouco e dá pouco: rever ou aposentar"; }
      });
      return { linhas: linhas, medianaQtd: medQ, medianaMargem: medM };
    },
    // CRM / RFM
    nivelCliente: function (pontos) { return nivelCliente(pontos); },
    segmentoCliente: function (c) {
      const rec = c.ultimaCompra ? daysBetween(c.ultimaCompra, todayISO()) : 999;
      const freq = c.visitas || 0, monet = c.totalGasto || 0;
      let seg;
      if (rec > 90) seg = "Sumido";
      else if (rec > 45) seg = "Em risco";
      else if (freq >= 12 && monet >= 400) seg = "VIP";
      else if (freq >= 4) seg = "Fiel";
      else seg = "Novo";
      return { segmento: seg, recencia: rec, frequencia: freq, monetario: monet };
    },
    clientesAniversariantes: function () {
      const mes = todayISO().slice(5, 7);
      return table("clientes").filter(function (c) { return c.aniversario && c.aniversario.slice(0, 2) === mes; });
    },
    clientesEmRisco: function () {
      const self = this;
      return table("clientes").filter(function (c) { const s = self.segmentoCliente(c).segmento; return s === "Em risco" || s === "Sumido"; });
    }
  };

  /* ============================================================
     UI — hyperscript + componentes
     ============================================================ */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.keys(v).forEach(function (dk) { el.dataset[dk] = v[dk]; });
      else if (v != null && v !== false) el.setAttribute(k, v);
    });
    for (let i = 2; i < arguments.length; i++) {
      let c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) { c.forEach(function (x) { if (x != null && x !== false) el.appendChild(typeof x === "string" || typeof x === "number" ? document.createTextNode(String(x)) : x); }); }
      else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return el;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

  const ui = {
    h: h,
    clear: clear,

    pageHeader: function (title, subtitle, actions) {
      return h("div", { class: "page-head" },
        h("div", {},
          h("h1", { class: "page-title", text: title }),
          subtitle ? h("p", { class: "page-sub", text: subtitle }) : null
        ),
        actions && actions.length ? h("div", { class: "page-actions" }, actions) : null
      );
    },

    button: function (label, opts) {
      opts = opts || {};
      const b = h("button", { class: "btn " + (opts.variant ? "btn-" + opts.variant : "btn-primary"), type: "button" });
      if (opts.icon) b.insertAdjacentHTML("afterbegin", icon(opts.icon, 16));
      b.appendChild(document.createTextNode(label));
      if (opts.onClick) b.addEventListener("click", opts.onClick);
      if (opts.title) b.title = opts.title;
      return b;
    },

    badge: function (text, kind) {
      return h("span", { class: "badge badge-" + (kind || "neutral"), text: text });
    },

    kpi: function (opts) {
      return h("div", { class: "kpi" + (opts.accent ? " kpi-" + opts.accent : "") },
        h("div", { class: "kpi-top" },
          h("span", { class: "kpi-label", text: opts.label }),
          opts.icon ? h("span", { class: "kpi-ic", html: icon(opts.icon, 18) }) : null
        ),
        h("div", { class: "kpi-value", text: opts.value }),
        opts.delta ? h("div", { class: "kpi-delta " + (opts.deltaDir === "down" ? "down" : "up"), text: opts.delta }) : null,
        opts.foot ? h("div", { class: "kpi-foot", text: opts.foot }) : null
      );
    },

    card: function (title, body, opts) {
      opts = opts || {};
      return h("div", { class: "card " + (opts.class || "") },
        title ? h("div", { class: "card-head" },
          h("h3", { class: "card-title", text: title }),
          opts.action || null
        ) : null,
        h("div", { class: "card-body" }, body)
      );
    },

    empty: function (msg) {
      return h("div", { class: "empty-state", text: msg || "Nenhum registro." });
    },

    // tabela: columns [{key,label,render?(row),align?,width?}], rows [], opts {actions?(row)->[el], onRow?, dense?}
    table: function (columns, rows, opts) {
      opts = opts || {};
      const thead = h("thead", {}, h("tr", {},
        columns.map(function (c) { return h("th", { class: c.align ? "ta-" + c.align : "", style: c.width ? { width: c.width } : null, text: c.label }); }).concat(
          opts.actions ? [h("th", { class: "ta-right", text: "" })] : []
        )
      ));
      const tbody = h("tbody", {});
      if (!rows.length) {
        tbody.appendChild(h("tr", {}, h("td", { colspan: columns.length + (opts.actions ? 1 : 0), class: "td-empty", text: opts.emptyMsg || "Nenhum registro." })));
      }
      rows.forEach(function (row) {
        const tr = h("tr", {});
        columns.forEach(function (c) {
          const td = h("td", { class: c.align ? "ta-" + c.align : "" });
          const val = c.render ? c.render(row) : row[c.key];
          if (val instanceof Node) td.appendChild(val);
          else td.innerHTML = (val == null ? "—" : val);
          tr.appendChild(td);
        });
        if (opts.actions) {
          const td = h("td", { class: "ta-right td-actions" });
          (opts.actions(row) || []).forEach(function (a) { td.appendChild(a); });
          tr.appendChild(td);
        }
        if (opts.onRow) { tr.style.cursor = "pointer"; tr.addEventListener("click", function () { opts.onRow(row); }); }
        tbody.appendChild(tr);
      });
      return h("div", { class: "table-wrap" }, h("table", { class: "data-table" + (opts.dense ? " dense" : "") }, thead, tbody));
    },

    iconButton: function (name, onClick, title) {
      const b = h("button", { class: "icon-btn", type: "button", title: title || "", html: icon(name, 16) });
      if (onClick) b.addEventListener("click", function (e) { e.stopPropagation(); onClick(e); });
      return b;
    },

    toast: function (msg, kind) {
      let host = document.getElementById("toast-host");
      if (!host) { host = h("div", { id: "toast-host" }); document.body.appendChild(host); }
      const t = h("div", { class: "toast toast-" + (kind || "ok") }, msg);
      host.appendChild(t);
      requestAnimationFrame(function () { t.classList.add("show"); });
      setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2600);
    },

    confirm: function (msg, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        const ok = ui.button(opts.okLabel || "Confirmar", { variant: opts.danger ? "danger" : "primary" });
        const cancel = ui.button("Cancelar", { variant: "ghost" });
        const m = ui.modal({
          title: opts.title || "Confirmar",
          body: h("p", { class: "muted", text: msg }),
          actions: [cancel, ok], size: "sm"
        });
        ok.addEventListener("click", function () { m.close(); resolve(true); });
        cancel.addEventListener("click", function () { m.close(); resolve(false); });
      });
    },

    modal: function (opts) {
      const overlay = h("div", { class: "modal-overlay" });
      const close = function () { overlay.classList.remove("show"); setTimeout(function () { overlay.remove(); }, 200); };
      const box = h("div", { class: "modal modal-" + (opts.size || "md") },
        h("div", { class: "modal-head" },
          h("h3", { text: opts.title || "" }),
          ui.iconButton("close", close, "Fechar")
        ),
        h("div", { class: "modal-body" }, opts.body),
        opts.actions ? h("div", { class: "modal-foot" }, opts.actions) : null
      );
      overlay.appendChild(box);
      overlay.addEventListener("mousedown", function (e) { if (e.target === overlay && !opts.lock) close(); });
      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add("show"); });
      return { overlay: overlay, close: close, box: box };
    },

    /* formModal: cria um formulário a partir de specs de campos e resolve com os valores.
       fields: [{name,label,type,options?,required?,step?,prefix?,help?,placeholder?,value?,
                 render?(value)->{el,getValue},full?}]
       type: text | number | money | select | date | textarea | checkbox | custom
       Retorna Promise<valores|null>. onSubmit opcional para validação custom. */
    formModal: function (opts) {
      return new Promise(function (resolve) {
        const inputs = {};
        const getters = {};
        const grid = h("div", { class: "form-grid" });
        (opts.fields || []).forEach(function (f) {
          const fid = "f_" + f.name;
          const wrap = h("div", { class: "form-field" + (f.full ? " full" : "") });
          wrap.appendChild(h("label", { for: fid, text: f.label }));
          let input;
          const val = f.value != null ? f.value : (opts.values ? opts.values[f.name] : undefined);
          if (f.type === "custom" && f.render) {
            const r = f.render(val);
            input = r.el; getters[f.name] = r.getValue;
          } else if (f.type === "select") {
            input = h("select", { id: fid });
            (f.options || []).forEach(function (o) {
              const ov = typeof o === "object" ? o.value : o;
              const ol = typeof o === "object" ? o.label : o;
              const opt = h("option", { value: ov, text: ol });
              if (val != null && String(val) === String(ov)) opt.selected = true;
              input.appendChild(opt);
            });
          } else if (f.type === "createSelect") {
            // select que permite CADASTRAR um novo valor na hora
            const wrapSel = h("div", {});
            const sel = h("select", { id: fid });
            const opts = f.options || [];
            opts.forEach(function (o) {
              const ov = typeof o === "object" ? o.value : o;
              const ol = typeof o === "object" ? o.label : o;
              const opt = h("option", { value: ov, text: ol });
              if (val != null && String(val) === String(ov)) opt.selected = true;
              sel.appendChild(opt);
            });
            const novoOpt = h("option", { value: "__new__", text: "+ Cadastrar nova..." });
            sel.appendChild(novoOpt);
            // valor atual fora das opções? adiciona para não perder
            const existe = opts.some(function (o) { return String(typeof o === "object" ? o.value : o) === String(val); });
            if (val != null && val !== "" && !existe) {
              const opt = h("option", { value: val, text: val }); opt.selected = true; sel.insertBefore(opt, novoOpt);
            }
            const novoInput = h("input", { type: "text", placeholder: f.novoPlaceholder || "Digite o novo valor e salve", style: { display: "none", marginTop: "6px" } });
            sel.addEventListener("change", function () {
              if (sel.value === "__new__") { novoInput.style.display = "block"; novoInput.focus(); }
              else novoInput.style.display = "none";
            });
            wrapSel.appendChild(sel); wrapSel.appendChild(novoInput);
            input = wrapSel;
            getters[f.name] = function () { return sel.value === "__new__" ? (novoInput.value || "").trim() : sel.value; };
          } else if (f.type === "textarea") {
            input = h("textarea", { id: fid, rows: f.rows || 3, placeholder: f.placeholder || "" });
            if (val != null) input.value = val;
          } else if (f.type === "checkbox") {
            input = h("input", { id: fid, type: "checkbox" });
            if (val) input.checked = true;
            wrap.classList.add("form-check");
          } else {
            const typ = (f.type === "number" || f.type === "money") ? "number" : (f.type === "date" ? "date" : "text");
            input = h("input", { id: fid, type: typ, placeholder: f.placeholder || "" });
            if (f.step) input.step = f.step;
            if (f.type === "money") input.step = "0.01";
            if (f.min != null) input.min = f.min;
            if (val != null) input.value = val;
          }
          if (f.prefix) {
            const ig = h("div", { class: "input-prefix" }, h("span", { text: f.prefix }), input);
            wrap.appendChild(ig);
          } else {
            wrap.appendChild(input);
          }
          if (f.help) wrap.appendChild(h("span", { class: "field-help", text: f.help }));
          inputs[f.name] = input;
          grid.appendChild(wrap);
        });

        function collect() {
          const out = {};
          (opts.fields || []).forEach(function (f) {
            if (getters[f.name]) { out[f.name] = getters[f.name](); return; }
            const el = inputs[f.name];
            if (f.type === "checkbox") out[f.name] = el.checked;
            else if (f.type === "number" || f.type === "money") out[f.name] = el.value === "" ? null : Number(el.value);
            else out[f.name] = el.value;
          });
          return out;
        }

        const saveBtn = ui.button(opts.submitLabel || "Salvar", { variant: "primary" });
        const cancelBtn = ui.button("Cancelar", { variant: "ghost" });
        const m = ui.modal({ title: opts.title, body: grid, actions: [cancelBtn, saveBtn], size: opts.size || "md", lock: true });
        cancelBtn.addEventListener("click", function () { m.close(); resolve(null); });
        saveBtn.addEventListener("click", function () {
          const values = collect();
          // validação obrigatórios
          let erro = null;
          (opts.fields || []).forEach(function (f) {
            if (f.required && (values[f.name] == null || values[f.name] === "")) erro = "Preencha: " + f.label;
          });
          if (erro) { ui.toast(erro, "warn"); return; }
          if (opts.validate) { const e = opts.validate(values); if (e) { ui.toast(e, "warn"); return; } }
          m.close(); resolve(values);
        });
      });
    },

    /* ---------- gráficos SVG (sem dependências) ---------- */
    barChart: function (data, opts) {
      opts = opts || {};
      const W = opts.width || 520, H = opts.height || 200, pad = 28;
      const max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
      const bw = (W - pad * 2) / data.length;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("class", "chart");
      data.forEach(function (d, i) {
        const bh = (d.value / max) * (H - pad * 2);
        const x = pad + i * bw + bw * 0.15;
        const y = H - pad - bh;
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", x); rect.setAttribute("y", y);
        rect.setAttribute("width", bw * 0.7); rect.setAttribute("height", Math.max(0, bh));
        rect.setAttribute("rx", 4); rect.setAttribute("fill", d.color || opts.color || "var(--accent)");
        const tt = document.createElementNS(ns, "title");
        tt.textContent = (d.label || "") + ": " + (opts.fmt ? opts.fmt(d.value) : d.value);
        rect.appendChild(tt);
        svg.appendChild(rect);
        if (opts.labels !== false) {
          const tx = document.createElementNS(ns, "text");
          tx.setAttribute("x", x + bw * 0.35); tx.setAttribute("y", H - pad + 14);
          tx.setAttribute("text-anchor", "middle"); tx.setAttribute("class", "chart-axis");
          tx.textContent = d.label;
          svg.appendChild(tx);
        }
      });
      return svg;
    },

    lineChart: function (data, opts) {
      opts = opts || {};
      const W = opts.width || 560, H = opts.height || 200, pad = 30;
      const vals = data.map(function (d) { return d.value; });
      const max = Math.max.apply(null, vals.concat([1])), min = 0;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("class", "chart");
      const stepX = (W - pad * 2) / Math.max(1, data.length - 1);
      function px(i) { return pad + i * stepX; }
      function py(v) { return H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2); }
      let dPath = "", area = "";
      data.forEach(function (d, i) {
        dPath += (i ? "L" : "M") + px(i) + " " + py(d.value) + " ";
      });
      area = dPath + "L" + px(data.length - 1) + " " + (H - pad) + " L" + px(0) + " " + (H - pad) + " Z";
      const ap = document.createElementNS(ns, "path");
      ap.setAttribute("d", area); ap.setAttribute("fill", opts.fill || "var(--accent-soft)"); ap.setAttribute("opacity", "0.5");
      svg.appendChild(ap);
      const lp = document.createElementNS(ns, "path");
      lp.setAttribute("d", dPath); lp.setAttribute("fill", "none");
      lp.setAttribute("stroke", opts.color || "var(--accent)"); lp.setAttribute("stroke-width", "2.5");
      lp.setAttribute("stroke-linejoin", "round"); lp.setAttribute("stroke-linecap", "round");
      svg.appendChild(lp);
      data.forEach(function (d, i) {
        if (opts.labels && (i % Math.ceil(data.length / 8) === 0)) {
          const tx = document.createElementNS(ns, "text");
          tx.setAttribute("x", px(i)); tx.setAttribute("y", H - pad + 14);
          tx.setAttribute("text-anchor", "middle"); tx.setAttribute("class", "chart-axis");
          tx.textContent = d.label;
          svg.appendChild(tx);
        }
      });
      return svg;
    },

    donut: function (segments, opts) {
      opts = opts || {};
      const size = opts.size || 180, r = size / 2 - 14, cx = size / 2, cy = size / 2;
      const total = segments.reduce(function (s, x) { return s + x.value; }, 0) || 1;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 " + size + " " + size);
      svg.setAttribute("class", "chart");
      let acc = 0;
      const circ = 2 * Math.PI * r;
      segments.forEach(function (sg) {
        const frac = sg.value / total;
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
        c.setAttribute("fill", "none"); c.setAttribute("stroke", sg.color);
        c.setAttribute("stroke-width", opts.thickness || 20);
        c.setAttribute("stroke-dasharray", (frac * circ) + " " + circ);
        c.setAttribute("stroke-dashoffset", -acc * circ);
        c.setAttribute("transform", "rotate(-90 " + cx + " " + cy + ")");
        const tt = document.createElementNS(ns, "title"); tt.textContent = sg.label + ": " + sg.value; c.appendChild(tt);
        svg.appendChild(c);
        acc += frac;
      });
      if (opts.center) {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", cx); t.setAttribute("y", cy + 5); t.setAttribute("text-anchor", "middle");
        t.setAttribute("class", "donut-center"); t.textContent = opts.center;
        svg.appendChild(t);
      }
      return svg;
    }
  };

  /* ============================================================
     MÓDULOS + ROTEAMENTO
     ============================================================ */
  /* ---------- autenticação / papéis ---------- */
  let usuarioAtual = null;
  function login(usuario, senha) {
    const u = table("usuarios").find(function (x) {
      return x.ativo && x.usuario.toLowerCase() === String(usuario || "").toLowerCase() && x.senha === String(senha || "");
    });
    if (u) { usuarioAtual = u; return u; }
    return null;
  }
  function logout() { usuarioAtual = null; }
  function currentUser() { return usuarioAtual; }
  function papel() { return usuarioAtual ? usuarioAtual.papel : "gestor"; }
  function ehGestor() { return papel() === "gestor"; }
  // caixa NÃO vê custo, margem, lucro, valores de compra nem ganhos. Gestor vê tudo.
  function podeVerFinanceiro() { return papel() === "gestor"; }

  const modules = [];
  function registerModule(def) { modules.push(def); }
  function getModules() {
    const pp = papel();
    return modules.slice()
      .filter(function (m) { return !m.roles || m.roles.indexOf(pp) >= 0; })
      .sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  }

  let mountEl = null;
  function navigate(id) {
    if (location.hash !== "#" + id) { location.hash = id; return; }
    render(id);
  }
  function render(id) {
    const mods = getModules();
    const mod = mods.find(function (m) { return m.id === id; }) || mods[0];
    if (!mod || !mountEl) return;
    clear(mountEl);
    // marca item ativo
    document.querySelectorAll(".nav-item").forEach(function (n) {
      n.classList.toggle("active", n.dataset.mod === mod.id);
    });
    const titleEl = document.getElementById("topbar-title");
    if (titleEl) titleEl.textContent = mod.label;
    try { mod.render(mountEl); }
    catch (e) { mountEl.appendChild(h("div", { class: "empty-state", text: "Erro ao carregar o módulo: " + e.message })); console.error(e); }
    if (window.innerWidth < 900) document.body.classList.remove("nav-open");
  }
  function boot(mount) {
    mountEl = mount;
    const sidebar = document.getElementById("nav-list");
    if (sidebar) {
      clear(sidebar);
      getModules().forEach(function (m) {
        const item = h("a", {
          class: "nav-item", href: "#" + m.id, dataset: { mod: m.id },
          html: '<span class="nav-ic">' + icon(m.icon, 19) + '</span><span>' + m.label + "</span>"
        });
        sidebar.appendChild(item);
      });
    }
    window.addEventListener("hashchange", function () { render(location.hash.slice(1)); });
    render(location.hash.slice(1) || getModules()[0].id);
  }

  /* ---------- API pública ---------- */
  return {
    KEY: KEY,
    load: load, save: save, reset: reset, get: get,
    table: table, find: find, insert: insert, update: update, remove: remove,
    registrarVenda: registrarVenda, movimentar: movimentar, receberCompra: receberCompra, registrarLimpeza: registrarLimpeza,
    registrarPerda: registrarPerda, abrirCaixa: abrirCaixa, caixaAberto: caixaAberto, registrarSangria: registrarSangria, registrarSuprimento: registrarSuprimento, fecharCaixa: fecharCaixa, nivelCliente: nivelCliente,
    custoPorBola: custoPorBola, custoLinha: custoLinha, custoIngrediente: custoIngrediente, custoReceita: custoReceita,
    custoMedioProduto: custoMedioProduto, custoQuantidade: custoQuantidade, fatorUnidade: fatorUnidade, UNIDADES: UNIDADES,
    analytics: analytics,
    login: login, logout: logout, currentUser: currentUser, papel: papel, ehGestor: ehGestor, podeVerFinanceiro: podeVerFinanceiro,
    fmt: fmt, icon: icon, uid: uid, clone: clone,
    todayISO: todayISO, nowISO: nowISO, daysFromNow: daysFromNow, daysBetween: daysBetween,
    ui: ui,
    registerModule: registerModule, getModules: getModules, navigate: navigate, render: render, boot: boot
  };
})();
