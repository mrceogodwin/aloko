import { useEffect, useMemo, useRef, useState } from "react";
import { matchesListingQuery, sortListings, validateListingDraft } from "./marketplace.js";

const categories = [
  ["⌂", "Home & Living"], ["▣", "Phones & Tech"], ["♧", "Fashion"], ["◈", "Appliances"],
  ["♧", "Furniture"], ["▤", "Books & Hobbies"], ["✿", "Free items"], ["↗", "Services"]
];
function formatNaira(value) {
  if (value === null || value === undefined || value === "") return "Free";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price on request";
  return amount === 0 ? "Free" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}

function normalizeLiveListing(item) {
  const conditionLabels = { new: "New", like_new: "Like new", good: "Good", fair: "Fair", for_parts: "For parts" };
  const price = item.price_naira ?? (item.price_kobo == null ? null : Number(item.price_kobo) / 100);
  return {
    id: String(item.id),
    title: item.title,
    price: formatNaira(price),
    condition: conditionLabels[item.condition] || "Condition not specified",
    place: [item.city, item.state].filter(Boolean).join(", "),
    city: item.city || "",
    category: item.category,
    description: item.description || "Contact the seller for more details.",
    sellerName: item.seller_display_name || "Aloko seller",
    image: "",
    kind: item.kind,
    quantity: item.quantity,
    live: true
  };
}

function App() {
  const [liveProducts, setLiveProducts] = useState(null);
  const [listingLoadState, setListingLoadState] = useState("loading");
  const [listingReloadKey, setListingReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setListingLoadState("loading");
    fetch("/api/listings?limit=48", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Listings unavailable");
        return response.json();
      })
      .then(payload => {
        if (!Array.isArray(payload.items)) throw new Error("Invalid listings response");
        setLiveProducts(payload.items.map(normalizeLiveListing));
        setListingLoadState("live");
      })
      .catch(error => {
        if (error.name !== "AbortError") {
          setLiveProducts([]);
          setListingLoadState("error");
        }
      });
    return () => controller.abort();
  }, [listingReloadKey]);
  const products = liveProducts ?? [];
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState("recent");
  const [selectedLocation, setSelectedLocation] = useState("All locations");
  const [selectedCondition, setSelectedCondition] = useState("Any condition");
  const [saved, setSaved] = useState(() => {
    try {
      const stored = window.localStorage.getItem("aloko:saved-items");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter(id => (typeof id === "number" && Number.isInteger(id)) || (typeof id === "string" && id.length <= 80)) : [];
    } catch {
      return [];
    }
  });
  const noticeTimer = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("aloko:saved-items", JSON.stringify(saved));
    } catch {
      // Browser storage can be unavailable in private or restricted contexts.
    }
  }, [saved]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);
  const [notice, setNotice] = useState("");
  const [selectedListing, setSelectedListing] = useState(null);
  const [listingFormOpen, setListingFormOpen] = useState(false);
  const [localDraftExists, setLocalDraftExists] = useState(() => { try { return Boolean(window.localStorage.getItem("aloko:listing-draft")); } catch { return false; } });
  const [listingDraft, setListingDraft] = useState({ title: "", kind: "sale", price: "", category: "Home & Living", condition: "Good", quantity: "1", fulfillment: "pickup", place: "", description: "" });
  const [listingImagePreview, setListingImagePreview] = useState("");
  const [draftReviewOpen, setDraftReviewOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [accountRole, setAccountRole] = useState("buyer");
  const [dashboardPreviewRole, setDashboardPreviewRole] = useState("buyer");
  const [dashboardPreviewOpen, setDashboardPreviewOpen] = useState(false);
  const listingImageInput = useRef(null);
  const listingDraftForm = useRef(null);
  useEffect(() => {
    if (!listingFormOpen) return;
    try {
      const raw = window.localStorage.getItem("aloko:listing-draft");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setListingDraft(current => ({
          title: typeof parsed.title === "string" ? parsed.title : current.title,
          kind: ["sale", "giveaway", "bulk"].includes(parsed.kind) ? parsed.kind : current.kind,
          price: typeof parsed.price === "string" ? parsed.price : current.price,
          category: typeof parsed.category === "string" ? parsed.category : current.category,
          condition: typeof parsed.condition === "string" ? parsed.condition : current.condition,
          quantity: typeof parsed.quantity === "string" ? parsed.quantity : current.quantity,
          fulfillment: ["pickup", "delivery", "both"].includes(parsed.fulfillment) ? parsed.fulfillment : current.fulfillment,
          place: typeof parsed.place === "string" ? parsed.place : current.place,
          description: typeof parsed.description === "string" ? parsed.description : current.description
        }));
        setLocalDraftExists(true);
      }
    } catch {
      setLocalDraftExists(false);
    }
  }, [listingFormOpen]);

  useEffect(() => {
    const anyDialogOpen = selectedListing || listingFormOpen || draftReviewOpen || accountModalOpen || dashboardPreviewOpen;
    if (!anyDialogOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key !== "Escape") return;
      // Close the topmost dialog first, preserving the seller draft when its review is dismissed.
      if (draftReviewOpen) setDraftReviewOpen(false);
      else if (accountModalOpen) setAccountModalOpen(false);
      else if (dashboardPreviewOpen) setDashboardPreviewOpen(false);
      else if (listingFormOpen) setListingFormOpen(false);
      else if (selectedListing) setSelectedListing(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedListing, listingFormOpen, draftReviewOpen, accountModalOpen, dashboardPreviewOpen]);
  const filtered = useMemo(() => products.filter(p =>
    (activeCategory === "All" || p.category === activeCategory) &&
    (selectedLocation === "All locations" || p.place === selectedLocation) &&
    (selectedCondition === "Any condition" || p.condition === selectedCondition) &&
    (!savedOnly || saved.includes(p.id)) &&
    matchesListingQuery(p, query)
  ), [query, activeCategory, selectedLocation, selectedCondition, savedOnly, saved]);

  const visibleProducts = useMemo(() => sortListings(filtered, sortOrder, products), [filtered, sortOrder, products]);

  const showNotice = (message) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice("");
      noticeTimer.current = null;
    }, 2800);
  };
  const toggleSaved = (id) => {
    setSaved(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
    showNotice(saved.includes(id) ? "Item removed from your saved list." : "Item saved on this device.");
  };

  return <div className="app-shell">
    <header className="topbar"><div className="nav-inner">
      <a className="brand" href="#" aria-label="Aloko home">aloko<span>.</span></a>
      <nav className="desktop-nav" aria-label="Main navigation">
        <a href="#explore">Explore</a><a href="#free">Free finds</a><a href="#services">Services</a><button className="nav-link-button" onClick={() => { setSavedOnly(value => !value); setActiveCategory("All"); document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}); }}>{savedOnly ? "All items" : `Saved (${saved.length})`}</button>
      </nav>
      <div className="nav-actions"><button className="text-button" onClick={() => { setAccountMode("login"); setAccountModalOpen(true); }}>Log in</button><button className="account-create-button" onClick={() => { setAccountMode("register"); setAccountModalOpen(true); }}>Create account</button><button className="nav-link-button dashboard-preview-trigger" onClick={() => setDashboardPreviewOpen(true)}>Dashboard preview</button><button className="mobile-saved-toggle" aria-pressed={savedOnly} onClick={() => { setSavedOnly(value => !value); setActiveCategory("All"); document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}); }}>{savedOnly ? "All" : `Saved ${saved.length}`}</button>{localDraftExists && <button className="resume-draft-button" onClick={() => setListingFormOpen(true)}>Continue draft</button>}<button className="post-button" onClick={() => setListingFormOpen(true)}>＋ Sell an item</button></div>
    </div></header>
    <main>
      <section className="hero"><div className="hero-copy">
        <span className="eyebrow">A more thoughtful marketplace</span>
        <h1>Good things deserve<br/><em>another life.</em></h1>
        <p>Find pre-loved treasures, pass on what you no longer need, and give good things a second home.</p>
        <form className="search-bar" onSubmit={e => { e.preventDefault(); document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}); }}>
          <span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="What are you looking for?" aria-label="Search listings"/><button type="submit">Search</button>
        </form>
        <div className="hero-note"><span>✓</span> Discover finds near you <span>·</span> Give items a second life</div>
      </div><div className="hero-art"><div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div><div className="art-label label-top">A little less waste</div><div className="art-photo"><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85" alt="Warm, thoughtfully styled living room"/></div><div className="art-label label-bottom"><span>↗</span> Pass it on.</div><div className="art-sticker">GOOD<br/>FINDS<br/>LIVE ON.</div></div></section>
      <section className="category-section wrap" id="explore"><div className="section-heading"><div><span className="eyebrow">Find your next favourite</span><h2>Explore categories</h2></div><button className="view-all" onClick={() => {setActiveCategory("All");setQuery("");setSavedOnly(false);setSelectedLocation("All locations");setSelectedCondition("Any condition");setSortOrder("recent");}}>View all ↗</button></div>
        <div className="category-grid">{categories.map(([icon,name]) => <button key={name} className={activeCategory === name ? "category active" : "category"} onClick={() => {setSavedOnly(false); if(name === "Services"){setActiveCategory("All");document.getElementById("services")?.scrollIntoView({behavior:"smooth"});}else{setActiveCategory(name);if(name === "Free items") document.getElementById("explore")?.scrollIntoView({behavior:"smooth"});}}}><span className="category-icon">{icon}</span><span>{name}</span><span className="category-arrow">↗</span></button>)}</div>
      </section>
      <section className="listings-section wrap"><div className="section-heading"><div><span className="eyebrow">A second chance at something good</span><h2>{savedOnly ? "Your saved items" : query ? "Search results" : activeCategory === "All" ? "Freshly listed" : activeCategory}</h2></div><div className="listing-tools"><label className="sort-control">Condition <select value={selectedCondition} onChange={e => setSelectedCondition(e.target.value)} aria-label="Filter by item condition"><option>Any condition</option>{[...new Set(products.map(p => p.condition).filter(value => value && value !== "Condition not specified"))].sort().map(condition => <option key={condition} value={condition}>{condition}</option>)}</select></label><label className="sort-control">Location <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} aria-label="Filter by location"><option>All locations</option>{[...new Set(products.map(p => p.place).filter(Boolean))].sort().map(place => <option key={place} value={place}>{place}</option>)}</select></label><label className="sort-control">Sort <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} aria-label="Sort listings"><option value="recent">Recently added</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label><span className="listing-count">{listingLoadState === "live" ? `${visibleProducts.length} live listings` : listingLoadState === "loading" ? "Loading listings" : "Marketplace unavailable"}</span></div></div>
        <div className="product-grid">{visibleProducts.map(p => <article className="product-card" key={p.id}><div className="product-image">{p.image ? <img src={`https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=700&q=80`} alt={p.title}/> : <div className="product-image-placeholder" role="img" aria-label="No listing photo uploaded"><span>aloko.</span></div>}<span className="condition">{p.condition}</span><button className={saved.includes(p.id) ? "save saved" : "save"} aria-label={saved.includes(p.id) ? "Remove from saved" : "Save item"} onClick={() => toggleSaved(p.id)}>{saved.includes(p.id) ? "♥" : "♡"}</button></div><div className="product-info"><span className="product-place">⌖ {p.place}</span><h3>{p.title}</h3><div className="product-bottom"><strong>{p.price}</strong><button onClick={() => setSelectedListing(p)}>View item ↗</button></div></div></article>)}</div>
        {filtered.length === 0 && <div className="empty-state"><span>{savedOnly && saved.length === 0 ? "♡" : "⌕"}</span><h3>{savedOnly && saved.length === 0 ? "Your saved list is waiting" : savedOnly ? "No saved items match these filters" : "No matches just yet"}</h3><p>{savedOnly && saved.length === 0 ? "Tap the heart on any item to keep it here for later. Saved items stay on this device." : "Try changing your search or filters, or check back when more listings are available."}</p><button onClick={() => {setQuery("");setActiveCategory("All");setSavedOnly(false);setSelectedLocation("All locations");setSelectedCondition("Any condition");setSortOrder("recent");document.getElementById("explore")?.scrollIntoView({behavior:"smooth"});}}>{savedOnly && saved.length === 0 ? "Explore listings" : "Clear filters"}</button></div>}
        {listingLoadState === "loading" && <p className="demo-note" role="status">Loading approved listings…</p>}{listingLoadState === "error" && <div className="empty-state" role="alert"><h3>Listings are temporarily unavailable</h3><p>We could not connect to the marketplace. No example listings are being shown as real inventory.</p><button onClick={() => setListingReloadKey(value => value + 1)}>Try again</button></div>}{listingLoadState === "live" && visibleProducts.length === 0 && <p className="demo-note">No approved listings yet. Be the first to list something useful.</p>}
      </section>
      <section className="giveaway-section wrap" id="free"><div className="giveaway-card"><div><span className="eyebrow">One person's extra is another's treasure</span><h2>Good things, given freely.</h2><p>Find free items in your community or pass something useful along to someone who needs it.</p><button onClick={() => showNotice("Giveaway requests will be available after account and messaging setup.")}>Explore free finds ↗</button></div><div className="giveaway-symbol" aria-hidden="true">♡</div></div></section>
      <section className="services-section wrap" id="services"><div className="service-copy"><span className="eyebrow">Make room for what matters</span><h2>A little help<br/>clearing the clutter.</h2><p>Discover local decluttering and organising services to make your space feel like you again.</p><button className="outline-button" onClick={() => showNotice("Service provider profiles and booking will be built after the marketplace foundation.")}>Explore services ↗</button></div><div className="service-image"><img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85" alt="Calm, organised home interior"/></div></section>
      <section className="seller-cta wrap"><div><span className="eyebrow">Ready to pass it on?</span><h2>Your unused could be<br/>someone's next favourite.</h2><p>Make space. Earn a little. Keep good things moving.</p></div><button onClick={() => setListingFormOpen(true)}>Start selling <span>↗</span></button></section>
    </main>
    <footer className="footer"><div className="footer-inner"><a className="brand" href="#">aloko<span>.</span></a><p>Sell it. Give it. Pass it on.</p><span>© {new Date().getFullYear()} Aloko. Good things live on.</span></div></footer>
    {dashboardPreviewOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setDashboardPreviewOpen(false)}><section className="listing-modal dashboard-preview-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-preview-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close dashboard preview" onClick={() => setDashboardPreviewOpen(false)}>×</button><div className="listing-modal-content"><span className="eyebrow">ALOKO WORKSPACE CONCEPT</span><h2 id="dashboard-preview-title">Dashboard preview</h2><p className="listing-demo-note">Design preview only. This does not sign you in or show live account data.</p><label className="dashboard-role-picker">Preview account type<select value={dashboardPreviewRole} onChange={e => setDashboardPreviewRole(e.target.value)}><option value="buyer">Buyer</option><option value="seller">Individual seller</option><option value="business">Business / bulk distributor</option><option value="service_provider">Decluttering provider</option><option value="moderator">Moderator</option><option value="admin">Super admin</option></select></label><div className="dashboard-preview-welcome"><div><span className="eyebrow">GOOD TO SEE YOU</span><h3>{({buyer:"Your finds, in one place",seller:"Your selling workspace",business:"Your business hub",service_provider:"Your service workspace",moderator:"Moderation queue",admin:"Aloko Control Centre"})[dashboardPreviewRole]}</h3></div><span className="dashboard-avatar">{({buyer:"B",seller:"S",business:"B",service_provider:"P",moderator:"M",admin:"A"})[dashboardPreviewRole]}</span></div><div className="dashboard-preview-stats">{({buyer:[["Saved items","Your favourites"],["Messages","Seller enquiries"],["Requests","Giveaways & services"]],seller:[["Active listings","Manage items"],["Enquiries","Buyer messages"],["Listing credits","Available balance"]],business:[["Store listings","Products & stock"],["Enquiries","Customer leads"],["Promotion","Store visibility"]],service_provider:[["New requests","Quote requests"],["Bookings","Upcoming jobs"],["Profile views","Service reach"]],moderator:[["Pending reviews","Listings to check"],["Reports","Safety reports"],["Recent actions","Audit trail"]],admin:[["Users","Account management"],["Listings","Moderation overview"],["Platform fees","Payments & settings"]]})[dashboardPreviewRole].map(([title,sub])=><div className="dashboard-preview-stat" key={title}><strong>—</strong><span>{title}</span><small>{sub}</small></div>)}</div><div className="dashboard-preview-section"><h4>Workspace menu</h4><div className="dashboard-preview-menu">{({buyer:["Overview","Saved items","Messages","Giveaway requests","Service bookings","Profile & security"],seller:["Overview","My listings","Add item","Enquiries","My store","Listing credits","Promotions","Analytics","Settings"],business:["Overview","Product catalogue","Bulk listings","Storefront","Enquiries","Promotions","Sales insights","Team & settings"],service_provider:["Overview","Service profile","Quote requests","Bookings","Availability","Reviews","Payout arrangements","Settings"],moderator:["Review listings","Reports & safety","User restrictions","Payment records (read-only)","Credit adjustments (audited)","Promotion management"],admin:["Platform overview","Buyers & sellers","Listing moderation","Fees & credit packs","Promotions & content","Staff & permissions","Reports & audit logs","Security & platform settings"]})[dashboardPreviewRole].map(item=><div className="dashboard-preview-menu-item" key={item}><span>{item}</span><span aria-hidden="true">›</span></div>)}</div></div><button className="modal-contact-button account-submit" onClick={() => {setDashboardPreviewOpen(false);setAccountMode("login");setAccountModalOpen(true);}}>Continue to login</button></div></section></div>}
    {accountModalOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setAccountModalOpen(false)}><section className="listing-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close account dialog" onClick={() => setAccountModalOpen(false)}>×</button><div className="listing-modal-content account-modal-content"><span className="eyebrow">YOUR ALOKO ACCOUNT</span><h2 id="account-modal-title">{accountMode === "login" ? "Welcome back." : "Join Aloko."}</h2><p>{accountMode === "login" ? "Sign in to manage your listings and saved finds." : "Create an account to prepare for buying and selling on Aloko."}</p><div className="account-mode-switch" role="group" aria-label="Account action"><button type="button" className={accountMode === "login" ? "active" : ""} onClick={() => setAccountMode("login")}>Log in</button><button type="button" className={accountMode === "register" ? "active" : ""} onClick={() => setAccountMode("register")}>Create account</button></div><form className="listing-create-form" onSubmit={e => { e.preventDefault(); showNotice("Account access is not connected yet. No account was created and no password was sent."); }}><label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com"/></label>{accountMode === "register" && <><label>Your name<input type="text" required minLength="2" maxLength="80" autoComplete="name" placeholder="Full name"/></label><label>What brings you to Aloko?<select value={accountRole} onChange={e => setAccountRole(e.target.value)}><option value="buyer">Buyer — find and save items</option><option value="seller">Individual seller — list my items</option><option value="business">Business / bulk distributor</option><option value="service_provider">Decluttering service provider</option></select><span className="field-help">You can later request additional selling tools from your account.</span></label></>}<label>Password<input type="password" required minLength="8" autoComplete={accountMode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters"/></label>{accountMode === "register" && <label className="account-terms"><input type="checkbox" required/> I agree to Aloko’s terms and privacy policy.</label>}<p className="listing-demo-note">Account authentication is not connected yet. This form does not sign you in, create an account, or store your password. Admin and moderator access will be invite-only.</p><button type="submit" className="modal-contact-button account-submit">{accountMode === "login" ? "Log in" : "Create account"}</button></form><p className="account-switch-copy">{accountMode === "login" ? "New to Aloko?" : "Already have an account?"} <button type="button" className="inline-link-button" onClick={() => setAccountMode(accountMode === "login" ? "register" : "login")}>{accountMode === "login" ? "Create an account" : "Log in"}</button></p></div></section></div>}
    {listingFormOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setListingFormOpen(false)}><section className="listing-modal listing-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-listing-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close listing form" onClick={() => setListingFormOpen(false)}>×</button><div className="listing-modal-content listing-create-content"><span className="eyebrow">SELL ON ALOKO</span><h2 id="create-listing-title">Prepare your listing</h2><p className="listing-demo-note">Preview mode only. You can prepare a draft, but it will not be published or visible to buyers until seller accounts, photo uploads, and the marketplace backend are connected.</p><form ref={listingDraftForm} className="listing-create-form" onSubmit={e => { e.preventDefault(); const validation = validateListingDraft(listingDraft); if (!validation.valid) { showNotice(Object.values(validation.errors)[0]); return; } try { window.localStorage.setItem("aloko:listing-draft", JSON.stringify({...listingDraft, savedAt: new Date().toISOString()})); setLocalDraftExists(true); showNotice("Draft saved on this device only. It has not been published."); setListingFormOpen(false); } catch { showNotice("Could not save this draft in browser storage."); } }}><label>Item title<input required minLength="4" maxLength="90" value={listingDraft.title} onChange={e => setListingDraft(v => ({...v,title:e.target.value}))} placeholder="e.g. Wooden study desk"/><span className="field-help">Use at least 4 characters and describe the actual item.</span></label><label>Listing type<select value={listingDraft.kind} onChange={e => setListingDraft(v => ({...v,kind:e.target.value,price:e.target.value === "giveaway" ? "0" : v.price === "0" ? "" : v.price,category:e.target.value === "giveaway" ? "Free items" : v.category === "Free items" ? "Home & Living" : v.category}))}><option value="sale">For sale</option><option value="giveaway">Give away for free</option><option value="bulk">Bulk / wholesale</option></select></label><div className="listing-form-row"><label>{listingDraft.kind === "giveaway" ? "Price" : "Price (₦)"}<input required type="number" min={listingDraft.kind === "giveaway" ? "0" : "1"} max="999999999" step="1" inputMode="numeric" value={listingDraft.price} onChange={e => setListingDraft(v => ({...v,price:e.target.value}))} placeholder={listingDraft.kind === "giveaway" ? "0 — free" : "Enter amount"} readOnly={listingDraft.kind === "giveaway"}/><span className="field-help">{listingDraft.kind === "giveaway" ? "Giveaway listings are free; no item price is charged." : "Enter a whole amount greater than ₦0."}</span></label><label>Condition<select value={listingDraft.condition} onChange={e => setListingDraft(v => ({...v,condition:e.target.value}))}><option>New</option><option>Like new</option><option>Good</option><option>Fair</option><option>For parts</option></select></label></div><label>Category<select value={listingDraft.category} onChange={e => setListingDraft(v => ({...v,category:e.target.value}))}>{categories.filter(([,name]) => name !== "Services").map(([,name]) => <option key={name}>{name}</option>)}</select></label><div className="listing-form-row"><label>Quantity available<input required type="number" min="1" max="1000000" step="1" value={listingDraft.quantity} onChange={e => setListingDraft(v => ({...v,quantity:e.target.value}))}/><span className="field-help">For bulk listings, enter the number of units available.</span></label><label>Collection / delivery<select value={listingDraft.fulfillment} onChange={e => setListingDraft(v => ({...v,fulfillment:e.target.value}))}><option value="pickup">Pickup</option><option value="delivery">Delivery</option><option value="both">Pickup or delivery</option></select></label></div><label>Location<input required maxLength="80" value={listingDraft.place} onChange={e => setListingDraft(v => ({...v,place:e.target.value}))} placeholder="City or area"/></label><label>Description<textarea required minLength="10" maxLength="1200" rows="4" value={listingDraft.description} onChange={e => setListingDraft(v => ({...v,description:e.target.value}))} placeholder="Describe condition, size, what's included, and collection details"/><span className="field-help">At least 10 characters. Include condition, what's included, and collection details.</span></label><label>Photo preview <input ref={listingImageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file=e.target.files?.[0]; if(!file) return; if(!["image/jpeg","image/png","image/webp"].includes(file.type)){showNotice("Choose a JPG, PNG, or WebP image.");e.target.value="";return;} if(file.size>5*1024*1024){showNotice("Choose an image smaller than 5 MB.");e.target.value="";return;} const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==="string")setListingImagePreview(reader.result);};reader.onerror=()=>showNotice("Could not preview that image.");reader.readAsDataURL(file); }} /><span className="field-help">JPG, PNG, or WebP · up to 5 MB. Preview only; this photo is not uploaded or saved with your draft yet.</span></label>{listingImagePreview && <div className="draft-photo-preview"><img src={listingImagePreview} alt="Selected listing photo preview"/><button type="button" className="outline-button" onClick={() => { setListingImagePreview(""); if (listingImageInput.current) listingImageInput.current.value = ""; }}>Remove photo</button></div>}<div className="listing-create-actions">{localDraftExists && <button type="button" className="outline-button" onClick={() => { try { window.localStorage.removeItem("aloko:listing-draft"); setLocalDraftExists(false); setListingDraft({title:"",kind:"sale",price:"",category:"Home & Living",condition:"Good",quantity:"1",fulfillment:"pickup",place:"",description:""}); setListingImagePreview(""); if (listingImageInput.current) listingImageInput.current.value = ""; showNotice("Local draft deleted from this device."); } catch { showNotice("Could not delete the local draft."); } }}>Delete draft</button>}<button type="button" className="outline-button" onClick={() => setListingFormOpen(false)}>Cancel</button><button type="button" className="outline-button" onClick={() => { if (!listingDraftForm.current?.reportValidity()) return; const validation = validateListingDraft(listingDraft); if (!validation.valid) { showNotice(Object.values(validation.errors)[0]); return; } setDraftReviewOpen(true); }}>Review draft</button><button type="submit" className="modal-contact-button">Save local draft</button></div></form></div></section></div>}
    {draftReviewOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setDraftReviewOpen(false)}><section className="listing-modal draft-review-modal" role="dialog" aria-modal="true" aria-labelledby="draft-review-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close draft review" onClick={() => setDraftReviewOpen(false)}>×</button>{listingImagePreview && <img className="listing-modal-image" src={listingImagePreview} alt="Selected draft photo"/>}<div className="listing-modal-content"><span className="eyebrow">LOCAL DRAFT PREVIEW</span><h2 id="draft-review-title">{listingDraft.title.trim() || "Untitled item"}</h2><strong className="listing-modal-price">{listingDraft.kind === "giveaway" ? "Free" : listingDraft.price.trim() ? "₦"+Number(listingDraft.price).toLocaleString("en-NG") : "Price not entered"}</strong><div className="listing-modal-meta"><span>{listingDraft.kind === "giveaway" ? "Giveaway · Free" : listingDraft.kind === "bulk" ? "Bulk / wholesale" : "For sale"}</span><span>{listingDraft.condition}</span><span>{listingDraft.category}</span><span>Qty: {listingDraft.quantity || "Not entered"}</span><span>{listingDraft.fulfillment === "both" ? "Pickup or delivery" : listingDraft.fulfillment === "delivery" ? "Delivery" : "Pickup"}</span><span>⌖ {listingDraft.place.trim() || "Location not entered"}</span></div><p>{listingDraft.description.trim() || "No description entered yet."}</p><p className="listing-demo-note">This is a private preview of your draft on this device. It is not published, and the selected photo will not be saved with the draft.</p><div className="listing-modal-actions"><button className="modal-save-button" onClick={() => setDraftReviewOpen(false)}>Back to editing</button><button className="modal-contact-button" onClick={() => { setDraftReviewOpen(false); try { window.localStorage.setItem("aloko:listing-draft", JSON.stringify({...listingDraft,savedAt:new Date().toISOString()})); setLocalDraftExists(true); showNotice("Draft saved on this device only."); setListingFormOpen(false); } catch { showNotice("Could not save this draft in browser storage."); } }}>Save draft</button></div></div></section></div>}
    {selectedListing && <div className="listing-modal-backdrop" role="presentation" onClick={() => setSelectedListing(null)}><section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-modal-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close item details" onClick={() => setSelectedListing(null)}>×</button>{selectedListing.image ? <img className="listing-modal-image" src={`https://images.unsplash.com/${selectedListing.image}?auto=format&fit=crop&w=1000&q=85`} alt={selectedListing.title}/> : <div className="listing-modal-image product-image-placeholder" role="img" aria-label="No listing photo uploaded"><span>aloko.</span></div>}<div className="listing-modal-content"><span className="eyebrow">{selectedListing.live ? "LIVE LISTING" : "DEMO LISTING"} · {selectedListing.category}</span><h2 id="listing-modal-title">{selectedListing.title}</h2><strong className="listing-modal-price">{selectedListing.price}</strong><div className="listing-modal-meta"><span>{selectedListing.condition}</span><span>⌖ {selectedListing.place}</span></div><p>{selectedListing.description}</p><p className="listing-demo-note">{selectedListing.live ? `Listed by ${selectedListing.sellerName}. Confirm condition, collection, and final terms before arranging the handover.` : "Example content only. Seller details and availability have not been verified."}</p><div className="listing-modal-actions"><button className="modal-save-button" onClick={() => toggleSaved(selectedListing.id)}>{saved.includes(selectedListing.id) ? "♥ Saved" : "♡ Save item"}</button><button className="modal-contact-button" onClick={() => showNotice("Seller contact will be enabled after accounts and messaging are connected.")}>Contact seller ↗</button></div></div></section></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}

export default App;
