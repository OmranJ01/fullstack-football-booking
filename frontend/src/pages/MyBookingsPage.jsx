import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
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


export default MyBookingsPage;
