import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, Users, Plus, X, Phone, Mail, Search,
  TrendingUp, Clock, CheckCircle2, ChevronLeft,
  ArrowLeft, Target, Wallet, CalendarClock,
  Sparkles, DollarSign, RefreshCw, AlertCircle, Pencil, LayoutGrid, List, LogOut,
  Maximize2, Minimize2, Trash2, Archive, RotateCcw, Megaphone, Power
} from "lucide-react";

// ============ API ============
// שכבת ה-API ב-n8n. אם הכתובת משתנה, עדכן כאן בלבד.
const API_BASE = "https://ariebitton.app.n8n.cloud/webhook";
const API = {
  leads:  `${API_BASE}/crm/leads`,
  add:    `${API_BASE}/crm/lead/add`,
  update: `${API_BASE}/crm/lead/update`,
  stage:  `${API_BASE}/crm/lead/stage`,
  delete: `${API_BASE}/crm/lead/delete`,
  deleted: `${API_BASE}/crm/leads/deleted`,
  restore: `${API_BASE}/crm/lead/restore`,
  stats: `${API_BASE}/crm/stats`,
  costAdd: `${API_BASE}/crm/campaign-cost/add`,
  costDelete: `${API_BASE}/crm/campaign-cost/delete`,
  campaigns: `${API_BASE}/crm/campaigns`,
  campaignSave: `${API_BASE}/crm/campaign/save`,
  summarize: `${API_BASE}/crm/lead/summarize`,
};

// ============ Kappa brand ============
const KAPPA = {
  teal: "#1FA9B8", tealDark: "#178793", tealSoft: "#E8F6F8",
  graphite: "#4A4A4A", ink: "#2A2E33",
};

// ============================================================
// Google Sign-In — restricted to @kappainv.com
// ------------------------------------------------------------
// ⚠️ REPLACE with the real OAuth Client ID before deploying.
// Google Cloud Console → APIs & Services → Credentials →
// Create Credentials → OAuth client ID → Web application →
// add https://kappa-crm.vercel.app under Authorized JavaScript origins.
const GOOGLE_CLIENT_ID = "297783038765-gg4nu6kfrcp37lao2f3nq9fqiagqpf25.apps.googleusercontent.com";
const ALLOWED_DOMAIN = "kappainv.com";

function b64urlToBytes(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
}
let _jwksCache = null;
async function getGoogleJWKS() {
  if (_jwksCache) return _jwksCache;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  _jwksCache = await res.json();
  return _jwksCache;
}
// Verifies a Google Identity Services ID token's RS256 signature against
// Google's live public keys (Web Crypto, no library/backend needed) and
// checks the core claims. This confirms the token really was issued by
// Google just now for our client — it is NOT the same as protecting the
// n8n webhooks themselves, which remain reachable directly by URL.
async function verifyGoogleIdToken(jwt) {
  try {
    const parts = String(jwt).split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = b64urlToJson(h);
    const payload = b64urlToJson(p);
    if (payload.aud !== GOOGLE_CLIENT_ID) return null;
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    const jwks = await getGoogleJWKS();
    const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? payload : null;
  } catch {
    return null;
  }
}
// Loads the Google Identity Services script once and initializes it,
// always dispatching to the LATEST onCredential closure via a ref.
function useGoogleIdentity(onCredential) {
  const [ready, setReady] = useState(!!(typeof window !== "undefined" && window.google && window.google.accounts));
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  useEffect(() => {
    if (ready) return;
    const existing = document.getElementById("google-identity-script");
    if (existing) { existing.addEventListener("load", () => setReady(true)); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true; s.id = "google-identity-script";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, [ready]);
  useEffect(() => {
    if (!ready || !window.google || !window.google.accounts) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => cbRef.current(response),
      auto_select: false,
    });
  }, [ready]);
  return ready;
}
function LoginScreen({ onCredential, error, checking }) {
  const ready = useGoogleIdentity(onCredential);
  const btnRef = useRef(null);
  useEffect(() => {
    if (ready && btnRef.current && window.google && window.google.accounts) {
      btnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline", size: "large", shape: "pill", text: "signin_with", locale: "iw",
      });
    }
  }, [ready]);
  return (
    <div dir="rtl" style={styles.loginWrap}>
      <style>{css}</style>
      <div style={styles.loginCard}>
        <div style={styles.loginLogoWrap}><img src="/Logo.jpg" alt="Kappa Real Estate Investments" style={styles.loginLogoImg} /></div>
        <h2 style={styles.loginTitle}>מערכת ה-CRM של קאפה</h2>
        <p style={styles.loginSub}>הכניסה מוגבלת לצוות קאפה בלבד (kappainv.com@)</p>
        <div style={styles.loginBtnWrap}>
          {!ready && <div style={styles.loginLoadingText}>טוען כניסה עם Google…</div>}
          <div ref={btnRef} />
          {checking && <div style={styles.loginLoadingText}>מאמת…</div>}
        </div>
        {error && <div style={styles.loginError}>{error}</div>}
      </div>
    </div>
  );
}

// ============ Pipeline stages ============
const STAGES = [
  { id: "new",        label: "חדש",            color: "#6366F1", soft: "#EEF0FF" },
  { id: "contact",    label: "בטיפול",         color: "#0EA5E9", soft: "#E6F6FE" },
  { id: "meeting",    label: "נקבעה פגישה",    color: "#8B5CF6", soft: "#F1EBFE" },
  { id: "future",     label: "אולי בעתיד",     color: "#F59E0B", soft: "#FEF4E2" },
  { id: "interested", label: "מעוניין להשקיע", color: "#10B981", soft: "#E6F8F1" },
  // "closed" gets its own green (the old teal was a near-match for the brand
  // colour) and both terminal stages are muted, so board contrast goes to the
  // stages that still need work.
  { id: "closed",     label: "סגר",            color: "#15803D", soft: "#E7F6EC", muted: true },
  { id: "lost",       label: "לא מעוניין",     color: "#94A3B8", soft: "#F1F5F9", muted: true },
];
const ALL_STAGES = STAGES;
const stageOf = (id) => ALL_STAGES.find((s) => s.id === id) || STAGES[STAGES.length - 1];
const LOST_REASONS = ["לא מתאים", "לא מעוניין"];
// Stages that represent open, still-moving potential (excludes closed/lost).
const FUNNEL_STAGES = ["new", "contact", "meeting", "future", "interested"];
// Date fields (besides created_at) a lead can be filtered by, for the
// "other date" filter on the Leads screen.
const DATE_FILTER_FIELDS = [
  { id: "meeting_date", label: "מועד פגישה" },
  { id: "last_contact", label: "קשר אחרון" },
  { id: "next_call", label: "מועד שיחה הבאה" },
];

// ---- Tasks ----------------------------------------------------------------
// Tasks live on the lead itself as a JSON array in a "tasks" column, so they
// ride the existing update webhook — no new endpoint, and a task can never be
// orphaned from its lead. next_call stays as the single "next touch" date; a
// task is anything with an owner and a due date.
const TASK_TYPES = [
  { id: "call", label: "שיחה" },
  { id: "email", label: "מייל" },
  { id: "meeting", label: "פגישה" },
  { id: "doc", label: "מסמכים" },
  { id: "other", label: "אחר" },
];
const taskTypeLabel = (id) => (TASK_TYPES.find((t) => t.id === id) || TASK_TYPES[4]).label;
function parseTasks(lead) {
  let raw = lead && lead.tasks;
  if (typeof raw === "string" && raw.trim()) {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  return Array.isArray(raw) ? raw.filter((t) => t && t.title) : [];
}
const openTasks = (lead) => parseTasks(lead).filter((t) => !t.done);
const newTaskId = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const JOURNEY = ["החלטה", "הסכמים", "חתימת כל הצדדים", "העברה בנקאית", "גישה לאגורה", "פרטי תשלום ראשון"];

// Fallback campaign list. Campaigns now live in the Campaigns tab of the sheet
// and are fetched at startup; this list is only used if that fetch fails, so a
// network problem can never leave the new-lead form without a campaign field.
// "אחר" is not a stored campaign — it's the free-text escape hatch in the UI.
const CAMPAIGNS_FALLBACK = ["הפניה", "שיחה יזומה", "פנייה של הלקוח", "וובינר", "קמפיין פייסבוק", "נטוורקינג", "אתר אינטרנט - SEO", "PPC"];
const OTHER = "אחר";

// Campaigns are shared by the lead forms, the stats tabs and the management
// screen, so they're provided via context rather than threaded through every
// component. The hook always returns a usable shape, so a component rendered
// outside the provider (or before the fetch lands) still works.
const CampaignsCtx = React.createContext(null);
function useCampaigns() {
  const v = React.useContext(CampaignsCtx);
  if (v) return v;
  return { rows: [], all: CAMPAIGNS_FALLBACK, active: CAMPAIGNS_FALLBACK, reload: () => {}, save: async () => false, state: "idle" };
}
// Events + campaign costs are one payload (/crm/stats) consumed by three
// screens (statistics, campaign management, a lead's stage history). One
// provider fetches it once and hands the same data to all of them.
const StatsCtx = React.createContext(null);
function useStats() {
  const v = React.useContext(StatsCtx);
  return v || { events: [], costs: [], state: "idle", ensure: () => {}, reload: async () => {}, fx: DEFAULT_FX, setFx: () => {} };
}

// Costs are recorded in shekels and dollars. Keeping them apart produces
// "₪12,000 + $400" — a figure nobody can rank or compare — so a single stored
// rate converts everything into one display currency, with the raw split kept
// as the tooltip.
const FX_KEY = "kappa_fx";
const DEFAULT_FX = { usdIls: 3.7, display: "ILS" };
function loadFx() {
  try {
    const raw = JSON.parse(localStorage.getItem(FX_KEY) || "null");
    if (raw && Number(raw.usdIls) > 0) return { usdIls: Number(raw.usdIls), display: raw.display === "USD" ? "USD" : "ILS" };
  } catch {}
  return DEFAULT_FX;
}

const TRACKS = ["Brick Capital", "Multi Single", "Fix and Flip", "Loan - 8%"];
// Tracks that support compound interest (ריבית דריבית). Only these show the toggle.
const COMPOUND_TRACKS = ["Multi Single", "Brick Capital"];
function isCompoundEligible(track) { return COMPOUND_TRACKS.indexOf(track) !== -1; }
// Normalize a lead's investments into an array of {track, amount, compound}.
// Falls back to the legacy single track+amount fields for older leads.
function parseInvestments(lead) {
  let raw = lead && lead.investments;
  if (typeof raw === "string" && raw.trim()) {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw) && raw.length) {
    return raw.map((r) => ({
      track: r.track || "",
      amount: r.amount === "" || r.amount == null ? "" : Number(r.amount),
      compound: isCompoundEligible(r.track) ? !!r.compound : false,
    }));
  }
  // Legacy fallback: build a single row from track + amount
  if (lead && (lead.track || lead.amount)) {
    return [{ track: lead.track || "", amount: lead.amount === "" || lead.amount == null ? "" : Number(lead.amount), compound: false }];
  }
  return [];
}
function investmentsTotal(rows) {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
function investmentsTracksLabel(rows) {
  return rows.map((r) => r.track).filter(Boolean).join(", ");
}

const fmtMoney = (n) => {
  const num = Number(n);
  return !n || isNaN(num) ? "—" : "$" + num.toLocaleString("en-US");
};
// Search normalization: lowercase + collapsed whitespace.
const normText = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
// Phone normalization: digits only, +972/972 rewritten to a local 0-prefix, so
// 052-123-4567, 0521234567 and +972521234567 all match each other.
const normPhone = (s) => {
  let d = String(s || "").replace(/[^\d]/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
};
const initials = (name) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
const todayStr = () => new Date().toLocaleDateString("en-GB");
// The notes field is append-only (one entry per line); card previews should
// show only the most recent entry, not the whole run-together history.
const lastNote = (summary) => {
  if (!summary) return "";
  const parts = String(summary).split("\n").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};
// Split the append-only notes log into dated entries, newest first.
const noteEntries = (summary) => String(summary || "")
  .split("\n").map((x) => x.trim()).filter(Boolean)
  .map((line) => {
    const m = line.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    return m ? { date: m[1], text: m[2] } : { date: "", text: line };
  })
  .reverse();
// Parse a dd/mm/yyyy string into a Date (or null if invalid/empty).
const parseDMY = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
};
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const fmtDMY = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
// How long a lead has sat in its current stage. stage_since is written on every
// stage change; created_at is the fallback for leads that predate that field.
const STAGE_AGE_LIMIT = 14; // days before a lead counts as "stuck"
const daysInStage = (lead) => {
  const d = parseDMY(lead && (lead.stage_since || lead.created_at));
  if (!d) return null;
  return Math.max(0, Math.round((startOfToday() - d) / 86400000));
};
const isStuck = (lead) => FUNNEL_STAGES.includes(lead.stage) && (daysInStage(lead) || 0) >= STAGE_AGE_LIMIT;
// dd/mm/yyyy comparison
const isDue = (d) => {
  if (!d) return false;
  const p = (s) => { const [dd, mm, yy] = s.split("/").map(Number); return new Date(yy, mm - 1, dd); };
  try { return p(d) <= new Date(); } catch { return false; }
};
// dd/mm/yyyy  ->  yyyy-mm-dd  (what <input type=date> needs)
const dmyToISO = (s) => {
  const d = parseDMY(s);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// yyyy-mm-dd  ->  dd/mm/yyyy  (what the sheet + logic store)
const isoToDMY = (s) => {
  if (!s) return "";
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

// ============================================================
// Track viewport width so we can swap layouts on mobile.
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

// ============================================================
export default function App() {
  const [leads, setLeads] = useState([]);
  const isMobile = useIsMobile();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [refreshing, setRefreshing] = useState(false); // manual refresh — spins the button only
  const [view, setView] = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [toast, setToast] = useState(null);
  const [journeyPrompt, setJourneyPrompt] = useState(null); // { id, resumeStage } pending move into "interested"
  const [confirmDelete, setConfirmDelete] = useState(null); // lead pending permanent deletion
  const [binOpen, setBinOpen] = useState(false); // recycle bin of deleted leads

  // ---- Auth (Google Sign-In, restricted to @kappainv.com) ----
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem("kappa_auth");
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.exp || s.exp * 1000 < Date.now()) { localStorage.removeItem("kappa_auth"); return null; }
      return s;
    } catch { return null; }
  });
  const [authError, setAuthError] = useState("");
  const [authChecking, setAuthChecking] = useState(false);
  const handleGoogleCredential = useCallback(async (response) => {
    setAuthChecking(true);
    const payload = await verifyGoogleIdToken(response && response.credential);
    setAuthChecking(false);
    if (!payload) { setAuthError("ההתחברות נכשלה — נסה שוב."); return; }
    const email = String(payload.email || "").toLowerCase();
    const domainOk = payload.hd === ALLOWED_DOMAIN || email.endsWith("@" + ALLOWED_DOMAIN);
    if (!payload.email_verified || !domainOk) {
      setAuthError("הגישה מוגבלת לצוות קאפה בלבד (kappainv.com@).");
      return;
    }
    const sess = { email: payload.email, name: payload.name || email, picture: payload.picture || "", exp: payload.exp };
    localStorage.setItem("kappa_auth", JSON.stringify(sess));
    setAuthError("");
    setSession(sess);
  }, []);
  const signOut = () => {
    localStorage.removeItem("kappa_auth");
    if (window.google && window.google.accounts) { try { window.google.accounts.id.disableAutoSelect(); } catch {} }
    setSession(null);
  };

  // Toasts can carry one action (used for "undo" after a stage change), which
  // also buys them a longer life on screen.
  const toastTimer = useRef(null);
  const flash = (msg, kind = "ok", action = null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 2600);
  };

  // ---- Deep links: the screen and the open lead live in the URL, so a refresh
  // keeps you where you were, back works, and a lead can be sent as a link. ----
  const deepLinkRef = useRef(false);
  useEffect(() => {
    const apply = () => {
      const p = new URLSearchParams(window.location.search);
      const v = p.get("view");
      if (["dashboard", "pipeline", "tasks", "campaigns", "journey"].includes(v)) setView(v);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  // ---- Campaigns (shared with lead forms + stats + management screen) ----
  const [campaignRows, setCampaignRows] = useState([]);
  const [campaignState, setCampaignState] = useState("idle");

  const loadCampaigns = useCallback(async () => {
    setCampaignState("loading");
    try {
      const res = await fetch(API.campaigns);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setCampaignRows(Array.isArray(d.campaigns) ? d.campaigns : []);
      setCampaignState("ready");
    } catch {
      setCampaignState("error");
    }
  }, []);
  useEffect(() => { if (session) loadCampaigns(); }, [session, loadCampaigns]);

  const saveCampaign = async (row) => {
    try {
      const res = await fetch(API.campaignSave, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, created_by: session.email || "" }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error();
      await loadCampaigns();
      return true;
    } catch {
      return false;
    }
  };

  // If the fetch failed we fall back to the built-in list rather than showing
  // an empty campaign picker, which would look like data loss to the user.
  const campaignsValue = useMemo(() => {
    const usable = campaignState === "ready" && campaignRows.length > 0;
    const all = usable ? campaignRows.map((c) => c.name) : CAMPAIGNS_FALLBACK;
    const active = usable ? campaignRows.filter((c) => c.active).map((c) => c.name) : CAMPAIGNS_FALLBACK;
    return { rows: campaignRows, all, active, reload: loadCampaigns, save: saveCampaign, state: campaignState };
  }, [campaignRows, campaignState, loadCampaigns]);

  // ---- Stats (events + costs), fetched once and shared ----
  const [statsData, setStatsData] = useState({ events: [], costs: [] });
  const [statsState, setStatsState] = useState("idle");
  const statsAsked = useRef(false);
  const loadStats = useCallback(async () => {
    setStatsState("loading");
    try {
      const res = await fetch(API.stats);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setStatsData({ events: d.events || [], costs: Array.isArray(d.costs) ? d.costs : [] });
      setStatsState("ready");
    } catch {
      setStatsState("error");
    }
  }, []);
  const ensureStats = useCallback(() => {
    if (statsAsked.current) return;
    statsAsked.current = true;
    loadStats();
  }, [loadStats]);
  const reloadStats = useCallback(async () => { statsAsked.current = true; await loadStats(); }, [loadStats]);
  const [fx, setFxState] = useState(loadFx);
  const setFx = useCallback((patch) => {
    setFxState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(FX_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const statsValue = useMemo(
    () => ({ events: statsData.events, costs: statsData.costs, state: statsState, ensure: ensureStats, reload: reloadStats, fx, setFx }),
    [statsData, statsState, ensureStats, reloadStats, fx, setFx]
  );

  const loadLeads = useCallback(async (silent = false) => {
    if (silent !== true) setStatus("loading");
    try {
      const res = await fetch(API.leads);
      if (!res.ok) throw new Error("bad status " + res.status);
      const data = await res.json();
      const rows = (data.leads || []).map((l) => ({ ...l, id: String(l.id) }));
      setLeads(rows);
      // Keep an open drawer on fresh data — the background refresh used to
      // update the list only, leaving `selected` frozen at load-time values.
      setSelected((cur) => {
        if (!cur) return cur;
        const next = rows.find((r) => r.id === cur.id);
        return next ? { ...cur, ...next } : cur;
      });
      setStatus("ready");
    } catch (e) {
      if (silent !== true) setStatus("error");
    }
  }, []);

  // Manual refresh keeps the current screen on-screen (scroll position, open
  // columns, filters) and spins only the button; a full "loading" state used to
  // unmount everything on every click.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeads(true);
    setRefreshing(false);
  }, [loadLeads]);

  useEffect(() => { if (session) loadLeads(); }, [loadLeads, session]);

  // Open the lead named in ?lead=… once the list has arrived (once per load).
  useEffect(() => {
    if (deepLinkRef.current || !leads.length) return;
    deepLinkRef.current = true;
    const id = new URLSearchParams(window.location.search).get("lead");
    if (!id) return;
    const found = leads.find((l) => l.id === String(id));
    if (found) setSelected(found);
  }, [leads]);

  // Reflect the current screen + open lead back into the address bar.
  useEffect(() => {
    if (!session) return;
    const p = new URLSearchParams(window.location.search);
    p.set("view", view);
    if (selected) p.set("lead", selected.id); else p.delete("lead");
    const next = `${window.location.pathname}?${p.toString()}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [view, selected, session]);

  // רענון שקט ברקע כל 30 שניות, כדי שסטטוסים שמתעדכנים מבחוץ (למשל התקדמות מסע ליווי משקיעים
  // דרך לחיצה על קישור במייל) יופיעו בלי צורך ברענון ידני. לא מרענן כשהטאב לא פעיל בדפדפן.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadLeads(true);
    }, 30000);
    return () => clearInterval(id);
  }, [session, loadLeads]);

  const filtered = useMemo(() => {
    if (!query.trim()) return leads;
    const q = normText(query);
    const qDigits = normPhone(query);
    return leads.filter((l) => {
      if (normText(l.name).includes(q) || normText(l.email).includes(q) ||
          normText(l.referrer).includes(q) || normText(l.phone).includes(q)) return true;
      return qDigits.length >= 3 && normPhone(l.phone).includes(qDigits);
    });
  }, [leads, query]);

  // ---- Leads-screen filters: creation date range, another date field's
  // range, and stage/group. Independent from the text search above; both
  // apply together. Only affects the Leads (Pipeline) screen, not the
  // dashboard's own aggregate numbers. ----
  const [pf, setPf] = useState({ createdFrom: "", createdTo: "", dateField: "meeting_date", dateFrom: "", dateTo: "", stages: [], stuck: false });
  const parseISODateOnly = (s) => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const pipelineFiltered = useMemo(() => {
    const hasCreated = pf.createdFrom || pf.createdTo;
    const hasOther = pf.dateFrom || pf.dateTo;
    const hasStages = pf.stages.length > 0;
    if (!hasCreated && !hasOther && !hasStages && !pf.stuck) return filtered;
    const cf = parseISODateOnly(pf.createdFrom), ct = parseISODateOnly(pf.createdTo);
    const df = parseISODateOnly(pf.dateFrom), dt = parseISODateOnly(pf.dateTo);
    return filtered.filter((l) => {
      if (hasStages && !pf.stages.includes(l.stage)) return false;
      if (pf.stuck && !isStuck(l)) return false;
      if (hasCreated) {
        const d = parseDMY(l.created_at);
        if (!d) return false;
        if (cf && d < cf) return false;
        if (ct && d > ct) return false;
      }
      if (hasOther) {
        const d = parseDMY(l[pf.dateField]);
        if (!d) return false;
        if (df && d < df) return false;
        if (dt && d > dt) return false;
      }
      return true;
    });
  }, [filtered, pf]);
  // Clicking a dashboard KPI jumps to the Leads screen pre-filtered to the
  // stages that make up that number.
  const goToFunnelFilter = (stageIds, stuck = false) => {
    setPf((f) => ({ ...f, stages: stageIds, stuck }));
    setView("pipeline");
  };

  const stats = useMemo(() => {
    const interested = leads.filter((l) => l.stage === "interested");
    const closed = leads.filter((l) => l.stage === "closed");
    // "Active leads" and "potential in the funnel" both count only leads
    // still actively moving through the funnel (new → contact → meeting →
    // future → interested) — closed (already won) and lost leads are done,
    // they no longer represent open activity or potential.
    const funnelLeads = leads.filter((l) => FUNNEL_STAGES.includes(l.stage));
    const pipeline = funnelLeads.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const committed = [...interested, ...closed].reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const dueCalls = leads.filter((l) => l.stage !== "closed" && l.stage !== "lost" && isDue(l.next_call)).length;
    const stuck = funnelLeads.filter(isStuck).length;
    return { total: funnelLeads.length, interested: interested.length, pipeline, committed, dueCalls, stuck };
  }, [leads]);

  // optimistic stage move → POST /crm/lead/stage
  const moveLead = async (id, stage) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    // Re-entering "interested" with an existing journey in progress →
    // ask whether to resume from the last stage or restart from scratch.
    const priorStage = Number(lead.journey_stage) || 0;
    const doneStage = Number(lead.journey_done) || 0;
    // journey_done holds the last stage the investor approved (not a boolean).
    // Offer resume whenever a journey has started and hasn't fully completed
    // (a completed journey has reached the final stage on both fields).
    const journeyComplete = priorStage >= 6 && doneStage >= 5;
    if (stage === "interested" && (priorStage > 0 || doneStage > 0) && !journeyComplete) {
      // Resume from the furthest point reached so we never send an earlier email.
      const resumeAt = Math.max(priorStage, doneStage) || 1;
      setJourneyPrompt({ id, resumeStage: resumeAt });
      return;
    }
    // Fresh entry (never started a journey) → start at 0.
    const isFresh = stage === "interested" && (lead.journey_stage === "" || lead.journey_stage == null);
    commitMove(id, stage, isFresh ? { journeyStage: 0, journeyDone: 0 } : {});
  };

  // Performs the actual stage change and syncs to CRM.
  // opts: { journeyStage, journeyDone } = explicit reset (0 = restart, wipes
  //          the "done" checkmarks too — a restart must look fully reset,
  //          not show old approved steps still checked off);
  //       { resumeStage }  = resume an existing journey → n8n resends the
  //                          current-stage reminder to investor + admin,
  //                          and journey_done is left untouched since the
  //                          investor's real prior approvals still count.
  const commitMove = async (id, stage, opts = {}) => {
    const prev = leads;
    const before = leads.find((l) => l.id === id);
    const fromStage = (before && before.stage) || "";
    // stage_since powers the "days in stage" ageing signal.
    const patch = { stage, stage_since: todayStr() };
    if (opts.journeyStage != null) patch.journey_stage = opts.journeyStage;
    if (opts.journeyDone != null) patch.journey_done = opts.journeyDone;
    if (opts.resumeStage != null) patch.journey_stage = opts.resumeStage;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (selected && selected.id === id) setSelected((s) => ({ ...s, ...patch }));
    try {
      // Only send journey_stage / journey_done / resume_stage when explicitly
      // set. Moving a lead OUT of "interested" sends none of these, so the
      // sheet keeps its existing values.
      // from_stage / name / changed_by feed the Events log in n8n: the client
      // already knows the previous stage, so sending it avoids an extra sheet
      // read on the server for every card move.
      const body = {
        id, stage,
        stage_since: patch.stage_since,
        from_stage: fromStage,
        name: (before && before.name) || "",
        changed_by: session.email || "",
      };
      if (opts.journeyStage != null) body.journey_stage = opts.journeyStage;
      if (opts.journeyDone != null) body.journey_done = opts.journeyDone;
      if (opts.resumeStage != null) body.resume_stage = opts.resumeStage;
      const res = await fetch(API.stage, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      if (opts.resumeStage != null) {
        flash("ממשיך מהשלב האחרון — נשלחה תזכורת");
      } else {
        // A mis-drop on the board is the easiest mistake to make here, so the
        // confirmation doubles as a one-click way back.
        flash("הסטטוס עודכן", "ok", fromStage && fromStage !== stage
          ? { label: "בטל", run: () => commitMove(id, fromStage, {}) } : null);
      }
    } catch {
      setLeads(prev); flash("העדכון נכשל — הסטטוס שוחזר", "err");
    }
  };

  // add lead → POST /crm/lead/add
  const addLead = async (form) => {
    try {
      const res = await fetch(API.add, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setLeads((ls) => [{ ...created, id: String(created.id) }, ...ls]);
      setAdding(false);
      flash("הליד נוסף");
    } catch {
      flash("הוספת הליד נכשלה", "err");
    }
  };

  // update lead → POST /crm/lead/update
  const updateLead = async (data) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === data.id ? { ...l, ...data } : l)));
    if (selected && selected.id === data.id) setSelected((s) => ({ ...s, ...data }));
    try {
      const res = await fetch(API.update, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      flash("הליד עודכן");
    } catch {
      setLeads(prev); flash("העדכון נכשל", "err");
    }
  };

  // delete lead → POST /crm/lead/delete
  // The lead is archived to the "Deleted" tab in the back office before the row
  // is removed from Leads, so a deletion is always recoverable from the sheet.
  const deleteLead = async (lead, reason) => {
    const prev = leads;
    setLeads((ls) => ls.filter((l) => l.id !== lead.id));
    setSelected(null);
    setConfirmDelete(null);
    try {
      const res = await fetch(API.delete, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, reason: reason || "", deleted_by: session.email || "" }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error();
      flash("הליד נמחק ותועד ביומן המחיקות");
    } catch {
      setLeads(prev); flash("המחיקה נכשלה — הליד שוחזר", "err");
    }
  };

  // Renaming a campaign has to rewrite every lead that carries the old name —
  // leads store the campaign as a plain string, so without this the campaign
  // would show 0 leads and the statistics would split into two rows.
  const renameCampaignOnLeads = async (oldName, newName) => {
    const affected = leads.filter((l) => String(l.campaign || "").trim() === oldName);
    if (!affected.length) return { moved: 0, failed: 0 };
    setLeads((ls) => ls.map((l) => (String(l.campaign || "").trim() === oldName ? { ...l, campaign: newName } : l)));
    let failed = 0;
    for (const l of affected) {
      try {
        const res = await fetch(API.update, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...l, campaign: newName }),
        });
        if (!res.ok) throw new Error();
      } catch { failed++; }
    }
    if (failed) await loadLeads(true); // resync: some rows kept the old name
    return { moved: affected.length - failed, failed };
  };

  // restore lead → POST /crm/lead/restore
  // Writes the archived lead back into the Leads sheet and stamps the archive
  // row as restored, so the deletion stays on record but drops out of the bin.
  const restoreLead = async (row) => {
    try {
      const res = await fetch(API.restore, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, restored_by: session.email || "" }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error();
      await loadLeads(true);
      flash("הליד שוחזר וחזר למערכת");
      return true;
    } catch {
      flash("השחזור נכשל — הליד נשאר בסל המחיקות", "err");
      return false;
    }
  };

  // Tasks are stored on the lead, so every mutation is an ordinary lead update.
  const saveTasks = (lead, tasks) => updateLead({ ...lead, tasks: JSON.stringify(tasks) });
  const toggleTask = (lead, taskId) =>
    saveTasks(lead, parseTasks(lead).map((t) => (t.id === taskId
      ? { ...t, done: !t.done, done_at: !t.done ? todayStr() : "" } : t)));
  const snoozeTask = (lead, taskId, days = 1) =>
    saveTasks(lead, parseTasks(lead).map((t) => {
      if (t.id !== taskId) return t;
      const base = parseDMY(t.due) || startOfToday();
      base.setDate(base.getDate() + days);
      return { ...t, due: fmtDMY(base) };
    }));

  // Everyone who already owns a lead or a task, plus whoever is signed in.
  const owners = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => {
      if (l.owner) set.add(String(l.owner));
      parseTasks(l).forEach((t) => { if (t.owner) set.add(String(t.owner)); });
    });
    set.add(session && session.email ? session.email : "");
    return Array.from(set).filter(Boolean).sort();
  }, [leads, session]);

  // One-click follow-up housekeeping from a card / table row, so the two most
  // common edits don't require opening the drawer.
  const snoozeCall = (lead, days = 1) => {
    const base = parseDMY(lead.next_call) || startOfToday();
    base.setDate(base.getDate() + days);
    updateLead({ ...lead, next_call: fmtDMY(base) });
  };
  const markContacted = (lead) => updateLead({ ...lead, last_contact: todayStr() });

  if (!session) {
    return <LoginScreen onCredential={handleGoogleCredential} error={authError} checking={authChecking} />;
  }

  return (
    <CampaignsCtx.Provider value={campaignsValue}>
    <StatsCtx.Provider value={statsValue}>
    <div dir="rtl" style={{ ...styles.app, ...(isMobile ? styles.appMobile : {}) }}>
      <style>{css}</style>

      {!isMobile && (
        <aside style={styles.sidebar}>
          <div style={styles.brand}>
            <div style={styles.brandLogoWrap}><img src="/Logo.jpg" alt="Kappa Real Estate Investments" style={styles.brandLogoImg} /></div>
          </div>
          <nav style={styles.nav}>
            <NavItem icon={<LayoutDashboard size={19} />} label="דשבורד" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <NavItem icon={<Users size={19} />} label="לידים" active={view === "pipeline"} onClick={() => setView("pipeline")} />
            <NavItem icon={<CalendarClock size={19} />} label="משימות" active={view === "tasks"} onClick={() => setView("tasks")} />
            <NavItem icon={<Megaphone size={19} />} label="קמפיינים" active={view === "campaigns"} onClick={() => setView("campaigns")} />
            <NavItem icon={<Target size={19} />} label="ליווי משקיעים" active={view === "journey"} onClick={() => setView("journey")} />
          </nav>
          <div style={styles.sidebarFoot}>
            <button style={styles.addBtn} onClick={() => setAdding(true)}><Plus size={18} /> ליד חדש</button>
          </div>
        </aside>
      )}

      <main style={{ ...styles.main, ...(isMobile ? styles.mainMobile : {}) }}>
        <header style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : {}) }}>
          <div style={styles.searchWrap}>
            <Search size={18} color="#94A3B8" />
            <input style={styles.search} placeholder={isMobile ? "חיפוש…" : "חיפוש לפי שם, טלפון, אימייל, מפנה…"} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button style={styles.refreshBtn} onClick={refresh} title="רענן" aria-label="רענן">
            <RefreshCw size={16} className={refreshing || status === "loading" ? "spin" : ""} />
          </button>
          <button style={styles.refreshBtn} onClick={() => setBinOpen(true)} title="סל המחיקות" aria-label="סל המחיקות">
            <Archive size={16} />
          </button>
          {stats.dueCalls > 0 && (
            <div style={{ ...styles.dueBadge, ...(isMobile ? styles.dueBadgeMobile : {}) }}><CalendarClock size={16} />{isMobile ? ` ${stats.dueCalls}` : ` ${stats.dueCalls} שיחות להיום`}</div>
          )}
          <div style={styles.userChip} title={session.email}>
            {session.picture
              ? <img src={session.picture} alt={session.name} style={styles.userAvatarImg} referrerPolicy="no-referrer" />
              : <div style={styles.userAvatarFallback}>{initials(session.name)}</div>}
            {!isMobile && <span style={styles.userChipName}>{session.name}</span>}
            <button style={styles.userSignOutBtn} onClick={signOut} title="התנתק" aria-label="התנתק">
              <LogOut size={15} />
            </button>
          </div>
        </header>

        <div style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>
          {status === "loading" && <Loading />}
          {status === "error" && <ErrorState onRetry={() => loadLeads()} />}
          {status === "ready" && view === "dashboard" && <Analytics stats={stats} leads={filtered} allLeads={leads} onOpen={setSelected} onFilterClick={goToFunnelFilter} session={session} flash={flash} />}
          {status === "ready" && view === "pipeline" && (
            <Pipeline leads={pipelineFiltered} onOpen={setSelected} onMove={moveLead} dragId={dragId} setDragId={setDragId} isMobile={isMobile} filters={pf} onFiltersChange={setPf} onSnooze={snoozeCall} onContacted={markContacted} />
          )}
          {status === "ready" && view === "tasks" && (
            <TasksBoard leads={leads} session={session} onOpen={setSelected} onToggle={toggleTask} onSnooze={snoozeTask} />
          )}
          {status === "ready" && view === "campaigns" && (
            <CampaignsAdmin leads={leads} session={session} flash={flash} onRenameLeads={renameCampaignOnLeads} />
          )}
          {status === "ready" && view === "journey" && (
            <JourneyBoard leads={leads.filter((l) => l.stage === "interested")} onOpen={setSelected} />
          )}
        </div>
      </main>

      {isMobile && (
        <>
          <button style={styles.fab} onClick={() => setAdding(true)} aria-label="ליד חדש"><Plus size={26} /></button>
          <nav style={styles.bottomNav}>
            <BottomNavItem icon={<LayoutDashboard size={22} />} label="דשבורד" active={view === "dashboard"} onClick={() => setView("dashboard")} />
            <BottomNavItem icon={<Users size={22} />} label="לידים" active={view === "pipeline"} onClick={() => setView("pipeline")} />
            <BottomNavItem icon={<CalendarClock size={22} />} label="משימות" active={view === "tasks"} onClick={() => setView("tasks")} />
            <BottomNavItem icon={<Megaphone size={22} />} label="קמפיינים" active={view === "campaigns"} onClick={() => setView("campaigns")} />
            <BottomNavItem icon={<Target size={22} />} label="ליווי" active={view === "journey"} onClick={() => setView("journey")} />
          </nav>
        </>
      )}

      {selected && (
        <LeadDrawer lead={selected} onClose={() => setSelected(null)}
          onMove={(s) => moveLead(selected.id, s)} onSave={updateLead}
          onRequestDelete={() => setConfirmDelete(selected)}
          session={session} owners={owners} onSaveTasks={saveTasks} />
      )}
      {adding && <AddLead onClose={() => setAdding(false)} onSave={addLead} leads={leads} session={session} owners={owners} />}

      {journeyPrompt && (
        <div style={styles.confirmOverlay} onClick={() => setJourneyPrompt(null)}>
          <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmIcon}><Target size={26} color={KAPPA.teal} /></div>
            <h3 style={styles.confirmTitle}>הליד חוזר למסלול ליווי משקיעים</h3>
            <p style={styles.confirmText}>
              הליד כבר התחיל מסע ליווי בעבר (עצר בשלב {journeyPrompt.resumeStage} מתוך {JOURNEY.length}).
              להמשיך מהנקודה האחרונה, או להתחיל את המסע מחדש?
            </p>
            <div style={styles.confirmBtns}>
              <button
                style={styles.confirmPrimary}
                onClick={() => { commitMove(journeyPrompt.id, "interested", { resumeStage: journeyPrompt.resumeStage }); setJourneyPrompt(null); }}>
                המשך משלב {journeyPrompt.resumeStage}
              </button>
              <button
                style={styles.confirmSecondary}
                onClick={() => { commitMove(journeyPrompt.id, "interested", { journeyStage: 0, journeyDone: 0 }); setJourneyPrompt(null); }}>
                התחל מחדש
              </button>
            </div>
            <button style={styles.confirmCancel} onClick={() => setJourneyPrompt(null)}>ביטול</button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <DeleteConfirm lead={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={deleteLead} />
      )}
      {binOpen && (
        <DeletedBin onClose={() => setBinOpen(false)} onRestore={restoreLead} />
      )}
      {toast && (
        <div style={{ ...styles.toast, background: toast.kind === "err" ? "#EF4444" : KAPPA.ink }}>
          {toast.kind === "err" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />} {toast.msg}
          {toast.action && (
            <button style={styles.toastAction} onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </div>
    </StatsCtx.Provider>
    </CampaignsCtx.Provider>
  );
}

// ============ States ============
// Deleting a lead is irreversible from inside the CRM (the record survives only
// in the "Deleted" tab of the sheet), so the confirmation asks for the word
// "מחק" to be typed out rather than relying on a single click.
function DeleteConfirm({ lead, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = typed.trim() === "מחק";
  const go = async () => {
    if (!armed || busy) return;
    setBusy(true);
    await onConfirm(lead, reason.trim());
  };
  return (
    <div style={styles.confirmOverlay} onClick={onCancel}>
      <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.confirmIcon, background: "#FEE2E2" }}><Trash2 size={26} color="#EF4444" /></div>
        <h3 style={styles.confirmTitle}>מחיקת הליד {lead.name}</h3>
        <p style={styles.confirmText}>
          הליד יוסר מהמערכת. הוא יתועד ביומן המחיקות בגיליון (לשונית "Deleted") עם כל הפרטים,
          התאריך ומי מחק, כך שתמיד אפשר לאתר אותו בדיעבד.
        </p>
        <div style={{ width: "100%", textAlign: "right" }}>
          <div style={styles.summaryLabel}>סיבת המחיקה (רשות)</div>
          <input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="למשל: כפילות, נוצר בטעות…" />
          <div style={{ ...styles.summaryLabel, marginTop: 12 }}>לאישור, הקלד מחק</div>
          <input style={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="מחק" />
        </div>
        <div style={{ ...styles.confirmBtns, marginTop: 14 }}>
          <button
            style={{ ...styles.confirmPrimary, background: armed ? "#EF4444" : "#FCA5A5", cursor: armed ? "pointer" : "not-allowed", opacity: busy ? 0.6 : 1 }}
            disabled={!armed || busy}
            onClick={go}>
            {busy ? "מוחק…" : "מחק לצמיתות"}
          </button>
        </div>
        <button style={styles.confirmCancel} onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// Recycle bin: everything sitting in the "Deleted" tab that has not been
// restored yet. Loaded on open rather than kept in app state, since it is a
// rarely-used recovery screen and should always show the sheet's current truth.
function DeletedBin({ onClose, onRestore }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(API.deleted);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows((data.deleted || []).map((r) => ({ ...r, id: String(r.id) })));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const restore = async (row) => {
    setBusyId(row.id);
    const ok = await onRestore(row);
    setBusyId(null);
    if (ok) setRows((rs) => rs.filter((r) => r.id !== row.id));
  };

  return (
    <div style={styles.confirmOverlay} onClick={onClose}>
      <div style={styles.binBox} onClick={(e) => e.stopPropagation()}>
        <div style={styles.binHead}>
          <button style={styles.iconBtn} onClick={onClose}><X size={20} /></button>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: KAPPA.ink }}>סל המחיקות</h3>
        </div>
        <div style={styles.binBody}>
          {state === "loading" && (
            <div style={styles.centerState}><RefreshCw size={26} color={KAPPA.teal} className="spin" /><p style={styles.stateText}>טוען…</p></div>
          )}
          {state === "error" && (
            <div style={styles.centerState}>
              <AlertCircle size={32} color="#EF4444" />
              <p style={styles.stateText}>לא הצלחנו לטעון את סל המחיקות.</p>
              <button style={styles.retryBtn} onClick={load}>נסה שוב</button>
            </div>
          )}
          {state === "ready" && rows.length === 0 && (
            <div style={styles.centerState}>
              <Archive size={32} color="#94A3B8" />
              <p style={styles.stateText}>אין לידים מחוקים.</p>
            </div>
          )}
          {state === "ready" && rows.map((r) => (
            <div key={r.id} style={styles.binRow}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={styles.binName}>{r.name || "ללא שם"}</div>
                <div style={styles.binMeta}>
                  נמחק {r.deleted_at || "—"}{r.deleted_by ? ` · ${r.deleted_by}` : ""}
                </div>
                {r.delete_reason && <div style={styles.binReason}>סיבה: {r.delete_reason}</div>}
              </div>
              <button
                style={{ ...styles.restoreBtn, opacity: busyId === r.id ? 0.5 : 1 }}
                disabled={busyId === r.id}
                onClick={() => restore(r)}>
                <RotateCcw size={14} /> {busyId === r.id ? "משחזר…" : "שחזר"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={styles.centerState}>
      <RefreshCw size={30} color={KAPPA.teal} className="spin" />
      <p style={styles.stateText}>טוען לידים…</p>
    </div>
  );
}
function ErrorState({ onRetry }) {
  return (
    <div style={styles.centerState}>
      <AlertCircle size={38} color="#EF4444" />
      <p style={styles.stateText}>לא הצלחנו לטעון את הלידים.</p>
      <button style={styles.retryBtn} onClick={onRetry}>נסה שוב</button>
    </div>
  );
}

// ============ Campaign management ============
// Campaigns and their spend live side by side here: the list controls which
// campaigns the lead forms offer, and the ledger below records what each one
// cost. Both feed the Campaigns tab of the statistics screen.
// Drill-down for a single campaign: what it cost, when, and how that spend
// compares to the leads it brought in. The cost ledger here is editable, since
// charges are often entered retroactively and need correcting.
function CampaignDetail({ campaign, leads, costs, costState, onBack, onSaveCost, onDeleteCost, onRename, onToggle, busy, reloadCosts }) {
  const { fx } = useStats();
  const [range, setRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [form, setForm] = useState({ cost_id: "", campaign: campaign.name, spend_date: "", amount: "", currency: "ILS", note: "", created_at: "" });
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(campaign.name);
  // Deleting a charge is irreversible, so the button asks once before acting
  // rather than opening a modal for what is otherwise a one-click correction.
  const [confirmId, setConfirmId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const removeCost = async (c) => {
    const id = String(c.cost_id);
    if (confirmId !== id) { setConfirmId(id); return; }
    setDeletingId(id);
    const ok = await onDeleteCost(id);
    setDeletingId("");
    setConfirmId("");
    // If the row being edited was the one deleted, clear the form too.
    if (ok && form.cost_id === id) resetForm();
  };

  const bounds = rangeBounds(range, customFrom, customTo);
  const mine = costs.filter((c) => String(c.campaign || "").trim() === campaign.name);
  const inPeriod = mine.filter((c) => inRange(parseDMY(c.spend_date), bounds));
  const periodLeads = leads.filter((l) =>
    String(l.campaign || "").trim() === campaign.name && inRange(parseDMY(l.created_at), bounds));

  const totals = sumByCurrency(inPeriod);
  const totalText = hasCost(totals) ? fxMoney(totalIn(totals, fx), fx) : "—";
  const perLead = (hasCost(totals) && periodLeads.length)
    ? fxMoney(totalIn(totals, fx) / periodLeads.length, fx)
    : "—";
  const split = fxBreakdown(totals);
  const closed = periodLeads.filter((l) => l.stage === "closed").length;

  const sorted = inPeriod.slice().sort((a, b) => {
    const da = parseDMY(a.spend_date), db = parseDMY(b.spend_date);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  });

  const editing = form.cost_id !== "";
  const startEdit = (c) => {
    setForm({
      cost_id: String(c.cost_id || ""), campaign: campaign.name,
      spend_date: String(c.spend_date || ""), amount: String(c.amount || ""),
      currency: String(c.currency || "ILS").toUpperCase() === "USD" ? "USD" : "ILS",
      note: String(c.note || ""), created_at: String(c.created_at || ""),
    });
  };
  const resetForm = () => setForm({ cost_id: "", campaign: campaign.name, spend_date: "", amount: "", currency: "ILS", note: "", created_at: "" });

  const submit = async () => {
    setSaving(true);
    const ok = await onSaveCost(form);
    setSaving(false);
    if (ok) resetForm();
  };

  const commitRename = async () => {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!name || name === campaign.name) return;
    await onRename(campaign, name);
  };

  return (
    <div>
      <button className="row-btn" style={styles.backBtn} onClick={onBack}>
        <ChevronLeft size={18} style={{ transform: "scaleX(-1)" }} /> חזרה לכל הקמפיינים
      </button>

      <div style={styles.detailHead}>
        {renaming ? (
          <input style={{ ...styles.input, maxWidth: 320, fontSize: 20 }} value={nameDraft} autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenaming(false); setNameDraft(campaign.name); } }} />
        ) : (
          <h1 style={styles.pageTitle}>{campaign.name}</h1>
        )}
        <div style={styles.detailActions}>
          <button style={styles.campToggleBtn} onClick={() => { setNameDraft(campaign.name); setRenaming(true); }}>
            <Pencil size={14} /> שנה שם
          </button>
          <button
            style={{ ...styles.campToggleBtn, opacity: busy === campaign.campaign_id ? 0.5 : 1,
              background: campaign.active ? "#F1F5F9" : KAPPA.tealSoft,
              color: campaign.active ? "#64748B" : KAPPA.tealDark,
              borderColor: campaign.active ? "#E2E8F0" : `${KAPPA.teal}55` }}
            disabled={busy === campaign.campaign_id}
            onClick={() => onToggle(campaign)}>
            <Power size={14} /> {campaign.active ? "השבת" : "הפעל"}
          </button>
        </div>
      </div>
      <p style={styles.pageSub}>
        <span style={{ ...styles.statusPill, background: campaign.active ? "#ECFDF5" : "#FEF2F2", color: campaign.active ? "#047857" : "#B91C1C" }}>
          <span style={{ ...styles.statusDot, background: campaign.active ? "#10B981" : "#EF4444" }} />
          {campaign.active ? "פעיל" : "לא פעיל"}
        </span>
      </p>

      <RangePicker value={range} onChange={setRange} customFrom={customFrom} customTo={customTo}
        onCustom={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />

      <div style={styles.kpiRow} className="kpi-row">
        <Kpi icon={<Wallet size={20} />} tint="#F59E0B" label="סה״כ הושקע" value={<span style={styles.kpiValueText} title={split}>{totalText}</span>} />
        <Kpi icon={<Users size={20} />} tint={KAPPA.teal} label="לידים בתקופה" value={periodLeads.length} />
        <Kpi icon={<TrendingUp size={20} />} tint="#8B5CF6" label="עלות לליד" value={<span style={styles.kpiValueText}>{perLead}</span>} />
        <Kpi icon={<CheckCircle2 size={20} />} tint="#10B981" label="סגרו בתקופה" value={closed} />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHead}>
          <h3 style={styles.cardTitle}>{editing ? "עריכת חיוב" : "הוספת חיוב"}</h3>
        </div>
        <div style={styles.costForm} className="cost-form-lg">
          <div style={styles.costGrid}>
            <DateField label="תאריך החיוב" value={form.spend_date} onChange={(v) => setForm({ ...form, spend_date: v })} />
            <Field label="סכום">
              <input style={styles.input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} dir="ltr" />
            </Field>
            <Field label="מטבע">
              <select style={styles.input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="ILS">₪ שקל</option>
                <option value="USD">$ דולר</option>
              </select>
            </Field>
          </div>
          <div style={styles.costNoteCell}>
            <Field label="הערה">
              <input style={styles.input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="למשל: חיוב חודש אוגוסט" />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button style={{ ...styles.costSaveBtn, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={submit}>
              {saving ? "שומר…" : (editing ? "שמור שינויים" : "הוסף חיוב")}
            </button>
            {editing && (
              <button style={{ ...styles.campToggleBtn, marginTop: 14 }} onClick={resetForm}>ביטול עריכה</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 24 }}>
        <div style={styles.cardHead}><h3 style={styles.cardTitle}>היסטוריית חיובים</h3></div>
        {costState === "loading" && (
          <div style={styles.centerState}><RefreshCw size={24} color={KAPPA.teal} className="spin" /><p style={styles.stateText}>טוען…</p></div>
        )}
        {costState === "error" && (
          <div style={styles.centerState}>
            <AlertCircle size={30} color="#EF4444" />
            <p style={styles.stateText}>לא הצלחנו לטעון את החיובים.</p>
            <button style={styles.retryBtn} onClick={reloadCosts}>נסה שוב</button>
          </div>
        )}
        {costState === "ready" && sorted.length === 0 && (
          <div style={{ padding: "16px 26px", color: "#64748B", fontSize: 15 }}>
            {mine.length === 0 ? "עדיין לא תועדו חיובים לקמפיין הזה." : "אין חיובים בטווח התאריכים שנבחר."}
          </div>
        )}
        {costState === "ready" && sorted.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.statTable}>
              <thead>
                <tr>
                  <th style={styles.th}>תאריך</th>
                  <th style={styles.thCenter}>סכום</th>
                  <th style={styles.th}>הערה</th>
                  <th style={styles.thCenter}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.cost_id} style={form.cost_id === String(c.cost_id) ? { background: KAPPA.tealSoft } : undefined}>
                    <td style={styles.tdName}>{c.spend_date}</td>
                    <td style={styles.tdCenter}>{money(c.amount, c.currency)}</td>
                    <td style={styles.td}>{c.note || "—"}</td>
                    <td style={styles.tdCenter}>
                      <div style={styles.rowActions}>
                        <button style={styles.campToggleBtn} onClick={() => startEdit(c)}>
                          <Pencil size={14} /> ערוך
                        </button>
                        <button
                          style={{
                            ...styles.campToggleBtn,
                            opacity: deletingId === String(c.cost_id) ? 0.5 : 1,
                            background: confirmId === String(c.cost_id) ? "#EF4444" : "#FEF2F2",
                            color: confirmId === String(c.cost_id) ? "#fff" : "#B91C1C",
                            borderColor: confirmId === String(c.cost_id) ? "#EF4444" : "#FECACA",
                          }}
                          disabled={deletingId === String(c.cost_id)}
                          onClick={() => removeCost(c)}
                          onBlur={() => setConfirmId((v) => (v === String(c.cost_id) ? "" : v))}>
                          <Trash2 size={14} />
                          {deletingId === String(c.cost_id)
                            ? "מוחק…"
                            : (confirmId === String(c.cost_id) ? "בטוח? לחץ שוב" : "מחק")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={styles.costHint}>
          עריכת חיוב מעדכנת את אותה שורה בגיליון ולא יוצרת שורה חדשה. מחיקה מסירה את השורה
          לצמיתות, ולכן הכפתור מבקש אישור בלחיצה שנייה.
        </p>
      </div>
    </div>
  );
}

function CampaignsAdmin({ leads, session, flash, onRenameLeads }) {
  const { rows, reload, save, state } = useCampaigns();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState("");

  const { costs, state: costState, ensure: ensureStats, reload: loadCosts, fx, setFx } = useStats();
  useEffect(() => { ensureStats(); }, [ensureStats]);
  const [openId, setOpenId] = useState(null); // campaign being drilled into

  // Lead counts decide whether a campaign can be removed outright: deleting one
  // that leads still reference would leave those leads pointing at a campaign
  // that no longer exists, so those get deactivated instead.
  const usage = {};
  leads.forEach((l) => {
    const c = String(l.campaign || "").trim();
    if (c) usage[c] = (usage[c] || 0) + 1;
  });

  const addCampaign = async () => {
    const name = newName.trim();
    if (!name) return;
    if (rows.some((r) => r.name === name)) { flash("קמפיין בשם הזה כבר קיים", "err"); return; }
    setBusy("add");
    const ok = await save({ name, active: true });
    setBusy("");
    if (ok) { setNewName(""); flash("הקמפיין נוסף"); }
    else flash("הוספת הקמפיין נכשלה", "err");
  };

  const toggleActive = async (row) => {
    setBusy(row.campaign_id);
    const ok = await save({ campaign_id: row.campaign_id, name: row.name, active: !row.active, created_at: row.created_at });
    setBusy("");
    flash(ok ? (row.active ? "הקמפיין הושבת" : "הקמפיין הופעל") : "העדכון נכשל", ok ? "ok" : "err");
  };

  // ---- header figures ----
  const now = new Date();
  const leadsThisMonth = leads.filter((l) => {
    const d = parseDMY(l.created_at);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const activeCount = rows.filter((r) => r.active).length;
  const topName = Object.keys(usage).sort((a, b) => usage[b] - usage[a])[0];
  const topCampaign = topName || "—";
  // Averaged over every lead that carries a campaign, since a lead with no
  // campaign was never paid for through one. Currencies stay separate.
  const attributedLeads = leads.filter((l) => String(l.campaign || "").trim() !== "").length;
  const costTotals = sumByCurrency(costs);
  const avgCostPerLead = (!hasCost(costTotals) || !attributedLeads)
    ? "—"
    : fxMoney(totalIn(costTotals, fx) / attributedLeads, fx);

  // Used by the drill-down view. Sending a cost_id updates that ledger row;
  // omitting it creates a new charge.
  const saveCostEntry = async (payload) => {
    try {
      const res = await fetch(API.costAdd, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, created_by: session.email || "" }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error();
      if (!payload.silent) flash(payload.cost_id ? "החיוב עודכן" : "החיוב נשמר");
      await loadCosts();
      return true;
    } catch {
      flash("שמירת החיוב נכשלה — בדוק תאריך וסכום", "err");
      return false;
    }
  };

  const deleteCostEntry = async (costId) => {
    try {
      const res = await fetch(API.costDelete, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost_id: costId }),
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      if (!out || out.ok !== true) throw new Error();
      flash("החיוב נמחק");
      await loadCosts();
      return true;
    } catch {
      flash("מחיקת החיוב נכשלה", "err");
      return false;
    }
  };

  const renameCampaign = async (row, name) => {
    setBusy(row.campaign_id);
    const ok = await save({ campaign_id: row.campaign_id, name, active: row.active, created_at: row.created_at });
    if (!ok) { setBusy(""); flash("העדכון נכשל", "err"); return; }
    // The campaign row is renamed; now move the leads and the cost ledger over
    // so nothing keeps pointing at a name that no longer exists.
    const res = onRenameLeads ? await onRenameLeads(row.name, name) : { moved: 0, failed: 0 };
    const mine = costs.filter((c) => String(c.campaign || "").trim() === row.name);
    for (const c of mine) {
      await saveCostEntry({ cost_id: c.cost_id, campaign: name, spend_date: c.spend_date, amount: c.amount, currency: c.currency, note: c.note, created_at: c.created_at, silent: true });
    }
    setBusy("");
    flash(res.failed
      ? `השם עודכן, אבל ${res.failed} לידים לא התעדכנו — נסה שוב`
      : `השם עודכן${res.moved ? ` · ${res.moved} לידים הועברו` : ""}`,
      res.failed ? "err" : "ok");
  };

  const openCampaign = rows.find((r) => r.campaign_id === openId) || null;
  if (openCampaign) {
    return (
      <CampaignDetail
        campaign={openCampaign}
        leads={leads}
        costs={costs}
        costState={costState}
        reloadCosts={loadCosts}
        busy={busy}
        onBack={() => setOpenId(null)}
        onSaveCost={saveCostEntry}
        onDeleteCost={deleteCostEntry}
        onRename={renameCampaign}
        onToggle={toggleActive}
      />
    );
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>ניהול קמפיינים</h1>
      <p style={styles.pageSub}>הקמפיינים הפעילים כאן הם אלה שיוצעו בטופס ליד חדש</p>

      <div style={styles.kpiRow} className="kpi-row">
        <Kpi icon={<Users size={20} />} tint={KAPPA.teal} label="סה״כ לידים החודש" value={leadsThisMonth} />
        <Kpi icon={<Megaphone size={20} />} tint="#8B5CF6" label="קמפיינים פעילים" value={activeCount} />
        <Kpi icon={<TrendingUp size={20} />} tint="#10B981" label="הקמפיין המוביל"
          value={<span style={styles.kpiValueText}>{topCampaign}</span>} />
        <Kpi icon={<Wallet size={20} />} tint="#F59E0B" label="עלות ממוצעת לליד" value={avgCostPerLead} />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHead}><h3 style={styles.cardTitle}>ניהול קמפיינים</h3></div>

        <div style={styles.addCampaignRow}>
          <input
            style={styles.addCampaignInput}
            placeholder="שם קמפיין חדש…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCampaign(); }}
          />
          <button style={{ ...styles.addCampaignBtn, opacity: busy === "add" || !newName.trim() ? 0.5 : 1 }}
            disabled={busy === "add" || !newName.trim()} onClick={addCampaign}>
            {busy === "add" ? "מוסיף…" : "הוסף"}
          </button>
        </div>

        {state === "loading" && (
          <div style={styles.centerState}><RefreshCw size={24} color={KAPPA.teal} className="spin" /><p style={styles.stateText}>טוען קמפיינים…</p></div>
        )}
        {state === "error" && (
          <div style={styles.centerState}>
            <AlertCircle size={30} color="#EF4444" />
            <p style={styles.stateText}>לא הצלחנו לטעון את הקמפיינים.</p>
            <button style={styles.retryBtn} onClick={reload}>נסה שוב</button>
          </div>
        )}
        {state === "ready" && rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.statTable}>
              <thead>
                <tr>
                  <th style={styles.th}>שם הקמפיין</th>
                  <th style={styles.thCenter}>סטטוס</th>
                  <th style={styles.thCenter}>כמות לידים</th>
                  <th style={styles.thCenter}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.campaign_id}>
                    <td style={styles.tdName}>
                      <button className="row-btn" style={styles.campName}
                        title="פתח את הקמפיין"
                        onClick={() => setOpenId(r.campaign_id)}>
                        {r.name}
                      </button>
                    </td>
                    <td style={styles.tdCenter}>
                      <span style={{
                        ...styles.statusPill,
                        background: r.active ? "#ECFDF5" : "#FEF2F2",
                        color: r.active ? "#047857" : "#B91C1C",
                      }}>
                        <span style={{ ...styles.statusDot, background: r.active ? "#10B981" : "#EF4444" }} />
                        {r.active ? "פעיל" : "לא פעיל"}
                      </span>
                    </td>
                    <td style={styles.tdCenter}>{usage[r.name] || 0}</td>
                    <td style={styles.tdCenter}>
                      <button
                        style={{ ...styles.campToggleBtn, opacity: busy === r.campaign_id ? 0.5 : 1,
                          background: r.active ? "#F1F5F9" : KAPPA.tealSoft,
                          color: r.active ? "#64748B" : KAPPA.tealDark,
                          borderColor: r.active ? "#E2E8F0" : `${KAPPA.teal}55` }}
                        disabled={busy === r.campaign_id}
                        onClick={() => toggleActive(r)}>
                        <Power size={14} /> {busy === r.campaign_id ? "…" : (r.active ? "השבת" : "הפעל")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {state === "ready" && rows.length === 0 && (
          <div style={{ padding: "16px 4px", color: "#64748B", fontSize: 14 }}>עדיין אין קמפיינים. הוסף אחד למעלה.</div>
        )}
        <p style={styles.costHint}>
          כל תיעוד העלויות נעשה בתוך כרטיס הקמפיין — לחיצה על שם קמפיין פותחת אותו, עם
          היסטוריית החיובים וסך ההשקעה. השבתה מסתירה את
          הקמפיין מטופס ליד חדש, אבל משאירה אותו על לידים קיימים ובסטטיסטיקות, כך
          שהיסטוריה לא הולכת לאיבוד.
        </p>
      </div>

      <div style={{ ...styles.card, marginTop: 24 }}>
        <div style={styles.cardHead}><h3 style={styles.cardTitle}>הגדרות מטבע</h3></div>
        <div style={styles.fxRow}>
          <Field label="שער המרה — 1 דולר בשקלים">
            <input style={{ ...styles.input, maxWidth: 160 }} dir="ltr" value={fx.usdIls}
              onChange={(e) => setFx({ usdIls: e.target.value })}
              onBlur={(e) => { const v = Number(e.target.value); setFx({ usdIls: v > 0 ? v : DEFAULT_FX.usdIls }); }} />
          </Field>
          <Field label="מטבע תצוגה">
            <select style={{ ...styles.input, maxWidth: 160 }} value={fx.display} onChange={(e) => setFx({ display: e.target.value })}>
              <option value="ILS">₪ שקל</option>
              <option value="USD">$ דולר</option>
            </select>
          </Field>
        </div>
        <p style={styles.costHint}>
          חיובים נשמרים במטבע שבו הוזנו. השער כאן משמש רק לתצוגה: כל הסכומים המצרפיים
          מוצגים במטבע אחד כדי שאפשר יהיה להשוות ביניהם, והפירוט המקורי מופיע בהצבעה עם העכבר.
        </p>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="nav-item" style={{
      ...styles.navItem,
      background: active ? "rgba(31,169,184,0.14)" : "transparent",
      color: active ? "#fff" : "rgba(255,255,255,0.62)",
    }}>
      <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>{label}
      {active && <span style={styles.navActive} />}
    </button>
  );
}

function BottomNavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      ...styles.bottomNavItem,
      color: active ? KAPPA.teal : "#94A3B8",
    }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: active ? 700 : 600 }}>{label}</span>
    </button>
  );
}

// ============ Dashboard ============
// ============ Analytics ============
// Stage-transition events and campaign costs both live in the Leads
// spreadsheet and are fetched together from /crm/stats.

// Events carry "DD/MM/YYYY HH:MM"; parseDMY only needs the date part.
const parseStamp = (s) => parseDMY(String(s || "").split(" ")[0]);

const RANGES = [
  { id: "30", label: "30 יום" },
  { id: "90", label: "90 יום" },
  { id: "year", label: "השנה" },
  { id: "all", label: "הכל" },
];
// Resolve a preset into concrete bounds. `null` on either side means unbounded.
function rangeBounds(id, customFrom, customTo) {
  if (id === "custom") {
    return { from: parseDMY(customFrom) || null, to: parseDMY(customTo) || null };
  }
  if (id === "all") return { from: null, to: null };
  const now = new Date();
  if (id === "year") return { from: new Date(now.getFullYear(), 0, 1), to: null };
  const days = Number(id) || 30;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return { from, to: null };
}
const inRange = (d, b) => {
  if (!d) return false;
  if (b.from && d < b.from) return false;
  if (b.to) { const end = new Date(b.to); end.setHours(23, 59, 59, 999); if (d > end) return false; }
  return true;
};
const money = (n, cur) => (cur === "USD" ? "$" : "₪") + Math.round(Number(n) || 0).toLocaleString("en-US");

// Cost totals are kept per currency rather than summed blindly — mixing
// shekels and dollars into one number would produce a confident wrong answer.
function sumByCurrency(rows) {
  const out = {};
  rows.forEach((r) => {
    const cur = String(r.currency || "ILS").toUpperCase() === "USD" ? "USD" : "ILS";
    out[cur] = (out[cur] || 0) + (Number(r.amount) || 0);
  });
  return out;
}
const currencyList = (totals) => Object.keys(totals).filter((c) => totals[c] > 0);
// Convert a per-currency map into one number in the chosen display currency.
function totalIn(totals, fx) {
  const rate = Number(fx && fx.usdIls) > 0 ? Number(fx.usdIls) : DEFAULT_FX.usdIls;
  const ils = (totals.ILS || 0) + (totals.USD || 0) * rate;
  return (fx && fx.display) === "USD" ? ils / rate : ils;
}
const fxMoney = (n, fx) => money(n, (fx && fx.display) || "ILS");
// The untouched per-currency split, shown as a tooltip next to converted sums.
const fxBreakdown = (totals) => currencyList(totals).map((c) => money(totals[c], c)).join(" + ");
const hasCost = (totals) => currencyList(totals).length > 0;

function RangePicker({ value, onChange, customFrom, customTo, onCustom }) {
  return (
    <div style={styles.rangeWrap}>
      <div style={styles.rangeBtns}>
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => onChange(r.id)} style={{
            ...styles.rangeBtn,
            background: value === r.id ? KAPPA.teal : "#fff",
            color: value === r.id ? "#fff" : KAPPA.graphite,
            borderColor: value === r.id ? KAPPA.teal : "#E2E8F0",
          }}>{r.label}</button>
        ))}
        <button onClick={() => onChange("custom")} style={{
          ...styles.rangeBtn,
          background: value === "custom" ? KAPPA.teal : "#fff",
          color: value === "custom" ? "#fff" : KAPPA.graphite,
          borderColor: value === "custom" ? KAPPA.teal : "#E2E8F0",
        }}>טווח מותאם</button>
      </div>
      {value === "custom" && (
        // In RTL the first child renders rightmost, so "עד תאריך" is declared
        // first to place it on the right and "מתאריך" on the left, as asked.
        <div style={styles.rangeCustom}>
          <div style={styles.rangeDateField}>
            <DateField label="עד תאריך" value={customTo} onChange={(v) => onCustom(customFrom, v)} />
          </div>
          <div style={styles.rangeDateField}>
            <DateField label="מתאריך" value={customFrom} onChange={(v) => onCustom(v, customTo)} />
          </div>
        </div>
      )}
    </div>
  );
}

// Horizontal bar for the statistics screens. Deliberately chunkier than the
// overview-tab bars, which stay compact because they sit in a narrow card.
function Bar({ label, count, max, color, suffix }) {
  return (
    <div style={styles.barRowLg}>
      <span style={styles.barLabelLg} title={label}>{label}</span>
      <div style={styles.barTrackLg}>
        <div style={{ ...styles.barFillLg, width: `${max ? (count / max) * 100 : 0}%`, background: color }} />
      </div>
      <span style={styles.barCountLg}>{suffix != null ? suffix : count}</span>
    </div>
  );
}

// Ordered path a lead is expected to travel. "future" and "lost" sit outside
// it: they are outcomes, not steps, so counting them as funnel stages would
// distort the conversion rates.
const FUNNEL_PATH = ["new", "contact", "meeting", "interested", "closed"];

function FunnelTab({ events, bounds, leads }) {
  const evs = events.filter((e) => inRange(parseStamp(e.changed_at), bounds));
  // A lead can move into the same stage more than once; count distinct leads
  // so a card dragged back and forth doesn't inflate the numbers.
  const entered = {};
  FUNNEL_PATH.concat(["future", "lost"]).forEach((s) => { entered[s] = new Set(); });
  evs.forEach((e) => {
    const to = String(e.to_stage || "").trim();
    if (entered[to]) entered[to].add(String(e.lead_id || ""));
  });
  const counts = FUNNEL_PATH.map((id) => ({ ...stageOf(id), id, count: entered[id].size }));
  const maxCount = Math.max(1, ...counts.map((c) => c.count));
  const lostCount = entered.lost.size;
  const futureCount = entered.future.size;

  const steps = [];
  for (let i = 1; i < counts.length; i++) {
    const prev = counts[i - 1].count;
    const cur = counts[i].count;
    steps.push({
      from: counts[i - 1].label,
      to: counts[i].label,
      rate: prev > 0 ? Math.round((cur / prev) * 100) : null,
      cur, prev,
    });
  }

  if (evs.length === 0) {
    return (
      <div style={styles.card}>
        <div style={styles.cardHead}><h3 style={styles.cardTitle}>משפך והמרות</h3></div>
        <div style={{ padding: "18px 4px", color: "#64748B", fontSize: 14, lineHeight: 1.9 }}>
          <p style={{ margin: "0 0 10px" }}>אין עדיין מעברי שלבים בטווח שנבחר.</p>
          <p style={{ margin: 0 }}>
            תיעוד המעברים התחיל לפעול היום, ולכן המשפך מתמלא מכאן והלאה. כל שינוי סטטוס
            שתעשה נרשם עם השלב הקודם, השלב החדש והתאריך. בעוד כמה ימים כבר יהיה כאן מה לנתח.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.statGrid} className="dash-grid">
      <div style={styles.card}>
        <div style={styles.cardHead}><h3 style={styles.cardTitle}>לידים שנכנסו לכל שלב</h3></div>
        <div style={{ padding: "8px 4px" }}>
          {counts.map((c) => <Bar key={c.id} label={c.label} count={c.count} max={maxCount} color={c.color} />)}
          <div style={styles.statDivider} />
          <Bar label="אולי בעתיד" count={futureCount} max={maxCount} color={stageOf("future").color} />
          <Bar label="לא מעוניין" count={lostCount} max={maxCount} color={stageOf("lost").color} />
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.cardHead}><h3 style={styles.cardTitle}>שיעורי המרה בין שלבים</h3></div>
        <div style={{ padding: "6px 4px" }}>
          {steps.map((s, i) => (
            <div key={i} style={styles.convRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.convLabel}>{s.from} ← {s.to}</div>
                <div style={styles.convMeta}>{s.cur} מתוך {s.prev}</div>
              </div>
              <div style={{ ...styles.convRate, color: s.rate == null ? "#94A3B8" : (s.rate >= 50 ? "#10B981" : s.rate >= 25 ? "#F59E0B" : "#EF4444") }}>
                {s.rate == null ? "—" : s.rate + "%"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CampaignsTab({ leads, costs, bounds }) {
  const { fx } = useStats();

  const periodLeads = leads.filter((l) => inRange(parseDMY(l.created_at), bounds));
  const periodCosts = costs.filter((c) => inRange(parseDMY(c.spend_date), bounds));

  const names = Array.from(new Set(
    periodLeads.map((l) => String(l.campaign || "").trim()).filter(Boolean)
      .concat(periodCosts.map((c) => String(c.campaign || "").trim()).filter(Boolean))
  ));

  const rows = names.map((name) => {
    const ls = periodLeads.filter((l) => String(l.campaign || "").trim() === name);
    const cs = periodCosts.filter((c) => String(c.campaign || "").trim() === name);
    const totals = sumByCurrency(cs);
    const closed = ls.filter((l) => l.stage === "closed").length;
    const interested = ls.filter((l) => l.stage === "interested" || l.stage === "closed").length;
    return { name, leads: ls.length, closed, interested, totals };
  }).sort((a, b) => b.leads - a.leads);

  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));
  const grandTotals = sumByCurrency(periodCosts);

  // Cost per lead is only meaningful when there are both costs and leads;
  // showing "₪0" or a division by zero would read as a real figure.
  const perLead = (totals, n) => (!hasCost(totals) || !n) ? "—" : fxMoney(totalIn(totals, fx) / n, fx);
  const totalText = (totals) => hasCost(totals) ? fxMoney(totalIn(totals, fx), fx) : "—";

  return (
    <div>
      <div style={styles.kpiRow} className="kpi-row">
        <Kpi icon={<Users size={20} />} tint={KAPPA.teal} label="לידים בתקופה" value={periodLeads.length} />
        <Kpi icon={<Target size={20} />} tint="#8B5CF6" label="קמפיינים פעילים" value={rows.length} />
        <Kpi icon={<Wallet size={20} />} tint="#F59E0B" label="עלות בתקופה" value={<span title={fxBreakdown(grandTotals)}>{totalText(grandTotals)}</span>} />
        <Kpi icon={<CheckCircle2 size={20} />} tint="#10B981" label="סגרו בתקופה" value={periodLeads.filter((l) => l.stage === "closed").length} />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHead}>
          <h3 style={styles.cardTitle}>ביצועים לפי קמפיין</h3>
          <span style={styles.cardHint}>תיעוד ועריכה של עלויות נעשים במסך הקמפיינים, בתוך כרטיס הקמפיין</span>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: "18px 4px", color: "#64748B", fontSize: 14 }}>אין לידים או עלויות בטווח שנבחר.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.statTable}>
              <thead>
                <tr>
                  <th style={styles.th}>קמפיין</th>
                  <th style={styles.th}>לידים</th>
                  <th style={styles.th}>מעוניינים</th>
                  <th style={styles.th}>סגרו</th>
                  <th style={styles.th}>עלות</th>
                  <th style={styles.th}>עלות לליד</th>
                  <th style={styles.th}>עלות לסגירה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td style={styles.tdName}>{r.name}</td>
                    <td style={styles.td}>{r.leads}</td>
                    <td style={styles.td}>{r.interested}</td>
                    <td style={styles.td}>{r.closed}</td>
                    <td style={styles.td} title={fxBreakdown(r.totals)}>{totalText(r.totals)}</td>
                    <td style={styles.td}>{perLead(r.totals, r.leads)}</td>
                    <td style={styles.td}>{perLead(r.totals, r.closed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHead}><h3 style={styles.cardTitle}>לידים לפי קמפיין</h3></div>
          <div style={{ padding: "8px 4px" }}>
            {rows.map((r, i) => (
              <Bar key={r.name} label={r.name} count={r.leads} max={maxLeads} color={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
const CAMPAIGN_COLORS = ["#1FA9B8", "#8B5CF6", "#F59E0B", "#10B981", "#6366F1", "#EF4444", "#0EA5E9"];

const ANALYTICS_TABS = [
  { id: "overview", label: "סקירה כללית" },
  { id: "funnel", label: "משפך והמרות" },
  { id: "campaigns", label: "קמפיינים" },
];

function Analytics({ stats, leads, allLeads, onOpen, onFilterClick, session, flash }) {
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Events + costs come from the shared provider, so switching screens doesn't
  // refetch them. Loaded lazily: most sessions never leave the overview.
  const { events, costs, state, ensure, reload: load } = useStats();
  useEffect(() => {
    if (tab === "funnel" || tab === "campaigns") ensure();
  }, [tab, ensure]);

  const bounds = rangeBounds(range, customFrom, customTo);

  return (
    <div>
      <h1 style={styles.pageTitle}>סטטיסטיקות</h1>
      <div style={styles.tabBar}>
        {ANALYTICS_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...styles.tabBtn,
            color: tab === t.id ? KAPPA.tealDark : "#8695A8",
            borderBottomColor: tab === t.id ? KAPPA.teal : "transparent",
            fontWeight: tab === t.id ? 800 : 600,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <p style={styles.pageSub}>תמונת מצב של משפך המשקיעים</p>
          <Dashboard stats={stats} leads={leads} onOpen={onOpen} onFilterClick={onFilterClick} />
        </>
      )}

      {(tab === "funnel" || tab === "campaigns") && (
        <>
          <RangePicker value={range} onChange={setRange} customFrom={customFrom} customTo={customTo}
            onCustom={(f, t) => { setCustomFrom(f); setCustomTo(t); }} />
          {state === "loading" && (
            <div style={styles.centerState}><RefreshCw size={26} color={KAPPA.teal} className="spin" /><p style={styles.stateText}>טוען נתונים…</p></div>
          )}
          {state === "error" && (
            <div style={styles.centerState}>
              <AlertCircle size={32} color="#EF4444" />
              <p style={styles.stateText}>לא הצלחנו לטעון את הנתונים.</p>
              <button style={styles.retryBtn} onClick={load}>נסה שוב</button>
            </div>
          )}
          {(state === "ready" || state === "idle") && tab === "funnel" && <FunnelTab events={events} bounds={bounds} leads={leads} />}
          {(state === "ready" || state === "idle") && tab === "campaigns" && (
            <CampaignsTab leads={allLeads} costs={costs} bounds={bounds} />
          )}
        </>
      )}
    </div>
  );
}

function Dashboard({ stats, leads, onOpen, onFilterClick }) {
  // Newest first. created_at is date-only, so leads added on the same day would
  // tie; those fall back to sheet order, where a later row is the later entry.
  const recent = leads
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const da = parseDMY(a.l.created_at), db = parseDMY(b.l.created_at);
      if (da && db && da.getTime() !== db.getTime()) return db.getTime() - da.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return b.i - a.i;
    })
    .slice(0, 6)
    .map((x) => x.l);
  const byStage = STAGES.map((s) => ({ ...s, count: leads.filter((l) => l.stage === s.id).length }));
  const maxCount = Math.max(1, ...byStage.map((s) => s.count));

  // Follow-up calls, split by timing. Active leads only (skip lost).
  const today = startOfToday();
  const withCall = leads
    .filter((l) => l.stage !== "lost" && l.stage !== "closed" && parseDMY(l.next_call))
    .map((l) => ({ lead: l, date: parseDMY(l.next_call) }));
  // Overdue: call date is before today. Oldest (most overdue) first.
  const overdue = withCall.filter((x) => x.date < today).sort((a, b) => a.date - b.date);
  // Upcoming: call date is today or later. Soonest (closest to today) first.
  const upcoming = withCall.filter((x) => x.date >= today).sort((a, b) => a.date - b.date);

  return (
    <div>
      <div style={styles.kpiRow} className="kpi-row">
        <Kpi icon={<Users size={20} />} tint={KAPPA.teal} label="לידים פעילים" value={stats.total} onClick={() => onFilterClick(FUNNEL_STAGES)} />
        <Kpi icon={<CheckCircle2 size={20} />} tint="#10B981" label="מעוניינים להשקיע" value={stats.interested} onClick={() => onFilterClick(["interested"])} />
        <Kpi icon={<TrendingUp size={20} />} tint="#8B5CF6" label="פוטנציאל במשפך לידים" value={fmtMoney(stats.pipeline)} onClick={() => onFilterClick(FUNNEL_STAGES)} />
        <Kpi icon={<Wallet size={20} />} tint="#F59E0B" label="התחייבו / סגרו" value={fmtMoney(stats.committed)} onClick={() => onFilterClick(["interested", "closed"])} />
        <Kpi icon={<Clock size={20} />} tint="#EF4444" label={`תקועים ${STAGE_AGE_LIMIT}+ ימים`} value={stats.stuck} onClick={() => onFilterClick(FUNNEL_STAGES, true)} />
      </div>
      <div style={styles.dashGrid} className="dash-grid">
        <div style={styles.card}>
          <div style={styles.cardHead}><h3 style={styles.cardTitle}>פילוח לפי שלב</h3></div>
          <div style={{ padding: "8px 4px" }}>
            {byStage.map((s) => (
              <div key={s.id} style={styles.barRow}>
                <span style={styles.barLabel}>{s.label}</span>
                <div style={styles.barTrack}><div style={{ ...styles.barFill, width: `${(s.count / maxCount) * 100}%`, background: s.color }} /></div>
                <span style={styles.barCount}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardHead}><h3 style={styles.cardTitle}>לידים אחרונים</h3></div>
          <div>
            {recent.map((l) => {
              const st = stageOf(l.stage);
              return (
                <button key={l.id} className="row-btn" style={styles.recentRowLg} onClick={() => onOpen(l)}>
                  <div style={{ ...styles.avatarDash, background: st.soft, color: st.color }}>{initials(l.name)}</div>
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <div style={styles.recentNameLg}>{l.name}</div>
                    <div style={styles.recentMetaLg}>{l.campaign} · {fmtMoney(l.amount)}</div>
                  </div>
                  <span style={{ ...styles.chipLg, background: st.soft, color: st.color }}>{st.label}</span>
                  <ChevronLeft size={16} color="#CBD5E1" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={styles.callsDivider}>
        <span style={styles.callsDividerLine} />
        <span style={styles.callsDividerLabel}><Phone size={14} /> מעקב שיחות</span>
        <span style={styles.callsDividerLine} />
      </div>
      <div style={styles.dashGrid} className="dash-grid">
        <CallList title="שיחות שעבר זמנן" tint="#EF4444" icon={<Clock size={17} />} items={overdue} emptyText="אין שיחות באיחור 🎉" onOpen={onOpen} />
        <CallList title="שיחות קרובות" tint={KAPPA.teal} icon={<CalendarClock size={17} />} items={upcoming} emptyText="אין שיחות מתוזמנות" onOpen={onOpen} />
      </div>
    </div>
  );
}

// A dashboard block listing leads by their next_call date.
function CallList({ title, tint, icon, items, emptyText, onOpen }) {
  return (
    <div style={{ ...styles.callCard, borderTop: `4px solid ${tint}` }}>
      <div style={styles.callCardHead}>
        <div style={{ ...styles.callCardIconBadge, background: tint + "18", color: tint }}>{icon}</div>
        <h3 style={styles.callCardTitle}>{title}</h3>
        <span style={{ ...styles.callCount, background: tint + "18", color: tint }}>{items.length}</span>
      </div>
      <div>
        {items.length === 0 && <div style={styles.callEmpty}>{emptyText}</div>}
        {items.map(({ lead, date }) => {
          const st = stageOf(lead.stage);
          const days = Math.round((date - startOfToday()) / 86400000);
          const when = days === 0 ? "היום" : days < 0 ? `לפני ${Math.abs(days)} ימים` : `בעוד ${days} ימים`;
          return (
            <button key={lead.id} className="row-btn" style={styles.recentRowLg} onClick={() => onOpen(lead)}>
              <div style={{ ...styles.avatarDash, background: st.soft, color: st.color }}>{initials(lead.name)}</div>
              <div style={{ flex: 1, textAlign: "right" }}>
                <div style={styles.recentNameLg}>{lead.name}</div>
                <div style={styles.recentMetaLg}>{lead.next_call} · {st.label}</div>
              </div>
              <span style={{ ...styles.chipLg, background: tint === "#EF4444" ? "#FEF2F2" : KAPPA.tealSoft, color: tint }}>{when}</span>
              <ChevronLeft size={16} color="#CBD5E1" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Kpi({ icon, tint, label, value, onClick }) {
  return (
    <div style={styles.kpi} className={onClick ? "kpi-clickable" : ""} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}>
      <div style={{ ...styles.kpiIcon, background: tint + "18", color: tint }}>{icon}</div>
      <div style={styles.kpiValue}>{value}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}

// ============ Leads-screen filters ============
// Compact ISO date input for filter popovers. Uses the same local-state
// pattern as DateField (see above) so a half-typed year doesn't wipe the
// day/month already entered — here there's no dd/mm/yyyy conversion since
// the filter state itself just stores plain ISO strings.
function FilterDateInput({ value, onChange }) {
  const [local, setLocal] = useState(value || "");
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(value || ""); }, [value]);
  return (
    <input
      type="date"
      value={local}
      dir="ltr"
      style={styles.filterDateInput}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (DATE_COMPLETE.test(v)) onChange(v);
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (!DATE_COMPLETE.test(local) && local !== (value || "")) { setLocal(""); onChange(""); }
      }}
    />
  );
}

function PipelineFilterBar({ filters, onChange, isMobile }) {
  const [open, setOpen] = useState(null); // null | 'created' | 'other' | 'stage'
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(null); };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const hasCreated = !!(filters.createdFrom || filters.createdTo);
  const hasOther = !!(filters.dateFrom || filters.dateTo);
  const hasStages = filters.stages.length > 0;
  const anyActive = hasCreated || hasOther || hasStages || filters.stuck;
  const dateFieldLabel = (DATE_FILTER_FIELDS.find((f) => f.id === filters.dateField) || DATE_FILTER_FIELDS[0]).label;

  const toggleStage = (id) => {
    onChange((f) => ({ ...f, stages: f.stages.includes(id) ? f.stages.filter((s) => s !== id) : [...f.stages, id] }));
  };

  return (
    <div style={styles.filterBar} ref={wrapRef}>
      <div style={styles.filterBtnWrap}>
        <button style={{ ...styles.filterBtn, ...(hasCreated ? styles.filterBtnActive : {}) }} onClick={() => setOpen(open === "created" ? null : "created")}>
          <CalendarClock size={14} />{isMobile ? "יצירה" : "תאריך יצירה"}{hasCreated && <span style={styles.filterDot} />}
        </button>
        {open === "created" && (
          <div style={styles.filterPopover}>
            <div style={styles.filterPopRow}>
              <div style={styles.filterPopField}>
                <label style={styles.filterPopLabel}>מתאריך</label>
                <FilterDateInput value={filters.createdFrom} onChange={(v) => onChange((f) => ({ ...f, createdFrom: v }))} />
              </div>
              <div style={styles.filterPopField}>
                <label style={styles.filterPopLabel}>עד תאריך</label>
                <FilterDateInput value={filters.createdTo} onChange={(v) => onChange((f) => ({ ...f, createdTo: v }))} />
              </div>
            </div>
            {hasCreated && <button style={styles.filterPopClear} onClick={() => onChange((f) => ({ ...f, createdFrom: "", createdTo: "" }))}>נקה</button>}
          </div>
        )}
      </div>

      <div style={styles.filterBtnWrap}>
        <button style={{ ...styles.filterBtn, ...(hasOther ? styles.filterBtnActive : {}) }} onClick={() => setOpen(open === "other" ? null : "other")}>
          <CalendarClock size={14} />{isMobile ? "תאריך" : `תאריך: ${dateFieldLabel}`}{hasOther && <span style={styles.filterDot} />}
        </button>
        {open === "other" && (
          <div style={styles.filterPopover}>
            <div style={styles.filterPopField}>
              <label style={styles.filterPopLabel}>לפי שדה</label>
              <select style={styles.filterPopSelect} value={filters.dateField} onChange={(e) => onChange((f) => ({ ...f, dateField: e.target.value }))}>
                {DATE_FILTER_FIELDS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div style={styles.filterPopRow}>
              <div style={styles.filterPopField}>
                <label style={styles.filterPopLabel}>מתאריך</label>
                <FilterDateInput value={filters.dateFrom} onChange={(v) => onChange((f) => ({ ...f, dateFrom: v }))} />
              </div>
              <div style={styles.filterPopField}>
                <label style={styles.filterPopLabel}>עד תאריך</label>
                <FilterDateInput value={filters.dateTo} onChange={(v) => onChange((f) => ({ ...f, dateTo: v }))} />
              </div>
            </div>
            {hasOther && <button style={styles.filterPopClear} onClick={() => onChange((f) => ({ ...f, dateFrom: "", dateTo: "" }))}>נקה</button>}
          </div>
        )}
      </div>

      <div style={styles.filterBtnWrap}>
        <button style={{ ...styles.filterBtn, ...(hasStages ? styles.filterBtnActive : {}) }} onClick={() => setOpen(open === "stage" ? null : "stage")}>
          <LayoutGrid size={14} />קבוצה{hasStages ? ` (${filters.stages.length})` : ""}
        </button>
        {open === "stage" && (
          <div style={styles.filterPopover}>
            {STAGES.map((s) => (
              <label key={s.id} style={styles.filterCheckRow}>
                <input type="checkbox" checked={filters.stages.includes(s.id)} onChange={() => toggleStage(s.id)} />
                <span style={{ ...styles.filterCheckDot, background: s.color }} />{s.label}
              </label>
            ))}
            {hasStages && <button style={styles.filterPopClear} onClick={() => onChange((f) => ({ ...f, stages: [] }))}>נקה בחירה</button>}
          </div>
        )}
      </div>

      <button
        style={{ ...styles.filterBtn, ...(filters.stuck ? styles.filterBtnActive : {}) }}
        onClick={() => onChange((f) => ({ ...f, stuck: !f.stuck }))}>
        <Clock size={14} />תקועים {STAGE_AGE_LIMIT}+{filters.stuck && <span style={styles.filterDot} />}
      </button>

      {anyActive && (
        <button style={styles.filterClearAll} onClick={() => onChange((f) => ({ ...f, createdFrom: "", createdTo: "", dateFrom: "", dateTo: "", stages: [], stuck: false }))}>
          נקה סינון
        </button>
      )}
    </div>
  );
}

// ============ Pipeline ============
function Pipeline({ leads, onOpen, onMove, dragId, setDragId, isMobile, filters, onFiltersChange, onSnooze, onContacted }) {
  const [mode, setMode] = useState("kanban"); // kanban | list
  const [drag, setDrag] = useState(null); // { id, x, y, w, offX, offY, lead }
  const [overStage, setOverStage] = useState(null);
  const [expanded, setExpanded] = useState({}); // { [stageId]: true } → show all cards
  const COLLAPSED_LIMIT = 5;
  // Newest lead first (LIFO) by created_at; falls back to id order.
  const sortLifo = (arr) => [...arr].sort((a, b) => {
    const da = parseDMY(a.created_at), db = parseDMY(b.created_at);
    if (da && db && da - db !== 0) return db - da;
    return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });

  // pointer-based drag (RTL-safe, works everywhere)
  useEffect(() => {
    if (!drag) return;
    const onMoveEvt = (e) => {
      const x = e.clientX, y = e.clientY;
      setDrag((d) => (d ? { ...d, x, y } : d));
      // find column under pointer
      const el = document.elementFromPoint(x, y);
      const col = el && el.closest ? el.closest("[data-stage]") : null;
      setOverStage(col ? col.getAttribute("data-stage") : null);
    };
    const onUp = () => {
      setDrag((d) => {
        if (d && overStageRef.current && overStageRef.current !== d.lead.stage) {
          onMove(String(d.id), overStageRef.current);
        }
        return null;
      });
      setOverStage(null);
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMoveEvt);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, onMove]);

  // keep latest overStage in a ref for the pointerup handler
  const overStageRef = React.useRef(null);
  useEffect(() => { overStageRef.current = overStage; }, [overStage]);

  const startDrag = (e, lead) => {
    // Never drag on touch input or narrow screens — moving stages there
    // is done via the in-lead stage buttons / stage <select>, so an
    // accidental swipe can't relocate a lead.
    if (isMobile || (e.pointerType && e.pointerType === "touch")) return;
    if (e.button != null && e.button !== 0) return; // left only
    const target = e.currentTarget || e.target;
    const rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : { width: 240, left: e.clientX - 120, top: e.clientY - 20 };
    document.body.style.userSelect = "none";
    setDrag({
      id: lead.id, lead,
      x: e.clientX, y: e.clientY,
      w: rect.width,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
    });
  };

  return (
    <div>
      <div style={styles.pipeHead}>
        <div style={styles.pipeHeadMain}>
          <div>
            <h1 style={styles.pageTitle}>לידים</h1>
            <p style={styles.pageSub}>{isMobile ? "הקש על ליד לפתיחה ושינוי שלב" : (mode === "kanban" ? "גרור כרטיס בין שלבים כדי לעדכן סטטוס" : "לחץ על כותרת עמודה כדי למיין")}</p>
          </div>
          <PipelineFilterBar filters={filters} onChange={onFiltersChange} isMobile={isMobile} />
        </div>
        <div style={styles.viewToggle}>
          <button onClick={() => setMode("kanban")} style={{ ...styles.toggleBtn, ...(mode === "kanban" ? styles.toggleActive : {}) }}>
            <LayoutGrid size={16} /> לוח
          </button>
          <button onClick={() => setMode("list")} style={{ ...styles.toggleBtn, ...(mode === "list" ? styles.toggleActive : {}) }}>
            <List size={16} /> רשימה
          </button>
        </div>
      </div>

      {mode === "kanban" ? (
        <div style={styles.board}>
          {STAGES.map((stage) => {
            const all = sortLifo(leads.filter((l) => l.stage === stage.id));
            const sum = all.reduce((s, l) => s + (Number(l.amount) || 0), 0);
            const isOpen = !!expanded[stage.id];
            const items = isOpen ? all : all.slice(0, COLLAPSED_LIMIT);
            const hidden = all.length - items.length;
            const isOver = overStage === stage.id && drag;
            return (
              <div key={stage.id} className="col" data-stage={stage.id}
                style={{ ...styles.col, background: isOver ? stage.soft : (stage.muted ? "#F3F5F8" : "#EFF2F6"), opacity: stage.muted && !isOver ? 0.78 : 1, outline: isOver ? `2px dashed ${stage.color}` : "none" }}>
                <div style={styles.colHead}>
                  <span style={{ ...styles.colDot, background: stage.color }} />
                  <span style={styles.colTitle}>{stage.label}</span>
                  <span style={styles.colCount}>{all.length}</span>
                </div>
                {sum > 0 && <div style={styles.colSum}>{fmtMoney(sum)}</div>}
                <div style={styles.colBody}>
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} stage={stage}
                      onClick={() => onOpen(l)}
                      onPointerDown={(e) => startDrag(e, l)}
                      dragging={drag && drag.id === l.id}
                      isMobile={isMobile}
                      onSnooze={onSnooze} onContacted={onContacted} />
                  ))}
                  {all.length === 0 && <div style={styles.emptyCol}>גרור לכאן</div>}
                  {(hidden > 0 || isOpen) && all.length > COLLAPSED_LIMIT && (
                    <button style={styles.expandBtn} onClick={() => setExpanded((p) => ({ ...p, [stage.id]: !isOpen }))}>
                      {isOpen ? "הצג פחות ▲" : `הצג עוד ${hidden} ▼`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ListView leads={leads} onOpen={onOpen} onMove={onMove} isMobile={isMobile} onSnooze={onSnooze} onContacted={onContacted} />
      )}

      {drag && (
        <div style={{
          position: "fixed", left: drag.x - drag.offX, top: drag.y - drag.offY,
          width: drag.w, pointerEvents: "none", zIndex: 999, opacity: 0.92,
          transform: "rotate(2deg)", boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
        }}>
          <div style={{ ...styles.leadCard, borderRightColor: stageOf(drag.lead.stage).color, background: "#fff" }}>
            <div style={styles.leadCardTop}>
              <div style={{ ...styles.avatarSm, background: stageOf(drag.lead.stage).soft, color: stageOf(drag.lead.stage).color }}>{initials(drag.lead.name)}</div>
              <span style={styles.leadName}>{drag.lead.name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// A flat, sortable table of every lead in the current filter. Unlike the board
// it is NOT grouped by stage — it exists to answer "who owes me a call", "who
// is the biggest", "who went quiet", which grouping by stage hides.
function ListView({ leads, onOpen, onMove, isMobile, onSnooze, onContacted }) {
  const [sort, setSort] = useState({ key: "next_call", dir: "asc" });
  const cols = [
    { key: "name", label: "שם" },
    { key: "stage", label: "שלב" },
    { key: "campaign", label: "קמפיין" },
    { key: "amount", label: "סכום" },
    { key: "next_call", label: "שיחה הבאה" },
    { key: "last_contact", label: "קשר אחרון" },
    { key: "age", label: "ימים בשלב" },
  ];
  const valueOf = (l, k) => {
    if (k === "amount") return Number(l.amount) || 0;
    if (k === "age") { const d = daysInStage(l); return d == null ? -1 : d; }
    if (k === "stage") return STAGES.findIndex((st) => st.id === l.stage);
    if (k === "next_call" || k === "last_contact") {
      const d = parseDMY(l[k]);
      return d ? d.getTime() : Infinity; // undated rows sink to the bottom
    }
    return String(l[k] || "");
  };
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...leads].sort((a, b) => {
      const va = valueOf(a, sort.key), vb = valueOf(b, sort.key);
      if (va === vb) return 0;
      if (typeof va === "string") return va.localeCompare(vb, "he") * dir;
      return (va < vb ? -1 : 1) * dir;
    });
  }, [leads, sort]);
  const toggle = (k) => setSort((p) => (p.key === k
    ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: (k === "amount" || k === "age") ? "desc" : "asc" }));

  if (!leads.length) return <div style={styles.lTableEmpty}>אין לידים שתואמים לסינון.</div>;

  return (
    <div style={styles.lTableWrap}>
      <table style={styles.lTable}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={styles.lTh} scope="col">
                <button style={styles.lThBtn} onClick={() => toggle(c.key)} aria-label={`מיין לפי ${c.label}`}>
                  {c.label}<span style={styles.lThArrow}>{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                </button>
              </th>
            ))}
            <th style={styles.lTh} scope="col"><span style={styles.lThStatic}>פעולות</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => {
            const st = stageOf(l.stage);
            const due = isDue(l.next_call);
            const age = daysInStage(l);
            const stuck = isStuck(l);
            return (
              <tr key={l.id} className="table-row" style={styles.lTr} onClick={() => onOpen(l)}>
                <td style={styles.lTd}>
                  <div style={styles.lTdName}>
                    <div style={{ ...styles.avatarSm, background: st.soft, color: st.color }}>{initials(l.name)}</div>
                    <span style={styles.leadName}>{l.name}</span>
                  </div>
                </td>
                <td style={styles.lTd} onClick={(e) => e.stopPropagation()}>
                  <select value={l.stage} onChange={(e) => onMove(l.id, e.target.value)} style={{ ...styles.stageSelect, color: st.color }} aria-label={`שלב עבור ${l.name}`}>
                    {STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </td>
                <td style={{ ...styles.lTd, color: "#8695A8" }}>{l.campaign || "—"}</td>
                <td style={{ ...styles.lTd, fontWeight: 700, direction: "ltr", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(l.amount)}</td>
                <td style={{ ...styles.lTd, color: due ? "#EF4444" : KAPPA.graphite, fontWeight: due ? 700 : 500 }}>{l.next_call || "—"}</td>
                <td style={{ ...styles.lTd, color: "#8695A8" }}>{l.last_contact || "—"}</td>
                <td style={styles.lTd}>
                  {age == null ? "—" : <span style={{ ...styles.ageTag, ...(stuck ? styles.ageTagStuck : {}) }}>{age}</span>}
                </td>
                <td style={styles.lTd} onClick={(e) => e.stopPropagation()}>
                  <div style={styles.quickRow}>
                    <button style={styles.quickBtn} onClick={() => onContacted(l)} title="סמן שדובר היום">דובר היום</button>
                    <button style={styles.quickBtn} onClick={() => onSnooze(l, 1)} title="דחה את השיחה ביום">דחה יום</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeadCard({ lead, stage, onClick, onPointerDown, dragging, isMobile, onSnooze, onContacted }) {
  const due = isDue(lead.next_call);
  const age = daysInStage(lead);
  const stuck = isStuck(lead);
  const startRef = React.useRef(null);
  const movedRef = React.useRef(false);

  const handleDown = (e) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    // begin tracking; actual drag starts after small movement threshold
    const onMove = (ev) => {
      if (!startRef.current) return;
      const dx = Math.abs(ev.clientX - startRef.current.x);
      const dy = Math.abs(ev.clientY - startRef.current.y);
      if (dx > 5 || dy > 5) {
        movedRef.current = true;
        window.removeEventListener("pointermove", onMove);
        onPointerDown(e); // hand off to Pipeline's drag
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      startRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleClick = () => { if (!movedRef.current) onClick(); };

  return (
    <div className="lead-card" onPointerDown={isMobile ? undefined : handleDown} onClick={isMobile ? onClick : handleClick}
      style={{ ...styles.leadCard, opacity: dragging ? 0.35 : 1, borderRightColor: stage.color, touchAction: isMobile ? "auto" : "none" }}>
      <div style={styles.leadCardTop}>
        <div style={{ ...styles.avatarSm, background: stage.soft, color: stage.color }}>{initials(lead.name)}</div>
        <span style={styles.leadName}>{lead.name}</span>
      </div>
      {lead.summary && <p style={styles.leadSummary}>{lastNote(lead.summary)}</p>}
      <div style={styles.leadTags}>
        {Number(lead.amount) > 0 && <span style={styles.leadTag}><DollarSign size={11} />{Math.round(Number(lead.amount) / 1000)}K</span>}
        {lead.track && <span style={styles.leadTag}>{lead.track}</span>}
        {lead.stage === "lost" && lead.lost_reason && <span style={{ ...styles.leadTag, background: "#FEF2F2", color: "#B91C1C" }}>{lead.lost_reason}</span>}
        {stuck && <span style={{ ...styles.leadTag, background: "#FEF2F2", color: "#B91C1C" }}>{age} ימים בשלב</span>}
      </div>
      <div style={styles.leadFoot}>
        <span style={styles.leadCampaign}>{lead.campaign}</span>
        {lead.next_call && (
          <span style={{ ...styles.leadCall, color: due ? "#EF4444" : "#94A3B8" }}>
            <Clock size={11} /> {lead.next_call}
          </span>
        )}
      </div>
      <div className="card-quick" style={{ ...styles.quickRow, ...(isMobile ? { opacity: 1 } : {}) }} onPointerDown={(e) => e.stopPropagation()}>
        <button style={styles.quickBtn} onClick={(e) => { e.stopPropagation(); onContacted && onContacted(lead); }}>דובר היום</button>
        <button style={styles.quickBtn} onClick={(e) => { e.stopPropagation(); onSnooze && onSnooze(lead, 1); }}>דחה יום</button>
      </div>
    </div>
  );
}

// ============ Tasks ============
// Every open task across every lead, in one list. This is the screen a sales
// person lives in: what is due today, what slipped, and whose it is.
function TasksBoard({ leads, session, onOpen, onToggle, onSnooze }) {
  const me = (session && session.email) || "";
  const [scope, setScope] = useState("mine"); // mine | all
  const [showDone, setShowDone] = useState(false);

  const rows = useMemo(() => {
    const out = [];
    leads.forEach((lead) => {
      parseTasks(lead).forEach((t) => {
        if (!showDone && t.done) return;
        if (scope === "mine" && String(t.owner || lead.owner || "") !== me) return;
        out.push({ lead, task: t, due: parseDMY(t.due) });
      });
    });
    return out.sort((a, b) => {
      if (a.task.done !== b.task.done) return a.task.done ? 1 : -1;
      const da = a.due ? a.due.getTime() : Infinity, db = b.due ? b.due.getTime() : Infinity;
      return da - db;
    });
  }, [leads, scope, showDone, me]);

  const today = startOfToday();
  const overdue = rows.filter((r) => !r.task.done && r.due && r.due < today).length;
  const dueToday = rows.filter((r) => !r.task.done && r.due && r.due.getTime() === today.getTime()).length;

  return (
    <div>
      <h1 style={styles.pageTitle}>משימות</h1>
      <p style={styles.pageSub}>כל המשימות הפתוחות על פני כל הלידים, לפי מועד</p>

      <div style={styles.kpiRow} className="kpi-row">
        <Kpi icon={<Clock size={20} />} tint="#EF4444" label="באיחור" value={overdue} />
        <Kpi icon={<CalendarClock size={20} />} tint={KAPPA.teal} label="להיום" value={dueToday} />
        <Kpi icon={<CheckCircle2 size={20} />} tint="#10B981" label="פתוחות סה״כ" value={rows.filter((r) => !r.task.done).length} />
      </div>

      <div style={styles.taskBar}>
        <div style={styles.viewToggle}>
          <button onClick={() => setScope("mine")} style={{ ...styles.toggleBtn, ...(scope === "mine" ? styles.toggleActive : {}) }}>שלי</button>
          <button onClick={() => setScope("all")} style={{ ...styles.toggleBtn, ...(scope === "all" ? styles.toggleActive : {}) }}>הכל</button>
        </div>
        <label style={styles.taskShowDone}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          הצג גם משימות שהושלמו
        </label>
      </div>

      {rows.length === 0 ? (
        <div style={styles.centerState}>
          <CheckCircle2 size={38} color="#CBD5E1" />
          <p style={styles.stateText}>אין משימות פתוחות. אפשר להוסיף משימה מתוך כרטיס הליד.</p>
        </div>
      ) : (
        <div style={styles.taskList}>
          {rows.map(({ lead, task, due }) => {
            const late = !task.done && due && due < today;
            const isToday = !task.done && due && due.getTime() === today.getTime();
            return (
              <div key={lead.id + task.id} style={styles.taskRow}>
                <button style={styles.taskCheck} onClick={() => onToggle(lead, task.id)}
                  aria-label={task.done ? "סמן כלא הושלמה" : "סמן כהושלמה"} title={task.done ? "החזר לפתוחה" : "סיים"}>
                  <CheckCircle2 size={20} color={task.done ? "#10B981" : "#CBD5E1"} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...styles.taskTitle, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#94A3B8" : KAPPA.ink }}>
                    {task.title}
                  </div>
                  <div style={styles.taskMeta}>
                    {taskTypeLabel(task.type)} · <button className="row-btn" style={styles.taskLeadLink} onClick={() => onOpen(lead)}>{lead.name}</button>
                    {task.owner ? ` · ${task.owner}` : ""}
                  </div>
                </div>
                <span style={{ ...styles.taskDue, color: late ? "#EF4444" : isToday ? KAPPA.tealDark : "#94A3B8" }}>
                  {task.due || "ללא תאריך"}
                </span>
                {!task.done && (
                  <button style={styles.quickBtn} onClick={() => onSnooze(lead, task.id, 1)}>דחה יום</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tasks for a single lead, inside the drawer.
function TasksBlock({ lead, owners, session, onSaveTasks }) {
  const tasks = parseTasks(lead);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("call");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState((session && session.email) || "");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    await onSaveTasks(lead, [...tasks, { id: newTaskId(), title: t, type, due, owner, done: false, created_at: todayStr() }]);
    setTitle(""); setDue("");
    setSaving(false);
  };
  const toggle = (id) => onSaveTasks(lead, tasks.map((x) => (x.id === id
    ? { ...x, done: !x.done, done_at: !x.done ? todayStr() : "" } : x)));
  const remove = (id) => onSaveTasks(lead, tasks.filter((x) => x.id !== id));

  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = parseDMY(a.due), db = parseDMY(b.due);
    return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
  });

  return (
    <div style={styles.summaryBox}>
      <div style={styles.summaryLabel}>משימות</div>
      {sorted.length === 0 && <div style={styles.histEmpty}>אין משימות פתוחות לליד הזה.</div>}
      {sorted.map((t) => {
        const late = !t.done && isDue(t.due);
        return (
          <div key={t.id} style={styles.taskMini}>
            <button style={styles.taskCheck} onClick={() => toggle(t.id)} aria-label={t.done ? "החזר לפתוחה" : "סיים"}>
              <CheckCircle2 size={18} color={t.done ? "#10B981" : "#CBD5E1"} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...styles.taskMiniTitle, textDecoration: t.done ? "line-through" : "none", color: t.done ? "#94A3B8" : KAPPA.ink }}>{t.title}</div>
              <div style={styles.taskMiniMeta}>
                {taskTypeLabel(t.type)}{t.due ? ` · ${t.due}` : ""}{t.owner ? ` · ${t.owner}` : ""}
              </div>
            </div>
            {late && <span style={styles.taskLate}>באיחור</span>}
            <button style={styles.taskDelete} onClick={() => remove(t.id)} aria-label="מחק משימה" title="מחק">×</button>
          </div>
        );
      })}
      <div style={styles.taskAddGrid} className="task-add-grid">
        <input style={styles.input} placeholder="משימה חדשה…" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <select style={styles.input} value={type} onChange={(e) => setType(e.target.value)} aria-label="סוג משימה">
          {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select style={styles.input} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="אחראי">
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div style={styles.taskAddFoot}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <DateField label="מועד יעד" value={due} onChange={setDue} />
        </div>
        <button style={{ ...styles.summaryAddBtn, opacity: title.trim() && !saving ? 1 : 0.5, cursor: title.trim() && !saving ? "pointer" : "not-allowed" }}
          disabled={!title.trim() || saving} onClick={add}>
          {saving ? "שומר…" : "הוסף משימה"}
        </button>
      </div>
    </div>
  );
}

// ============ Journey ============
function JourneyBoard({ leads, onOpen }) {
  return (
    <div>
      <h1 style={styles.pageTitle}>ליווי משקיעים</h1>
      <p style={styles.pageSub}>מי שסימן "מעוניין להשקיע" עובר אוטומטית למסלול הכניסה להשקעה</p>
      {leads.length === 0 && (
        <div style={styles.centerState}>
          <Target size={40} color="#CBD5E1" />
          <p style={styles.stateText}>אין עדיין משקיעים בליווי. סמן ליד כ"מעוניין להשקיע" והוא יופיע כאן.</p>
        </div>
      )}
      <div style={styles.journeyList}>
        {leads.map((l) => (
          <div key={l.id} style={styles.journeyCard}>
            <div style={styles.journeyHead}>
              <div style={{ ...styles.avatar, background: KAPPA.tealSoft, color: KAPPA.teal }}>{initials(l.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={styles.journeyName}>{l.name}</div>
                <div style={styles.journeyMeta}>{l.track} · {fmtMoney(l.amount)}</div>
              </div>
              <button style={styles.linkBtn} onClick={() => onOpen(l)}>פרטים <ArrowLeft size={14} /></button>
            </div>
            <JourneyBar current={Number(l.journey_stage) || 0} done={Number(l.journey_done) || 0} />
          </div>
        ))}
      </div>
    </div>
  );
}
function JourneyBar({ current, done }) {
  // current = the active stage (1-6), shown with a ring around the number.
  // done = highest completed stage (0-6), shown filled with a check.
  const activeIdx = (Number(current) || 0) - 1; // 0-based index of the active step
  const doneCount = Number(done) || 0;           // how many steps are fully complete
  return (
    <div style={styles.journeyBar} className="journey-bar">
      {JOURNEY.map((label, i) => {
        const isDone = i < doneCount;              // fully completed → filled
        const isActive = i === activeIdx && !isDone; // reached but not yet completed → ring
        return (
          <React.Fragment key={i}>
            <div style={styles.jStep} className="journey-step">
              <div className="journey-dot" style={{
                ...styles.jDot,
                background: isDone ? KAPPA.teal : "#fff",
                borderColor: (isDone || isActive) ? KAPPA.teal : "#E2E8F0",
                borderWidth: isActive ? 3 : 2,
                color: isDone ? "#fff" : isActive ? KAPPA.teal : "#CBD5E1",
                boxShadow: isActive ? `0 0 0 4px ${KAPPA.teal}22` : "none",
              }}>{isDone ? <CheckCircle2 size={15} /> : i + 1}</div>
              <span className="journey-label" style={{ ...styles.jLabel, color: (isDone || isActive) ? KAPPA.ink : "#94A3B8", fontWeight: isActive ? 700 : 500 }}>{label}</span>
            </div>
            {i < JOURNEY.length - 1 && <div className="journey-line" style={{ ...styles.jLine, background: i < doneCount ? KAPPA.teal : "#E2E8F0" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============ Investments Editor ============
// Lets an investor split their investment across multiple tracks, each with its
// own amount and (for eligible tracks) a compound-interest toggle.
function InvestmentsEditor({ rows, onChange }) {
  const update = (i, patch) => {
    const next = rows.map((r, idx) => {
      if (idx !== i) return r;
      const merged = { ...r, ...patch };
      // Clear compound if the new track isn't eligible
      if (!isCompoundEligible(merged.track)) merged.compound = false;
      return merged;
    });
    onChange(next);
  };
  const addRow = () => onChange([...rows, { track: "", amount: "", compound: false }]);
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const total = investmentsTotal(rows);
  return (
    <div style={styles.invWrap}>
      <div style={styles.invHead}>
        <span style={styles.fieldLabel}>מסלולי השקעה</span>
        <span style={styles.invTotal}>סה״כ: {fmtMoney(total)}</span>
      </div>
      {rows.map((r, i) => {
        const eligible = isCompoundEligible(r.track);
        return (
          <div key={i} style={styles.invRow}>
            <div style={styles.invRowTop}>
              <select style={{ ...styles.input, flex: "1 1 120px", minWidth: 0 }} value={r.track} onChange={(e) => update(i, { track: e.target.value })}>
                <option value="">בחר מסלול…</option>
                {TRACKS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input style={{ ...styles.input, width: 110 }} type="number" placeholder="סכום $" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} dir="ltr" />
              <button style={styles.invRemove} onClick={() => removeRow(i)} title="הסר מסלול" aria-label="הסר">×</button>
            </div>
            {eligible && (
              <label style={styles.invCompound}>
                <input type="checkbox" checked={!!r.compound} onChange={(e) => update(i, { compound: e.target.checked })} />
                <span>מעוניין בריבית דריבית</span>
              </label>
            )}
          </div>
        );
      })}
      <button style={styles.invAdd} onClick={addRow}>+ הוסף מסלול</button>
    </div>
  );
}

// Read-only display of a lead's investment tracks, amounts, and payout mode.
function InvestmentsView({ lead }) {
  const rows = parseInvestments(lead);
  if (!rows.length) return null;
  return (
    <div style={styles.invViewWrap}>
      <div style={styles.fieldLabel}>מסלולי השקעה</div>
      {rows.map((r, i) => (
        <div key={i} style={styles.invViewRow}>
          <span style={styles.invViewTrack}>{r.track}</span>
          <span style={styles.invViewAmount}>{fmtMoney(r.amount)}</span>
          {isCompoundEligible(r.track) && (
            <span style={{ ...styles.invViewMode, color: r.compound ? KAPPA.teal : "#94A3B8" }}>
              {r.compound ? "ריבית דריבית" : "משיכה"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Per-lead stage history, read from the same Events log the funnel uses: who
// moved the lead, when, and how long it sat in the previous stage.
function StageHistory({ lead }) {
  const { events: allEvents, state, ensure } = useStats();
  useEffect(() => { ensure(); }, [ensure]);
  const events = useMemo(() => allEvents
    .filter((e) => String(e.lead_id || "") === String(lead.id))
    .sort((a, b) => {
      const da = parseStamp(a.changed_at), db = parseStamp(b.changed_at);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    }), [allEvents, lead.id]);
  const loading = state === "loading" || state === "idle";
  const error = state === "error";

  return (
    <div style={styles.summaryBox}>
      <div style={styles.summaryLabel}>היסטוריית שלבים</div>
      {loading && <div style={styles.histEmpty}>טוען…</div>}
      {error && <div style={styles.histEmpty}>לא הצלחנו לטעון את ההיסטוריה.</div>}
      {!loading && !error && events.length === 0 && (
        <div style={styles.histEmpty}>אין עדיין מעברי שלבים מתועדים לליד הזה.</div>
      )}
      {!loading && !error && events.map((e, i) => {
        const to = stageOf(e.to_stage);
        const from = e.from_stage ? stageOf(e.from_stage) : null;
        const prev = events[i + 1];
        const d1 = parseStamp(e.changed_at), d0 = prev ? parseStamp(prev.changed_at) : null;
        const held = d0 && d1 ? Math.max(0, Math.round((d1 - d0) / 86400000)) : null;
        return (
          <div key={i} style={styles.histRow}>
            <span style={{ ...styles.histDot, background: to.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.histMain}>
                {from && <span style={styles.histFrom}>{from.label}</span>}
                {from && <span style={styles.histArrow}>←</span>}
                <span style={{ ...styles.histTo, color: to.color }}>{to.label}</span>
              </div>
              <div style={styles.histMeta}>
                {e.changed_at || "—"}
                {e.changed_by ? ` · ${e.changed_by}` : ""}
                {held != null ? ` · אחרי ${held} ימים` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ Drawer ============
function LeadDrawer({ lead, onClose, onMove, onSave, onRequestDelete, session, owners = [], onSaveTasks }) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [f, setF] = useState(lead);
  const [invRows, setInvRows] = useState(() => parseInvestments(lead));
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const drawerStyle = { ...styles.drawer, ...(maximized ? styles.drawerMax : {}) };
  const drawerClass = `lead-drawer${maximized ? " lead-drawer-max" : ""}`;
  const MaximizeBtn = () => (!isMobile ? (
    <button style={styles.iconBtn} onClick={() => setMaximized((m) => !m)} title={maximized ? "כיווץ לתצוגה רגילה" : "הגדלה למסך מלא"}>
      {maximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
    </button>
  ) : null);
  const st = stageOf(lead.stage);
  const isInterested = lead.stage === "interested";
  const isLost = lead.stage === "lost";
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // True once anything in the edit form differs from the stored lead — used to
  // guard against losing work on a stray click outside the drawer or an Esc.
  const dirty = useMemo(
    () => JSON.stringify(f) !== JSON.stringify(lead) ||
          JSON.stringify(invRows) !== JSON.stringify(parseInvestments(lead)),
    [f, invRows, lead]
  );

  const startEdit = () => { setF(lead); setInvRows(parseInvestments(lead)); setEditing(true); };
  const cancel = () => { setConfirmDiscard(false); setEditing(false); setF(lead); setInvRows(parseInvestments(lead)); };
  const requestCancel = () => { if (dirty) setConfirmDiscard(true); else cancel(); };

  // Esc closes the drawer / leaves edit mode (with the same discard guard).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (confirmDiscard) { setConfirmDiscard(false); return; }
      if (editing) requestCancel(); else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const save = async () => {
    setSaving(true);
    // Clean the investment rows (drop empty ones) and derive the aggregate fields
    const clean = invRows.filter((r) => r.track && (Number(r.amount) || 0) > 0).map((r) => {
      const o = { track: r.track, amount: Number(r.amount) || 0 };
      if (isCompoundEligible(r.track)) o.compound = !!r.compound;
      return o;
    });
    const payload = {
      ...f,
      investments: JSON.stringify(clean),
      amount: investmentsTotal(clean),      // aggregate total keeps KPIs/Kanban working
      track: investmentsTracksLabel(clean), // comma-joined tracks for legacy display
    };
    await onSave(payload);
    setSaving(false);
    setEditing(false);
  };
  const saveReason = (reason) => onSave({ ...lead, lost_reason: reason });

  // ---------- EDIT MODE ----------
  if (editing) {
    return (
      <div style={styles.overlay} onClick={requestCancel}>
        <div style={drawerStyle} className={drawerClass} role="dialog" aria-modal="true" aria-label="עריכת ליד" onClick={(e) => e.stopPropagation()}>
          <div style={styles.drawerHead}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button style={styles.iconBtn} onClick={requestCancel} aria-label="סגור"><X size={20} /></button>
              <MaximizeBtn />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: KAPPA.ink }}>עריכת ליד</h3>
          </div>
          <div style={{ ...styles.drawerBody, ...(maximized ? { padding: "28px 48px" } : {}) }} className="drawer-body">
            {maximized ? (
              <div className="drawer-grid-2col">
                <div>
                  <Field label="שם מלא"><input style={styles.input} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
                  <div style={styles.fieldRow}>
                    <Field label="טלפון"><input style={styles.input} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} dir="ltr" /></Field>
                    <Field label="אימייל"><input style={styles.input} value={f.email || ""} onChange={(e) => set("email", e.target.value)} dir="ltr" /></Field>
                  </div>
                  <div style={styles.fieldRow}>
                    <CampaignField value={f.campaign} onChange={(v) => set("campaign", v)} />
                    <Field label="גורם מפנה"><input style={styles.input} value={f.referrer || ""} onChange={(e) => set("referrer", e.target.value)} /></Field>
                  </div>
                  <OwnerField value={f.owner || ""} owners={owners} onChange={(v) => set("owner", v)} />
                  <InvestmentsEditor rows={invRows} onChange={setInvRows} />
                </div>
                <div>
                  <div style={styles.fieldRow}>
                    <DateField label="מועד פגישה" value={f.meeting_date || ""} onChange={(v) => set("meeting_date", v)} />
                    <DateField label="קשר אחרון" value={f.last_contact || ""} onChange={(v) => set("last_contact", v)} />
                  </div>
                  <DateField label="מועד שיחה הבאה" value={f.next_call || ""} onChange={(v) => set("next_call", v)} />
                  <Field label="סיכום שיחה והערות"><textarea style={{ ...styles.input, minHeight: 160, resize: "vertical" }} value={f.summary || ""} onChange={(e) => set("summary", e.target.value)} /></Field>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button style={{ ...styles.saveBtn, flex: 1, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>{saving ? "שומר…" : "שמור שינויים"}</button>
                    <button style={styles.cancelBtn} onClick={cancel}>ביטול</button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Field label="שם מלא"><input style={styles.input} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
                <div style={styles.fieldRow}>
                  <Field label="טלפון"><input style={styles.input} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} dir="ltr" /></Field>
                  <Field label="אימייל"><input style={styles.input} value={f.email || ""} onChange={(e) => set("email", e.target.value)} dir="ltr" /></Field>
                </div>
                <div style={styles.fieldRow}>
                  <CampaignField value={f.campaign} onChange={(v) => set("campaign", v)} />
                  <Field label="גורם מפנה"><input style={styles.input} value={f.referrer || ""} onChange={(e) => set("referrer", e.target.value)} /></Field>
                </div>
                <OwnerField value={f.owner || ""} owners={owners} onChange={(v) => set("owner", v)} />
                <InvestmentsEditor rows={invRows} onChange={setInvRows} />
                <div style={styles.fieldRow}>
                  <DateField label="מועד פגישה" value={f.meeting_date || ""} onChange={(v) => set("meeting_date", v)} />
                  <DateField label="קשר אחרון" value={f.last_contact || ""} onChange={(v) => set("last_contact", v)} />
                </div>
                <DateField label="מועד שיחה הבאה" value={f.next_call || ""} onChange={(v) => set("next_call", v)} />
                <Field label="סיכום שיחה והערות"><textarea style={{ ...styles.input, minHeight: 100, resize: "vertical" }} value={f.summary || ""} onChange={(e) => set("summary", e.target.value)} /></Field>
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <button style={{ ...styles.saveBtn, flex: 1, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>{saving ? "שומר…" : "שמור שינויים"}</button>
                  <button style={styles.cancelBtn} onClick={cancel}>ביטול</button>
                </div>
              </>
            )}
          </div>
          {confirmDiscard && (
            <div style={styles.confirmOverlay} onClick={(e) => { e.stopPropagation(); setConfirmDiscard(false); }}>
              <div style={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
                <div style={{ ...styles.confirmIcon, background: "#FEF3C7" }}><AlertCircle size={26} color="#F59E0B" /></div>
                <h3 style={styles.confirmTitle}>לצאת בלי לשמור?</h3>
                <p style={styles.confirmText}>יש שינויים שלא נשמרו בכרטיס הליד. אם תצא עכשיו הם יאבדו.</p>
                <div style={styles.confirmBtns}>
                  <button style={styles.confirmPrimary} onClick={() => { setConfirmDiscard(false); save(); }}>שמור וסגור</button>
                  <button style={{ ...styles.confirmSecondary, color: "#EF4444" }} onClick={cancel}>צא בלי לשמור</button>
                </div>
                <button style={styles.confirmCancel} onClick={() => setConfirmDiscard(false)}>המשך לערוך</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- VIEW MODE ----------
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={drawerStyle} className={drawerClass} role="dialog" aria-modal="true" aria-label={`כרטיס ליד — ${lead.name}`} onClick={(e) => e.stopPropagation()}>
        <div style={styles.drawerHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={styles.iconBtn} onClick={onClose} aria-label="סגור"><X size={20} /></button>
            <MaximizeBtn />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={styles.editBtn} onClick={startEdit}><Pencil size={15} /> עריכה</button>
            <div style={{ ...styles.chip, background: st.soft, color: st.color }}>{st.label}</div>
          </div>
        </div>
        <div style={{ ...styles.drawerBody, ...(maximized ? { padding: "28px 48px" } : {}) }} className="drawer-body">
          {(() => {
            const topBlock = (
              <div style={styles.drawerTop}>
                <div style={{ ...styles.avatarLg, background: st.soft, color: st.color }}>{initials(lead.name)}</div>
                <h2 style={styles.drawerName}>{lead.name}</h2>
                {lead.referrer && <div style={styles.drawerRef}>הופנה ע"י {lead.referrer}</div>}
              </div>
            );
            const contactBlock = (
              <div style={styles.contactRow}>
                {lead.phone && <a href={`tel:${lead.phone}`} style={styles.contactBtn}><Phone size={16} />{lead.phone}</a>}
                {lead.email && (
                  isMobile
                    ? <a href={`mailto:${lead.email}`} style={styles.contactBtn}><Mail size={16} />{lead.email}</a>
                    : <a href={`https://mail.google.com/mail/u/arie@kappainv.com/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}`} target="_blank" rel="noopener noreferrer" style={styles.contactBtn}><Mail size={16} />{lead.email}</a>
                )}
              </div>
            );
            const detailBlock = (
              <div style={styles.detailGrid}>
                <Detail label="בעלים" value={lead.owner || "—"} />
                <Detail label="קמפיין" value={lead.campaign || "—"} />
                <Detail label="סכום כולל" value={fmtMoney(lead.amount)} />
                <Detail label="מועד פגישה" value={lead.meeting_date || "—"} />
                <Detail label="קשר אחרון" value={lead.last_contact || "—"} />
                <Detail label="שיחה הבאה" value={lead.next_call || "—"} highlight={isDue(lead.next_call)} />
              </div>
            );
            const reasonBlock = isLost && (
              <div style={styles.reasonBox}>
                <div style={styles.summaryLabel}>סיבה</div>
                <div style={styles.reasonBtns}>
                  {LOST_REASONS.map((r) => (
                    <button key={r} onClick={() => saveReason(r)} style={{
                      ...styles.reasonBtn,
                      background: lead.lost_reason === r ? ARCHIVE_COLOR : "#F1F5F9",
                      color: lead.lost_reason === r ? "#fff" : KAPPA.graphite,
                    }}>{r}</button>
                  ))}
                </div>
              </div>
            );
            const notesBlock = <SummaryNotes lead={lead} onSave={onSave} />;
            const historyBlock = <StageHistory lead={lead} />;
            const tasksBlock = <TasksBlock lead={lead} owners={owners} session={session} onSaveTasks={onSaveTasks} />;
            const meetingBlock = <MeetingAISummary lead={lead} onSave={onSave} />;
            const journeyBlock = isInterested && (
              <div style={styles.journeyPromo} className="journey-promo">
                <div style={styles.promoHead}><Sparkles size={16} color={KAPPA.teal} /> נמצא במסלול ליווי משקיעים</div>
                <JourneyBar current={Number(lead.journey_stage) || 0} done={Number(lead.journey_done) || 0} />
              </div>
            );
            const stageSwitchBlock = (
              <div style={styles.stageSwitch}>
                <div style={styles.switchLabel}>סטטוס</div>
                <div style={styles.switchBtns}>
                  {STAGES.map((s) => (
                    <button key={s.id} onClick={() => onMove(s.id)} style={{
                      ...styles.switchBtn,
                      background: lead.stage === s.id ? s.color : s.soft,
                      color: lead.stage === s.id ? "#fff" : s.color,
                      borderColor: lead.stage === s.id ? KAPPA.tealDark : "transparent",
                    }}>{s.label}</button>
                  ))}
                </div>
              </div>
            );
            const deleteBlock = (
              <div style={styles.dangerZone}>
                <button style={styles.deleteBtn} onClick={onRequestDelete}>
                  <Trash2 size={15} /> מחק ליד
                </button>
              </div>
            );
            return maximized ? (
              <div className="drawer-grid-2col">
                <div>
                  {topBlock}{contactBlock}{detailBlock}
                  <InvestmentsView lead={lead} />
                  {reasonBlock}
                  {notesBlock}
                </div>
                <div>
                  {tasksBlock}
                  {meetingBlock}
                  {historyBlock}
                  {journeyBlock}
                  {stageSwitchBlock}
                  {deleteBlock}
                </div>
              </div>
            ) : (
              <>
                {topBlock}{contactBlock}{detailBlock}
                <InvestmentsView lead={lead} />
                {reasonBlock}
                {notesBlock}
                {tasksBlock}
                {meetingBlock}
                {historyBlock}
                {journeyBlock}
                {stageSwitchBlock}
                {deleteBlock}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
const ARCHIVE_COLOR = "#94A3B8";
function Detail({ label, value, highlight }) {
  return (
    <div style={styles.detail}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={{ ...styles.detailValue, color: highlight ? "#EF4444" : KAPPA.ink }}>{value}</div>
    </div>
  );
}

// Notes are append-only: existing history stays as read-only text, and a new
// entry (dated) is added at the end and saved immediately — no need to open
// the full edit drawer just to jot something down.
function SummaryNotes({ lead, onSave }) {
  const entries = useMemo(() => noteEntries(lead.summary), [lead.summary]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const addNote = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    const stamp = todayStr();
    const entry = `[${stamp}] ${text}`;
    const merged = lead.summary ? `${lead.summary}\n${entry}` : entry;
    try {
      await onSave({ ...lead, summary: merged });
      setDraft("");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={styles.summaryBox}>
      <div style={styles.summaryLabel}>הערות</div>
      {entries.length > 0 && (
        <div style={styles.noteList}>
          {entries.map((n, i) => (
            <div key={i} style={styles.noteItem}>
              {n.date && <span style={styles.noteDate}>{n.date}</span>}
              <p style={styles.noteText}>{n.text}</p>
            </div>
          ))}
        </div>
      )}
      <div style={styles.summaryAddRow}>
        <textarea
          style={styles.summaryAddInput}
          placeholder="הוסף הערה…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
        />
        <button style={{ ...styles.summaryAddBtn, opacity: draft.trim() && !saving ? 1 : 0.5, cursor: draft.trim() && !saving ? "pointer" : "not-allowed" }}
          disabled={!draft.trim() || saving} onClick={addNote}>
          {saving ? "שומר…" : "הוסף"}
        </button>
      </div>
    </div>
  );
}

// Two ways in: paste a link to the Google Meet "Take notes for me" doc
// (for reference — Google doesn't expose an API to fetch its content), or
// paste the transcript/notes text itself and have AI condense it. The link
// and the AI summary are saved as their own fields, separate from the
// manual notes log above.
function MeetingAISummary({ lead, onSave }) {
  const [link, setLink] = useState(lead.meeting_link || "");
  const [transcript, setTranscript] = useState(lead.transcript_text || "");
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const linkFocusedRef = useRef(false);

  useEffect(() => { if (!linkFocusedRef.current) setLink(lead.meeting_link || ""); }, [lead.meeting_link]);
  useEffect(() => { setTranscript(lead.transcript_text || ""); }, [lead.id]);

  const saveLink = async () => {
    if (link === (lead.meeting_link || "")) return;
    await onSave({ ...lead, meeting_link: link });
  };

  const summarize = async () => {
    const text = transcript.trim();
    if (!text || summarizing) return;
    setSummarizing(true);
    setError("");
    try {
      const res = await fetch(API.summarize, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const summary = (data.summary || "").trim();
      if (!summary) throw new Error("empty");
      await onSave({ ...lead, transcript_text: text, ai_summary: summary });
    } catch {
      setError("הסיכום נכשל — נסה שוב, או פנה לתמיכה אם זה חוזר.");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div style={styles.summaryBox}>
      <div style={styles.summaryLabel}>סיכום פגישה עם AI · Google Meet</div>
      <Field label="קישור לסיכום השיחה">
        <input
          style={styles.input}
          dir="ltr"
          placeholder="https://docs.google.com/…"
          value={link}
          onFocus={() => { linkFocusedRef.current = true; }}
          onChange={(e) => setLink(e.target.value)}
          onBlur={() => { linkFocusedRef.current = false; saveLink(); }}
        />
      </Field>
      {lead.meeting_link && (
        <a href={lead.meeting_link} target="_blank" rel="noopener noreferrer" style={styles.meetingLinkOpen}>
          <ArrowLeft size={14} /> פתח את המסמך
        </a>
      )}
      <div style={{ marginTop: 12 }}>
        <Field label="תמלול / טקסט לסיכום (הדבק מתוך המסמך)">
          <textarea
            style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="הדבק כאן את הסיכום או התמלול מ-Take notes for me…"
          />
        </Field>
      </div>
      <button
        style={{ ...styles.summaryAddBtn, opacity: transcript.trim() && !summarizing ? 1 : 0.5, cursor: transcript.trim() && !summarizing ? "pointer" : "not-allowed", marginTop: 4 }}
        disabled={!transcript.trim() || summarizing}
        onClick={summarize}
      >
        {summarizing ? "מסכם…" : "סכם עם AI ✨"}
      </button>
      {error && <div style={styles.aiSummaryError}>{error}</div>}
      {lead.ai_summary && (
        <div style={styles.aiSummaryResult}>
          <div style={{ ...styles.summaryLabel, color: KAPPA.tealDark }}>סיכום AI</div>
          <p style={styles.summaryText}>{lead.ai_summary}</p>
        </div>
      )}
    </div>
  );
}

// ============ Add ============
function AddLead({ onClose, onSave, leads = [], session, owners = [] }) {
  const { active: activeCampaigns } = useCampaigns();
  const [f, setF] = useState({
    name: "", phone: "", email: "", campaign: activeCampaigns[0] || "", referrer: "",
    stage: "new", summary: "", next_call: "", meeting_date: "", last_contact: "",
    owner: (session && session.email) || "",
  });
  const [invRows, setInvRows] = useState([{ track: "", amount: "", compound: false }]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const emailOk = !f.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim());
  const phoneOk = !f.phone.trim() || normPhone(f.phone).length >= 9;
  // Warn (never block) when the phone / email / name already exists — a
  // duplicate lead is the most expensive data-quality mistake to unpick later.
  const dupes = useMemo(() => {
    const phone = normPhone(f.phone), email = normText(f.email), name = normText(f.name);
    if (!phone && !email && !name) return [];
    return leads.filter((l) =>
      (phone.length >= 9 && normPhone(l.phone) === phone) ||
      (!!email && normText(l.email) === email) ||
      (name.length > 2 && normText(l.name) === name)
    ).slice(0, 3);
  }, [leads, f.phone, f.email, f.name]);
  const valid = f.name.trim().length > 0 && emailOk && phoneOk;
  const submit = async () => {
    setSaving(true);
    // Same cleanup/aggregation as the lead editor, so a lead created here
    // looks and behaves identically to one edited afterwards.
    const clean = invRows.filter((r) => r.track && (Number(r.amount) || 0) > 0).map((r) => {
      const o = { track: r.track, amount: Number(r.amount) || 0 };
      if (isCompoundEligible(r.track)) o.compound = !!r.compound;
      return o;
    });
    const payload = {
      ...f,
      investments: JSON.stringify(clean),
      amount: investmentsTotal(clean),
      track: investmentsTracksLabel(clean),
    };
    await onSave(payload);
    setSaving(false);
  };
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} className="lead-drawer" role="dialog" aria-modal="true" aria-label="ליד חדש" onClick={(e) => e.stopPropagation()}>
        <div style={styles.drawerHead}>
          <button style={styles.iconBtn} onClick={onClose} aria-label="סגור"><X size={20} /></button>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: KAPPA.ink }}>ליד חדש</h3>
        </div>
        <div style={styles.drawerBody} className="drawer-body">
          <Field label="שם מלא *"><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="שם המתעניין" /></Field>
          <div style={styles.fieldRow}>
            <Field label="טלפון">
              <input style={{ ...styles.input, ...(phoneOk ? {} : styles.inputInvalid) }} value={f.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" />
              {!phoneOk && <div style={styles.fieldError}>מספר טלפון קצר מדי</div>}
            </Field>
            <Field label="אימייל">
              <input style={{ ...styles.input, ...(emailOk ? {} : styles.inputInvalid) }} value={f.email} onChange={(e) => set("email", e.target.value)} dir="ltr" />
              {!emailOk && <div style={styles.fieldError}>כתובת אימייל לא תקינה</div>}
            </Field>
          </div>
          {dupes.length > 0 && (
            <div style={styles.dupBox}>
              <AlertCircle size={15} />
              <div>
                <strong>ייתכן שהליד כבר קיים:</strong>
                {dupes.map((d) => (
                  <div key={d.id} style={styles.dupRow}>{d.name} · {d.phone || "—"} · {stageOf(d.stage).label}</div>
                ))}
              </div>
            </div>
          )}
          <div style={styles.fieldRow}>
            <CampaignField value={f.campaign} onChange={(v) => set("campaign", v)} />
            <Field label="גורם מפנה"><input style={styles.input} value={f.referrer} onChange={(e) => set("referrer", e.target.value)} /></Field>
          </div>
          <OwnerField value={f.owner} owners={owners} onChange={(v) => set("owner", v)} />
          <InvestmentsEditor rows={invRows} onChange={setInvRows} />
          <div style={styles.fieldRow}>
            <Field label="שלב">
              <select style={styles.input} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <DateField label="מועד שיחה הבאה" value={f.next_call} onChange={(v) => set("next_call", v)} />
          </div>
          <div style={styles.fieldRow}>
            <DateField label="מועד פגישה" value={f.meeting_date} onChange={(v) => set("meeting_date", v)} />
            <DateField label="קשר אחרון" value={f.last_contact} onChange={(v) => set("last_contact", v)} />
          </div>
          <Field label="סיכום שיחה והערות"><textarea style={{ ...styles.input, minHeight: 80, resize: "vertical" }} value={f.summary} onChange={(e) => set("summary", e.target.value)} /></Field>
          <button style={{ ...styles.saveBtn, opacity: valid && !saving ? 1 : 0.5, cursor: valid && !saving ? "pointer" : "not-allowed" }}
            disabled={!valid || saving} onClick={submit}>
            {saving ? "מוסיף…" : "הוסף ליד"}
          </button>
        </div>
      </div>
    </div>
  );
}
// Owner picker: the known owners plus a free-text option, so a lead can be
// assigned to someone who has no lead yet.
function OwnerField({ value, owners, onChange }) {
  const list = owners.includes(value) || !value ? owners : owners.concat([value]);
  const [custom, setCustom] = useState(false);
  return (
    <Field label="בעלים">
      {custom ? (
        <input style={styles.input} dir="ltr" autoFocus value={value} placeholder="name@kappainv.com"
          onChange={(e) => onChange(e.target.value)} onBlur={() => setCustom(false)} />
      ) : (
        <select style={styles.input} value={value || ""}
          onChange={(e) => { if (e.target.value === "__other") { setCustom(true); onChange(""); } else onChange(e.target.value); }}>
          <option value="">ללא בעלים</option>
          {list.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__other">אחר…</option>
        </select>
      )}
    </Field>
  );
}

function Field({ label, children }) {
  return <div style={styles.field}><label style={styles.fieldLabel}>{label}</label>{children}</div>;
}

// Native date picker that stores/reads dd/mm/yyyy so the sheet + logic stay unchanged.
// The input's `value` is driven by LOCAL state, not recomputed from the parent
// prop on every render. Native <input type="date"> reports "" for every
// in-progress keystroke while a segment is incomplete (e.g. typing the year
// digit by digit with day/month already filled) — that's normal, not a clear.
// If we fed that "" straight back into the parent and re-derived the DOM
// value from it, React would force the input's value to "", which resets
// ALL segments (day + month too), making the year impossible to finish
// typing. Keeping local state in sync with whatever the DOM just reported
// avoids fighting the browser mid-edit; we only propagate to the parent once
// a full valid date is typed (immediate feedback), or on blur if the field
// was left incomplete/cleared (explicit commit of the clear).
const DATE_COMPLETE = /^\d{4}-\d{2}-\d{2}$/;
function DateField({ label, value, onChange }) {
  const [localISO, setLocalISO] = useState(() => dmyToISO(value));
  const focusedRef = useRef(false);

  // Sync from the parent only when not actively focused/typing — e.g. the
  // form was reset (cancel/save) or switched to a different lead.
  useEffect(() => {
    if (!focusedRef.current) setLocalISO(dmyToISO(value));
  }, [value]);

  return (
    <Field label={label}>
      <input
        type="date"
        style={{ ...styles.input, minHeight: 44 }}
        value={localISO}
        dir="ltr"
        onFocus={() => { focusedRef.current = true; }}
        onChange={(e) => {
          const iso = e.target.value;
          setLocalISO(iso);
          if (DATE_COMPLETE.test(iso)) onChange(isoToDMY(iso));
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (!DATE_COMPLETE.test(localISO) && localISO !== dmyToISO(value)) {
            // Left mid-typed or cleared — commit the clear rather than
            // silently keeping a stale value the field no longer shows.
            setLocalISO("");
            onChange("");
          }
        }}
      />
    </Field>
  );
}

// Campaign picker with a free-text "אחר" (other) option. The select and the
// custom-text field share one underlying value: choosing a listed campaign
// stores it directly; choosing "אחר" (or any legacy/custom value not in the
// list) reveals a text box, and whatever is typed there becomes the actual
// stored value — so reporting downstream sees the real campaign name, not
// a generic "אחר".
function CampaignField({ value, onChange }) {
  const { active, all } = useCampaigns();
  // A lead may already carry a campaign that has since been deactivated.
  // Hiding it would silently rewrite that lead's campaign on the next save,
  // so a deactivated campaign still in use stays selectable on that lead.
  const known = active.slice();
  if (value && all.includes(value) && !known.includes(value)) known.push(value);
  const isOther = !!value && !known.includes(value);
  const options = known.concat([OTHER]);
  return (
    <Field label="קמפיין">
      <select
        style={styles.input}
        value={isOther ? OTHER : (value || "")}
        onChange={(e) => { const v = e.target.value; onChange(v === OTHER ? OTHER : v); }}
      >
        {!value && <option value="" disabled hidden />}
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {isOther && (
        <input
          style={{ ...styles.input, marginTop: 8 }}
          value={value === OTHER ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="פרט…"
        />
      )}
    </Field>
  );
}

// ============ CSS ============
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  html, body { margin:0; overflow-x: hidden; max-width: 100%; }
  .nav-item:hover { background: rgba(255,255,255,0.06) !important; }
  .lead-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); transform: translateY(-1px); }
  .kpi-clickable { cursor: pointer; transition: box-shadow .15s, transform .15s; }
  .kpi-clickable:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); transform: translateY(-1px); }
  .kpi-clickable:focus-visible { outline: 2px solid ${KAPPA.teal}; outline-offset: 2px; }
  .row-btn:hover { background: #F8FAFC; }
  .table-row:hover { background: #F8FAFC; }
  .card-quick { opacity: 0; transition: opacity .12s; }
  .lead-card:hover .card-quick, .lead-card:focus-within .card-quick { opacity: 1; }
  button:focus-visible, a:focus-visible, select:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid ${KAPPA.teal}; outline-offset: 2px; border-radius: 6px;
  }
  input:focus, select:focus, textarea:focus { outline: none; border-color: ${KAPPA.teal} !important; box-shadow: 0 0 0 3px ${KAPPA.teal}22; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes slideIn { from { transform: translateX(-30px); opacity:0 } to { transform:translateX(0); opacity:1 } }
  @keyframes toastIn { from { transform: translateY(20px); opacity:0 } to { transform:translateY(0); opacity:1 } }
  .cost-form-lg label { font-size: 15.5px !important; margin-bottom: 8px !important; }
  .cost-form-lg input, .cost-form-lg select { font-size: 17px !important; padding: 13px 16px !important; }
  .drawer-grid-2col { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 0 40px; }
  .drawer-grid-2col > div { min-width: 0; }
  @media (max-width: 900px) { .drawer-grid-2col { grid-template-columns: 1fr; } }
  @media (max-width: 768px) {
    .kpi-row { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
    .dash-grid { grid-template-columns: 1fr !important; }
    input, select, textarea, button { font-size: 16px; }
    .lead-drawer { width: 100vw !important; max-width: 100vw !important; }
    .journey-bar { gap: 0 !important; overflow-x: auto; padding-bottom: 4px; }
    .journey-step { width: 46px !important; gap: 5px !important; }
    .journey-dot { width: 30px !important; height: 30px !important; font-size: 12px !important; }
    .journey-label { font-size: 9.5px !important; line-height: 1.25 !important; }
    .journey-line { min-width: 4px !important; margin-top: 14px !important; }
    .journey-promo { padding: 14px 10px !important; }
    .drawer-body { padding: 16px 14px !important; }
    .task-add-grid { grid-template-columns: 1fr !important; }
  }
`;

const FONT = `"Heebo", "Assistant", -apple-system, "Segoe UI", sans-serif`;
const styles = {
  lTableWrap: { background: "#fff", borderRadius: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto", marginTop: 16 },
  lTable: { width: "100%", borderCollapse: "collapse", fontFamily: FONT, minWidth: 880 },
  lTh: { textAlign: "right", padding: "12px 14px", borderBottom: "1px solid #EAEEF3", background: "#F8FAFC", whiteSpace: "nowrap" },
  lThBtn: { display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#64748B", padding: 0 },
  lThStatic: { fontSize: 14, fontWeight: 700, color: "#64748B" },
  lThArrow: { fontSize: 9, color: KAPPA.teal },
  lTr: { borderBottom: "1px solid #F1F5F9", cursor: "pointer" },
  lTd: { padding: "12px 14px", fontSize: 15, color: KAPPA.graphite, verticalAlign: "middle", whiteSpace: "nowrap" },
  lTdName: { display: "flex", alignItems: "center", gap: 10 },
  lTableEmpty: { background: "#fff", borderRadius: 15, padding: "44px 20px", textAlign: "center", color: "#94A3B8", fontSize: 14, marginTop: 16 },
  ageTag: { display: "inline-block", minWidth: 26, textAlign: "center", padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontSize: 12.5, fontWeight: 700 },
  ageTagStuck: { background: "#FEF2F2", color: "#B91C1C" },
  quickRow: { display: "flex", gap: 6, marginTop: 8 },
  quickBtn: { border: "1px solid #E2E8F0", background: "#fff", color: KAPPA.graphite, borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
  toastAction: { marginRight: 10, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", borderRadius: 7, padding: "3px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  taskBar: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 },
  taskShowDone: { display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: KAPPA.graphite, cursor: "pointer" },
  taskList: { background: "#fff", borderRadius: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" },
  taskRow: { display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderTop: "1px solid #F1F5F9" },
  taskCheck: { border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flexShrink: 0 },
  taskTitle: { fontSize: 15, fontWeight: 600 },
  taskMeta: { fontSize: 12.5, color: "#94A3B8", marginTop: 3, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" },
  taskLeadLink: { border: "none", background: "none", padding: 0, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: KAPPA.tealDark, cursor: "pointer" },
  taskDue: { fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  taskMini: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #EEF2F6" },
  taskMiniTitle: { fontSize: 14, fontWeight: 600 },
  taskMiniMeta: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  taskLate: { fontSize: 11.5, fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", borderRadius: 6, padding: "2px 7px" },
  taskDelete: { border: "none", background: "transparent", color: "#CBD5E1", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "0 2px" },
  taskAddGrid: { display: "grid", gridTemplateColumns: "1.6fr 1fr 1.2fr", gap: 8, marginTop: 12 },
  taskAddFoot: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 },
  histRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: "1px solid #EEF2F6" },
  histDot: { width: 9, height: 9, borderRadius: "50%", marginTop: 6, flexShrink: 0 },
  histMain: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  histFrom: { fontSize: 13.5, color: "#94A3B8", fontWeight: 600 },
  histArrow: { fontSize: 13.5, color: "#CBD5E1" },
  histTo: { fontSize: 14, fontWeight: 700 },
  histMeta: { fontSize: 12.5, color: "#94A3B8", marginTop: 3 },
  histEmpty: { fontSize: 13.5, color: "#94A3B8", padding: "4px 0" },
  noteList: { display: "flex", flexDirection: "column", gap: 8, margin: "4px 0 12px" },
  noteItem: { background: "#fff", border: "1px solid #EAEEF3", borderRadius: 10, padding: "8px 11px" },
  noteDate: { display: "block", fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 3 },
  noteText: { margin: 0, fontSize: 13.5, lineHeight: 1.6, color: KAPPA.ink, whiteSpace: "pre-wrap" },
  inputInvalid: { borderColor: "#EF4444" },
  fieldError: { fontSize: 11.5, color: "#EF4444", fontWeight: 600, marginTop: 4 },
  dupBox: { display: "flex", gap: 9, alignItems: "flex-start", background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 11, padding: "10px 12px", fontSize: 13, lineHeight: 1.6, marginBottom: 14 },
  dupRow: { fontSize: 12.5, fontWeight: 600, marginTop: 2 },
  app: { display: "flex", height: "100vh", fontFamily: FONT, background: "#F4F6F9", color: KAPPA.ink, direction: "rtl" },
  appMobile: { flexDirection: "column", height: "100dvh" },
  mainMobile: { paddingBottom: 68 },
  topbarMobile: { height: 58, padding: "0 14px", gap: 8 },
  contentMobile: { padding: "16px 14px" },
  dueBadgeMobile: { padding: "8px 11px", minWidth: 0 },
  bottomNav: { position: "fixed", bottom: 0, left: 0, right: 0, height: 64, background: "#fff", borderTop: "1px solid #EAEEF3", display: "flex", alignItems: "stretch", justifyContent: "space-around", zIndex: 90, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" },
  bottomNavItem: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, padding: "8px 0" },
  fab: { position: "fixed", bottom: 80, left: 18, width: 56, height: 56, borderRadius: 28, background: KAPPA.teal, color: "#fff", border: "none", display: "grid", placeItems: "center", cursor: "pointer", zIndex: 91, boxShadow: "0 6px 20px rgba(31,169,184,0.45)" },
  sidebar: { width: 240, background: "#1E2329", display: "flex", flexDirection: "column", padding: "22px 16px", flexShrink: 0 },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 32, padding: "0 6px" },
  brandLogoWrap: { width: "100%", background: "#fff", borderRadius: 12, padding: "12px 14px", boxSizing: "border-box", display: "grid", placeItems: "center" },
  brandLogoImg: { width: "100%", maxWidth: 150, height: "auto", objectFit: "contain", display: "block" },
  brandName: { color: "#fff", fontWeight: 800, fontSize: 17, lineHeight: 1 },
  brandSub: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 3 },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem: { position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, textAlign: "right", transition: "all .15s" },
  navActive: { position: "absolute", right: 0, top: "22%", height: "56%", width: 3, borderRadius: 3, background: KAPPA.teal },
  sidebarFoot: { marginTop: "auto" },
  addBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 11, background: KAPPA.teal, color: "#fff", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 700, fontFamily: FONT },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { height: 66, background: "#fff", borderBottom: "1px solid #EAEEF3", display: "flex", alignItems: "center", gap: 12, padding: "0 26px", flexShrink: 0 },
  searchWrap: { display: "flex", alignItems: "center", gap: 9, background: "#F4F6F9", borderRadius: 10, padding: "9px 14px", flex: 1, maxWidth: 440, minWidth: 0 },
  search: { border: "none", background: "transparent", outline: "none", fontSize: 14, flex: 1, fontFamily: FONT, color: KAPPA.ink },
  refreshBtn: { width: 38, height: 38, borderRadius: 9, border: "1px solid #EAEEF3", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: KAPPA.graphite },
  dueBadge: { display: "flex", alignItems: "center", gap: 7, background: "#FEF2F2", color: "#EF4444", padding: "8px 13px", borderRadius: 9, fontSize: 13, fontWeight: 700 },
  userChip: { display: "flex", alignItems: "center", gap: 8, background: "#F4F6F9", borderRadius: 30, padding: "5px 6px 5px 10px", flexShrink: 0 },
  userAvatarImg: { width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  userAvatarFallback: { width: 30, height: 30, borderRadius: "50%", background: KAPPA.teal, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  userChipName: { fontSize: 13, fontWeight: 600, color: KAPPA.ink, whiteSpace: "nowrap" },
  userSignOutBtn: { width: 26, height: 26, borderRadius: "50%", border: "none", background: "transparent", color: "#94A3B8", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 },
  loginWrap: { minHeight: "100dvh", width: "100%", display: "grid", placeItems: "center", background: "#F4F6F9", fontFamily: FONT, padding: 20 },
  loginCard: { width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18, padding: "38px 32px", textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.08)" },
  loginLogoWrap: { marginBottom: 18 },
  loginLogoImg: { width: 190, maxWidth: "100%", height: "auto", margin: "0 auto", display: "block" },
  loginTitle: { fontSize: 19, fontWeight: 800, color: KAPPA.ink, margin: "0 0 6px" },
  loginSub: { fontSize: 13.5, color: "#7d888c", margin: "0 0 26px", lineHeight: 1.6 },
  loginBtnWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minHeight: 44 },
  loginLoadingText: { fontSize: 13, color: "#94A3B8" },
  loginError: { marginTop: 18, background: "#FEF2F2", color: "#EF4444", fontSize: 13, fontWeight: 600, borderRadius: 9, padding: "10px 14px", lineHeight: 1.5 },
  content: { flex: 1, overflowY: "auto", padding: "28px 30px" },
  pageTitle: { fontSize: 28, fontWeight: 800, margin: "0 0 6px", color: KAPPA.ink },
  pageSub: { fontSize: 15, color: "#8695A8", margin: "0 0 26px" },
  tabBar: { display: "flex", gap: 4, borderBottom: "1px solid #E8EDF2", margin: "6px 0 20px", overflowX: "auto" },
  tabBtn: { background: "none", border: "none", borderBottom: "3px solid transparent", padding: "13px 20px", fontSize: 16, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap", marginBottom: -1 },
  rangeWrap: { marginBottom: 18 },
  rangeBtns: { display: "flex", flexWrap: "wrap", gap: 8 },
  rangeBtn: { border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all .15s" },
  rangeCustom: { display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" },
  rangeDateField: { flex: "0 1 240px", minWidth: 190 },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" },
  statDivider: { height: 1, background: "#F1F5F9", margin: "12px 0" },
  convRow: { display: "flex", alignItems: "center", gap: 14, padding: "15px 4px", borderBottom: "1px solid #F8FAFC" },
  convLabel: { fontSize: 15, fontWeight: 700, color: KAPPA.ink },
  convMeta: { fontSize: 12.5, color: "#94A3B8", marginTop: 3 },
  convRate: { fontSize: 22, fontVariantNumeric: "tabular-nums", fontWeight: 800, flexShrink: 0 },
  statTable: { width: "100%", borderCollapse: "collapse", fontFamily: FONT },
  th: { textAlign: "right", fontSize: 14, fontWeight: 700, color: "#94A3B8", padding: "15px 16px", borderBottom: "1px solid #E8EDF2", whiteSpace: "nowrap" },
  thCenter: { textAlign: "center", fontSize: 14, fontWeight: 700, color: "#94A3B8", padding: "15px 16px", borderBottom: "1px solid #E8EDF2", whiteSpace: "nowrap" },
  td: { textAlign: "right", fontSize: 15, fontVariantNumeric: "tabular-nums", color: KAPPA.graphite, padding: "17px 16px", borderBottom: "1px solid #F8FAFC", whiteSpace: "nowrap" },
  tdCenter: { textAlign: "center", fontSize: 15, fontVariantNumeric: "tabular-nums", color: KAPPA.graphite, padding: "17px 16px", borderBottom: "1px solid #F8FAFC", whiteSpace: "nowrap" },
  tdName: { textAlign: "right", fontSize: 15.5, fontWeight: 700, color: KAPPA.ink, padding: "17px 16px", borderBottom: "1px solid #F8FAFC" },
  addCostBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: KAPPA.tealSoft, color: KAPPA.tealDark, border: `1px solid ${KAPPA.teal}55`, borderRadius: 9, padding: "7px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  costForm: { background: "#F8FAFC", border: "1px solid #E8EDF2", borderRadius: 12, padding: "20px 22px", margin: "6px 26px 18px" },
  costGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 250px))", gap: "0 16px", justifyContent: "start" },
  costNoteCell: { maxWidth: 516 },
  costSaveBtn: { width: "auto", padding: "12px 32px", borderRadius: 10, background: KAPPA.teal, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 14 },
  costFormRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  fxRow: { display: "flex", gap: 16, flexWrap: "wrap", padding: "0 26px", alignItems: "flex-end" },
  cardHint: { fontSize: 12.5, color: "#94A3B8", fontWeight: 500 },
  costHint: { fontSize: 13, color: "#94A3B8", lineHeight: 1.8, margin: "14px 0 0" },
  addCampaignRow: { display: "flex", gap: 10, alignItems: "center", margin: "4px 26px 18px", maxWidth: 520 },
  addCampaignInput: { flex: 1, minWidth: 0, width: "auto", padding: "12px 15px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 15, fontFamily: FONT, color: KAPPA.ink, background: "#fff", transition: "all .15s" },
  addCampaignBtn: { flexShrink: 0, width: "auto", padding: "12px 26px", borderRadius: 10, background: KAPPA.teal, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
  campRow: { display: "flex", alignItems: "center", gap: 14, padding: "16px 4px", borderBottom: "1px solid #F8FAFC" },
  campName: { background: "none", border: "none", padding: 0, fontSize: 15.5, fontWeight: 700, color: KAPPA.ink, cursor: "pointer", fontFamily: FONT, textAlign: "right" },
  campMeta: { fontSize: 13.5, color: "#94A3B8", marginTop: 4 },
  campToggleBtn: { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 },
  statusPill: { display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" },
  statusDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  backBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: KAPPA.tealDark, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: "4px 0", marginBottom: 10 },
  detailHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  detailActions: { display: "flex", gap: 10, flexShrink: 0 },
  rowActions: { display: "inline-flex", gap: 8, justifyContent: "center" },
  // auto-fit so the overview's five cards and the campaign screens' four each
  // fill the row without a second breakpoint.
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 24 },
  kpi: { background: "#fff", borderRadius: 16, padding: "24px 26px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  kpiIcon: { width: 50, height: 50, borderRadius: 13, display: "grid", placeItems: "center", marginBottom: 16 },
  kpiValue: { fontSize: 30, fontWeight: 800, color: KAPPA.ink, lineHeight: 1.15, wordBreak: "break-word", fontVariantNumeric: "tabular-nums" },
  kpiValueText: { fontSize: 20, fontWeight: 800, lineHeight: 1.3, display: "inline-block" },
  kpiLabel: { fontSize: 14, color: "#8695A8", marginTop: 8, fontWeight: 500 },
  dashGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  card: { background: "#fff", borderRadius: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" },
  cardHead: { padding: "22px 26px 14px" },
  cardTitle: { fontSize: 18, fontWeight: 700, margin: 0, color: KAPPA.ink },
  barRow: { display: "flex", alignItems: "center", gap: 14, padding: "12px 26px" },
  barLabel: { fontSize: 15, color: KAPPA.graphite, width: 118, flexShrink: 0, fontWeight: 600 },
  barTrack: { flex: 1, height: 13, background: "#F1F5F9", borderRadius: 7, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 6, transition: "width .4s" },
  barCount: { fontSize: 15, fontVariantNumeric: "tabular-nums", fontWeight: 800, color: KAPPA.ink, minWidth: 28, textAlign: "left" },
  barRowLg: { display: "flex", alignItems: "center", gap: 16, padding: "13px 22px" },
  barLabelLg: { fontSize: 15, color: KAPPA.graphite, width: 150, flexShrink: 0, fontWeight: 600 },
  barTrackLg: { flex: 1, height: 15, background: "#F1F5F9", borderRadius: 8, overflow: "hidden" },
  barFillLg: { height: "100%", borderRadius: 8, transition: "width .4s" },
  barCountLg: { fontSize: 15, fontVariantNumeric: "tabular-nums", fontWeight: 800, color: KAPPA.ink, minWidth: 34, textAlign: "left" },
  recentRow: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", border: "none", borderTop: "1px solid #F1F5F9", background: "transparent", cursor: "pointer", fontFamily: FONT, transition: "background .12s" },
  avatar: { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13.5, flexShrink: 0 },
  recentName: { fontSize: 14, fontWeight: 600, color: KAPPA.ink },
  recentMeta: { fontSize: 12.5, color: "#94A3B8", marginTop: 2 },
  chip: { fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },
  recentRowLg: { width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 26px", border: "none", borderTop: "1px solid #F1F5F9", background: "transparent", cursor: "pointer", fontFamily: FONT, transition: "background .12s" },
  avatarDash: { width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 },
  recentNameLg: { fontSize: 15.5, fontWeight: 600, color: KAPPA.ink },
  recentMetaLg: { fontSize: 13, color: "#94A3B8", marginTop: 3 },
  chipLg: { fontSize: 12.5, fontWeight: 700, padding: "6px 14px", borderRadius: 20, whiteSpace: "nowrap" },
  board: { display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 10 },
  pipeHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 12 },
  pipeHeadMain: { display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap", flex: 1, minWidth: 0 },
  viewToggle: { display: "flex", gap: 4, background: "#EFF2F6", borderRadius: 10, padding: 4 },
  toggleBtn: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "#8695A8", padding: "8px 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  toggleActive: { background: "#fff", color: KAPPA.teal, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  filterBar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", position: "relative", paddingTop: 2 },
  filterBtnWrap: { position: "relative" },
  filterBtn: { display: "flex", alignItems: "center", gap: 6, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", padding: "8px 13px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
  filterBtnActive: { border: `1.5px solid ${KAPPA.teal}`, background: KAPPA.tealSoft, color: KAPPA.tealDark },
  filterDot: { width: 6, height: 6, borderRadius: "50%", background: KAPPA.teal },
  filterPopover: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, background: "#fff", borderRadius: 12, border: "1px solid #EAEEF3", boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 14, minWidth: 230, maxWidth: "calc(100vw - 40px)", display: "flex", flexDirection: "column", gap: 10 },
  filterPopRow: { display: "flex", gap: 10 },
  filterPopField: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 },
  filterPopLabel: { fontSize: 11, color: "#94A3B8", fontWeight: 700 },
  filterPopSelect: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, fontFamily: FONT, color: KAPPA.ink, background: "#fff" },
  filterPopClear: { alignSelf: "flex-start", background: "none", border: "none", color: KAPPA.tealDark, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: 0 },
  filterCheckRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", fontSize: 13, color: KAPPA.ink, cursor: "pointer" },
  filterCheckDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  filterClearAll: { background: "none", border: "none", color: "#94A3B8", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT, textDecoration: "underline", padding: "8px 2px" },
  filterDateInput: { width: "100%", padding: "8px 8px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12.5, fontFamily: FONT, color: KAPPA.ink, background: "#fff" },
  listWrap: { display: "flex", flexDirection: "column", gap: 20, marginTop: 16 },
  listGroup: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" },
  listGroupHead: { display: "flex", alignItems: "center", gap: 9, padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFC" },
  listGroupTitle: { fontSize: 15, fontWeight: 800, color: KAPPA.ink },
  listGroupSum: { marginRight: "auto", fontSize: 13, fontWeight: 700, color: KAPPA.teal },
  listRows: { display: "flex", flexDirection: "column" },
  listRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: "1px solid #F7F9FB" },
  listMain: { display: "flex", alignItems: "center", gap: 11, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT, padding: 0, flex: "0 0 auto" },
  listMeta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 },
  stageSelect: { border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontWeight: 600, fontFamily: FONT, color: KAPPA.ink, background: "#fff", cursor: "pointer", flexShrink: 0 },
  invWrap: { border: "1px solid #E8EEF0", borderRadius: 12, padding: 14, background: "#FAFCFD", marginBottom: 4 },
  invHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  invTotal: { fontSize: 13, fontWeight: 700, color: KAPPA.teal },
  invRow: { background: "#fff", border: "1px solid #EEF2F4", borderRadius: 10, padding: 10, marginBottom: 8 },
  invRowTop: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  invRemove: { width: 30, height: 30, borderRadius: 8, border: "1px solid #F0D5D5", background: "#FEF6F6", color: "#D9756B", fontSize: 18, lineHeight: 1, cursor: "pointer", flexShrink: 0 },
  invCompound: { display: "flex", alignItems: "center", gap: 7, marginTop: 9, fontSize: 13, color: KAPPA.ink, cursor: "pointer" },
  invAdd: { width: "100%", padding: "9px", borderRadius: 9, border: `1.5px dashed ${KAPPA.teal}`, background: "#fff", color: KAPPA.teal, fontWeight: 700, fontSize: 13, fontFamily: FONT, cursor: "pointer", marginTop: 2 },
  invViewWrap: { marginTop: 16, background: "#F8FBFC", border: "1px solid #E8EEF0", borderRadius: 12, padding: 14 },
  invViewRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #EEF3F5" },
  invViewTrack: { flex: 1, fontSize: 14, fontWeight: 600, color: KAPPA.ink },
  invViewAmount: { fontSize: 14, fontWeight: 700, color: KAPPA.ink, direction: "ltr" },
  invViewMode: { fontSize: 12, fontWeight: 600, minWidth: 78, textAlign: "left" },
  expandBtn: { width: "100%", padding: "8px", marginTop: 4, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: KAPPA.teal, fontWeight: 700, fontSize: 12.5, fontFamily: FONT, cursor: "pointer" },
  callDotBig: { display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginLeft: 7, verticalAlign: "middle" },
  callCount: { fontSize: 13, fontWeight: 700, borderRadius: 20, padding: "2px 10px" },
  callEmpty: { padding: "22px", textAlign: "center", color: "#B6C2CE", fontSize: 13.5, fontWeight: 600 },
  callsDivider: { display: "flex", alignItems: "center", gap: 14, margin: "38px 0 18px" },
  callsDividerLine: { flex: 1, height: 1, background: "#E2E8F0" },
  callsDividerLabel: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#8695A8", whiteSpace: "nowrap" },
  callCard: { background: "#fff", borderRadius: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" },
  callCardHead: { display: "flex", alignItems: "center", gap: 11, padding: "16px 20px 12px" },
  callCardIconBadge: { width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0 },
  callCardTitle: { fontSize: 15.5, fontWeight: 800, margin: 0, color: KAPPA.ink, flex: 1 },
  listDragHandle: { display: "grid", placeItems: "center", border: "none", background: "transparent", cursor: "grab", padding: 4, flexShrink: 0, touchAction: "none" },
  listEmpty: { padding: "14px 18px", fontSize: 13, color: "#B6C2CE", textAlign: "center", fontWeight: 600 },
  col: { width: 264, flexShrink: 0, background: "#EFF2F6", borderRadius: 14, padding: 10, maxHeight: "calc(100vh - 210px)", display: "flex", flexDirection: "column" },
  colHead: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 4px" },
  colDot: { width: 9, height: 9, borderRadius: "50%" },
  colTitle: { fontSize: 14.5, fontWeight: 700, color: KAPPA.ink, flex: 1 },
  colCount: { fontSize: 12.5, fontWeight: 700, color: "#94A3B8", background: "#fff", borderRadius: 20, padding: "2px 9px" },
  colSum: { fontSize: 12.5, color: KAPPA.teal, fontWeight: 700, padding: "0 8px 8px", fontVariantNumeric: "tabular-nums" },
  colBody: { display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", flex: 1 },
  emptyCol: { textAlign: "center", fontSize: 12.5, color: "#B4C0CE", padding: "20px 0" },
  leadCard: { background: "#fff", borderRadius: 11, padding: "12px 13px", cursor: "pointer", borderRight: "3px solid", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", transition: "all .15s" },
  leadCardTop: { display: "flex", alignItems: "center", gap: 9, marginBottom: 8 },
  avatarSm: { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11.5, flexShrink: 0 },
  leadName: { fontSize: 14.5, fontWeight: 700, color: KAPPA.ink },
  leadSummary: { fontSize: 12.5, color: "#7A8798", lineHeight: 1.55, margin: "0 0 9px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  leadTags: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 },
  leadTag: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600, color: KAPPA.graphite, background: "#F1F5F9", borderRadius: 6, padding: "3px 8px" },
  leadFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  leadCampaign: { fontSize: 12, color: "#94A3B8", fontWeight: 500 },
  leadCall: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 },
  journeyList: { display: "flex", flexDirection: "column", gap: 14 },
  journeyCard: { background: "#fff", borderRadius: 15, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  journeyHead: { display: "flex", alignItems: "center", gap: 13, marginBottom: 22 },
  journeyName: { fontSize: 16, fontWeight: 700, color: KAPPA.ink },
  journeyMeta: { fontSize: 13, color: "#94A3B8", marginTop: 2 },
  linkBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: KAPPA.tealSoft, color: KAPPA.tealDark, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  journeyBar: { display: "flex", alignItems: "flex-start", justifyContent: "flex-start", overflowX: "auto", paddingBottom: 4, gap: 0 },
  jStep: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: "0 0 auto", width: 62 },
  jDot: { width: 34, height: 34, borderRadius: "50%", border: "2px solid", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  jLabel: { fontSize: 11.5, textAlign: "center", lineHeight: 1.35 },
  jLine: { flex: 1, height: 2, marginTop: 16, borderRadius: 2, minWidth: 12 },
  overlay: { position: "fixed", inset: 0, background: "rgba(20,25,32,0.5)", display: "flex", justifyContent: "flex-start", zIndex: 100, backdropFilter: "blur(2px)" },
  confirmOverlay: { position: "fixed", inset: 0, background: "rgba(20,25,32,0.5)", display: "grid", placeItems: "center", zIndex: 120, backdropFilter: "blur(2px)", padding: 20 },
  confirmBox: { width: "100%", maxWidth: 400, background: "#fff", borderRadius: 18, padding: "26px 24px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", direction: "rtl" },
  confirmIcon: { width: 56, height: 56, borderRadius: "50%", background: KAPPA.tealSoft, display: "grid", placeItems: "center", margin: "0 auto 14px" },
  confirmTitle: { fontSize: 17, fontWeight: 800, color: KAPPA.ink, margin: "0 0 8px" },
  confirmText: { fontSize: 13.5, lineHeight: 1.6, color: KAPPA.graphite, margin: "0 0 20px" },
  confirmBtns: { display: "flex", flexDirection: "column", gap: 10 },
  confirmPrimary: { width: "100%", padding: "13px", borderRadius: 11, background: KAPPA.teal, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  confirmSecondary: { width: "100%", padding: "13px", borderRadius: 11, background: "#fff", color: KAPPA.tealDark, border: `1.5px solid ${KAPPA.teal}`, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  confirmCancel: { marginTop: 14, background: "none", border: "none", color: "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
  drawer: { width: 520, maxWidth: "92vw", height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(0,0,0,0.15)", animation: "slideIn .22s ease" },
  drawerMax: { width: "100vw", maxWidth: "100vw" },
  drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #F1F5F9", flexShrink: 0 },
  iconBtn: { width: 36, height: 36, borderRadius: 9, border: "none", background: "#F4F6F9", display: "grid", placeItems: "center", cursor: "pointer", color: KAPPA.graphite },
  drawerBody: { flex: 1, overflowY: "auto", overflowX: "hidden", padding: "22px", minWidth: 0 },
  drawerTop: { textAlign: "center", marginBottom: 20 },
  avatarLg: { width: 64, height: 64, borderRadius: 16, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22, margin: "0 auto 12px" },
  drawerName: { fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: KAPPA.ink },
  drawerRef: { fontSize: 13.5, color: "#94A3B8" },
  contactRow: { display: "flex", gap: 10, marginBottom: 20 },
  contactBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", borderRadius: 10, background: KAPPA.tealSoft, color: KAPPA.tealDark, textDecoration: "none", fontSize: 13.5, fontWeight: 600, direction: "ltr" },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#F1F5F9", borderRadius: 12, overflow: "hidden", marginBottom: 18 },
  detail: { background: "#fff", padding: "13px 14px" },
  detailLabel: { fontSize: 12, color: "#94A3B8", marginBottom: 5, fontWeight: 500 },
  detailValue: { fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  summaryBox: { background: "#F8FAFC", borderRadius: 12, padding: "15px 16px", marginBottom: 18 },
  summaryLabel: { fontSize: 12.5, color: "#94A3B8", fontWeight: 600, marginBottom: 7 },
  summaryText: { fontSize: 14, color: KAPPA.graphite, lineHeight: 1.7, margin: "0 0 12px", whiteSpace: "pre-wrap" },
  summaryAddRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  summaryAddInput: { flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 9, border: "1.5px solid #E2E8F0", fontSize: 13.5, fontFamily: FONT, color: KAPPA.ink, background: "#fff", resize: "vertical", minHeight: 38, maxHeight: 120, lineHeight: 1.5 },
  summaryAddBtn: { flexShrink: 0, padding: "9px 16px", borderRadius: 9, background: KAPPA.teal, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  meetingLinkOpen: { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12.5, fontWeight: 700, color: KAPPA.tealDark, textDecoration: "none" },
  aiSummaryError: { color: "#EF4444", fontSize: 12.5, marginTop: 8, fontWeight: 600 },
  aiSummaryResult: { marginTop: 14, background: "#fff", borderRadius: 10, padding: "12px 14px", border: `1px solid ${KAPPA.teal}33` },
  journeyPromo: { background: `linear-gradient(135deg, ${KAPPA.tealSoft}, #F0FBFC)`, borderRadius: 14, padding: "18px", marginBottom: 18, border: `1px solid ${KAPPA.teal}22` },
  promoHead: { display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: KAPPA.tealDark, marginBottom: 18 },
  stageSwitch: { marginTop: 4 },
  dangerZone: { marginTop: 22, paddingTop: 16, borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "flex-start" },
  binBox: { width: 560, maxWidth: "94vw", maxHeight: "82vh", background: "#fff", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.18)" },
  binHead: { display: "flex", alignItems: "center", justifyContent: "space-between", flexDirection: "row-reverse", padding: "14px 18px", borderBottom: "1px solid #F1F5F9" },
  binBody: { padding: "10px 18px 18px", overflowY: "auto" },
  binRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 2px", borderBottom: "1px solid #F8FAFC" },
  binName: { fontSize: 14.5, fontWeight: 700, color: KAPPA.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  binMeta: { fontSize: 12.5, color: "#94A3B8", marginTop: 3 },
  binReason: { fontSize: 12.5, color: "#64748B", marginTop: 2 },
  restoreBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: KAPPA.tealSoft, color: KAPPA.tealDark, border: `1px solid ${KAPPA.teal}55`, borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 },
  deleteBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  switchLabel: { fontSize: 13, fontWeight: 600, color: KAPPA.graphite, marginBottom: 10 },
  switchBtns: { display: "flex", flexWrap: "wrap", gap: 8 },
  switchBtn: { border: "2px solid transparent", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all .15s" },
  centerState: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "70px 20px", textAlign: "center" },
  stateText: { fontSize: 14, color: "#94A3B8", maxWidth: 340, lineHeight: 1.6 },
  retryBtn: { border: "none", borderRadius: 9, padding: "10px 20px", background: KAPPA.teal, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  field: { marginBottom: 14, flex: "1 1 160px", minWidth: 0 },
  fieldRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  fieldLabel: { display: "block", fontSize: 13.5, fontWeight: 600, color: KAPPA.graphite, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1.5px solid #E2E8F0", fontSize: 15, fontFamily: FONT, color: KAPPA.ink, background: "#fff", transition: "all .15s" },
  saveBtn: { width: "100%", padding: "13px", borderRadius: 11, background: KAPPA.teal, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 6 },
  cancelBtn: { padding: "13px 20px", borderRadius: 11, background: "#F1F5F9", color: KAPPA.graphite, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 6 },
  editBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, background: KAPPA.tealSoft, color: KAPPA.tealDark, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  reasonBox: { background: "#F8FAFC", borderRadius: 12, padding: "15px 16px", marginBottom: 18 },
  reasonBtns: { display: "flex", gap: 8, marginTop: 4 },
  reasonBtn: { border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all .15s" },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 20px", borderRadius: 11, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", animation: "toastIn .2s ease" },
};
