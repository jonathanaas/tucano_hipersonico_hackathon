/**
 * onfly.client.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente HTTP base para a API da Onfly.
 * Lê credenciais de variáveis de ambiente Vite (VITE_ONFLY_*).
 * Todas as requisições passam por aqui — auth header, timeout, retry e
 * normalização de erros são tratados uma única vez.
 */

const BASE_URL  = import.meta.env.VITE_ONFLY_BASE_URL?.replace(/\/$/, "");
const API_TOKEN = import.meta.env.VITE_ONFLY_API_TOKEN;

// ─── Erros tipados ────────────────────────────────────────────────────────────

export class OnflyApiError extends Error {
  /**
   * @param {string}  message
   * @param {number}  status   - HTTP status (0 = network / timeout)
   * @param {any}     body     - corpo da resposta, se houver
   */
  constructor(message, status = 0, body = null) {
    super(message);
    this.name   = "OnflyApiError";
    this.status = status;
    this.body   = body;
  }
}

export class OnflyAuthError extends OnflyApiError {
  constructor(body) {
    super("Token inválido ou expirado (401).", 401, body);
    this.name = "OnflyAuthError";
  }
}

export class OnflyNotFoundError extends OnflyApiError {
  constructor(path) {
    super(`Recurso não encontrado: ${path} (404).`, 404);
    this.name = "OnflyNotFoundError";
  }
}

// ─── Utilitários internos ─────────────────────────────────────────────────────

function buildHeaders(extra = {}) {
  if (!API_TOKEN) {
    throw new OnflyApiError(
      "VITE_ONFLY_API_TOKEN não configurado. Verifique o arquivo .env.",
      0
    );
  }
  return {
    "Content-Type": "application/json",
    Accept:         "application/json",
    Authorization:  `Bearer ${API_TOKEN}`,
    ...extra,
  };
}

async function parseResponse(res, path) {
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (res.ok) return body;

  if (res.status === 401) throw new OnflyAuthError(body);
  if (res.status === 404) throw new OnflyNotFoundError(path);

  throw new OnflyApiError(
    body?.message ?? body?.error ?? `Erro HTTP ${res.status}`,
    res.status,
    body
  );
}

// ─── Função central de requisição ─────────────────────────────────────────────

/**
 * Faz uma requisição autenticada à API da Onfly.
 *
 * @param {"GET"|"POST"|"PUT"|"PATCH"|"DELETE"} method
 * @param {string}  path      - Caminho relativo, ex: "/api/expenditures"
 * @param {object}  [opts]
 * @param {object}  [opts.params]   - Query string (GET)
 * @param {any}     [opts.body]     - Corpo JSON (POST/PUT/PATCH)
 * @param {number}  [opts.timeout]  - ms (default 20 000)
 * @param {number}  [opts.retries]  - tentativas extras em 5xx/network (default 2)
 * @returns {Promise<any>}
 */
export async function request(method, path, { params, body, timeout = 20_000, retries = 2 } = {}) {
  if (!BASE_URL) {
    throw new OnflyApiError(
      "VITE_ONFLY_BASE_URL não configurado. Verifique o arquivo .env.",
      0
    );
  }

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    });
  }

  const init = {
    method,
    headers: buildHeaders(),
    signal:  AbortSignal.timeout(timeout),
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  };

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url.toString(), init);
      return await parseResponse(res, path);
    } catch (err) {
      // Não retenta erros de autenticação ou "not found"
      const isRetryable =
        !(err instanceof OnflyAuthError) &&
        !(err instanceof OnflyNotFoundError) &&
        (err.status === 0 || err.status >= 500 || err.name === "TimeoutError");

      if (isRetryable && attempt < retries) {
        attempt++;
        const delay = 500 * 2 ** (attempt - 1); // 500ms, 1000ms, …
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Rewrap erros de rede nativos
      if (!(err instanceof OnflyApiError)) {
        throw new OnflyApiError(
          err.name === "TimeoutError"
            ? `Timeout após ${timeout}ms`
            : `Erro de rede: ${err.message}`,
          0
        );
      }

      throw err;
    }
  }
}

// ─── Atalhos de conveniência ──────────────────────────────────────────────────

export const get    = (path, opts)  => request("GET",    path, opts);
export const post   = (path, opts)  => request("POST",   path, opts);
export const put    = (path, opts)  => request("PUT",    path, opts);
export const patch  = (path, opts)  => request("PATCH",  path, opts);
export const del    = (path, opts)  => request("DELETE", path, opts);