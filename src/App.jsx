import { useEffect, useMemo, useRef, useState } from "react";
import { matchesListingQuery, sortListings, validateListingDraft } from "./marketplace.js";
import { hasAccessToken, openConversation } from "./api-client.js";

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
    title: "", price: "", place: "", description: "", kind: "sale", category: "Home & Living", condition: "Good", quantity: "1", fulfillment: "pickup"
  });
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [accountRole, setAccountRole] = useState("buyer");

  useEffect(() => {
    const controller = new AbortController();
    setListingLoadState("loading");
    fetch("/api/listings?limit=24", { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error("unavailable"); return r.json(); })
      .then(payload => {
        if (!payload || !Array.isArray(payload.items)) throw new Error("bad payload");
        const live = payload.items.map(normalizeLiveListing);
        setLiveProducts(live);
        setListingLoadState("live");
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          setLiveProducts([]);
          setListingLoadState("error");
        }
      });
    return () => controller.abort();
  }, [listingReloadKey]);

  useEffect(() => {
    try { window.localStorage.setItem("aloko:saved-items", JSON.stringify(saved)); } catch {}
  }, [saved]);

  // Prevent delayed toast updates after the application unmounts.
  useEffect(() => () => {
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = null;
    }
  }, []);

  const products = liveProducts ?? [];
  const filtered = useMemo(() => products.filter(p =>
    matchesListingQuery(p, query) &&
    (activeCategory === "All" ||
      (activeCategory === "Free items" ? p.kind === "giveaway" :
        activeCategory === "Services" ? false : p.category === activeCategory)) &&
    (!savedOnly || saved.includes(p.id)) &&
    (selectedLocation === "All locations" || (p.place && p.place.includes(selectedLocation.replace("All locations", "").trim())) || selectedLocation === "All locations") &&
    (selectedCondition === "Any condition" || p.condition === selectedCondition)
  ), [products, query, activeCategory, savedOnly, saved, selectedLocation, selectedCondition]);
  const visibleProducts = useMemo(() => sortListings(filtered, sortOrder, products), [filtered, sortOrder, products]);

  const showNotice = (message) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
  };

  const toggleSaved = (id) => {
    setSaved(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
    showNotice(saved.includes(id) ? "Removed from saved." : "Saved on this device.");
  };

  return (
    <div className="app-shell">
      <header className="topbar flagship-topbar">
        <div className="wrap topbar-inner">
          <a className="brand flagship-brand" href="#top" aria-label="Aloko home">
            <span className="brand-mark" aria-hidden="true">A</span><span className="brand-text">Aloko</span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a className="nav-current" href="#top">Home</a><a href="#explore">Browse</a><a href="#categories">Categories</a><a href="#free">Free Items</a><a href="#bulk">Bulk Deals</a><a href="#services">Services</a>
          </nav>
          <nav className="nav-actions" aria-label="Account">
            <button type="button" className="nav-search-icon" aria-label="Focus search" onClick={() => document.querySelector(".hero-search input")?.focus()}>⌕</button>
            <button type="button" className="ghost-button" onClick={() => { setAccountMode("login"); setAccountModalOpen(true); }}>Login</button>
            <button type="button" className="account-create-button" onClick={() => { setAccountMode("signup"); setAccountModalOpen(true); }}>Create Account</button>
            <button className="mobile-saved-toggle" aria-pressed={savedOnly} onClick={() => { setSavedOnly(v => !v); setActiveCategory("All"); }}>{savedOnly ? "Browse all" : `Saved (${saved.length})`}</button>
            <button className="post-button" onClick={() => setListingFormOpen(true)}>Start Selling</button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero flagship-hero" id="top">
          <div className="hero-inner wrap">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow">Nigeria’s reuse marketplace</span>
              <h1>Sell It. <em>Give It.</em><br/><span>Pass It On.</span></h1>
              <p>Buy and sell pre-owned items, give usable things away for free, discover bulk deals, or book decluttering services — all in one place.</p>
              <div className="hero-actions">
                <button className="hero-primary" onClick={() => setListingFormOpen(true)}>♢ &nbsp; Start Selling <span>→</span></button>
                <button className="hero-secondary" onClick={() => document.getElementById("explore")?.scrollIntoView({behavior:"smooth"})}>Browse Listings <span>→</span></button>
              </div>
              <div className="hero-trust"><span>✦ Safe &amp; verified community</span><span>▣ Free &amp; paid listings</span><span>◉ Support local sustainability</span></div>
            </div>
            <div className="hero-art" aria-label="Aloko marketplace app preview">
              <div className="hero-orb orb-left">♧<b>Good Things<br/>Live Longer</b></div>
              <div className="hero-ribbon ribbon-one"></div><div className="hero-ribbon ribbon-two"></div>
              <div className="hero-phone"><div className="phone-notch"></div><div className="phone-brand"><span>A</span> Aloko</div><div className="phone-search">⌕ &nbsp; Search for anything…</div><div className="phone-cats"><span>▣<small>Electronics</small></span><span>♧<small>Fashion</small></span><span>⌂<small>Home &amp; Living</small></span><span>♡<small>Free Items</small></span><span>♧<small>Bulk Deals</small></span><span>✧<small>Services</small></span></div><div className="phone-feature"><b>Give Things<br/>A New Home</b><span>↗</span></div></div>
              <div className="hero-orb orb-right">Same items,<br/> brighter futures!</div>
            </div>
          </div>
        </section>
        <section className="search-dock wrap" aria-label="Search marketplace">
          <div className="hero-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for items, categories or locations…" aria-label="Search listings"/><label>⌖ <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}><option>All locations</option><option>Lagos</option><option>Abuja</option><option>Port Harcourt</option><option>Benin City</option></select></label><button type="button" onClick={() => document.getElementById("explore")?.scrollIntoView({behavior:"smooth"})}>⌕ &nbsp; Search</button></div>
        </section>

        <section className="categories wrap flagship-categories" id="categories" aria-label="Categories">
          <div className="section-head">
            <h2>Explore categories</h2>
            <button className="view-all" onClick={() => { setActiveCategory("All"); setQuery(""); setSavedOnly(false); }}>View all</button>
          </div>
          <div className="category-row">
            {categories.map(([icon, label]) => (
              <button
                key={label}
                className={activeCategory === label ? "category-chip active" : "category-chip"}
                onClick={() => {
                setSavedOnly(false);
                setActiveCategory(label);
                document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
              }}
              >
                <span className="category-icon" aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="listings wrap" id="explore">
          <div className="section-head">
            <h2>
              {listingLoadState === "live" ? "Featured Listings"
                : listingLoadState === "error" ? "Listings temporarily unavailable"
                : "Loading listings…"}
            </h2>
            <button className="view-all" type="button" onClick={() => setListingReloadKey(k => k + 1)}>Refresh</button>
          </div>

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
          {listingLoadState === "live" && visibleProducts.length === 0 && (
            <p className="demo-note">No approved listings match your search yet. Check back soon or try another category.</p>
          )}
          {listingLoadState === "error" && (
            <div className="demo-note" role="alert">
              We couldn't load marketplace listings. Please try again.
              <button type="button" className="view-all" onClick={() => setListingReloadKey(k => k + 1)}>Retry</button>
            </div>
          )}
        </section>

        <section className="giveaway-section wrap" id="free">
          <div className="giveaway-card flagship-giveaway">
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

        <section className="seller-cta wrap flagship-seller-cta">
          <div>
            <span className="eyebrow">Ready to pass it on?</span>
            <h2>List something in minutes.</h2>
            <p>{localDraftExists ? "You have a draft saved on this device." : "Draft on this device first — publishing needs seller sign-in."}</p>
            <button className="post-button" onClick={() => setListingFormOpen(true)}>Sell an item</button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <span>© {new Date().getFullYear()} Aloko</span>
          <span>Sell it. Give it. Pass it on.</span>
        </div>
      </footer>

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
                <button className="modal-contact-button" onClick={async () => {
                  if (selectedListing.preview) {
                    showNotice("Preview items cannot be messaged.");
                    return;
                  }
                  if (!selectedListing.live) {
                    showNotice("Messaging is only available on live listings.");
                    return;
                  }
                  if (!hasAccessToken()) {
                    showNotice("Sign in is required to message a seller.");
                    setAccountMode("login");
                    setAccountModalOpen(true);
                    return;
                  }
                  showNotice("Opening conversation…");
                  const result = await openConversation(selectedListing.id);
                  if (result.ok) {
                    showNotice("Conversation ready. Inbox UI ships next.");
                  } else if (result.status === 401) {
                    showNotice("Sign in is required to message a seller.");
                    setAccountModalOpen(true);
                  } else {
                    showNotice(result.data?.error || "Could not start conversation.");
                  }
                }}>Contact seller</button>
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
