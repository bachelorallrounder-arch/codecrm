// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { AdminAPI, attachToken } from "../api/apiClient";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const navigate = useNavigate();

  const [token, setToken] = useState(() => localStorage.getItem("crm_token"));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("crm_user") || "null");
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // attach token on load
  useEffect(() => {
    attachToken(token);
    if (token) localStorage.setItem("crm_token", token);
    else localStorage.removeItem("crm_token");
  }, [token]);

  // validate token on page refresh
  useEffect(() => {
    async function check() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await AdminAPI.me();
        const me = res.data || res;
        setUser(me);
      } catch (err) {
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  async function signIn({ email, password }) {
    setLoading(true);
    try {
      const res = await AdminAPI.login({ email, password });
      const { token, user } = res.data;
      setToken(token);
      setUser(user);
      attachToken(token);

      // Role-based redirect
      if (user.role === "admin") navigate("/admin");
      else navigate("/counsellor");

      return { success: true };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || "Login failed" };
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    attachToken(null);
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
    navigate("/login");
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, signIn, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}
