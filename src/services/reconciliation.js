/**
 * reconciliation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de conciliação: fatura do cartão (CSV) × despesas Onfly (API).
 *
 * ⚠️  LÓGICA DE CONCILIAÇÃO A DEFINIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Os campos reais da resposta da API ainda não foram confirmados.
 * Todo o código de matching está comentado com marcadores  TODO: CONCILIAÇÃO
 * para facilitar a implementação assim que o contrato estiver definido.
 *
 * O que já está pronto:
 *   - Estrutura de tipos (InvoiceRow, ReconciliationResult)
 *   - Esqueleto das funções públicas (reconcile, computeStats, toExportRows)
 *   - Placeholders documentados para cada decisão pendente
 *
 * O que falta (marcado com TODO):
 *   - Inspecionar a resposta real da API e mapear os campos corretos
 *   - Definir a(s) chave(s) de matching (data+valor? id do cartão? outro?)
 *   - Definir tolerâncias (valor, janela de datas)
 *   - Tratar estornos / duplicatas
 */

// ─── Tipos (JSDoc) ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} InvoiceRow
 * Linha normalizada pelo invoice.parser.js (CSV da fatura do cartão).
 *
 * @property {string}      _id           - ID sintético "inv_N"
 * @property {Date|null}   _date         - Data da transação
 * @property {string}      _dateKey      - "YYYY-MM-DD"
 * @property {number|null} _valor        - Valor absoluto em BRL
 * @property {string}      _desc         - Descrição do estabelecimento
 * @property {string}      _tipo         - "Compra" | "Pix"
 * @property {string}      _colaborador  - Nome do colaborador
 * @property {string}      _cidade       - Cidade da transação
 * @property {any}         _raw          - Linha bruta do CSV
 */

/**
 * @typedef {Object} ReconciliationResult
 *
 * @property {"match"|"match_fuzzy"|"only_invoice"|"only_onfly"} status
 *   - match         → encontrado com correspondência exata
 *   - match_fuzzy   → encontrado com critério relaxado (ex: ±1 dia)
 *   - only_invoice  → na fatura mas não encontrado no Onfly
 *   - only_onfly    → no Onfly mas não aparece na fatura
 *
 * @property {InvoiceRow|null}  invoice      - Linha da fatura
 * @property {any|null}         expenditure  - Item bruto da API Onfly
 * @property {number|null}      diff         - Diferença de valor (expenditure - invoice)
 */

// ─── Motor principal ──────────────────────────────────────────────────────────

/**
 * Cruza linhas da fatura com despesas da API Onfly.
 *
 * @param   {InvoiceRow[]} invoiceRows    - Saída do invoice.parser.js
 * @param   {any[]}        expenditures   - Saída bruta do expenditures.service.js
 * @returns {ReconciliationResult[]}
 */
export function reconcile(invoiceRows, expenditures) {
  // TODO: CONCILIAÇÃO — inspecionar a resposta real da API antes de implementar.
  //
  // Perguntas a responder com a resposta real:
  //
  //   1. Qual campo representa a DATA da despesa?
  //      Candidatos vistos no endpoint: occurrence_date, date, created_at
  //      → confirmar formato: "YYYY-MM-DD"? timestamp?
  //
  //   2. Qual campo representa o VALOR?
  //      Candidatos: amount, value, total
  //      → é positivo ou negativo? tem casas decimais como número ou string?
  //
  //   3. Existe algum campo de identificação do CARTÃO (últimos dígitos)?
  //      A fatura tem "Final do Cartão" — se a API tiver campo equivalente,
  //      podemos usar como chave primária e não depender só de data+valor.
  //
  //   4. Como identificar que é uma transação de CARTÃO (e não Pix, km, etc)?
  //      Candidatos: expenditureType.name, type, payment_type
  //
  //   5. Estornos (chargebacks) — como distinguir da despesa original?
  //      Verificar se há campo is_reversal, status, ou sinal negativo no valor.
  //
  // Esqueleto de implementação (descomentar e ajustar quando pronto):
  //
  // ── Passo 1: indexar despesas por data para lookup O(1) ──────────────────
  //
  // const byDate = new Map();
  // for (const exp of expenditures) {
  //   // TODO: substituir "exp.date" pelo campo real da API
  //   const key = exp.date?.substring(0, 10);
  //   if (!byDate.has(key)) byDate.set(key, []);
  //   byDate.get(key).push(exp);
  // }
  //
  // ── Passo 2: para cada linha da fatura, tentar encontrar match ───────────
  //
  // const results      = [];
  // const matchedIds   = new Set();
  // const TOLERANCE_BRL = 0.02; // R$ 0,02 de tolerância de arredondamento
  //
  // for (const row of invoiceRows) {
  //   // Tentativa 1 — data exata + valor exato
  //   const candidates = byDate.get(row._dateKey) ?? [];
  //   let match = candidates.find(exp =>
  //     !matchedIds.has(exp.id) &&
  //     // TODO: substituir "exp.amount" pelo campo real da API
  //     Math.abs(exp.amount - row._valor) <= TOLERANCE_BRL
  //   );
  //   let status = "match";
  //
  //   // Tentativa 2 — ±1 dia (processamento noturno das operadoras)
  //   // if (!match) {
  //   //   match = buscarEmDiaAdjacente(byDate, row, matchedIds, TOLERANCE_BRL);
  //   //   if (match) status = "match_fuzzy";
  //   // }
  //
  //   if (!match) status = "only_invoice";
  //   if (match)  matchedIds.add(match.id);
  //
  //   results.push({
  //     status,
  //     invoice:     row,
  //     expenditure: match ?? null,
  //     // TODO: substituir "match.amount" pelo campo real da API
  //     diff: match ? +(match.amount - row._valor).toFixed(2) : null,
  //   });
  // }
  //
  // ── Passo 3: despesas Onfly sem correspondência na fatura ─────────────────
  //
  // for (const exp of expenditures) {
  //   if (!matchedIds.has(exp.id)) {
  //     results.push({ status: "only_onfly", invoice: null, expenditure: exp, diff: null });
  //   }
  // }
  //
  // return results;

  // Retorno vazio enquanto a lógica não está implementada.
  // Remove esta linha quando descomentar o código acima.
  return _placeholderResults(invoiceRows, expenditures);
}

// ─── Placeholder ──────────────────────────────────────────────────────────────
// Remove esta função quando a lógica de conciliação estiver implementada.

function _placeholderResults(invoiceRows, expenditures) {
  // Marca tudo como "pendente de implementação" para que a UI já funcione
  // e mostre os dados brutos antes do matching ser definido.
  const invoicePending = invoiceRows.map((row) => ({
    status:      "only_invoice",
    invoice:     row,
    expenditure: null,
    diff:        null,
  }));

  const onflypending = expenditures.map((exp) => ({
    status:      "only_onfly",
    invoice:     null,
    expenditure: exp,
    diff:        null,
  }));

  return [...invoicePending, ...onflypending];
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────

/**
 * Computa totais e taxa de conciliação a partir dos resultados.
 *
 * @param   {ReconciliationResult[]} results
 * @returns {object}
 */
export function computeStats(results) {
  const count = (status) => results.filter((r) => r.status === status).length;

  const match       = count("match");
  const matchFuzzy  = count("match_fuzzy");
  const onlyInvoice = count("only_invoice");
  const onlyOnfly   = count("only_onfly");
  const total       = results.length;

  // TODO: CONCILIAÇÃO — substituir pelos campos reais da API nos cálculos abaixo.
  const totalInvoiceAmount = results.reduce(
    (acc, r) => acc + (r.invoice?._valor ?? 0), 0
  );
  const totalOnflyAmount = results.reduce(
    (acc, r) => acc + (/* r.expenditure?.amount ?? */ 0), 0
    // TODO: substituir 0 pelo campo real: r.expenditure?.amount ?? 0
  );

  return {
    total,
    match,
    matchFuzzy,
    onlyInvoice,
    onlyOnfly,
    conciliationRate:   total > 0 ? Math.round(((match + matchFuzzy) / total) * 100) : 0,
    totalInvoiceAmount: +totalInvoiceAmount.toFixed(2),
    totalOnflyAmount:   +totalOnflyAmount.toFixed(2),
    gap:                +(totalOnflyAmount - totalInvoiceAmount).toFixed(2),
  };
}

// ─── Exportação CSV ───────────────────────────────────────────────────────────

/**
 * Converte resultados para linhas planas (para Papa.unparse → download).
 *
 * @param   {ReconciliationResult[]} results
 * @returns {object[]}
 */
export function toExportRows(results) {
  const STATUS_LABELS = {
    match:        "✓ Conciliado",
    match_fuzzy:  "≈ Conciliado (±1 dia)",
    only_invoice: "⚠ Só na fatura",
    only_onfly:   "← Só no Onfly",
  };

  return results.map((r) => ({
    status:           STATUS_LABELS[r.status] ?? r.status,
    data_fatura:      r.invoice?._dateKey ?? "",
    descricao_fatura: r.invoice?._desc ?? "",
    colaborador:      r.invoice?._colaborador ?? "",
    valor_fatura:     r.invoice?._valor != null ? r.invoice._valor.toFixed(2) : "",

    // TODO: CONCILIAÇÃO — substituir pelos campos reais da API.
    data_onfly:       r.expenditure?.date ?? "",               // TODO: campo real
    descricao_onfly:  r.expenditure?.description ?? "",        // TODO: campo real
    categoria_onfly:  r.expenditure?.expenditureType?.name ?? "", // TODO: campo real
    centro_custo:     r.expenditure?.costCenter?.name ?? "",   // TODO: campo real
    rdv:              r.expenditure?.rdv?.id ?? "",            // TODO: campo real
    valor_onfly:      r.expenditure?.amount != null            // TODO: campo real
                        ? Number(r.expenditure.amount).toFixed(2)
                        : "",
    diferenca:        r.diff != null ? r.diff.toFixed(2) : "",
  }));
}