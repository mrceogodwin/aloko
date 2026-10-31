import { useEffect, useMemo, useRef, useState } from "react";
import { matchesListingQuery, sortListings, validateListingDraft } from "./marketplace.js";
import { hasAccessToken, openConversation, createListing } from "./api-client.js";
import { getAuthSession, signUpWithEmail, signInWithEmail, signOutFromAloko } from "./auth.js";

const heroTypingPhrases = ["Platform for all Declutter Businesses","Home Decluttering","Office Clear-outs","Moving & Relocation","Estate Clearances","Wardrobe Decluttering","Furniture Removal","Appliance Reuse","Donation Collection","Charity Redistribution","Storage Organisation","Garage Clear-outs","Kitchen Decluttering","Paperwork Sorting","E-waste Collection","Bulk Item Resale","Property Staging","Student Move-outs","Professional Organisers","Business Clear-outs","Responsible Reuse & Disposal"];

const categories = [
  ["▣", "Electronics"], ["♧", "Fashion"], ["⌂", "Home & Living"], ["🚗", "Vehicles"],
  ["✿", "Health & Beauty"], ["◉", "Sports & Hobbies"], ["♙", "Baby & Kids"], ["✚", "Free items"],
  ["▦", "Bulk Deals"], ["↗", "Services"]
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
  const [typedHeadline, setTypedHeadline] = useState("");
  useEffect(() => {
    let phraseIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timeout;
    const tick = () => {
      const phrase = heroTypingPhrases[phraseIndex];
      if (!deleting && characterIndex < phrase.length) {
        characterIndex += 1;
        setTypedHeadline(phrase.slice(0, characterIndex));
        timeout = window.setTimeout(tick, 72);
      } else if (!deleting) {
        deleting = true;
        timeout = window.setTimeout(tick, 1450);
      } else if (characterIndex > 0) {
        characterIndex -= 1;
        setTypedHeadline(phrase.slice(0, characterIndex));
        timeout = window.setTimeout(tick, 30);
      } else {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % heroTypingPhrases.length;
        timeout = window.setTimeout(tick, 360);
      }
    };
    timeout = window.setTimeout(tick, 420);
    return () => window.clearTimeout(timeout);
  }, []);

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
  const [listingSubmitting, setListingSubmitting] = useState(false);
  const [localDraftExists, setLocalDraftExists] = useState(() => {
    try { return Boolean(window.localStorage.getItem("aloko:listing-draft")); } catch { return false; }
  });
  const [listingDraft, setListingDraft] = useState({
    title: "", price: "", place: "", description: "", kind: "sale", category: "Home & Living", condition: "Good", quantity: "1", fulfillment: "pickup"
  });
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [accountRole, setAccountRole] = useState("buyer");
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");

  useEffect(() => {
    let mounted = true;
    getAuthSession().then(data => {
      if (!mounted) return;
      const user = data?.user || null;
      const token = data?.session?.token;
      setAuthUser(user);
      if (token) { try { window.localStorage.setItem("aloko:access-token", token); } catch {} }
    }).catch(() => { if (mounted) setAuthUser(null); });
    return () => { mounted = false; };
  }, []);

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
        activeCategory === "Bulk Deals" ? p.kind === "bulk" :
        activeCategory === "Services" ? false :
        activeCategory === "Electronics" ? /electronics|phones|tech/i.test(p.category) :
        activeCategory === "Health & Beauty" ? /health|beauty/i.test(p.category) :
        activeCategory === "Sports & Hobbies" ? /sports|hobbies/i.test(p.category) :
        activeCategory === "Baby & Kids" ? /baby|kids|children/i.test(p.category) :
        p.category === activeCategory)) &&
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
            <img className="brand-mark-image" src="/aloko-mark.svg" alt="" /><span className="brand-text">Aloko</span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a className="nav-current" href="#top">Home</a><a href="#explore">Browse</a><a href="#categories">Categories</a><a href="#free">Free Items</a><a href="#explore">Bulk Deals</a><a href="#services">Services</a>
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
      <div className="announcement-ticker" aria-label="Aloko marketplace updates"><div className="ticker-track"><span>PLATFORM FOR ALL DECLUTTER BUSINESSES</span><b>✦</b><span>Sell pre-loved items</span><b>✦</b><span>Give usable things away</span><b>✦</b><span>Book home clear-outs</span><b>✦</b><span>Discover bulk reuse deals</span><b>✦</b><span>Find trusted local organisers</span><b>✦</b><span>Make room. Create value.</span><b>✦</b><span>PLATFORM FOR ALL DECLUTTER BUSINESSES</span><b>✦</b><span>Sell pre-loved items</span><b>✦</b><span>Give usable things away</span><b>✦</b><span>Book home clear-outs</span><b>✦</b><span>Discover bulk reuse deals</span><b>✦</b></div></div>

      <main>
        <section className="hero flagship-hero" id="top">
          <div className="hero-inner wrap">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow">Nigeria’s Reuse &amp; Decluttering Marketplace</span>
              <h1 className="hero-typing-headline"><span>{typedHeadline}</span><i aria-hidden="true" /></h1>
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
              <div className="hero-phone"><div className="phone-notch"></div><div className="phone-brand"><img src="/aloko-mark.svg" alt="" /> Aloko</div><div className="phone-search">⌕ &nbsp; Search for anything…</div><div className="phone-cats"><span>▣<small>Electronics</small></span><span>♧<small>Fashion</small></span><span>⌂<small>Home &amp; Living</small></span><span>♡<small>Free Items</small></span><span>♧<small>Bulk Deals</small></span><span>✧<small>Services</small></span></div><div className="phone-feature"><b>Give Things<br/>A New Home</b><span>↗</span></div></div>
              <div className="hero-orb orb-right">Same items,<br/> brighter futures!</div>
            </div>
          </div>
        </section>
        <section className="declutter-network wrap" id="declutter"><div className="network-heading"><span className="eyebrow">One platform. Every stage of decluttering.</span><h2>Built for the people who help spaces, things and communities start fresh.</h2><p>Aloko brings decluttering businesses, professional organisers, reuse sellers, charities and people looking for a fresh start into one discoverable marketplace.</p></div><div className="service-ticker" aria-label="20 decluttering business services">{["Home decluttering","Office clear-outs","Moving & relocation","Estate clearances","Wardrobe edits","Furniture removal","Appliance reuse","Donation collection","Charity redistribution","Storage organisation","Garage clear-outs","Kitchen resets","Paperwork sorting","E-waste collection","Bulk item resale","Property staging","Student move-outs","Deep organisation","Business clear-outs","Responsible disposal"].map((item,i)=><span key={item}><i>{String(i+1).padStart(2,"0")}</i>{item}</span>)}</div></section>

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
                if (label === "Services") {
                  document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
                  return;
                }
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

        <section className="showcase-section wrap" aria-label="Homepage listing showcase">
          <div className="section-head"><div><span className="eyebrow">From the Aloko community</span><h2>Fresh finds, ready for a new home</h2></div><button className="view-all" type="button" onClick={() => document.getElementById("explore")?.scrollIntoView({behavior:"smooth"})}>Browse all →</button></div>
          {liveProducts?.length ? <div className="showcase-carousel live-showcase">
            {liveProducts.slice(0, 8).map(item => <button className="showcase-card live-showcase-card" type="button" key={item.id} onClick={() => setSelectedListing(item)}>
              <div className="showcase-live-image">{item.image ? <img src={item.image} alt="" loading="lazy"/> : <span>aloko.</span>}<span className="showcase-live-kind">{item.kind === "giveaway" ? "FREE" : item.kind === "bulk" ? "BULK DEAL" : "PRE-LOVED"}</span></div>
              <div className="showcase-copy"><span className="showcase-tag">{item.category}</span><h3>{item.title}</h3><div className="showcase-meta"><span>⌖ {item.place || "Nigeria"}</span><b>{item.price}</b></div></div>
            </button>)}
          </div> : <div className="showcase-empty"><span className="showcase-empty-mark">✦</span><div><h3>Your next great find belongs here.</h3><p>Approved Aloko listings will appear in this featured carousel automatically. Be the first to share something useful.</p></div><button type="button" onClick={() => setListingFormOpen(true)}>Post an item →</button></div>}
          <p className="preview-disclaimer">Only approved live listings appear in this section. Listings are published after moderation.</p>
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

        <section className="benefits-section wrap"><div className="section-head"><div><span className="eyebrow">More than a marketplace</span><h2>Everything you need to pass it on.</h2></div></div><div className="benefit-slider">{[["01","Business storefronts","Give your decluttering business a home people can discover."],["02","Service enquiries","Let customers find and contact local professionals."],["03","Item listings","Sell useful pre-owned items instead of letting them go to waste."],["04","Free giveaways","Make good things accessible to someone who needs them."],["05","Bulk deals","Connect bulk clear-outs with resellers and organisations."],["06","Saved finds","Keep interesting items and services close at hand."],["07","Local discovery","Find reuse opportunities in your city and community."],["08","Moderated posts","Build trust with reviewed listings and community reporting."]].map(([n,t,d])=><article className="benefit-slide" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
        <section className="subscribe-section wrap"><div><span className="eyebrow">Stay in the loop</span><h2>Good finds. Fresh starts. Straight to your inbox.</h2><p>Get updates on new listings, decluttering services and reuse stories around Nigeria.</p></div><form className="subscribe-form" onSubmit={e=>{e.preventDefault();showNotice("Thanks for your interest. Newsletter sign-up will activate when email services are connected.");e.currentTarget.reset();}}><label className="sr-only" htmlFor="subscribe-email">Email address</label><input id="subscribe-email" type="email" required placeholder="Enter your email address"/><button type="submit">Subscribe <span>→</span></button><small>Newsletter delivery will activate when email services are connected.</small></form></section>

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
          <span className="powered-by">Powered by <strong>Squadglobal</strong></span>
        </div>
      </footer>

      {accountModalOpen && (
        <div className="listing-modal-backdrop" onClick={() => !authLoading && setAccountModalOpen(false)}>
          <section className="listing-modal account-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="listing-modal-close" disabled={authLoading} onClick={() => setAccountModalOpen(false)}>×</button>
            <div className="listing-modal-content">
              <h2>{authUser ? "Your Aloko account." : accountMode === "login" ? "Welcome back." : "Join Aloko."}</h2>
              {authUser ? (
                <>
                  <p className="listing-demo-note">Signed in as {authUser.email || "Aloko member"}.</p>
                  <button className="modal-contact-button" disabled={authLoading} onClick={async () => {
                    setAuthLoading(true);
                    try { await signOutFromAloko(); setAuthUser(null); try { window.localStorage.removeItem("aloko:access-token"); } catch {} showNotice("You have signed out."); setAccountModalOpen(false); }
                    catch (error) { showNotice(error.message); }
                    finally { setAuthLoading(false); }
                  }}>Sign out</button>
                </>
              ) : (
                <>
                  <p className="listing-demo-note">Create your account to save items, contact sellers and publish marketplace posts.</p>
                  <form className="listing-create-form" onSubmit={async e => {
                    e.preventDefault();
                    if (authLoading) return;
                    setAuthLoading(true);
                    try {
                      if (accountMode === "signup") await signUpWithEmail({ email: authEmail.trim(), password: authPassword, name: authName.trim() || authEmail.split("@")[0] });
                      else await signInWithEmail({ email: authEmail.trim(), password: authPassword });
                      const data = await getAuthSession();
                      const user = data?.user || null;
                      const token = data?.session?.token;
                      if (token) { try { window.localStorage.setItem("aloko:access-token", token); } catch {} }
                      setAuthUser(user);
                      if (!user) throw new Error("Account request completed, but no active session was returned. Please sign in.");
                      showNotice(accountMode === "signup" ? "Welcome to Aloko. Your account is ready." : "You are signed in.");
                      setAccountModalOpen(false);
                    } catch (error) { showNotice(error.message || "Could not complete account access."); }
                    finally { setAuthLoading(false); }
                  }}>
                    {accountMode === "signup" && <label>Your name<input value={authName} onChange={e => setAuthName(e.target.value)} minLength={2} maxLength={80} required placeholder="Your name"/></label>}
                    <label>Email<input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email"/></label>
                    <label>Password<input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required minLength={8} autoComplete={accountMode === "login" ? "current-password" : "new-password"}/></label>
                    <button type="submit" disabled={authLoading} className="modal-contact-button">{authLoading ? "Please wait…" : accountMode === "login" ? "Log in" : "Create account"}</button>
                  </form>
                  <p className="listing-demo-note">{accountMode === "login" ? "New to Aloko?" : "Already have an account?"} <button type="button" className="inline-auth-switch" onClick={() => setAccountMode(mode => mode === "login" ? "signup" : "login")}>{accountMode === "login" ? "Create an account" : "Log in"}</button></p>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {listingFormOpen && (
        <div className="listing-modal-backdrop" onClick={() => !listingSubmitting && setListingFormOpen(false)}>
          <section className="listing-modal listing-post-modal" role="dialog" aria-modal="true" aria-labelledby="listing-post-title" onClick={e => e.stopPropagation()}>
            <button className="listing-modal-close" type="button" disabled={listingSubmitting} onClick={() => setListingFormOpen(false)}>×</button>
            <div className="listing-modal-content">
              <span className="eyebrow">SELL · GIVE · PASS IT ON</span>
              <h2 id="listing-post-title">Create a marketplace post</h2>
              <p className="listing-demo-note">Complete your item details. Published submissions enter moderation before appearing publicly. Sign-in is required to submit.</p>
              <form className="listing-create-form listing-post-form" onSubmit={async e => {
                e.preventDefault();
                if (listingSubmitting) return;
                const validation = validateListingDraft(listingDraft);
                if (!validation.valid) { showNotice(Object.values(validation.errors)[0]); return; }
                if (!hasAccessToken()) {
                  showNotice("Publishing requires a verified seller account. Account sign-in is not connected yet.");
                  return;
                }
                const [city, ...stateParts] = listingDraft.place.split(",");
                const state = stateParts.join(",").trim();
                if (!city.trim() || !state) { showNotice("Enter location as City, State."); return; }
                const priceNaira = Number(listingDraft.price);
                const conditionMap = {"New":"new","Like new":"like_new","Good":"good","Fair":"fair","For parts":"for_parts"};
                const payload = {
                  title: listingDraft.title.trim(),
                  description: listingDraft.description.trim(),
                  category: listingDraft.category,
                  kind: listingDraft.kind,
                  condition: conditionMap[listingDraft.condition],
                  price_kobo: listingDraft.kind === "giveaway" ? 0 : Math.round(priceNaira * 100),
                  quantity: Number(listingDraft.quantity),
                  city: city.trim(),
                  state,
                  pickup_available: listingDraft.fulfillment !== "delivery",
                  delivery_available: listingDraft.fulfillment !== "pickup"
                };
                setListingSubmitting(true);
                try {
                  const result = await createListing(payload);
                  if (!result.ok) {
                    showNotice(result.data?.error || (result.status === 401 ? "Your session has expired. Sign in again." : "Could not submit this listing."));
                    return;
                  }
                  try { window.localStorage.removeItem("aloko:listing-draft"); } catch {}
                  setLocalDraftExists(false);
                  setListingDraft({title:"",price:"",place:"",description:"",kind:"sale",category:"Home & Living",condition:"Good",quantity:"1",fulfillment:"pickup"});
                  setListingFormOpen(false);
                  showNotice("Listing submitted for review. It will appear after approval.");
                  setListingReloadKey(k => k + 1);
                } catch {
                  showNotice("Network error. Your listing was not submitted.");
                } finally {
                  setListingSubmitting(false);
                }
              }}>
                <label>Post type<select value={listingDraft.kind} onChange={e => setListingDraft(v => ({...v,kind:e.target.value,category:e.target.value === "giveaway" ? "Free items" : (v.category === "Free items" ? "Home & Living" : v.category),price:e.target.value === "giveaway" ? "0" : (v.price === "0" ? "" : v.price)}))}><option value="sale">Sell an item</option><option value="giveaway">Give away for free</option><option value="bulk">Bulk deal</option></select></label>
                <label>Listing title<input required minLength={4} maxLength={90} value={listingDraft.title} onChange={e => setListingDraft(v => ({...v,title:e.target.value}))} placeholder="e.g. Gently used 3-seater sofa"/></label>
                <label>Category<select value={listingDraft.category} onChange={e => setListingDraft(v => ({...v,category:e.target.value}))}><option>Home &amp; Living</option><option>Phones &amp; Tech</option><option>Fashion</option><option>Appliances</option><option>Furniture</option><option>Books &amp; Hobbies</option><option>Free items</option></select></label>
                <div className="listing-form-row">
                  <label>{listingDraft.kind === "giveaway" ? "Price" : "Price (₦)"}<input type="number" min={listingDraft.kind === "giveaway" ? 0 : 1} step="1" required value={listingDraft.price} disabled={listingDraft.kind === "giveaway"} onChange={e => setListingDraft(v => ({...v,price:e.target.value}))} placeholder="Enter amount"/></label>
                  <label>Quantity<input type="number" min="1" max="1000000" step="1" required value={listingDraft.quantity} onChange={e => setListingDraft(v => ({...v,quantity:e.target.value}))}/></label>
                </div>
                <label>Condition<select value={listingDraft.condition} onChange={e => setListingDraft(v => ({...v,condition:e.target.value}))}><option>New</option><option>Like new</option><option>Good</option><option>Fair</option><option>For parts</option></select></label>
                <label>Location (City, State)<input required value={listingDraft.place} onChange={e => setListingDraft(v => ({...v,place:e.target.value}))} placeholder="e.g. Ikeja, Lagos"/></label>
                <label>Description<textarea required minLength={10} maxLength={1200} value={listingDraft.description} onChange={e => setListingDraft(v => ({...v,description:e.target.value}))} rows={4} placeholder="Describe the item, its condition and anything buyers should know."/></label>
                <label>Fulfilment<select value={listingDraft.fulfillment} onChange={e => setListingDraft(v => ({...v,fulfillment:e.target.value}))}><option value="pickup">Pickup available</option><option value="delivery">Delivery available</option><option value="both">Pickup and delivery</option></select></label>
                <div className="listing-form-actions"><button type="button" className="modal-save-button" disabled={listingSubmitting} onClick={() => {
                  const validation=validateListingDraft(listingDraft);
                  if(!validation.valid){showNotice(Object.values(validation.errors)[0]);return;}
                  try{window.localStorage.setItem("aloko:listing-draft",JSON.stringify({...listingDraft,savedAt:new Date().toISOString()}));setLocalDraftExists(true);showNotice("Draft saved on this device.");}catch{showNotice("Could not save draft.");}
                }}>Save draft</button><button type="submit" className="modal-contact-button" disabled={listingSubmitting}>{listingSubmitting ? "Submitting…" : "Submit for review"}</button></div>
                <small className="listing-form-footnote">Image uploads are not enabled yet. Add photos will be available when Aloko’s storage provider is configured.</small>
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
