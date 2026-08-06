import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Users, Plus, X, Phone, Mail, Search,
  TrendingUp, Clock, CheckCircle2, ChevronLeft,
  ArrowLeft, Target, Wallet, CalendarClock,
  Sparkles, DollarSign, RefreshCw, AlertCircle, Pencil, LayoutGrid, List
} from "lucide-react";

// ============ API ============
// שכבת ה-API ב-n8n. אם הכתובת משתנה, עדכן כאן בלבד.
const API_BASE = "https://ariebitton.app.n8n.cloud/webhook";
const API = {
  leads:  `${API_BASE}/crm/leads`,
  add:    `${API_BASE}/crm/lead/add`,
  update: `${API_BASE}/crm/lead/update`,
  stage:  `${API_BASE}/crm/lead/stage`,
};

// ============ Kappa brand ============
const KAPPA = {
  teal: "#1FA9B8", tealDark: "#178793", tealSoft: "#E8F6F8",
  graphite: "#4A4A4A", ink: "#2A2E33",
};

// ============ Pipeline stages ============
const STAGES = [
  { id: "new",        label: "חדש",            color: "#6366F1", soft: "#EEF0FF" },
  { id: "contact",    label: "בטיפול",         color: "#0EA5E9", soft: "#E6F6FE" },
  { id: "meeting",    label: "נקבעה פגישה",    color: "#8B5CF6", soft: "#F1EBFE" },
  { id: "future",     label: "אולי בעתיד",     color: "#F59E0B", soft: "#FEF4E2" },
  { id: "interested", label: "מעוניין להשקיע", color: "#10B981", soft: "#E6F8F1" },
  { id: "closed",     label: "סגר",            color: "#0D9488", soft: "#E0F2F1" },
  { id: "lost",       label: "לא מעוניין",     color: "#94A3B8", soft: "#F1F5F9" },
];
const ALL_STAGES = STAGES;
const stageOf = (id) => ALL_STAGES.find((s) => s.id === id) || STAGES[STAGES.length - 1];
const LOST_REASONS = ["לא מתאים", "לא מעוניין"];

const JOURNEY = ["החלטה", "הסכמים", "חתימת כל הצדדים", "העברה בנקאית", "גישה לאגורה", "פרטי תשלום ראשון"];

const CAMPAIGNS = ["הפניה", "שיחה יזומה", "פנייה של הלקוח", "וובינר", "קמפיין פייסבוק", "זוביזר", "אתר"];
const TRACKS = ["Brick Capital", "Multi Single", "Fix and Flip", "Loan - 8%"];

const fmtMoney = (n) => {
  const num = Number(n);
  return !n || isNaN(num) ? "—" : "$" + num.toLocaleString("en-US");
};
const initials = (name) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
const todayStr = () => new Date().toLocaleDateString("en-GB");
// dd/mm/yyyy comparison
const isDue = (d) => {
  if (!d) return false;
  const p = (s) => { const [dd, mm, yy] = s.split("/").map(Number); return new Date(yy, mm - 1, dd); };
  try { return p(d) <= new Date(); } catch { return false; }
};

// ============================================================
export default function App() {
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [view, setView] = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = (msg, kind = "ok") => { setToast({ msg, kind }); setTimeout(() => setToast(null), 2600); };

  const loadLeads = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(API.leads);
      if (!res.ok) throw new Error("bad status " + res.status);
      const data = await res.json();
      const rows = (data.leads || []).map((l) => ({ ...l, id: String(l.id) }));
      setLeads(rows);
      setStatus("ready");
    } catch (e) {
      setStatus("error");
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filtered = useMemo(() => {
    if (!query.trim()) return leads;
    const q = query.trim();
    return leads.filter((l) =>
      (l.name || "").includes(q) || (l.email || "").includes(q) ||
      (l.phone || "").includes(q) || (l.referrer || "").includes(q)
    );
  }, [leads, query]);

  const stats = useMemo(() => {
    const active = leads.filter((l) => l.stage !== "lost");
    const interested = leads.filter((l) => l.stage === "interested");
    const closed = leads.filter((l) => l.stage === "closed");
    const pipeline = active.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const committed = [...interested, ...closed].reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const dueCalls = leads.filter((l) => isDue(l.next_call)).length;
    return { total: active.length, interested: interested.length, pipeline, committed, dueCalls };
  }, [leads]);

  // optimistic stage move → POST /crm/lead/stage
  const moveLead = async (id, stage) => {
    const prev = leads;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    const patch = { stage };
    if (stage === "interested" && (lead.journey_stage === "" || lead.journey_stage == null)) patch.journey_stage = 0;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (selected && selected.id === id) setSelected((s) => ({ ...s, ...patch }));
    try {
      const res = await fetch(API.stage, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage, journey_stage: patch.journey_stage }),
      });
      if (!res.ok) throw new Error();
      flash("הסטטוס עודכן");
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

  return (
    <div dir="rtl" style={styles.app}>
      <style>{css}</style>

      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>K</div>
          <div><div style={styles.brandName}>Kappa</div><div style={styles.brandSub}>ניהול משקיעים</div></div>
        </div>
        <nav style={styles.nav}>
          <NavItem icon={<LayoutDashboard size={19} />} label="סקירה" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <NavItem icon={<Users size={19} />} label="לידים" active={view === "pipeline"} onClick={() => setView("pipeline")} />
          <NavItem icon={<Target size={19} />} label="ליווי משקיעים" active={view === "journey"} onClick={() => setView("journey")} />
        </nav>
        <div style={styles.sidebarFoot}>
          <button style={styles.addBtn} onClick={() => setAdding(true)}><Plus size={18} /> ליד חדש</button>
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.topbar}>
          <div style={styles.searchWrap}>
            <Search size={18} color="#94A3B8" />
            <input style={styles.search} placeholder="חיפוש לפי שם, טלפון, אימייל, מפנה…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button style={styles.refreshBtn} onClick={loadLeads} title="רענן">
            <RefreshCw size={16} className={status === "loading" ? "spin" : ""} />
          </button>
          {stats.dueCalls > 0 && (
            <div style={styles.dueBadge}><CalendarClock size={16} /> {stats.dueCalls} שיחות להיום</div>
          )}
        </header>

        <div style={styles.content}>
          {status === "loading" && <Loading />}
          {status === "error" && <ErrorState onRetry={loadLeads} />}
          {status === "ready" && view === "dashboard" && <Dashboard stats={stats} leads={filtered} onOpen={setSelected} />}
          {status === "ready" && view === "pipeline" && (
            <Pipeline leads={filtered} onOpen={setSelected} onMove={moveLead} dragId={dragId} setDragId={setDragId} />
          )}
          {status === "ready" && view === "journey" && (
            <JourneyBoard leads={leads.filter((l) => l.stage === "interested")} onOpen={setSelected} />
          )}
        </div>
      </main>

      {selected && (
        <LeadDrawer lead={selected} onClose={() => setSelected(null)}
          onMove={(s) => moveLead(selected.id, s)} onSave={updateLead} />
      )}
      {adding && <AddLead onClose={() => setAdding(false)} onSave={addLead} />}
      {toast && (
        <div style={{ ...styles.toast, background: toast.kind === "err" ? "#EF4444" : KAPPA.ink }}>
          {toast.kind === "err" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />} {toast.msg}
        </div>
      )}
    </div>
  );
}

// ============ States ============
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

// ============ Dashboard ============
function Dashboard({ stats, leads, onOpen }) {
  const recent = leads.slice(0, 6);
  const byStage = STAGES.map((s) => ({ ...s, count: leads.filter((l) => l.stage === s.id).length }));
  const maxCount = Math.max(1, ...byStage.map((s) => s.count));
  return (
    <div>
      <h1 style={styles.pageTitle}>סקירה כללית</h1>
      <p style={styles.pageSub}>תמונת מצב של צנרת המשקיעים</p>
      <div style={styles.kpiRow}>
        <Kpi icon={<Users size={20} />} tint={KAPPA.teal} label="לידים פעילים" value={stats.total} />
        <Kpi icon={<CheckCircle2 size={20} />} tint="#10B981" label="מעוניינים להשקיע" value={stats.interested} />
        <Kpi icon={<TrendingUp size={20} />} tint="#8B5CF6" label="פוטנציאל בצנרת" value={fmtMoney(stats.pipeline)} />
        <Kpi icon={<Wallet size={20} />} tint="#F59E0B" label="התחייבו / סגרו" value={fmtMoney(stats.committed)} />
      </div>
      <div style={styles.dashGrid}>
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
                <button key={l.id} className="row-btn" style={styles.recentRow} onClick={() => onOpen(l)}>
                  <div style={{ ...styles.avatar, background: st.soft, color: st.color }}>{initials(l.name)}</div>
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <div style={styles.recentName}>{l.name}</div>
                    <div style={styles.recentMeta}>{l.campaign} · {fmtMoney(l.amount)}</div>
                  </div>
                  <span style={{ ...styles.chip, background: st.soft, color: st.color }}>{st.label}</span>
                  <ChevronLeft size={16} color="#CBD5E1" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
function Kpi({ icon, tint, label, value }) {
  return (
    <div style={styles.kpi}>
      <div style={{ ...styles.kpiIcon, background: tint + "18", color: tint }}>{icon}</div>
      <div style={styles.kpiValue}>{value}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}

// ============ Pipeline ============
function Pipeline({ leads, onOpen, onMove, dragId, setDragId }) {
  const [mode, setMode] = useState("kanban"); // kanban | list
  const [overStage, setOverStage] = useState(null);

  return (
    <div>
      <div style={styles.pipeHead}>
        <div>
          <h1 style={styles.pageTitle}>לידים</h1>
          <p style={styles.pageSub}>{mode === "kanban" ? "גרור כרטיס בין שלבים כדי לעדכן סטטוס" : "רשימת הלידים מקובצת לפי שלב"}</p>
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
            const items = leads.filter((l) => l.stage === stage.id);
            const sum = items.reduce((s, l) => s + (Number(l.amount) || 0), 0);
            const isOver = overStage === stage.id;
            return (
              <div key={stage.id} className="col"
                style={{ ...styles.col, background: isOver ? stage.soft : "#EFF2F6", outline: isOver ? `2px dashed ${stage.color}` : "none" }}
                onDragEnter={(e) => { e.preventDefault(); setOverStage(stage.id); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = dragId ?? e.dataTransfer.getData("text/plain");
                  if (id) onMove(String(id), stage.id);
                  setDragId(null); setOverStage(null);
                }}>
                <div style={styles.colHead}>
                  <span style={{ ...styles.colDot, background: stage.color }} />
                  <span style={styles.colTitle}>{stage.label}</span>
                  <span style={styles.colCount}>{items.length}</span>
                </div>
                {sum > 0 && <div style={styles.colSum}>{fmtMoney(sum)}</div>}
                <div style={styles.colBody}>
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} stage={stage} onClick={() => onOpen(l)}
                      onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(l.id)); }}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      dragging={dragId === l.id} />
                  ))}
                  {items.length === 0 && <div style={styles.emptyCol}>גרור לכאן</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ListView leads={leads} onOpen={onOpen} onMove={onMove} />
      )}
    </div>
  );
}

function ListView({ leads, onOpen, onMove }) {
  return (
    <div style={styles.listWrap}>
      {STAGES.map((stage) => {
        const items = leads.filter((l) => l.stage === stage.id);
        if (items.length === 0) return null;
        const sum = items.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        return (
          <div key={stage.id} style={styles.listGroup}>
            <div style={styles.listGroupHead}>
              <span style={{ ...styles.colDot, background: stage.color }} />
              <span style={styles.listGroupTitle}>{stage.label}</span>
              <span style={styles.colCount}>{items.length}</span>
              {sum > 0 && <span style={styles.listGroupSum}>{fmtMoney(sum)}</span>}
            </div>
            <div style={styles.listRows}>
              {items.map((l) => {
                const due = isDue(l.next_call);
                return (
                  <div key={l.id} className="list-row" style={styles.listRow}>
                    <button style={styles.listMain} onClick={() => onOpen(l)}>
                      <div style={{ ...styles.avatarSm, background: stage.soft, color: stage.color }}>{initials(l.name)}</div>
                      <div style={{ minWidth: 140, textAlign: "right" }}>
                        <div style={styles.leadName}>{l.name}</div>
                        <div style={styles.recentMeta}>{l.campaign || "—"}</div>
                      </div>
                    </button>
                    <div style={styles.listMeta}>
                      {Number(l.amount) > 0 && <span style={styles.leadTag}><DollarSign size={11} />{Math.round(Number(l.amount) / 1000)}K</span>}
                      {l.track && <span style={styles.leadTag}>{l.track}</span>}
                      {l.stage === "lost" && l.lost_reason && <span style={{ ...styles.leadTag, background: "#FEF2F2", color: "#B91C1C" }}>{l.lost_reason}</span>}
                      {l.next_call && <span style={{ ...styles.leadCall, color: due ? "#EF4444" : "#94A3B8" }}><Clock size={11} /> {l.next_call}</span>}
                    </div>
                    <select value={l.stage} onChange={(e) => onMove(l.id, e.target.value)} style={styles.stageSelect} onClick={(e) => e.stopPropagation()}>
                      {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({ lead, stage, onClick, onDragStart, onDragEnd, dragging }) {
  const due = isDue(lead.next_call);
  return (
    <div className="lead-card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      style={{ ...styles.leadCard, opacity: dragging ? 0.4 : 1, borderRightColor: stage.color }}>
      <div style={styles.leadCardTop}>
        <div style={{ ...styles.avatarSm, background: stage.soft, color: stage.color }}>{initials(lead.name)}</div>
        <span style={styles.leadName}>{lead.name}</span>
      </div>
      {lead.summary && <p style={styles.leadSummary}>{lead.summary}</p>}
      <div style={styles.leadTags}>
        {Number(lead.amount) > 0 && <span style={styles.leadTag}><DollarSign size={11} />{Math.round(Number(lead.amount) / 1000)}K</span>}
        {lead.track && <span style={styles.leadTag}>{lead.track}</span>}
        {lead.stage === "lost" && lead.lost_reason && <span style={{ ...styles.leadTag, background: "#FEF2F2", color: "#B91C1C" }}>{lead.lost_reason}</span>}
      </div>
      <div style={styles.leadFoot}>
        <span style={styles.leadCampaign}>{lead.campaign}</span>
        {lead.next_call && (
          <span style={{ ...styles.leadCall, color: due ? "#EF4444" : "#94A3B8" }}>
            <Clock size={11} /> {lead.next_call}
          </span>
        )}
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
            <JourneyBar current={Number(l.journey_stage) || 0} />
          </div>
        ))}
      </div>
    </div>
  );
}
function JourneyBar({ current }) {
  return (
    <div style={styles.journeyBar}>
      {JOURNEY.map((label, i) => {
        const done = i < current, active = i === current;
        return (
          <React.Fragment key={i}>
            <div style={styles.jStep}>
              <div style={{
                ...styles.jDot,
                background: done ? KAPPA.teal : active ? "#fff" : "#F1F5F9",
                borderColor: done || active ? KAPPA.teal : "#E2E8F0",
                color: done ? "#fff" : active ? KAPPA.teal : "#CBD5E1",
              }}>{done ? <CheckCircle2 size={15} /> : i + 1}</div>
              <span style={{ ...styles.jLabel, color: done || active ? KAPPA.ink : "#94A3B8", fontWeight: active ? 700 : 500 }}>{label}</span>
            </div>
            {i < JOURNEY.length - 1 && <div style={{ ...styles.jLine, background: done ? KAPPA.teal : "#E2E8F0" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============ Drawer ============
function LeadDrawer({ lead, onClose, onMove, onSave }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(lead);
  const [saving, setSaving] = useState(false);
  const st = stageOf(lead.stage);
  const isInterested = lead.stage === "interested";
  const isLost = lead.stage === "lost";
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const startEdit = () => { setF(lead); setEditing(true); };
  const cancel = () => { setEditing(false); setF(lead); };
  const save = async () => {
    setSaving(true);
    await onSave({ ...f, amount: f.amount === "" || f.amount == null ? "" : Number(f.amount) });
    setSaving(false);
    setEditing(false);
  };
  const saveReason = (reason) => onSave({ ...lead, lost_reason: reason });

  // ---------- EDIT MODE ----------
  if (editing) {
    return (
      <div style={styles.overlay} onClick={cancel}>
        <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
          <div style={styles.drawerHead}>
            <button style={styles.iconBtn} onClick={cancel}><X size={20} /></button>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: KAPPA.ink }}>עריכת ליד</h3>
          </div>
          <div style={styles.drawerBody}>
            <Field label="שם מלא"><input style={styles.input} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
            <div style={styles.fieldRow}>
              <Field label="טלפון"><input style={styles.input} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} dir="ltr" /></Field>
              <Field label="אימייל"><input style={styles.input} value={f.email || ""} onChange={(e) => set("email", e.target.value)} dir="ltr" /></Field>
            </div>
            <div style={styles.fieldRow}>
              <Field label="קמפיין">
                <select style={styles.input} value={f.campaign || ""} onChange={(e) => set("campaign", e.target.value)}>
                  <option value="">—</option>{CAMPAIGNS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="גורם מפנה"><input style={styles.input} value={f.referrer || ""} onChange={(e) => set("referrer", e.target.value)} /></Field>
            </div>
            <div style={styles.fieldRow}>
              <Field label="סכום השקעה ($)"><input style={styles.input} type="number" value={f.amount ?? ""} onChange={(e) => set("amount", e.target.value)} dir="ltr" /></Field>
              <Field label="אפיק השקעה">
                <select style={styles.input} value={f.track || ""} onChange={(e) => set("track", e.target.value)}>
                  <option value="">—</option>{TRACKS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div style={styles.fieldRow}>
              <Field label="מועד פגישה"><input style={styles.input} value={f.meeting_date || ""} onChange={(e) => set("meeting_date", e.target.value)} placeholder="dd/mm/yyyy" dir="ltr" /></Field>
              <Field label="קשר אחרון"><input style={styles.input} value={f.last_contact || ""} onChange={(e) => set("last_contact", e.target.value)} placeholder="dd/mm/yyyy" dir="ltr" /></Field>
            </div>
            <Field label="מועד שיחה הבאה"><input style={styles.input} value={f.next_call || ""} onChange={(e) => set("next_call", e.target.value)} placeholder="dd/mm/yyyy" dir="ltr" /></Field>
            <Field label="סיכום שיחה"><textarea style={{ ...styles.input, minHeight: 100, resize: "vertical" }} value={f.summary || ""} onChange={(e) => set("summary", e.target.value)} /></Field>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button style={{ ...styles.saveBtn, flex: 1, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>{saving ? "שומר…" : "שמור שינויים"}</button>
              <button style={styles.cancelBtn} onClick={cancel}>ביטול</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- VIEW MODE ----------
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.drawerHead}>
          <button style={styles.iconBtn} onClick={onClose}><X size={20} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={styles.editBtn} onClick={startEdit}><Pencil size={15} /> עריכה</button>
            <div style={{ ...styles.chip, background: st.soft, color: st.color }}>{st.label}</div>
          </div>
        </div>
        <div style={styles.drawerBody}>
          <div style={styles.drawerTop}>
            <div style={{ ...styles.avatarLg, background: st.soft, color: st.color }}>{initials(lead.name)}</div>
            <h2 style={styles.drawerName}>{lead.name}</h2>
            {lead.referrer && <div style={styles.drawerRef}>הופנה ע"י {lead.referrer}</div>}
          </div>
          <div style={styles.contactRow}>
            {lead.phone && <a href={`tel:${lead.phone}`} style={styles.contactBtn}><Phone size={16} />{lead.phone}</a>}
            {lead.email && <a href={`mailto:${lead.email}`} style={styles.contactBtn}><Mail size={16} />{lead.email}</a>}
          </div>
          <div style={styles.detailGrid}>
            <Detail label="קמפיין" value={lead.campaign || "—"} />
            <Detail label="אפיק השקעה" value={lead.track || "—"} />
            <Detail label="סכום" value={fmtMoney(lead.amount)} />
            <Detail label="מועד פגישה" value={lead.meeting_date || "—"} />
            <Detail label="קשר אחרון" value={lead.last_contact || "—"} />
            <Detail label="שיחה הבאה" value={lead.next_call || "—"} highlight={isDue(lead.next_call)} />
          </div>
          {isLost && (
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
          )}
          {lead.summary && (
            <div style={styles.summaryBox}>
              <div style={styles.summaryLabel}>סיכום שיחה אחרונה</div>
              <p style={styles.summaryText}>{lead.summary}</p>
            </div>
          )}
          {isInterested && (
            <div style={styles.journeyPromo}>
              <div style={styles.promoHead}><Sparkles size={16} color={KAPPA.teal} /> נמצא במסלול ליווי משקיעים</div>
              <JourneyBar current={Number(lead.journey_stage) || 0} />
            </div>
          )}
          <div style={styles.stageSwitch}>
            <div style={styles.switchLabel}>שינוי שלב</div>
            <div style={styles.switchBtns}>
              {STAGES.map((s) => (
                <button key={s.id} onClick={() => onMove(s.id)} style={{
                  ...styles.switchBtn,
                  background: lead.stage === s.id ? s.color : s.soft,
                  color: lead.stage === s.id ? "#fff" : s.color,
                }}>{s.label}</button>
              ))}
            </div>
          </div>
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

// ============ Add ============
function AddLead({ onClose, onSave }) {
  const [f, setF] = useState({
    name: "", phone: "", email: "", campaign: CAMPAIGNS[0], referrer: "",
    amount: "", track: TRACKS[0], stage: "new", summary: "", next_call: "", meeting_date: "", last_contact: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.name.trim().length > 0;
  const submit = async () => {
    setSaving(true);
    await onSave({ ...f, amount: f.amount ? Number(f.amount) : "" });
    setSaving(false);
  };
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.drawerHead}>
          <button style={styles.iconBtn} onClick={onClose}><X size={20} /></button>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: KAPPA.ink }}>ליד חדש</h3>
        </div>
        <div style={styles.drawerBody}>
          <Field label="שם מלא *"><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="שם המתעניין" /></Field>
          <div style={styles.fieldRow}>
            <Field label="טלפון"><input style={styles.input} value={f.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" /></Field>
            <Field label="אימייל"><input style={styles.input} value={f.email} onChange={(e) => set("email", e.target.value)} dir="ltr" /></Field>
          </div>
          <div style={styles.fieldRow}>
            <Field label="קמפיין">
              <select style={styles.input} value={f.campaign} onChange={(e) => set("campaign", e.target.value)}>
                {CAMPAIGNS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="גורם מפנה"><input style={styles.input} value={f.referrer} onChange={(e) => set("referrer", e.target.value)} /></Field>
          </div>
          <div style={styles.fieldRow}>
            <Field label="סכום השקעה ($)"><input style={styles.input} type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} dir="ltr" /></Field>
            <Field label="אפיק השקעה">
              <select style={styles.input} value={f.track} onChange={(e) => set("track", e.target.value)}>
                {TRACKS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div style={styles.fieldRow}>
            <Field label="מועד שיחה הבאה"><input style={styles.input} value={f.next_call} onChange={(e) => set("next_call", e.target.value)} placeholder="dd/mm/yyyy" dir="ltr" /></Field>
            <Field label="שלב">
              <select style={styles.input} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="סיכום שיחה"><textarea style={{ ...styles.input, minHeight: 80, resize: "vertical" }} value={f.summary} onChange={(e) => set("summary", e.target.value)} /></Field>
          <button style={{ ...styles.saveBtn, opacity: valid && !saving ? 1 : 0.5, cursor: valid && !saving ? "pointer" : "not-allowed" }}
            disabled={!valid || saving} onClick={submit}>
            {saving ? "מוסיף…" : "הוסף ליד"}
          </button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <div style={styles.field}><label style={styles.fieldLabel}>{label}</label>{children}</div>;
}

// ============ CSS ============
const css = `
  * { box-sizing: border-box; }
  body { margin:0; }
  .nav-item:hover { background: rgba(255,255,255,0.06) !important; }
  .lead-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); transform: translateY(-1px); }
  .row-btn:hover { background: #F8FAFC; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: ${KAPPA.teal} !important; box-shadow: 0 0 0 3px ${KAPPA.teal}22; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes slideIn { from { transform: translateX(-30px); opacity:0 } to { transform:translateX(0); opacity:1 } }
  @keyframes toastIn { from { transform: translateY(20px); opacity:0 } to { transform:translateY(0); opacity:1 } }
`;

const FONT = `"Heebo", "Assistant", -apple-system, "Segoe UI", sans-serif`;
const styles = {
  app: { display: "flex", height: "100vh", fontFamily: FONT, background: "#F4F6F9", color: KAPPA.ink, direction: "rtl" },
  sidebar: { width: 240, background: "#1E2329", display: "flex", flexDirection: "column", padding: "22px 16px", flexShrink: 0 },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 32, padding: "0 6px" },
  brandMark: { width: 40, height: 40, borderRadius: 11, background: `linear-gradient(135deg, ${KAPPA.teal}, ${KAPPA.tealDark})`, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 20 },
  brandName: { color: "#fff", fontWeight: 800, fontSize: 17, lineHeight: 1 },
  brandSub: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 3 },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem: { position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, textAlign: "right", transition: "all .15s" },
  navActive: { position: "absolute", right: 0, top: "22%", height: "56%", width: 3, borderRadius: 3, background: KAPPA.teal },
  sidebarFoot: { marginTop: "auto" },
  addBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 11, background: KAPPA.teal, color: "#fff", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 700, fontFamily: FONT },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { height: 66, background: "#fff", borderBottom: "1px solid #EAEEF3", display: "flex", alignItems: "center", gap: 12, padding: "0 26px", flexShrink: 0 },
  searchWrap: { display: "flex", alignItems: "center", gap: 9, background: "#F4F6F9", borderRadius: 10, padding: "9px 14px", flex: 1, maxWidth: 440 },
  search: { border: "none", background: "transparent", outline: "none", fontSize: 14, flex: 1, fontFamily: FONT, color: KAPPA.ink },
  refreshBtn: { width: 38, height: 38, borderRadius: 9, border: "1px solid #EAEEF3", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: KAPPA.graphite },
  dueBadge: { display: "flex", alignItems: "center", gap: 7, background: "#FEF2F2", color: "#EF4444", padding: "8px 13px", borderRadius: 9, fontSize: 13, fontWeight: 700 },
  content: { flex: 1, overflowY: "auto", padding: "28px 30px" },
  pageTitle: { fontSize: 25, fontWeight: 800, margin: "0 0 4px", color: KAPPA.ink },
  pageSub: { fontSize: 14, color: "#8695A8", margin: "0 0 24px" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 },
  kpi: { background: "#fff", borderRadius: 15, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  kpiIcon: { width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", marginBottom: 14 },
  kpiValue: { fontSize: 26, fontWeight: 800, color: KAPPA.ink, lineHeight: 1 },
  kpiLabel: { fontSize: 13, color: "#8695A8", marginTop: 6, fontWeight: 500 },
  dashGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  card: { background: "#fff", borderRadius: 15, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" },
  cardHead: { padding: "18px 22px 12px" },
  cardTitle: { fontSize: 16, fontWeight: 700, margin: 0, color: KAPPA.ink },
  barRow: { display: "flex", alignItems: "center", gap: 12, padding: "9px 22px" },
  barLabel: { fontSize: 13.5, color: KAPPA.graphite, width: 96, flexShrink: 0, fontWeight: 500 },
  barTrack: { flex: 1, height: 9, background: "#F1F5F9", borderRadius: 6, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 6, transition: "width .4s" },
  barCount: { fontSize: 13, fontWeight: 700, color: KAPPA.ink, width: 22, textAlign: "left" },
  recentRow: { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", border: "none", borderTop: "1px solid #F1F5F9", background: "transparent", cursor: "pointer", fontFamily: FONT, transition: "background .12s" },
  avatar: { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13.5, flexShrink: 0 },
  recentName: { fontSize: 14, fontWeight: 600, color: KAPPA.ink },
  recentMeta: { fontSize: 12.5, color: "#94A3B8", marginTop: 2 },
  chip: { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },
  board: { display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 10 },
  pipeHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  viewToggle: { display: "flex", gap: 4, background: "#EFF2F6", borderRadius: 10, padding: 4 },
  toggleBtn: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "#8695A8", padding: "8px 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  toggleActive: { background: "#fff", color: KAPPA.teal, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
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
  col: { width: 264, flexShrink: 0, background: "#EFF2F6", borderRadius: 14, padding: 10, maxHeight: "calc(100vh - 210px)", display: "flex", flexDirection: "column" },
  colHead: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 4px" },
  colDot: { width: 9, height: 9, borderRadius: "50%" },
  colTitle: { fontSize: 14, fontWeight: 700, color: KAPPA.ink, flex: 1 },
  colCount: { fontSize: 12.5, fontWeight: 700, color: "#94A3B8", background: "#fff", borderRadius: 20, padding: "2px 9px" },
  colSum: { fontSize: 12, color: KAPPA.teal, fontWeight: 700, padding: "0 8px 8px" },
  colBody: { display: "flex", flexDirection: "column", gap: 9, overflowY: "auto", flex: 1 },
  emptyCol: { textAlign: "center", fontSize: 12.5, color: "#B4C0CE", padding: "20px 0" },
  leadCard: { background: "#fff", borderRadius: 11, padding: "12px 13px", cursor: "pointer", borderRight: "3px solid", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", transition: "all .15s" },
  leadCardTop: { display: "flex", alignItems: "center", gap: 9, marginBottom: 8 },
  avatarSm: { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11.5, flexShrink: 0 },
  leadName: { fontSize: 14, fontWeight: 700, color: KAPPA.ink },
  leadSummary: { fontSize: 12, color: "#7A8798", lineHeight: 1.55, margin: "0 0 9px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  leadTags: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 },
  leadTag: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: KAPPA.graphite, background: "#F1F5F9", borderRadius: 6, padding: "3px 8px" },
  leadFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  leadCampaign: { fontSize: 11.5, color: "#94A3B8", fontWeight: 500 },
  leadCall: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600 },
  journeyList: { display: "flex", flexDirection: "column", gap: 14 },
  journeyCard: { background: "#fff", borderRadius: 15, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  journeyHead: { display: "flex", alignItems: "center", gap: 13, marginBottom: 22 },
  journeyName: { fontSize: 16, fontWeight: 700, color: KAPPA.ink },
  journeyMeta: { fontSize: 13, color: "#94A3B8", marginTop: 2 },
  linkBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: KAPPA.tealSoft, color: KAPPA.tealDark, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  journeyBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between" },
  jStep: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: "0 0 auto", width: 70 },
  jDot: { width: 34, height: 34, borderRadius: "50%", border: "2px solid", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  jLabel: { fontSize: 11.5, textAlign: "center", lineHeight: 1.35 },
  jLine: { flex: 1, height: 2, marginTop: 16, borderRadius: 2, minWidth: 12 },
  overlay: { position: "fixed", inset: 0, background: "rgba(20,25,32,0.5)", display: "flex", justifyContent: "flex-start", zIndex: 100, backdropFilter: "blur(2px)" },
  drawer: { width: 460, maxWidth: "92vw", height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(0,0,0,0.15)", animation: "slideIn .22s ease" },
  drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #F1F5F9", flexShrink: 0 },
  iconBtn: { width: 36, height: 36, borderRadius: 9, border: "none", background: "#F4F6F9", display: "grid", placeItems: "center", cursor: "pointer", color: KAPPA.graphite },
  drawerBody: { flex: 1, overflowY: "auto", padding: "22px" },
  drawerTop: { textAlign: "center", marginBottom: 20 },
  avatarLg: { width: 64, height: 64, borderRadius: 16, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22, margin: "0 auto 12px" },
  drawerName: { fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: KAPPA.ink },
  drawerRef: { fontSize: 13, color: "#94A3B8" },
  contactRow: { display: "flex", gap: 10, marginBottom: 20 },
  contactBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px", borderRadius: 10, background: KAPPA.tealSoft, color: KAPPA.tealDark, textDecoration: "none", fontSize: 13, fontWeight: 600, direction: "ltr" },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#F1F5F9", borderRadius: 12, overflow: "hidden", marginBottom: 18 },
  detail: { background: "#fff", padding: "13px 14px" },
  detailLabel: { fontSize: 11.5, color: "#94A3B8", marginBottom: 5, fontWeight: 500 },
  detailValue: { fontSize: 14, fontWeight: 700 },
  summaryBox: { background: "#F8FAFC", borderRadius: 12, padding: "15px 16px", marginBottom: 18 },
  summaryLabel: { fontSize: 12, color: "#94A3B8", fontWeight: 600, marginBottom: 7 },
  summaryText: { fontSize: 13.5, color: KAPPA.graphite, lineHeight: 1.7, margin: 0 },
  journeyPromo: { background: `linear-gradient(135deg, ${KAPPA.tealSoft}, #F0FBFC)`, borderRadius: 14, padding: "18px", marginBottom: 18, border: `1px solid ${KAPPA.teal}22` },
  promoHead: { display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: KAPPA.tealDark, marginBottom: 18 },
  stageSwitch: { marginTop: 4 },
  switchLabel: { fontSize: 13, fontWeight: 600, color: KAPPA.graphite, marginBottom: 10 },
  switchBtns: { display: "flex", flexWrap: "wrap", gap: 8 },
  switchBtn: { border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all .15s" },
  centerState: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "70px 20px", textAlign: "center" },
  stateText: { fontSize: 14.5, color: "#94A3B8", maxWidth: 340, lineHeight: 1.6 },
  retryBtn: { border: "none", borderRadius: 9, padding: "10px 20px", background: KAPPA.teal, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  field: { marginBottom: 14, flex: 1 },
  fieldRow: { display: "flex", gap: 12 },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, color: KAPPA.graphite, marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1.5px solid #E2E8F0", fontSize: 14, fontFamily: FONT, color: KAPPA.ink, background: "#fff", transition: "all .15s" },
  saveBtn: { width: "100%", padding: "13px", borderRadius: 11, background: KAPPA.teal, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 6 },
  cancelBtn: { padding: "13px 20px", borderRadius: 11, background: "#F1F5F9", color: KAPPA.graphite, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, marginTop: 6 },
  editBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, background: KAPPA.tealSoft, color: KAPPA.tealDark, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  reasonBox: { background: "#F8FAFC", borderRadius: 12, padding: "15px 16px", marginBottom: 18 },
  reasonBtns: { display: "flex", gap: 8, marginTop: 4 },
  reasonBtn: { border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all .15s" },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 20px", borderRadius: 11, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", animation: "toastIn .2s ease" },
};
