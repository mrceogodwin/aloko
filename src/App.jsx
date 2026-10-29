import { useEffect, useMemo, useRef, useState } from "react";
import { matchesListingQuery, sortListings, validateListingDraft } from "./marketplace.js";
import { PREVIEW_LISTINGS } from "./preview-listings.js";

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
      return Array.isArray(parsed) ? parsed.filter(id => typeof id === "string" || typeof id === "number") : [];
    } catch { return []; }
  });
  const noticeTimer = useRef(null);
  const [notice, setNotice] = useState("");
  const [selectedListing, setSelectedListing] = useState(null);
  const [listingFormOpen, setListingFormOpen] = useState(false);
  const [localDraftExists, setLocalDraftExists] = useState(() => {
    try { return Boolean(window.localStorage.getItem("aloko:listing-draft")); } catch { return false; }
  });
  const [listingDraft, setListingDraft] = useState({
    title: "", kind: "sale", price: "", category: "Home & Living", condition: "Good",
    quantity: "1", fulfillment: "pickup", place: "", description: ""
  });
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [accountRole, setAccountRole] = useState("buyer");

  useEffect(() => {
    const controller = new AbortController();
    setListingLoadState("loading");
    fetch("/api/listings?limit=48", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error("unavailable"); return r.json(); })
      .then(payload => {
        if (!Array.isArray(payload.items)) throw new Error("invalid");
        const live = payload.items.map(normalizeLiveListing);
        if (live.length === 0) {
          setLiveProducts(PREVIEW_LISTINGS);
          setListingLoadState("preview");
        } else {
          setLiveProducts(live);
          setListingLoadState("live");
        }
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          setLiveProducts(PREVIEW_LISTINGS);
          setListingLoadState("preview");
        }
      });
    return () => controller.abort();
  }, [listingReloadKey]);

  useEffect(() => {
    try { window.localStorage.setItem("aloko:saved-items", JSON.stringify(saved)); } catch { /* private mode */ }
  }, [saved]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const products = liveProducts ?? [];
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
    showNotice(saved.includes(id) ? "Removed from saved." : "Saved on this device.");
  };

  return (
    <div className="app-shell">
      <header className="topbar"><div className="nav-inner">
        <a className="brand" href="#" aria-label="Aloko home">aloko<span>.</span></a>
        <nav className="desktop-nav" aria-label="Main">
          <a href="#explore">Explore</a><a href="#free">Free finds</a><a href="#services">Services</a>
        </nav>
        <div className="nav-actions">
          <div className="nav-account-actions">
            <button className="text-button" onClick={() => { setAccountMode("login"); setAccountModalOpen(true); }}>Log in</button>
            <button className="account-create-button" onClick={() => { setAccountMode("register"); setAccountModalOpen(true); }}>Create account</button>
          </div>
          <div className="nav-primary-actions">
            <button className="mobile-saved-toggle" aria-pressed={savedOnly} onClick={() => { setSavedOnly(v => !v); setActiveCategory("All"); }}>
              {savedOnly ? "Browse all" : `Saved (${saved.length})`}
            </button>
            {localDraftExists && <button className="resume-draft-button" onClick={() => setListingFormOpen(true)}>Continue draft</button>}
            <button className="post-button" onClick={() => setListingFormOpen(true)}>Sell an item</button>
          </div>
        </div>
      </div></header>

      <main>
        <section className="hero"><div className="hero-copy">
          <span className="eyebrow">A more thoughtful marketplace</span>
          <h1>Good things deserve<br/><em>another life.</em></h1>
          <p>Find pre-loved treasures across Nigeria, pass on what you no longer need, and give good things a second home.</p>
          <form className="search-bar" onSubmit={e => { e.preventDefault(); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search phones, furniture, free finds…" aria-label="Search listings"/>
            <button type="submit">Search</button>
          </form>
        </div></section>

        <section className="category-section wrap" id="explore">
          <div className="section-heading">
            <div><span className="eyebrow">Find your next favourite</span><h2>Explore categories</h2></div>
            <button className="view-all" onClick={() => { setActiveCategory("All"); setQuery(""); setSavedOnly(false); }}>View all</button>
          </div>
          <div className="category-grid">
            {categories.map(([icon, name]) => (
              <button key={name} className={activeCategory === name ? "category active" : "category"} onClick={() => {
                setSavedOnly(false);
                if (name === "Services") document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
                else setActiveCategory(name);
              }}>
                <span className="category-icon">{icon}</span><span>{name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="listings-section wrap">
          <div className="section-heading">
            <div><span className="eyebrow">A second chance at something good</span>
              <h2>{savedOnly ? "Your saved items" : query ? "Search results" : activeCategory === "All" ? "Freshly listed" : activeCategory}</h2>
            </div>
            <span className="listing-count">
              {listingLoadState === "live" ? `${visibleProducts.length} live listings`
                : listingLoadState === "preview" ? `${visibleProducts.length} preview items`
                : listingLoadState === "loading" ? "Loading…" : "Unavailable"}
            </span>
          </div>

          {listingLoadState === "preview" && (
            <p className="preview-banner" role="status">
              Preview catalogue — sample Nigerian listings so you can feel the product. These are <strong>not</strong> live inventory.
            </p>
          )}

          <div className="product-grid">
            {visibleProducts.map(p => (
              <article className="product-card" key={p.id}>
                <div className="product-image">
                  {p.image
                    ? <img src={`https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=700&q=80`} alt={p.title} loading="lazy"/>
                    : <div className="product-image-placeholder" role="img" aria-label="No photo"><span>aloko.</span></div>}
                  <span className="condition">{p.kind === "giveaway" ? "Free giveaway" : p.condition}</span>
                  <button className={saved.includes(p.id) ? "save saved" : "save"} aria-label="Save" onClick={() => toggleSaved(p.id)}>{saved.includes(p.id) ? "♥" : "♡"}</button>
                </div>
                <div className="product-info">
                  <span className="product-place">⌖ {p.place}</span>
                  <h3>{p.title}</h3>
                  <div className="product-bottom">
                    <strong>{p.price}</strong>
                    <button onClick={() => setSelectedListing(p)}>View item</button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {listingLoadState === "loading" && <p className="demo-note">Loading approved listings…</p>}
          {listingLoadState === "live" && visibleProducts.length === 0 && <p className="demo-note">No approved listings yet.</p>}
        </section>

        <section className="giveaway-section wrap" id="free">
          <div className="giveaway-card">
            <div>
              <span className="eyebrow">One person's extra is another's treasure</span>
              <h2>Good things, given freely.</h2>
              <button onClick={() => { setSavedOnly(false); setActiveCategory("Free items"); document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" }); }}>Explore free finds</button>
            </div>
          </div>
        </section>

        <section className="services-section wrap" id="services">
          <div className="service-copy">
            <span className="eyebrow">Make room for what matters</span>
            <h2>A little help clearing the clutter.</h2>
            <p>Local decluttering and organising services — coming after marketplace foundation.</p>
          </div>
        </section>

        <section className="seller-cta wrap">
          <div>
            <span className="eyebrow">Ready to pass it on?</span>
            <h2>Your unused could be someone's next favourite.</h2>
          </div>
          <button onClick={() => setListingFormOpen(true)}>Start selling</button>
        </section>
      </main>

      <footer className="footer"><div className="footer-inner">
        <a className="brand" href="#">aloko<span>.</span></a>
        <p>Sell it. Give it. Pass it on.</p>
        <span>© {new Date().getFullYear()} Aloko</span>
      </div></footer>

      {accountModalOpen && (
        <div className="listing-modal-backdrop" onClick={() => setAccountModalOpen(false)}>
          <section className="listing-modal account-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="listing-modal-close" onClick={() => setAccountModalOpen(false)}>×</button>
            <div className="listing-modal-content">
              <h2>{accountMode === "login" ? "Welcome back." : "Join Aloko."}</h2>
              <p className="listing-demo-note">Authentication is not connected yet. This form does not create an account or store passwords.</p>
              <form className="listing-create-form" onSubmit={e => { e.preventDefault(); showNotice("Account access is not connected yet."); }}>
                <label>Email<input type="email" required placeholder="you@example.com"/></label>
                <label>Password<input type="password" required minLength={8}/></label>
                <button type="submit" className="modal-contact-button">{accountMode === "login" ? "Log in" : "Create account"}</button>
              </form>
            </div>
          </section>
        </div>
      )}

      {listingFormOpen && (
        <div className="listing-modal-backdrop" onClick={() => setListingFormOpen(false)}>
          <section className="listing-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="listing-modal-close" onClick={() => setListingFormOpen(false)}>×</button>
            <div className="listing-modal-content">
              <h2>List an item</h2>
              <p className="listing-demo-note">Drafts save on this device only until seller login is connected.</p>
              <form className="listing-create-form" onSubmit={e => {
                e.preventDefault();
                const validation = validateListingDraft(listingDraft);
                if (!validation.valid) { showNotice(Object.values(validation.errors)[0]); return; }
                try {
                  window.localStorage.setItem("aloko:listing-draft", JSON.stringify({ ...listingDraft, savedAt: new Date().toISOString() }));
                  setLocalDraftExists(true);
                  showNotice("Draft saved on this device only. Publishing needs sign-in.");
                  setListingFormOpen(false);
                } catch { showNotice("Could not save draft."); }
              }}>
                <label>Title<input required minLength={4} value={listingDraft.title} onChange={e => setListingDraft(v => ({ ...v, title: e.target.value }))}/></label>
                <label>Price (₦)<input type="number" min={0} value={listingDraft.price} onChange={e => setListingDraft(v => ({ ...v, price: e.target.value }))}/></label>
                <label>Location<input required value={listingDraft.place} onChange={e => setListingDraft(v => ({ ...v, place: e.target.value }))} placeholder="City, State"/></label>
                <label>Description<textarea required minLength={10} value={listingDraft.description} onChange={e => setListingDraft(v => ({ ...v, description: e.target.value }))} rows={3}/></label>
                <button type="submit" className="modal-contact-button">Save draft</button>
              </form>
            </div>
          </section>
        </div>
      )}

      {selectedListing && (
        <div className="listing-modal-backdrop" onClick={() => setSelectedListing(null)}>
          <section className="listing-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="listing-modal-close" onClick={() => setSelectedListing(null)}>×</button>
            <div className="listing-modal-content">
              <span className="eyebrow">{selectedListing.preview ? "PREVIEW" : selectedListing.live ? "LIVE" : "LISTING"} · {selectedListing.category}</span>
              <h2>{selectedListing.title}</h2>
              <strong className="listing-modal-price">{selectedListing.price}</strong>
              <p>{selectedListing.description}</p>
              <p className="listing-demo-note">
                {selectedListing.preview
                  ? `Preview sample by ${selectedListing.sellerName}. Not a real listing.`
                  : `Listed by ${selectedListing.sellerName}.`}
              </p>
              <div className="listing-modal-actions">
                <button className="modal-save-button" onClick={() => toggleSaved(selectedListing.id)}>{saved.includes(selectedListing.id) ? "Saved" : "Save"}</button>
                <button className="modal-contact-button" onClick={() => showNotice("Messaging is not connected yet.")}>Contact seller</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

export default App;
