/**
 * App.jsx — Onfly Conciliador
 * ─────────────────────────────────────────────────────────────────────────────
 * Fluxo principal:
 *  1. Usuário sobe a fatura do cartão (CSV)
 *  2. App detecta o período (start/end date) automaticamente pelo CSV
 *  3. App busca as despesas do mesmo período via API Onfly
 *  4. Motor de conciliação cruza fatura × Onfly por data + valor
 *  5. Resultado exibido com filtros e exportação
 */

import { useState, useRef, useCallback } from "react";
import * as Papa from "papaparse";

import { parseInvoiceCsv }           from "./services/invoice.parser.js";
import { useExpenditures }           from "./hooks/useExpenditures.js";
import { reconcile, computeStats, toExportRows } from "./services/reconciliation.js";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue:        "#1A56DB",
  blueLight:   "#EFF6FF",
  blueMid:     "#BFDBFE",
  green:       "#059669",
  greenLight:  "#ECFDF5",
  greenMid:    "#A7F3D0",
  amber:       "#D97706",
  amberLight:  "#FFFBEB",
  amberMid:    "#FDE68A",
  red:         "#DC2626",
  redLight:    "#FEF2F2",
  redMid:      "#FECACA",
  slate50:     "#F8FAFC",
  slate100:    "#F1F5F9",
  slate200:    "#E2E8F0",
  slate300:    "#CBD5E1",
  slate400:    "#94A3B8",
  slate500:    "#64748B",
  slate600:    "#475569",
  slate700:    "#334155",
  slate800:    "#1E293B",
  slate900:    "#0F172A",
  white:       "#ffffff",
};
const font = "'DM Sans', 'Segoe UI', sans-serif";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (v == null) return "—";
  return `R$ ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function exportCsv(rows, filename) {
  const csv  = Papa.unparse(rows);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Deriva startDate / endDate do menor e maior _dateKey das linhas da fatura */
function deriveDateRange(rows) {
  const keys = rows.map((r) => r._dateKey).filter(Boolean).sort();
  return { startDate: keys[0] ?? null, endDate: keys[keys.length - 1] ?? null };
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  match:        { label: "✓ Conciliado",         color: C.green,  bg: C.greenLight,  border: C.greenMid  },
  match_fuzzy:  { label: "≈ Conciliado (±1 dia)", color: C.blue,   bg: C.blueLight,   border: C.blueMid   },
  only_invoice: { label: "⚠ Só na fatura",        color: C.amber,  bg: C.amberLight,  border: C.amberMid  },
  only_onfly:   { label: "← Só no Onfly",         color: C.red,    bg: C.redLight,    border: C.redMid    },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ status }) {
  const s = STATUS[status];
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontWeight: 700, fontSize: 10, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function StatCard({ value, label, color, bg, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color : bg, borderRadius: 14,
      padding: "clamp(10px,2vw,16px) clamp(8px,1.5vw,12px)",
      textAlign: "center", cursor: onClick ? "pointer" : "default",
      border: `2px solid ${active ? color : "transparent"}`,
      transition: "all .15s", flex: "1 1 0", minWidth: 0,
    }}>
      <p style={{ fontSize: "clamp(18px,3.5vw,28px)", fontWeight: 800, color: active ? C.white : color, margin: 0 }}>{value}</p>
      <p style={{ fontSize: "clamp(9px,1.5vw,11px)", color: active ? C.white : color, margin: 0, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>{label}</p>
    </div>
  );
}

function ProgressBar({ loaded, total }) {
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate500, marginBottom: 4 }}>
        <span>Buscando despesas na API Onfly…</span>
        <span>{pct != null ? `${pct}%` : `${loaded} registros`}</span>
      </div>
      <div style={{ height: 6, background: C.slate200, borderRadius: 999 }}>
        <div style={{
          height: "100%", borderRadius: 999,
          background: `linear-gradient(90deg, ${C.blue}, #3B82F6)`,
          width: pct != null ? `${pct}%` : "40%",
          transition: "width .3s",
          animation: pct == null ? "pulse 1.5s infinite" : "none",
        }} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Invoice (fatura) state
  const [invoiceFile,   setInvoiceFile]   = useState(null);
  const [invoiceRows,   setInvoiceRows]   = useState(null);
  const [invoiceErrors, setInvoiceErrors] = useState([]);
  const [parseError,    setParseError]    = useState(null);
  const [isDragging,    setIsDragging]    = useState(false);
  const fileRef = useRef();

  // API state (via hook)
  const { fetch: fetchExp, cancel, data: expenditures, loading, progress, error: apiError, errorType } = useExpenditures();

  // Reconciliation
  const [results, setResults] = useState(null);
  const [stats,   setStats]   = useState(null);
  const [filter,  setFilter]  = useState("all");

  // ── Upload da fatura ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file?.name?.toLowerCase().endsWith(".csv")) return;
    setInvoiceFile(file);
    setInvoiceRows(null);
    setParseError(null);
    setInvoiceErrors([]);
    setResults(null);
    setStats(null);

    try {
      const { rows, errors } = await parseInvoiceCsv(file);
      setInvoiceRows(rows);
      setInvoiceErrors(errors);
    } catch (e) {
      setParseError(e.message);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  // ── Busca API + Conciliação ─────────────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    if (!invoiceRows?.length) return;
    const { startDate, endDate } = deriveDateRange(invoiceRows);
    if (!startDate) return;

    setResults(null); setStats(null);

    const expData = await fetchExp({ startDate, endDate, type: "Cartão" });
    // fetchExp atualiza `expenditures` via hook — usamos o valor retornado
    // pelo hook que é sync após o await interno
  }, [invoiceRows, fetchExp]);

  // Dispara conciliação quando os dados da API chegam
  const prevExpLength = useRef(0);
  if (!loading && expenditures.length > 0 && expenditures.length !== prevExpLength.current) {
    prevExpLength.current = expenditures.length;
    const r = reconcile(invoiceRows ?? [], expenditures);
    setResults(r);
    setStats(computeStats(r));
    setFilter("all");
    setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  const filtered = results
    ? (filter === "all" ? results : results.filter((r) => r.status === filter))
    : [];

  const handleExport = () => {
    if (!results) return;
    exportCsv(toExportRows(results), "conciliacao-onfly.csv");
  };

  // ── Renderização ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.slate50, fontFamily: font, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{
        background: C.white, borderBottom: `1px solid ${C.slate200}`,
        padding: "0 clamp(16px,4vw,32px)", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 20,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: `linear-gradient(135deg, ${C.blue}, #3B82F6)`,
            borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.white, fontWeight: 900, fontSize: 15,
            boxShadow: `0 2px 8px ${C.blue}44`,
          }}>O</div>
          <span style={{ fontWeight: 800, fontSize: "clamp(13px,2.5vw,16px)", color: C.slate900 }}>
            Onfly <span style={{ color: C.blue }}>Conciliador</span>
          </span>
          <span style={{ background: C.blueLight, color: C.blue, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
            API
          </span>
        </div>
        <span style={{ fontSize: 11, color: C.slate400 }}>
          {import.meta.env.VITE_ONFLY_BASE_URL ?? "base_url não configurada"}
        </span>
      </header>

      {/* Main */}
      <main style={{
        flex: 1, padding: "clamp(16px,3vw,28px) clamp(12px,3vw,24px)",
        maxWidth: 1300, width: "100%", margin: "0 auto", boxSizing: "border-box",
      }}>
        <h1 style={{ fontSize: "clamp(16px,3.5vw,22px)", fontWeight: 800, color: C.slate900, margin: "0 0 4px" }}>
          Conciliação de Fatura
        </h1>
        <p style={{ color: C.slate500, fontSize: "clamp(12px,2vw,13px)", margin: "0 0 20px" }}>
          Suba a fatura do cartão corporativo — as despesas são buscadas automaticamente na API Onfly.
        </p>

        {/* ── Upload ── */}
        <div style={{
          background: C.white, borderRadius: 18,
          padding: "clamp(14px,2.5vw,24px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          border: `1px solid ${C.slate200}`, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 22, height: 22, background: C.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 11, fontWeight: 800 }}>1</div>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.slate700 }}>Fatura do Cartão Corporativo</span>
          </div>

          {!invoiceRows ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${isDragging ? C.blue : C.slate300}`,
                borderRadius: 16, padding: "clamp(24px,4vw,44px) 20px",
                textAlign: "center", cursor: "pointer",
                background: isDragging ? C.blueLight : C.slate50,
                transition: "all .2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              <div style={{ fontSize: "clamp(28px,5vw,44px)", marginBottom: 10 }}>{isDragging ? "📂" : "📊"}</div>
              <p style={{ fontWeight: 700, color: C.slate800, fontSize: 14, margin: "0 0 4px" }}>
                Arraste ou clique para importar a fatura
              </p>
              <p style={{ color: C.slate400, fontSize: 12, margin: "0 0 12px" }}>
                Arquivo <strong>Viagens_Internas</strong> exportado do Onfly · CSV
              </p>
              <span style={{ background: C.blueLight, color: C.blue, fontWeight: 700, fontSize: 11, padding: "3px 12px", borderRadius: 999 }}>CSV</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
              background: C.greenLight, border: `1px solid ${C.greenMid}`, borderRadius: 12, padding: "10px 16px" }}>
              <div>
                <p style={{ fontWeight: 700, color: C.slate800, fontSize: 13, margin: 0 }}>{invoiceFile?.name}</p>
                <p style={{ color: C.slate500, fontSize: 11, margin: 0 }}>
                  {invoiceRows.length} transações · {(() => { const { startDate, endDate } = deriveDateRange(invoiceRows); return `${startDate} → ${endDate}`; })()}
                </p>
                {invoiceErrors.length > 0 && (
                  <p style={{ color: C.amber, fontSize: 11, margin: "4px 0 0", fontWeight: 600 }}>
                    ⚠ {invoiceErrors.length} linhas ignoradas por dados inválidos
                  </p>
                )}
              </div>
              <button onClick={() => { setInvoiceFile(null); setInvoiceRows(null); setResults(null); setStats(null); }}
                style={{ background: "none", border: `1px solid ${C.slate200}`, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: C.slate500 }}>
                ✕ Trocar
              </button>
            </div>
          )}

          {parseError && (
            <div style={{ background: C.redLight, border: `1px solid ${C.redMid}`, borderRadius: 10, padding: "10px 14px", marginTop: 12, color: C.red, fontSize: 13, fontWeight: 600 }}>
              ⛔ {parseError}
            </div>
          )}
        </div>

        {/* ── Botão Conciliar ── */}
        {invoiceRows && !loading && !results && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <button onClick={runPipeline} style={{
              background: `linear-gradient(135deg, ${C.blue}, #3B82F6)`,
              color: C.white, border: "none", borderRadius: 14,
              padding: "clamp(10px,2vw,13px) clamp(24px,5vw,40px)",
              fontWeight: 800, fontSize: "clamp(13px,2.5vw,15px)", cursor: "pointer",
              boxShadow: `0 4px 16px ${C.blue}44`, transition: "all .2s",
            }}>
              🔍 Buscar na API e Conciliar
            </button>
          </div>
        )}

        {/* ── Loading / Progresso ── */}
        {loading && (
          <div style={{
            background: C.white, borderRadius: 18, padding: "clamp(14px,2.5vw,24px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: `1px solid ${C.slate200}`, marginBottom: 16,
          }}>
            <ProgressBar loaded={progress?.loaded ?? 0} total={progress?.total ?? null} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <button onClick={cancel} style={{ background: "none", border: `1px solid ${C.slate300}`, borderRadius: 8, padding: "6px 18px", fontSize: 12, color: C.slate500, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Erro de API ── */}
        {apiError && (
          <div style={{ background: C.redLight, border: `1px solid ${C.redMid}`, borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: C.red, fontWeight: 700, margin: "0 0 4px", fontSize: 14 }}>
              {errorType === "auth"    ? "🔑 Erro de autenticação"  :
               errorType === "network" ? "📡 Erro de conectividade" : "⛔ Erro na API Onfly"}
            </p>
            <p style={{ color: C.red, fontSize: 13, margin: 0 }}>{apiError}</p>
            {errorType === "auth" && (
              <p style={{ color: C.slate600, fontSize: 12, margin: "8px 0 0" }}>
                Verifique se <code>VITE_ONFLY_API_TOKEN</code> está correto no <code>.env</code>.
              </p>
            )}
          </div>
        )}

        {/* ── Resultados ── */}
        {results && stats && (
          <div id="results" style={{
            background: C.white, borderRadius: 18, padding: "clamp(14px,2.5vw,24px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: `1px solid ${C.slate200}`,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: "clamp(14px,2.5vw,17px)", color: C.slate900 }}>Resultado</span>
                <span style={{
                  background: stats.conciliationRate >= 90 ? C.greenLight : stats.conciliationRate >= 70 ? C.amberLight : C.redLight,
                  color:      stats.conciliationRate >= 90 ? C.green      : stats.conciliationRate >= 70 ? C.amber      : C.red,
                  fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 999,
                }}>{stats.conciliationRate}% conciliado</span>
              </div>
              <button onClick={handleExport} style={{
                background: C.greenLight, color: C.green, border: `1px solid ${C.greenMid}`,
                borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>⬇ Exportar CSV</button>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard value={stats.total}        label="Total"              color={C.slate600} bg={C.slate100}   onClick={() => setFilter("all")}          active={filter === "all"} />
              <StatCard value={stats.match}        label="✓ Conciliado"       color={C.green}    bg={C.greenLight} onClick={() => setFilter("match")}         active={filter === "match"} />
              <StatCard value={stats.matchFuzzy}   label="≈ ±1 dia"           color={C.blue}     bg={C.blueLight}  onClick={() => setFilter("match_fuzzy")}   active={filter === "match_fuzzy"} />
              <StatCard value={stats.onlyInvoice}  label="⚠ Só na fatura"    color={C.amber}    bg={C.amberLight} onClick={() => setFilter("only_invoice")}  active={filter === "only_invoice"} />
              <StatCard value={stats.onlyOnfly}    label="← Só no Onfly"     color={C.red}      bg={C.redLight}   onClick={() => setFilter("only_onfly")}    active={filter === "only_onfly"} />
            </div>

            {/* Gap financeiro */}
            <div style={{ background: C.slate50, borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
              <span>Fatura: <strong style={{ color: C.blue }}>{fmtBRL(stats.totalInvoiceAmount)}</strong></span>
              <span>Onfly:  <strong style={{ color: C.green }}>{fmtBRL(stats.totalOnflyAmount)}</strong></span>
              <span>Gap:    <strong style={{ color: Math.abs(stats.gap) < 0.02 ? C.green : C.red }}>{stats.gap >= 0 ? "+" : ""}{fmtBRL(stats.gap)}</strong></span>
            </div>

            {/* Tabela */}
            <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.slate200}`, fontSize: "clamp(10px,1.8vw,12px)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr style={{ background: C.slate100 }}>
                    {["Status","Data","Desc. Fatura","Colaborador","Valor Fatura","Desc. Onfly","Categoria","Valor Onfly","Diferença"].map((h, i) => (
                      <th key={i} style={{ padding: "9px 12px", textAlign: i >= 4 ? "right" : "left", color: C.slate600, fontWeight: 600, borderRight: i < 8 ? `1px solid ${C.slate200}` : "none", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const cfg   = STATUS[r.status];
                    const vInv  = r.invoice?._valor ?? null;
                    const vExp  = r.expenditure?.amount ?? null;
                    const diff  = r.diff;
                    const date  = r.invoice?._dateKey ?? r.expenditure?.date ?? "—";
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
                        <td style={{ padding: "8px 12px", borderRight: `1px solid ${C.slate200}` }}><Badge status={r.status} /></td>
                        <td style={{ padding: "8px 12px", color: C.slate600, whiteSpace: "nowrap", borderRight: `1px solid ${C.slate200}` }}>{date}</td>
                        <td style={{ padding: "8px 12px", color: C.slate700, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: `1px solid ${C.slate200}` }} title={r.invoice?._desc}>{r.invoice?._desc ?? "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.slate500, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: `1px solid ${C.slate200}` }}>{r.invoice?._colaborador ?? "—"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.blue, fontWeight: 600, borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap" }}>{vInv != null ? fmtBRL(vInv) : "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.slate700, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: `1px solid ${C.slate200}` }} title={r.expenditure?.description}>{r.expenditure?.description ?? "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.slate500, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: `1px solid ${C.slate200}` }}>{r.expenditure?.category ?? "—"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.green, fontWeight: 600, borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap" }}>{vExp != null ? fmtBRL(vExp) : "—"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap",
                          color: diff == null ? C.slate400 : Math.abs(diff) < 0.02 ? C.green : diff > 0 ? C.blue : C.red }}>
                          {diff != null ? `${diff >= 0 ? "+" : ""}${fmtBRL(Math.abs(diff))}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: C.slate400, fontSize: 14 }}>Nenhum registro para este filtro.</div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: 16, color: C.slate400, fontSize: 11, borderTop: `1px solid ${C.slate200}`, background: C.white }}>
        Onfly Conciliador · {new Date().getFullYear()} · Dados via API {import.meta.env.VITE_ONFLY_BASE_URL ?? ""}
      </footer>
    </div>
  );
}