/**
 * expenditures.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Serviço de despesas da API Onfly.
 *
 * Endpoint base:
 *   GET https://api.onfly.com/expense/expenditure
 *
 * Parâmetros conhecidos (extraídos do endpoint real):
 *   perPage, page, sortBy, sortOrder, descending
 *   include        → relações a expandir (fixo, ver EXPENDITURE_INCLUDES)
 *   userId         → filtra por colaborador
 *   startOccurrenceDate / endOccurrenceDate  → período da despesa (YYYY-MM-DD)
 *   seeAll         → ignora filtro de "próprias despesas" do token
 */

import { get } from "./onfly.client.js";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ENDPOINT = "/expense/expenditure";

/**
 * Relações que devem sempre ser expandidas.
 * Cada item aqui resolve campos usados na conciliação e na exibição.
 *
 * permissions                       → controle de edição na UI
 * expenditureType                   → tipo/categoria da despesa
 * rdv, rdv.advancePayments          → relatório de despesas vinculado
 * user                              → colaborador que lançou
 * fieldsUsed, fieldsUsed.field      → campos customizados preenchidos
 * costCenter                        → centro de custo
 * waypoints                         → origem/destino (km/distância)
 * expenditureAudit.user             → histórico de auditoria
 * lastAuditByRdvApprovalStep.user   → último aprovador no fluxo
 * trustValidation                   → validação de confiança/recibo
 * costCenterApportionment.costCenter → rateio entre centros de custo
 * tags                              → etiquetas livres
 */
const EXPENDITURE_INCLUDES = [
  "permissions",
  "expenditureType",
  "rdv",
  "rdv.advancePayments",
  "user",
  "fieldsUsed",
  "fieldsUsed.field",
  "costCenter",
  "waypoints",
  "expenditureAudit.user",
  "lastAuditByRdvApprovalStep.user",
  "trustValidation",
  "costCenterApportionment.costCenter",
  "tags",
].join(",");

/** Ordenação padrão: mais recentes primeiro. */
const DEFAULT_SORT = {
  sortBy:     "date",
  sortOrder:  "DESC",
  descending: true,
};

// ─── Tipos (JSDoc) ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ExpenditureFilters
 * @property {string}  startDate   - Início do período  "YYYY-MM-DD"  (obrigatório)
 * @property {string}  endDate     - Fim do período     "YYYY-MM-DD"  (obrigatório)
 * @property {string}  [userId]    - ID do colaborador  (opcional — sem isso traz todos)
 * @property {number}  [page]      - Página atual       (default: 1)
 * @property {number}  [perPage]   - Itens por página   (default: 100)
 */

/**
 * @typedef {Object} ExpenditurePage
 * @property {any[]}   data      - Itens brutos da API (sem normalização — ver nota abaixo)
 * @property {number}  total     - Total de registros disponíveis
 * @property {number}  page      - Página atual
 * @property {number}  perPage   - Tamanho da página
 * @property {boolean} hasMore   - Ainda há páginas seguintes?
 */

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Busca uma página de despesas.
 *
 * Os dados são devolvidos **brutos** (sem normalização) porque ainda estamos
 * definindo a lógica de conciliação. Quando o contrato da API estiver
 * confirmado, a normalização será implementada aqui.
 *
 * @param {ExpenditureFilters} filters
 * @returns {Promise<ExpenditurePage>}
 */
export async function fetchExpenditurePage(filters) {
  const {
    startDate,
    endDate,
    userId,
    page    = 1,
    perPage = 100,
  } = filters;

  const raw = await get(ENDPOINT, {
    params: {
      // ── Paginação e ordenação ────────────────────────────────────────────
      perPage,
      page,
      ...DEFAULT_SORT,

      // ── Relações expandidas ──────────────────────────────────────────────
      include: EXPENDITURE_INCLUDES,

      // ── Filtros de período ───────────────────────────────────────────────
      startOccurrenceDate: startDate,
      endOccurrenceDate:   endDate,

      // ── Filtros opcionais ────────────────────────────────────────────────
      ...(userId ? { userId } : {}),

      // seeAll=true → retorna despesas de todos os usuários, não apenas
      // as do dono do token. Necessário para conciliação completa da fatura.
      seeAll: true,
    },
  });

  // A API retorna { data: [...], meta: { pagination: { total, current_page, per_page, last_page } } }
  const items      = raw?.data ?? raw?.items ?? (Array.isArray(raw) ? raw : []);
  const pagination = raw?.meta?.pagination ?? raw?.meta ?? raw?.pagination ?? {};
  const total      = pagination.total      ?? raw?.total   ?? items.length;
  const lastPage   = pagination.last_page  ?? pagination.lastPage ?? null;
  const curPage    = pagination.current_page ?? pagination.page ?? page;

  const hasMore = lastPage != null
    ? curPage < lastPage
    : curPage * perPage < total;

  console.group(`[expenditures.service] Página ${curPage}/${lastPage ?? "?"}`);
  console.log("pagination:", pagination);
  console.log(`Itens nesta página: ${items.length} | Total geral: ${total} | hasMore: ${hasMore}`);
  console.groupEnd();

  return {
    data:    items,                                // bruto — normalização a definir
    total,
    page:    curPage,
    perPage,
    hasMore: curPage * perPage < total,
  };
}

/**
 * Busca **todas** as páginas de despesas de um período, com callback de progresso.
 *
 * @param {Omit<ExpenditureFilters, "page">} filters
 * @param {{ onProgress?: (loaded: number, total: number) => void }} [opts]
 * @returns {Promise<any[]>}  Array bruto de todas as despesas
 */
export async function fetchAllExpenditures(filters, { onProgress } = {}) {
  const perPage = filters.perPage ?? 100;
  let   page    = 1;
  let   total   = Infinity;
  const all     = [];

  while (all.length < total) {
    const result = await fetchExpenditurePage({ ...filters, page, perPage });

    all.push(...result.data);
    total = result.total;

    onProgress?.(all.length, total);

    // Para quando a API retornar uma página incompleta (última página)
    // ou quando já coletamos tudo segundo o total declarado.
    if (!result.hasMore || result.data.length < perPage) break;

    page++;
  }

  return all;
}