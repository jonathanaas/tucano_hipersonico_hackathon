import { useState, useRef, useCallback } from "react";
import * as Papa from "papaparse";

const ONFLY_BLUE = "#1A56DB";
const ONFLY_LIGHT = "#EFF6FF";

function FileDropZone({ onFileSelect, accept, isDragging, setIsDragging }) {
  const inputRef = useRef();

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect, setIsDragging]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${isDragging ? ONFLY_BLUE : "#CBD5E1"}`,
        borderRadius: "16px",
        padding: "56px 32px",
        textAlign: "center",
        cursor: "pointer",
        background: isDragging ? ONFLY_LIGHT : "#FAFBFC",
        transition: "all 0.2s ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => e.target.files[0] && onFileSelect(e.target.files[0])}
      />
      <div style={{ fontSize: "48px", marginBottom: "12px" }}>
        {isDragging ? "📂" : "📁"}
      </div>
      <p style={{ fontSize: "18px", fontWeight: 600, color: "#1E293B", marginBottom: "6px" }}>
        {isDragging ? "Solte o arquivo aqui" : "Arraste e solte seu arquivo"}
      </p>
      <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "20px" }}>
        ou clique para selecionar
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
        {["PDF", "CSV"].map((type) => (
          <span
            key={type}
            style={{
              background: ONFLY_LIGHT,
              color: ONFLY_BLUE,
              fontWeight: 700,
              fontSize: "12px",
              padding: "4px 12px",
              borderRadius: "999px",
              letterSpacing: "0.05em",
            }}
          >
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}

function CsvPreview({ data, filename }) {
  const headers = data[0] || [];
  const rows = data.slice(1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "22px" }}>📊</span>
        <div>
          <p style={{ fontWeight: 700, color: "#1E293B", fontSize: "15px", margin: 0 }}>{filename}</p>
          <p style={{ color: "#64748B", fontSize: "13px", margin: 0 }}>
            {rows.length} linha{rows.length !== 1 ? "s" : ""} · {headers.length} coluna{headers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #E2E8F0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: ONFLY_BLUE }}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    color: "#fff",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    borderRight: i < headers.length - 1 ? "1px solid rgba(255,255,255,0.15)" : "none",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((row, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? "#fff" : "#F8FAFC", borderTop: "1px solid #E2E8F0" }}
              >
                {headers.map((_, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "9px 16px",
                      color: "#334155",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      borderRight: j < headers.length - 1 ? "1px solid #E2E8F0" : "none",
                    }}
                  >
                    {row[j] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 50 && (
          <div style={{ padding: "10px 16px", background: "#F8FAFC", textAlign: "center", color: "#64748B", fontSize: "13px", borderTop: "1px solid #E2E8F0" }}>
            Exibindo as primeiras 50 de {rows.length} linhas
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPreview({ filename, fileSize, fileUrl }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        <span style={{ fontSize: "22px" }}>📄</span>
        <div>
          <p style={{ fontWeight: 700, color: "#1E293B", fontSize: "15px", margin: 0 }}>{filename}</p>
          <p style={{ color: "#64748B", fontSize: "13px", margin: 0 }}>
            {(fileSize / 1024).toFixed(1)} KB
          </p>
        </div>
      </div>
      <div
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #E2E8F0",
          background: "#F1F5F9",
        }}
      >
        <iframe
          src={fileUrl}
          title="PDF Preview"
          width="100%"
          height="520px"
          style={{ display: "block", border: "none" }}
        />
      </div>
    </div>
  );
}

export default function OnflyImporter() {
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const reset = () => {
    setFile(null);
    setCsvData(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setError(null);
  };

  const handleFileSelect = (selectedFile) => {
    setError(null);
    const ext = selectedFile.name.split(".").pop().toLowerCase();

    if (!["pdf", "csv"].includes(ext)) {
      setError("Formato não suportado. Por favor, envie um arquivo PDF ou CSV.");
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    if (ext === "csv") {
      Papa.parse(selectedFile, {
        complete: (result) => {
          setCsvData(result.data);
          setIsProcessing(false);
        },
        error: () => {
          setError("Erro ao processar o CSV. Verifique o arquivo e tente novamente.");
          setIsProcessing(false);
        },
      });
    } else {
      const url = URL.createObjectURL(selectedFile);
      setPdfUrl(url);
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 100%)",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #E2E8F0",
          padding: "0 32px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              background: ONFLY_BLUE,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: "16px",
            }}
          >
            O
          </div>
          <span style={{ fontWeight: 700, fontSize: "18px", color: "#1E293B" }}>
            Onfly <span style={{ color: ONFLY_BLUE }}>Importer</span>
          </span>
        </div>
        <a
          href="https://app.onfly.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "13px",
            color: ONFLY_BLUE,
            fontWeight: 600,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          app.onfly.com ↗
        </a>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          padding: "40px 24px",
          maxWidth: "900px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>
            Importar Arquivo
          </h1>
          <p style={{ color: "#64748B", fontSize: "15px", margin: 0 }}>
            Faça upload de um PDF ou CSV para visualizar e processar os dados.
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
            border: "1px solid #E2E8F0",
          }}
        >
          {!file ? (
            <>
              <FileDropZone
                onFileSelect={handleFileSelect}
                accept=".pdf,.csv"
                isDragging={isDragging}
                setIsDragging={setIsDragging}
              />
              {error && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px 16px",
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    borderRadius: "10px",
                    color: "#DC2626",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  ⚠️ {error}
                </div>
              )}
            </>
          ) : (
            <div>
              {/* Toolbar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "24px",
                  paddingBottom: "20px",
                  borderBottom: "1px solid #F1F5F9",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#22C55E",
                    }}
                  />
                  <span style={{ fontSize: "14px", color: "#16A34A", fontWeight: 600 }}>
                    Arquivo carregado com sucesso
                  </span>
                </div>
                <button
                  onClick={reset}
                  style={{
                    background: "none",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    padding: "6px 14px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "#64748B",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s",
                  }}
                >
                  ↩ Novo arquivo
                </button>
              </div>

              {isProcessing ? (
                <div style={{ textAlign: "center", padding: "48px", color: "#64748B" }}>
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
                  <p style={{ margin: 0, fontWeight: 500 }}>Processando arquivo...</p>
                </div>
              ) : csvData ? (
                <CsvPreview data={csvData} filename={file.name} />
              ) : pdfUrl ? (
                <PdfPreview filename={file.name} fileSize={file.size} fileUrl={pdfUrl} />
              ) : null}

              {/* Action bar */}
              {!isProcessing && (
                <div
                  style={{
                    marginTop: "24px",
                    paddingTop: "20px",
                    borderTop: "1px solid #F1F5F9",
                    display: "flex",
                    gap: "10px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    style={{
                      background: ONFLY_BLUE,
                      color: "#fff",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 22px",
                      fontWeight: 600,
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onClick={() => alert("Integração com app.onfly.com — em breve!")}
                  >
                    🚀 Enviar para Onfly
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "20px", color: "#94A3B8", fontSize: "12px" }}>
        Onfly Importer · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
