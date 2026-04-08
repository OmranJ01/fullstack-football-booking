import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";


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
      localStorage.setItem("token",data.token);
      
      onLogin(data.user); //same as Setuser(data.user) in App.jsx

    } 
    catch(err){setError(err.message);}

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
            <div className="field">
              <label>Full Name</label>
              <input name="name" value={form.name} onChange={handle} placeholder="John Smith" required/>
            </div>
            
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

          <div className="field">
            <label>Email Address</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="you@example.com" required/>
          </div>
          
          <div className="field">
            <label>Password</label>
            <div className="password-wrap">
              <input name="password" type={showPass?"text":"password"} value={form.password} onChange={handle} placeholder="••••••••" required/>
              <button type="button" className="eye-btn" onClick={()=>setShowPass(!showPass)}>
                <IconEye open={showPass}/>
              </button>
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? <span className="spinner"/> : mode==="login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="switch-text">{mode==="login"?"Don't have an account?":"Already have an account?"}{" "}<button className="link-btn" onClick={()=>switchMode(mode==="login"?"signup":"login")}>{mode==="login"?"Sign up":"Sign in"}</button></p>
      </div>
    </div>
  );
}


export default AuthPage;
