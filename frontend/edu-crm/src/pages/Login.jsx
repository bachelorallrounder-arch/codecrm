// src/pages/Login.jsx
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await signIn({ email, password });
    if (!res.success) setErr(res.message);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#111827"
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 10,
          width: 350,
          boxShadow: "0 6px 20px rgba(0,0,0,0.2)"
        }}
      >
        <h2 style={{ marginBottom: 10 }}>Login</h2>

        {err && (
          <div style={{ background: "#fee2e2", padding: 8, borderRadius: 6, color: "#b91c1c", marginBottom: 10 }}>
            {err}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label>Email</label>
          <input
            type="email"
            required
            style={inputStyle}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Password</label>
          <input
            type="password"
            required
            style={inputStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px",
            background: "#111827",
            color: "#fff",
            borderRadius: 6,
            fontWeight: "bold",
            border: "none"
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  marginTop: 4
};
