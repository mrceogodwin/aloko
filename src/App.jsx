import { useEffect, useMemo, useRef, useState } from "react";
import { matchesListingQuery, sortListings, validateListingDraft } from "./marketplace.js";

// Restored production UI. Detail-API enrichment can be re-added after auth wiring.
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
    try { window.localStorage.setItem("aloko:saved-items", JSON.stringify(saved)); } catch { /* private mode */ }
  }, [saved]);
  useEffect(() => () => { if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current); }, []);
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
  const listingImageInput = useRef(null);

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
    } catch { setLocalDraftExists(false); }
  }, [listingFormOpen]);

  useEffect(() => {
    const anyDialogOpen = selectedListing || listingFormOpen || draftReviewOpen || accountModalOpen;
    if (!anyDialogOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key !== "Escape") return;
      if (draftReviewOpen) setDraftReviewOpen(false);
      else if (accountModalOpen) setAccountModalOpen(false);
      else if (listingFormOpen) setListingFormOpen(false);
      else if (selectedListing) setSelectedListing(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedListing, listingFormOpen, draftReviewOpen, accountModalOpen]);

  const filtered = useMemo(() => products.filter(p =>
    (activeCategory === "All" || (activeCategory === "Free items" ? p.kind === "giveaway" : p.category === activeCategory)) &&
    (selectedLocation === "All locations" || p.place === selectedLocation) &&
    (selectedCondition === "Any condition" || p.condition === selectedCondition) &&
    (!savedOnly || saved.includes(p.id)) &&
    matchesListingQuery(p, query)
  ), [query, activeCategory, selectedLocation, selectedCondition, savedOnly, saved, products]);

  const visibleProducts = useMemo(() => sortListings(filtered, sortOrder, products), [filtered, sortOrder, products]);

  const showNotice = (message) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => { setNotice(""); noticeTimer.current = null; }, 2800);
  };
  const toggleSaved = (id) => {
    setSaved(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
    showNotice(saved.includes(id) ? "Item removed from your saved list." : "Item saved on this device.");
  };

  const openListing = async (listing) => {
    setSelectedListing(listing);
    if (!listing?.live || !listing?.id) return;
    try {
      const response = await fetch(`/api/listings-detail?id=${encodeURIComponent(listing.id)}`, { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload?.item) return;
      const detailed = normalizeLiveListing(payload.item);
      setSelectedListing(current => (current && current.id === detailed.id ? { ...current, ...detailed, live: true } : current));
    } catch { /* keep card data */ }
  };

  return (
    <div className="app-shell">
      <header className="topbar"><div className="nav-inner">
        <a className="brand" href="#" aria-label="Aloko home">aloko<span>.</span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#explore">Explore</a><a href="#free">Free finds</a><a href="#services">Services</a>
          <button className="nav-link-button" onClick={() => { setSavedOnly(v => !v); setActiveCategory("All"); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>{savedOnly ? "All items" : `Saved (${saved.length})`}</button>
        </nav>
        <div className="nav-actions">
          <div className="nav-account-actions">
            <button className="text-button" onClick={() => { setAccountMode("login"); setAccountModalOpen(true); }}>Log in</button>
            <button className="account-create-button" onClick={() => { setAccountMode("register"); setAccountModalOpen(true); }}>Create account</button>
          </div>
          <div className="nav-primary-actions">
            <button className="mobile-saved-toggle" aria-pressed={savedOnly} onClick={() => { setSavedOnly(v => !v); setActiveCategory("All"); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>{savedOnly ? "Browse all" : `Saved items (${saved.length})`}</button>
            {localDraftExists && <button className="resume-draft-button" onClick={() => setListingFormOpen(true)}>Continue draft</button>}
            <button className="post-button" onClick={() => setListingFormOpen(true)}>Sell an item</button>
          </div>
        </div>
      </div></header>
      <main>
        <section className="hero"><div className="hero-copy">
          <span className="eyebrow">A more thoughtful marketplace</span>
          <h1>Good things deserve<br/><em>another life.</em></h1>
          <p>Find pre-loved treasures, pass on what you no longer need, and give good things a second home.</p>
          <form className="search-bar" onSubmit={e => { e.preventDefault(); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="What are you looking for?" aria-label="Search listings"/>
            <button type="submit">Search</button>
          </form>
          <div className="hero-note"><span>✓</span> Discover finds near you <span>·</span> Give items a second life</div>
        </div></section>
        <section className="category-section wrap" id="explore">
          <div className="section-heading"><div><span className="eyebrow">Find your next favourite</span><h2>Explore categories</h2></div>
            <button className="view-all" onClick={() => { setActiveCategory("All"); setQuery(""); setSavedOnly(false); setSelectedLocation("All locations"); setSelectedCondition("Any condition"); setSortOrder("recent"); }}>View all ↗</button>
          </div>
          <div className="category-grid">{categories.map(([icon, name]) => (
            <button key={name} className={activeCategory === name ? "category active" : "category"} onClick={() => {
              setSavedOnly(false);
              if (name === "Services") { setActiveCategory("All"); document.getElementById("services")?.scrollIntoView({ behavior: "smooth" }); }
              else { setActiveCategory(name); if (name === "Free items") document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }
            }}><span className="category-icon">{icon}</span><span>{name}</span><span className="category-arrow">↗</span></button>
          ))}</div>
        </section>
        <section className="listings-section wrap">
          <div className="section-heading"><div><span className="eyebrow">A second chance at something good</span>
            <h2>{savedOnly ? "Your saved items" : query ? "Search results" : activeCategory === "All" ? "Freshly listed" : activeCategory}</h2></div>
            <div className="listing-tools">
              <label className="sort-control">Condition <select value={selectedCondition} onChange={e => setSelectedCondition(e.target.value)} aria-label="Filter by item condition"><option>Any condition</option>{[...new Set(products.map(p => p.condition).filter(v => v && v !== "Condition not specified"))].sort().map(c => <option key={c} value={c}>{c}</option>)}</select></label>
              <label className="sort-control">Location <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} aria-label="Filter by location"><option>All locations</option>{[...new Set(products.map(p => p.place).filter(Boolean))].sort().map(place => <option key={place} value={place}>{place}</option>)}</select></label>
              <label className="sort-control">Sort <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} aria-label="Sort listings"><option value="recent">Recently added</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
              <span className="listing-count">{listingLoadState === "live" ? `${visibleProducts.length} live listings` : listingLoadState === "loading" ? "Loading listings" : "Marketplace unavailable"}</span>
            </div>
          </div>
          <div className="product-grid">{visibleProducts.map(p => (
            <article className="product-card" key={p.id}>
              <div className="product-image">
                {p.image ? <img src={`https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=700&q=80`} alt={p.title}/> : <div className="product-image-placeholder" role="img" aria-label="No listing photo uploaded"><span>aloko.</span></div>}
                <span className="condition">{p.kind === "giveaway" ? "Free giveaway" : p.condition}</span>
                <button className={saved.includes(p.id) ? "save saved" : "save"} aria-label={saved.includes(p.id) ? "Remove from saved" : "Save item"} onClick={() => toggleSaved(p.id)}>{saved.includes(p.id) ? "♥" : "♡"}</button>
              </div>
              <div className="product-info">
                <span className="product-place">⌖ {p.place}</span>
                <h3>{p.title}</h3>
                <div className="product-bottom"><strong>{p.price}</strong><button onClick={() => openListing(p)}>View item ↗</button></div>
              </div>
            </article>
          ))}</div>
          {filtered.length === 0 && <div className="empty-state"><span>{savedOnly && saved.length === 0 ? "♡" : "⌕"}</span><h3>{savedOnly && saved.length === 0 ? "Your saved list is waiting" : savedOnly ? "No saved items match these filters" : "No matches just yet"}</h3><p>{savedOnly && saved.length === 0 ? "Tap the heart on any item to keep it here for later. Saved items stay on this device." : "Try changing your search or filters, or check back when more listings are available."}</p><button onClick={() => { setQuery(""); setActiveCategory("All"); setSavedOnly(false); setSelectedLocation("All locations"); setSelectedCondition("Any condition"); setSortOrder("recent"); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>{savedOnly && saved.length === 0 ? "Explore listings" : "Clear filters"}</button></div>}
          {listingLoadState === "loading" && <p className="demo-note" role="status">Loading approved listings…</p>}
          {listingLoadState === "error" && <div className="empty-state" role="alert"><h3>Listings are temporarily unavailable</h3><p>We could not connect to the marketplace. No example listings are being shown as real inventory.</p><button onClick={() => setListingReloadKey(v => v + 1)}>Try again</button></div>}
          {listingLoadState === "live" && visibleProducts.length === 0 && <p className="demo-note">No approved listings yet. Be the first to list something useful.</p>}
        </section>
        <section className="giveaway-section wrap" id="free"><div className="giveaway-card"><div><span className="eyebrow">One person's extra is another's treasure</span><h2>Good things, given freely.</h2><p>Find free items in your community or pass something useful along to someone who needs it.</p><button onClick={() => { setSavedOnly(false); setActiveCategory("Free items"); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>Explore free finds ↗</button></div><div className="giveaway-symbol" aria-hidden="true">♡</div></div></section>
        <section className="services-section wrap" id="services"><div className="service-copy"><span className="eyebrow">Make room for what matters</span><h2>A little help<br/>clearing the clutter.</h2><p>Discover local decluttering and organising services to make your space feel like you again.</p><button className="outline-button" onClick={() => showNotice("Service provider profiles and booking will be built after the marketplace foundation.")}>Explore services ↗</button></div></section>
        <section className="seller-cta wrap"><div><span className="eyebrow">Ready to pass it on?</span><h2>Your unused could be<br/>someone's next favourite.</h2><p>Make space. Earn a little. Keep good things moving.</p></div><button onClick={() => setListingFormOpen(true)}>Start selling <span>↗</span></button></section>
      </main>
      <footer className="footer"><div className="footer-inner"><a className="brand" href="#">aloko<span>.</span></a><p>Sell it. Give it. Pass it on.</p><span>© {new Date().getFullYear()} Aloko. Good things live on.</span></div></footer>

      {accountModalOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setAccountModalOpen(false)}><section className="listing-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close account dialog" onClick={() => setAccountModalOpen(false)}>×</button><div className="listing-modal-content account-modal-content"><span className="eyebrow">YOUR ALOKO ACCOUNT</span><h2 id="account-modal-title">{accountMode === "login" ? "Welcome back." : "Join Aloko."}</h2><p>{accountMode === "login" ? "Sign in to manage your listings and saved finds." : "Create an account to prepare for buying and selling on Aloko."}</p><div className="account-mode-switch" role="group" aria-label="Account action"><button type="button" className={accountMode === "login" ? "active" : ""} onClick={() => setAccountMode("login")}>Log in</button><button type="button" className={accountMode === "register" ? "active" : ""} onClick={() => setAccountMode("register")}>Create account</button></div><form className="listing-create-form" onSubmit={e => { e.preventDefault(); showNotice("Account access is not connected yet. No account was created and no password was sent."); }}><label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com"/></label>{accountMode === "register" && <><label>Your name<input type="text" required minLength="2" maxLength="80" autoComplete="name" placeholder="Full name"/></label><label>What brings you to Aloko?<select value={accountRole} onChange={e => setAccountRole(e.target.value)}><option value="buyer">Buyer — find and save items</option><option value="seller">Individual seller — list my items</option><option value="business">Business / bulk distributor</option><option value="service_provider">Decluttering service provider</option></select></label></>}<label>Password<input type="password" required minLength="8" autoComplete={accountMode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters"/></label>{accountMode === "register" && <label className="account-terms"><input type="checkbox" required/> I agree to Aloko’s terms and privacy policy.</label>}<p className="listing-demo-note">Account authentication is not connected yet. This form does not sign you in, create an account, or store your password.</p><button type="submit" className="modal-contact-button account-submit">{accountMode === "login" ? "Log in" : "Create account"}</button></form></div></section></div>}

      {listingFormOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setListingFormOpen(false)}><section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-form-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close listing form" onClick={() => setListingFormOpen(false)}>×</button><div className="listing-modal-content"><span className="eyebrow">SELL ON ALOKO</span><h2 id="listing-form-title">List an item</h2><p>Drafts save on this device only until authentication is connected.</p><form className="listing-create-form" onSubmit={e => { e.preventDefault(); const validation = validateListingDraft(listingDraft); if (!validation.valid) { showNotice(Object.values(validation.errors)[0]); return; } try { window.localStorage.setItem("aloko:listing-draft", JSON.stringify({ ...listingDraft, savedAt: new Date().toISOString() })); setLocalDraftExists(true); showNotice("Draft saved on this device only. Publishing requires sign-in (auth not connected yet)."); setListingFormOpen(false); } catch { showNotice("Could not save this draft in browser storage."); } }}><label>Item title<input required minLength="4" maxLength="90" value={listingDraft.title} onChange={e => setListingDraft(v => ({ ...v, title: e.target.value }))} placeholder="e.g. Wooden study desk"/></label><label>Listing type<select value={listingDraft.kind} onChange={e => setListingDraft(v => ({ ...v, kind: e.target.value, price: e.target.value === "giveaway" ? "0" : v.price, category: e.target.value === "giveaway" ? "Free items" : v.category }))}><option value="sale">Sale</option><option value="giveaway">Giveaway</option><option value="bulk">Bulk</option></select></label><label>Price (₦)<input type="number" min="0" value={listingDraft.price} onChange={e => setListingDraft(v => ({ ...v, price: e.target.value }))} disabled={listingDraft.kind === "giveaway"}/></label><label>Category<select value={listingDraft.category} onChange={e => setListingDraft(v => ({ ...v, category: e.target.value }))}>{["Home & Living", "Phones & Tech", "Fashion", "Appliances", "Furniture", "Books & Hobbies", "Free items"].map(c => <option key={c}>{c}</option>)}</select></label><label>Condition<select value={listingDraft.condition} onChange={e => setListingDraft(v => ({ ...v, condition: e.target.value }))}>{["New", "Like new", "Good", "Fair", "For parts"].map(c => <option key={c}>{c}</option>)}</select></label><label>Quantity<input type="number" min="1" value={listingDraft.quantity} onChange={e => setListingDraft(v => ({ ...v, quantity: e.target.value }))}/></label><label>Location<input required minLength="2" maxLength="80" value={listingDraft.place} onChange={e => setListingDraft(v => ({ ...v, place: e.target.value }))} placeholder="City, State"/></label><label>Description<textarea required minLength="10" maxLength="1200" value={listingDraft.description} onChange={e => setListingDraft(v => ({ ...v, description: e.target.value }))} rows={4}/></label><p className="listing-demo-note">Photos and live publishing require authentication and storage (not connected yet).</p><button type="submit" className="modal-contact-button">Save draft on this device</button></form></div></section></div>}

      {selectedListing && <div className="listing-modal-backdrop" role="presentation" onClick={() => setSelectedListing(null)}><section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-modal-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close item details" onClick={() => setSelectedListing(null)}>×</button><div className="listing-modal-content"><span className="eyebrow">{selectedListing.live ? "LIVE LISTING" : "LISTING"} · {selectedListing.category}</span><h2 id="listing-modal-title">{selectedListing.title}</h2><strong className="listing-modal-price">{selectedListing.price}</strong><div className="listing-modal-meta"><span>{selectedListing.condition}</span><span>⌖ {selectedListing.place}</span></div><p>{selectedListing.description}</p><p className="listing-demo-note">{selectedListing.live ? `Listed by ${selectedListing.sellerName}. Confirm condition and handover terms directly with the seller.` : "Listing details unavailable."}</p><div className="listing-modal-actions"><button className="modal-save-button" onClick={() => toggleSaved(selectedListing.id)}>{saved.includes(selectedListing.id) ? "♥ Saved" : "♡ Save item"}</button><button className="modal-contact-button" onClick={() => showNotice("Messaging is not connected yet. Stay safe arranging in-person handovers.")}>Contact seller ↗</button></div></div></section></div>}

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

export default App;
