import { useState, useEffect } from "react";

// ── API helper ───────────────────────────────────────────────────
const API = "http://localhost:5000/api";

async function apiCall(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ── Icons ────────────────────────────────────────────────────────
const IconBall = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a10 10 0 0 1 6.7 17.2M12 2a10 10 0 0 0-6.7 17.2M12 22V12M5.3 7l6.7 5 6.7-5"/>
  </svg>
);
const IconStadium = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v5M9 12v5M15 12v5"/>
  </svg>
);
const IconLogout = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
  </svg>
);
const IconEye = ({ open }) => open ? (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

// ── Auth Page ────────────────────────────────────────────────────
function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", userType: "player", location: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [animating, setAnimating] = useState(false);

  const switchMode = (newMode) => {
    setAnimating(true);
    setTimeout(() => { setMode(newMode); setError(""); setAnimating(false); }, 300);
  };

  const handleChange = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(""); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let data;
      if (mode === "login") {
        data = await apiCall("/auth/login", "POST", { email: form.email, password: form.password });
      } else {
        data = await apiCall("/auth/signup", "POST", form);
      }
      localStorage.setItem("token", data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="pitch-lines">
          {[...Array(8)].map((_, i) => <div key={i} className="pitch-line" style={{ animationDelay: `${i * 0.2}s` }} />)}
        </div>
        <div className="circle-center" />
      </div>

      <div className={`auth-card ${animating ? "fade-out" : "fade-in"}`}>
        <div className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 40 40" width="40" height="40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="#4ade80" strokeWidth="2"/>
              <path d="M20 4a16 16 0 0 1 10.7 27.5M20 4a16 16 0 0 0-10.7 27.5M20 36V20M9.3 11l10.7 8 10.7-8" stroke="#4ade80" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          <div className="logo-text">
            <span className="logo-main">KickOff</span>
            <span className="logo-sub">Stadium Booking</span>
          </div>
        </div>

        <div className="tab-switcher">
          <button className={`tab ${mode === "login" ? "active" : ""}`} onClick={() => switchMode("login")}>Sign In</button>
          <button className={`tab ${mode === "signup" ? "active" : ""}`} onClick={() => switchMode("signup")}>Sign Up</button>
          <div className={`tab-indicator ${mode === "signup" ? "right" : ""}`} />
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <>
              <div className="field">
                <label>Full Name</label>
                <input name="name" value={form.name} onChange={handleChange} placeholder="John Smith" required />
              </div>
              <div className="field">
                <label>I am a...</label>
                <div className="type-selector">
                  <button type="button" className={`type-btn ${form.userType === "player" ? "selected" : ""}`} onClick={() => setForm({ ...form, userType: "player" })}>
                    <span className="type-icon"><IconBall /></span>
                    <span className="type-label">Player</span>
                    <span className="type-desc">Find & book matches</span>
                  </button>
                  <button type="button" className={`type-btn ${form.userType === "stadium_owner" ? "selected" : ""}`} onClick={() => setForm({ ...form, userType: "stadium_owner" })}>
                    <span className="type-icon"><IconStadium /></span>
                    <span className="type-label">Stadium Owner</span>
                    <span className="type-desc">Manage your venue</span>
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Location <span className="optional">(optional)</span></label>
                <input name="location" value={form.location} onChange={handleChange} placeholder="Tel Aviv" />
              </div>
            </>
          )}

          <div className="field">
            <label>Email Address</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
          </div>

          <div className="field">
            <label>Password</label>
            <div className="password-wrap">
              <input name="password" type={showPass ? "text" : "password"} value={form.password} onChange={handleChange} placeholder="••••••••" required />
              <button type="button" className="eye-btn" onClick={() => setShowPass(!showPass)}><IconEye open={showPass} /></button>
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? <span className="spinner" /> : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="switch-text">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button className="link-btn" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Home Page ────────────────────────────────────────────────────
function HomePage({ user, onLogout }) {
  const isOwner = user.userType === "stadium_owner";

  return (
    <div className="home-root">
      <nav className="navbar">
        <div className="nav-logo">
          <svg viewBox="0 0 40 40" width="28" height="28">
            <circle cx="20" cy="20" r="18" fill="none" stroke="#4ade80" strokeWidth="2"/>
            <path d="M20 4a16 16 0 0 1 10.7 27.5M20 4a16 16 0 0 0-10.7 27.5M20 36V20M9.3 11l10.7 8 10.7-8" stroke="#4ade80" strokeWidth="2" fill="none"/>
          </svg>
          <span>KickOff</span>
        </div>
        <button className="logout-btn" onClick={onLogout}><IconLogout /> Sign out</button>
      </nav>

      <div className="home-content">
        <div className="welcome-card">
          <div className={`user-badge ${isOwner ? "owner" : "player"}`}>
            {isOwner ? <IconStadium /> : <IconBall />}
            <span>{isOwner ? "Stadium Owner" : "Player"}</span>
          </div>

          <h1 className="welcome-title">
            Hello, <span className="name-highlight">{user.name}</span> 👋
          </h1>

          <p className="welcome-sub">
            {isOwner
              ? "Welcome back! Manage your stadiums, view bookings, and connect with players."
              : "Welcome back! Find available stadiums, book matches, and connect with friends."}
          </p>

          <div className="info-chips">
            <div className="chip">
              <span className="chip-label">Account Type</span>
              <span className="chip-value">{isOwner ? "Stadium Owner" : "Player"}</span>
            </div>
            <div className="chip">
              <span className="chip-label">Email</span>
              <span className="chip-value">{user.email}</span>
            </div>
            {user.location && (
              <div className="chip">
                <span className="chip-label">Location</span>
                <span className="chip-value">{user.location}</span>
              </div>
            )}
          </div>

          <div className="coming-soon">
            <div className="cs-dot" />
            <span>More features coming soon — stadiums, bookings, chat & more!</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root App ─────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      apiCall("/auth/me")
        .then((u) => setUser(u))
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogout = () => { localStorage.removeItem("token"); setUser(null); };

  if (checking) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0a0f0a" }}>
        <div className="spinner large" />
      </div>
    );
  }

  return user ? <HomePage user={user} onLogout={handleLogout} /> : <AuthPage onLogin={setUser} />;
}
