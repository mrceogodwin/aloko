import { useEffect, useState } from "react";
import { getSellerOnboarding, submitSellerOnboarding } from "./api-client.js";

const states = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

const emptyForm = {
  account_kind: "individual_seller", store_name: "", store_slug: "", legal_name: "",
  contact_phone: "", contact_email: "", business_name: "", cac_registration_number: "",
  category: "General", city: "", state: "", description: "", service_areas: "",
  pickup_available: true, delivery_available: false
};

export default function SellerOnboarding({ onNotice }) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getSellerOnboarding().then(result => {
      if (!active) return;
      if (!result.ok) { setError(result.data?.error || "Could not load your seller application."); return; }
      const item = result.data?.onboarding;
      if (item) {
        setForm(current => ({
          ...current,
          account_kind: item.account_kind || current.account_kind,
          store_name: item.store_name || "",
          store_slug: item.store_slug || "",
          legal_name: item.legal_name || "",
          contact_phone: item.contact_phone || "",
          contact_email: item.contact_email || "",
          business_name: item.business_name || "",
          cac_registration_number: item.cac_registration_number || "",
          service_areas: Array.isArray(item.service_areas) ? item.service_areas.join(", ") : "",
          category: item.category || "General",
          city: item.city || "",
          state: item.state || "",
          description: item.description || "",
          pickup_available: item.pickup_available !== false,
          delivery_available: item.delivery_available === true
        }));
        setStatus(item.application_status || item.verification_status || null);
      }
    }).catch(() => { if (active) setError("Network error loading seller onboarding."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    const payload = {
      ...form,
      service_areas: form.service_areas.split(",").map(value => value.trim()).filter(Boolean)
    };
    delete payload.application_status;
    const result = await submitSellerOnboarding(payload);
    if (result.ok) {
      setStatus(result.data?.application?.status || "pending");
      onNotice?.(result.data?.message || "Seller application submitted.");
    } else setError(result.data?.error || "Could not submit your seller application.");
    setSaving(false);
  };

  if (loading) return <div className="workspace-panel"><div className="workspace-empty"><h3>Preparing your seller application…</h3></div></div>;

  return <div className="workspace-panel seller-onboarding-panel">
    <div className="workspace-panel-head"><div><span className="eyebrow">SELLER VERIFICATION</span><h2>Set up your Aloko store</h2><p>Tell us who is selling and how buyers can reach you. Your store stays private until approved.</p></div>{status && <span className={"workspace-status status-" + status}>{String(status).replaceAll("_"," ")}</span>}</div>
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    <div className="seller-verification-note"><strong>No document upload required to start.</strong><span>Provide accurate details. Aloko may validate business registration and contact details before granting selling access. Typing details alone is not proof of identity or CAC registration.</span></div>
    <form className="seller-onboarding-form" onSubmit={submit}>
      <label>Seller account type<select value={form.account_kind} onChange={e=>update("account_kind",e.target.value)}><option value="individual_seller">Individual seller</option><option value="business_seller">CAC-registered business</option></select></label>
      <div className="seller-onboarding-grid">
        <label>Store name<input required maxLength="100" value={form.store_name} onChange={e=>update("store_name",e.target.value)} placeholder="e.g. The Home Edit"/></label>
        <label>Store URL name<input required maxLength="60" pattern="[a-zA-Z0-9-]+" value={form.store_slug} onChange={e=>update("store_slug",e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="the-home-edit"/></label>
        <label>Legal name<input required maxLength="160" value={form.legal_name} onChange={e=>update("legal_name",e.target.value)} placeholder="Your full legal name"/></label>
        <label>Contact phone<input required type="tel" maxLength="40" value={form.contact_phone} onChange={e=>update("contact_phone",e.target.value)} placeholder="+234…"/></label>
        <label>Contact email <span>(optional)</span><input type="email" maxLength="254" value={form.contact_email} onChange={e=>update("contact_email",e.target.value)} placeholder="you@example.com"/></label>
        {form.account_kind === "business_seller" && <>
          <label>Registered business name<input required maxLength="160" value={form.business_name} onChange={e=>update("business_name",e.target.value)} placeholder="Name on CAC records"/></label>
          <label>CAC registration number<input required maxLength="80" value={form.cac_registration_number} onChange={e=>update("cac_registration_number",e.target.value)} placeholder="Enter your CAC number"/></label>
        </>}
        <label>Primary category<input required maxLength="80" value={form.category} onChange={e=>update("category",e.target.value)} placeholder="Furniture, electronics…"/></label>
        <label>City<input required maxLength="100" value={form.city} onChange={e=>update("city",e.target.value)} placeholder="Your city"/></label>
        <label>State<select required value={form.state} onChange={e=>update("state",e.target.value)}><option value="">Select state</option>{states.map(state=><option key={state}>{state}</option>)}</select></label>
      </div>
      <label>About your store <span>(optional)</span><textarea maxLength="2000" rows="4" value={form.description} onChange={e=>update("description",e.target.value)} placeholder="What do you sell? What should buyers know?"/></label>
      <label>Other service areas <span>(optional, comma-separated)</span><input value={form.service_areas} onChange={e=>update("service_areas",e.target.value)} placeholder="e.g. Ikeja, Lekki, Surulere"/></label>
      <fieldset><legend>How can buyers receive items?</legend><label className="seller-onboarding-check"><input type="checkbox" checked={form.pickup_available} onChange={e=>update("pickup_available",e.target.checked)}/> Buyer pickup</label><label className="seller-onboarding-check"><input type="checkbox" checked={form.delivery_available} onChange={e=>update("delivery_available",e.target.checked)}/> Seller-arranged delivery</label></fieldset>
      <button className="workspace-primary" type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit seller application →"}</button>
      <p className="seller-onboarding-footnote">You can browse Aloko as a buyer while your application is reviewed. Listing access is enabled only after approval.</p>
    </form>
  </div>;
}
