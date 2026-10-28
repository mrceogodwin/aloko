import { useEffect, useMemo, useRef, useState } from "react";

const categories = [
  ["⌂", "Home & Living"], ["▣", "Phones & Tech"], ["♧", "Fashion"], ["◈", "Appliances"],
  ["♧", "Furniture"], ["▤", "Books & Hobbies"], ["✿", "Free items"], ["↗", "Services"]
];
const products = [
  { id: 1, title: "Minimal wooden bedside table", price: "₦18,000", condition: "Like new", place: "Benin City", category: "Home & Living", image: "photo-1532372320572-cda25653a26d" },
  { id: 2, title: "Everyday tote bag", price: "₦6,500", condition: "Good", place: "Lagos", category: "Fashion", image: "photo-1548036328-c9fa89d128fa" },
  { id: 3, title: "Compact desk lamp", price: "₦9,000", condition: "Like new", place: "Abuja", category: "Home & Living", image: "photo-1507473885765-e6ed057f782c" },
  { id: 4, title: "Wireless headphones", price: "₦22,000", condition: "Good", place: "Benin City", category: "Phones & Tech", image: "photo-1509942774463-acf339cf87d5" }
];

function App() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
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
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, [saved]);
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => products.filter(p =>
    (activeCategory === "All" || p.category === activeCategory) &&
    (p.title + " " + p.place + " " + p.category).toLowerCase().includes(query.toLowerCase())
  ), [query, activeCategory]);

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
        <a href="#explore">Explore</a><a href="#free">Free finds</a><a href="#services">Services</a>
      </nav>
      <div className="nav-actions"><button className="text-button" onClick={() => showNotice("Account sign-in will be connected when authentication is implemented.")}>Log in</button><button className="post-button" onClick={() => showNotice("Seller accounts and listing creation are coming in the next build step.")}>＋ Sell an item</button></div>
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
      <section className="category-section wrap" id="explore"><div className="section-heading"><div><span className="eyebrow">Find your next favourite</span><h2>Explore categories</h2></div><button className="view-all" onClick={() => {setActiveCategory("All");setQuery("");}}>View all ↗</button></div>
        <div className="category-grid">{categories.map(([icon,name]) => <button key={name} className={activeCategory === name ? "category active" : "category"} onClick={() => {setActiveCategory(name === "Free items" ? "All" : name); if(name === "Free items") document.getElementById("free")?.scrollIntoView({behavior:"smooth"});}}><span className="category-icon">{icon}</span><span>{name}</span><span className="category-arrow">↗</span></button>)}</div>
      </section>
      <section className="listings-section wrap"><div className="section-heading"><div><span className="eyebrow">A second chance at something good</span><h2>{query ? "Search results" : activeCategory === "All" ? "Freshly listed" : activeCategory}</h2></div><span className="listing-count">{filtered.length} demo listings</span></div>
        <div className="product-grid">{filtered.map(p => <article className="product-card" key={p.id}><div className="product-image"><img src={`https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=700&q=80`} alt={p.title}/><span className="condition">{p.condition}</span><button className={saved.includes(p.id) ? "save saved" : "save"} aria-label={saved.includes(p.id) ? "Remove from saved" : "Save item"} onClick={() => toggleSaved(p.id)}>{saved.includes(p.id) ? "♥" : "♡"}</button></div><div className="product-info"><span className="product-place">⌖ {p.place}</span><h3>{p.title}</h3><div className="product-bottom"><strong>{p.price}</strong><button onClick={() => showNotice("Seller contact and messaging will be enabled when accounts are connected.")}>View item ↗</button></div></div></article>)}</div>
        {filtered.length === 0 && <div className="empty-state"><span>⌕</span><h3>No matches just yet</h3><p>Try another search or explore all categories.</p><button onClick={() => {setQuery("");setActiveCategory("All");}}>Clear filters</button></div>}
        <p className="demo-note">Preview content only — these listings are examples, not live seller listings.</p>
      </section>
      <section className="giveaway-section wrap" id="free"><div className="giveaway-card"><div><span className="eyebrow">One person's extra is another's treasure</span><h2>Good things, given freely.</h2><p>Find free items in your community or pass something useful along to someone who needs it.</p><button onClick={() => showNotice("Giveaway requests will be available after account and messaging setup.")}>Explore free finds ↗</button></div><div className="giveaway-symbol" aria-hidden="true">♡</div></div></section>
      <section className="services-section wrap" id="services"><div className="service-copy"><span className="eyebrow">Make room for what matters</span><h2>A little help<br/>clearing the clutter.</h2><p>Discover local decluttering and organising services to make your space feel like you again.</p><button className="outline-button" onClick={() => showNotice("Service provider profiles and booking will be built after the marketplace foundation.")}>Explore services ↗</button></div><div className="service-image"><img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85" alt="Calm, organised home interior"/></div></section>
      <section className="seller-cta wrap"><div><span className="eyebrow">Ready to pass it on?</span><h2>Your unused could be<br/>someone's next favourite.</h2><p>Make space. Earn a little. Keep good things moving.</p></div><button onClick={() => showNotice("Seller registration will be enabled after authentication is implemented.")}>Start selling <span>↗</span></button></section>
    </main>
    <footer className="footer"><div className="footer-inner"><a className="brand" href="#">aloko<span>.</span></a><p>Sell it. Give it. Pass it on.</p><span>© {new Date().getFullYear()} Aloko. Good things live on.</span></div></footer>
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}

export default App;
