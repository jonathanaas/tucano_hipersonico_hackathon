/**
 * invoice.parser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Faz o parse do CSV da fatura do cartão corporativo (Viagens_Internas).
 * Detecta automaticamente os campos e normaliza para InvoiceRow[].
 *
 * Campos extras suportados:
 *   - Final do Cartão  → _finalCartao (últimos dígitos)
 *   - Estornado        → _isEstorno (bool); estornos são incluídos, não filtrados
 */

import * as Papa from "papaparse";
import { normalizeAmount, normalizeDate } from "./reconciliation.js";

// ─── Detecção de tipo de arquivo ──────────────────────────────────────────────

/**
 * Detecta se o CSV é uma fatura do cartão corporativo.
 * @param {string[]} headers
 * @returns {"invoice" | "unknown"}
 */
export function detectInvoiceFile(headers) {
  const h = headers.map((x) =>
    String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
  );
  const hasColaborador = h.some((c) => c.includes("colaborador"));
  const hasSaldo       = h.some((c) => c.includes("saldo"));
  const hasFinalCartao = h.some((c) => c.includes("final") || c.includes("cartao") || c.includes("cart"));
  if (hasColaborador && (hasSaldo || hasFinalCartao)) return "invoice";
  return "unknown";
}

// ─── Detecção de colunas ──────────────────────────────────────────────────────

/**
 * Detecta índices de colunas de forma flexível (suporta encoding corrompido).
 * @param {string[]} headers
 * @returns {object}
 */
function detectColumns(headers) {
  const norm = headers.map((h) =>
    String(h).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, "").trim().toLowerCase()
  );

  const find = (patterns) => norm.findIndex((h) => patterns.some((p) => h.includes(p)));

  return {
    iData:        find(["data"]),
    iTipo:        find(["tipo"]),
    iDesc:        find(["descri", "ao"]),             // "descrição" normalizado
    iColaborador: find(["colaborador"]),
    iValor:       find([" valor", "valor"]),
    iCidade:      find(["cidade"]),
    iEstornado:   find(["estornado"]),
    iFinalCartao: find(["final", "cartao", "cart"]),  // últimos dígitos do cartão
  };
}

// ─── Parser principal ─────────────────────────────────────────────────────────

/**
 * Faz o parse do arquivo CSV da fatura.
 *
 * Retorna InvoiceRow[] com:
 *   _id, _date, _dateKey, _valor, _desc, _tipo, _colaborador,
 *   _cidade, _finalCartao, _isEstorno, _raw, _headers
 *
 * Estornos: incluídos com _isEstorno=true (não são filtrados).
 * Tipos fora de "Compra"/"Pix": filtrados (transferências, saques, etc.).
 *
 * @param {File} file
 * @returns {Promise<{ rows: InvoiceRow[], errors: string[] }>}
 */
export function parseInvoiceCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      encoding:       "latin1",
      skipEmptyLines: false,
      complete(result) {
        const data = result.data;
        if (!data || data.length < 2) {
          return reject(new Error("Arquivo CSV vazio ou inválido."));
        }

        const headers  = data[0].map((h) => String(h));
        const fileType = detectInvoiceFile(headers);

        if (fileType !== "invoice") {
          return reject(
            new Error(
              "O arquivo não parece ser uma fatura do cartão corporativo. " +
              "Verifique se é o arquivo Viagens_Internas exportado do Onfly."
            )
          );
        }

        const cols   = detectColumns(headers);
        const errors = [];
        const rows   = [];

        data.slice(1).forEach((row, i) => {
          if (!row.some((c) => c !== "" && c != null)) return; // linha vazia

          const tipoRaw = String(row[cols.iTipo] ?? "").trim().toLowerCase();

          // Aceita somente compras e pix (ignora transferências, saques, etc.)
          if (!["compra", "pix"].includes(tipoRaw)) return;

          // Estorno: incluir, mas marcar
          const estornadoRaw = String(row[cols.iEstornado] ?? "").trim().toLowerCase();
          const isEstorno    = estornadoRaw === "sim";

          // Data
          const dateStr = row[cols.iData];
          const dateKey = normalizeDate(dateStr);
          if (!dateKey) {
            errors.push(`Linha ${i + 2}: data inválida "${dateStr}"`);
            return;
          }
          const dateParsed = new Date(dateKey + "T00:00:00");

          // Valor (absoluto, padrão US)
          const valor = normalizeAmount(row[cols.iValor]);
          if (valor == null) {
            errors.push(`Linha ${i + 2}: valor inválido "${row[cols.iValor]}"`);
            return;
          }

          // Descrição
          const rawDesc   = String(row[cols.iDesc] ?? "").trim();
          const descClean = rawDesc.replace(/\s+/g, " ").substring(0, 80);

          // Final do cartão (últimos dígitos)
          const finalCartao = cols.iFinalCartao >= 0
            ? String(row[cols.iFinalCartao] ?? "").trim().replace(/\D/g, "").slice(-4)
            : "";

          // Colaborador (nome original, normalização feita na conciliação)
          const colaborador = String(row[cols.iColaborador] ?? "").trim();

          rows.push({
            _id:          `inv_${i}`,
            _date:        dateParsed,
            _dateKey:     dateKey,                           // YYYY-MM-DD
            _valor:       valor,                             // float, abs
            _desc:        descClean,
            _tipo:        String(row[cols.iTipo] ?? "").trim(), // original: "Compra" | "Pix"
            _isEstorno:   isEstorno,                         // bool
            _colaborador: colaborador,
            _cidade:      cols.iCidade >= 0 ? String(row[cols.iCidade] ?? "").trim() : "",
            _finalCartao: finalCartao,                       // ex: "1234"
            _raw:         row,
            _headers:     headers,
          });
        });

        resolve({ rows, errors });
      },
      error(err) {
        reject(new Error(`Erro ao ler o CSV: ${err.message}`));
      },
    });
  });
}
