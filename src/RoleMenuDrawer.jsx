import { useEffect, useState } from "react";
import { getAlokoDashboard, getAlokoMenuItems } from "./role-navigation.js";

export default function RoleMenuDrawer({ profile, onNavigate, onSignOut }) {
  const [open, setOpen] = useState(false);
  const dashboard = getAlokoDashboard(profile || {});
  const items = getAlokoMenuItems(profile || {});

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const go = screen => {
    setOpen(false);
    onNavigate(screen);
  };

  return <>
    <button type="button" className="aloko-menu-trigger" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen(true)}>
      <span aria-hidden="true">☰</span><span>Menu</span>
    </button>
    {open && <div className="aloko-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="aloko-role-drawer" role="dialog" aria-modal="true" aria-label="Aloko account menu">
        <div className="aloko-drawer-head">
          <div className="aloko-drawer-identity">
            <span className="aloko-drawer-avatar">{(profile?.display_name || profile?.name || profile?.email || "A").slice(0,1).toUpperCase()}</span>
            <span><strong>{profile?.display_name || profile?.name || "Aloko member"}</strong><small>{profile?.account_type ? String(profile.account_type).replaceAll("_"," ") : "Marketplace account"} · {dashboard.label}</small></span>
          </div>
          <button type="button" className="aloko-drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>
        <nav className="aloko-drawer-nav" aria-label="Account navigation">
          {items.map(item => <button type="button" key={item.id} className={item.id === "dashboard" ? "aloko-drawer-item aloko-drawer-dashboard" : "aloko-drawer-item"} onClick={() => go(item.screen)}>
            <span>{item.label}</span>{item.id === "dashboard" && <small>Dashboard</small>}
          </button>)}
        </nav>
        <button type="button" className="aloko-drawer-signout" onClick={() => { setOpen(false); onSignOut(); }}>Sign out</button>
      </aside>
    </div>}
  </>;
}
