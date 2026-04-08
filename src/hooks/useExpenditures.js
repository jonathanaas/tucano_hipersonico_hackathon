/**
 * useExpenditures.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook React para buscar despesas da API Onfly.
 * Encapsula loading, erro, progresso de paginação e cancelamento.
 *
 * Uso:
 *   const { fetch, data, loading, progress, error, reset } = useExpenditures();
 *   await fetch({ startDate: "2026-03-01", endDate: "2026-03-31" });
 */

import { useState, useRef, useCallback } from "react";
import { fetchAllExpenditures }          from "../services/expenditures.service.js";
import { OnflyApiError }                 from "../services/onfly.client.js";

/**
 * @typedef {Object} UseExpendituresState
 * @property {import('../services/expenditures.service.js').OnflyExpenditure[]} data
 * @property {boolean}      loading
 * @property {{ loaded: number, total: number } | null} progress
 * @property {string | null} error
 * @property {string | null} errorType  - "auth" | "network" | "notfound" | "unknown"
 */

export function useExpenditures() {
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState(null);   // { loaded, total }
  const [error,    setError]    = useState(null);
  const [errorType,setErrorType]= useState(null);

  const abortRef = useRef(false);

  const reset = useCallback(() => {
    setData([]);
    setLoading(false);
    setProgress(null);
    setError(null);
    setErrorType(null);
    abortRef.current = false;
  }, []);

  /**
   * @param {object} filters
   * @param {string} filters.startDate
   * @param {string} filters.endDate
   * @param {string} [filters.type]
   */
  const fetch = useCallback(async (filters) => {
    abortRef.current = false;
    setLoading(true);
    setError(null);
    setErrorType(null);
    setData([]);
    setProgress({ loaded: 0, total: null });

    try {
      const result = await fetchAllExpenditures(
        filters.startDate,
        filters.endDate,
        { type: filters.type },
        (loaded, total) => {
          if (!abortRef.current) {
            setProgress({ loaded, total });
          }
        }
      );

      if (!abortRef.current) {
        setData(result);
      }
    } catch (err) {
      if (abortRef.current) return; // cancelado pelo usuário

      const message =
        err instanceof OnflyApiError ? err.message : "Erro inesperado ao buscar despesas.";

      const type =
        err.status === 401 ? "auth"
        : err.status === 404 ? "notfound"
        : err.status === 0   ? "network"
        : "unknown";

      setError(message);
      setErrorType(type);
    } finally {
      if (!abortRef.current) {
        setLoading(false);
        setProgress(null);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setLoading(false);
    setProgress(null);
  }, []);

  return { fetch, cancel, reset, data, loading, progress, error, errorType };
}