import { useState, useRef, useCallback } from "react";
import * as Papa from "papaparse";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue: "#1A56DB",
  blueLight: "#EFF6FF",
  blueMid: "#BFDBFE",
  green: "#16A34A",
  greenLight: "#F0FDF4",
  greenMid: "#BBF7D0",
  red: "#DC2626",
  redLight: "#FEF2F2",
  redMid: "#FECACA",
  yellow: "#D97706",
  yellowLight: "#FFFBEB",
  yellowMid: "#FDE68A",
  slate50: "#F8FAFC",
  slate100: "#F1F5F9",
  slate200: "#E2E8F0",
  slate400: "#94A3B8",
  slate500: "#64748B",
  slate700: "#334155",
  slate900: "#0F172A",
  white: "#ffffff",
};

const font = "'Inter', 'Segoe UI', sans-serif";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseNumber(str) {
  if (str == null || str === "") return null;
  const cleaned = String(str).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function exportToCsv(rows, filename) {
  const csv = Papa.unparse(rows);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DropZone({ onFile, isDragging, setIsDragging, label, color }) {
  const ref = useRef();
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile, setIsDragging]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => ref.current.click()}
      style={{
        border: `2px dashed ${isDragging ? color : C.slate200}`,
        borderRadius: 14,
        padding: "36px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: isDragging ? C.blueLight : C.slate50,
        transition: "all .2s",
        flex: 1,
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <div style={{ fontSize: 36, marginBottom: 8 }}>{isDragging ? "📂" : "📁"}</div>
      <p style={{ fontWeight: 700, color: C.slate900, fontSize: 14, marginBottom: 4 }}>{label}</p>
      <p style={{ color: C.slate500, fontSize: 12, marginBottom: 12 }}>Arraste ou clique para selecionar</p>
      <span style={{
        background: C.blueLight, color: color, fontWeight: 700,
        fontSize: 11, padding: "3px 10px", borderRadius: 999,
      }}>CSV</span>
    </div>
  );
}

function PanelHeader({ filename, rowCount, colCount, color, onClear }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderRadius: 10, marginBottom: 12,
      background: color === C.blue ? C.blueLight : C.greenLight,
      border: `1px solid ${color === C.blue ? C.blueMid : C.greenMid}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
        <div>
          <p style={{ fontWeight: 700, color: C.slate900, fontSize: 13, margin: 0 }}>{filename}</p>
          <p style={{ color: C.slate500, fontSize: 11, margin: 0 }}>{rowCount} linhas · {colCount} colunas</p>
        </div>
      </div>
      <button onClick={onClear} style={{
        background: "none", border: `1px solid ${C.slate200}`, borderRadius: 6,
        padding: "3px 10px", cursor: "pointer", fontSize: 12, color: C.slate500,
      }}>✕ Trocar</button>
    </div>
  );
}

function MiniTable({ data }) {
  if (!data || data.length < 2) return null;
  const headers = data[0];
  const rows = data.slice(1, 51);
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.slate100 }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: "7px 12px", textAlign: "left", color: C.slate700,
                fontWeight: 600, borderRight: i < headers.length - 1 ? `1px solid ${C.slate200}` : "none",
                whiteSpace: "nowrap",
              }}>{h || `Col ${i + 1}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.slate50, borderTop: `1px solid ${C.slate200}` }}>
              {headers.map((_, j) => (
                <td key={j} style={{
                  padding: "6px 12px", color: C.slate700, maxWidth: 160,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  borderRight: j < headers.length - 1 ? `1px solid ${C.slate200}` : "none",
                }}>{row[j] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 51 && (
        <div style={{ padding: "7px 12px", background: C.slate100, color: C.slate500, fontSize: 11, textAlign: "center" }}>
          Exibindo 50 de {data.length - 1} linhas
        </div>
      )}
    </div>
  );
}

function SelectCol({ label, value, onChange, options, placeholder }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.slate700, marginBottom: 4 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.slate200}`, background: C.white, color: C.slate700,
          outline: "none", cursor: "pointer",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Comparison Engine ────────────────────────────────────────────────────────
function compare(dataA, dataB, keyA, keyB, valA, valB) {
  const headersA = dataA[0];
  const headersB = dataB[0];
  const rowsA = dataA.slice(1).filter((r) => r.some((c) => c !== ""));
  const rowsB = dataB.slice(1).filter((r) => r.some((c) => c !== ""));

  const iA = headersA.indexOf(keyA);
  const iB = headersB.indexOf(keyB);
  const ivA = valA ? headersA.indexOf(valA) : -1;
  const ivB = valB ? headersB.indexOf(valB) : -1;

  const mapB = {};
  rowsB.forEach((r) => {
    const k = String(r[iB] ?? "").trim().toLowerCase();
    if (k) mapB[k] = r;
  });

  const results = [];
  const usedKeys = new Set();

  rowsA.forEach((rowA) => {
    const k = String(rowA[iA] ?? "").trim().toLowerCase();
    const rowB = mapB[k];
    let status = "only_a";
    let valDiff = null;

    if (rowB) {
      usedKeys.add(k);
      const nA = ivA >= 0 ? parseNumber(rowA[ivA]) : null;
      const nB = ivB >= 0 ? parseNumber(rowB[ivB]) : null;
      if (nA !== null && nB !== null) {
        const diff = Math.abs(nA - nB);
        status = diff < 0.01 ? "match" : "value_diff";
        valDiff = nB - nA;
      } else {
        status = "match";
      }
    }

    results.push({ keyVal: k, rowA, rowB: rowB || null, status, valDiff });
  });

  rowsB.forEach((rowB) => {
    const k = String(rowB[iB] ?? "").trim().toLowerCase();
    if (!usedKeys.has(k) && k) {
      results.push({ keyVal: k, rowA: null, rowB, status: "only_b", valDiff: null });
    }
  });

  return results;
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  match:      { label: "✓ Confere",          bg: C.greenLight,  text: C.green  },
  value_diff: { label: "≠ Valor diferente",   bg: C.yellowLight, text: C.yellow },
  only_a:     { label: "← Só no extrato",     bg: C.redLight,    text: C.red    },
  only_b:     { label: "→ Só na 2ª fonte",    bg: C.blueLight,   text: C.blue   },
};

// ─── Comparison Table ─────────────────────────────────────────────────────────
function ComparisonTable({ results, headersA, headersB, keyA, valA, valB, filter }) {
  const ivA = valA ? headersA.indexOf(valA) : -1;
  const ivB = valB ? headersB.indexOf(valB) : -1;

  const filtered = filter === "all"
    ? results
    : filter === "diff"
    ? results.filter((r) => r.status !== "match")
    : results.filter((r) => r.status === filter);

  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: C.slate500, fontSize: 14 }}>
        Nenhum registro para este filtro.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.slate200}`, fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.slate100 }}>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.slate700, fontWeight: 600, borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap" }}>Status</th>
            <th style={{ padding: "8px 12px", textAlign: "left", color: C.slate700, fontWeight: 600, borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap" }}>Chave ({keyA})</th>
            {ivA >= 0 && <th style={{ padding: "8px 12px", textAlign: "right", color: C.blue, fontWeight: 600, borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap" }}>Extrato ({valA})</th>}
            {ivB >= 0 && <th style={{ padding: "8px 12px", textAlign: "right", color: C.green, fontWeight: 600, borderRight: `1px solid ${C.slate200}`, whiteSpace: "nowrap" }}>2ª Fonte ({valB})</th>}
            {ivA >= 0 && ivB >= 0 && <th style={{ padding: "8px 12px", textAlign: "right", color: C.slate700, fontWeight: 600, whiteSpace: "nowrap" }}>Diferença</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => {
            const cfg = STATUS_CONFIG[r.status];
            const nA = r.rowA && ivA >= 0 ? parseNumber(r.rowA[ivA]) : null;
            const nB = r.rowB && ivB >= 0 ? parseNumber(r.rowB[ivB]) : null;
            return (
              <tr key={i} style={{ background: cfg.bg, borderTop: `1px solid ${C.slate200}` }}>
                <td style={{ padding: "7px 12px", borderRight: `1px solid ${C.slate200}` }}>
                  <span style={{ color: cfg.text, fontWeight: 700, fontSize: 11 }}>{cfg.label}</span>
                </td>
                <td style={{ padding: "7px 12px", color: C.slate700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: `1px solid ${C.slate200}` }}>
                  {r.keyVal}
                </td>
                {ivA >= 0 && (
                  <td style={{ padding: "7px 12px", color: C.blue, fontWeight: 600, textAlign: "right", borderRight: `1px solid ${C.slate200}` }}>
                    {nA !== null ? nA.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : (r.rowA ? (r.rowA[ivA] ?? "—") : "—")}
                  </td>
                )}
                {ivB >= 0 && (
                  <td style={{ padding: "7px 12px", color: C.green, fontWeight: 600, textAlign: "right", borderRight: `1px solid ${C.slate200}` }}>
                    {nB !== null ? nB.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : (r.rowB ? (r.rowB[ivB] ?? "—") : "—")}
                  </td>
                )}
                {ivA >= 0 && ivB >= 0 && (
                  <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: r.valDiff === null ? C.slate400 : r.valDiff > 0 ? C.green : r.valDiff < 0 ? C.red : C.slate500 }}>
                    {r.valDiff !== null
                      ? (r.valDiff >= 0 ? "+" : "") + r.valDiff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                      : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [fileA, setFileA] = useState(null);
  const [dataA, setDataA] = useState(null);
  const [dragA, setDragA] = useState(false);

  const [fileB, setFileB] = useState(null);
  const [dataB, setDataB] = useState(null);
  const [dragB, setDragB] = useState(false);

  const [keyA, setKeyA] = useState("");
  const [keyB, setKeyB] = useState("");
  const [valA, setValA] = useState("");
  const [valB, setValB] = useState("");

  const [results, setResults] = useState(null);
  const [filter, setFilter] = useState("all");

  const parseCsv = (file, setData) => {
    Papa.parse(file, {
      complete: (r) => setData(r.data),
      skipEmptyLines: false,
    });
  };

  const handleFileA = (f) => {
    if (f.name.split(".").pop().toLowerCase() !== "csv") return;
    setFileA(f); setDataA(null); setResults(null); setKeyA(""); setValA("");
    parseCsv(f, setDataA);
  };

  const handleFileB = (f) => {
    if (f.name.split(".").pop().toLowerCase() !== "csv") return;
    setFileB(f); setDataB(null); setResults(null); setKeyB(""); setValB("");
    parseCsv(f, setDataB);
  };

  const headersA = dataA ? dataA[0] : [];
  const headersB = dataB ? dataB[0] : [];
  const canCompare = dataA && dataB && keyA && keyB;

  const runCompare = () => {
    const r = compare(dataA, dataB, keyA, keyB, valA || null, valB || null);
    setResults(r);
    setFilter("all");
    setTimeout(() => document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const stats = results ? {
    total: results.length,
    match: results.filter((r) => r.status === "match").length,
    diff: results.filter((r) => r.status === "value_diff").length,
    onlyA: results.filter((r) => r.status === "only_a").length,
    onlyB: results.filter((r) => r.status === "only_b").length,
  } : null;

  const handleExport = () => {
    if (!results) return;
    const rows = results.map((r) => ({
      status: STATUS_CONFIG[r.status].label,
      chave: r.keyVal,
      valor_extrato: r.rowA && valA ? (r.rowA[headersA.indexOf(valA)] ?? "") : "",
      valor_comparacao: r.rowB && valB ? (r.rowB[headersB.indexOf(valB)] ?? "") : "",
      diferenca: r.valDiff !== null ? r.valDiff : "",
    }));
    exportToCsv(rows, "comparacao-onfly.csv");
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${C.blueLight} 0%, ${C.slate50} 100%)`, fontFamily: font, display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <header style={{
        background: C.white, borderBottom: `1px solid ${C.slate200}`,
        padding: "0 28px", height: 60, display: "flex", alignItems: "center",
        justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, background: C.blue, borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.white, fontWeight: 800, fontSize: 15,
          }}>O</div>
          <span style={{ fontWeight: 700, fontSize: 17, color: C.slate900 }}>
            Onfly <span style={{ color: C.blue }}>Conciliador</span>
          </span>
        </div>
        <a href="https://app.onfly.com" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: C.blue, fontWeight: 600, textDecoration: "none" }}>
          app.onfly.com ↗
        </a>
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, padding: "28px 24px", maxWidth: 1280, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.slate900, margin: "0 0 4px" }}>Comparador de Extratos</h1>
          <p style={{ color: C.slate500, fontSize: 14, margin: 0 }}>
            Importe dois CSVs para cruzar os dados e identificar divergências automaticamente.
          </p>
        </div>

        {/* ── Step 1: Upload panels ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* Panel A — Extrato */}
          <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${C.slate200}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 22, height: 22, background: C.blue, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 11, fontWeight: 800 }}>1</div>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.blue }}>Extrato</span>
              <span style={{ fontSize: 12, color: C.slate400 }}>— fonte principal</span>
            </div>
            {!dataA
              ? <DropZone onFile={handleFileA} isDragging={dragA} setIsDragging={setDragA} label="Importar Extrato (CSV)" color={C.blue} />
              : <>
                  <PanelHeader filename={fileA.name} rowCount={dataA.length - 1} colCount={headersA.length} color={C.blue}
                    onClear={() => { setFileA(null); setDataA(null); setResults(null); setKeyA(""); setValA(""); }} />
                  <MiniTable data={dataA} />
                </>
            }
          </div>

          {/* Panel B — Comparação */}
          <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${C.slate200}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 22, height: 22, background: C.green, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 11, fontWeight: 800 }}>2</div>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.green }}>Comparação</span>
              <span style={{ fontSize: 12, color: C.slate400 }}>— 2ª fonte · futuramente: Onfly API</span>
            </div>
            {!dataB
              ? <DropZone onFile={handleFileB} isDragging={dragB} setIsDragging={setDragB} label="Importar 2ª Fonte (CSV)" color={C.green} />
              : <>
                  <PanelHeader filename={fileB.name} rowCount={dataB.length - 1} colCount={headersB.length} color={C.green}
                    onClear={() => { setFileB(null); setDataB(null); setResults(null); setKeyB(""); setValB(""); }} />
                  <MiniTable data={dataB} />
                </>
            }
          </div>
        </div>

        {/* ── Step 2: Column config ── */}
        {dataA && dataB && (
          <div style={{ background: C.white, borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${C.slate200}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 22, height: 22, background: C.yellow, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 11, fontWeight: 800 }}>3</div>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.slate900 }}>Configurar comparação</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <SelectCol label="🔑 Chave — Extrato" value={keyA} onChange={setKeyA} options={headersA} placeholder="Selecione..." />
              <SelectCol label="🔑 Chave — 2ª Fonte" value={keyB} onChange={setKeyB} options={headersB} placeholder="Selecione..." />
              <SelectCol label="💰 Valor — Extrato (opcional)" value={valA} onChange={setValA} options={headersA} placeholder="Selecione..." />
              <SelectCol label="💰 Valor — 2ª Fonte (opcional)" value={valB} onChange={setValB} options={headersB} placeholder="Selecione..." />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={runCompare} disabled={!canCompare} style={{
                background: canCompare ? C.blue : C.slate200,
                color: canCompare ? C.white : C.slate400,
                border: "none", borderRadius: 10, padding: "10px 28px",
                fontWeight: 700, fontSize: 14, cursor: canCompare ? "pointer" : "not-allowed",
                transition: "all .2s",
              }}>
                🔍 Comparar agora
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {results && (
          <div id="result-section" style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: `1px solid ${C.slate200}` }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 22, height: 22, background: C.slate700, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 11, fontWeight: 800 }}>4</div>
                <span style={{ fontWeight: 700, fontSize: 15, color: C.slate900 }}>Resultado da Comparação</span>
              </div>
              <button onClick={handleExport} style={{
                background: C.greenLight, color: C.green, border: `1px solid ${C.greenMid}`,
                borderRadius: 8, padding: "7px 16px", fontWeight: 600, fontSize: 12, cursor: "pointer",
              }}>⬇ Exportar CSV</button>
            </div>

            {/* Stats cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Total",              value: stats.total,  bg: C.slate100,    color: C.slate700 },
                { label: "✓ Confere",           value: stats.match,  bg: C.greenLight,  color: C.green   },
                { label: "≠ Valor diferente",   value: stats.diff,   bg: C.yellowLight, color: C.yellow  },
                { label: "← Só no extrato",     value: stats.onlyA,  bg: C.redLight,    color: C.red     },
                { label: "→ Só na 2ª fonte",    value: stats.onlyB,  bg: C.blueLight,   color: C.blue    },
              ].map((s) => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: 26, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: s.color, margin: 0, fontWeight: 600 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { key: "all",        label: "Todos"            },
                { key: "diff",       label: "Só divergentes"   },
                { key: "match",      label: "Conferem"         },
                { key: "value_diff", label: "Valor diferente"  },
                { key: "only_a",     label: "Só no extrato"    },
                { key: "only_b",     label: "Só na 2ª fonte"   },
              ].map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  background: filter === f.key ? C.blue : C.slate100,
                  color: filter === f.key ? C.white : C.slate700,
                  border: "none", borderRadius: 8, padding: "6px 14px",
                  fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all .15s",
                }}>{f.label}</button>
              ))}
            </div>

            <ComparisonTable
              results={results}
              headersA={headersA}
              headersB={headersB}
              keyA={keyA} keyB={keyB}
              valA={valA} valB={valB}
              filter={filter}
            />
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: 16, color: C.slate400, fontSize: 11 }}>
        Onfly Conciliador · {new Date().getFullYear()} · Integração com app.onfly.com em breve
      </footer>
    </div>
  );
}
