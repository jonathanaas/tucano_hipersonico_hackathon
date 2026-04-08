/**
 * App.jsx — Onfly Conciliador
 * Fluxo:
 *  1. Usuário seleciona o range de data
 *  2. Usuário sobe a fatura (.csv)
 *  3. Sistema filtra a fatura pelo range, busca despesas na API e concilia
 *  4. Exibe: fatura filtrada | despesas Onfly | bignumbers + conciliado | só fatura
 */

import { useState, useRef, useCallback, useEffect } from "react";
import * as Papa from "papaparse";

import { parseInvoiceCsv }                       from "./services/invoice.parser.js";
import { useExpenditures }                       from "./hooks/useExpenditures.js";
import { reconcile, computeStats, toExportRows } from "./services/reconciliation.js";

// ─── Design tokens ────────────────────────────────────────────────────────────
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepBadge({ n, color = C.blue, done = false }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 8,
      background: done ? C.green : color,
      color: C.white,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 800, flexShrink: 0,
      transition: "background .2s",
    }}>{done ? "✓" : n}</div>
  );
}

function BigNumber({ value, label, color, bg, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color : bg,
      borderRadius: 16, padding: "20px 24px",
      textAlign: "center", flex: "1 1 0", minWidth: 140,
      border: `2px solid ${active ? color : "transparent"}`,
      cursor: onClick ? "pointer" : "default",
      transition: "all .15s",
      boxShadow: active ? `0 4px 16px ${color}33` : "none",
    }}>
      <div style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 900, color: active ? C.white : color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: active ? C.white : color, marginTop: 6, opacity: active ? 1 : 0.8 }}>
        {label}
      </div>
    </div>
  );
}

function SectionHeader({ color, dot, title, count, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: dot ?? color, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
      {count != null && (
        <span style={{
          background: color + "22", color, fontSize: 10, fontWeight: 700,
          padding: "2px 8px", borderRadius: 999,
        }}>{count} {count === 1 ? "item" : "itens"}</span>
      )}
      {badge}
    </div>
  );
}

function DataTable({ headers, rows, headerBg = C.blue, emptyMsg = "Sem dados" }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 11 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: "7px 10px", background: headerBg, color: C.white,
                textAlign: "left", fontWeight: 600, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: 24, textAlign: "center", color: C.slate400 }}>
                {emptyMsg}
              </td>
            </tr>
          ) : rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
              {r.map((cell, j) => (
                <td key={j}
                  title={typeof cell === "string" ? cell : undefined}
                  style={{ padding: "5px 10px", color: C.slate700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cell ?? "—"}
                </td>
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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate500, marginBottom: 6 }}>
        <span>Buscando despesas na API Onfly…</span>
        <span>{pct != null ? `${pct}%` : `${loaded} registros`}</span>
      </div>
      <div style={{ height: 6, background: C.slate200, borderRadius: 999 }}>
        <div style={{
          height: "100%", borderRadius: 999,
          background: `linear-gradient(90deg, ${C.blue}, #3B82F6)`,
          width: pct != null ? `${pct}%` : "40%",
          transition: "width .4s",
        }} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Step 1: período ────────────────────────────────────────────────────────
  const [dateStart, setDateStart] = useState("");
  const [dateEnd,   setDateEnd]   = useState("");

  // ── Step 2: fatura ─────────────────────────────────────────────────────────
  const [invoiceFile,    setInvoiceFile]    = useState(null);
  const [allInvoiceRows, setAllInvoiceRows] = useState(null); // todas as linhas do CSV
  const [invoiceErrors,  setInvoiceErrors]  = useState([]);
  const [parseError,     setParseError]     = useState(null);
  const [isParsing,      setIsParsing]      = useState(false);
  const [isDragging,     setIsDragging]     = useState(false);
  const fileRef = useRef();

  // ── API / pipeline ─────────────────────────────────────────────────────────
  const { fetch: fetchExp, cancel, data: expenditures, loading, progress, error: apiError, errorType } = useExpenditures();

  // ── Resultados ─────────────────────────────────────────────────────────────
  const [results,   setResults]   = useState(null);
  const [stats,     setStats]     = useState(null);
  const [activeView, setActiveView] = useState("match"); // "match" | "only_invoice"

  // Fatura filtrada pelo range escolhido
  const invoiceRows = allInvoiceRows
    ? allInvoiceRows.filter(
        (r) => (!dateStart || r._dateKey >= dateStart) && (!dateEnd || r._dateKey <= dateEnd)
      )
    : null;

  // Ref para capturar invoiceRows no momento da reconciliação
  const invoiceRowsRef = useRef(invoiceRows);
  invoiceRowsRef.current = invoiceRows;

  // ── Auto-trigger: dispara quando CSV é carregado e datas estão prontas ────
  // Usa allInvoiceRows (não filtrado) para decidir se a API deve ser chamada.
  // A filtragem por período acontece na reconciliação via invoiceRowsRef.
  useEffect(() => {
    if (!dateStart || !dateEnd || !allInvoiceRows?.length) return;
    setResults(null);
    setStats(null);
    fetchExp({ startDate: dateStart, endDate: dateEnd });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allInvoiceRows]);

  // ── Reconcilia quando API termina de carregar ─────────────────────────────
  useEffect(() => {
    if (loading || expenditures.length === 0) return;
    const rows = invoiceRowsRef.current ?? [];
    const r = reconcile(rows, expenditures);
    setResults(r);
    setStats(computeStats(r));
    setActiveView("match");
    setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 120);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file?.name?.toLowerCase().endsWith(".csv")) return;
    setInvoiceFile(file);
    setAllInvoiceRows(null);
    setParseError(null);
    setInvoiceErrors([]);
    setResults(null);
    setStats(null);
    setIsParsing(true);
    try {
      const { rows, errors } = await parseInvoiceCsv(file);
      console.log(`[CSV] ${rows.length} linhas parseadas, ${errors.length} erros`);
      if (rows.length > 0) console.log("[CSV] Primeira linha:", rows[0]);
      setAllInvoiceRows(rows);
      setInvoiceErrors(errors);
    } catch (e) {
      console.error("[CSV] Erro no parse:", e);
      setParseError(e.message);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const resetAll = () => {
    setInvoiceFile(null);
    setAllInvoiceRows(null);
    setParseError(null);
    setInvoiceErrors([]);
    setResults(null);
    setStats(null);
    setIsParsing(false);
  };

  const reRun = useCallback(() => {
    if (!allInvoiceRows?.length || !dateStart || !dateEnd) return;
    setResults(null);
    setStats(null);
    fetchExp({ startDate: dateStart, endDate: dateEnd });
  }, [allInvoiceRows, dateStart, dateEnd, fetchExp]);

  // ── Dados para tabelas ─────────────────────────────────────────────────────
  const invoiceTableRows = (invoiceRows ?? []).slice(0, 300).map((r) => [
    r._isEstorno
      ? <span style={{ background: C.redLight, color: C.red, fontWeight: 700, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>↩ Estorno</span>
      : <span style={{ background: C.blueLight, color: C.blue, fontWeight: 700, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>{r._tipo}</span>,
    r._dateKey,
    r._desc,
    r._colaborador + (r._finalCartao ? ` ****${r._finalCartao}` : ""),
    fmtBRL(r._valor),
  ]);

  const onFlyTableRows = expenditures.slice(0, 300).map((e) => [
    e.occurrence_date ?? e.date ?? "—",
    e.description ?? "—",
    e.expenditureType?.name ?? "—",
    e.user?.name ?? "—",
    fmtBRL(e.amount ?? e.value ?? e.total ?? null),
  ]);

  const conciliados    = results?.filter((r) => r.status === "match")        ?? [];
  const divergentes    = results?.filter((r) => r.status === "divergent")    ?? [];
  const soExtrato      = results?.filter((r) => r.status === "only_invoice") ?? [];
  const soOnfly        = results?.filter((r) => r.status === "only_onfly")   ?? [];
  const estornos       = soExtrato.filter((r) => r.invoice?._isEstorno);

  const datesOk  = !!dateStart && !!dateEnd;
  const fileOk   = !!invoiceRows?.length;
  const hasResults = !!results && !!stats;

  // ── Render ─────────────────────────────────────────────────────────────────
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
        <span style={{ background: C.blueLight, color: C.blue, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
          Hackathon 2026
        </span>
      </header>

      {/* ── Main ── */}
      <main style={{
        flex: 1,
        padding: "clamp(16px,3vw,28px) clamp(12px,4vw,32px)",
        maxWidth: 1280, width: "100%", margin: "0 auto", boxSizing: "border-box",
      }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: "clamp(20px,3.5vw,28px)", fontWeight: 800, color: C.slate900, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            Comparador de Extratos
          </h1>
          <p style={{ color: C.slate500, fontSize: 14, margin: 0 }}>
            Cruzamento automático de dados financeiros
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════
            PASSO 1 — Selecione o período
        ══════════════════════════════════════════════════════ */}
        <div style={{
          background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)", border: `1px solid ${datesOk ? C.blueMid : C.slate200}`,
          marginBottom: 16, transition: "border-color .2s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <StepBadge n="1" done={datesOk} />
            <span style={{ fontWeight: 700, fontSize: 14, color: datesOk ? C.green : C.slate700 }}>
              Selecione o período de conciliação
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.slate500, marginBottom: 4 }}>
                Data início
              </label>
              <input
                type="date" value={dateStart}
                onChange={(e) => { setDateStart(e.target.value); resetAll(); }}
                style={{
                  border: `1.5px solid ${dateStart ? C.blue : C.slate200}`,
                  borderRadius: 8, padding: "8px 12px", fontSize: 14,
                  color: C.slate800, outline: "none", background: C.white,
                  cursor: "pointer",
                }}
              />
            </div>

            <div style={{ color: C.slate400, fontSize: 18, marginTop: 16 }}>→</div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.slate500, marginBottom: 4 }}>
                Data fim
              </label>
              <input
                type="date" value={dateEnd}
                min={dateStart || undefined}
                onChange={(e) => { setDateEnd(e.target.value); resetAll(); }}
                style={{
                  border: `1.5px solid ${dateEnd ? C.blue : C.slate200}`,
                  borderRadius: 8, padding: "8px 12px", fontSize: 14,
                  color: C.slate800, outline: "none", background: C.white,
                  cursor: "pointer",
                }}
              />
            </div>

            {datesOk && (
              <div style={{
                background: C.blueLight, borderRadius: 8, padding: "8px 14px",
                fontSize: 12, color: C.blue, fontWeight: 600, marginTop: 16,
              }}>
                {dateStart} → {dateEnd}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            PASSO 2 — Upload da fatura
        ══════════════════════════════════════════════════════ */}
        <div style={{
          background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          border: `1px solid ${fileOk ? C.greenMid : datesOk ? C.slate200 : C.slate100}`,
          marginBottom: 16, transition: "border-color .2s",
          opacity: datesOk ? 1 : 0.5, pointerEvents: datesOk ? "auto" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <StepBadge n="2" color={C.blue} done={fileOk} />
            <span style={{ fontWeight: 700, fontSize: 14, color: fileOk ? C.green : C.slate700 }}>
              Importe a fatura do cartão corporativo
            </span>
            {!datesOk && (
              <span style={{ fontSize: 11, color: C.slate400, marginLeft: 4 }}>
                — selecione o período primeiro
              </span>
            )}
          </div>

          {!invoiceFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? C.blue : C.slate300}`,
                borderRadius: 14, padding: "clamp(28px,4vw,44px) 20px",
                textAlign: "center", cursor: "pointer",
                background: isDragging ? C.blueLight : C.slate50,
                transition: "all .2s",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              <div style={{ fontSize: 38, marginBottom: 10 }}>{isDragging ? "📂" : "📊"}</div>
              <p style={{ fontWeight: 700, color: C.slate800, fontSize: 14, margin: "0 0 4px" }}>
                Arraste ou clique para importar a fatura
              </p>
              <p style={{ color: C.slate400, fontSize: 12, margin: "0 0 12px" }}>
                Arquivo <strong>Viagens_Internas</strong> exportado do Onfly · CSV
              </p>
              <span style={{ background: C.blueLight, color: C.blue, fontWeight: 700, fontSize: 11, padding: "3px 12px", borderRadius: 999 }}>
                CSV
              </span>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 10,
              background: C.greenLight, border: `1px solid ${C.greenMid}`,
              borderRadius: 10, padding: "10px 16px",
            }}>
              <div>
                <p style={{ fontWeight: 700, color: C.slate800, fontSize: 13, margin: 0 }}>
                  {invoiceFile.name}
                </p>
                <p style={{ color: C.slate500, fontSize: 11, margin: "2px 0 0" }}>
                  {isParsing
                    ? "Lendo arquivo…"
                    : `${allInvoiceRows?.length ?? 0} linhas no CSV`}
                  {!isParsing && invoiceRows && invoiceRows.length !== allInvoiceRows?.length
                    ? ` · ${invoiceRows.length} dentro do período`
                    : ""}
                  {invoiceErrors.length > 0 && ` · ⚠ ${invoiceErrors.length} ignoradas`}
                </p>
              </div>
              <button
                onClick={resetAll}
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

        {/* ══════════════════════════════════════════════════════
            LOADING
        ══════════════════════════════════════════════════════ */}
        {loading && (
          <div style={{
            background: C.white, borderRadius: 16, padding: "20px 24px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)", border: `1px solid ${C.blueMid}`,
            marginBottom: 16,
          }}>
            <ProgressBar loaded={progress?.loaded ?? 0} total={progress?.total ?? null} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <button onClick={cancel} style={{
                background: "none", border: `1px solid ${C.slate300}`, borderRadius: 8,
                padding: "6px 18px", fontSize: 12, color: C.slate500, cursor: "pointer",
              }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Erro de API */}
        {apiError && (
          <div style={{
            background: C.redLight, border: `1px solid ${C.redMid}`, borderRadius: 14,
            padding: "14px 18px", marginBottom: 16,
          }}>
            <p style={{ color: C.red, fontWeight: 700, margin: "0 0 4px", fontSize: 14 }}>
              {errorType === "auth" ? "🔑 Erro de autenticação" : errorType === "network" ? "📡 Erro de conectividade" : "⛔ Erro na API Onfly"}
            </p>
            <p style={{ color: C.red, fontSize: 13, margin: 0 }}>{apiError}</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            RESULTADOS
        ══════════════════════════════════════════════════════ */}
        {hasResults && (
          <div id="results" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* ── BIG NUMBERS ── */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
              <BigNumber value={stats.total}       label="Total"         color={C.slate700} bg={C.slate100}   active={activeView === "all"}          onClick={() => setActiveView("all")} />
              <BigNumber value={stats.matched}     label="Conciliado"    color={C.green}    bg={C.greenLight} active={activeView === "match"}         onClick={() => setActiveView("match")} />
              <BigNumber value={stats.divergent}   label="Divergente"    color={C.amber}    bg={C.amberLight} active={activeView === "divergent"}     onClick={() => setActiveView("divergent")} />
              <BigNumber value={stats.onlyInvoice} label="Só extrato"    color={C.red}      bg={C.redLight}   active={activeView === "only_invoice"}  onClick={() => setActiveView("only_invoice")} />
              <BigNumber value={stats.onlyOnfly}   label="Só Onfly"      color={C.blue}     bg={C.blueLight}  active={activeView === "only_onfly"}    onClick={() => setActiveView("only_onfly")} />

              <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", marginLeft: "auto" }}>
                <button onClick={() => exportCsv(toExportRows(results), "conciliacao-onfly.csv")} style={{
                  background: C.greenLight, color: C.green, border: `1px solid ${C.greenMid}`,
                  borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>⬇ Exportar CSV</button>
                <button onClick={reRun} style={{
                  background: C.blueLight, color: C.blue, border: `1px solid ${C.blueMid}`,
                  borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>↺ Re-conciliar</button>
              </div>
            </div>

            {/* ── DADOS BRUTOS: Fatura + Onfly ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Fatura filtrada */}
              <div style={{
                background: C.white, borderRadius: 16, padding: 18,
                border: `1px solid ${C.blueMid}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <SectionHeader
                  color={C.blue}
                  title="Fatura — extrato do cartão"
                  count={invoiceRows?.length}
                  badge={
                    <span style={{ fontSize: 10, color: C.slate400, marginLeft: 4 }}>
                      {dateStart} → {dateEnd}
                    </span>
                  }
                />
                <DataTable
                  headers={["Tipo", "Data", "Descrição", "Colaborador / Cartão", "Valor"]}
                  rows={invoiceTableRows}
                  headerBg={C.blue}
                  emptyMsg="Nenhuma transação no período"
                />
                {(invoiceRows?.length ?? 0) > 300 && (
                  <p style={{ fontSize: 10, color: C.slate400, marginTop: 6, textAlign: "right" }}>
                    Exibindo 300 de {invoiceRows.length}
                  </p>
                )}
              </div>

              {/* Onfly API */}
              <div style={{
                background: C.white, borderRadius: 16, padding: 18,
                border: `1px solid ${C.greenMid}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <SectionHeader
                  color={C.green}
                  title="Onfly — despesas via API"
                  count={expenditures.length}
                />
                <DataTable
                  headers={["Data", "Descrição", "Tipo", "Colaborador", "Valor"]}
                  rows={onFlyTableRows}
                  headerBg={C.green}
                  emptyMsg="Nenhuma despesa encontrada"
                />
                {expenditures.length > 300 && (
                  <p style={{ fontSize: 10, color: C.slate400, marginTop: 6, textAlign: "right" }}>
                    Exibindo 300 de {expenditures.length}
                  </p>
                )}
              </div>
            </div>

            {/* helper para renderizar tabela de resultado com dois lados (fatura + Onfly) */}
            {[
              { key: "match",     show: activeView === "all" || activeView === "match",        rows: conciliados,  color: C.green,  border: C.greenMid,  title: "Conciliado",   twoSided: true },
              { key: "divergent", show: activeView === "all" || activeView === "divergent",    rows: divergentes,  color: C.amber,  border: C.amberMid,  title: "Divergente",   twoSided: true },
            ].map(({ key, show, rows, color, border, title, twoSided }) => show && (
              <div key={key} style={{
                background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
                border: `1px solid ${border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <SectionHeader color={color} title={title} count={rows.length} />
                <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 11 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Tipo","Data","Descrição Fatura","Colaborador","Cartão","Valor Fatura","Tipo Onfly","Descrição Onfly","Valor Onfly","Δ"].map((h, i) => (
                          <th key={i} style={{ padding: "7px 10px", background: color, color: C.white, fontWeight: 600, whiteSpace: "nowrap", textAlign: i >= 5 ? "right" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: C.slate400 }}>Nenhum item.</td></tr>
                      ) : rows.map((r, i) => {
                        const expAmt = r.expenditure?.amount ?? r.expenditure?.value ?? r.expenditure?.total;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
                            <td style={{ padding: "5px 10px" }}>
                              <span style={{ background: color + "22", color, fontWeight: 700, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                                {r.invoice?._tipo ?? "Compra"}
                              </span>
                            </td>
                            <td style={{ padding: "5px 10px", color: C.slate600, whiteSpace: "nowrap" }}>{r.invoice?._dateKey ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate700, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.invoice?._desc}>{r.invoice?._desc ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate600, whiteSpace: "nowrap" }}>{r.invoice?._colaborador ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate500, whiteSpace: "nowrap" }}>{r.invoice?._finalCartao ? `****${r.invoice._finalCartao}` : "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.blue, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(r.invoice?._valor)}</td>
                            <td style={{ padding: "5px 10px", color: C.slate500, whiteSpace: "nowrap" }}>{r.expenditure?.expenditureType?.name ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate700, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.expenditure?.description}>{r.expenditure?.description ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.green, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(expAmt)}</td>
                            <td style={{ padding: "5px 10px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap",
                              color: r.diff == null ? C.slate400 : Math.abs(r.diff) < 0.02 ? C.green : C.red }}>
                              {r.diff != null ? `${r.diff >= 0 ? "+" : "−"}${fmtBRL(Math.abs(r.diff))}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* ── Só extrato (só na fatura do cartão) ── */}
            {(activeView === "all" || activeView === "only_invoice") && (
              <div style={{
                background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
                border: `1px solid ${C.redMid}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <SectionHeader
                  color={C.red}
                  title="Só extrato — na fatura, não encontrado no Onfly"
                  count={soExtrato.length}
                  badge={estornos.length > 0 && (
                    <span style={{ background: C.redLight, color: C.red, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                      {estornos.length} estornos
                    </span>
                  )}
                />
                <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 11 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Tipo","Data","Descrição","Colaborador","Cartão","Valor"].map((h, i) => (
                          <th key={i} style={{ padding: "7px 10px", background: C.red, color: C.white, fontWeight: 600, whiteSpace: "nowrap", textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {soExtrato.length === 0 ? (
                        <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.slate400 }}>Nenhum item.</td></tr>
                      ) : soExtrato.map((r, i) => {
                        const isEstorno = r.invoice?._isEstorno;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
                            <td style={{ padding: "5px 10px" }}>
                              <span style={{
                                fontWeight: 700, fontSize: 10, padding: "2px 6px", borderRadius: 4,
                                background: isEstorno ? C.redLight : "#fff3f3",
                                color: C.red,
                              }}>
                                {isEstorno ? "↩ Estorno" : (r.invoice?._tipo ?? "Compra")}
                              </span>
                            </td>
                            <td style={{ padding: "5px 10px", color: C.slate600, whiteSpace: "nowrap" }}>{r.invoice?._dateKey ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate700, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.invoice?._desc}>{r.invoice?._desc ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate600, whiteSpace: "nowrap" }}>{r.invoice?._colaborador ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate500, whiteSpace: "nowrap" }}>{r.invoice?._finalCartao ? `****${r.invoice._finalCartao}` : "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.red, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(r.invoice?._valor)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Só Onfly (despesa sem correspondência na fatura) ── */}
            {(activeView === "all" || activeView === "only_onfly") && (
              <div style={{
                background: C.white, borderRadius: 16, padding: "clamp(14px,2.5vw,22px)",
                border: `1px solid ${C.blueMid}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <SectionHeader color={C.blue} title="Só Onfly — despesa sem correspondência na fatura" count={soOnfly.length} />
                <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 11 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Data","Descrição","Tipo","Colaborador","Valor"].map((h, i) => (
                          <th key={i} style={{ padding: "7px 10px", background: C.blue, color: C.white, fontWeight: 600, whiteSpace: "nowrap", textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {soOnfly.length === 0 ? (
                        <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: C.slate400 }}>Nenhum item.</td></tr>
                      ) : soOnfly.map((r, i) => {
                        const e = r.expenditure;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
                            <td style={{ padding: "5px 10px", color: C.slate600, whiteSpace: "nowrap" }}>{e?.occurrence_date ?? e?.date ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate700, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e?.description}>{e?.description ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate500, whiteSpace: "nowrap" }}>{e?.expenditureType?.name ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.slate600, whiteSpace: "nowrap" }}>{e?.user?.name ?? "—"}</td>
                            <td style={{ padding: "5px 10px", color: C.blue, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{fmtBRL(e?.amount ?? e?.value ?? e?.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      <footer style={{
        textAlign: "center", padding: "20px 16px", color: C.slate400, fontSize: 11,
        borderTop: `1px solid ${C.slate200}`, background: C.white,
      }}>
        Hackathon Onfly 2026 · Tucano Hipersônico · Feito com ♥ em React + Vite
      </footer>
    </div>
  );
}
