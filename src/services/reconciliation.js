/**
 * reconciliation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de conciliação: fatura do cartão (CSV) × despesas Onfly (API).
 *
 * Chaves de cruzamento:
 *   Data (YYYY-MM-DD) + Valor (US float) + Nome do colaborador (sem acentos, minúsculo)
 *
 * Regras:
 *   - Toda data          → YYYY-MM-DD
 *   - Todo valor         → float US (00.00), abs
 *   - Todo nome/texto    → minúsculo, sem acentos, trim
 *   - Despesas Onfly     → excluir tipo "Padrão"
 *   - Estornos na fatura → sempre "only_invoice" com isEstorno=true
 *   - Views              → "match" (Conciliado) | "only_invoice" (Somente na fatura)
 */

// ─── Normalização ─────────────────────────────────────────────────────────────

/**
 * Remove acentos, lowercase, trim — gera string ASCII comparável.
 * @param {any} str
 * @returns {string}
 */
export function normalizeText(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normaliza valor monetário → número float com 2 casas (padrão US 00.00).
 * Suporta formatos: "1.234,56" (BR), "1234.56" (US), número direto.
 * Sempre retorna valor absoluto (sem sinal).
 * @param {any} val
 * @returns {number|null}
 */
export function normalizeAmount(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Math.abs(parseFloat(val.toFixed(2)));
  const str = String(val).trim();
  // Detecta formato BR: tem vírgula como decimal (ex: 1.234,56)
  const hasBrFormat = str.includes(",");
  const cleaned = hasBrFormat
    ? str.replace(/[^\d,]/g, "").replace(",", ".")   // 1234,56 → 1234.56
    : str.replace(/[^\d.]/g, "");                     // 1234.56 mantém
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.abs(parseFloat(n.toFixed(2)));
}

/**
 * Normaliza data de qualquer formato → "YYYY-MM-DD".
 * @param {string|Date|null} val
 * @returns {string|null}
 */
export function normalizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return [
      val.getFullYear(),
      String(val.getMonth() + 1).padStart(2, "0"),
      String(val.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const str = String(val).trim();
  // Já está em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  // DD/MM/YYYY
  const mDMY = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (mDMY) return `${mDMY[3]}-${mDMY[2]}-${mDMY[1]}`;
  // MM/DD/YY ou M/D/YY
  const mMDY = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mMDY) {
    const yr = mMDY[3].length === 2 ? 2000 + parseInt(mMDY[3]) : parseInt(mMDY[3]);
    return `${yr}-${String(mMDY[1]).padStart(2, "0")}-${String(mMDY[2]).padStart(2, "0")}`;
  }
  return null;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Extrai a data de uma despesa Onfly (tenta vários campos).
 * @param {any} exp
 * @returns {string|null}
 */
function expDate(exp) {
  return normalizeDate(
    exp.occurrence_date ?? exp.date ?? exp.created_at ?? null
  );
}

/**
 * Extrai o valor de uma despesa Onfly (tenta vários campos).
 * @param {any} exp
 * @returns {number|null}
 */
function expAmount(exp) {
  return normalizeAmount(exp.amount ?? exp.value ?? exp.total ?? null);
}

/**
 * Extrai o nome normalizado do colaborador de uma despesa Onfly.
 * @param {any} exp
 * @returns {string}
 */
function expName(exp) {
  return normalizeText(exp.user?.name ?? "");
}

/**
 * Verifica se o tipo da despesa Onfly é "Padrão" (deve ser excluído).
 * @param {any} exp
 * @returns {boolean}
 */
function isTypePadrao(exp) {
  const tipo = normalizeText(exp.expenditureType?.name ?? "");
  return tipo === "padrao" || tipo === "";
}

// ─── Motor principal ──────────────────────────────────────────────────────────

/**
 * Cruza linhas da fatura com despesas da API Onfly.
 *
 * Algoritmo:
 *  1. Filtra Onfly: remove tipo "Padrão"
 *  2. Indexa Onfly por (data | nome_normalizado)
 *  3. Para cada linha da fatura:
 *     - Estornos: always only_invoice
 *     - Compras/Pix: busca candidatos por data+nome, escolhe o de menor
 *       diferença de valor dentro da tolerância
 *  4. Monta resultados
 *
 * @param   {import('./invoice.parser.js').InvoiceRow[]} invoiceRows
 * @param   {any[]}  expenditures - Saída bruta do expenditures.service.js
 * @returns {ReconciliationResult[]}
 */
export function reconcile(invoiceRows, expenditures) {
  const AMOUNT_TOLERANCE = 0.05; // R$ 0,05 — margem de arredondamento

  // ── Passo 1: filtrar e indexar despesas Onfly ─────────────────────────────
  const onFlyFiltered = expenditures.filter((e) => !isTypePadrao(e));

  console.log(
    `[reconcile] Total Onfly: ${expenditures.length} | Após filtro (sem Padrão): ${onFlyFiltered.length}`
  );

  // Índice: "YYYY-MM-DD|nome_normalizado" → lista de { exp, amount }
  const byDateName = new Map();
  for (const e of onFlyFiltered) {
    const date   = expDate(e);
    const name   = expName(e);
    const amount = expAmount(e);
    if (!date || amount == null) continue;
    const key = `${date}|${name}`;
    if (!byDateName.has(key)) byDateName.set(key, []);
    byDateName.get(key).push({ exp: e, amount });
  }

  // ── Passo 2: cruzar fatura com Onfly ─────────────────────────────────────
  const results       = [];
  const matchedExpIds = new Set();

  for (const row of invoiceRows) {
    // Estornos nunca são conciliados — só exibidos na fatura
    if (row._isEstorno) {
      results.push({ status: "only_invoice", invoice: row, expenditure: null, diff: null });
      continue;
    }

    const date   = row._dateKey;
    const name   = normalizeText(row._colaborador);
    const amount = row._valor;
    const key    = `${date}|${name}`;

    const candidates = byDateName.get(key) ?? [];

    // Melhor match por valor (dentro da tolerância)
    let bestMatch  = null;
    let bestDiff   = Infinity;
    // Melhor candidato divergente (mesmo dia+nome mas valor fora da tolerância)
    let bestDiverg = null;
    let bestDivDiff = Infinity;

    for (const c of candidates) {
      if (matchedExpIds.has(c.exp.id)) continue;
      const diff = Math.abs(c.amount - amount);
      if (diff <= AMOUNT_TOLERANCE && diff < bestDiff) {
        bestMatch = c;
        bestDiff  = diff;
      } else if (diff > AMOUNT_TOLERANCE && diff < bestDivDiff) {
        bestDiverg  = c;
        bestDivDiff = diff;
      }
    }

    if (bestMatch) {
      matchedExpIds.add(bestMatch.exp.id);
      const diff = parseFloat((bestMatch.amount - amount).toFixed(2));
      results.push({ status: "match", invoice: row, expenditure: bestMatch.exp, diff });
    } else if (bestDiverg) {
      matchedExpIds.add(bestDiverg.exp.id);
      const diff = parseFloat((bestDiverg.amount - amount).toFixed(2));
      results.push({ status: "divergent", invoice: row, expenditure: bestDiverg.exp, diff });
    } else {
      results.push({ status: "only_invoice", invoice: row, expenditure: null, diff: null });
    }
  }

  // ── Passo 3: despesas Onfly sem correspondência → only_onfly ─────────────
  for (const e of onFlyFiltered) {
    if (!matchedExpIds.has(e.id)) {
      results.push({ status: "only_onfly", invoice: null, expenditure: e, diff: null });
    }
  }

  console.log(
    `[reconcile] match: ${results.filter((r) => r.status === "match").length}` +
    ` | divergent: ${results.filter((r) => r.status === "divergent").length}` +
    ` | only_invoice: ${results.filter((r) => r.status === "only_invoice").length}` +
    ` | only_onfly: ${results.filter((r) => r.status === "only_onfly").length}`
  );

  return results;
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────

/**
 * @param {ReconciliationResult[]} results
 * @returns {object}
 */
export function computeStats(results) {
  const matched      = results.filter((r) => r.status === "match");
  const divergent    = results.filter((r) => r.status === "divergent");
  const onlyInvoice  = results.filter((r) => r.status === "only_invoice");
  const onlyOnfly    = results.filter((r) => r.status === "only_onfly");
  const estornos     = onlyInvoice.filter((r) => r.invoice?._isEstorno);

  // Total = itens da fatura (excluindo only_onfly)
  const invoiceTotal = matched.length + divergent.length + onlyInvoice.length;

  const totalInvoiceAmount = [...matched, ...divergent, ...onlyInvoice]
    .reduce((acc, r) => acc + (r.invoice?._valor ?? 0), 0);

  const totalOnflyAmount = [...matched, ...divergent].reduce((acc, r) => {
    return acc + (normalizeAmount(r.expenditure?.amount ?? r.expenditure?.value ?? r.expenditure?.total ?? 0) ?? 0);
  }, 0);

  return {
    total:              invoiceTotal,
    matched:            matched.length,
    divergent:          divergent.length,
    onlyInvoice:        onlyInvoice.length,
    onlyOnfly:          onlyOnfly.length,
    estornos:           estornos.length,
    conciliationRate:   invoiceTotal > 0 ? Math.round((matched.length / invoiceTotal) * 100) : 0,
    totalInvoiceAmount: parseFloat(totalInvoiceAmount.toFixed(2)),
    totalOnflyAmount:   parseFloat(totalOnflyAmount.toFixed(2)),
    gap:                parseFloat((totalOnflyAmount - totalInvoiceAmount).toFixed(2)),
  };
}

// ─── Exportação CSV ───────────────────────────────────────────────────────────

/**
 * @param {ReconciliationResult[]} results
 * @returns {object[]}
 */
export function toExportRows(results) {
  return results.map((r) => {
    const tipo = r.invoice?._isEstorno ? "Estorno" : (r.invoice?._tipo ?? "");
    const expAmount = normalizeAmount(
      r.expenditure?.amount ?? r.expenditure?.value ?? r.expenditure?.total ?? null
    );

    return {
      status:              r.status === "match" ? "✓ Conciliado" : "← Somente na fatura",
      tipo_fatura:         tipo,
      data_fatura:         r.invoice?._dateKey ?? "",
      colaborador:         r.invoice?._colaborador ?? "",
      final_cartao:        r.invoice?._finalCartao ?? "",
      descricao_fatura:    r.invoice?._desc ?? "",
      valor_fatura:        r.invoice?._valor != null ? r.invoice._valor.toFixed(2) : "",
      // Onfly
      data_onfly:          expDate(r.expenditure) ?? "",
      descricao_onfly:     r.expenditure?.description ?? "",
      tipo_onfly:          r.expenditure?.expenditureType?.name ?? "",
      categoria_onfly:     r.expenditure?.expenditureType?.name ?? "",
      centro_custo:        r.expenditure?.costCenter?.name ?? "",
      rdv:                 r.expenditure?.rdv?.id ?? "",
      valor_onfly:         expAmount != null ? expAmount.toFixed(2) : "",
      diferenca:           r.diff != null ? r.diff.toFixed(2) : "",
    };
  });
}
