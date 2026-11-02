import React from "react";

const asset = (name) => `/assets/aloko/${name}`;
const categoryTiles = [
  ["Electronics","cat-electronics.png","Electronics"],
  ["Furniture","cat-furniture.png","Furniture"],
  ["Fashion","cat-fashion.png","Fashion"],
  ["Home & Living","cat-home-living.png","Home & Living"],
  ["Sports","cat-sports.png","Sports"],
  ["Kids","cat-kids.png","Kids"],
  ["Auto","cat-auto.png","Auto"],
  ["More","cat-more.png","More"],
];
const demoPhotos = [
  ["iphone","listing-iphone.png"],
  ["sofa","listing-sofa.png"],
  ["macbook","listing-macbook.png"],
  ["fridge","listing-fridge.png"],
];

function Icon({ name, filled = false }) {
  const paths = {
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    heart: <path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    camera: <><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10H3V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.2"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" fill="currentColor"/>,
    bag: <path d="M5 8h14l1 13H4L5 8Z M9 8V6a3 3 0 0 1 6 0v2" />,
    plus: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></>,
    messages: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v8a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.5a3.5 3.5 0 0 1-1-3Z"/><path d="M8 9h.01M12 9h.01M16 9h.01"/></>,
    user: <><circle cx="12" cy="7.5" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function FirstScreen({
  authUser, query, setQuery, selectedLocation, setSelectedLocation, nigeriaStates,
  activeCategory, setActiveCategory, savedOnly, setSavedOnly, saved, toggleSaved,
  visibleProducts, listingLoadState, listingReload, setSelectedListing, onStartSelling,
  onBrowse, onNavigate, showNotice, cameraInputRef, guestMenuOpen, setGuestMenuOpen,
  showAllCategories, setShowAllCategories, categories, onLogin,
}) {
  const listingScroller = React.useRef(null);
  const categoryScroller = React.useRef(null);
  const promoScroller = React.useRef(null);
  const scrollListingsToStart = () => listingScroller.current?.scrollTo({ left: 0, behavior: "smooth" });
  const browse = () => { onBrowse(); scrollListingsToStart(); };
  const chooseCategory = (label) => {
    setSavedOnly(false);
    if (label === "More") {
      setShowAllCategories(v => !v);
      return;
    }
    if (label === "Services") {
      onNavigate("services");
      return;
    }
    setActiveCategory(label);
    scrollListingsToStart();
  };
  const photoSrc = (image, title = "") => {
    if (image) return image.startsWith("http") || image.startsWith("/") || image.startsWith("data:") ? image : `https://images.unsplash.com/${image}?auto=format&fit=crop&w=620&q=85`;
    const t = title.toLowerCase();
    const match = demoPhotos.find(([key]) => t.includes(key));
    return match ? asset(match[1]) : "";
  };

  return (
    <div className="aloko-first-screen">
      <header className="first-header">
        <div className="first-brand-row">
          <button className="first-brand" type="button" aria-label="Aloko home" onClick={() => onNavigate("home")}>
            <img src={asset("logo-mark.png")} alt="" />
            <span><strong>Aloko<sup>®</sup></strong><small>Sell it. Give it. Pass it on.</small></span>
          </button>
          <div className="first-header-actions">
            <button type="button" aria-label="Notifications" className="first-round-action" onClick={() => showNotice("The notification centre is not connected yet.")}><Icon name="bell"/><i/></button>
            <button type="button" aria-label="Toggle favourites" aria-pressed={savedOnly} className={`first-round-action ${savedOnly ? "is-active" : ""}`} onClick={() => { setSavedOnly(v => !v); setActiveCategory("All"); scrollListingsToStart(); }}><Icon name="heart"/></button>
            <button type="button" aria-label="Open menu" aria-expanded={guestMenuOpen} className="first-round-action" onClick={() => setGuestMenuOpen(v => !v)}><Icon name="menu"/></button>
          </div>
        </div>
        <div className="first-search-row">
          <label className="first-location">
            <Icon name="pin"/>
            <select aria-label="Choose location" value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
              <option value="All locations">Nigeria</option>
              {nigeriaStates.map(state => <option key={state} value={state}>{state}</option>)}
            </select>
            <span className="first-chevron">⌄</span>
          </label>
          <div className="first-search">
            <Icon name="search"/>
            <input aria-label="Search items, services or sellers" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") scrollListingsToStart(); }} placeholder="Search for items, services or sellers…"/>
            <input ref={cameraInputRef} className="first-camera-input" type="file" accept="image/*" capture="environment" aria-label="Choose a photo for visual search" onChange={e => { if (e.target.files?.[0]) showNotice("Photo selected. Image-based listing search is not connected yet."); e.target.value = ""; }}/>
            <button type="button" aria-label="Camera search" onClick={() => cameraInputRef.current?.click()}><Icon name="camera"/></button>
          </div>
        </div>
        {guestMenuOpen && <div className="first-menu-panel" role="menu" aria-label="Aloko menu">
          <button type="button" role="menuitem" onClick={() => { setGuestMenuOpen(false); onNavigate("home"); }}>Home</button>
          <button type="button" role="menuitem" onClick={() => { setGuestMenuOpen(false); setSavedOnly(true); setActiveCategory("All"); scrollListingsToStart(); }}>Saved listings ({saved.length})</button>
          <button type="button" role="menuitem" onClick={() => { setGuestMenuOpen(false); onStartSelling(); }}>Start selling</button>
          <button type="button" role="menuitem" onClick={() => { setGuestMenuOpen(false); authUser ? onNavigate("account") : onLogin(); }}>My account</button>
        </div>}
      </header>

      <section className="first-hero" aria-label="Aloko reuse and decluttering marketplace">
        <div className="first-hero-copy">
          <span className="first-eyebrow">NIGERIA’S REUSE &amp; DECLUTTER MARKETPLACE</span>
          <h1>Find it. Sell it.<br/>Give it a <em>new home.</em></h1>
          <div className="first-benefits">
            <div><svg viewBox="0 0 32 32"><path d="M25 11a11 11 0 1 0 2 9M25 4v8h-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><path d="m11 15 4 4 7-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg><small>Buy &amp; Sell<br/>Pre-owned</small></div>
            <div><svg viewBox="0 0 32 32"><path d="M4 13h24v15H4zM2 8h28v6H2zM16 8v20M16 8c-8 0-10-7-5-7 4 0 5 7 5 7Zm0 0c8 0 10-7 5-7-4 0-5 7-5 7Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/></svg><small>Give Away<br/>(Free)</small></div>
            <div><svg viewBox="0 0 32 32"><path d="m16 3 13 7-13 7L3 10l13-7Zm-13 14 13 7 13-7M3 24l13 7 13-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/></svg><small>Bulk<br/>Deals</small></div>
            <div><svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="23" rx="3" fill="none" stroke="currentColor" strokeWidth="2.3"/><path d="M10 3v6M22 3v6M4 13h24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"/></svg><small>Book<br/>Decluttering</small></div>
          </div>
          <div className="first-hero-actions">
            <button type="button" className="first-primary" onClick={onStartSelling}>Start Selling <span>→</span></button>
            <button type="button" className="first-secondary" onClick={browse}><Icon name="grid"/> Browse Listings</button>
          </div>
        </div>
        <div className="first-hero-art"><img src={asset("hero-art.png")} alt="" /></div>
      </section>

      <section className="first-categories" aria-label="Marketplace categories">
        <div className="first-horizontal first-category-track" ref={categoryScroller} role="list">
          {categoryTiles.map(([label,file,category]) => <button type="button" role="listitem" key={label} className={`first-category ${activeCategory === category ? "active" : ""}`} onClick={() => chooseCategory(category)}>
            <span className="first-category-image"><img src={asset(file)} alt="" loading="eager"/></span><strong>{label}</strong>
          </button>)}
        </div>
      </section>

      <section className="first-promos" ref={promoScroller} aria-label="Aloko marketplace highlights">
        <button className="first-promo" type="button" aria-label="Book decluttering services" onClick={() => onNavigate("services")}>
          <img src={asset("promo-decluttering.png")} alt="Book decluttering services" draggable="false"/>
        </button>
        <button className="first-promo" type="button" aria-label="Give away items for free" onClick={() => chooseCategory("Free items")}>
          <img src={asset("promo-giveaway.png")} alt="Give away for free" draggable="false"/>
        </button>
        <button className="first-promo" type="button" aria-label="Browse bulk deals and clear-outs" onClick={() => chooseCategory("Bulk Deals")}>
          <img src={asset("promo-bulk.png")} alt="Bulk deals and clear-outs" draggable="false"/>
        </button>
      </section>

      <section className="first-featured" aria-label="Featured listings">
        <div className="first-section-heading"><h2>Featured Listings</h2><button type="button" onClick={browse}>View More <span>→</span></button></div>
        <div className="first-horizontal first-listing-track" ref={listingScroller} aria-live="polite">
          {visibleProducts.slice(0, 24).map(p => <article className="first-listing-card" key={p.id} role="button" tabIndex={0} onClick={() => setSelectedListing(p)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedListing(p); } }}>
            <div className="first-listing-image">{photoSrc(p.image,p.title) ? <img src={photoSrc(p.image,p.title)} alt={p.title} loading="lazy"/> : <span className="first-no-photo">Photo not provided</span>}
              <button type="button" aria-label={saved.includes(p.id) ? "Remove from favourites" : "Add to favourites"} aria-pressed={saved.includes(p.id)} className={`first-heart ${saved.includes(p.id) ? "saved" : ""}`} onClick={e => { e.stopPropagation(); toggleSaved(p.id); }}><Icon name="heart"/></button>
            </div>
            <div className="first-listing-copy"><strong className="first-listing-title">{p.title}</strong><b className="first-listing-price">{p.price}</b><span className="first-listing-place"><Icon name="pin"/>{p.place || p.city || p.state || "Nigeria"}</span></div>
            {p.sellerVerified && <span className="first-verified" aria-label="Verified seller">✓</span>}
          </article>)}
          {listingLoadState === "loading" && <div className="first-listing-state">Loading approved listings…</div>}
          {listingLoadState === "error" && <div className="first-listing-state"><span>Listings are temporarily unavailable.</span><button type="button" onClick={listingReload}>Retry</button></div>}
          {listingLoadState === "live" && visibleProducts.length === 0 && <div className="first-listing-state">No approved listings yet.</div>}
        </div>
      </section>

      <nav className="first-bottom-nav" aria-label="App navigation">
        <button type="button" className="first-tab active" aria-current="page" onClick={() => onNavigate("home")}><Icon name="home" filled/><small>Home</small></button>
        <button type="button" className="first-tab" onClick={browse}><Icon name="bag"/><small>Buy</small></button>
        <button type="button" className="first-tab" onClick={onStartSelling}><Icon name="plus"/><small>Sell</small></button>
        <button type="button" className="first-tab first-tab-messages" onClick={() => authUser ? onNavigate("inbox") : onLogin()}><Icon name="messages"/><i/><small>Messages</small></button>
        <button type="button" className="first-tab" onClick={() => authUser ? onNavigate("account") : onLogin()}><Icon name="user"/><small>Account</small></button>
      </nav>
    </div>
  );
}
