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
  const [form, setForm] = useState({ name:"", email:"", password:"", userType:"player", location:"" });
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
            <div className="field">
              <label>I am a...</label>
              <div className="type-selector">
                <button type="button" className={`type-btn ${form.userType==="player"?"selected":""}`} onClick={()=>setForm({...form,userType:"player"})}><span className="type-icon"><IconBall/></span><span className="type-label">Player</span><span className="type-desc">Find & book matches</span></button>
                <button type="button" className={`type-btn ${form.userType==="stadium_owner"?"selected":""}`} onClick={()=>setForm({...form,userType:"stadium_owner"})}><span className="type-icon"><IconStadium/></span><span className="type-label">Stadium Owner</span><span className="type-desc">Manage your venue</span></button>
              </div>
            </div>
            <div className="field"><label>Location <span className="optional">(optional)</span></label><input name="location" value={form.location} onChange={handle} placeholder="Tel Aviv"/></div>
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
const EMPTY_FORM = {name:"",location:"",description:"",price_per_hour:"",capacity:"",surface:"grass",phone:"",open_time:"08:00",close_time:"22:00"};

function StadiumModal({ stadium, onClose, onSave }) {
  const [form, setForm] = useState(stadium ? {
    name:stadium.name, location:stadium.location, description:stadium.description||"",
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
          <div className="form-row">
            <div className="field"><label>Stadium Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Green Arena" required/></div>
            <div className="field"><label>Location *</label><input name="location" value={form.location} onChange={handle} placeholder="Tel Aviv" required/></div>
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
          <span className="stadium-card-meta"><IconMapPin/> {stadium.location}</span>
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
function BrowseStadiumsPage() {
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [filterSlot, setFilterSlot] = useState("");
  const [bookingStadium, setBookingStadium] = useState(null);
  const debounceRef = useRef(null);

  const TIME_OPTIONS = [];
  for (let h = 6; h < 24; h++) TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:00`);

  const load = useCallback(async (q,day,slot) => {
    setLoading(true);
    try {
      let url = `/stadiums?q=${encodeURIComponent(q||"")}`;
      if(day!=="") url+=`&day=${day}`;
      if(day!==""&&slot) { const end=`${String(parseInt(slot)+1).padStart(2,"0")}:00`; url+=`&slot_start=${slot}&slot_end=${end}`; }
      setStadiums(await apiCall(url));
    } catch {}
    setLoading(false);
  },[]);

  useEffect(()=>{
    clearTimeout(debounceRef.current);
    debounceRef.current=setTimeout(()=>load(query,filterDay,filterSlot),350);
  },[query,filterDay,filterSlot,load]);

  const hasFilters = filterDay!=="";

  return (
    <div className="stadiums-page">
      <div className="stadiums-header">
        <div><h2 className="page-title">Stadiums</h2><p className="page-sub">Browse and book available stadiums</p></div>
      </div>
      <div className="browse-filters">
        <div className="search-bar" style={{flex:2}}>
          <span className="search-icon"><IconSearch/></span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name or location..."/>
        </div>
        <div className="filter-group">
          <span className="filter-label"><IconFilter/></span>
          <select value={filterDay} onChange={e=>{setFilterDay(e.target.value);setFilterSlot("");}} className="filter-select">
            <option value="">Any Day</option>
            {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          {filterDay!==""&&(
            <select value={filterSlot} onChange={e=>setFilterSlot(e.target.value)} className="filter-select">
              <option value="">Any Time</option>
              {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {hasFilters&&<button className="clear-filters" onClick={()=>{setFilterDay("");setFilterSlot("");}}>✕ Clear</button>}
        </div>
      </div>
      {loading&&<div className="center-spinner" style={{padding:40}}><span className="spinner large"/></div>}
      {!loading&&stadiums.length===0&&<div className="empty-state"><div className="empty-icon"><IconStadium/></div><p>{hasFilters?"No stadiums match your filters":"No stadiums available yet"}</p></div>}
      <div className="stadium-grid">
        {stadiums.map(s=>{
          const color=SURFACE_COLOR[s.surface]||"#4ade80";
          return (
            <div key={s.id} className="stadium-card browse">
              <div className="stadium-card-header">
                <div className="stadium-surface-dot" style={{background:color}}/>
                <div className="stadium-card-info">
                  <h3 className="stadium-card-name">{s.name}</h3>
                  <span className="stadium-card-meta"><IconMapPin/> {s.location}</span>
                </div>
                <span className="surface-tag" style={{color,borderColor:`${color}40`,background:`${color}10`,fontSize:11}}>{SURFACES[s.surface]}</span>
              </div>
              {s.description&&<p className="stadium-card-desc">{s.description}</p>}
              <div className="stadium-card-stats">
                <div className="stat"><IconDollar/><span>₪{Number(s.price_per_hour).toLocaleString()}/hr</span></div>
                {s.capacity&&<div className="stat"><IconUsers2/><span>{s.capacity} players</span></div>}
                <div className="stat"><IconClock/><span>{s.open_time?.slice(0,5)} – {s.close_time?.slice(0,5)}</span></div>
                {s.phone&&<div className="stat"><IconPhone/><span>{s.phone}</span></div>}
              </div>
              <div className="browse-owner"><Avatar name={s.owner_name} size={22}/><span>by {s.owner_name}</span></div>
              <button className="book-btn" onClick={()=>setBookingStadium(s)}><IconCalendar/> Book a Slot</button>
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
              <div className="booking-meta"><IconMapPin/> {b.stadium_location}</div>
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
function PlayerCard({ player, currentUserId, onAction, actionLoading }) {
  const { id, name, location, friendship_status, friendship_requester } = player;
  const isFriend = friendship_status==="accepted";
  const isPendingFromMe = friendship_status==="pending"&&Number(friendship_requester)===currentUserId;
  const isPendingToMe = friendship_status==="pending"&&Number(friendship_requester)!==currentUserId;
  return (
    <div className="player-card">
      <Avatar name={name}/>
      <div className="player-info">
        <span className="player-name">{name}</span>
        {location&&<span className="player-meta"><IconMapPin/> {location}</span>}
      </div>
      <div className="player-actions">
        {isFriend&&(<><span className="friend-badge">Friends</span><button className="action-btn danger" onClick={()=>onAction("remove",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<IconUserMinus/>}</button></>)}
        {isPendingFromMe&&(<button className="action-btn muted" onClick={()=>onAction("cancel",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><span>Pending</span><IconX/></>}</button>)}
        {isPendingToMe&&(<><button className="action-btn success" onClick={()=>onAction("accept",id,String(friendship_requester))} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><IconCheck/><span>Accept</span></>}</button><button className="action-btn danger-sm" onClick={()=>onAction("decline",id,String(friendship_requester))} disabled={actionLoading===id}><IconX/></button></>)}
        {!friendship_status&&(<button className="action-btn primary" onClick={()=>onAction("add",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><IconUserPlus/><span>Add</span></>}</button>)}
      </div>
    </div>
  );
}

function PlayersPage({ user }) {
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const debounceRef = useRef(null);

  const loadFriends = useCallback(async()=>{
    try{ const [f,inc,out]=await Promise.all([apiCall("/friends"),apiCall("/friends/requests/incoming"),apiCall("/friends/requests/outgoing")]); setFriends(f);setIncoming(inc);setOutgoing(out); }catch{}
  },[]);
  useEffect(()=>{loadFriends();},[loadFriends]);

  useEffect(()=>{
    clearTimeout(debounceRef.current);
    if(!query.trim()){setSearchResults([]);return;}
    debounceRef.current=setTimeout(async()=>{
      setSearching(true);
      try{setSearchResults(await apiCall(`/players/search?q=${encodeURIComponent(query)}`));}catch{}
      setSearching(false);
    },350);
  },[query]);

  const handleAction = async(action,targetId,requesterId)=>{
    setActionLoading(targetId);
    try{
      if(action==="add") await apiCall("/friends/request","POST",{addresseeId:targetId});
      else if(action==="cancel"||action==="remove") await apiCall(`/friends/${targetId}`,"DELETE");
      else if(action==="accept") await apiCall(`/friends/${requesterId}/respond`,"PATCH",{action:"accept"});
      else if(action==="decline") await apiCall(`/friends/${requesterId}/respond`,"PATCH",{action:"decline"});
      await loadFriends();
      if(query.trim()) setSearchResults(await apiCall(`/players/search?q=${encodeURIComponent(query)}`));
    }catch(err){console.error(err);}
    setActionLoading(null);
  };

  return (
    <div className="players-page">
      <div className="sub-tabs">
        <button className={`sub-tab ${tab==="search"?"active":""}`} onClick={()=>setTab("search")}><IconSearch/> Search Players</button>
        <button className={`sub-tab ${tab==="friends"?"active":""}`} onClick={()=>setTab("friends")}><IconUsers/> Friends{friends.length>0&&<span className="count-badge neutral">{friends.length}</span>}</button>
        <button className={`sub-tab ${tab==="requests"?"active":""}`} onClick={()=>setTab("requests")}>Requests{incoming.length>0&&<span className="count-badge green">{incoming.length}</span>}</button>
      </div>
      {tab==="search"&&(<div className="tab-content">
        <div className="search-bar"><span className="search-icon"><IconSearch/></span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name or city..." autoFocus/>{searching&&<span className="spinner sm" style={{position:"absolute",right:14}}/>}</div>
        {!query.trim()&&<div className="empty-state"><div className="empty-icon"><IconSearch/></div><p>Search for players by name or location</p></div>}
        {query.trim()&&!searching&&searchResults.length===0&&<div className="empty-state"><div className="empty-icon"><IconUsers/></div><p>No players found for "<strong>{query}</strong>"</p></div>}
        <div className="player-list">{searchResults.map(p=><PlayerCard key={p.id} player={p} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div>
      </div>)}
      {tab==="friends"&&(<div className="tab-content">{friends.length===0?<div className="empty-state"><div className="empty-icon"><IconUsers/></div><p>No friends yet!</p></div>:<div className="player-list">{friends.map(f=><PlayerCard key={f.id} player={{...f,friendship_status:"accepted"}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div>}</div>)}
      {tab==="requests"&&(<div className="tab-content">
        {incoming.length>0&&<div className="requests-section"><h3 className="section-label">Incoming <span className="count-badge green">{incoming.length}</span></h3><div className="player-list">{incoming.map(p=><PlayerCard key={p.id} player={{...p,friendship_status:"pending",friendship_requester:p.id}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div></div>}
        {outgoing.length>0&&<div className="requests-section"><h3 className="section-label">Sent</h3><div className="player-list">{outgoing.map(p=><PlayerCard key={p.id} player={{...p,friendship_status:"pending",friendship_requester:user.id}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div></div>}
        {incoming.length===0&&outgoing.length===0&&<div className="empty-state"><div className="empty-icon"><IconClock/></div><p>No pending requests</p></div>}
      </div>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  HOME PAGE
// ══════════════════════════════════════════════════════════════════
function HomePage({ user, onLogout }) {
  const isOwner = user.userType==="stadium_owner";
  const [page, setPage] = useState("home");

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
        </div>
        <button className="logout-btn" onClick={onLogout}><IconLogout/> Sign out</button>
      </nav>
      {page==="home"&&(
        <div className="home-content">
          <div className="welcome-card">
            <div className={`user-badge ${isOwner?"owner":"player"}`}>{isOwner?<IconStadium/>:<IconBall/>}<span>{isOwner?"Stadium Owner":"Player"}</span></div>
            <h1 className="welcome-title">Hello, <span className="name-highlight">{user.name}</span> 👋</h1>
            <p className="welcome-sub">{isOwner?"Manage your stadiums, set schedules, and handle bookings.":"Browse stadiums, filter by day & time, and book your next match."}</p>
            <div className="info-chips">
              <div className="chip"><span className="chip-label">Account Type</span><span className="chip-value">{isOwner?"Stadium Owner":"Player"}</span></div>
              <div className="chip"><span className="chip-label">Email</span><span className="chip-value">{user.email}</span></div>
              {user.location&&<div className="chip"><span className="chip-label">Location</span><span className="chip-value">{user.location}</span></div>}
            </div>
            <div className="home-quick-actions">
              <button className="cta-btn" onClick={()=>setPage("stadiums")}><IconStadium/>{isOwner?"Manage Stadiums":"Browse Stadiums"}</button>
              {!isOwner&&<button className="cta-btn secondary" onClick={()=>setPage("bookings")}><IconBookmark/> My Bookings</button>}
            </div>
            <div className="coming-soon"><div className="cs-dot"/><span>Match creation & chat coming soon!</span></div>
          </div>
        </div>
      )}
      {page==="stadiums"&&<div className="page-content">{isOwner?<OwnerStadiumsPage/>:<BrowseStadiumsPage/>}</div>}
      {page==="bookings"&&!isOwner&&<div className="page-content"><MyBookingsPage/></div>}
      {page==="players"&&!isOwner&&<div className="page-content"><div className="page-header"><h2 className="page-title">Players</h2><p className="page-sub">Search and connect with other players</p></div><PlayersPage user={user}/></div>}
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
