import { useState, useEffect, useCallback, useRef } from "react";

const API = "http://localhost:5000/api";
async function apiCall(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ── Constants ────────────────────────────────────────────────────
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SURFACES = { grass:"Grass", artificial:"Artificial Turf", futsal:"Futsal", indoor:"Indoor" };
const SURFACE_COLOR = { grass:"#4ade80", artificial:"#60a5fa", futsal:"#fb923c", indoor:"#c084fc" };
const STATUS_COLOR = { pending:"#facc15", confirmed:"#4ade80", cancelled:"#f87171" };
const STATUS_BG = { pending:"rgba(250,204,21,0.1)", confirmed:"rgba(74,222,128,0.1)", cancelled:"rgba(248,113,113,0.1)" };

function toMin(t) { const [h,m]=(t||"00:00").split(":").map(Number); return h*60+m; }
function fromMin(m) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

// Generate HH:00 options between two times (inclusive of start, exclusive of end)
function hoursInRange(slotStart, slotEnd) {
  const s = toMin(slotStart);
  const e = toMin(slotEnd);
  const opts = [];
  for (let m = s; m <= e; m += 60) opts.push(fromMin(m));
  return opts;
}

// Given available schedule slots and existing bookings, compute truly free ranges
// Returns array of {start, end} free windows
function computeFreeWindows(slots, bookings) {
  const windows = [];
  for (const slot of slots) {
    const sStart = toMin(slot.slot_start);
    const sEnd = toMin(slot.slot_end);
    // Bookings that overlap this slot, sorted
    const overlapping = bookings
      .filter(b => toMin(b.booked_start) < sEnd && toMin(b.booked_end) > sStart)
      .sort((a,b) => toMin(a.booked_start) - toMin(b.booked_start));

    let cursor = sStart;
    for (const b of overlapping) {
      const bS = toMin(b.booked_start);
      const bE = toMin(b.booked_end);
      if (bS > cursor) windows.push({ start: cursor, end: bS });
      cursor = Math.max(cursor, bE);
    }
    if (cursor < sEnd) windows.push({ start: cursor, end: sEnd });
  }
  return windows;
}

// Given a chosen start time, return valid end options within the same free window
function validEndTimes(startMin, freeWindows) {
  const win = freeWindows.find(w => startMin >= w.start && startMin < w.end);
  if (!win) return [];
  const opts = [];
  for (let m = startMin + 60; m <= win.end; m += 60) opts.push(fromMin(m));
  return opts;
}

// Generate time options (every hour) for all free window start points
function validStartTimes(freeWindows) {
  const opts = new Set();
  for (const w of freeWindows) {
    for (let m = w.start; m < w.end; m += 60) opts.add(fromMin(m));
  }
  return [...opts].sort();
}

// ── Icons ────────────────────────────────────────────────────────
const IconBall = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 6.7 17.2M12 2a10 10 0 0 0-6.7 17.2M12 22V12M5.3 7l6.7 5 6.7-5"/></svg>);
const IconStadium = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v5M9 12v5M15 12v5"/></svg>);
const IconLogout = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>);
const IconEye = ({ open }) => open ? (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>) : (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>);
const IconUsers = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconHome = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>);
const IconSearch = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>);
const IconCheck = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20,6 9,17 4,12"/></svg>);
const IconX = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
const IconUserPlus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>);
const IconUserMinus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>);
const IconMapPin = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>);
const IconClock = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>);
const IconPlus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const IconEdit = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const IconTrash = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>);
const IconCalendar = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IconPhone = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.9 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.1 4.2 2 2 0 0 1 5.08 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.91 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>);
const IconDollar = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
const IconUsers2 = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconToggle = ({ on }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx={on?16:8} cy="12" r="3" fill="currentColor"/></svg>);
const IconFilter = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></svg>);
const IconBell = ({ filled }) => (<svg viewBox="0 0 24 24" fill={filled?"currentColor":"none"} stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>);
const IconChat = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const IconGroup = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconSend = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>);
const IconArrowLeft = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/></svg>);
const IconShield = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const IconBookmark = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>);
const IconArrow = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>);

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ name, size = 38 }) {
  const initials = name ? name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";
  const hue = name ? name.charCodeAt(0)*17%360 : 120;
  return <div className="avatar" style={{width:size,height:size,minWidth:size,background:`hsl(${hue},45%,22%)`,border:`1.5px solid hsl(${hue},45%,32%)`,fontSize:size*0.36,color:`hsl(${hue},70%,72%)`}}>{initials}</div>;
}

// ══════════════════════════════════════════════════════════════════
//  AUTH PAGE
// ══════════════════════════════════════════════════════════════════
function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name:"", email:"", password:"", userType:"player", city:"", country:"" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [animating, setAnimating] = useState(false);

  const switchMode = (m) => { setAnimating(true); setTimeout(()=>{setMode(m);setError("");setAnimating(false);},300); };
  const handle = (e) => { setForm({...form,[e.target.name]:e.target.value}); setError(""); };
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const data = mode==="login"
        ? await apiCall("/auth/login","POST",{email:form.email,password:form.password})
        : await apiCall("/auth/signup","POST",form);
      localStorage.setItem("token",data.token); onLogin(data.user);
    } catch(err){setError(err.message);}
    finally{setLoading(false);}
  };

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="pitch-lines">{[...Array(8)].map((_,i)=><div key={i} className="pitch-line" style={{animationDelay:`${i*0.2}s`}}/>)}</div>
        <div className="circle-center"/>
      </div>
      <div className={`auth-card ${animating?"fade-out":"fade-in"}`}>
        <div className="logo">
          <div className="logo-icon"><svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="18" fill="none" stroke="#4ade80" strokeWidth="2"/><path d="M20 4a16 16 0 0 1 10.7 27.5M20 4a16 16 0 0 0-10.7 27.5M20 36V20M9.3 11l10.7 8 10.7-8" stroke="#4ade80" strokeWidth="2" fill="none"/></svg></div>
          <div className="logo-text"><span className="logo-main">KickOff</span><span className="logo-sub">Stadium Booking</span></div>
        </div>
        <div className="tab-switcher">
          <button className={`tab ${mode==="login"?"active":""}`} onClick={()=>switchMode("login")}>Sign In</button>
          <button className={`tab ${mode==="signup"?"active":""}`} onClick={()=>switchMode("signup")}>Sign Up</button>
          <div className={`tab-indicator ${mode==="signup"?"right":""}`}/>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode==="signup" && (<>
            <div className="field"><label>Full Name</label><input name="name" value={form.name} onChange={handle} placeholder="John Smith" required/></div>
            <div className="field"><label>I am a...</label>
              <div className="type-selector">
                <button type="button" className={`type-btn ${form.userType==="player"?"selected":""}`} onClick={()=>setForm({...form,userType:"player"})}><span className="type-icon"><IconBall/></span><span className="type-label">Player</span><span className="type-desc">Find & book matches</span></button>
                <button type="button" className={`type-btn ${form.userType==="stadium_owner"?"selected":""}`} onClick={()=>setForm({...form,userType:"stadium_owner"})}><span className="type-icon"><IconStadium/></span><span className="type-label">Stadium Owner</span><span className="type-desc">Manage your venue</span></button>
              </div>
            </div>
            <div className="form-row">
              <div className="field"><label>Country <span className="optional">(optional)</span></label><input name="country" value={form.country} onChange={handle} placeholder="Israel"/></div>
              <div className="field"><label>City <span className="optional">(optional)</span></label><input name="city" value={form.city} onChange={handle} placeholder="Tel Aviv"/></div>
            </div>
          </>)}
          <div className="field"><label>Email Address</label><input name="email" type="email" value={form.email} onChange={handle} placeholder="you@example.com" required/></div>
          <div className="field"><label>Password</label><div className="password-wrap"><input name="password" type={showPass?"text":"password"} value={form.password} onChange={handle} placeholder="••••••••" required/><button type="button" className="eye-btn" onClick={()=>setShowPass(!showPass)}><IconEye open={showPass}/></button></div></div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="submit-btn" disabled={loading}>{loading?<span className="spinner"/>:mode==="login"?"Sign In":"Create Account"}</button>
        </form>
        <p className="switch-text">{mode==="login"?"Don't have an account?":"Already have an account?"}{" "}<button className="link-btn" onClick={()=>switchMode(mode==="login"?"signup":"login")}>{mode==="login"?"Sign up":"Sign in"}</button></p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  SCHEDULE BUILDER (Owner)
// ══════════════════════════════════════════════════════════════════
function ScheduleBuilder({ stadiumId, onClose }) {
  const [slots, setSlots] = useState({0:[],1:[],2:[],3:[],4:[],5:[],6:[]});
  const [activeDay, setActiveDay] = useState(1);
  const [addStart, setAddStart] = useState("08:00");
  const [addEnd, setAddEnd] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const TIME_OPTIONS = [];
  for (let h = 6; h <= 24; h++) TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:00`);

  useEffect(() => {
    apiCall(`/stadiums/${stadiumId}/schedule`).then(data => {
      const s = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
      data.forEach(row => {
        const d = row.day_of_week;
        s[d] = [...(s[d]||[]), { slot_start:row.slot_start.slice(0,5), slot_end:row.slot_end.slice(0,5) }];
      });
      setSlots(s);
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [stadiumId]);

  const addSlot = () => {
    setError("");
    if (addStart >= addEnd) { setError("End time must be after start time"); return; }
    const existing = slots[activeDay]||[];
    const conflict = existing.some(s => !(addEnd <= s.slot_start || addStart >= s.slot_end));
    if (conflict) { setError("This slot overlaps with an existing one"); return; }
    const updated = [...existing, {slot_start:addStart,slot_end:addEnd}].sort((a,b)=>a.slot_start.localeCompare(b.slot_start));
    setSlots({...slots,[activeDay]:updated});
  };

  const removeSlot = (day, idx) => {
    const updated = [...slots[day]]; updated.splice(idx,1); setSlots({...slots,[day]:updated});
  };

  const copyToAll = () => {
    const base = slots[activeDay];
    const n = {}; for(let i=0;i<7;i++) n[i]=[...base]; setSlots(n);
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const allSlots = [];
      for(let d=0;d<7;d++) (slots[d]||[]).forEach(s=>allSlots.push({day_of_week:d,slot_start:s.slot_start,slot_end:s.slot_end,is_available:true}));
      await apiCall(`/stadiums/${stadiumId}/schedule`,"PUT",{slots:allSlots});
      onClose(true);
    } catch(err){ setError(err.message); }
    finally{ setSaving(false); }
  };

  const totalSlots = Object.values(slots).reduce((a,v)=>a+v.length,0);

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose(false)}>
      <div className="modal schedule-modal">
        <div className="modal-header">
          <div><h2 className="modal-title">Weekly Schedule</h2><p style={{fontSize:12,color:"var(--text-muted)",marginTop:3}}>{totalSlots} slots configured</p></div>
          <button className="modal-close" onClick={()=>onClose(false)}><IconX/></button>
        </div>
        <div className="schedule-body">
          <div className="day-tabs">
            {DAYS_SHORT.map((d,i)=>(
              <button key={i} className={`day-tab ${activeDay===i?"active":""}`} onClick={()=>setActiveDay(i)}>
                {d}{slots[i]?.length>0&&<span className="day-dot">{slots[i].length}</span>}
              </button>
            ))}
          </div>
          <div className="schedule-day-content">
            <div className="schedule-day-label">{DAYS[activeDay]}</div>
            <div className="slot-list">
              {(slots[activeDay]||[]).length===0&&<div className="slot-empty">No slots for {DAYS[activeDay]} — add below</div>}
              {(slots[activeDay]||[]).map((s,i)=>(
                <div key={i} className="slot-row">
                  <span className="slot-time">{s.slot_start}</span>
                  <span className="slot-dash">→</span>
                  <span className="slot-time">{s.slot_end}</span>
                  <button className="slot-remove" onClick={()=>removeSlot(activeDay,i)}><IconX/></button>
                </div>
              ))}
            </div>
            <div className="add-slot-row">
              <select value={addStart} onChange={e=>setAddStart(e.target.value)} className="time-select">
                {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <span className="slot-dash">→</span>
              <select value={addEnd} onChange={e=>setAddEnd(e.target.value)} className="time-select">
                {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <button className="btn-add-slot" onClick={addSlot}><IconPlus/> Add</button>
            </div>
            {error&&<div className="error-msg" style={{marginTop:8}}>{error}</div>}
            <button className="copy-all-btn" onClick={copyToAll}>Copy {DAYS[activeDay]}'s slots to all days</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={()=>onClose(false)}>Cancel</button>
          <button className="submit-btn" style={{flex:1}} onClick={save} disabled={saving}>{saving?<span className="spinner"/>:"Save Schedule"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  STADIUM FORM MODAL
// ══════════════════════════════════════════════════════════════════
const EMPTY_FORM = {name:"",city:"",country:"",description:"",price_per_hour:"",capacity:"",surface:"grass",phone:"",open_time:"08:00",close_time:"22:00"};

function StadiumModal({ stadium, onClose, onSave }) {
  const [form, setForm] = useState(stadium ? {
    name:stadium.name, city:stadium.city||"", country:stadium.country||"", description:stadium.description||"",
    price_per_hour:stadium.price_per_hour, capacity:stadium.capacity||"",
    surface:stadium.surface||"grass", phone:stadium.phone||"",
    open_time:stadium.open_time?.slice(0,5)||"08:00", close_time:stadium.close_time?.slice(0,5)||"22:00",
  } : EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = (e) => setForm({...form,[e.target.name]:e.target.value});
  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      if(stadium) await apiCall(`/stadiums/${stadium.id}`,"PUT",form);
      else await apiCall("/stadiums","POST",form);
      onSave();
    } catch(err){setError(err.message);}
    finally{setLoading(false);}
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{stadium?"Edit Stadium":"Add New Stadium"}</h2>
          <button className="modal-close" onClick={onClose}><IconX/></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field"><label>Stadium Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Green Arena" required/></div>
          <div className="form-row">
            <div className="field"><label>City *</label><input name="city" value={form.city} onChange={handle} placeholder="Madrid" required/></div>
            <div className="field"><label>Country *</label><input name="country" value={form.country} onChange={handle} placeholder="Spain" required/></div>
          </div>
          <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handle} placeholder="Describe your stadium..." rows={3}/></div>
          <div className="form-row">
            <div className="field"><label>Price per Hour (₪) *</label><input name="price_per_hour" type="number" min="0" step="0.01" value={form.price_per_hour} onChange={handle} placeholder="150" required/></div>
            <div className="field"><label>Capacity</label><input name="capacity" type="number" min="2" value={form.capacity} onChange={handle} placeholder="22"/></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Surface</label><select name="surface" value={form.surface} onChange={handle}><option value="grass">Grass</option><option value="artificial">Artificial Turf</option><option value="futsal">Futsal</option><option value="indoor">Indoor</option></select></div>
            <div className="field"><label>Phone</label><input name="phone" value={form.phone} onChange={handle} placeholder="050-1234567"/></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Opens At</label><input name="open_time" type="time" value={form.open_time} onChange={handle}/></div>
            <div className="field"><label>Closes At</label><input name="close_time" type="time" value={form.close_time} onChange={handle}/></div>
          </div>
          {error&&<div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" disabled={loading} style={{flex:1}}>{loading?<span className="spinner"/>:stadium?"Save Changes":"Create Stadium"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER: BOOK SLOT MODAL — custom time range picker
// ══════════════════════════════════════════════════════════════════
function BookSlotModal({ stadium, onClose, onBooked }) {
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [slotsData, setSlotsData] = useState({ slots:[], bookings:[] });
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookedStart, setBookedStart] = useState("");
  const [bookedEnd, setBookedEnd] = useState("");
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const loadSlots = useCallback(async (day) => {
    setLoadingSlots(true); setBookedStart(""); setBookedEnd(""); setError("");
    try { setSlotsData(await apiCall(`/stadiums/${stadium.id}/slots?day=${day}`)); }
    catch { setSlotsData({ slots:[], bookings:[] }); }
    setLoadingSlots(false);
  }, [stadium.id]);

  useEffect(() => { loadSlots(selectedDay); }, [selectedDay, loadSlots]);

  // Compute free windows from schedule + existing bookings
  const freeWindows = computeFreeWindows(slotsData.slots, slotsData.bookings);
  const startOptions = validStartTimes(freeWindows);
  const endOptions = bookedStart ? validEndTimes(toMin(bookedStart), freeWindows) : [];

  // When start changes, reset end if it's no longer valid
  const handleStartChange = (val) => {
    setBookedStart(val);
    setBookedEnd("");
    setError("");
  };

  const duration = bookedStart && bookedEnd ? (toMin(bookedEnd) - toMin(bookedStart)) / 60 : 0;
  const price = duration * Number(stadium.price_per_hour);

  const handleBook = async () => {
    if (!bookedStart || !bookedEnd) return;
    setBooking(true); setError("");
    try {
      await apiCall("/bookings","POST",{
        stadium_id:stadium.id, day_of_week:selectedDay,
        booked_start:bookedStart, booked_end:bookedEnd, note:note||null
      });
      setSuccess(true);
      setTimeout(() => onBooked(), 1800);
    } catch(err) { setError(err.message); }
    finally { setBooking(false); }
  };

  const color = SURFACE_COLOR[stadium.surface]||"#4ade80";

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Book a Slot</h2>
            <p style={{fontSize:13,color:"var(--text-muted)",marginTop:2}}>
              {stadium.name} · <span style={{color}}>₪{Number(stadium.price_per_hour).toLocaleString()}/hr</span>
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><IconX/></button>
        </div>

        {success ? (
          <div className="booking-success">
            <div className="success-icon">✓</div>
            <p>Booking request sent!</p>
            <p style={{fontSize:13,color:"var(--text-muted)"}}>Waiting for owner confirmation</p>
          </div>
        ) : (
          <div className="modal-form">
            {/* Day selector */}
            <div>
              <label className="field-label">Select Day</label>
              <div className="day-tabs" style={{marginTop:8}}>
                {DAYS_SHORT.map((d,i)=>(
                  <button key={i} className={`day-tab ${selectedDay===i?"active":""}`} onClick={()=>setSelectedDay(i)}>{d}</button>
                ))}
              </div>
            </div>

            {/* Available windows visualizer */}
            {!loadingSlots && (
              <div>
                <label className="field-label">Available Windows — {DAYS[selectedDay]}</label>
                {freeWindows.length === 0 ? (
                  <div className="slot-empty" style={{padding:"16px 0",textAlign:"left"}}>No availability for {DAYS[selectedDay]}</div>
                ) : (
                  <div className="free-windows">
                    {freeWindows.map((w,i) => (
                      <div key={i} className="free-window-chip">
                        <IconClock/>
                        <span>{fromMin(w.start)}</span>
                        <IconArrow/>
                        <span>{fromMin(w.end)}</span>
                        <span className="free-window-dur">{(w.end-w.start)/60}h free</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {loadingSlots && <div className="center-spinner" style={{padding:20}}><span className="spinner large"/></div>}

            {/* Time range picker */}
            {!loadingSlots && freeWindows.length > 0 && (
              <div>
                <label className="field-label">Choose Your Time Range</label>
                <div className="time-range-picker">
                  <div className="time-range-field">
                    <span className="time-range-label">From</span>
                    <select
                      value={bookedStart}
                      onChange={e=>handleStartChange(e.target.value)}
                      className="time-select"
                    >
                      <option value="">-- Start --</option>
                      {startOptions.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="time-range-arrow"><IconArrow/></div>
                  <div className="time-range-field">
                    <span className="time-range-label">To</span>
                    <select
                      value={bookedEnd}
                      onChange={e=>{setBookedEnd(e.target.value);setError("");}}
                      className="time-select"
                      disabled={!bookedStart}
                    >
                      <option value="">-- End --</option>
                      {endOptions.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Price preview */}
                {duration > 0 && (
                  <div className="price-preview">
                    <div className="price-preview-row">
                      <span>{duration} hour{duration>1?"s":""} × ₪{Number(stadium.price_per_hour).toLocaleString()}</span>
                      <span className="price-total">₪{price.toLocaleString()}</span>
                    </div>
                    <div className="price-preview-note">
                      If confirmed, the owner's schedule will be updated:
                      {toMin(bookedStart) > toMin(slotsData.slots.find(s=>toMin(s.slot_start)<=toMin(bookedStart)&&toMin(s.slot_end)>=toMin(bookedEnd))?.slot_start||bookedStart) && (
                        <span className="split-preview"> {slotsData.slots.find(s=>toMin(s.slot_start)<=toMin(bookedStart)&&toMin(s.slot_end)>=toMin(bookedEnd))?.slot_start?.slice(0,5)}→{bookedStart}</span>
                      )}
                      <span className="split-preview booked"> {bookedStart}→{bookedEnd} (yours)</span>
                      {toMin(bookedEnd) < toMin(slotsData.slots.find(s=>toMin(s.slot_start)<=toMin(bookedStart)&&toMin(s.slot_end)>=toMin(bookedEnd))?.slot_end||bookedEnd) && (
                        <span className="split-preview"> {bookedEnd}→{slotsData.slots.find(s=>toMin(s.slot_start)<=toMin(bookedStart)&&toMin(s.slot_end)>=toMin(bookedEnd))?.slot_end?.slice(0,5)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Note */}
            {bookedStart && bookedEnd && (
              <div className="field">
                <label>Note <span className="optional">(optional)</span></label>
                <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Team of 10 players..."/>
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="submit-btn" style={{flex:1}} onClick={handleBook} disabled={!bookedStart||!bookedEnd||booking}>
                {booking ? <span className="spinner"/> : bookedStart && bookedEnd ? `Book ${bookedStart} – ${bookedEnd}` : "Select a time range"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: BOOKING MANAGEMENT
// ══════════════════════════════════════════════════════════════════
function BookingsPanel({ stadiumId, stadiumName }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDay, setFilterDay] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async()=>{ setLoading(true); try{setBookings(await apiCall(`/bookings/stadium/${stadiumId}`));}catch{} setLoading(false); },[stadiumId]);
  useEffect(()=>{load();},[load]);

  const updateStatus = async (id, status) => {
    setActionLoading(id);
    try { await apiCall(`/bookings/${id}/status`,"PATCH",{status}); await load(); } catch {}
    setActionLoading(null);
  };

  const filtered = bookings.filter(b=>
    (filterDay==="all"||b.day_of_week===parseInt(filterDay)) &&
    (filterStatus==="all"||b.status===filterStatus)
  );

  return (
    <div className="bookings-panel">
      <div className="bookings-panel-header">
        <h3 className="section-title">Bookings — {stadiumName}</h3>
        <div className="bookings-filters">
          <select value={filterDay} onChange={e=>setFilterDay(e.target.value)} className="filter-select">
            <option value="all">All Days</option>
            {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="filter-select">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {loading && <div className="center-spinner"><span className="spinner large"/></div>}
      {!loading && filtered.length===0 && <div className="empty-state"><div className="empty-icon"><IconBookmark/></div><p>No bookings{filterDay!=="all"||filterStatus!=="all"?" matching filters":""}</p></div>}

      <div className="booking-list">
        {filtered.map(b=>(
          <div key={b.id} className="booking-card owner">
            <div className="booking-card-left">
              <Avatar name={b.player_name} size={36}/>
              <div>
                <div className="booking-player-name">{b.player_name}</div>
                <div className="booking-meta">{b.player_email}</div>
              </div>
            </div>
            <div className="booking-slot-info">
              <span className="booking-day">{DAYS[b.day_of_week]}</span>
              <span className="booking-time">{b.booked_start?.slice(0,5)} – {b.booked_end?.slice(0,5)}</span>
              {b.note && <span className="booking-note">"{b.note}"</span>}
            </div>
            <div className="booking-card-right">
              <span className="status-badge" style={{color:STATUS_COLOR[b.status],background:STATUS_BG[b.status],borderColor:`${STATUS_COLOR[b.status]}40`}}>{b.status}</span>
              {b.status==="pending" && (
                <div className="booking-actions">
                  <button className="action-btn success" onClick={()=>updateStatus(b.id,"confirmed")} disabled={actionLoading===b.id}>
                    {actionLoading===b.id?<span className="spinner sm"/>:<><IconCheck/> Confirm</>}
                  </button>
                  <button className="action-btn danger" onClick={()=>updateStatus(b.id,"cancelled")} disabled={actionLoading===b.id}><IconX/></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: STADIUM CARD
// ══════════════════════════════════════════════════════════════════
function StadiumCard({ stadium, onEdit, onDelete, onToggle, onSchedule, onViewBookings }) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const color = SURFACE_COLOR[stadium.surface]||"#4ade80";

  return (
    <div className={`stadium-card ${!stadium.is_active?"inactive":""}`}>
      <div className="stadium-card-header">
        <div className="stadium-surface-dot" style={{background:color}}/>
        <div className="stadium-card-info">
          <h3 className="stadium-card-name">{stadium.name}</h3>
          <span className="stadium-card-meta"><IconMapPin/> {[stadium.city, stadium.country].filter(Boolean).join(', ')}</span>
        </div>
        <div className={`stadium-status-badge ${stadium.is_active?"active":"inactive"}`}>{stadium.is_active?"Active":"Inactive"}</div>
      </div>
      {stadium.description&&<p className="stadium-card-desc">{stadium.description}</p>}
      <div className="stadium-card-stats">
        <div className="stat"><IconDollar/><span>₪{Number(stadium.price_per_hour).toLocaleString()}/hr</span></div>
        {stadium.capacity&&<div className="stat"><IconUsers2/><span>{stadium.capacity} players</span></div>}
        <div className="stat"><span className="surface-tag" style={{color,borderColor:`${color}40`,background:`${color}10`}}>{SURFACES[stadium.surface]||stadium.surface}</span></div>
        <div className="stat"><IconClock/><span>{stadium.open_time?.slice(0,5)} – {stadium.close_time?.slice(0,5)}</span></div>
        {stadium.phone&&<div className="stat"><IconPhone/><span>{stadium.phone}</span></div>}
      </div>
      <div className="stadium-card-actions">
        <button className="action-btn muted" onClick={()=>onSchedule(stadium)}><IconCalendar/><span>Schedule</span></button>
        <button className="action-btn muted" onClick={()=>onViewBookings(stadium)}><IconBookmark/><span>Bookings</span></button>
        <button className="action-btn primary" onClick={()=>onEdit(stadium)}><IconEdit/><span>Edit</span></button>
        <button className="action-btn muted" onClick={async()=>{setToggling(true);await onToggle(stadium.id);setToggling(false);}} disabled={toggling}>{toggling?<span className="spinner sm"/>:<><IconToggle on={stadium.is_active}/><span>{stadium.is_active?"Off":"On"}</span></>}</button>
        <button className="action-btn danger" onClick={async()=>{if(!window.confirm(`Delete "${stadium.name}"?`))return;setDeleting(true);await onDelete(stadium.id);setDeleting(false);}} disabled={deleting}>{deleting?<span className="spinner sm"/>:<IconTrash/>}</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  OWNER: STADIUMS PAGE
// ══════════════════════════════════════════════════════════════════
function OwnerStadiumsPage() {
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [schedulingStadium, setSchedulingStadium] = useState(null);
  const [bookingsStadium, setBookingsStadium] = useState(null);

  const load = useCallback(async()=>{ setLoading(true); try{setStadiums(await apiCall("/stadiums/mine"));}catch{} setLoading(false); },[]);
  useEffect(()=>{load();},[load]);

  return (
    <div className="stadiums-page">
      <div className="stadiums-header">
        <div><h2 className="page-title">My Stadiums</h2><p className="page-sub">{stadiums.length} total · {stadiums.filter(s=>s.is_active).length} active</p></div>
        <button className="submit-btn" style={{width:"auto",padding:"10px 20px"}} onClick={()=>{setEditing(null);setShowModal(true);}}><IconPlus/> Add Stadium</button>
      </div>
      {loading&&<div className="center-spinner"><span className="spinner large"/></div>}
      {!loading&&stadiums.length===0&&(
        <div className="empty-state large">
          <div className="empty-icon large"><IconStadium/></div>
          <p className="empty-title">No stadiums yet</p>
          <p>Add your first stadium to start receiving bookings</p>
          <button className="cta-btn" style={{marginTop:16,width:"auto"}} onClick={()=>setShowModal(true)}><IconPlus/> Add Your First Stadium</button>
        </div>
      )}
      <div className="stadium-grid">
        {stadiums.map(s=>(
          <StadiumCard key={s.id} stadium={s}
            onEdit={s=>{setEditing(s);setShowModal(true);}}
            onDelete={async id=>{try{await apiCall(`/stadiums/${id}`,"DELETE");await load();}catch{}}}
            onToggle={async id=>{try{await apiCall(`/stadiums/${id}/toggle`,"PATCH");await load();}catch{}}}
            onSchedule={s=>setSchedulingStadium(s)}
            onViewBookings={s=>setBookingsStadium(s)}
          />
        ))}
      </div>
      {showModal&&<StadiumModal stadium={editing} onClose={()=>{setShowModal(false);setEditing(null);}} onSave={()=>{setShowModal(false);setEditing(null);load();}}/>}
      {schedulingStadium&&<ScheduleBuilder stadiumId={schedulingStadium.id} onClose={()=>setSchedulingStadium(null)}/>}
      {bookingsStadium&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setBookingsStadium(null)}>
          <div className="modal wide-modal">
            <div className="modal-header">
              <h2 className="modal-title">Bookings</h2>
              <button className="modal-close" onClick={()=>setBookingsStadium(null)}><IconX/></button>
            </div>
            <div style={{padding:"0 28px 28px"}}><BookingsPanel stadiumId={bookingsStadium.id} stadiumName={bookingsStadium.name}/></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER: BROWSE STADIUMS
// ══════════════════════════════════════════════════════════════════
function BrowseStadiumsPage({ onMessageOwner }) {
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', city: '', country: '', day: '', slot: '' });
  const [bookingStadium, setBookingStadium] = useState(null);
  const debounceRef = useRef(null);

  const TIME_OPTIONS = [];
  for (let h = 6; h < 24; h++) TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:00`);

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.q) params.set('q', f.q);
      if (f.city) params.set('city', f.city);
      if (f.country) params.set('country', f.country);
      if (f.day !== '') {
        params.set('day', f.day);
        if (f.slot) { const end = `${String(parseInt(f.slot)+1).padStart(2,'0')}:00`; params.set('slot_start', f.slot); params.set('slot_end', end); }
      }
      setStadiums(await apiCall(`/stadiums?${params}`));
    } catch {}
    setLoading(false);
  }, []);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val, ...(key === 'day' ? { slot: '' } : {}) }));

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(filters), 350);
  }, [filters, load]);

  const hasFilters = filters.q || filters.city || filters.country || filters.day !== '';

  return (
    <div className="stadiums-page">
      <div className="stadiums-header">
        <div><h2 className="page-title">Stadiums</h2><p className="page-sub">Browse and book available stadiums</p></div>
      </div>

      {/* 4-field filter bar */}
      <div className="browse-filters" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="search-bar" style={{ flex: '2 1 160px', minWidth: 140 }}>
          <span className="search-icon"><IconSearch/></span>
          <input value={filters.q} onChange={e => setFilter('q', e.target.value)} placeholder="Stadium name..."/>
        </div>
        <input className="filter-input" value={filters.country} onChange={e => setFilter('country', e.target.value)} placeholder="🌍 Country" style={{ flex: '1 1 110px', minWidth: 100 }}/>
        <input className="filter-input" value={filters.city} onChange={e => setFilter('city', e.target.value)} placeholder="📍 City" style={{ flex: '1 1 110px', minWidth: 100 }}/>
        <select className="filter-select" value={filters.day} onChange={e => setFilter('day', e.target.value)}>
          <option value="">📅 Any Day</option>
          {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        {filters.day !== '' && (
          <select className="filter-select" value={filters.slot} onChange={e => setFilter('slot', e.target.value)}>
            <option value="">Any Time</option>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {hasFilters && <button className="clear-filters" onClick={() => setFilters({ q: '', city: '', country: '', day: '', slot: '' })}>✕ Clear</button>}
      </div>

      {loading && <div className="center-spinner" style={{ padding: 40 }}><span className="spinner large"/></div>}
      {!loading && stadiums.length === 0 && <div className="empty-state"><div className="empty-icon"><IconStadium/></div><p>{hasFilters ? 'No stadiums match your filters' : 'No stadiums available yet'}</p></div>}
      <div className="stadium-grid">
        {stadiums.map(s => {
          const color = SURFACE_COLOR[s.surface] || '#4ade80';
          return (
            <div key={s.id} className="stadium-card browse">
              <div className="stadium-card-header">
                <div className="stadium-surface-dot" style={{ background: color }}/>
                <div className="stadium-card-info">
                  <h3 className="stadium-card-name">{s.name}</h3>
                  <span className="stadium-card-meta"><IconMapPin/> {[s.city, s.country].filter(Boolean).join(', ')}</span>
                </div>
                <span className="surface-tag" style={{ color, borderColor: `${color}40`, background: `${color}10`, fontSize: 11 }}>{SURFACES[s.surface]}</span>
              </div>
              {s.description && <p className="stadium-card-desc">{s.description}</p>}
              <div className="stadium-card-stats">
                <div className="stat"><IconDollar/><span>₪{Number(s.price_per_hour).toLocaleString()}/hr</span></div>
                {s.capacity && <div className="stat"><IconUsers2/><span>{s.capacity} players</span></div>}
                <div className="stat"><IconClock/><span>{s.open_time?.slice(0,5)} – {s.close_time?.slice(0,5)}</span></div>
                {s.phone && <div className="stat"><IconPhone/><span>{s.phone}</span></div>}
              </div>
              <div className="browse-owner"><Avatar name={s.owner_name} size={22}/><span>by {s.owner_name}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="book-btn" style={{ flex: 1 }} onClick={() => setBookingStadium(s)}><IconCalendar/> Book a Slot</button>
                <button className="book-btn" style={{ flex: 1, background: 'rgba(74,222,128,0.08)', color: 'var(--primary)', border: '1px solid rgba(74,222,128,0.25)' }}
                  onClick={() => onMessageOwner && onMessageOwner({ partner_id: s.owner_id, partner_name: s.owner_name, partner_role: 'Stadium Owner' })}>
                  <IconChat /> Message
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {bookingStadium&&<BookSlotModal stadium={bookingStadium} onClose={()=>setBookingStadium(null)} onBooked={()=>setBookingStadium(null)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYER: MY BOOKINGS
// ══════════════════════════════════════════════════════════════════
function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async()=>{ setLoading(true); try{setBookings(await apiCall("/bookings/mine"));}catch{} setLoading(false); };
  useEffect(()=>{load();},[]);

  const cancel = async(id)=>{
    if(!window.confirm("Cancel this booking?")) return;
    setCancelLoading(id);
    try{await apiCall(`/bookings/${id}/cancel`,"PATCH");await load();}catch{}
    setCancelLoading(null);
  };

  const filtered = bookings.filter(b=>filterStatus==="all"||b.status===filterStatus);

  return (
    <div className="stadiums-page">
      <div className="stadiums-header">
        <div><h2 className="page-title">My Bookings</h2><p className="page-sub">{bookings.length} total</p></div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="filter-select">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {loading&&<div className="center-spinner"><span className="spinner large"/></div>}
      {!loading&&filtered.length===0&&<div className="empty-state"><div className="empty-icon"><IconBookmark/></div><p>{filterStatus!=="all"?`No ${filterStatus} bookings`:"No bookings yet — browse stadiums to book!"}</p></div>}
      <div className="booking-list">
        {filtered.map(b=>(
          <div key={b.id} className="booking-card">
            <div className="booking-stadium-info">
              <div className="booking-stadium-name">{b.stadium_name}</div>
              <div className="booking-meta"><IconMapPin/> {[b.stadium_city, b.stadium_country].filter(Boolean).join(', ')}</div>
            </div>
            <div className="booking-slot-info">
              <span className="booking-day">{DAYS[b.day_of_week]}</span>
              <span className="booking-time">{b.booked_start?.slice(0,5)} – {b.booked_end?.slice(0,5)}</span>
              <span className="booking-price">₪{Number(b.price_per_hour).toLocaleString()}/hr</span>
              {b.note&&<span className="booking-note">"{b.note}"</span>}
            </div>
            <div className="booking-card-right">
              <span className="status-badge" style={{color:STATUS_COLOR[b.status],background:STATUS_BG[b.status],borderColor:`${STATUS_COLOR[b.status]}40`}}>{b.status}</span>
              {(b.status==="pending"||b.status==="confirmed")&&(
                <button className="action-btn danger" style={{marginTop:6}} onClick={()=>cancel(b.id)} disabled={cancelLoading===b.id}>
                  {cancelLoading===b.id?<span className="spinner sm"/>:<><IconX/> Cancel</>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PLAYERS PAGE
// ══════════════════════════════════════════════════════════════════
function PlayerCard({ player, currentUserId, onAction, actionLoading, onViewAvailability }) {
  const { id, name, city, country, friendship_status, friendship_requester, has_availability } = player;
  const isFriend = friendship_status==="accepted";
  const isPendingFromMe = friendship_status==="pending"&&Number(friendship_requester)===currentUserId;
  const isPendingToMe = friendship_status==="pending"&&Number(friendship_requester)!==currentUserId;
  const locationStr = [city, country].filter(Boolean).join(', ');
  return (
    <div className="player-card">
      <Avatar name={name}/>
      <div className="player-info">
        <span className="player-name">{name}</span>
        {locationStr&&<span className="player-meta"><IconMapPin/> {locationStr}</span>}
        {has_availability&&<span className="avail-badge">📅 Has availability</span>}
      </div>
      <div className="player-actions">
        {has_availability&&<button className="action-btn muted" style={{fontSize:11,padding:'5px 8px'}} onClick={()=>onViewAvailability&&onViewAvailability(player)}>Schedule</button>}
        {isFriend&&(<><span className="friend-badge">Friends</span><button className="action-btn danger" onClick={()=>onAction("remove",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<IconUserMinus/>}</button></>)}
        {isPendingFromMe&&(<button className="action-btn muted" onClick={()=>onAction("cancel",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><span>Pending</span><IconX/></>}</button>)}
        {isPendingToMe&&(<><button className="action-btn success" onClick={()=>onAction("accept",id,String(friendship_requester))} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><IconCheck/><span>Accept</span></>}</button><button className="action-btn danger-sm" onClick={()=>onAction("decline",id,String(friendship_requester))} disabled={actionLoading===id}><IconX/></button></>)}
        {!friendship_status&&(<button className="action-btn primary" onClick={()=>onAction("add",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><IconUserPlus/><span>Add</span></>}</button>)}
      </div>
    </div>
  );
}

// ── Player Availability Viewer (read-only) ─────────────────────
function PlayerAvailabilityModal({ player, onClose }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiCall(`/players/${player.id}/availability`).then(s => { setSlots(s); setLoading(false); }).catch(() => setLoading(false));
  }, [player.id]);
  const byDay = DAYS.map((_, i) => slots.filter(s => s.day_of_week === i));
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div><h2 className="modal-title">{player.name}'s Availability</h2><p style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>Weekly schedule</p></div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          {loading ? <div className="center-spinner"><span className="spinner large"/></div> : (
            <div className="avail-grid">
              {DAYS.map((day, i) => (
                <div key={i} className={`avail-day-row ${byDay[i].length ? 'has-slots' : 'empty-day'}`}>
                  <span className="avail-day-label">{day.slice(0,3)}</span>
                  <div className="avail-slots">
                    {byDay[i].length ? byDay[i].map((s,j) => (
                      <span key={j} className="avail-slot-chip">{s.slot_start.slice(0,5)} – {s.slot_end.slice(0,5)}</span>
                    )) : <span className="avail-none">Not available</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── My Availability Manager ────────────────────────────────────
function MyAvailabilityModal({ onClose }) {
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const TIMES = [];
  for (let h = 6; h <= 23; h++) { TIMES.push(`${String(h).padStart(2,'0')}:00`); TIMES.push(`${String(h).padStart(2,'0')}:30`); }

  useEffect(() => {
    apiCall('/players/availability').then(data => {
      const map = {};
      data.forEach(s => {
        if (!map[s.day_of_week]) map[s.day_of_week] = [];
        map[s.day_of_week].push({ start: s.slot_start.slice(0,5), end: s.slot_end.slice(0,5) });
      });
      setSlots(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addSlot = (day) => {
    setSlots(prev => ({ ...prev, [day]: [...(prev[day]||[]), { start: '08:00', end: '10:00' }] }));
  };
  const removeSlot = (day, idx) => {
    setSlots(prev => { const arr = [...(prev[day]||[])]; arr.splice(idx,1); return { ...prev, [day]: arr }; });
  };
  const updateSlot = (day, idx, field, val) => {
    setSlots(prev => { const arr = [...(prev[day]||[])]; arr[idx] = { ...arr[idx], [field]: val }; return { ...prev, [day]: arr }; });
  };
  const saveDay = async (day) => {
    setSaving(day);
    try {
      const daySlots = (slots[day]||[]).map(s => ({ slot_start: s.start, slot_end: s.end }));
      await apiCall(`/players/availability/${day}`, 'PUT', { slots: daySlots });
    } catch {}
    setSaving(null);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div><h2 className="modal-title">My Availability</h2><p style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>Set when you're free to play each week</p></div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          {loading ? <div className="center-spinner"><span className="spinner large"/></div> : DAYS.map((day, i) => (
            <div key={i} className="avail-editor-day">
              <div className="avail-editor-header">
                <span className="avail-day-label">{day}</span>
                <div style={{display:'flex',gap:8}}>
                  <button className="action-btn primary" style={{fontSize:12,padding:'4px 10px'}} onClick={() => addSlot(i)}>+ Add slot</button>
                  <button className="action-btn success" style={{fontSize:12,padding:'4px 10px'}} onClick={() => saveDay(i)} disabled={saving===i}>
                    {saving===i ? <span className="spinner sm"/> : 'Save'}
                  </button>
                </div>
              </div>
              {(slots[i]||[]).length === 0 && <p className="avail-none" style={{marginLeft:8}}>No slots — not available</p>}
              {(slots[i]||[]).map((s, j) => (
                <div key={j} className="slot-row">
                  <select className="time-select" value={s.start} onChange={e => updateSlot(i,j,'start',e.target.value)}>
                    {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{color:'var(--text-muted)',fontSize:13}}>to</span>
                  <select className="time-select" value={s.end} onChange={e => updateSlot(i,j,'end',e.target.value)}>
                    {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="action-btn danger-sm" onClick={() => removeSlot(i,j)}><IconX/></button>
                </div>
              ))}
            </div>
          ))}
          <div className="modal-actions">
            <button className="submit-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayersPage({ user }) {
  const [tab, setTab] = useState("search");
  const [filters, setFilters] = useState({ q: '', city: '', country: '', day: '' });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [viewAvailPlayer, setViewAvailPlayer] = useState(null);
  const [showMyAvail, setShowMyAvail] = useState(false);
  const debounceRef = useRef(null);

  const loadFriends = useCallback(async () => {
    try {
      const [f, inc, out] = await Promise.all([apiCall("/friends"), apiCall("/friends/requests/incoming"), apiCall("/friends/requests/outgoing")]);
      setFriends(f); setIncoming(inc); setOutgoing(out);
    } catch {}
  }, []);
  useEffect(() => { loadFriends(); }, [loadFriends]);

  const doSearch = useCallback(async (f) => {
    const params = new URLSearchParams();
    if (f.q) params.set('q', f.q);
    if (f.city) params.set('city', f.city);
    if (f.country) params.set('country', f.country);
    if (f.day !== '') params.set('day', f.day);
    if (!f.q && !f.city && !f.country && f.day === '') { setSearchResults([]); setHasSearched(false); return; }
    setSearching(true); setHasSearched(true);
    try { setSearchResults(await apiCall(`/players/search?${params}`)); } catch {}
    setSearching(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(filters), 350);
  }, [filters, doSearch]);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  const handleAction = async (action, targetId, requesterId) => {
    setActionLoading(targetId);
    try {
      if (action === "add") await apiCall("/friends/request", "POST", { addresseeId: targetId });
      else if (action === "cancel" || action === "remove") await apiCall(`/friends/${targetId}`, "DELETE");
      else if (action === "accept") await apiCall(`/friends/${requesterId}/respond`, "PATCH", { action: "accept" });
      else if (action === "decline") await apiCall(`/friends/${requesterId}/respond`, "PATCH", { action: "decline" });
      await loadFriends();
      doSearch(filters);
    } catch (err) { console.error(err); }
    setActionLoading(null);
  };

  const hasFilters = filters.q || filters.city || filters.country || filters.day !== '';

  return (
    <div className="players-page">
      <div className="sub-tabs">
        <button className={`sub-tab ${tab==="search"?"active":""}`} onClick={()=>setTab("search")}><IconSearch/> Search</button>
        <button className={`sub-tab ${tab==="friends"?"active":""}`} onClick={()=>setTab("friends")}><IconUsers/> Friends{friends.length>0&&<span className="count-badge neutral">{friends.length}</span>}</button>
        <button className={`sub-tab ${tab==="requests"?"active":""}`} onClick={()=>setTab("requests")}>Requests{incoming.length>0&&<span className="count-badge green">{incoming.length}</span>}</button>
        <button className={`sub-tab`} onClick={()=>setShowMyAvail(true)}>📅 My Availability</button>
      </div>

      {tab==="search" && (
        <div className="tab-content">
          {/* Filter bar */}
          <div className="player-filter-bar">
            <div className="search-bar" style={{flex:2,minWidth:160}}>
              <span className="search-icon"><IconSearch/></span>
              <input value={filters.q} onChange={e=>setFilter('q',e.target.value)} placeholder="Search by name..." />
              {searching && <span className="spinner sm" style={{position:'absolute',right:14}}/>}
            </div>
            <input className="filter-input" value={filters.country} onChange={e=>setFilter('country',e.target.value)} placeholder="🌍 Country"/>
            <input className="filter-input" value={filters.city} onChange={e=>setFilter('city',e.target.value)} placeholder="📍 City"/>
            <select className="filter-select" value={filters.day} onChange={e=>setFilter('day',e.target.value)}>
              <option value="">📅 Any day</option>
              {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
            </select>
            {hasFilters && <button className="action-btn muted" style={{fontSize:12,whiteSpace:'nowrap'}} onClick={()=>setFilters({q:'',city:'',country:'',day:''})}>Clear</button>}
          </div>
          {!hasSearched && <div className="empty-state"><div className="empty-icon"><IconSearch/></div><p>Filter players by name, country, city or availability day</p></div>}
          {hasSearched && !searching && searchResults.length===0 && <div className="empty-state"><div className="empty-icon"><IconUsers/></div><p>No players found</p></div>}
          <div className="player-list">
            {searchResults.map(p => <PlayerCard key={p.id} player={p} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading} onViewAvailability={setViewAvailPlayer}/>)}
          </div>
        </div>
      )}
      {tab==="friends" && (<div className="tab-content">{friends.length===0?<div className="empty-state"><div className="empty-icon"><IconUsers/></div><p>No friends yet!</p></div>:<div className="player-list">{friends.map(f=><PlayerCard key={f.id} player={{...f,friendship_status:"accepted"}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading} onViewAvailability={setViewAvailPlayer}/>)}</div>}</div>)}
      {tab==="requests" && (<div className="tab-content">
        {incoming.length>0&&<div className="requests-section"><h3 className="section-label">Incoming <span className="count-badge green">{incoming.length}</span></h3><div className="player-list">{incoming.map(p=><PlayerCard key={p.id} player={{...p,friendship_status:"pending",friendship_requester:p.id}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div></div>}
        {outgoing.length>0&&<div className="requests-section"><h3 className="section-label">Sent</h3><div className="player-list">{outgoing.map(p=><PlayerCard key={p.id} player={{...p,friendship_status:"pending",friendship_requester:user.id}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div></div>}
        {incoming.length===0&&outgoing.length===0&&<div className="empty-state"><div className="empty-icon"><IconClock/></div><p>No pending requests</p></div>}
      </div>)}
      {viewAvailPlayer && <PlayerAvailabilityModal player={viewAvailPlayer} onClose={()=>setViewAvailPlayer(null)}/>}
      {showMyAvail && <MyAvailabilityModal onClose={()=>setShowMyAvail(false)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS PANEL
// ══════════════════════════════════════════════════════════════════
function NotificationsPanel({ onClose, onUnreadChange }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiCall('/notifications');
      setNotifications(data);
      const unread = data.filter(n => !n.is_read).length;
      onUnreadChange(unread);
    } catch {}
    setLoading(false);
  }, [onUnreadChange]);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    await apiCall('/notifications/read-all', 'PATCH');
    setNotifications(n => n.map(x => ({ ...x, is_read: true })));
    onUnreadChange(0);
  };

  const markRead = async (id) => {
    await apiCall(`/notifications/${id}/read`, 'PATCH');
    setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    onUnreadChange(notifications.filter(n => !n.is_read && n.id !== id).length);
  };

  const typeIcon = (type) => {
    if (type === 'message') return '💬';
    if (type === 'friend_request') return '👋';
    if (type === 'group_invite') return '⚽';
    if (type === 'booking') return '📅';
    return '🔔';
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="notif-panel">
      <div className="notif-header">
        <span className="notif-title">Notifications</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {notifications.some(n => !n.is_read) && (
            <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
          )}
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
      </div>
      {loading && <div className="center-spinner" style={{ padding: 24 }}><span className="spinner large" /></div>}
      {!loading && notifications.length === 0 && (
        <div className="notif-empty"><IconBell /><p>No notifications yet</p></div>
      )}
      <div className="notif-list">
        {notifications.map(n => (
          <div key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`} onClick={() => !n.is_read && markRead(n.id)}>
            <span className="notif-icon">{typeIcon(n.type)}</span>
            <div className="notif-body">
              <p className="notif-msg">{n.message}</p>
              <span className="notif-time">{timeAgo(n.created_at)}</span>
            </div>
            {!n.is_read && <div className="notif-dot" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  DIRECT CHAT
// ══════════════════════════════════════════════════════════════════
// Reusable chat window — used by ChatPage and anywhere else
function ChatWindow({ user, partner, onBack }) {
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try { setMessages(await apiCall(`/messages/${partner.partner_id}`)); }
    catch {} setLoading(false);
  }, [partner.partner_id]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiCall('/messages', 'POST', { receiverId: partner.partner_id, content: newMsg });
      setMessages(prev => [...prev, { ...msg, sender_name: user.name }]);
      setNewMsg('');
    } catch {}
    setSending(false);
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="chat-main-header">
        <button className="back-btn" onClick={onBack}><IconArrowLeft /></button>
        <Avatar name={partner.partner_name} size={36} />
        <div>
          <span className="chat-partner-name">{partner.partner_name}</span>
          {[partner.partner_city, partner.partner_country].filter(Boolean).join(', ') && <span className="chat-partner-loc"><IconMapPin /> {[partner.partner_city, partner.partner_country].filter(Boolean).join(', ')}</span>}
          {partner.partner_role && <span className="chat-partner-loc" style={{color:'#f59e0b'}}>⚽ {partner.partner_role}</span>}
        </div>
      </div>
      <div className="messages-list">
        {loading && <div className="center-spinner"><span className="spinner large" /></div>}
        {!loading && messages.length === 0 && <div className="chat-empty-hint">Say hi! 👋</div>}
        {messages.map((m, i) => {
          const isMe = m.sender_id === user.id;
          const showName = !isMe && (i === 0 || messages[i-1]?.sender_id !== m.sender_id);
          return (
            <div key={m.id} className={`message-row ${isMe ? 'me' : 'them'}`}>
              {!isMe && showName && <Avatar name={m.sender_name} size={28} />}
              {!isMe && !showName && <div style={{ width: 28 }} />}
              <div className="message-bubble">
                <p>{m.content}</p>
                <span className="message-time">{formatTime(m.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form className="message-input-row" onSubmit={sendMessage}>
        <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
          placeholder="Type a message..." className="message-input" disabled={sending} />
        <button type="submit" className="send-btn" disabled={!newMsg.trim() || sending}>
          {sending ? <span className="spinner sm" /> : <IconSend />}
        </button>
      </form>
    </>
  );
}

function ChatPage({ user, initialPartner }) {
  const [contacts, setContacts] = useState([]); // friends + owners from conversations
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(initialPartner || null);
  const [search, setSearch] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      // Load friends + existing conversations merged into one list
      const [friends, convs] = await Promise.all([
        apiCall('/friends'),
        apiCall('/messages/conversations'),
      ]);
      // Build a map by id so we merge duplicates (friend with existing conv)
      const map = new Map();
      friends.forEach(f => map.set(f.id, {
        partner_id: f.id,
        partner_name: f.name,
        partner_city: f.city, partner_country: f.country,
        partner_role: 'Friend',
        last_message: null,
        unread_count: 0,
      }));
      convs.forEach(c => {
        const existing = map.get(c.partner_id);
        map.set(c.partner_id, {
          partner_id: c.partner_id,
          partner_name: c.partner_name,
          partner_city: c.partner_city, partner_country: c.partner_country,
          partner_role: existing?.partner_role || null,
          last_message: c.last_message,
          last_message_at: c.last_message_at,
          unread_count: c.unread_count,
        });
      });
      // Sort: conversations with messages first (by recency), then friends
      const sorted = [...map.values()].sort((a, b) => {
        if (a.last_message_at && b.last_message_at) return new Date(b.last_message_at) - new Date(a.last_message_at);
        if (a.last_message_at) return -1;
        if (b.last_message_at) return 1;
        return a.partner_name.localeCompare(b.partner_name);
      });
      setContacts(sorted);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // If initialPartner was passed (from stadium card), open that chat
  useEffect(() => {
    if (initialPartner) setActiveConv(initialPartner);
  }, [initialPartner]);

  const filtered = contacts.filter(c =>
    c.partner_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat-page">
      {/* Sidebar */}
      <div className={`chat-sidebar ${activeConv ? 'hidden-mobile' : ''}`}>
        <div className="chat-sidebar-header">
          <h2 className="page-title">Messages</h2>
          <p className="page-sub">Friends & conversations</p>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <div className="search-bar" style={{ height: 36 }}>
            <span className="search-icon"><IconSearch /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." />
          </div>
        </div>
        {loading && <div className="center-spinner"><span className="spinner large" /></div>}
        {!loading && contacts.length === 0 && (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-icon"><IconChat /></div>
            <p>Add friends in the Players tab to start chatting!</p>
          </div>
        )}
        <div className="conv-list">
          {filtered.map(c => (
            <div key={c.partner_id}
              className={`conv-item ${activeConv?.partner_id === c.partner_id ? 'active' : ''}`}
              onClick={() => { setActiveConv(c); loadContacts(); }}>
              <Avatar name={c.partner_name} size={42} />
              <div className="conv-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="conv-name">{c.partner_name}</span>
                  {c.partner_role && <span className="conv-role-tag">{c.partner_role}</span>}
                </div>
                <span className="conv-last">
                  {c.last_message ? c.last_message.slice(0, 35) + (c.last_message.length > 35 ? '...' : '') : 'Tap to start chatting'}
                </span>
              </div>
              {c.unread_count > 0 && <span className="count-badge green">{c.unread_count}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className={`chat-main ${!activeConv ? 'hidden-mobile' : ''}`}>
        {!activeConv ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon"><IconChat /></div>
            <p>Select a friend to start chatting</p>
          </div>
        ) : (
          <ChatWindow
            user={user}
            partner={activeConv}
            onBack={() => { setActiveConv(null); loadContacts(); }}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  GROUPS PAGE
// ══════════════════════════════════════════════════════════════════
function GroupsPage({ user }) {
  const [tab, setTab] = useState('my');
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [g, inv] = await Promise.all([apiCall('/groups/mine'), apiCall('/groups/invites/pending')]);
      setGroups(g); setInvites(inv);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const respondInvite = async (groupId, action) => {
    try {
      await apiCall(`/groups/${groupId}/respond`, 'PATCH', { action });
      await loadGroups();
      if (action === 'accept') setTab('my');
    } catch {}
  };

  if (activeGroup) {
    return <GroupDetail group={activeGroup} user={user} onBack={() => { setActiveGroup(null); loadGroups(); }} />;
  }

  return (
    <div className="groups-page">
      <div className="stadiums-header">
        <div>
          <h2 className="page-title">Groups & Matches</h2>
          <p className="page-sub">Organize matches with your friends</p>
        </div>
        <button className="submit-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setShowCreate(true)}>
          <IconPlus /> Create Group
        </button>
      </div>

      <div className="sub-tabs">
        <button className={`sub-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>
          <IconGroup /> My Groups {groups.length > 0 && <span className="count-badge neutral">{groups.length}</span>}
        </button>
        <button className={`sub-tab ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>
          Invites {invites.length > 0 && <span className="count-badge green">{invites.length}</span>}
        </button>
      </div>

      {loading && <div className="center-spinner" style={{ padding: 40 }}><span className="spinner large" /></div>}

      {!loading && tab === 'my' && (
        <div className="tab-content">
          {groups.length === 0 ? (
            <div className="empty-state large">
              <div className="empty-icon large"><IconGroup /></div>
              <p className="empty-title">No groups yet</p>
              <p>Create a group and invite friends to organize a match</p>
              <button className="cta-btn" style={{ marginTop: 16, width: 'auto' }} onClick={() => setShowCreate(true)}>
                <IconPlus /> Create Your First Group
              </button>
            </div>
          ) : (
            <div className="group-grid">
              {groups.map(g => (
                <div key={g.id} className="group-card" onClick={() => setActiveGroup(g)}>
                  <div className="group-card-header">
                    <div className="group-avatar"><IconGroup /></div>
                    <div>
                      <h3 className="group-name">{g.name}</h3>
                      <span className="group-meta">{g.member_count} player{g.member_count !== 1 ? 's' : ''}</span>
                    </div>
                    {g.unread_count > 0 && <span className="count-badge green" style={{ marginLeft: 'auto' }}>{g.unread_count}</span>}
                  </div>
                  {g.description && <p className="group-desc">{g.description}</p>}
                  <div className="group-details">
                    {g.stadium_name && <div className="stat"><IconStadium /><span>{g.stadium_name}</span></div>}
                    {g.match_day !== null && <div className="stat"><IconCalendar /><span>{DAYS[g.match_day]}{g.match_start ? ` · ${g.match_start?.slice(0,5)}` : ''}</span></div>}
                    <div className="stat"><IconUsers2 /><span>Max {g.max_players}</span></div>
                  </div>
                  {g.my_role === 'admin' && <span className="admin-badge"><IconShield /> Admin</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'invites' && (
        <div className="tab-content">
          {invites.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><IconGroup /></div><p>No pending invites</p></div>
          ) : (
            <div className="group-grid">
              {invites.map(g => (
                <div key={g.id} className="group-card invite-card">
                  <div className="group-card-header">
                    <div className="group-avatar"><IconGroup /></div>
                    <div>
                      <h3 className="group-name">{g.name}</h3>
                      <span className="group-meta">by {g.creator_name} · {g.member_count} members</span>
                    </div>
                  </div>
                  {g.description && <p className="group-desc">{g.description}</p>}
                  {g.stadium_name && <div className="stat" style={{ marginBottom: 12 }}><IconStadium /><span>{g.stadium_name}</span></div>}
                  <div className="group-invite-actions">
                    <button className="action-btn success" style={{ flex: 1 }} onClick={() => respondInvite(g.id, 'accept')}>
                      <IconCheck /> Accept
                    </button>
                    <button className="action-btn danger" onClick={() => respondInvite(g.id, 'decline')}>
                      <IconX />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadGroups(); }} />}
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1=details, 2=invite friends
  const [form, setForm] = useState({ name: '', description: '', match_day: '', match_start: '', match_end: '', max_players: '10' });
  const [stadiums, setStadiums] = useState([]);
  const [selectedStadium, setSelectedStadium] = useState('');
  const [friends, setFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdGroupId, setCreatedGroupId] = useState(null);

  useEffect(() => {
    Promise.all([apiCall('/stadiums'), apiCall('/friends')])
      .then(([s, f]) => { setStadiums(s); setFriends(f); })
      .catch(() => {});
  }, []);

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleFriend = (id) => {
    setSelectedFriends(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const createGroup = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const g = await apiCall('/groups', 'POST', {
        name: form.name, description: form.description || null,
        stadium_id: selectedStadium || null,
        match_day: form.match_day !== '' ? parseInt(form.match_day) : null,
        match_start: form.match_start || null, match_end: form.match_end || null,
        max_players: parseInt(form.max_players) || 10,
      });
      setCreatedGroupId(g.id);
      if (friends.length > 0) { setStep(2); }
      else { onCreated(); }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const sendInvites = async () => {
    setLoading(true);
    try {
      await Promise.all([...selectedFriends].map(fid =>
        apiCall(`/groups/${createdGroupId}/invite`, 'POST', { userId: fid })
      ));
    } catch {}
    setLoading(false);
    onCreated();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{step === 1 ? 'Create Group' : 'Invite Friends'}</h2>
            {step === 2 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Select who to invite — you can always invite more later</p>}
          </div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>

        {step === 1 && (
          <form onSubmit={createGroup} className="modal-form">
            <div className="field"><label>Group Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Friday Night FC" required /></div>
            <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handle} placeholder="Tell your friends what this group is about..." rows={2} /></div>
            <div className="field"><label>Stadium <span className="optional">(optional)</span></label>
              <select value={selectedStadium} onChange={e => setSelectedStadium(e.target.value)}>
                <option value="">No stadium selected</option>
                {stadiums.map(s => <option key={s.id} value={s.id}>{s.name} — {[s.city, s.country].filter(Boolean).join(', ')}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="field"><label>Match Day</label>
                <select name="match_day" value={form.match_day} onChange={handle}>
                  <option value="">Any day</option>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="field"><label>Max Players</label><input name="max_players" type="number" min="2" max="50" value={form.max_players} onChange={handle} /></div>
            </div>
            {form.match_day !== '' && (
              <div className="form-row">
                <div className="field"><label>Start Time</label><input name="match_start" type="time" value={form.match_start} onChange={handle} /></div>
                <div className="field"><label>End Time</label><input name="match_end" type="time" value={form.match_end} onChange={handle} /></div>
              </div>
            )}
            {error && <div className="error-msg">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={loading}>
                {loading ? <span className="spinner" /> : friends.length > 0 ? 'Next: Invite Friends →' : 'Create Group'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="modal-form">
            <div className="friend-picker-list">
              {friends.length === 0 && <div className="empty-state"><p>No friends to invite yet</p></div>}
              {friends.map(f => (
                <div
                  key={f.id}
                  className={`friend-picker-item ${selectedFriends.has(f.id) ? 'selected' : ''}`}
                  onClick={() => toggleFriend(f.id)}
                >
                  <Avatar name={f.name} size={38} />
                  <div className="player-info">
                    <span className="player-name">{f.name}</span>
                    {[f.city,f.country].filter(Boolean).join(', ') && <span className="player-meta"><IconMapPin /> {[f.city,f.country].filter(Boolean).join(', ')}</span>}
                  </div>
                  <div className={`friend-check ${selectedFriends.has(f.id) ? 'checked' : ''}`}>
                    {selectedFriends.has(f.id) && <IconCheck />}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => onCreated()}>Skip</button>
              <button className="submit-btn" style={{ flex: 1 }} onClick={sendInvites} disabled={loading}>
                {loading ? <span className="spinner" /> : selectedFriends.size > 0 ? `Invite ${selectedFriends.size} Friend${selectedFriends.size > 1 ? 's' : ''}` : 'Create Without Inviting'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupDetail({ group, user, onBack }) {
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [friends, setFriends] = useState([]);
  const [inviting, setInviting] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const loadDetail = useCallback(async () => {
    try { setDetail(await apiCall(`/groups/${group.id}`)); } catch {}
  }, [group.id]);

  const loadMessages = useCallback(async () => {
    try { setMessages(await apiCall(`/groups/${group.id}/messages`)); } catch {}
  }, [group.id]);

  useEffect(() => {
    loadDetail();
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [loadDetail, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'members') {
      apiCall('/friends').then(setFriends).catch(() => {});
    }
  }, [activeTab]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiCall(`/groups/${group.id}/messages`, 'POST', { content: newMsg });
      setMessages(prev => [...prev, { ...msg, sender_name: user.name }]);
      setNewMsg('');
    } catch {}
    setSending(false);
  };

  const inviteFriend = async (friendId) => {
    setInviting(friendId);
    try { await apiCall(`/groups/${group.id}/invite`, 'POST', { userId: friendId }); }
    catch {} setInviting(null);
  };

  const leaveGroup = async () => {
    if (!window.confirm('Leave this group?')) return;
    try { await apiCall(`/groups/${group.id}/leave`, 'DELETE'); onBack(); } catch {}
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isAdmin = detail?.members?.find(m => m.id === user.id)?.role === 'admin';
  const memberIds = new Set(detail?.members?.map(m => m.id) || []);

  // Use detail for live data, fall back to group prop
  const currentGroup = detail || group;

  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <button className="back-btn" onClick={onBack}><IconArrowLeft /></button>
        <div className="group-avatar sm"><IconGroup /></div>
        <div style={{ flex: 1 }}>
          <h2 className="group-name">{currentGroup.name}</h2>
          <span className="group-meta">{detail?.members?.length || 0} members</span>
        </div>
        {isAdmin && (
          <button className="action-btn primary" style={{ fontSize: 12 }} onClick={() => setShowEdit(true)}>
            <IconEdit /> Edit
          </button>
        )}
        <button className="action-btn danger" style={{ fontSize: 12 }} onClick={leaveGroup}>Leave</button>
      </div>

      {(currentGroup.stadium_name || currentGroup.match_day !== null) && (
        <div className="group-info-bar">
          {currentGroup.stadium_name && <span><IconStadium /> {currentGroup.stadium_name}</span>}
          {currentGroup.match_day !== null && <span><IconCalendar /> {DAYS[currentGroup.match_day]}{currentGroup.match_start ? ` · ${currentGroup.match_start?.slice(0,5)}` : ''}</span>}
          {currentGroup.max_players && <span><IconUsers2 /> Max {currentGroup.max_players}</span>}
        </div>
      )}

      <div className="sub-tabs" style={{ borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        <button className={`sub-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><IconChat /> Chat</button>
        <button className={`sub-tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}><IconUsers /> Members</button>
      </div>

      {activeTab === 'chat' && (
        <div className="group-chat-area">
          <div className="messages-list">
            {messages.length === 0 && <div className="chat-empty-hint">Be the first to say something! 👋</div>}
            {messages.map((m, i) => {
              const isMe = m.sender_id === user.id;
              const showName = !isMe && (i === 0 || messages[i-1]?.sender_id !== m.sender_id);
              return (
                <div key={m.id} className={`message-row ${isMe ? 'me' : 'them'}`}>
                  {!isMe && showName && <Avatar name={m.sender_name} size={28} />}
                  {!isMe && !showName && <div style={{ width: 28 }} />}
                  <div className="message-bubble">
                    {showName && !isMe && <span className="bubble-sender">{m.sender_name}</span>}
                    <p>{m.content}</p>
                    <span className="message-time">{formatTime(m.created_at)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form className="message-input-row" onSubmit={sendMessage}>
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Message the group..." className="message-input" disabled={sending} />
            <button type="submit" className="send-btn" disabled={!newMsg.trim() || sending}>
              {sending ? <span className="spinner sm" /> : <IconSend />}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="tab-content">
          <div className="player-list">
            {(detail?.members || []).map(m => (
              <div key={m.id} className="player-card">
                <Avatar name={m.name} />
                <div className="player-info">
                  <span className="player-name">{m.name}{m.id === user.id ? ' (you)' : ''}</span>
                  {[m.city,m.country].filter(Boolean).join(', ') && <span className="player-meta"><IconMapPin /> {[m.city,m.country].filter(Boolean).join(', ')}</span>}
                </div>
                {m.role === 'admin' && <span className="admin-badge"><IconShield /> Admin</span>}
              </div>
            ))}
          </div>
          {isAdmin && friends.filter(f => !memberIds.has(f.id)).length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 className="section-label">Invite Friends</h3>
              <div className="player-list">
                {friends.filter(f => !memberIds.has(f.id)).map(f => (
                  <div key={f.id} className="player-card">
                    <Avatar name={f.name} />
                    <div className="player-info">
                      <span className="player-name">{f.name}</span>
                      {[f.city,f.country].filter(Boolean).join(', ') && <span className="player-meta"><IconMapPin /> {[f.city,f.country].filter(Boolean).join(', ')}</span>}
                    </div>
                    <button className="action-btn primary" onClick={() => inviteFriend(f.id)} disabled={inviting === f.id}>
                      {inviting === f.id ? <span className="spinner sm" /> : <><IconUserPlus /> Invite</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {showEdit && (
        <EditGroupModal
          group={currentGroup}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadDetail(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  EDIT GROUP MODAL
// ══════════════════════════════════════════════════════════════════
function EditGroupModal({ group, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: group.name || '',
    description: group.description || '',
    match_day: group.match_day !== null && group.match_day !== undefined ? String(group.match_day) : '',
    match_start: group.match_start?.slice(0,5) || '',
    match_end: group.match_end?.slice(0,5) || '',
    max_players: group.max_players || 10,
  });
  const [stadiums, setStadiums] = useState([]);
  const [selectedStadium, setSelectedStadium] = useState(group.stadium_id ? String(group.stadium_id) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('/stadiums').then(setStadiums).catch(() => {});
  }, []);

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await apiCall(`/groups/${group.id}`, 'PUT', {
        name: form.name,
        description: form.description || null,
        stadium_id: selectedStadium || null,
        match_day: form.match_day !== '' ? parseInt(form.match_day) : null,
        match_start: form.match_start || null,
        match_end: form.match_end || null,
        max_players: parseInt(form.max_players) || 10,
      });
      onSaved();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Edit Group</h2>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field"><label>Group Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Friday Night FC" required /></div>
          <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handle} placeholder="What's this group about?" rows={2} /></div>
          <div className="field"><label>Stadium <span className="optional">(optional)</span></label>
            <select value={selectedStadium} onChange={e => setSelectedStadium(e.target.value)}>
              <option value="">No stadium selected</option>
              {stadiums.map(s => <option key={s.id} value={s.id}>{s.name} — {[s.city, s.country].filter(Boolean).join(', ')}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="field"><label>Match Day</label>
              <select name="match_day" value={form.match_day} onChange={handle}>
                <option value="">Any day</option>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="field"><label>Max Players</label>
              <input name="max_players" type="number" min="2" max="50" value={form.max_players} onChange={handle} />
            </div>
          </div>
          {form.match_day !== '' && (
            <div className="form-row">
              <div className="field"><label>Start Time</label><input name="match_start" type="time" value={form.match_start} onChange={handle} /></div>
              <div className="field"><label>End Time</label><input name="match_end" type="time" value={form.match_end} onChange={handle} /></div>
            </div>
          )}
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  DELETE ACCOUNT MODAL
// ══════════════════════════════════════════════════════════════════
function DeleteAccountModal({ onClose, onDeleted }) {
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirm !== 'DELETE') { setError('Type DELETE to confirm'); return; }
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');
      localStorage.removeItem('token');
      onDeleted();
    } catch (err) { setError(err.message); setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: '#f87171' }}>Delete Account</h2>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          <div className="delete-account-warning">
            <p className="delete-warning-title">⚠️ This action is permanent and cannot be undone.</p>
            <p className="delete-warning-body">Deleting your account will permanently remove:</p>
            <ul className="delete-warning-list">
              <li>Your profile and all personal data</li>
              <li>All your bookings and messages</li>
              <li>Your friend connections</li>
              <li>Your group memberships and chats</li>
              <li>All your stadiums and their schedules</li>
            </ul>
          </div>
          <div className="field">
            <label>Type <strong style={{ color: '#f87171', fontFamily: 'monospace' }}>DELETE</strong> to confirm</label>
            <input
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="DELETE"
              style={{ borderColor: confirm === 'DELETE' ? 'rgba(248,113,113,0.5)' : undefined }}
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="submit-btn"
              style={{ flex: 1, background: confirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.3)', color: '#fff' }}
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : <><IconTrash /> Delete My Account</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePage({ user, onLogout }) {
  const isOwner = user.userType==="stadium_owner";
  const [page, setPage] = useState("home");
  const [chatPartner, setChatPartner] = useState(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  const openChat = (partner) => {
    setChatPartner(partner);
    setPage("chat");
  };

  // Poll unread count
  useEffect(() => {
    const fetchCount = async () => {
      try { const d = await apiCall('/notifications/unread-count'); setUnreadNotifs(d.count); } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close notif panel on outside click
  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="home-root">
      <nav className="navbar">
        <div className="nav-logo">
          <svg viewBox="0 0 40 40" width="28" height="28"><circle cx="20" cy="20" r="18" fill="none" stroke="#4ade80" strokeWidth="2"/><path d="M20 4a16 16 0 0 1 10.7 27.5M20 4a16 16 0 0 0-10.7 27.5M20 36V20M9.3 11l10.7 8 10.7-8" stroke="#4ade80" strokeWidth="2" fill="none"/></svg>
          <span>KickOff</span>
        </div>
        <div className="nav-links">
          <button className={`nav-link ${page==="home"?"active":""}`} onClick={()=>setPage("home")}><IconHome/><span>Home</span></button>
          <button className={`nav-link ${page==="stadiums"?"active":""}`} onClick={()=>setPage("stadiums")}><IconStadium/><span>{isOwner?"My Stadiums":"Stadiums"}</span></button>
          {!isOwner&&<button className={`nav-link ${page==="bookings"?"active":""}`} onClick={()=>setPage("bookings")}><IconBookmark/><span>My Bookings</span></button>}
          {!isOwner&&<button className={`nav-link ${page==="players"?"active":""}`} onClick={()=>setPage("players")}><IconUsers/><span>Players</span></button>}
          <button className={`nav-link ${page==="chat"?"active":""}`} onClick={()=>{ setChatPartner(null); setPage("chat"); }}><IconChat/><span>Chat</span></button>
          {!isOwner&&<button className={`nav-link ${page==="groups"?"active":""}`} onClick={()=>setPage("groups")}><IconGroup/><span>Groups</span></button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button className={`nav-notif-btn ${showNotifs ? 'active' : ''}`} onClick={() => setShowNotifs(!showNotifs)}>
              <IconBell filled={unreadNotifs > 0} />
              {unreadNotifs > 0 && <span className="notif-badge">{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>}
            </button>
            {showNotifs && (
              <NotificationsPanel
                onClose={() => setShowNotifs(false)}
                onUnreadChange={setUnreadNotifs}
              />
            )}
          </div>
          <button className="logout-btn" onClick={onLogout}><IconLogout /> Sign out</button>
        </div>
      </nav>
      {page==="home"&&(
        <div className="home-content">
          <div className="welcome-card">
            <div className={`user-badge ${isOwner?"owner":"player"}`}>{isOwner?<IconStadium/>:<IconBall/>}<span>{isOwner?"Stadium Owner":"Player"}</span></div>
            <h1 className="welcome-title">Hello, <span className="name-highlight">{user.name}</span> 👋</h1>
            <p className="welcome-sub">{isOwner?"Manage your stadiums, set schedules, and handle bookings.":"Browse stadiums, chat with friends, and organize your next match."}</p>
            <div className="info-chips">
              <div className="chip"><span className="chip-label">Account Type</span><span className="chip-value">{isOwner?"Stadium Owner":"Player"}</span></div>
              <div className="chip"><span className="chip-label">Email</span><span className="chip-value">{user.email}</span></div>
              {user.city&&<div className="chip"><span className="chip-label">City</span><span className="chip-value">{user.city}</span></div>}{user.country&&<div className="chip"><span className="chip-label">Country</span><span className="chip-value">{user.country}</span></div>}
            </div>
            <div className="home-quick-actions">
              <button className="cta-btn" onClick={()=>setPage("stadiums")}><IconStadium/>{isOwner?"Manage Stadiums":"Browse Stadiums"}</button>
              {!isOwner&&<button className="cta-btn secondary" onClick={()=>setPage("groups")}><IconGroup/> My Groups</button>}
              {!isOwner&&<button className="cta-btn secondary" onClick={()=>setPage("chat")}><IconChat/> Messages</button>}
            </div>
            <div className="danger-zone">
              <button className="delete-account-btn" onClick={()=>setShowDeleteAccount(true)}>
                <IconTrash /> Delete My Account
              </button>
            </div>
          </div>
        </div>
      )}
      {page==="stadiums"&&<div className="page-content">{isOwner?<OwnerStadiumsPage/>:<BrowseStadiumsPage onMessageOwner={openChat}/>}</div>}
      {page==="bookings"&&!isOwner&&<div className="page-content"><MyBookingsPage/></div>}
      {page==="players"&&!isOwner&&<div className="page-content"><div className="page-header"><h2 className="page-title">Players</h2><p className="page-sub">Search and connect with other players</p></div><PlayersPage user={user}/></div>}
      {page==="chat"&&<div className="page-content"><ChatPage user={user} initialPartner={chatPartner}/></div>}
      {page==="groups"&&!isOwner&&<div className="page-content"><GroupsPage user={user}/></div>}
      {showDeleteAccount&&<DeleteAccountModal onClose={()=>setShowDeleteAccount(false)} onDeleted={onLogout}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  ROOT
// ══════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(()=>{
    const token = localStorage.getItem("token");
    if(token){ apiCall("/auth/me").then(setUser).catch(()=>localStorage.removeItem("token")).finally(()=>setChecking(false)); }
    else setChecking(false);
  },[]);

  if(checking) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0a0f0a"}}><div className="spinner large"/></div>;
  return user?<HomePage user={user} onLogout={()=>{localStorage.removeItem("token");setUser(null);}}/>:<AuthPage onLogin={setUser}/>;
}
