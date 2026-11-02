import { useEffect, useState } from "react";
import { decideSellerVerification, listSellerVerificationApplications } from "./api-client.js";

export default function AdminSellerVerification({ canDecide = false, onNotice }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true); setError("");
    try {
      const result = await listSellerVerificationApplications();
      if (!result.ok) setError(result.data?.error || "Could not load seller applications.");
      else setItems(result.data?.items || []);
    } catch { setError("Network error loading seller applications."); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const decide = async (item, decision) => {
    if (busyId) return;
    const note = (notes[item.id] || "").trim();
    if (decision !== "approve" && note.length < 3) {
      setError("Add a short review note before requesting information or rejecting an application.");
      return;
    }
    setBusyId(item.id); setError("");
    const result = await decideSellerVerification(item.id, decision, note);
    if (!result.ok) setError(result.data?.error || "Could not update this application.");
    else {
      setItems(current => current.filter(row => row.id !== item.id));
      setNotes(current => ({ ...current, [item.id]: "" }));
      onNotice?.(result.data?.message || "Application updated.");
    }
    setBusyId("");
  };

  return <div className="workspace-panel admin-verification-panel">
    <div className="workspace-panel-head"><div><span className="eyebrow">ALOKO OPERATIONS</span><h2>Seller verification queue</h2><p>Review typed seller and business details before granting listing access.</p></div><button className="workspace-secondary" onClick={refresh} disabled={loading}>↻ Refresh</button></div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {loading ? <div className="workspace-empty"><h3>Loading applications…</h3></div> : items.length ? <div className="admin-verification-list">
      {items.map(item => <article className="admin-verification-card" key={item.id}>
        <div className="admin-verification-card-head"><div><span className="eyebrow">{item.subject_type === "business_seller" ? "BUSINESS SELLER" : "INDIVIDUAL SELLER"}</span><h3>{item.store_name || item.display_name || "New seller"}</h3><p>{[item.city,item.state].filter(Boolean).join(", ") || "Location not supplied"}</p></div><span className="workspace-status status-pending">{String(item.status).replaceAll("_"," ")}</span></div>
        <dl><div><dt>Legal name</dt><dd>{item.legal_name || "Not supplied"}</dd></div><div><dt>Contact</dt><dd>{item.contact_phone || "—"}{item.contact_email ? " · " + item.contact_email : ""}</dd></div><div><dt>Category</dt><dd>{item.category || "—"}</dd></div>{item.subject_type === "business_seller" && <><div><dt>Registered name</dt><dd>{item.business_name || "Not supplied"}</dd></div><div><dt>CAC number</dt><dd>{item.cac_registration_number || "Not supplied"}</dd></div></>}</dl>
        <label className="admin-verification-note-field">Review note<textarea rows="2" value={notes[item.id] || ""} onChange={event=>setNotes(current=>({...current,[item.id]:event.target.value}))} placeholder="Record what was checked, or what needs clarification…"/></label>
        {canDecide ? <div className="admin-verification-actions"><button disabled={busyId===item.id} onClick={()=>decide(item,"approve")}>Approve seller</button><button disabled={busyId===item.id} onClick={()=>decide(item,"needs_information")}>Request information</button><button disabled={busyId===item.id} onClick={()=>decide(item,"reject")}>Reject</button></div> : <p className="seller-onboarding-footnote">You can review applications. An administrator must make the final decision.</p>}
      </article>)}
    </div> : <div className="workspace-empty"><span>✓</span><h3>All caught up.</h3><p>There are no seller applications waiting for review.</p></div>}
  </div>;
}
