/**
 * invoice.parser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Faz o parse do CSV da fatura do cartão corporativo (Viagens_Internas).
 * Detecta automaticamente os campos e normaliza para InvoiceRow[].
 *
 * Também exporta `detectFileType` para validação no upload.
 */

import * as Papa from "papaparse";

// ─── Utilitários ──────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();

  // m/d/yy hh:mm  ou  m/d/yy  (formato Viagens_Internas)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m1) {
    const yr = m1[3].length === 2 ? 2000 + parseInt(m1[3]) : parseInt(m1[3]);
    const date = new Date(yr, parseInt(m1[1]) - 1, parseInt(m1[2]));
    return { date, key: toDateKey(date) };
  }

  // dd/mm/yyyy
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) {
    const date = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
    return { date, key: toDateKey(date) };
  }

  return null;
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseAmount(str) {
  if (str == null || str === "") return null;
  const cleaned = String(str).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.abs(n);
}

// ─── Detecção de tipo de arquivo ──────────────────────────────────────────────

/**
 * Detecta se o CSV é uma fatura do cartão corporativo.
 * @param {string[]} headers
 * @returns {"invoice" | "unknown"}
 */
export function detectInvoiceFile(headers) {
  const h = headers.map((x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase());
  const hasColaborador = h.some((c) => c.includes("colaborador"));
  const hasSaldo       = h.some((c) => c.includes("saldo"));
  const hasFinalCartao = h.some((c) => c.includes("final") || c.includes("cartao") || c.includes("cart"));
  if (hasColaborador && (hasSaldo || hasFinalCartao)) return "invoice";
  return "unknown";
}

// ─── Parser principal ─────────────────────────────────────────────────────────

/**
 * Detecta índices de colunas de forma flexível (suporta encoding corrompido).
 * @param {string[]} headers
 */
function detectColumns(headers) {
  const norm = headers.map((h) =>
    String(h).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, "").trim().toLowerCase()
  );

  const find = (patterns) => norm.findIndex((h) => patterns.some((p) => h.includes(p)));

  return {
    iData:        find(["data"]),
    iTipo:        find(["tipo"]),
    iDesc:        find(["descri", "ao"]),        // "descrição" normalizado
    iColaborador: find(["colaborador"]),
    iValor:       find([" valor", "valor"]),      // pode ter espaço no header
    iCidade:      find(["cidade"]),
    iEstornado:   find(["estornado"]),
  };
}

/**
 * Faz o parse do arquivo CSV da fatura.
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

        const headers = data[0].map((h) => String(h));
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

          const tipo = String(row[cols.iTipo] ?? "").trim().toLowerCase();

          // Filtra apenas compras e pix (ignora estornos, transferências, saques)
          if (!["compra", "pix"].includes(tipo)) return;

          // Ignora estornos marcados
          const estornado = String(row[cols.iEstornado] ?? "").trim().toLowerCase();
          if (estornado === "sim") return;

          const parsedDate = parseDate(row[cols.iData]);
          if (!parsedDate) {
            errors.push(`Linha ${i + 2}: data inválida "${row[cols.iData]}"`);
            return;
          }

          const valor = parseAmount(row[cols.iValor]);
          if (valor == null) {
            errors.push(`Linha ${i + 2}: valor inválido "${row[cols.iValor]}"`);
            return;
          }

          const rawDesc    = String(row[cols.iDesc] ?? "").trim();
          const descClean  = rawDesc.replace(/\s+/g, " ").substring(0, 80);

          rows.push({
            _id:          `inv_${i}`,
            _date:        parsedDate.date,
            _dateKey:     parsedDate.key,
            _valor:       valor,
            _desc:        descClean,
            _tipo:        String(row[cols.iTipo] ?? "").trim(),
            _colaborador: String(row[cols.iColaborador] ?? "").trim(),
            _cidade:      cols.iCidade >= 0 ? String(row[cols.iCidade] ?? "").trim() : "",
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