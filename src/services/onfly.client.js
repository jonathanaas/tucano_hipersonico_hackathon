/**
 * onfly.client.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente HTTP base para a API da Onfly.
 * Lê credenciais de variáveis de ambiente Vite (VITE_PUBLIC_ONFLY_*).
 * Todas as requisições passam por aqui — auth header, timeout, retry e
 * normalização de erros são tratados uma única vez.
 */

// BASE_URL vazio → usa o host atual (Vercel rewrites server-side para api.onfly.com)
// BASE_URL preenchido → usado no dev via Vite proxy (http://localhost:3000)
const BASE_URL  = (import.meta.env.VITE_PUBLIC_ONFLY_BASE_URL ?? "").replace(/\/$/, "");
const API_TOKEN = import.meta.env.VITE_PUBLIC_ONFLY_API_TOKEN;

console.info(
  "%c[onfly.client] config",
  "color:#1A56DB;font-weight:bold",
  { BASE_URL: BASE_URL || "(relativo — modo Vercel)", token: API_TOKEN ? `${API_TOKEN.slice(0, 20)}…` : "❌ NÃO CONFIGURADO" }
);

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
      "VITE_PUBLIC_ONFLY_API_TOKEN não configurado. Verifique o arquivo .env.",
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
  // Em produção (Vercel), BASE_URL é vazio e usamos URL relativa ao host atual.
  // Em dev, BASE_URL aponta para o Vite proxy (http://localhost:3000).
  const urlStr = BASE_URL ? `${BASE_URL}${path}` : path;
  const url = new URL(urlStr, globalThis.location?.origin ?? "http://localhost:3000");
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

  console.debug(`%c[onfly.client] → ${method} ${url.toString()}`, "color:#64748B");

  let attempt = 0;
  while (true) {
    try {
      const t0  = performance.now();
      const res = await fetch(url.toString(), init);
      const ms  = Math.round(performance.now() - t0);
      const parsed = await parseResponse(res, path);
      console.debug(
        `%c[onfly.client] ← ${res.status} ${url.pathname} (${ms}ms)`,
        `color:${res.ok ? "#16A34A" : "#DC2626"}`
      );
      return parsed;
    } catch (err) {
      // Não retenta erros de autenticação ou "not found"
      const isRetryable =
        !(err instanceof OnflyAuthError) &&
        !(err instanceof OnflyNotFoundError) &&
        (err.status === 0 || err.status >= 500 || err.name === "TimeoutError");

      if (isRetryable && attempt < retries) {
        attempt++;
        const delay = 500 * 2 ** (attempt - 1); // 500ms, 1000ms, …
        console.warn(
          `[onfly.client] ⚠ erro na tentativa ${attempt}/${retries} — retry em ${delay}ms`,
          { path, erro: err.message, status: err.status }
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Rewrap erros de rede nativos
      if (!(err instanceof OnflyApiError)) {
        const wrapped = new OnflyApiError(
          err.name === "TimeoutError"
            ? `Timeout após ${timeout}ms`
            : `Erro de rede: ${err.message}`,
          0
        );
        console.error("[onfly.client] ✖ erro de rede", { path, url: url.toString(), erro: err.message, tipo: err.name });
        throw wrapped;
      }

      console.error("[onfly.client] ✖ erro da API", { path, status: err.status, message: err.message, body: err.body });
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