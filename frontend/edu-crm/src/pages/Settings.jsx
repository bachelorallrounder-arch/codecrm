// src/pages/Settings.jsx
import React, { useEffect, useState } from "react";
import { AdminAPI } from "../api/apiClient";
import { useAuth } from "../context/AuthContext";

/**
 * Settings — edit profile (name & password)
 * - Uses GET /auth/me and PUT /admin/users/:id
 * - Admin-only: Create / Edit / Delete users (counsellors & admins)
 */

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const isAdmin = user?.role === "admin";

  // Profile form (current user)
  const [profile, setProfile] = useState({ name: "", email: "", password: "" });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Admin user management
  const [users, setUsers] = useState([]); // all users for admin
  const [brands, setBrands] = useState([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);

  // Create / edit form for admin
  const emptyUserForm = { _id: null, name: "", email: "", password: "", role: "counsellor", assignedBrands: [] };
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [formMode, setFormMode] = useState("create"); // "create" | "edit"
  const [submittingUser, setSubmittingUser] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadProfile();
    if (isAdmin) loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoadingProfile(true);
    try {
      const res = await AdminAPI.me();
      const payload = res?.data ?? res;
      setProfile({ name: payload?.name || "", email: payload?.email || "", password: "" });
    } catch (err) {
      console.error("me failed", err);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const id = user?.id || user?._id;
      const body = { name: profile.name };
      if (profile.password) body.password = profile.password;
      await AdminAPI.updateUser(id, body);
      setMessage({ type: "success", text: "Profile updated" });
      if (refreshUser) refreshUser();
      setProfile((p) => ({ ...p, password: "" }));
    } catch (err) {
      console.error("saveProfile failed", err);
      setMessage({ type: "error", text: err?.response?.data?.message || err.message || "Save failed" });
    } finally {
      setSavingProfile(false);
      setTimeout(() => setMessage(null), 4500);
    }
  }

  /* ---------------- Admin meta and users ---------------- */
  async function loadMeta() {
    setMetaLoading(true);
    try {
      // brands + users (admin listing)
      const [bRes, uRes] = await Promise.allSettled([AdminAPI.getBrands?.(), AdminAPI.rawGet?.("/admin/users")]);

      // brands
      if (bRes.status === "fulfilled" && bRes.value) {
        const payload = bRes.value.data ?? bRes.value ?? {};
        const arr = payload?.results || payload?.data || payload?.brands || (Array.isArray(payload) ? payload : []);
        setBrands(Array.isArray(arr) ? arr : []);
      } else {
        setBrands([]);
      }

      // users (try normalized shape)
      if (uRes.status === "fulfilled" && uRes.value) {
        const payload = uRes.value.data ?? uRes.value ?? {};
        const arr = payload?.users || payload?.data || (Array.isArray(payload) ? payload : []);
        setUsers(Array.isArray(arr) ? arr : []);
      } else {
        // fallback: try AdminAPI.getCounsellors (if only counsellors are needed)
        try {
          const c = await AdminAPI.getCounsellors?.();
          const arr = c?.data ?? c?.users ?? c ?? [];
          setUsers(Array.isArray(arr) ? arr : []);
        } catch (e) {
          setUsers([]);
        }
      }
    } catch (err) {
      console.warn("loadMeta failed", err);
      setBrands([]);
      setUsers([]);
    } finally {
      setMetaLoading(false);
    }
  }

  async function refreshUsers() {
    setUsersLoading(true);
    try {
      const res = await AdminAPI.rawGet?.("/admin/users");
      const payload = res?.data ?? res ?? {};
      const arr = payload?.users || payload?.data || (Array.isArray(payload) ? payload : []);
      setUsers(Array.isArray(arr) ? arr : []);
    } catch (err) {
      console.error("refreshUsers failed", err);
      setMessage({ type: "error", text: "Failed to load users" });
    } finally {
      setUsersLoading(false);
      setTimeout(()=>setMessage(null), 3500);
    }
  }

  /* ---------------- Create / Edit user ---------------- */
  function openCreateUser() {
    setUserForm(emptyUserForm);
    setFormMode("create");
    setMessage(null);
  }

  function openEditUser(u) {
    setUserForm({
      _id: u._id || u.id || null,
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "counsellor",
      assignedBrands: Array.isArray(u.assignedBrands) ? u.assignedBrands.map(b => (b._id || b.id || b)) : (u.assignedBrands || []),
    });
    setFormMode("edit");
    setMessage(null);
  }

  function toggleBrandInForm(brandId) {
    setUserForm((f) => {
      const cur = new Set(f.assignedBrands || []);
      if (cur.has(brandId)) cur.delete(brandId);
      else cur.add(brandId);
      return { ...f, assignedBrands: Array.from(cur) };
    });
  }

  async function submitUserForm() {
    setSubmittingUser(true);
    setMessage(null);
    try {
      // basic validation
      if (!userForm.name?.trim()) throw new Error("Name required");
      if (!userForm.email?.trim()) throw new Error("Email required");
      if (formMode === "create" && !userForm.password?.trim()) throw new Error("Password required for new user");

      const body = {
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        role: userForm.role,
      };
      if (userForm.password) body.password = userForm.password;
      // only send assignedBrands when role is counsellor and array non-empty
      if (userForm.role === "counsellor") body.assignedBrands = Array.isArray(userForm.assignedBrands) ? userForm.assignedBrands : [];

      if (formMode === "create") {
        const res = await AdminAPI.createUser(body);
        setMessage({ type: "success", text: `User created ${(res?.data?.email || "")}` });
      } else {
        const id = userForm._id;
        if (!id) throw new Error("User id missing");
        await AdminAPI.updateUser(id, body);
        setMessage({ type: "success", text: "User updated" });
      }
      // refresh lists
      await loadMeta();
      setUserForm(emptyUserForm);
      setFormMode("create");
    } catch (err) {
      console.error("submitUserForm failed", err);
      setMessage({ type: "error", text: err?.response?.data?.message || err.message || "Operation failed" });
    } finally {
      setSubmittingUser(false);
      setTimeout(()=>setMessage(null), 4500);
    }
  }

  /* ---------------- Delete user ---------------- */
  async function deleteUser(u) {
    const id = u._id || u.id;
    if (!id) return setMessage({ type: "error", text: "User id missing" });
    if (!window.confirm(`Delete user "${u.name || u.email}"? This cannot be undone.`)) return;
    try {
      // use rawDelete to allow flexible route shapes
      await AdminAPI.rawDelete?.(`/admin/users/${id}`);
      setMessage({ type: "success", text: "User deleted" });
      await loadMeta();
    } catch (err) {
      console.error("deleteUser failed", err);
      setMessage({ type: "error", text: err?.response?.data?.message || err.message || "Delete failed" });
    } finally {
      setTimeout(()=>setMessage(null), 3500);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Settings</h2>

      {loadingProfile ? (
        <div>Loading...</div>
      ) : (
        <div style={{ display: "grid", gap: 18, maxWidth: 1000 }}>
          {/* Profile */}
          <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>My profile</h3>
            <div style={{ maxWidth: 640 }}>
              <div style={{ marginBottom: 10 }}>
                <label>Name</label>
                <input value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} style={{ padding: 8, width: "100%" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label>Email (cannot change)</label>
                <input value={profile.email} disabled style={{ padding: 8, width: "100%", background: "#f8fafc" }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label>New password</label>
                <input type="password" value={profile.password} onChange={(e) => setProfile(p => ({ ...p, password: e.target.value }))} style={{ padding: 8, width: "100%" }} />
              </div>
              <div>
                <button onClick={saveProfile} disabled={savingProfile} style={{ padding: "8px 12px", background: "#0f172a", color: "#fff", borderRadius: 8 }}>
                  {savingProfile ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* Admin user management */}
          {isAdmin && (
            <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ marginTop: 0 }}>User management (admin)</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={refreshUsers} style={{ padding: "8px 12px" }}>{usersLoading ? "Loading…" : "Refresh users"}</button>
                  <button onClick={loadMeta} style={{ padding: "8px 12px" }}>{metaLoading ? "Loading…" : "Refresh meta"}</button>
                  <button onClick={openCreateUser} style={{ padding: "8px 12px", background: "#0f172a", color: "#fff", borderRadius: 8 }}>New user</button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                {/* Create / Edit form */}
                <div style={{ border: "1px solid #eef2f7", padding: 12, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{formMode === "create" ? "Create new user" : `Edit user — ${userForm.name || userForm.email}`}</strong>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>{submittingUser ? "Working…" : " "}</div>
                  </div>

                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input placeholder="Name" value={userForm.name} onChange={(e) => setUserForm(f => ({ ...f, name: e.target.value }))} style={{ padding: 8, flex: 1 }} />
                      <input placeholder="Email" value={userForm.email} onChange={(e) => setUserForm(f => ({ ...f, email: e.target.value }))} style={{ padding: 8, width: 320 }} />
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="password" placeholder={formMode === "create" ? "Password (required)" : "Password (leave blank to keep)"} value={userForm.password} onChange={(e) => setUserForm(f => ({ ...f, password: e.target.value }))} style={{ padding: 8, flex: 1 }} />
                      <select value={userForm.role} onChange={(e) => setUserForm(f => ({ ...f, role: e.target.value }))} style={{ padding: 8, width: 220 }}>
                        <option value="counsellor">Counsellor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", marginBottom: 6 }}>Assign brands (for counsellor)</label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {metaLoading ? <div style={{ color: "#6b7280" }}>Loading brands…</div> : brands.length === 0 ? <div style={{ color: "#6b7280" }}>No brands</div> : brands.map(b => {
                          const id = b._id || b.id || String(b);
                          const selected = (userForm.assignedBrands || []).includes(id);
                          return (
                            <button key={id} type="button" onClick={() => toggleBrandInForm(id)} style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              cursor: "pointer",
                              border: selected ? "1px solid #0f172a" : "1px solid #e6e8eb",
                              background: selected ? "#0f172a" : "#fff",
                              color: selected ? "#fff" : "#111827",
                            }}>
                              {b.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {formMode === "edit" && <button onClick={() => { setUserForm(emptyUserForm); setFormMode("create"); }} style={{ padding: "8px 12px" }}>Cancel edit</button>}
                      <button onClick={submitUserForm} disabled={submittingUser} style={{ padding: "8px 12px", background: "#0f172a", color: "#fff", borderRadius: 8 }}>
                        {submittingUser ? "Saving…" : (formMode === "create" ? "Create user" : "Save changes")}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                {message && (
                  <div style={{
                    padding: 10,
                    background: message.type === "error" ? "#fff5f5" : "#ecfdf5",
                    color: message.type === "error" ? "#9b111e" : "#065f46",
                    borderRadius: 8
                  }}>
                    {message.text}
                  </div>
                )}

                {/* Users list */}
                <div style={{ border: "1px solid #eef2f7", padding: 12, borderRadius: 8 }}>
                  <h4 style={{ marginTop: 0 }}>Users</h4>
                  {users.length === 0 ? <div style={{ color: "#6b7280" }}>No users found</div> : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {users.map(u => {
                        const id = u._id || u.id || "";
                        return (
                          <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fbfbff", padding: 8, borderRadius: 8 }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{u.name || "—"}</div>
                              <div style={{ color: "#6b7280", fontSize: 13 }}>{u.email || "—"} • <em style={{ textTransform: "capitalize" }}>{u.role || "—"}</em></div>
                              <div style={{ color: "#6b7280", fontSize: 12 }}>{(Array.isArray(u.assignedBrands) && u.assignedBrands.length) ? `${u.assignedBrands.length} brands` : "unassigned"}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => openEditUser(u)} style={{ padding: "6px 10px" }}>Edit</button>
                              <button onClick={() => deleteUser(u)} style={{ padding: "6px 10px", background: "#fff1f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 6 }}>Delete</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
