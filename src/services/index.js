/**
 * services/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ponto de entrada único para todos os serviços.
 * Importe a partir daqui nos componentes React:
 *
 *   import { parseInvoiceCsv, fetchAllExpenditures, reconcile } from "../services";
 */

export * from "./onfly.client.js";
export * from "./expenditures.service.js";
export * from "./invoice.parser.js";
export * from "./reconciliation.js";