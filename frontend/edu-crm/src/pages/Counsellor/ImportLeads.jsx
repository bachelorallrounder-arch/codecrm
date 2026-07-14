// src/pages/Counsellor/ImportLeads.jsx
import React, { useState, useRef } from "react";
import { api } from "../../api/apiClient";
import { useAuth } from "../../context/AuthContext";

export default function ImportLeads() {
  const { user } = useAuth();
  const assignedBrands = user?.assignedBrands || [];

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [showInsertedPreview, setShowInsertedPreview] = useState(false);

  const REQUIRED_COLUMNS = ["name", "mobile", "brand", "course", "source"];

  function reset() {
    setFile(null);
    setPreview(null);
    setErrors([]);
    setImporting(false);
    setProgress(0);
    setResult(null);
    setShowInsertedPreview(false);
  }

  /* File select */
  function onFileChange(e) {
    const f = e.target.files?.[0];
    reset();
    if (!f) return;
    setFile(f);

    const name = f.name.toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const txt = String(ev.target.result || "");
          const rows = txt.split(/\r?\n/).filter(Boolean);
          const headerLine = rows[0];
          const headers = headerLine.split(",").map(h => h.trim().toLowerCase());

          const rowPrev = rows.slice(1, 6).map(r => r.split(",").map(v => v.trim()));

          setPreview({ headers, rows: rowPrev });

          // missing column check
          const missing = REQUIRED_COLUMNS.filter(req => {
            if (req === "mobile") {
              return !headers.includes("mobile") && !headers.includes("phone") && !headers.includes("phone_primary");
            }
            return !headers.includes(req);
          });

          if (missing.length) {
            setErrors([`Missing columns: ${missing.join(", ")}`]);
          }

        } catch (err) {
          setErrors(["Failed to parse CSV"]);
        }
      };
      reader.readAsText(f);
      return;
    }

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      setPreview({ note: "Excel file — backend will parse it." });
      return;
    }

    setErrors(["Unsupported file type"]);
  }

  /* Import for counsellor */
  async function handleImport() {
    if (!file) return alert("Select file");
    if (errors.length) {
      if (!confirm("Warnings exist. Continue?")) return;
    }

    setImporting(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("userId", user._id); // auto-assign to counsellor
      fd.append("createMissingBrands", "false"); // cannot create brands

      const res = await api.post("/import/leads", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: evt => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setProgress(pct);
          }
        }
      });

      const data = res?.data ?? res;
      const normalized = normalize(data);
      setResult(normalized);

    } catch (err) {
      setResult({
        success: false,
        error: err?.response?.data?.message || err.message
      });
    } finally {
      setImporting(false);
    }
  }

  function normalize(data) {
    if (!data) return {};
    return {
      success: data.success,
      totalRows: data.totalRows,
      importedCount: data.importedCount || data.imported || 0,
      skippedDuplicates: data.skippedDuplicates || 0,
      skippedInvalidBrands: data.invalidBrandCount || 0,
      insertedLeadIds: data.insertedLeadIds || []
    };
  }

  /* Render */
  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: 0 }}>Import Leads</h2>
      <div style={{ color: "#6b7280", marginBottom: 20 }}>
        Upload CSV/Excel — leads will be auto-assigned to <b>you</b>.
      </div>

      {/* File */}
      <input type="file" accept=".csv, .xlsx, .xls" onChange={onFileChange} />

      {file && (
        <div style={{ marginTop: 12, background: "#fafafa", padding: 12, borderRadius: 6 }}>
          <div><strong>Selected:</strong> {file.name}</div>

          {preview?.headers && (
            <div style={{ marginTop: 10 }}>
              <strong>Preview:</strong>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
                <thead><tr>
                  {preview.headers.map((h,i)=>
                    <th key={i} style={{ padding: 6, textAlign:"left", borderBottom:"1px solid #eee" }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {preview.rows.map((row,ri)=>(
                    <tr key={ri}>
                      {preview.headers.map((_,ci)=>(
                        <td key={ci} style={{ padding: 6, borderBottom:"1px solid #f5f5f5" }}>
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.length > 0 && (
            <div style={{ color: "#991b1b", background: "#fee", padding: 8, borderRadius: 4, marginTop: 10 }}>
              <strong>Warnings:</strong>
              <ul>
                {errors.map((e,i)=><li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{ padding: "8px 14px", background:"#0f172a", color:"#fff", borderRadius:6 }}>
              {importing ? "Importing..." : "Start Import"}
            </button>
          </div>

          {progress > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 8, background:"#eee", borderRadius:4 }}>
                <div style={{
                  height:"100%", width:`${progress}%`,
                  background:"#0f172a" }} />
              </div>
              <div style={{ color:"#6b7280", marginTop:4 }}>{progress}%</div>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 20, padding: 12, background: "#f0fdfa", borderRadius: 6 }}>
          <h3 style={{margin:0}}>Import Result</h3>

          {result.error && (
            <div style={{ color:"#991b1b" }}>
              Error: {result.error}
            </div>
          )}

          {!result.error && (
            <>
              <div><strong>Total rows:</strong> {result.totalRows}</div>
              <div><strong>Imported:</strong> {result.importedCount}</div>
              <div><strong>Duplicate skipped:</strong> {result.skippedDuplicates}</div>
              <div><strong>Brand mismatch skipped:</strong> {result.skippedInvalidBrands}</div>

              {Array.isArray(result.insertedLeadIds) && result.insertedLeadIds.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Created:</strong> {result.insertedLeadIds.length} IDs  
                  <button
                    style={{ marginLeft:10, padding:"4px 8px" }}
                    onClick={()=>setShowInsertedPreview(!showInsertedPreview)}>
                    {showInsertedPreview ? "Hide" : "Show"}
                  </button>

                  {showInsertedPreview && (
                    <div style={{
                      marginTop:6,
                      maxHeight:150,
                      overflow:"auto",
                      background:"#fff",
                      padding:8,
                      border:"1px solid #ddd",
                      borderRadius:6 }}>
                      <ol>
                        {result.insertedLeadIds.slice(0,200).map((id,i)=>(
                          <li key={i}>{id}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
