// src/components/Sidebar.jsx
import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role || "guest";

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    function handleToggle() {
      setCollapsed((c) => {
        const next = !c;
        try { localStorage.setItem("sidebar_collapsed", next ? "true" : "false"); } catch {}
        return next;
      });
    }
    window.addEventListener("toggleSidebar", handleToggle);
    return () => window.removeEventListener("toggleSidebar", handleToggle);
  }, []);

  const links = [
    { to: "/admin", label: "Dashboard", icon: IconDashboard, roles: ["admin"] },
    { to: "/admin/leads", label: "Leads", icon: IconLeads, roles: ["admin"] },
    { to: "/admin/brands", label: "Brands", icon: IconBrands, roles: ["admin"] },
    { to: "/admin/reports", label: "Reports", icon: IconReports, roles: ["admin"] },
    { to: "/admin/settings", label: "Settings", icon: IconSettings, roles: ["admin"] },
    { to: "/counsellor",label:"Dashboard",icon:IconDashboard,roles:["counsellor"]},
    { to: "/counsellor/leads",label:"Leads",icon:IconLeads,roles:["counsellor"]},
    { to:"/counsellor/import",label:"Import",icon:IconLeads,roles:["counsellor"]}
    // you can add more links here, use roles to control visibility
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Main navigation">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-logo" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" rx="6" fill="#111827" />
              <path d="M6 15l4-8 4 8h-8z" fill="#fff" />
            </svg>
          </div>
          {!collapsed && <div className="brand-title">CodeZen</div>}
        </div>

        <button
          className="collapse-btn"
          aria-pressed={collapsed}
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            try { localStorage.setItem("sidebar_collapsed", next ? "true" : "false"); } catch {}
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
        </button>
      </div>

      <nav className="sidebar-nav" role="navigation">
        {links.map(({ to, label, icon: Icon, roles }) => {
          if (!roles.includes(role)) return null;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              tabIndex={0}
            >
              <span className="nav-icon" aria-hidden><Icon /></span>
              {!collapsed && <span className="nav-label">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        {!collapsed && (
          <div className="sidebar-user">
            <div className="avatar" aria-hidden>{user?.name?.charAt(0) ?? "U"}</div>
            <div className="user-meta">
              <div className="user-name">{user?.name || "Guest"}</div>
              <div className="user-role">{user?.role || "visitor"}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* --- Icons (simple inline SVG components) --- */
function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="icon">
      <path d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6h8V3h-8zM3 21h8v-6H3v6z" fill="currentColor"/>
    </svg>
  );
}

function IconLeads() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm-8 9a8 8 0 0116 0H4z" fill="currentColor"/>
    </svg>
  );
}

function IconBrands() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 7h18v2H3V7zm0 8h18v2H3v-2zM3 3h18v2H3V3z" fill="currentColor"/>
    </svg>
  );
}

function IconReports() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 3h18v18H3V3zm4 4h2v10H7V7zm4 3h2v7h-2v-7zm4-2h2v9h-2V8z" fill="currentColor"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7zM19.4 12a7.4 7.4 0 00-.1-1l2.1-1.6-2-3.5-2.5 1a7.1 7.1 0 00-1.7-1L14 2H10L9 5.4a7.1 7.1 0 00-1.7 1L4.8 5.4 2.8 8.9l2.1 1.6c-.1.3-.1.6-.1.9s0 .6.1.9L2.8 14.9 4.8 18l2.5-1a7.1 7.1 0 001.7 1L10 22h4l1-3.4c.6-.2 1.1-.5 1.7-1l2.5 1 2-3.5-2.1-1.6c.1-.3.1-.6.1-.9z" fill="currentColor"/>
    </svg>
  );
}
