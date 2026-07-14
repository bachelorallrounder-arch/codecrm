// src/components/Header.jsx
import React from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Top navbar.
 * - dispatches "toggleSidebar" event to toggle sidebar
 * - shows simple search input, user info, and logout
 */
export default function Header() {
  const { user, logout } = useAuth();

  function handleToggle() {
    window.dispatchEvent(new CustomEvent("toggleSidebar"));
  }

  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <button className="icon-btn" onClick={handleToggle} aria-label="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>

        <div className="search-wrap" role="search">
          <input className="search-input" placeholder="Search leads, courses, phone..." aria-label="Search" />
        </div>
      </div>

      <div className="topbar-right">
        <div className="user-block" title={user?.email || ""}>
          <div className="user-name">{user?.name || "Guest"}</div>
          <div className="user-role-badge">{user?.role || "visitor"}</div>
        </div>

        <button className="btn-logout" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}
