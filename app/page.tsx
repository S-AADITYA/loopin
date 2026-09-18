"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Venue = { id: string; name: string; category: string; emoji: string; city: string | null };
type Checkin = { id: string; venue_id: string; user_id: string; points: number; created_at: string; profiles?: { display_name: string } };
type Post = { id: string; venue_id: string; user_id: string; caption: string; created_at: string; profiles?: { display_name: string } };
type Order = { id: string; venue_id: string; user_id: string; items: string[]; total: number; status: string; created_at: string };
type InventoryItem = { id: string; venue_id: string; sku: string; name: string; qty: number; max_qty: number };

const MENU_ITEMS = ["House Special", "Signature Cocktail", "Cold Brew", "Sliders", "Flatbread", "Mocktail", "Fries", "Pasta"];

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [view, setView] = useState<"guest" | "restaurant" | "intel">("guest");

  const [venues, setVenues] = useState<Venue[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeVenueId, setActiveVenueId] = useState<string>("");
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  };

  // ---- auth ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendMagicLink = async () => {
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    setAuthMsg(error ? error.message : "Check your email for a login link.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ---- data loading ----
  const loadAll = useCallback(async () => {
    const [{ data: v }, { data: c }, { data: p }, { data: o }, { data: inv }] = await Promise.all([
      supabase.from("venues").select("*").order("name"),
      supabase.from("checkins").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(200),
      supabase.from("posts").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("inventory").select("*")
    ]);
    if (v) {
      setVenues(v as Venue[]);
      if (!activeVenueId && v.length) setActiveVenueId(v[0].id);
    }
    if (c) setCheckins(c as any);
    if (p) setPosts(p as any);
    if (o) setOrders(o as any);
    if (inv) setInventory(inv as any);
  }, [activeVenueId]);

  useEffect(() => {
    if (!session) return;
    // Initial fetch + realtime subscribe: syncing React with Supabase (an external
    // system). setState runs in async callbacks, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();

    const channel = supabase
      .channel("loopin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ---- derived ----
  const myId = session?.user?.id;
  const myCheckins = useMemo(() => checkins.filter((c) => c.user_id === myId), [checkins, myId]);
  const myPoints = myCheckins.length * 10;
  const myStreak = useMemo(
    () => new Set(myCheckins.map((c) => new Date(c.created_at).toDateString())).size,
    [myCheckins]
  );

  // ---- actions ----
  const checkIn = async (venueId: string) => {
    if (!myId) return;
    const { error: e1 } = await supabase.from("checkins").insert({ venue_id: venueId, user_id: myId, points: 10 });
    if (e1) return showToast("Error: " + e1.message);
    const venue = venues.find((v) => v.id === venueId);
    const captions = [
      `Perfect evening at ${venue?.name} 🌙`,
      `Back at ${venue?.name}, obviously.`,
      `New memory unlocked at ${venue?.name}.`
    ];
    await supabase.from("posts").insert({
      venue_id: venueId,
      user_id: myId,
      // Demo-data generator inside an event handler, never called during render.
      // eslint-disable-next-line react-hooks/purity
      caption: captions[Math.floor(Math.random() * captions.length)]
    });
    showToast("✅ Checked in · +10 pts");
  };

  const placeOrder = async () => {
    if (!myId || !activeVenueId) return;
    // Demo-data generators inside an event handler, never called during render.
    const itemCount = 1 + Math.floor(Math.random() * 3);
    const items = Array.from({ length: itemCount }, () => MENU_ITEMS[Math.floor(Math.random() * MENU_ITEMS.length)]);
    const total = items.length * (150 + Math.floor(Math.random() * 250));
    const { error } = await supabase.from("orders").insert({ venue_id: activeVenueId, user_id: myId, items, total, status: "open" });
    if (error) return showToast("Error: " + error.message);
    showToast("🧾 Order placed");
  };

  const closeOrder = async (orderId: string) => {
    await supabase.from("orders").update({ status: "served" }).eq("id", orderId);
  };

  const adjustStock = async (item: InventoryItem, delta: number) => {
    const newQty = Math.max(0, item.qty + delta);
    await supabase.from("inventory").update({ qty: newQty }).eq("id", item.id);
  };

  // ---- render ----
  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-sm w-full">
          <h1 className="text-xl font-extrabold mb-1">
            Loop<span className="text-accent">in</span>
          </h1>
          <p className="text-sm text-[#9aa3b5] mb-4">Sign in with a magic link — no password to manage.</p>
          <input
            className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm mb-2 bg-[#171b24] border-[#242938]"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={sendMagicLink} className="w-full bg-accent text-white rounded-lg py-2 text-sm font-semibold">
            Send magic link
          </button>
          {authMsg && <p className="text-xs text-[#9aa3b5] mt-3">{authMsg}</p>}
        </div>
      </main>
    );
  }

  const activeVenue = venues.find((v) => v.id === activeVenueId);
  const venueOrders = orders.filter((o) => o.venue_id === activeVenueId);
  const venueInventory = inventory.filter((i) => i.venue_id === activeVenueId);
  const venueCheckins = checkins.filter((c) => c.venue_id === activeVenueId);

  const byUser: Record<string, number> = {};
  checkins.forEach((c) => {
    const name = c.profiles?.display_name || "Guest";
    byUser[name] = (byUser[name] || 0) + 1;
  });
  const ranked = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lowStock = inventory.filter((i) => i.qty / i.max_qty < 0.25);
  const uniqueGuests = new Set(checkins.map((c) => c.user_id)).size;
  const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <main className="max-w-lg mx-auto p-4 pb-28">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-accent2 text-[#062018] font-bold text-sm px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}

      <header className="flex items-center justify-between py-2 mb-2">
        <div className="text-xl font-extrabold">
          Loop<span className="text-accent">in</span>
        </div>
        <button onClick={signOut} className="text-xs text-[#9aa3b5] underline">
          Sign out
        </button>
      </header>

      {view === "guest" && (
        <>
          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Your loop</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="stat">
                <div className="text-2xl font-extrabold text-accent2">{myPoints}</div>
                <div className="text-[11px] text-[#9aa3b5]">POINTS</div>
              </div>
              <div className="stat">
                <div className="text-2xl font-extrabold text-accent2">{myStreak}</div>
                <div className="text-[11px] text-[#9aa3b5]">ACTIVE DAYS</div>
              </div>
            </div>
          </div>

          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Nearby venues</h2>
            {venues.map((v) => {
              const already = myCheckins.some(
                (c) => c.venue_id === v.id && new Date(c.created_at).toDateString() === new Date().toDateString()
              );
              return (
                <div key={v.id} className="flex items-center gap-3 bg-[#171b24] border border-[#242938] rounded-xl p-3 mb-2">
                  <div className="text-2xl w-10 text-center">{v.emoji}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{v.name}</div>
                    <div className="text-xs text-[#9aa3b5]">
                      {v.category} · {v.city}
                    </div>
                  </div>
                  <button
                    onClick={() => checkIn(v.id)}
                    className={`text-xs font-semibold rounded-lg px-3 py-2 ${
                      already ? "bg-[#171b24] border border-[#242938]" : "bg-accent text-white"
                    }`}
                  >
                    {already ? "Checked in" : "Check in"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold mb-2">Live memories feed</h2>
            {posts.length === 0 && <p className="text-sm text-[#9aa3b5]">No memories yet — check in somewhere.</p>}
            {posts.slice(0, 20).map((p) => (
              <div key={p.id} className="border-b border-[#242938] py-2 last:border-none">
                <div className="text-sm font-bold">
                  {p.profiles?.display_name || "Guest"} <span className="pill">{venues.find((v) => v.id === p.venue_id)?.name}</span>
                </div>
                <div className="text-sm">{p.caption}</div>
                <div className="text-[11px] text-[#9aa3b5]">{timeAgo(p.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "restaurant" && (
        <>
          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Choose your venue</h2>
            <select
              className="w-full bg-[#171b24] border border-[#242938] rounded-lg px-3 py-2 text-sm"
              value={activeVenueId}
              onChange={(e) => setActiveVenueId(e.target.value)}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.emoji} {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="card mb-3">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold">Live order queue</h2>
              <span className="pill">{venueOrders.filter((o) => o.status === "open").length} open</span>
            </div>
            {venueOrders.length === 0 && <p className="text-sm text-[#9aa3b5]">No orders yet.</p>}
            {venueOrders.slice(0, 15).map((o) => (
              <div key={o.id} className="flex justify-between items-center bg-[#171b24] border border-[#242938] rounded-lg p-3 mb-2">
                <div>
                  <div className="text-sm font-bold">{o.items.join(", ")}</div>
                  <div className="text-[11px] text-[#9aa3b5]">
                    ₹{o.total} · {timeAgo(o.created_at)}
                  </div>
                </div>
                {o.status === "open" ? (
                  <button onClick={() => closeOrder(o.id)} className="bg-accent text-white text-xs font-semibold rounded-lg px-3 py-2">
                    Mark served
                  </button>
                ) : (
                  <span className="pill">Served</span>
                )}
              </div>
            ))}
            <button onClick={placeOrder} className="mt-1 text-xs font-semibold bg-accent text-white rounded-lg px-3 py-2">
              + Simulate new order
            </button>
          </div>

          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Inventory / stock</h2>
            {venueInventory.map((item) => {
              const pct = Math.round((item.qty / item.max_qty) * 100);
              const low = pct < 25;
              return (
                <div key={item.id} className="mb-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-semibold">
                      {item.name} {low && <span className="pill">Low</span>}
                    </div>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => adjustStock(item, -1)} className="bg-[#171b24] border border-[#242938] rounded-lg px-2 text-xs">
                        −
                      </button>
                      <span className="text-xs min-w-[24px] text-center">{item.qty}</span>
                      <button onClick={() => adjustStock(item, 1)} className="bg-[#171b24] border border-[#242938] rounded-lg px-2 text-xs">
                        +
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 rounded bg-[#242938] mt-1 overflow-hidden">
                    <div className={`h-full ${low ? "bg-danger" : "bg-accent2"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold mb-2">Check-ins here</h2>
            {venueCheckins.length === 0 && <p className="text-sm text-[#9aa3b5]">No check-ins yet.</p>}
            {venueCheckins.slice(0, 10).map((c) => (
              <div key={c.id} className="text-sm border-b border-[#242938] py-1.5 last:border-none">
                <span className="font-bold">{c.profiles?.display_name || "Guest"}</span>{" "}
                <span className="text-[11px] text-[#9aa3b5]">checked in · {timeAgo(c.created_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "intel" && (
        <>
          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Overview</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="stat">
                <div className="text-2xl font-extrabold text-accent2">{checkins.length}</div>
                <div className="text-[11px] text-[#9aa3b5]">CHECK-INS</div>
              </div>
              <div className="stat">
                <div className="text-2xl font-extrabold text-accent2">{orders.length}</div>
                <div className="text-[11px] text-[#9aa3b5]">ORDERS</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="stat">
                <div className="text-2xl font-extrabold text-accent2">{uniqueGuests}</div>
                <div className="text-[11px] text-[#9aa3b5]">UNIQUE GUESTS</div>
              </div>
              <div className="stat">
                <div className="text-2xl font-extrabold text-accent2">₹{revenue.toLocaleString("en-IN")}</div>
                <div className="text-[11px] text-[#9aa3b5]">REVENUE</div>
              </div>
            </div>
          </div>

          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Top regulars</h2>
            {ranked.length === 0 && <p className="text-sm text-[#9aa3b5]">No data yet.</p>}
            {ranked.map(([name, count], i) => (
              <div key={name} className="flex justify-between py-1.5">
                <div className="text-sm">
                  {i + 1}. {name}
                </div>
                <span className="pill">
                  {count * 10} pts · {count} visits
                </span>
              </div>
            ))}
          </div>

          <div className="card mb-3">
            <h2 className="text-sm font-semibold mb-2">Low stock alerts</h2>
            {lowStock.length === 0 && <p className="text-sm text-[#9aa3b5]">All stocked up.</p>}
            {lowStock.map((i) => (
              <div key={i.id} className="flex justify-between py-1">
                <span className="text-sm">
                  {i.name} — {venues.find((v) => v.id === i.venue_id)?.name}
                </span>
                <span className="pill">{i.qty} left</span>
              </div>
            ))}
          </div>
        </>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-panel border-t border-[#242938] flex justify-center py-2 px-3">
        <div className="max-w-lg w-full flex gap-2">
          {(["guest", "restaurant", "intel"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 text-center py-2 rounded-xl text-xs font-semibold ${
                view === v ? "bg-[#171b24] text-accent" : "text-[#9aa3b5]"
              }`}
            >
              {v === "guest" ? "🧭 Guest" : v === "restaurant" ? "🍽️ Restaurant" : "🧠 Intelligence"}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
