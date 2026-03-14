import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
function ScheduleBuilder({ stadiumId, onClose }) {
  const [slots, setSlots] = useState({0:[],1:[],2:[],3:[],4:[],5:[],6:[]});
  const [activeDay, setActiveDay] = useState(1);
  const [addStart, setAddStart] = useState("08:00");
  const [addEnd, setAddEnd] = useState("09:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasDefault, setHasDefault] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [resettingDay, setResettingDay] = useState(null);

  const TIME_OPTIONS = [];
  for (let h = 6; h <= 24; h++) TIME_OPTIONS.push(`${String(h).padStart(2,"0")}:00`);

  useEffect(() => {
    Promise.all([
      apiCall(`/stadiums/${stadiumId}/schedule`),
      apiCall(`/stadiums/${stadiumId}/default-schedule`)
    ]).then(([data, def]) => {
      const s = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
      data.forEach(row => {
        const d = row.day_of_week;
        s[d] = [...(s[d]||[]), { slot_start:row.slot_start.slice(0,5), slot_end:row.slot_end.slice(0,5) }];
      });
      setSlots(s);
      setHasDefault(def.length > 0);
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

  const saveAsDefault = async () => {
    setSavingDefault(true); setError("");
    try {
      const allSlots = [];
      for(let d=0;d<7;d++) (slots[d]||[]).forEach(s=>allSlots.push({day_of_week:d,slot_start:s.slot_start,slot_end:s.slot_end}));
      await apiCall(`/stadiums/${stadiumId}/default-schedule`,"PUT",{slots:allSlots});
      setHasDefault(true);
      alert("✅ Current schedule saved as default template!");
    } catch(err){ setError(err.message); }
    finally{ setSavingDefault(false); }
  };

  const resetDay = async (day) => {
    if (!hasDefault) { alert("No default template saved yet. First set up a schedule, then click 'Save as Default'."); return; }
    if (!window.confirm(`Reset ${DAYS[day]} to the default template? This will remove all current slots for ${DAYS[day]} and restore the saved default.`)) return;
    setResettingDay(day);
    try {
      await apiCall(`/stadiums/${stadiumId}/reset-schedule`, "POST", { day: Number(day) });
      const data = await apiCall(`/stadiums/${stadiumId}/schedule`);
      const s = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
      data.forEach(row => { const d=row.day_of_week; s[d]=[...(s[d]||[]),{slot_start:row.slot_start.slice(0,5),slot_end:row.slot_end.slice(0,5)}]; });
      setSlots(s);
    } catch(err){ setError(err.message); }
    finally{ setResettingDay(null); }
  };

  const resetAllDays = async () => {
    if (!hasDefault) { alert("No default template saved yet."); return; }
    if (!window.confirm("Reset ALL days to the default template? All current slots will be replaced.")) return;
    setResettingDay('all');
    try {
      await apiCall(`/stadiums/${stadiumId}/reset-schedule`,"POST",{});
      const data = await apiCall(`/stadiums/${stadiumId}/schedule`);
      const s = {0:[],1:[],2:[],3:[],4:[],5:[],6:[]};
      data.forEach(row => { const d=row.day_of_week; s[d]=[...(s[d]||[]),{slot_start:row.slot_start.slice(0,5),slot_end:row.slot_end.slice(0,5)}]; });
      setSlots(s);
    } catch(err){ setError(err.message); }
    finally{ setResettingDay(null); }
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
        <div className="modal-footer" style={{flexDirection:'column',gap:8}}>
          <div style={{display:'flex',gap:8,width:'100%'}}>
            <button className="btn-secondary" onClick={()=>onClose(false)}>Cancel</button>
            <button className="submit-btn" style={{flex:1}} onClick={save} disabled={saving}>{saving?<span className="spinner"/>:"Save Schedule"}</button>
          </div>
          <div style={{display:'flex',gap:8,width:'100%'}}>
            <button
              onClick={saveAsDefault} disabled={savingDefault}
              style={{flex:1,padding:'9px 14px',background:'rgba(250,204,21,0.08)',border:'1px solid rgba(250,204,21,0.3)',color:'#facc15',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}
              title="Save current schedule as reusable default template"
            >
              {savingDefault?<span className="spinner sm"/>:'⭐'} Save as Default Template
            </button>
            <button
              onClick={resetAllDays} disabled={!hasDefault || resettingDay==='all'}
              style={{flex:1,padding:'9px 14px',background:'rgba(250,204,21,0.05)',border:'1px solid rgba(250,204,21,0.2)',color:hasDefault?'#facc15':'var(--text-muted)',borderRadius:10,cursor:hasDefault?'pointer':'not-allowed',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:6,opacity:hasDefault?1:0.45}}
              title={hasDefault?"Reset all days to default template":"No default saved yet"}
            >
              {resettingDay==='all'?<span className="spinner sm"/>:'↺'} Reset All to Default
            </button>
          </div>
          {hasDefault && <div style={{fontSize:11,color:'var(--text-muted)',textAlign:'center'}}>⭐ Default template saved — use Reset buttons to restore any day</div>}
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
    image_url: stadium.image_url||null,
  } : {...EMPTY_FORM, image_url: null});
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
          {/* Stadium photo */}
          <div className="field">
            <label>Stadium Photo</label>
            <div style={{display:'flex',alignItems:'flex-start',gap:16}}>
              <ImagePicker
                value={form.image_url}
                onChange={v => setForm({...form, image_url: v})}
                width={120} height={80} round={false}
                label="Add Photo"
              />
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                <div className="field" style={{margin:0}}><label>Stadium Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Green Arena" required/></div>
                <div className="form-row" style={{margin:0}}>
                  <div className="field" style={{margin:0}}><label>City *</label><input name="city" value={form.city} onChange={handle} placeholder="Madrid" required/></div>
                  <div className="field" style={{margin:0}}><label>Country *</label><input name="country" value={form.country} onChange={handle} placeholder="Spain" required/></div>
                </div>
              </div>
            </div>
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
  const [slotsData, setSlotsData] = useState({ slots:[], bookings:[], pending:[] });
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
    catch { setSlotsData({ slots:[], bookings:[], pending:[] }); }
    setLoadingSlots(false);
  }, [stadium.id]);

  useEffect(() => { loadSlots(selectedDay); }, [selectedDay, loadSlots]);

  // Free windows only subtract CONFIRMED bookings — pending don't block
  const freeWindows = computeFreeWindows(slotsData.slots, slotsData.bookings);
  const startOptions = validStartTimes(freeWindows);
  const endOptions = bookedStart ? validEndTimes(toMin(bookedStart), freeWindows) : [];

  // Count how many pending requests touch each free window (info only)
  const pendingCount = (slotsData.pending || []).length;

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
                    {pendingCount > 0 && (
                      <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#facc15',marginTop:4,padding:'5px 10px',background:'rgba(250,204,21,0.07)',border:'1px solid rgba(250,204,21,0.18)',borderRadius:8}}>
                        <span>⏳</span>
                        <span>{pendingCount} pending request{pendingCount>1?'s':''} awaiting owner approval — slot still bookable</span>
                      </div>
                    )}
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
    try {
      const result = await apiCall(`/bookings/${id}/status`, "PATCH", { status });
      await load();
      if (result._warning) {
        setTimeout(() => alert(`⚠️ ${result._warning}`), 100);
      }
    } catch {}
    setActionLoading(null);
  };

  const deleteBooking = async (id) => {
    if (!window.confirm('Remove this booking from the list? This cannot be undone.')) return;
    setActionLoading(`del-${id}`);
    try { await apiCall(`/bookings/${id}`, 'DELETE'); await load(); } catch {}
    setActionLoading(null);
  };

  const filtered = bookings.filter(b=>
    (filterDay==="all"||b.day_of_week===parseInt(filterDay)) &&
    (filterStatus==="all"||b.status===filterStatus)
  );

  // Find which pending bookings overlap each other — map id → list of conflicting player names+times
  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const overlapMap = new Map(); // id → [{ name, time }]
  for (let i = 0; i < pendingBookings.length; i++) {
    for (let j = i + 1; j < pendingBookings.length; j++) {
      const a = pendingBookings[i], b2 = pendingBookings[j];
      if (a.day_of_week === b2.day_of_week &&
          toMin(a.booked_start) < toMin(b2.booked_end) &&
          toMin(a.booked_end) > toMin(b2.booked_start)) {
        if (!overlapMap.has(a.id)) overlapMap.set(a.id, []);
        if (!overlapMap.has(b2.id)) overlapMap.set(b2.id, []);
        overlapMap.get(a.id).push({ name: b2.player_name, time: `${b2.booked_start?.slice(0,5)}–${b2.booked_end?.slice(0,5)}` });
        overlapMap.get(b2.id).push({ name: a.player_name, time: `${a.booked_start?.slice(0,5)}–${a.booked_end?.slice(0,5)}` });
      }
    }
  }
  const overlappingIds = new Set(overlapMap.keys());

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

      {!loading && overlappingIds.size > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'rgba(250,204,21,0.10)',border:'1px solid rgba(250,204,21,0.35)',borderRadius:12,marginBottom:12,color:'#facc15',fontWeight:600,fontSize:13}}>
          <span style={{fontSize:18}}>⚠️</span>
          <span>{overlappingIds.size} pending booking{overlappingIds.size>1?'s':''} overlap each other — review carefully before confirming. Confirming one will auto-cancel the others.</span>
        </div>
      )}

      <div className="booking-list">
        {filtered.map(b=>{
          const conflicts = overlapMap.get(b.id) || [];
          const hasConflict = conflicts.length > 0;
          return (
          <div key={b.id} style={{display:'flex',flexDirection:'column',gap:0}}>
            {hasConflict && (
              <div className="overlap-flag" style={{borderBottomLeftRadius:0,borderBottomRightRadius:0,marginBottom:0,borderBottom:'none',display:'flex',alignItems:'flex-start',gap:8,flexWrap:'wrap'}}>
                <span style={{flexShrink:0}}>⚠️ Conflicts with:</span>
                {conflicts.map((c,ci) => (
                  <span key={ci} style={{background:'rgba(250,204,21,0.15)',border:'1px solid rgba(250,204,21,0.35)',borderRadius:6,padding:'1px 8px',fontSize:12,whiteSpace:'nowrap'}}>
                    {c.name} · {c.time}
                  </span>
                ))}
                <span style={{fontSize:12,opacity:0.75,marginLeft:'auto'}}>Confirming this will auto-cancel the others</span>
              </div>
            )}
            <div className={`booking-card owner${hasConflict ? ' overlap-warning' : ''}`} style={hasConflict?{borderTopLeftRadius:0,borderTopRightRadius:0}:{}}>
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
              <button
                className="action-btn danger"
                onClick={() => deleteBooking(b.id)}
                disabled={actionLoading===`del-${b.id}`}
                title="Remove from list"
                style={{marginTop:6,fontSize:11,padding:'4px 10px',opacity:0.6}}
              >
                {actionLoading===`del-${b.id}` ? <span className="spinner sm"/> : <><IconTrash/> Remove</>}
              </button>
            </div>
          </div>
          </div>
        );})}
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
      {stadium.image_url && (
        <div className="stadium-card-img">
          <img src={stadium.image_url} alt={stadium.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          <div className="stadium-card-img-overlay"/>
          <div className={`stadium-status-badge ${stadium.is_active?"active":"inactive"}`} style={{position:'absolute',top:10,right:10}}>{stadium.is_active?"Active":"Inactive"}</div>
        </div>
      )}
      <div className="stadium-card-header">
        <div className="stadium-surface-dot" style={{background:color}}/>
        <div className="stadium-card-info">
          <h3 className="stadium-card-name">{stadium.name}</h3>
          <span className="stadium-card-meta"><IconMapPin/> {[stadium.city, stadium.country].filter(Boolean).join(', ')}</span>
        </div>
        {!stadium.image_url && <div className={`stadium-status-badge ${stadium.is_active?"active":"inactive"}`}>{stadium.is_active?"Active":"Inactive"}</div>}
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
              {s.image_url && (
                <div className="stadium-card-img">
                  <img src={s.image_url} alt={s.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                  <div className="stadium-card-img-overlay"/>
                  <span className="surface-tag" style={{ color, borderColor:`${color}40`, background:`${color}20`, fontSize:11, position:'absolute', bottom:8, left:8 }}>{SURFACES[s.surface]}</span>
                </div>
              )}
              <div className="stadium-card-header">
                <div className="stadium-surface-dot" style={{ background: color }}/>
                <div className="stadium-card-info">
                  <h3 className="stadium-card-name">{s.name}</h3>
                  <span className="stadium-card-meta"><IconMapPin/> {[s.city, s.country].filter(Boolean).join(', ')}</span>
                </div>
                {!s.image_url && <span className="surface-tag" style={{ color, borderColor: `${color}40`, background: `${color}10`, fontSize: 11 }}>{SURFACES[s.surface]}</span>}
              </div>
              {s.description && <p className="stadium-card-desc">{s.description}</p>}
              <div className="stadium-card-stats">
                <div className="stat"><IconDollar/><span>₪{Number(s.price_per_hour).toLocaleString()}/hr</span></div>
                {s.capacity && <div className="stat"><IconUsers2/><span>{s.capacity} players</span></div>}
                <div className="stat"><IconClock/><span>{s.open_time?.slice(0,5)} – {s.close_time?.slice(0,5)}</span></div>
                {s.phone && <div className="stat"><IconPhone/><span>{s.phone}</span></div>}
              </div>
              <div className="browse-owner"><Avatar name={s.owner_name} src={s.owner_avatar} size={22}/><span>by {s.owner_name}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="book-btn" style={{ flex: 1 }} onClick={() => setBookingStadium(s)}><IconCalendar/> Book a Slot</button>
                <button className="book-btn" style={{ flex: 1, background: 'rgba(74,222,128,0.08)', color: 'var(--primary)', border: '1px solid rgba(74,222,128,0.25)' }}
                  onClick={() => onMessageOwner && onMessageOwner({ partner_id: s.owner_id, partner_name: s.owner_name, partner_avatar: s.owner_avatar || null, partner_role: 'Stadium Owner' })}>
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

export { ScheduleBuilder, StadiumModal, BookSlotModal, BookingsPanel, StadiumCard, OwnerStadiumsPage, BrowseStadiumsPage };
