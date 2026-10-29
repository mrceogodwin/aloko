import { useEffect, useMemo, useRef, useState } from "react";

const categories = [
  ["⌂", "Home & Living"], ["▣", "Phones & Tech"], ["♧", "Fashion"], ["◈", "Appliances"],
  ["♧", "Furniture"], ["▤", "Books & Hobbies"], ["✿", "Free items"], ["↗", "Services"]
];
const products = [
  { id: 1, title: "Minimal wooden bedside table", price: "₦18,000", condition: "Like new", place: "Benin City", category: "Home & Living", description: "A compact bedside table that suits a bedroom or reading corner. Check dimensions and finish with the seller before arranging collection.", image: "photo-1532372320572-cda25653a26d" },
  { id: 2, title: "Everyday tote bag", price: "₦6,500", condition: "Good", place: "Lagos", category: "Fashion", description: "A reusable everyday tote for errands, books, or daily essentials. Ask the seller to confirm the size and any signs of wear.", image: "photo-1548036328-c9fa89d128fa" },
  { id: 3, title: "Compact desk lamp", price: "₦9,000", condition: "Like new", place: "Abuja", category: "Home & Living", description: "A small desk lamp for a study space or bedside table. Confirm bulb type and power requirements before purchase.", image: "photo-1507473885765-e6ed057f782c" },
  { id: 4, title: "Wireless headphones", price: "₦22,000", condition: "Good", place: "Benin City", category: "Phones & Tech", description: "Example pre-loved wireless headphones. Ask about battery life, included accessories, and testing before paying.", image: "photo-1509942774463-acf339cf87d5" },
  { id: 5, title: "Small stack of reading books", price: "Free", condition: "Good", place: "Benin City", category: "Free items", description: "A sample giveaway listing for readers. Confirm the titles, collection point, and pickup arrangement before travelling.", image: "photo-1512820165-7c5ad4a2f9a4" }
];

function App() {
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
      return Array.isArray(parsed) ? parsed.filter(id => Number.isInteger(id)) : [];
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
  const [listingDraft, setListingDraft] = useState({ title: "", price: "", category: "Home & Living", condition: "Good", place: "", description: "" });
  const [listingImagePreview, setListingImagePreview] = useState("");
  useEffect(() => {
    if (!listingFormOpen) return;
    try {
      const raw = window.localStorage.getItem("aloko:listing-draft");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setListingDraft(current => ({
          title: typeof parsed.title === "string" ? parsed.title : current.title,
          price: typeof parsed.price === "string" ? parsed.price : current.price,
          category: typeof parsed.category === "string" ? parsed.category : current.category,
          condition: typeof parsed.condition === "string" ? parsed.condition : current.condition,
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
    if (!selectedListing) return undefined;
    const handleKeyDown = event => {
      if (event.key === "Escape") setSelectedListing(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedListing]);
  const filtered = useMemo(() => products.filter(p =>
    (activeCategory === "All" || p.category === activeCategory) &&
    (selectedLocation === "All locations" || p.place === selectedLocation) &&
    (selectedCondition === "Any condition" || p.condition === selectedCondition) &&
    (!savedOnly || saved.includes(p.id)) &&
    (p.title + " " + p.place + " " + p.category).toLowerCase().includes(query.toLowerCase())
  ), [query, activeCategory, selectedLocation, selectedCondition, savedOnly, saved]);

  const visibleProducts = useMemo(() => [...filtered].sort((a, b) => {
    if (sortOrder === "price-low") return (a.price === "Free" ? 0 : Number(a.price.replace(/[^0-9]/g, ""))) - (b.price === "Free" ? 0 : Number(b.price.replace(/[^0-9]/g, "")));
    if (sortOrder === "price-high") return (b.price === "Free" ? 0 : Number(b.price.replace(/[^0-9]/g, ""))) - (a.price === "Free" ? 0 : Number(a.price.replace(/[^0-9]/g, "")));
    return products.findIndex(p => p.id === a.id) - products.findIndex(p => p.id === b.id);
  }), [filtered, sortOrder]);

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
      <div className="nav-actions"><button className="text-button" onClick={() => showNotice("Account sign-in will be connected when authentication is implemented.")}>Log in</button><button className="mobile-saved-toggle" aria-pressed={savedOnly} onClick={() => { setSavedOnly(value => !value); setActiveCategory("All"); document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}); }}>{savedOnly ? "All" : `Saved ${saved.length}`}</button>{localDraftExists && <button className="resume-draft-button" onClick={() => setListingFormOpen(true)}>Continue draft</button>}<button className="post-button" onClick={() => setListingFormOpen(true)}>＋ Sell an item</button></div>
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
      <section className="listings-section wrap"><div className="section-heading"><div><span className="eyebrow">A second chance at something good</span><h2>{savedOnly ? "Your saved items" : query ? "Search results" : activeCategory === "All" ? "Freshly listed" : activeCategory}</h2></div><div className="listing-tools"><label className="sort-control">Condition <select value={selectedCondition} onChange={e => setSelectedCondition(e.target.value)} aria-label="Filter by item condition"><option>Any condition</option>{[...new Set(products.map(p => p.condition))].sort().map(condition => <option key={condition} value={condition}>{condition}</option>)}</select></label><label className="sort-control">Location <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} aria-label="Filter by location"><option>All locations</option>{[...new Set(products.map(p => p.place))].sort().map(place => <option key={place} value={place}>{place}</option>)}</select></label><label className="sort-control">Sort <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} aria-label="Sort listings"><option value="recent">Recently added</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label><span className="listing-count">{visibleProducts.length} demo listings</span></div></div>
        <div className="product-grid">{visibleProducts.map(p => <article className="product-card" key={p.id}><div className="product-image"><img src={`https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=700&q=80`} alt={p.title}/><span className="condition">{p.condition}</span><button className={saved.includes(p.id) ? "save saved" : "save"} aria-label={saved.includes(p.id) ? "Remove from saved" : "Save item"} onClick={() => toggleSaved(p.id)}>{saved.includes(p.id) ? "♥" : "♡"}</button></div><div className="product-info"><span className="product-place">⌖ {p.place}</span><h3>{p.title}</h3><div className="product-bottom"><strong>{p.price}</strong><button onClick={() => setSelectedListing(p)}>View item ↗</button></div></div></article>)}</div>
        {filtered.length === 0 && <div className="empty-state"><span>{savedOnly && saved.length === 0 ? "♡" : "⌕"}</span><h3>{savedOnly && saved.length === 0 ? "Your saved list is waiting" : savedOnly ? "No saved items match these filters" : "No matches just yet"}</h3><p>{savedOnly && saved.length === 0 ? "Tap the heart on any item to keep it here for later. Saved items stay on this device in this preview." : "Try changing your search or filters, or explore all example listings."}</p><button onClick={() => {setQuery("");setActiveCategory("All");setSavedOnly(false);setSelectedLocation("All locations");setSelectedCondition("Any condition");setSortOrder("recent");document.getElementById("explore")?.scrollIntoView({behavior:"smooth"});}}>{savedOnly && saved.length === 0 ? "Explore listings" : "Clear filters"}</button></div>}
        <p className="demo-note">Preview content only — these listings are examples, not live seller listings.</p>
      </section>
      <section className="giveaway-section wrap" id="free"><div className="giveaway-card"><div><span className="eyebrow">One person's extra is another's treasure</span><h2>Good things, given freely.</h2><p>Find free items in your community or pass something useful along to someone who needs it.</p><button onClick={() => showNotice("Giveaway requests will be available after account and messaging setup.")}>Explore free finds ↗</button></div><div className="giveaway-symbol" aria-hidden="true">♡</div></div></section>
      <section className="services-section wrap" id="services"><div className="service-copy"><span className="eyebrow">Make room for what matters</span><h2>A little help<br/>clearing the clutter.</h2><p>Discover local decluttering and organising services to make your space feel like you again.</p><button className="outline-button" onClick={() => showNotice("Service provider profiles and booking will be built after the marketplace foundation.")}>Explore services ↗</button></div><div className="service-image"><img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85" alt="Calm, organised home interior"/></div></section>
      <section className="seller-cta wrap"><div><span className="eyebrow">Ready to pass it on?</span><h2>Your unused could be<br/>someone's next favourite.</h2><p>Make space. Earn a little. Keep good things moving.</p></div><button onClick={() => setListingFormOpen(true)}>Start selling <span>↗</span></button></section>
    </main>
    <footer className="footer"><div className="footer-inner"><a className="brand" href="#">aloko<span>.</span></a><p>Sell it. Give it. Pass it on.</p><span>© {new Date().getFullYear()} Aloko. Good things live on.</span></div></footer>
    {listingFormOpen && <div className="listing-modal-backdrop" role="presentation" onClick={() => setListingFormOpen(false)}><section className="listing-modal listing-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-listing-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close listing form" onClick={() => setListingFormOpen(false)}>×</button><div className="listing-modal-content listing-create-content"><span className="eyebrow">SELL ON ALOKO</span><h2 id="create-listing-title">Prepare your listing</h2><p className="listing-demo-note">Preview mode only. You can prepare a draft, but it will not be published or visible to buyers until seller accounts, photo uploads, and the marketplace backend are connected.</p><form className="listing-create-form" onSubmit={e => { e.preventDefault(); try { window.localStorage.setItem("aloko:listing-draft", JSON.stringify({...listingDraft, savedAt: new Date().toISOString()})); setLocalDraftExists(true); showNotice("Draft saved on this device only. It has not been published."); setListingFormOpen(false); } catch { showNotice("Could not save this draft in browser storage."); } }}><label>Item title<input required maxLength="90" value={listingDraft.title} onChange={e => setListingDraft(v => ({...v,title:e.target.value}))} placeholder="e.g. Wooden study desk"/></label><div className="listing-form-row"><label>Price (₦)<input required inputMode="numeric" pattern="[0-9]+" value={listingDraft.price} onChange={e => setListingDraft(v => ({...v,price:e.target.value}))} placeholder="Enter amount"/></label><label>Condition<select value={listingDraft.condition} onChange={e => setListingDraft(v => ({...v,condition:e.target.value}))}><option>New</option><option>Like new</option><option>Good</option><option>Fair</option><option>For parts</option></select></label></div><label>Category<select value={listingDraft.category} onChange={e => setListingDraft(v => ({...v,category:e.target.value}))}>{categories.filter(([,name]) => name !== "Services").map(([,name]) => <option key={name}>{name}</option>)}</select></label><label>Location<input required maxLength="80" value={listingDraft.place} onChange={e => setListingDraft(v => ({...v,place:e.target.value}))} placeholder="City or area"/></label><label>Description<textarea required maxLength="1200" rows="4" value={listingDraft.description} onChange={e => setListingDraft(v => ({...v,description:e.target.value}))} placeholder="Describe condition, size, what's included, and collection details"/></label><label>Photo preview <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file=e.target.files?.[0]; if(!file) return; if(!["image/jpeg","image/png","image/webp"].includes(file.type)){showNotice("Choose a JPG, PNG, or WebP image.");e.target.value="";return;} if(file.size>5*1024*1024){showNotice("Choose an image smaller than 5 MB.");e.target.value="";return;} const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==="string")setListingImagePreview(reader.result);};reader.onerror=()=>showNotice("Could not preview that image.");reader.readAsDataURL(file); }} /><span className="field-help">JPG, PNG, or WebP · up to 5 MB. Preview only; this photo is not uploaded or saved with your draft yet.</span></label>{listingImagePreview && <div className="draft-photo-preview"><img src={listingImagePreview} alt="Selected listing photo preview"/><button type="button" className="outline-button" onClick={() => setListingImagePreview("")}>Remove photo</button></div>}<div className="listing-create-actions">{localDraftExists && <button type="button" className="outline-button" onClick={() => { try { window.localStorage.removeItem("aloko:listing-draft"); setLocalDraftExists(false); setListingDraft({title:"",price:"",category:"Home & Living",condition:"Good",place:"",description:""}); setListingImagePreview(""); showNotice("Local draft deleted from this device."); } catch { showNotice("Could not delete the local draft."); } }}>Delete draft</button>}<button type="button" className="outline-button" onClick={() => setListingFormOpen(false)}>Cancel</button><button type="submit" className="modal-contact-button">Save local draft</button></div></form></div></section></div>}
    {selectedListing && <div className="listing-modal-backdrop" role="presentation" onClick={() => setSelectedListing(null)}><section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-modal-title" onClick={e => e.stopPropagation()}><button className="listing-modal-close" aria-label="Close item details" onClick={() => setSelectedListing(null)}>×</button><img className="listing-modal-image" src={`https://images.unsplash.com/${selectedListing.image}?auto=format&fit=crop&w=1000&q=85`} alt={selectedListing.title}/><div className="listing-modal-content"><span className="eyebrow">DEMO LISTING · {selectedListing.category}</span><h2 id="listing-modal-title">{selectedListing.title}</h2><strong className="listing-modal-price">{selectedListing.price}</strong><div className="listing-modal-meta"><span>{selectedListing.condition}</span><span>⌖ {selectedListing.place}</span></div><p>{selectedListing.description}</p><p className="listing-demo-note">Demo example only. Availability and seller details have not been verified. Buyers should confirm item condition, collection, and final terms directly with the seller.</p><div className="listing-modal-actions"><button className="modal-save-button" onClick={() => toggleSaved(selectedListing.id)}>{saved.includes(selectedListing.id) ? "♥ Saved" : "♡ Save item"}</button><button className="modal-contact-button" onClick={() => showNotice("Seller contact will be enabled after accounts and messaging are connected.")}>Contact seller ↗</button></div></div></section></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}

export default App;
