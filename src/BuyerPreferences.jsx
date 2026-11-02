import { useEffect, useState } from "react";
import { getBuyerPreferences, saveBuyerPreferences } from "./api-client.js";

const categories = ["Electronics","Fashion","Home & Living","Vehicles","Health & Beauty","Sports & Hobbies","Baby & Kids","Furniture","Kitchenware","Books","Property & Garden","Toys & Games","Tools","Art & Collectibles","Phones & Accessories","Home Appliances"];
const conditions = [["new","New"],["like_new","Like new"],["good","Good"],["fair","Fair"],["for_parts","For parts"]];
const states = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

export default function BuyerPreferences({ onNotice }) {
  const [form, setForm] = useState({ categories: [], preferred_conditions: [], preferred_brands: [], budget_min: "", budget_max: "", city: "", state: "", search_radius_km: 25, fulfilment_preferences: ["pickup","delivery"] });
  const [brands, setBrands] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    getBuyerPreferences().then(result => {
      if (!active) return;
      if (!result.ok) { setLoadError(result.data?.error || "Could not load your preferences."); return; }
      const p = result.data?.preferences;
      if (p) {
        setForm({ categories:p.categories||[], preferred_conditions:p.preferred_conditions||[], preferred_brands:p.preferred_brands||[], budget_min:p.budget_min_kobo == null ? "" : String(Number(p.budget_min_kobo)/100), budget_max:p.budget_max_kobo == null ? "" : String(Number(p.budget_max_kobo)/100), city:p.city||"", state:p.state||"", search_radius_km:p.search_radius_km||25, fulfilment_preferences:p.fulfilment_preferences||["pickup","delivery"] });
        setBrands((p.preferred_brands||[]).join(", "));
      }
    }).catch(() => { if (active) setLoadError("Network error loading preferences."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const toggle = (key, value) => setForm(current => ({...current,[key]:current[key].includes(value)?current[key].filter(x=>x!==value):[...current[key],value]}));
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    const min = form.budget_min === "" ? null : Number(form.budget_min);
    const max = form.budget_max === "" ? null : Number(form.budget_max);
    if ((min !== null && (!Number.isFinite(min)||min<0)) || (max !== null && (!Number.isFinite(max)||max<0)) || (min !== null && max !== null && max < min)) { onNotice("Check your budget range."); return; }
    setSaving(true);
    try {
      const result = await saveBuyerPreferences({ categories:form.categories, preferred_conditions:form.preferred_conditions, preferred_brands:brands.split(",").map(x=>x.trim()).filter(Boolean), budget_min_kobo:min===null?null:Math.round(min*100), budget_max_kobo:max===null?null:Math.round(max*100), city:form.city.trim()||null, state:form.state||null, location_label:[form.city.trim(),form.state].filter(Boolean).join(", ")||null, search_radius_km:Number(form.search_radius_km), fulfilment_preferences:form.fulfilment_preferences });
      if (!result.ok) { onNotice(result.data?.error||"Could not save your preferences."); return; }
      onNotice("Your shopping preferences have been saved.");
    } catch { onNotice("Network error. Your preferences were not saved."); }
    finally { setSaving(false); }
  };
  return <section className="buyer-preferences-panel">
    <div className="buyer-preferences-intro"><span className="eyebrow">A MORE RELEVANT MARKETPLACE</span><h2>Make Aloko feel like yours.</h2><p>Choose what you like and where you shop. These preferences help shape discovery; every field is optional and you can change them anytime.</p></div>
    {loadError && <div className="workspace-alert" role="alert">{loadError}</div>}
    {loading ? <div className="workspace-empty">Loading your preferences…</div> : <form className="buyer-preferences-form" onSubmit={submit}>
      <fieldset><legend>What are you interested in?</legend><p>Select as many categories as you like.</p><div className="preference-chip-grid">{categories.map(item=><button type="button" key={item} className={form.categories.includes(item)?"preference-chip selected":"preference-chip"} aria-pressed={form.categories.includes(item)} onClick={()=>toggle("categories",item)}>{form.categories.includes(item)?"✓ ":"＋ "}{item}</button>)}</div></fieldset>
      <fieldset><legend>Preferred item condition</legend><div className="preference-chip-grid">{conditions.map(([value,label])=><button type="button" key={value} className={form.preferred_conditions.includes(value)?"preference-chip selected":"preference-chip"} aria-pressed={form.preferred_conditions.includes(value)} onClick={()=>toggle("preferred_conditions",value)}>{form.preferred_conditions.includes(value)?"✓ ":"＋ "}{label}</button>)}</div></fieldset>
      <label className="preference-field">Brands you like <span>Separate names with commas</span><input value={brands} onChange={e=>setBrands(e.target.value)} maxLength={1000} placeholder="e.g. Samsung, Nike, LG"/></label>
      <div className="preference-budget"><label className="preference-field">Minimum budget (₦)<input type="number" min="0" value={form.budget_min} onChange={e=>setForm(v=>({...v,budget_min:e.target.value}))} placeholder="No minimum"/></label><label className="preference-field">Maximum budget (₦)<input type="number" min="0" value={form.budget_max} onChange={e=>setForm(v=>({...v,budget_max:e.target.value}))} placeholder="No maximum"/></label></div>
      <div className="preference-budget"><label className="preference-field">City (optional)<input value={form.city} onChange={e=>setForm(v=>({...v,city:e.target.value}))} maxLength={100} placeholder="e.g. Benin City"/></label><label className="preference-field">State<select value={form.state} onChange={e=>setForm(v=>({...v,state:e.target.value}))}><option value="">Any state</option>{states.map(state=><option key={state}>{state}</option>)}</select></label></div>
      <label className="preference-field">Discovery radius <strong>{form.search_radius_km} km</strong><input type="range" min="1" max="250" step="1" value={form.search_radius_km} onChange={e=>setForm(v=>({...v,search_radius_km:Number(e.target.value)}))}/><span>Uses your selected city/state, not your exact home address.</span></label>
      <fieldset><legend>How do you prefer to receive items?</legend><div className="preference-chip-grid">{[["pickup","Pickup"],["delivery","Delivery"]].map(([value,label])=><button type="button" key={value} className={form.fulfilment_preferences.includes(value)?"preference-chip selected":"preference-chip"} aria-pressed={form.fulfilment_preferences.includes(value)} onClick={()=>toggle("fulfilment_preferences",value)}>{form.fulfilment_preferences.includes(value)?"✓ ":"＋ "}{label}</button>)}</div></fieldset>
      <div className="preference-save-row"><span>Your choices are private to your account.</span><button className="workspace-primary" type="submit" disabled={saving}>{saving?"Saving…":"Save preferences →"}</button></div>
    </form>}
  </section>;
}
