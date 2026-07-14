// src/pages/Brands/BrandSettings.jsx
import React, { useEffect, useState, useRef } from "react";
import { AdminAPI, api } from "../../api/apiClient";
import { useAuth } from "../../context/AuthContext";

/**
 * BrandSettings — admin-only
 * - Manage brands and which courses they offer
 * - Manage global Courses (CRUD)
 * - Import leads (CSV / Excel)
 * - After import: shows concise summary, first IDs, and an Assign panel
 * - Assign sends { leadIds, userId } to POST /import/leads/assign-bulk (backend)
 */

export default function BrandSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // brands CRUD
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    whatsappMode: "mobile",
    whatsappWebUrl: "",
    templatesText: "",
    courses: []
  });

  // courses list for selects + course admin modal
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseEditing, setCourseEditing] = useState(null);
  const [courseForm, setCourseForm] = useState({ name: "", code: "", description: "", active: true });

  // import states
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importJob, setImportJob] = useState(null);
  const importPollRef = useRef(null);

  // assignment states
  const [users, setUsers] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState("");
  const [showInsertedPreview, setShowInsertedPreview] = useState(false);

  useEffect(() => {
    loadBrands();
    loadCourses();
    loadUsers();
    return () => {
      if (importPollRef.current) clearInterval(importPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------- Loaders ----------------- */
  async function loadBrands() {
    setLoading(true);
    try {
      const res = await AdminAPI.getBrands({ populateCourses: true });
      const payload = res?.data ?? res ?? {};
      const arr = payload?.results || payload?.data || (Array.isArray(payload) ? payload : payload?.brands || []);
      setBrands(Array.isArray(arr) ? arr : []);
    } catch (err) {
      console.error("loadBrands", err);
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCourses() {
    setCoursesLoading(true);
    try {
      const res = await AdminAPI.getCourses({ page: 1, limit: 1000 });
      const payload = res?.data ?? res ?? {};
      const arr = payload?.results || payload?.data || (Array.isArray(payload) ? payload : payload?.courses || []);
      setCourses(Array.isArray(arr) ? arr : []);
    } catch (err) {
      console.error("loadCourses", err);
      setCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const couns = await AdminAPI.getCounsellors?.();
      let arr = [];
      if (couns) {
        if (Array.isArray(couns?.data)) arr = couns.data;
        else if (Array.isArray(couns?.users)) arr = couns.users;
        else if (Array.isArray(couns?.data?.users)) arr = couns.data.users;
      }
      if (arr.length === 0) {
        try {
          const r = await AdminAPI.rawGet("/admin/users");
          const p = r?.data ?? r;
          arr = p?.users || p?.data || (Array.isArray(p) ? p : []);
        } catch (e) { /* ignore */ }
      }
      const normalized = Array.isArray(arr) ? arr.map(u => ({
        _id: u._id || u.id,
        name: u.name || u.email || u._id,
        role: u.role || "counsellor",
        assignedBrands: u.assignedBrands || [],
        assignedCourses: u.assignedCourses || []
      })) : [];
      setUsers(normalized);
    } catch (err) {
      console.error("loadUsers", err);
      setUsers([]);
    }
  }

  /* ----------------- Brands CRUD helpers ----------------- */
  function openCreate() {
    setEditing(null);
    setForm({ name: "", whatsappMode: "mobile", whatsappWebUrl: "", templatesText: "", courses: [] });
    setShowModal(true);
  }
  function openEdit(b) {
    setEditing(b);
    setForm({
      name: b.name || "",
      whatsappMode: b.whatsappMode || "mobile",
      whatsappWebUrl: b.whatsappWebUrl || "",
      templatesText: Array.isArray(b.templates) ? b.templates.map(t => (t.text || t)).join("\n") : "",
      courses: Array.isArray(b.courses) ? b.courses.map(c => (c._id || c.id || c)) : []
    });
    setShowModal(true);
  }
  function parseTemplates(text) {
    if (!text) return [];
    return text.split(/\r?\n/).map((s, i) => ({ key: `t${i+1}`, text: s.trim() })).filter(x => x.text);
  }
  async function save() {
    if (!isAdmin) return alert("Admins only");
    if (!form.name) return alert("Name required");
    const payload = {
      name: form.name,
      whatsappMode: form.whatsappMode,
      whatsappWebUrl: form.whatsappWebUrl,
      templates: parseTemplates(form.templatesText),
      courses: Array.isArray(form.courses) ? form.courses : []
    };
    try {
      if (editing) await AdminAPI.updateBrand(editing._id || editing.id, payload);
      else await AdminAPI.createBrand(payload);
      await loadBrands();
      setShowModal(false);
    } catch (err) {
      alert("Save failed: " + (err?.response?.data?.message || err.message));
    }
  }
  async function remove(b) {
    if (!confirm(`Delete brand ${b.name}?`)) return;
    try {
      await AdminAPI.deleteBrand(b._id || b.id);
      await loadBrands();
    } catch (err) {
      alert("Delete failed: " + (err?.response?.data?.message || err.message));
    }
  }

  /* ----------------- Course CRUD helpers & UI ----------------- */

  function openCourseCreate() {
    setCourseEditing(null);
    setCourseForm({ name: "", code: "", description: "", active: true });
    setShowCourseModal(true);
  }
  function openCourseEdit(c) {
    setCourseEditing(c);
    setCourseForm({
      name: c.name || "",
      code: c.code || "",
      description: c.description || "",
      active: c.active !== undefined ? c.active : true
    });
    setShowCourseModal(true);
  }
  async function saveCourse() {
    if (!isAdmin) return alert("Admins only");
    if (!courseForm.name) return alert("Course name required");
    try {
      if (courseEditing) {
        await AdminAPI.updateCourse(courseEditing._id || courseEditing.id, courseForm);
      } else {
        await AdminAPI.createCourse(courseForm);
      }
      await loadCourses();
      setShowCourseModal(false);
    } catch (err) {
      alert("Save course failed: " + (err?.response?.data?.message || err.message));
    }
  }
  async function deleteCourse(c) {
    if (!confirm(`Delete course "${c.name}"? This will remove it from brands. Use force ?force=true to delete if leads exist.`)) return;
    try {
      await AdminAPI.deleteCourse(c._id || c.id);
      await loadCourses();
      await loadBrands();
    } catch (err) {
      alert("Delete course failed: " + (err?.response?.data?.message || err.message));
    }
  }

  /* Quick-create course from Brand modal */
  async function quickCreateCourseFromBrand(name) {
    if (!name || !name.trim()) return;
    try {
      const payload = { name: name.trim() };
      const res = await AdminAPI.createCourse(payload);
      const created = res?.data ?? res;
      await loadCourses();
      // add created course id to brand form.courses if not present
      const id = created._id || created.id;
      if (id && !form.courses.includes(id)) {
        setForm(f => ({ ...f, courses: [...(f.courses || []), id] }));
      }
      return created;
    } catch (err) {
      console.error("quickCreateCourseFromBrand failed", err);
      alert("Quick-create failed: " + (err?.response?.data?.message || err.message));
      throw err;
    }
  }

  /* ----------------- Import helpers & UI ----------------- */
  const REQUIRED_COLUMNS = ["name", "mobile", "phone", "phone_primary", "brand", "course", "source", "email"];

  function resetImportState() {
    setImportFile(null);
    setImportPreview(null);
    setImportErrors([]);
    setUploadProgress(0);
    setImporting(false);
    setImportJob(null);
    setImportResult(null);
    setAssignTo("");
    setAssignMessage("");
    setShowInsertedPreview(false);
    if (importPollRef.current) { clearInterval(importPollRef.current); importPollRef.current = null; }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0];
    resetImportState();
    if (!f) return;
    setImportFile(f);

    const name = f.name.toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const txt = String(ev.target.result || "");
          const lines = txt.split(/\r?\n/).filter(Boolean);
          if (lines.length === 0) {
            setImportPreview({ headers: [], rows: [] });
            setImportErrors(["CSV empty"]);
            return;
          }
          const headerLine = lines[0];
          const headers = headerLine.split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
          const rows = lines.slice(1, 6).map(r => r.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
          setImportPreview({ headers, rows });
          const missing = REQUIRED_COLUMNS.filter(req => {
            if (req === "mobile") {
              return !headers.includes("mobile") && !headers.includes("phone") && !headers.includes("phone_primary");
            }
            return !headers.includes(req);
          });
          if (missing.length) setImportErrors([`Missing columns: ${missing.join(", ")}`]);
          else setImportErrors([]);
        } catch (err) {
          console.error("CSV preview parse error", err);
          setImportErrors(["Failed to parse CSV preview"]);
        }
      };
      reader.readAsText(f);
      return;
    }

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      setImportPreview({ headers: [], rows: [], note: "Excel file — preview not shown. Backend will parse robustly." });
      setImportErrors([]);
      return;
    }

    setImportErrors(["Unsupported file type — please upload CSV or Excel (.xlsx/.xls)"]);
    setImportPreview(null);
  }

  async function handleUpload() {
    if (!importFile) return alert("Pick a file first");
    if (importErrors.length) {
      const proceed = confirm(`Import warnings:\n${importErrors.join("\n")}\n\nProceed anyway?`);
      if (!proceed) return;
    }

    setImporting(true);
    setUploadProgress(0);
    setImportResult(null);
    setImportJob(null);
    setAssignMessage("");
    setShowInsertedPreview(false);

    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("createMissingBrands", "true");

      const res = await api.post("/import/leads", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (!evt.lengthComputable) return;
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setUploadProgress(pct);
        }
      });

      const data = res?.data ?? res;
      const normalized = normalizeImportResult(data);
      setImportResult(normalized);

      if (data?.jobId) {
        setImportJob({ jobId: data.jobId, status: "queued" });
        pollImportStatus(data.jobId);
      } else {
        setImportJob(null);
      }
    } catch (err) {
      console.error("Upload failed", err);
      const msg = err?.response?.data?.message || err?.message || "Upload failed";
      setImportResult({ success: false, error: msg });
    } finally {
      setImporting(false);
    }
  }

  function normalizeImportResult(data) {
    if (!data) return null;
    const out = { ...data };
    out.insertedLeadIds = out.insertedLeadIds || out.insertedIds || out.inserted || out.inserted_ids || out.inserted_ids_list || null;
    out.importedCount = out.importedCount || out.imported || out.count || out.imported_count || out.importedRows || out.totalInserted || 0;
    out.skippedDuplicates = out.skippedDuplicates ?? out.duplicates ?? 0;
    return out;
  }

  function pollImportStatus(jobId) {
    if (!jobId) return;
    if (importPollRef.current) clearInterval(importPollRef.current);
    importPollRef.current = setInterval(async () => {
      try {
        const st = await AdminAPI.getImportStatus(jobId);
        setImportJob(st);
        if (st?.status === "done" || st?.status === "failed" || st?.status === "completed") {
          clearInterval(importPollRef.current);
          importPollRef.current = null;
          setImportResult(normalizeImportResult(st?.result || st));
        }
      } catch (err) {
        console.error("Poll import status failed", err);
      }
    }, 2000);
  }

  /* ----------------- Assignment ----------------- */

  // Assign only the inserted IDs returned by backend. Backend will ensure brand/course filtering by assignedBrands/assignedCourses.
  async function assignImportedLeads() {
    setAssignMessage("");
    if (!importResult) return alert("No import result available");

    const leadIds = Array.isArray(importResult.insertedLeadIds) ? importResult.insertedLeadIds : null;
    if (!leadIds || leadIds.length === 0) {
      return alert("No inserted lead IDs available from import. Backend must return created IDs to assign specific leads.");
    }
    if (!assignTo) return alert("Select a user to assign to");

    setAssigning(true);
    try {
      const body = { leadIds, userId: assignTo }; // backend expects userId
      const res = (await AdminAPI.rawPost?.("/import/leads/assign-bulk", body)) || (await api.post("/import/leads/assign-bulk", body));
      const payload = res?.data ?? res;
      if (payload?.success === false) {
        setAssignMessage(payload?.message || payload?.error || "Assign failed");
        alert("Assign failed: " + (payload?.message || payload?.error || JSON.stringify(payload)));
      } else {
        setAssignMessage(payload?.message || `Assigned ${payload?.updated ?? payload?.updatedCount ?? payload?.matchedCount ?? 0} leads`);
        await loadBrands();
      }
    } catch (err) {
      console.error("Assign failed", err);
      const msg = err?.response?.data?.message || err?.response?.data?.error || err.message || "Assign failed";
      alert("Assign failed: " + msg);
      setAssignMessage("Assign failed");
    } finally {
      setAssigning(false);
    }
  }

  /* ----------------- Render ----------------- */
  if (!isAdmin) return <div style={{ padding: 20 }}><h2>Brand Settings</h2><p>Admins only</p></div>;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Brand Settings</h1>
          <div style={{ color: "#6b7280" }}>Manage brands, which courses they offer, message templates and import leads.</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={openCreate} style={buttonStyle}>New brand</button>
          <button onClick={loadBrands} style={buttonStyle}>Refresh</button>
          <button onClick={() => { resetImportState(); setShowImport(true); }} style={{ ...buttonStyle, background: "#0f172a", color: "#fff" }}>Import Leads</button>
          <button onClick={openCourseCreate} style={{ ...buttonStyle, background: "#fff", border: "1px dashed #e6e8eb" }}>New course</button>
          <button onClick={loadCourses} style={buttonStyle}>Refresh courses</button>
        </div>
      </div>

      <div style={{ marginTop: 16, background: "#fff", padding: 12, borderRadius: 8 }}>
        {loading ? <div>Loading...</div> : brands.length === 0 ? <div style={{ color: "#6b7280" }}>No brands</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280" }}>
                <th style={{ padding: 8 }}>Name</th>
                <th style={{ padding: 8 }}>WhatsApp mode</th>
                <th style={{ padding: 8 }}>Courses offered</th>
                <th style={{ padding: 8 }}>Templates</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.map(b => (
                <tr key={b._id || b.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: 8 }}>{b.name}</td>
                  <td style={{ padding: 8 }}>{b.whatsappMode}</td>
                  <td style={{ padding: 8 }}>
                    {Array.isArray(b.courses) && b.courses.length
                      ? b.courses.map(c => (c?.name || c)).join(" • ")
                      : <span style={{ color: "#9ca3af" }}>No courses</span>
                    }
                  </td>
                  <td style={{ padding: 8 }}>{Array.isArray(b.templates) ? b.templates.map(t => t.text || t).join(" • ") : "-"}</td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(b)} style={linkBtn}>Edit</button>
                      <button onClick={() => remove(b)} style={dangerBtn}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Brand modal */}
      {showModal && (
        <Modal title={editing ? `Edit ${editing.name}` : "Create brand"} onClose={() => setShowModal(false)}>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={labelStyle}>Name</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />

            <label style={labelStyle}>WhatsApp mode</label>
            <select value={form.whatsappMode} onChange={(e) => setForm(f => ({ ...f, whatsappMode: e.target.value }))} style={inputStyle}>
              <option value="mobile">Mobile</option>
              <option value="web">Web</option>
            </select>

            <label style={labelStyle}>WhatsApp web url (optional)</label>
            <input value={form.whatsappWebUrl} onChange={(e) => setForm(f => ({ ...f, whatsappWebUrl: e.target.value }))} style={inputStyle} />

            <label style={labelStyle}>Courses offered (select one or more)</label>
            <div style={{ border: "1px solid #edf2f7", padding: 8, borderRadius: 8, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ color: "#6b7280" }}>{coursesLoading ? "Loading courses..." : `${courses.length} courses available`}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setForm(f => ({ ...f, courses: [] })); }} style={tinyBtn}>Clear</button>
                  {/* quick add input */}
                  <QuickAddCourse onCreate={async (name) => {
                    try {
                      const created = await quickCreateCourseFromBrand(name);
                      return created;
                    } catch (e) {
                      return null;
                    }
                  }} />
                </div>
              </div>

              {coursesLoading ? <div>Loading courses...</div> : courses.length === 0 ? <div style={{ color: "#6b7280" }}>No courses found</div> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {courses.map(c => {
                    const id = c._id || c.id;
                    const checked = Array.isArray(form.courses) && form.courses.includes(id);
                    return (
                      <label key={id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid #eef2f7", background: checked ? "#f8fafc" : "#fff" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm(f => {
                              const next = Array.isArray(f.courses) ? [...f.courses] : [];
                              if (checked) {
                                if (!next.includes(id)) next.push(id);
                              } else {
                                const idx = next.indexOf(id);
                                if (idx !== -1) next.splice(idx, 1);
                              }
                              return { ...f, courses: next };
                            });
                          }}
                        />
                        <div style={{ fontSize: 13 }}>
                          <div style={{ fontWeight: 700 }}>{c.name}</div>
                          {c.code && <div style={{ color: "#6b7280", fontSize: 12 }}>{c.code}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <label style={labelStyle}>Templates (one per line)</label>
            <textarea value={form.templatesText} onChange={(e) => setForm(f => ({ ...f, templatesText: e.target.value }))} rows={6} style={{ ...inputStyle, minHeight: 120 }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowModal(false)} style={buttonStyle}>Cancel</button>
              <button onClick={save} style={{ ...buttonStyle, background: "#0f172a", color: "#fff" }}>{editing ? "Save" : "Create"}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Course modal (create / edit) */}
      {showCourseModal && (
        <Modal title={courseEditing ? `Edit course: ${courseEditing.name}` : "Create course"} onClose={() => setShowCourseModal(false)}>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={labelStyle}>Name</label>
            <input value={courseForm.name} onChange={(e) => setCourseForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />

            <label style={labelStyle}>Code (optional)</label>
            <input value={courseForm.code} onChange={(e) => setCourseForm(f => ({ ...f, code: e.target.value }))} style={inputStyle} />

            <label style={labelStyle}>Description</label>
            <textarea value={courseForm.description} onChange={(e) => setCourseForm(f => ({ ...f, description: e.target.value }))} rows={4} style={{ ...inputStyle, minHeight: 100 }} />

            <label style={labelStyle}>Active</label>
            <select value={courseForm.active ? "true" : "false"} onChange={(e) => setCourseForm(f => ({ ...f, active: e.target.value === "true" }))} style={inputStyle}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              {courseEditing && <button onClick={() => { if (confirm("Delete this course?")) deleteCourse(courseEditing); }} style={dangerBtn}>Delete</button>}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => setShowCourseModal(false)} style={buttonStyle}>Cancel</button>
                <button onClick={saveCourse} style={{ ...buttonStyle, background: "#0f172a", color: "#fff" }}>{courseEditing ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {showImport && (
        <Modal title="Import leads (CSV / Excel)" onClose={() => { setShowImport(false); resetImportState(); }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ color: "#6b7280" }}>
              Upload CSV or Excel. Required fields: <strong>name</strong>, <strong>mobile</strong> (or phone), <strong>brand</strong>, <strong>course</strong>, <strong>source</strong>. Email optional.
            </div>

            <div>
              <input type="file" accept=".csv, .xlsx, .xls, text/csv" onChange={onFileChange} aria-label="Pick import file" />
            </div>

            {importFile && (
              <div style={{ display: "grid", gap: 8 }}>
                <div><strong>Selected:</strong> {importFile.name} — {(importFile.size / 1024).toFixed(1)} KB</div>

                {importPreview?.note && <div style={{ color: "#6b7280" }}>{importPreview.note}</div>}

                {importPreview?.headers && importPreview.headers.length > 0 && (
                  <div style={{ background: "#fbfbfd", padding: 10, borderRadius: 8, border: "1px solid #eef2f7" }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>CSV preview (first 5 rows)</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead><tr>{importPreview.headers.map((h, i) => <th key={i} style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #eef2f7" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {importPreview.rows.map((r, idx) => (
                            <tr key={idx}>
                              {importPreview.headers.map((_, ci) => <td key={ci} style={{ padding: 6, borderBottom: "1px solid #f7f7fb" }}>{r[ci] ?? ""}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importErrors.length > 0 && (
                  <div style={{ color: "#9b111e", background: "#fff5f5", padding: 8, borderRadius: 6 }}>
                    <strong>Warnings:</strong>
                    <ul style={{ margin: "6px 0 0 16px" }}>{importErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                  <button onClick={() => { setShowImport(false); resetImportState(); }} style={buttonStyle}>Cancel</button>
                  <button onClick={handleUpload} style={{ ...buttonStyle, background: "#0f172a", color: "#fff" }} disabled={importing}>{importing ? "Uploading..." : "Start Import"}</button>
                </div>

                {uploadProgress > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 10, background: "#eef2f7", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ width: `${uploadProgress}%`, height: "100%", background: "#0f172a" }} />
                    </div>
                    <div style={{ marginTop: 6, color: "#6b7280" }}>{uploadProgress}% uploaded</div>
                  </div>
                )}

                {/* result panel */}
                {importResult && (
                  <div style={{ marginTop: 12, background: importResult.success ? "#f0fdfa" : "#fff5f5", padding: 12, borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 700 }}>{importResult.success ? "Import completed" : "Import result"}</div>
                      <div style={{ color: "#6b7280" }}>{importResult.message || ""}</div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <div><strong>Total rows:</strong> {importResult.totalRows ?? "—"}</div>
                      <div><strong>Imported:</strong> {importResult.importedCount ?? importResult.imported ?? 0}</div>
                      <div><strong>Skipped duplicates:</strong> {importResult.skippedDuplicates ?? 0}</div>
                      <div><strong>Created brands:</strong> {Array.isArray(importResult.createdBrands) ? importResult.createdBrands.length : 0}</div>
                    </div>

                    {/* small preview of inserted IDs */}
                    {Array.isArray(importResult.insertedLeadIds) && importResult.insertedLeadIds.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div><strong>Inserted IDs:</strong> {importResult.insertedLeadIds.length} — showing first {Math.min(8, importResult.insertedLeadIds.length)}</div>
                          <button onClick={() => setShowInsertedPreview(s => !s)} style={tinyBtn}>{showInsertedPreview ? "Hide" : "Show"}</button>
                        </div>
                        {showInsertedPreview && (
                          <div style={{ marginTop: 8, maxHeight: 160, overflow: "auto", background: "#fff", padding: 8, borderRadius: 6, border: "1px solid #eef2f7" }}>
                            <ol style={{ margin: 0, paddingLeft: 18 }}>
                              {importResult.insertedLeadIds.slice(0, 200).map((id, idx) => <li key={idx} style={{ fontSize: 13 }}>{id}</li>)}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ASSIGN UI */}
                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={inputStyle}>
                          <option value="">Assign to (select user)</option>
                          {users.map(u => <option key={u._id} value={u._id}>{u.name}{u.role ? ` (${u.role})` : ""}</option>)}
                        </select>
                        <button onClick={assignImportedLeads} disabled={assigning || !assignTo || !importResult?.insertedLeadIds} style={{ padding: "8px 12px", background: "#0f172a", color: "#fff", borderRadius: 8 }}>
                          {assigning ? "Assigning..." : "Assign imported leads"}
                        </button>
                      </div>

                      <div style={{ color: "#6b7280" }}>
                        Assign respects the selected user's assigned brands and courses — only leads matching that user's assignments will be updated.
                      </div>

                      {assignMessage && <div style={{ color: assignMessage.toLowerCase().includes("failed") ? "#991b1b" : "#064e3b" }}>{assignMessage}</div>}
                    </div>

                    {/* raw debug */}
                    <details style={{ marginTop: 12, color: "#6b7280" }}>
                      <summary style={{ cursor: "pointer" }}>Raw import response</summary>
                      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(importResult, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Modal and styles ---------------- */

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(2,6,23,0.4)", zIndex: 1200 }}>
      <div style={{ width: 860, maxWidth: "96%", background: "#fff", borderRadius: 8, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ padding: 8 }}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/* Small inline quick add component used inside Brand modal */
function QuickAddCourse({ onCreate }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input placeholder="Quick add course name" value={val} onChange={(e) => setVal(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7", minWidth: 160 }} />
      <button disabled={!val.trim() || busy} onClick={async () => {
        if (!val.trim()) return;
        setBusy(true);
        try {
          await onCreate(val.trim());
          setVal("");
        } catch (e) {
          // onCreate shows errors as alerts
        } finally {
          setBusy(false);
        }
      }} style={{ padding: "6px 10px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e6e8eb" }}>
        {busy ? "Adding..." : "Add"}
      </button>
    </div>
  );
}

const buttonStyle = { padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid #e6e8eb", cursor: "pointer" };
const tinyBtn = { padding: "6px 8px", background: "#fff", border: "1px solid #e6e8eb", borderRadius: 6, cursor: "pointer" };
const linkBtn = { padding: "6px 10px", background: "#fff", border: "none", color: "#0f172a", cursor: "pointer" };
const dangerBtn = { padding: "6px 10px", background: "#fff1f2", border: "1px solid #fecaca", cursor: "pointer", color: "#991b1b" };
const labelStyle = { display: "block", marginTop: 8, fontSize: 13, fontWeight: 700, color: "#111827" };
const inputStyle = { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #edf2f7", marginTop: 6, fontSize: 14 };
