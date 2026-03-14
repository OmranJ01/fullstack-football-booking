import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "./utils";
import AuthPage from "./pages/AuthPage";
import { OwnerStadiumsPage, BrowseStadiumsPage } from "./pages/StadiumsPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import PlayersPage from "./pages/PlayersPage";
import NotificationsPanel from "./pages/NotificationsPanel";
import { ChatPage } from "./pages/ChatPage";
import { GroupsPage } from "./pages/GroupsPage";
import { SettingsPage, DeleteAccountModal } from "./pages/SettingsPage";


function HomePage({ user, onAvatarChange, onLogout }) {
  const isOwner = user.userType==="stadium_owner";
  const [page, setPage] = useState("home");
  const [chatPartner, setChatPartner] = useState(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);
  // Pass user update down to SettingsPage

  const handleAvatarChange = (update) => onAvatarChange(update);

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
          <button className={`nav-link ${page==="settings"?"active":""}`} onClick={()=>setPage("settings")}><IconSettings/><span>Settings</span></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          {/* Avatar in navbar → Settings */}

          <div onClick={()=>setPage('settings')} style={{cursor:'pointer'}} title="Settings">
            <Avatar name={user.name} src={user.avatarUrl} size={34}/>
          </div>
          <button className="logout-btn" onClick={onLogout}><IconLogout /> Sign out</button>
        </div>
      </nav>

      {page==="home"&&(
        <div className="dashboard">

          <div className="dash-hero">
            <div className="dash-hero-left">
              <div className="dash-hero-avatar" onClick={()=>setPage('settings')} title="Settings">
                <Avatar name={user.name} src={user.avatarUrl} size={64}/>
              </div>
              <div>
                <div className={`user-badge ${isOwner?"owner":"player"}`}>{isOwner?<IconStadium/>:<IconBall/>}<span>{isOwner?"Stadium Owner":"Player"}</span></div>
                <h1 className="dash-greeting">Welcome back, <span className="name-highlight">{user.name.split(' ')[0]}</span></h1>
                <p className="dash-sub">{isOwner?"Your dashboard — manage venues, schedules & bookings.":"Find stadiums, connect with players, organise your next match."}</p>
              </div>
            </div>

            <div className="dash-hero-meta">
              {user.city&&<span className="dash-meta-chip"><IconMapPin/>{user.city}{user.country?`, ${user.country}`:''}</span>}
              <span className="dash-meta-chip" style={{fontSize:12,opacity:0.65}}>{user.email}</span>
            </div>
          </div>

          <div className="dash-actions-grid">
            <button className="dash-action-card primary" onClick={()=>setPage("stadiums")}>
              <div className="dac-icon"><IconStadium/></div>
              <div className="dac-body"><span className="dac-title">{isOwner?"My Stadiums":"Browse Stadiums"}</span><span className="dac-desc">{isOwner?"Manage venues & schedules":"Find and book pitches near you"}</span></div>
              <div className="dac-arrow">→</div>
            </button>
            {!isOwner&&<button className="dash-action-card" onClick={()=>setPage("bookings")}>
              <div className="dac-icon"><IconBookmark/></div>
              <div className="dac-body"><span className="dac-title">My Bookings</span><span className="dac-desc">View & manage upcoming slots</span></div>
              <div className="dac-arrow">→</div>
            </button>}
            <button className="dash-action-card" onClick={()=>{ setChatPartner(null); setPage("chat"); }}>
              <div className="dac-icon"><IconChat/></div>
              <div className="dac-body"><span className="dac-title">Messages</span><span className="dac-desc">{isOwner?"Chat with players":"Chat with friends & owners"}</span></div>
              <div className="dac-arrow">→</div>
            </button>
            {!isOwner&&<button className="dash-action-card" onClick={()=>setPage("groups")}>
              <div className="dac-icon"><IconGroup/></div>
              <div className="dac-body"><span className="dac-title">Groups</span><span className="dac-desc">Organise team matches together</span></div>
              <div className="dac-arrow">→</div>
            </button>}
            {!isOwner&&<button className="dash-action-card" onClick={()=>setPage("players")}>
              <div className="dac-icon"><IconUsers/></div>
              <div className="dac-body"><span className="dac-title">Players</span><span className="dac-desc">Discover & connect with players</span></div>
              <div className="dac-arrow">→</div>
            </button>}
            <button className="dash-action-card" onClick={()=>setPage("settings")}>
              <div className="dac-icon"><IconSettings/></div>
              <div className="dac-body"><span className="dac-title">Settings</span><span className="dac-desc">Profile, photo{!isOwner?", availability":""} & account</span></div>
              <div className="dac-arrow">→</div>
            </button>
          </div>
          <div className="dash-tip">
            <div className="dash-tip-dot"/>
            <span>{isOwner?"💡 Configure your stadium schedules so players can book instantly.":"💡 Set your availability so group admins can find the perfect match time."}</span>
          </div>
        </div>
      )}
      {page==="stadiums"&&<div className="page-content">{isOwner?<OwnerStadiumsPage/>:<BrowseStadiumsPage onMessageOwner={openChat}/>}</div>}
      {page==="bookings"&&!isOwner&&<div className="page-content"><MyBookingsPage/></div>}
      {page==="players"&&!isOwner&&<div className="page-content"><div className="page-header"><h2 className="page-title">Players</h2><p className="page-sub">Search and connect with other players</p></div><PlayersPage user={user}/></div>}
      {page==="chat"&&<div className="page-content"><ChatPage user={user} initialPartner={chatPartner}/></div>}
      {page==="groups"&&!isOwner&&<div className="page-content"><GroupsPage user={user}/></div>}
      {page==="settings"&&<div className="page-content" style={{maxWidth:860}}><SettingsPage user={user} onAvatarChange={handleAvatarChange} onLogout={onLogout} isOwner={isOwner}/></div>}
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
  return user?<HomePage user={user} onAvatarChange={u=>setUser(prev=>({...prev,...u}))} onLogout={()=>{localStorage.removeItem("token");setUser(null);}}/>:<AuthPage onLogin={setUser}/>;
}
