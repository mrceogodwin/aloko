import { useEffect, useState } from "react";
import { decideListingModeration, listModerationQueue, listModerationReports, updateModerationReport } from "./api-client.js";

function money(value) {
  if (value == null || value === "") return "Free";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value));
}

export default function ModeratorDesk({ onNotice, onSellerApplications }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reasons, setReasons] = useState({});
  const [reports, setReports] = useState([]);
  const [reportNotes, setReportNotes] = useState({});
  const [activeTab, setActiveTab] = useState("listings");
  const [reportsLoading, setReportsLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listModerationQueue();
      if (!result.ok) setError(result.data?.error || "Could not load the moderation queue.");
      else setItems(result.data?.items || []);
    } catch {
      setError("Network error loading the moderation queue.");
    } finally {
      setLoading(false);
    }
  };

  const refreshReports = async () => { setReportsLoading(true); try { const result = await listModerationReports(); if (!result.ok) setError(result.data?.error || "Could not load reports."); else setReports(result.data?.items || []); } catch { setError("Network error loading reports."); } finally { setReportsLoading(false); } };

  useEffect(() => { refresh(); refreshReports(); }, []);

  const decide = async (item, decision) => {
    if (busyId) return;
    const reason = (reasons[item.id] || "").trim();
    if (decision === "reject" && reason.length < 3) {
      setError("Add a clear reason before rejecting a listing.");
      return;
    }
    setBusyId(item.id);
    setError("");
    try {
      const result = await decideListingModeration(item.id, decision, reason);
      if (!result.ok) setError(result.data?.error || "Could not apply this moderation decision.");
      else {
        setItems(current => current.filter(row => row.id !== item.id));
        setReasons(current => ({ ...current, [item.id]: "" }));
        onNotice?.(result.data?.message || "Moderation decision saved.");
      }
    } catch {
      setError("Network error. The moderation decision was not confirmed.");
    } finally {
      setBusyId("");
    }
  };

  const updateReport = async (report, status) => {
    if (busyId) return;
    const note = (reportNotes[report.id] || "").trim();
    if (["resolved", "dismissed"].includes(status) && note.length < 3) { setError("Add a resolution note before closing a report."); return; }
    setBusyId(report.id); setError("");
    try { const result = await updateModerationReport(report.id, status, note); if (!result.ok) setError(result.data?.error || "Could not update report."); else { setReports(rows => rows.filter(row => row.id !== report.id)); onNotice?.(result.data?.message || "Report updated."); } }
    catch { setError("Network error. The report update was not confirmed."); } finally { setBusyId(""); }
  };

  return <div className="workspace-panel admin-verification-panel">
    <div className="workspace-panel-head">
      <div><span className="eyebrow">ALOKO TRUST & SAFETY</span><h2>Moderator Desk</h2><p>Review listings and manage member reports with server-checked permissions.</p></div>
      <button className="workspace-secondary" onClick={() => activeTab === "listings" ? refresh() : refreshReports()} disabled={loading || reportsLoading}>↻ Refresh</button>
    </div>
    <div className="buyer-dashboard-actions"><button className="workspace-secondary" onClick={() => setActiveTab("listings")}>Listing moderation ({items.length})</button><button className="workspace-secondary" onClick={() => setActiveTab("reports")}>Member reports ({reports.length})</button></div>
    <div className="workspace-stats">
      <div><span>AWAITING REVIEW</span><strong>{loading ? "…" : items.length}</strong></div>
      <div><span>QUEUE SOURCE</span><strong>Live</strong></div>
      <div><span>ACCESS</span><strong>Staff only</strong></div>
      <div><span>DECISIONS</span><strong>Audited</strong></div>
    </div>
    <div className="workspace-panel-head"><div><h2>Pending listings</h2><p>Oldest submissions are shown first.</p></div><button className="workspace-secondary" onClick={onSellerApplications}>Seller applications →</button></div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {activeTab === "listings" && (loading ? <div className="workspace-empty"><h3>Loading moderation queue…</h3></div> : items.length ? <div className="admin-verification-list">
      {items.map(item => <article className="admin-verification-card" key={item.id}>
        <div className="admin-verification-card-head"><div><span className="eyebrow">{String(item.kind || "LISTING").replaceAll("_", " ").toUpperCase()}</span><h3>{item.title}</h3><p>{[item.city, item.state].filter(Boolean).join(", ") || "Location not supplied"} · {item.category || "Uncategorised"}</p></div><span className="workspace-status status-pending">Pending review</span></div>
        <dl><div><dt>Seller</dt><dd>{item.seller_display_name || "Aloko member"}</dd></div><div><dt>Price</dt><dd>{money(item.price_naira)}</dd></div><div><dt>Quantity</dt><dd>{item.quantity ?? "—"}</dd></div><div><dt>Submitted</dt><dd>{item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</dd></div></dl>
        <p>{item.description || "No description supplied."}</p>
        <label className="admin-verification-note-field">Decision note<textarea rows="2" maxLength="2000" value={reasons[item.id] || ""} onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Required when rejecting; optional when approving…"/></label>
        <div className="admin-verification-actions"><button disabled={busyId === item.id} onClick={() => decide(item, "approve")}>Approve listing</button><button disabled={busyId === item.id} onClick={() => decide(item, "reject")}>Reject listing</button></div>
      </article>)}
    </div> : <div className="workspace-empty"><span>✓</span><h3>Queue is clear.</h3><p>There are no listings waiting for moderation.</p></div>}
    {activeTab === "reports" && (reportsLoading ? <div className="workspace-empty"><h3>Loading member reports…</h3></div> : reports.length ? <div className="admin-verification-list">{reports.map(report => <article className="admin-verification-card" key={report.id}>
      <div className="admin-verification-card-head"><div><span className="eyebrow">MEMBER REPORT · {report.status.toUpperCase()}</span><h3>{report.listing_title || "Listing no longer available"}</h3><p>Reported by {report.reporter_display_name || "Aloko member"} · {report.created_at ? new Date(report.created_at).toLocaleString() : "Date unavailable"}</p></div><span className="workspace-status status-pending">{report.status}</span></div>
      <dl><div><dt>Reason</dt><dd>{report.reason}</dd></div><div><dt>Reported member</dt><dd>{report.reported_user_display_name || "Not specified"}</dd></div></dl><p>{report.details || "No additional details supplied."}</p>
      <label className="admin-verification-note-field">Resolution note<textarea rows="2" maxLength="2000" value={reportNotes[report.id] || ""} onChange={event => setReportNotes(current => ({...current,[report.id]:event.target.value}))} placeholder="Required to resolve or dismiss…"/></label>
      <div className="admin-verification-actions"><button disabled={busyId === report.id} onClick={() => updateReport(report,"investigating")}>Take ownership</button><button disabled={busyId === report.id} onClick={() => updateReport(report,"resolved")}>Resolve</button><button disabled={busyId === report.id} onClick={() => updateReport(report,"dismissed")}>Dismiss</button></div>
    </article>)}</div> : <div className="workspace-empty"><span>✓</span><h3>No open reports.</h3><p>There are no reports awaiting staff action.</p></div>)}
    <p className="seller-onboarding-footnote">Report handling is enabled. User suspension, payment visibility, credit adjustments, promotions and moderation-history browsing still require secured workflows.</p>
  </div>;
}
