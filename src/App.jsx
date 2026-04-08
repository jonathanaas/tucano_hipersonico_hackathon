/**
 * App.jsx — Onfly Conciliador
 * Fluxo:
 *  1. Usuário sobe a fatura do cartão (CSV)
 *  2. Seleciona o período (auto-detectado pelo CSV, editável)
 *  3. App busca as despesas do mesmo período via API Onfly
 *  4. Exibe fatura + Onfly lado a lado e o resultado da conciliação
 */

import { useState, useRef, useCallback, useEffect } from "react";
import * as Papa from "papaparse";

import { parseInvoiceCsv }                        from "./services/invoice.parser.js";
import { useExpenditures }                        from "./hooks/useExpenditures.js";
import { reconcile, computeStats, toExportRows }  from "./services/reconciliation.js";

// ─── Design tokens (mesmos da landing page) ───────────────────────────────────
const C = {
  blue:       "#1A56DB",
  blueDark:   "#1240AA",
  blueLight:  "#EFF6FF",
  blueMid:    "#BFDBFE",
  green:      "#16A34A",
  greenLight: "#F0FDF4",
  greenMid:   "#BBF7D0",
  amber:      "#D97706",
  amberLight: "#FFFBEB",
  amberMid:   "#FDE68A",
  red:        "#DC2626",
  redLight:   "#FEF2F2",
  redMid:     "#FECACA",
  slate50:    "#F8FAFC",
  slate100:   "#F1F5F9",
  slate200:   "#E2E8F0",
  slate400:   "#94A3B8",
  slate500:   "#64748B",
  slate600:   "#475569",
  slate700:   "#334155",
  slate800:   "#1E293B",
  slate900:   "#0F172A",
  white:      "#fff",
};
const font = "'Inter','Segoe UI',sans-serif";

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

function deriveDateRange(rows) {
  const keys = rows.map((r) => r._dateKey).filter(Boolean).sort();
  return { startDate: keys[0] ?? null, endDate: keys[keys.length - 1] ?? null };
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  match:        { label: "✓ Confere",         color: C.green,  bg: C.greenLight, border: C.greenMid },
  match_fuzzy:  { label: "≈ Confere (±1 dia)", color: C.blue,   bg: C.blueLight,  border: C.blueMid  },
  only_invoice: { label: "← Só na fatura",    color: C.red,    bg: C.redLight,   border: C.redMid   },
  only_onfly:   { label: "→ Só no Onfly",     color: C.blue,   bg: C.blueLight,  border: C.blueMid  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepBadge({ n, color = C.blue }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: color, color: C.white,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 800, flexShrink: 0,
    }}>{n}</div>
  );
}

function StatCard({ value, label, color, bg, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color : bg,
      borderRadius: 10, padding: "10px 12px",
      textAlign: "center", cursor: onClick ? "pointer" : "default",
      border: `2px solid ${active ? color : "transparent"}`,
      transition: "all .15s", flex: "1 1 0", minWidth: 0,
    }}>
      <div style={{ fontSize: "clamp(18px,3vw,26px)", fontWeight: 800, color: active ? C.white : color }}>{value}</div>
      <div style={{ fontSize: "clamp(9px,1.4vw,11px)", color: active ? C.white : color, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DataTable({ headers, rows, emptyMsg = "Sem dados" }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 11 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: "6px 10px", background: C.blue, color: C.white,
                textAlign: "left", fontWeight: 600, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: 24, textAlign: "center", color: C.slate400 }}>{emptyMsg}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "5px 10px", color: C.slate700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={String(cell ?? "")}>{cell ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgressBar({ loaded, total }) {
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  return (
    <div>
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
        }} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Fatura
  const [invoiceFile,   setInvoiceFile]   = useState(null);
  const [invoiceRows,   setInvoiceRows]   = useState(null);
  const [invoiceErrors, setInvoiceErrors] = useState([]);
  const [parseError,    setParseError]    = useState(null);
  const [isDragging,    setIsDragging]    = useState(false);
  const fileRef = useRef();

  // Período
  const [dateStart, setDateStart] = useState("");
  const [dateEnd,   setDateEnd]   = useState("");

  // API
  const { fetch: fetchExp, cancel, data: expenditures, loading, progress, error: apiError, errorType } = useExpenditures();

  // Conciliação
  const [results, setResults] = useState(null);
  const [stats,   setStats]   = useState(null);
  const [filter,  setFilter]  = useState("all");

  // Auto-preenche datas ao fazer upload
  useEffect(() => {
    if (invoiceRows?.length) {
      const { startDate, endDate } = deriveDateRange(invoiceRows);
      if (startDate) setDateStart(startDate);
      if (endDate)   setDateEnd(endDate);
    }
  }, [invoiceRows]);

  // Dispara conciliação quando despesas chegam
  const prevExpLength = useRef(0);
  if (!loading && expenditures.length > 0 && expenditures.length !== prevExpLength.current) {
    prevExpLength.current = expenditures.length;
    const r = reconcile(invoiceRows ?? [], expenditures);
    setResults(r);
    setStats(computeStats(r));
    setFilter("all");
    setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file?.name?.toLowerCase().endsWith(".csv")) return;
    setInvoiceFile(file);
    setInvoiceRows(null);
    setParseError(null);
    setInvoiceErrors([]);
    setResults(null);
    setStats(null);
    prevExpLength.current = 0;
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

  // ── Pipeline ────────────────────────────────────────────────────────────────
  const runPipeline = useCallback(() => {
    if (!invoiceRows?.length || !dateStart || !dateEnd) return;
    setResults(null);
    setStats(null);
    prevExpLength.current = 0;
    fetchExp({ startDate: dateStart, endDate: dateEnd });
  }, [invoiceRows, dateStart, dateEnd, fetchExp]);

  // ── Dados para as tabelas ───────────────────────────────────────────────────
  const invoiceTableRows = (invoiceRows ?? []).slice(0, 200).map((r) => [
    r._dateKey,
    r._desc,
    r._colaborador,
    fmtBRL(r._valor),
  ]);

  const onFlyTableRows = expenditures.slice(0, 200).map((e) => [
    e.date ?? e.occurrence_date ?? e.created_at?.substring(0, 10) ?? "—",
    e.description ?? e.expenditureType?.name ?? "—",
    e.user?.name ?? "—",
    fmtBRL(e.amount ?? e.value ?? e.total ?? null),
  ]);

  const filteredResults = results
    ? (filter === "all" ? results : results.filter((r) => r.status === filter))
    : [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.slate50, fontFamily: font, display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <header style={{
        background: C.white, borderBottom: `1px solid ${C.slate200}`,
        padding: "0 clamp(16px,4vw,32px)", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 20,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, background: C.blue, borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.white, fontWeight: 800, fontSize: 15,
          }}>O</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.slate900 }}>
            Onfly <span style={{ color: C.blue }}>Conciliador</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ background: C.blueLight, color: C.blue, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
            Hackathon 2026
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{
        flex: 1, padding: "clamp(16px,3vw,28px) clamp(12px,4vw,32px)",
        maxWidth: 1200, width: "100%", margin: "0 auto", boxSizing: "border-box",
      }}>

        {/* Título */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(20px,3.5vw,28px)", fontWeight: 800, color: C.slate900, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Comparador de Extratos
          </h1>
          <p style={{ color: C.slate500, fontSize: 14, margin: 0 }}>
            Cruzamento automático de dados financeiros
          </p>
        </div>

        {/* ── STEP 1: Upload ── */}
        <div style={{
          background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: `1px solid ${C.slate200}`, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <StepBadge n="1" />
            <span style={{ fontWeight: 700, fontSize: 14, color: C.blue }}>Extrato — Fatura do Cartão Corporativo</span>
          </div>

          {!invoiceRows ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${isDragging ? C.blue : C.slate300}`,
                borderRadius: 14, padding: "clamp(24px,4vw,40px) 20px",
                textAlign: "center", cursor: "pointer",
                background: isDragging ? C.blueLight : C.slate50,
                transition: "all .2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              <div style={{ fontSize: 36, marginBottom: 10 }}>{isDragging ? "📂" : "📊"}</div>
              <p style={{ fontWeight: 700, color: C.slate800, fontSize: 14, margin: "0 0 4px" }}>
                Arraste ou clique para importar a fatura
              </p>
              <p style={{ color: C.slate400, fontSize: 12, margin: "0 0 12px" }}>
                Arquivo <strong>Viagens_Internas</strong> exportado do Onfly · CSV
              </p>
              <span style={{ background: C.blueLight, color: C.blue, fontWeight: 700, fontSize: 11, padding: "3px 12px", borderRadius: 999 }}>CSV</span>
            </div>
          ) : (
            <>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
                background: C.greenLight, border: `1px solid ${C.greenMid}`, borderRadius: 10, padding: "10px 16px", marginBottom: 12,
              }}>
                <div>
                  <p style={{ fontWeight: 700, color: C.slate800, fontSize: 13, margin: 0 }}>{invoiceFile?.name}</p>
                  <p style={{ color: C.slate500, fontSize: 11, margin: 0 }}>
                    {invoiceRows.length} transações · {dateStart} → {dateEnd}
                  </p>
                  {invoiceErrors.length > 0 && (
                    <p style={{ color: C.amber, fontSize: 11, margin: "4px 0 0", fontWeight: 600 }}>
                      ⚠ {invoiceErrors.length} linhas ignoradas
                    </p>
                  )}
                </div>
                <button onClick={() => { setInvoiceFile(null); setInvoiceRows(null); setResults(null); setStats(null); setDateStart(""); setDateEnd(""); }}
                  style={{ background: "none", border: `1px solid ${C.slate200}`, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: C.slate500 }}>
                  ✕ Trocar
                </button>
              </div>

              <DataTable
                headers={["Data", "Descrição", "Colaborador", "Valor"]}
                rows={invoiceTableRows}
                emptyMsg="Nenhuma transação encontrada"
              />
              {invoiceRows.length > 200 && (
                <p style={{ fontSize: 11, color: C.slate400, marginTop: 6, textAlign: "right" }}>
                  Exibindo 200 de {invoiceRows.length} registros
                </p>
              )}
            </>
          )}

          {parseError && (
            <div style={{ background: C.redLight, border: `1px solid ${C.redMid}`, borderRadius: 10, padding: "10px 14px", marginTop: 12, color: C.red, fontSize: 13, fontWeight: 600 }}>
              ⛔ {parseError}
            </div>
          )}
        </div>

        {/* ── STEP 2: Período + Busca ── */}
        {invoiceRows && (
          <div style={{
            background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: `1px solid ${C.slate200}`, marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <StepBadge n="2" color={C.green} />
              <span style={{ fontWeight: 700, fontSize: 14, color: C.green }}>2ª Fonte — Buscar na API Onfly</span>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.slate600, display: "block", marginBottom: 4 }}>Data início</label>
                <input
                  type="date" value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  style={{
                    border: `1px solid ${C.slate200}`, borderRadius: 8,
                    padding: "7px 12px", fontSize: 13, color: C.slate800,
                    outline: "none", cursor: "pointer",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.slate600, display: "block", marginBottom: 4 }}>Data fim</label>
                <input
                  type="date" value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  style={{
                    border: `1px solid ${C.slate200}`, borderRadius: 8,
                    padding: "7px 12px", fontSize: 13, color: C.slate800,
                    outline: "none", cursor: "pointer",
                  }}
                />
              </div>

              {!loading ? (
                <button
                  onClick={runPipeline}
                  disabled={!dateStart || !dateEnd}
                  style={{
                    background: (!dateStart || !dateEnd) ? C.slate200 : `linear-gradient(135deg, ${C.blue}, #3B82F6)`,
                    color: (!dateStart || !dateEnd) ? C.slate400 : C.white,
                    border: "none", borderRadius: 10,
                    padding: "9px 24px", fontWeight: 700, fontSize: 14, cursor: (!dateStart || !dateEnd) ? "not-allowed" : "pointer",
                    boxShadow: (!dateStart || !dateEnd) ? "none" : `0 4px 14px ${C.blue}44`,
                    transition: "all .2s",
                  }}>
                  🔍 Buscar e Conciliar
                </button>
              ) : (
                <button onClick={cancel} style={{
                  background: "none", border: `1px solid ${C.slate300}`, borderRadius: 10,
                  padding: "9px 20px", fontSize: 13, color: C.slate500, cursor: "pointer",
                }}>
                  Cancelar
                </button>
              )}
            </div>

            {loading && (
              <div style={{ marginTop: 16 }}>
                <ProgressBar loaded={progress?.loaded ?? 0} total={progress?.total ?? null} />
              </div>
            )}

            {apiError && (
              <div style={{ background: C.redLight, border: `1px solid ${C.redMid}`, borderRadius: 10, padding: "10px 14px", marginTop: 14, color: C.red, fontSize: 13, fontWeight: 600 }}>
                {errorType === "auth" ? "🔑 Erro de autenticação" : errorType === "network" ? "📡 Erro de conectividade" : "⛔ Erro na API"} — {apiError}
                {errorType === "auth" && (
                  <p style={{ color: C.slate600, fontSize: 12, margin: "6px 0 0", fontWeight: 400 }}>
                    Verifique <code>VITE_ONFLY_API_TOKEN</code> no arquivo <code>.env</code>.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Painéis lado a lado (Fatura | Onfly) ── */}
        {invoiceRows && expenditures.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

            {/* Painel 1 — Fatura */}
            <div style={{ background: C.white, borderRadius: 16, padding: 18, border: `1px solid ${C.slate200}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <StepBadge n="1" />
                <span style={{ fontWeight: 700, fontSize: 13, color: C.blue }}>Extrato — fonte principal</span>
                <span style={{ marginLeft: "auto", background: C.blueLight, color: C.blue, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                  {invoiceRows.length} itens
                </span>
              </div>
              <DataTable
                headers={["Data", "Descrição", "Colaborador", "Valor"]}
                rows={invoiceTableRows}
              />
            </div>

            {/* Painel 2 — Onfly */}
            <div style={{ background: C.white, borderRadius: 16, padding: 18, border: `1px solid ${C.slate200}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <StepBadge n="2" color={C.green} />
                <span style={{ fontWeight: 700, fontSize: 13, color: C.green }}>2ª Fonte — sistema Onfly</span>
                <span style={{ marginLeft: "auto", background: C.greenLight, color: C.green, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                  {expenditures.length} itens
                </span>
              </div>
              <DataTable
                headers={["Data", "Descrição", "Colaborador", "Valor"]}
                rows={onFlyTableRows}
              />
            </div>

          </div>
        )}

        {/* ── STEP 3 / 4: Resultado da Conciliação ── */}
        {results && stats && (
          <div id="results" style={{
            background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: `1px solid ${C.slate200}`,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StepBadge n="3" color={C.slate700} />
                <span style={{ fontWeight: 800, fontSize: 16, color: C.slate900 }}>Resultado da Comparação</span>
                <span style={{
                  background: stats.conciliationRate >= 80 ? C.greenLight : C.amberLight,
                  color:      stats.conciliationRate >= 80 ? C.green      : C.amber,
                  fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999,
                }}>{stats.conciliationRate}% conciliado</span>
              </div>
              <button onClick={() => exportCsv(toExportRows(results), "conciliacao-onfly.csv")} style={{
                background: C.greenLight, color: C.green, border: `1px solid ${C.greenMid}`,
                borderRadius: 10, padding: "7px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>⬇ Exportar CSV</button>
            </div>

            {/* Stats cards */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <StatCard value={stats.total}       label="Total"           color={C.slate600} bg={C.slate100}   active={filter==="all"}          onClick={() => setFilter("all")} />
              <StatCard value={stats.match + stats.matchFuzzy} label="✓ Confere" color={C.green} bg={C.greenLight} active={filter==="match"} onClick={() => setFilter("match")} />
              <StatCard value={0}                 label="≠ Diverge"       color={C.amber}    bg={C.amberLight} active={filter==="diverge"}       onClick={() => setFilter("diverge")} />
              <StatCard value={stats.onlyInvoice} label="← Só na fatura"  color={C.red}      bg={C.redLight}   active={filter==="only_invoice"}  onClick={() => setFilter("only_invoice")} />
              <StatCard value={stats.onlyOnfly}   label="→ Só no Onfly"   color={C.blue}     bg={C.blueLight}  active={filter==="only_onfly"}    onClick={() => setFilter("only_onfly")} />
            </div>

            {/* Resumo financeiro */}
            <div style={{ background: C.slate50, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
              <span>Fatura: <strong style={{ color: C.blue }}>{fmtBRL(stats.totalInvoiceAmount)}</strong></span>
              <span>Onfly:  <strong style={{ color: C.green }}>{fmtBRL(stats.totalOnflyAmount)}</strong></span>
              <span>Gap:    <strong style={{ color: Math.abs(stats.gap ?? 0) < 0.02 ? C.green : C.red }}>{(stats.gap ?? 0) >= 0 ? "+" : ""}{fmtBRL(stats.gap)}</strong></span>
            </div>

            {/* Linhas de status */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredResults.map((r, i) => {
                const cfg  = STATUS_CFG[r.status] ?? STATUS_CFG.only_invoice;
                const date = r.invoice?._dateKey ?? r.expenditure?.date ?? r.expenditure?.occurrence_date ?? "—";
                const desc = r.invoice?._desc ?? r.expenditure?.description ?? r.expenditure?.expenditureType?.name ?? "—";
                const val  = r.invoice?._valor ?? r.expenditure?.amount ?? r.expenditure?.value ?? null;
                const collab = r.invoice?._colaborador ?? r.expenditure?.user?.name ?? "";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 12px", borderRadius: 8,
                    background: cfg.bg, fontSize: 12, fontWeight: 600, color: cfg.color,
                  }}>
                    <span style={{ flexShrink: 0 }}>{cfg.label}</span>
                    <span style={{ color: cfg.color, opacity: 0.5 }}>·</span>
                    <span style={{ flexShrink: 0 }}>{date}</span>
                    <span style={{ color: cfg.color, opacity: 0.5 }}>·</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{desc}</span>
                    {collab && <><span style={{ color: cfg.color, opacity: 0.5 }}>·</span><span style={{ flexShrink: 0, fontWeight: 400, opacity: 0.8 }}>{collab}</span></>}
                    <span style={{ marginLeft: "auto", flexShrink: 0 }}>{fmtBRL(val)}</span>
                    {r.diff != null && <span style={{ flexShrink: 0, opacity: 0.8 }}>Δ {r.diff >= 0 ? "+" : ""}{fmtBRL(Math.abs(r.diff))}</span>}
                  </div>
                );
              })}
              {filteredResults.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: C.slate400, fontSize: 13 }}>
                  Nenhum registro para este filtro.
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      <footer style={{
        textAlign: "center", padding: "20px 16px",
        color: C.slate400, fontSize: 11,
        borderTop: `1px solid ${C.slate200}`,
        background: C.white,
      }}>
        Hackathon Onfly 2026 · Tucano Hipersônico · Feito com ♥ em React + Vite
      </footer>
    </div>
  );
}
