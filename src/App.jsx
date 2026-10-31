import { useEffect, useMemo, useRef, useState } from "react";
import { matchesListingQuery, sortListings, validateListingDraft } from "./marketplace.js";
import { hasAccessToken, openConversation, createListing, listConversations, listMessages, sendMessage, fetchMyListings, setListingStatus, listSavedListings, saveListing, unsaveListing, getMarketplaceProfile, getSellerStore } from "./api-client.js";
import { getAuthSession, signUpWithEmail, signInWithEmail, signOutFromAloko } from "./auth.js";

const nigeriaStates = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

const heroTypingPhrases = ["Declutter Service Marketplace","Sell It. Give It. Pass It On.","Home Decluttering","Office Clear-outs","Moving & Relocation","Estate Clearances","Wardrobe Decluttering","Furniture Removal","Appliance Reuse","Donation Collection","Charity Redistribution","Storage Organisation","Garage Clear-outs","Kitchen Decluttering","Paperwork Sorting","E-waste Collection","Bulk Item Resale","Property Staging","Student Move-outs","Professional Organisers","Business Clear-outs","Responsible Reuse & Disposal"];

const categories = [
  ["▣", "Electronics"], ["♧", "Fashion"], ["⌂", "Home & Living"], ["🚗", "Vehicles"],
  ["✿", "Health & Beauty"], ["◉", "Sports & Hobbies"], ["♙", "Baby & Kids"], ["✚", "Free items"],
  ["▦", "Bulk Deals"], ["↗", "Services"], ["🪑", "Furniture"], ["🍳", "Kitchenware"],
  ["📚", "Books"], ["🏡", "Property & Garden"], ["🧸", "Toys & Games"], ["🧰", "Tools"],
  ["🎨", "Art & Collectibles"], ["🧳", "Travel & Luggage"], ["🍼", "Baby Essentials"], ["🌿", "Garden & Outdoor"],
  ["⌂", "Property"], ["🚙", "Cars & Motorcycles"], ["🛵", "Bicycles & Mobility"], ["📱", "Phones & Accessories"], ["💻", "Computers & Office Tech"], ["🔌", "Home Appliances"], ["🛏", "Bedroom & Bedding"], ["🛋", "Home Decor"], ["👟", "Shoes & Bags"], ["💍", "Jewellery & Watches"], ["🧴", "Personal Care"], ["🧑‍🍳", "Kitchen & Dining"], ["🧹", "Cleaning Equipment"], ["🏋", "Fitness Equipment"], ["🎮", "Gaming"], ["🎵", "Musical Instruments"], ["🧱", "Building Materials"], ["🌱", "Plants & Garden"], ["♻", "Recycling & Scrap"], ["📦", "Office Clear-outs"], ["🏠", "Estate Clearances"], ["🧺", "Wardrobe Clear-outs"], ["🪑", "Furniture Clear-outs"], ["🚚", "Moving & Relocation"], ["🤝", "Donation & Charity"], ["🧑‍🔧", "Professional Services"],
];

const demoPhotoByCategory = {
  "Home & Living": "photo-1600210492486-724fe5c67fb0",
  Furniture: "photo-1555041469-a586c61ea9bc",
  Kitchenware: "photo-1556911220-bff31c812dba",
  "Property & Garden": "photo-1600210492486-724fe5c67fb0",
  Electronics: "photo-1496181133206-80ce9b88a853",
  Fashion: "photo-1483985988355-763728e1935b",
  Books: "photo-1494438639946-1ebd1d20bf85",
  "Free items": "photo-1494438639946-1ebd1d20bf85"
};

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
    sellerId: item.seller_id || item.sellerId || "",
    sellerName: item.seller_display_name || "Aloko seller",
    sellerAvatar: item.seller_avatar_url || item.avatar_url || "",
    sellerType: item.seller_account_type || "individual",
    state: item.state || "",
    pickupAvailable: item.pickup_available !== false,
    deliveryAvailable: item.delivery_available === true,
    publishedAt: item.published_at || item.created_at || null,
    image: item.image_url || item.image_urls?.[0] || (/chair|table|shelf|cabinet|wardrobe|sofa|furniture|study desk/i.test(item.title) ? demoPhotoByCategory.Furniture : /kitchen|cook|plate|blender|stove/i.test(item.title) ? demoPhotoByCategory.Kitchenware : /box|moving|carton/i.test(item.title) ? "photo-1494438639946-1ebd1d20bf85" : /laptop|phone|tv|samsung|computer|hp elitebook/i.test(item.title) ? demoPhotoByCategory.Electronics : demoPhotoByCategory[item.category] || (item.kind === "giveaway" ? demoPhotoByCategory["Free items"] : demoPhotoByCategory["Home & Living"])),
    kind: item.kind,
    quantity: item.quantity,
    live: true
  };
}


function WorkspaceScreen({ screen, authUser, onLogin, onSell, onNotice, onOpenListing, localSaved, initialConversationId, onConversationOpened, onSignOut, sellerStoreId }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(initialConversationId || "");
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [myListings, setMyListings] = useState([]);
  const [savedListings, setSavedListings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [storeData, setStoreData] = useState(null);
  const [workspaceError, setWorkspaceError] = useState("");

  useEffect(() => {
    if (!authUser || screen !== "inbox") return;
    let cancelled = false;
    setLoading(true); setWorkspaceError("");
    listConversations().then(result => {
      if (cancelled) return;
      if (!result.ok) { setWorkspaceError(result.data?.error || "Could not load conversations."); return; }
      setConversations(result.data?.items || []);
      if (initialConversationId) setActiveConversation(initialConversationId);
    }).catch(() => { if (!cancelled) setWorkspaceError("Network error loading conversations."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser, screen, initialConversationId]);

  useEffect(() => {
    if (!authUser || screen !== "inbox" || !activeConversation) { setMessages([]); return; }
    let cancelled = false;
    setLoading(true);
    listMessages(activeConversation).then(result => {
      if (cancelled) return;
      if (!result.ok) { setWorkspaceError(result.data?.error || "Could not load messages."); return; }
      setMessages(result.data?.items || []);
    }).catch(() => { if (!cancelled) setWorkspaceError("Network error loading messages."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser, screen, activeConversation]);

  useEffect(() => {
    if (!authUser || screen !== "seller") return;
    let cancelled = false;
    setLoading(true); setWorkspaceError("");
    fetchMyListings().then(result => {
      if (cancelled) return;
      if (!result.ok) { setWorkspaceError(result.data?.error || "Could not load your listings."); return; }
      setMyListings(result.data?.items || []);
    }).catch(() => { if (!cancelled) setWorkspaceError("Network error loading your listings."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser, screen]);

  useEffect(() => {
    if (!authUser || screen !== "saved") return;
    let cancelled = false;
    listSavedListings().then(result => {
      if (cancelled) return;
      if (result.ok) setSavedListings(result.data?.items || []);
      else setSavedListings([]);
    }).catch(() => { if (!cancelled) setSavedListings([]); });
    return () => { cancelled = true; };
  }, [authUser, screen, localSaved.length]);

  useEffect(() => {
    if (!authUser || screen !== "account") return;
    let cancelled = false;
    getMarketplaceProfile().then(result => { if (!cancelled && result.ok) setProfile(result.data?.user || null); });
    return () => { cancelled = true; };
  }, [authUser, screen]);

  useEffect(() => {
    if (screen !== "store" || !sellerStoreId) return;
    let cancelled = false;
    setLoading(true); setWorkspaceError(""); setStoreData(null);
    getSellerStore(sellerStoreId).then(result => {
      if (cancelled) return;
      if (!result.ok) { setWorkspaceError(result.data?.error || "Could not load this storefront."); return; }
      setStoreData(result.data || null);
    }).catch(() => { if (!cancelled) setWorkspaceError("Network error loading this storefront."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [screen, sellerStoreId]);

  const submitMessage = async (event) => {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!body || !activeConversation || sending) return;
    setSending(true);
    const result = await sendMessage(activeConversation, body);
    if (result.ok) {
      setMessageDraft("");
      const refreshed = await listMessages(activeConversation);
      if (refreshed.ok) setMessages(refreshed.data?.items || []);
      const convs = await listConversations();
      if (convs.ok) setConversations(convs.data?.items || []);
    } else onNotice(result.data?.error || "Your message could not be sent.");
    setSending(false);
  };

  const updateStatus = async (listing, action) => {
    const result = await setListingStatus(listing.id, action);
    if (!result.ok) { onNotice(result.data?.error || "Could not update listing."); return; }
    setMyListings(items => items.map(item => item.id === listing.id ? { ...item, status: result.data.item.status } : item));
    onNotice(result.data?.message || "Listing updated.");
  };

  const titleMap = { seller: "Seller workspace", inbox: "Messages", saved: "Saved items", account: "My account", store: storeData?.store?.display_name ? `${storeData.store.display_name}’s store` : "Seller storefront" };
  if (!authUser && ["seller", "inbox", "account"].includes(screen)) {
    return <section className="workspace-page"><div className="workspace-gate"><span className="workspace-icon">✦</span><span className="eyebrow">YOUR ALOKO ACCOUNT</span><h1>Everything in its right place.</h1><p>Sign in to manage your listings, talk to buyers and keep your Aloko activity together.</p><button className="workspace-primary" onClick={onLogin}>Sign in to continue <span>→</span></button><button className="workspace-link" onClick={onLogin}>New to Aloko? Create an account</button></div></section>;
  }

  return <section className="workspace-page">
    <div className="workspace-heading"><div><span className="eyebrow">ALOKO / YOUR SPACE</span><h1>{titleMap[screen] || "Your Aloko space"}</h1><p>{screen === "seller" ? "Manage your inventory and keep every listing up to date." : screen === "inbox" ? "Your conversations with buyers and sellers, all in one place." : screen === "saved" ? "The items and opportunities you want to come back to." : screen === "store" ? "Explore this seller’s currently available listings." : "Your identity and activity across the Aloko community."}</p></div>{screen === "seller" && <button className="workspace-primary" onClick={onSell}>＋ Create listing</button>}</div>
    {workspaceError && <div className="workspace-alert" role="alert">{workspaceError} <button onClick={() => window.location.reload()}>Refresh</button></div>}
    {screen === "seller" && <div className="workspace-panel">
      <div className="workspace-stats"><div><span>ALL LISTINGS</span><strong>{myListings.length}</strong></div><div><span>ACTIVE</span><strong>{myListings.filter(x=>x.status==="active").length}</strong></div><div><span>UNDER REVIEW</span><strong>{myListings.filter(x=>x.status==="pending_review").length}</strong></div><div><span>SOLD</span><strong>{myListings.filter(x=>x.status==="sold").length}</strong></div></div>
      <div className="workspace-panel-head"><div><h2>Your inventory</h2><p>Manage the items you have listed on Aloko.</p></div><span>{loading ? "Updating…" : "Live account data"}</span></div>
      {myListings.length ? <div className="workspace-listings">{myListings.map(item=><article className="workspace-listing" key={item.id}><div className="workspace-listing-art">A.</div><div className="workspace-listing-copy"><strong>{item.title}</strong><span>{item.category} · {item.city}, {item.state}</span><small>{formatNaira(item.price_naira)} · {item.condition || "Condition not set"} · Qty {item.quantity}</small></div><span className={"workspace-status status-"+item.status}>{String(item.status).replaceAll("_"," ")}</span><div className="workspace-row-actions">{item.status==="active" && <button onClick={()=>updateStatus(item,"pause")}>Pause</button>}{item.status==="paused" && <button onClick={()=>updateStatus(item,"resume")}>Resume</button>}{["active","paused"].includes(item.status) && <button onClick={()=>updateStatus(item,"mark_sold")}>Mark sold</button>}</div></article>)}</div> : <div className="workspace-empty"><span>▧</span><h3>Your next listing starts here.</h3><p>When you publish an item, it will appear here with its review and availability status.</p><button className="workspace-primary" onClick={onSell}>Create your first listing</button></div>}
    </div>}
    {screen === "inbox" && <div className="workspace-inbox">
      <aside className="workspace-conversation-list"><div className="workspace-panel-head"><div><h2>Inbox</h2><p>{conversations.length} conversations</p></div><button onClick={()=>listConversations().then(r=>r.ok&&setConversations(r.data.items||[]))}>↻</button></div>
        {conversations.map(c=><button key={c.id} className={"workspace-conversation "+(activeConversation===c.id?"selected":"")} onClick={()=>{setActiveConversation(c.id);onConversationOpened(c.id);}}><span className="conversation-avatar">{(c.counterpart_name||"A").slice(0,1).toUpperCase()}</span><span className="conversation-copy"><strong>{c.counterpart_name||"Aloko member"}</strong><small>{c.listing_title||"Marketplace conversation"}</small><em>{c.last_message||"Start the conversation"}</em></span><time>{c.last_message_at?new Date(c.last_message_at).toLocaleDateString():"New"}</time></button>)}
        {!conversations.length && !loading && <div className="workspace-mini-empty">No conversations yet. Open a listing and contact its seller to start one.</div>}
      </aside>
      <section className="workspace-chat"><div className="workspace-chat-head"><span className="conversation-avatar">{activeConversation ? "A" : "✉"}</span><div><strong>{conversations.find(c=>c.id===activeConversation)?.counterpart_name || "Choose a conversation"}</strong><small>{conversations.find(c=>c.id===activeConversation)?.listing_title || "Your Aloko inbox"}</small></div></div>
        <div className="workspace-messages">{messages.length ? messages.map(m=><div key={m.id} className={"workspace-message "+(m.sender_id===authUser.id?"mine":"theirs")}><span>{m.sender_name}</span><p>{m.body}</p><time>{new Date(m.created_at).toLocaleString()}</time></div>) : <div className="workspace-mini-empty">{activeConversation ? "No messages yet. Say hello." : "Select a conversation to read your messages."}</div>}</div>
        <form className="workspace-compose" onSubmit={submitMessage}><input value={messageDraft} onChange={e=>setMessageDraft(e.target.value)} disabled={!activeConversation||sending} placeholder={activeConversation?"Write a message…":"Choose a conversation first"}/><button type="submit" disabled={!activeConversation||sending||!messageDraft.trim()}>{sending?"Sending…":"Send ↑"}</button></form>
      </section>
    </div>}
    {screen === "store" && <div className="workspace-panel public-store-panel">
      {storeData?.store ? <>
        <div className="public-store-profile">
          <div className="public-store-avatar">{storeData.store.avatar_url ? <img src={storeData.store.avatar_url} alt="" /> : (storeData.store.display_name || "A").slice(0,1).toUpperCase()}</div>
          <div><span className="eyebrow">ALOKO SELLER STOREFRONT</span><h2>{storeData.store.display_name}</h2><p>{String(storeData.store.account_type || "individual").replaceAll("_"," ")} · {[storeData.store.city,storeData.store.state].filter(Boolean).join(", ") || "Nigeria"}</p><small>{storeData.count} active {storeData.count === 1 ? "listing" : "listings"}</small></div>
        </div>
        <div className="workspace-panel-head"><div><h2>Available now</h2><p>Only active, approved listings are shown.</p></div><span>{loading ? "Refreshing…" : "Public storefront"}</span></div>
        {storeData.items?.length ? <div className="public-store-grid">{storeData.items.map(item=><button className="public-store-item" key={item.id} onClick={()=>onOpenListing(item)}><span className="public-store-item-art">aloko.</span><span className="public-store-item-copy"><strong>{item.title}</strong><small>{item.category} · {[item.city,item.state].filter(Boolean).join(", ")}</small><b>{formatNaira(item.price_naira)}</b></span></button>)}</div> : <div className="workspace-empty"><span>▧</span><h3>No active listings just yet.</h3><p>This seller has no currently available items. Check back soon.</p></div>}
      </> : <div className="workspace-empty"><span>⌂</span><h3>{loading ? "Loading storefront…" : "Storefront unavailable"}</h3><p>{workspaceError || "This seller profile could not be found."}</p></div>}
    </div>}
    {screen === "saved" && <div className="workspace-panel"><div className="workspace-panel-head"><div><h2>Your saved collection</h2><p>Saved on this device and synced to your account when available.</p></div><span>{authUser ? savedListings.length : localSaved.length} saved</span></div>{authUser ? savedListings.length ? <div className="workspace-listings">{savedListings.map(item=><article className="workspace-listing" key={item.id}><div className="workspace-listing-art">♡</div><div className="workspace-listing-copy"><strong>{item.title}</strong><span>{item.category} · {[item.city,item.state].filter(Boolean).join(", ")}</span><small>{formatNaira(item.price_naira)}</small></div><span className="workspace-status status-active">{item.status}</span></article>)}</div> : <div className="workspace-empty"><span>♡</span><h3>Your collection is waiting.</h3><p>Save listings you love and they will be collected here.</p></div> : <div className="workspace-empty"><span>♡</span><h3>Your saved finds</h3><p>Sign in to sync saved items across devices. Your current device has {localSaved.length} saved items.</p><button className="workspace-primary" onClick={onLogin}>Sign in to sync</button></div>}</div>}
    {screen === "account" && <div className="workspace-panel workspace-profile-panel"><div className="workspace-profile-avatar">{(profile?.display_name||authUser?.name||authUser?.email||"A").slice(0,1).toUpperCase()}</div><div><span className="eyebrow">ALOKO MEMBER</span><h2>{profile?.display_name||authUser?.name||"Welcome to Aloko"}</h2><p>{authUser?.email}</p><div className="workspace-profile-meta"><span>{profile?.account_type||"Individual account"}</span><span>{profile?.role||"Marketplace member"}</span></div></div><button className="workspace-secondary" onClick={onSignOut}>Sign out</button></div>}
  </section>;
}

function App() {
  const [typedHeadline, setTypedHeadline] = useState("");
  const [activeScreen, setActiveScreen] = useState("home");
  const [activeConversationId, setActiveConversationId] = useState("");
  const [sellerStoreId, setSellerStoreId] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  useEffect(() => {
    let phraseIndex = 0;
    let characterIndex = 0;
    let timeout;
    const typeCurrentPhrase = () => {
      const phrase = heroTypingPhrases[phraseIndex];
      if (characterIndex < phrase.length) {
        characterIndex += 1;
        setTypedHeadline(phrase.slice(0, characterIndex));
        timeout = window.setTimeout(typeCurrentPhrase, 62);
        return;
      }
      timeout = window.setTimeout(() => {
        phraseIndex = (phraseIndex + 1) % heroTypingPhrases.length;
        characterIndex = 0;
        setTypedHeadline("");
        timeout = window.setTimeout(typeCurrentPhrase, 220);
      }, 1750);
    };
    timeout = window.setTimeout(typeCurrentPhrase, 350);
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
    const params = new URLSearchParams({ limit: "24" });
    if (selectedLocation !== "All locations") params.set("state", selectedLocation);
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/listings?${params.toString()}`, { signal: controller.signal })
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
  }, [listingReloadKey, selectedLocation, query]);

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
    (selectedLocation === "All locations" || p.state === selectedLocation || p.place?.split(", ").includes(selectedLocation)) &&
    (selectedCondition === "Any condition" || p.condition === selectedCondition)
  ), [products, query, activeCategory, savedOnly, saved, selectedLocation, selectedCondition]);
  const visibleProducts = useMemo(() => sortListings(filtered, sortOrder, products), [filtered, sortOrder, products]);

  const showNotice = (message) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
  };

  const toggleSaved = (id) => {
    const wasSaved = saved.includes(id);
    setSaved(old => wasSaved ? old.filter(x => x !== id) : [...old, id]);
    if (authUser && hasAccessToken()) {
      (wasSaved ? unsaveListing(id) : saveListing(id)).then(result => {
        if (!result.ok) showNotice(result.data?.error || "Could not sync saved item.");
      }).catch(() => showNotice("Saved locally. Account sync is temporarily unavailable."));
    }
    showNotice(wasSaved ? "Removed from saved." : "Saved to your collection.");
  };

  const navigate = (screen) => {
    setActiveScreen(screen);
    setSelectedListing(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSellerStore = (sellerId) => {
    if (!sellerId) { showNotice("Seller storefront is unavailable for this listing."); return; }
    setSellerStoreId(sellerId);
    navigate("store");
  };

  const startConversation = async (listingId) => {
    const result = await openConversation(listingId);
    if (result.ok) {
      setActiveConversationId(result.data?.conversation?.id || "");
      navigate("inbox");
      showNotice("Conversation ready. Send the seller a message.");
    }
    return result;
  };

  return (
    <div className="app-shell">
      <header className="topbar flagship-topbar">
        <div className="wrap topbar-inner">
          <button type="button" className="brand flagship-brand" onClick={()=>navigate("home")} aria-label="Aloko home">
            <img className="brand-mark-image" src="/aloko-mark.svg" alt="" /><span className="brand-text">Aloko</span>
          </button>
          <nav className="main-nav app-main-nav" aria-label="Main navigation">
            <button className={activeScreen==="home"?"nav-current":""} onClick={()=>navigate("home")}>Home</button>
            <button className={activeScreen==="home"?"":" "} onClick={()=>{navigate("home");setTimeout(()=>document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}),80);}}>Discover</button>
            <button className={activeScreen==="seller"?"nav-current":""} onClick={()=>navigate("seller")}>Sell</button>
            <button className={activeScreen==="inbox"?"nav-current":""} onClick={()=>navigate("inbox")}>Messages</button>
            <button className={activeScreen==="saved"?"nav-current":""} onClick={()=>navigate("saved")}>Saved</button>
          </nav>
          <nav className="nav-actions" aria-label="Account">
            <label className="header-state-picker" aria-label="Choose your state"><span>⌖</span><select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}><option value="All locations">Nigeria</option>{nigeriaStates.map(state => <option key={state} value={state}>{state}</option>)}</select></label>
            <button type="button" className="nav-search-icon" aria-label="Focus search" onClick={() => document.querySelector(".hero-search input")?.focus()}>⌕</button>
            <button type="button" className="ghost-button" onClick={() => authUser ? navigate("account") : (setAccountMode("login"), setAccountModalOpen(true))}>{authUser ? "My account" : "Login"}</button>
            {!authUser && <button type="button" className="account-create-button" onClick={() => { setAccountMode("signup"); setAccountModalOpen(true); }}>Create Account</button>}
            <button className="mobile-saved-toggle" aria-pressed={savedOnly} onClick={() => { setSavedOnly(v => !v); setActiveCategory("All"); }}>{savedOnly ? "Browse all" : `Saved (${saved.length})`}</button>
            <button className="post-button" onClick={() => setListingFormOpen(true)}>Start Selling</button>
          </nav>
        </div>
      </header>
      <div className="announcement-ticker" aria-label="Aloko marketplace updates"><div className="ticker-track"><span>PLATFORM FOR ALL DECLUTTER BUSINESSES</span><b>✦</b><span>Sell pre-loved items</span><b>✦</b><span>Give usable things away</span><b>✦</b><span>Book home clear-outs</span><b>✦</b><span>Discover bulk reuse deals</span><b>✦</b><span>Find trusted local organisers</span><b>✦</b><span>Make room. Create value.</span><b>✦</b><span>PLATFORM FOR ALL DECLUTTER BUSINESSES</span><b>✦</b><span>Sell pre-loved items</span><b>✦</b><span>Give usable things away</span><b>✦</b><span>Book home clear-outs</span><b>✦</b><span>Discover bulk reuse deals</span><b>✦</b></div></div>

      <main>
        {activeScreen === "home" ? <>
        <section className="hero flagship-hero" id="top">
          <div className="hero-inner wrap">
            <div className="hero-copy">
              <span className="eyebrow hero-eyebrow">Nigeria’s Reuse &amp; Decluttering Marketplace</span>
              <h1 className="hero-typing-headline"><span>{typedHeadline.includes("Give It.") ? <>{typedHeadline.split("Give It.")[0]}<em className="hero-highlight">Give It.</em>{typedHeadline.split("Give It.").slice(1).join("Give It.")}</> : typedHeadline}</span><i aria-hidden="true" /></h1>
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
        <section className="featured-placements wrap" aria-label="Featured Aloko promotions">
          <div className="featured-placements-head"><div><span className="eyebrow">Handpicked by Aloko</span><h2>Discover what’s worth passing on.</h2></div><span className="featured-note">FEATURED SPACES</span></div>
          <div className="featured-portrait-grid">
            <button className="featured-portrait-card featured-portrait-home" type="button" onClick={() => { setActiveCategory("Home & Living"); document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}); }}>
              <img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85" alt="Beautifully organised contemporary living room" loading="lazy"/>
              <span className="featured-stamp">FEATURED</span><span className="featured-portrait-copy"><small>THE HOME EDIT</small><strong>Make room for better living.</strong><em>Explore home finds ↗</em></span>
            </button>
            <button className="featured-portrait-card featured-portrait-seller" type="button" onClick={() => setListingFormOpen(true)}>
              <img src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=85" alt="Small business owner preparing products for customers" loading="lazy"/>
              <span className="featured-stamp">FEATURED</span><span className="featured-portrait-copy"><small>SELLER SPOTLIGHT</small><strong>Give useful things a second story.</strong><em>Open your Aloko store ↗</em></span>
            </button>
            <button className="featured-portrait-card featured-portrait-services" type="button" onClick={() => document.getElementById("services")?.scrollIntoView({behavior:"smooth"})}>
              <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=85" alt="Professional home organisation and cleaning service" loading="lazy"/>
              <span className="featured-stamp">FEATURED</span><span className="featured-portrait-copy"><small>DECLUTTER SERVICES</small><strong>From full clear-outs to fresh starts.</strong><em>Explore services ↗</em></span>
            </button>
          </div>
        </section>

        <section className="declutter-network wrap" id="declutter"><div className="network-heading"><span className="eyebrow">One platform. Every stage of decluttering.</span><h2>Built for the people who help spaces, things and communities start fresh.</h2><p>Aloko brings decluttering businesses, professional organisers, reuse sellers, charities and people looking for a fresh start into one discoverable marketplace.</p></div><div className="service-ticker" aria-label="20 decluttering business services">{["Home decluttering","Office clear-outs","Moving & relocation","Estate clearances","Wardrobe edits","Furniture removal","Appliance reuse","Donation collection","Charity redistribution","Storage organisation","Garage clear-outs","Kitchen resets","Paperwork sorting","E-waste collection","Bulk item resale","Property staging","Student move-outs","Deep organisation","Business clear-outs","Responsible disposal"].map((item,i)=><span key={item}><i>{String(i+1).padStart(2,"0")}</i>{item}</span>)}</div></section>

        <section className="search-dock wrap" aria-label="Search marketplace">
          <div className="hero-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for items, categories or locations…" aria-label="Search listings"/><label>⌖ <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}><option value="All locations">All Nigeria</option>{nigeriaStates.map(state => <option key={state} value={state}>{state}</option>)}</select></label><button type="button" onClick={() => document.getElementById("explore")?.scrollIntoView({behavior:"smooth"})}>⌕ &nbsp; Search</button></div>
        </section>

        <section className="categories wrap flagship-categories" id="categories" aria-label="Categories">
          <div className="section-head">
            <h2>Explore categories</h2>
            <button className="view-all" onClick={() => { setActiveCategory("All"); setQuery(""); setSavedOnly(false); }}>View all</button>
          </div>
          <div className="category-row">
            {(showAllCategories ? categories : categories.slice(0, 8)).map(([icon, label]) => (
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
            <button className="category-chip category-more" type="button" aria-expanded={showAllCategories} onClick={() => setShowAllCategories(v => !v)}><span className="category-icon">＋</span><span>{showAllCategories ? "Less" : "More"}</span></button>
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
                    ? <img src={p.image.startsWith("http") ? p.image : `https://images.unsplash.com/${p.image}?auto=format&fit=crop&w=700&q=80`} alt={p.title} loading="lazy"/>
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

        <section className="community-showcase wrap" aria-label="Aloko people and community">
          <div className="community-copy"><span className="eyebrow">People make reuse powerful</span><h2>Good finds. Real people. Better spaces.</h2><p>Aloko brings buyers, decluttering professionals, small businesses and community givers together — helping useful things find their next home.</p><div className="community-actions"><button type="button" onClick={() => { setAccountMode("signup"); setAccountModalOpen(true); }}>Join the community <span>↗</span></button><button type="button" onClick={() => setListingFormOpen(true)}>Become a seller</button></div></div>
          <div className="community-people">
            <article className="community-person community-seller"><img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85" alt="Portrait of a woman representing an Aloko seller" loading="lazy"/><div><span>SELLER STORIES</span><strong>Turn extra into opportunity.</strong></div></article>
            <article className="community-person community-buyer"><img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=85" alt="Portrait of a man representing an Aloko buyer" loading="lazy"/><div><span>BUYER COMMUNITY</span><strong>Find value in every new-to-you item.</strong></div></article>
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
        </> : <WorkspaceScreen screen={activeScreen} authUser={authUser} onLogin={() => { setAccountMode("login"); setAccountModalOpen(true); }} onSell={() => setListingFormOpen(true)} onNotice={showNotice} localSaved={saved} initialConversationId={activeConversationId} onConversationOpened={setActiveConversationId} sellerStoreId={sellerStoreId} onOpenListing={(item) => { setActiveScreen("home"); setSelectedListing(normalizeLiveListing(item)); window.scrollTo({ top: 0, behavior: "smooth" }); }} onSignOut={async () => { await signOutFromAloko(); setAuthUser(null); try { window.localStorage.removeItem("aloko:access-token"); } catch {} navigate("home"); showNotice("You have signed out."); }} />}
      </main>
      <nav className="mobile-app-nav" aria-label="App navigation">{[["home","⌂","Home"],["seller","＋","Sell"],["inbox","✉","Inbox"],["saved","♡","Saved"],["account","◉","Account"]].map(([id,icon,label])=><button key={id} className={activeScreen===id?"active":""} onClick={()=>navigate(id)}><span>{icon}</span><small>{label}</small></button>)}</nav>

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
        <div className="item-detail-screen">
          <div className="item-detail-topbar"><button type="button" onClick={() => setSelectedListing(null)}>← <span>Back to Aloko</span></button><span>ALOKO / ITEM DETAILS</span><button type="button" onClick={() => toggleSaved(selectedListing.id)}>{saved.includes(selectedListing.id) ? "♥ Saved" : "♡ Save item"}</button></div>
          <main className="item-detail-wrap">
            <div className="item-detail-breadcrumb">Marketplace <span>/</span> {selectedListing.category} <span>/</span> {selectedListing.title}</div>
            <div className="item-detail-layout">
              <section className="item-detail-gallery">
                <div className="item-detail-main-image">{selectedListing.image ? <img src={selectedListing.image.startsWith("http") ? selectedListing.image : `https://images.unsplash.com/${selectedListing.image}?auto=format&fit=crop&w=1400&q=90`} alt={selectedListing.title}/> : <div className="product-image-placeholder"><span>aloko.</span></div>}<span className="item-detail-kind">{selectedListing.kind === "giveaway" ? "FREE GIVEAWAY" : selectedListing.kind === "bulk" ? "BULK DECLUTTER" : "PRE-LOVED FIND"}</span></div>
                <div className="item-detail-image-note"><span>✦</span> Ask the seller for additional photos or a viewing before payment.</div>
              </section>
              <section className="item-detail-summary">
                <div className="item-detail-labels"><span>{selectedListing.category}</span><span>{selectedListing.preview ? "SAMPLE PREVIEW" : "ALOKO LISTING"}</span></div>
                <h1>{selectedListing.title}</h1>
                <div className="item-detail-price">{selectedListing.price}</div>
                <p className="item-detail-description">{selectedListing.description}</p>
                <div className="item-detail-specs">
                  <div><span>Item condition</span><strong>{selectedListing.condition || "Not specified"}</strong></div>
                  <div><span>Quantity available</span><strong>{selectedListing.quantity || 1}</strong></div>
                  <div><span>Category</span><strong>{selectedListing.category}</strong></div>
                  <div><span>Location</span><strong>{selectedListing.place || "Nigeria"}</strong></div>
                  <div><span>Collection</span><strong>{selectedListing.pickupAvailable ? "Pickup available" : "Confirm with seller"}</strong></div>
                  <div><span>Delivery</span><strong>{selectedListing.deliveryAvailable ? "Seller offers delivery" : "Arrange with seller"}</strong></div>
                </div>
                <div className="item-detail-seller">
                  <img src={selectedListing.sellerAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=180&q=80"} alt="Seller profile portrait"/>
                  <div><span>LISTED BY</span><strong>{selectedListing.sellerName}</strong><small>{String(selectedListing.sellerType || "individual").replaceAll("_"," ")} · {selectedListing.place || "Nigeria"}</small></div>
                  <button type="button" className="seller-store-link" onClick={() => openSellerStore(selectedListing.sellerId)}>View store →</button><span className="seller-trust-mark">✓</span>
                </div>
                <div className="item-detail-actions">
                  <button className="item-contact-primary" onClick={async () => {
                    if (selectedListing.preview) { showNotice("This is a sample preview, not a live seller listing."); return; }
                    if (!selectedListing.live) { showNotice("Messaging is only available on live listings."); return; }
                    if (!hasAccessToken()) { showNotice("Sign in is required to contact this seller."); setAccountMode("login"); setAccountModalOpen(true); return; }
                    showNotice("Opening your conversation…");
                    const result = await startConversation(selectedListing.id);
                    if (result.ok) { setActiveConversationId(result.data?.conversation?.id || ""); navigate("inbox"); showNotice("Conversation ready. Send the seller a message."); }
                    else if (result.status === 401) { setAccountMode("login"); setAccountModalOpen(true); showNotice("Please sign in to contact this seller."); }
                    else showNotice(result.data?.error || "Could not start a conversation.");
                  }}>Contact seller <span>→</span></button>
                  <button className="item-contact-secondary" onClick={() => toggleSaved(selectedListing.id)}>{saved.includes(selectedListing.id) ? "Saved to your list" : "Save for later"}</button>
                </div>
                <p className="item-detail-safety">Stay safe: inspect the item, confirm its condition and agree on a secure collection or delivery arrangement with the seller.</p>
              </section>
            </div>
            <section className="item-detail-more"><div><span className="eyebrow">A better way to pass it on</span><h2>Every item deserves a thoughtful next chapter.</h2><p>Aloko helps people and decluttering businesses connect useful items with the people who can use them next.</p></div><button type="button" onClick={() => { setSelectedListing(null); document.getElementById("explore")?.scrollIntoView({behavior:"smooth"}); }}>Explore more listings ↗</button></section>
          </main>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

export default App;
