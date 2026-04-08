import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
function NotificationsPanel({ onClose, onUnreadChange, onNavigate }) {
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
    try {
      await apiCall('/notifications/read-all', 'PATCH');
      setNotifications(n => n.map(x => ({ ...x, is_read: true })));
      onUnreadChange(0);
    } catch {}
  };

  const markRead = async (id) => {
    try {
      await apiCall(`/notifications/${id}/read`, 'PATCH');
      setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
      onUnreadChange(notifications.filter(n => !n.is_read && n.id !== id).length);
    } catch {}
  };

  // Auto mark all as read when panel closes
  useEffect(() => {
    return () => {
      apiCall('/notifications/read-all', 'PATCH').catch(()=>{});
      onUnreadChange(0);
    };
  }, [onUnreadChange]);

  const typeIcon = (type) => {
    if (type === 'message') return '💬';
    if (type === 'group_message') return '💬';
    if (type === 'friend_request') return '👥';
    if (type === 'friend_accepted') return '✅';
    if (type === 'group_invite') return '⚽';
    if (type === 'group_kicked') return '🚫';
    if (type === 'booking') return '📅';
    if (type === 'booking_confirmed') return '✅';
    if (type === 'booking_cancelled') return '❌';
    if (type === 'booking_cancelled_by_owner') return '❌';
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
        {notifications.map(n => {
          const hint = (() => {
            switch (n.type) {
              case 'message':                   return '→ Open chat';
              case 'group_message':             return '→ Open group';
              case 'group_invite':              return '→ View invite';
              case 'group_kicked':              return '→ My groups';
              case 'friend_request':            return '→ Players';
              case 'friend_accepted':           return '→ Open chat';
              case 'booking':                   return '→ View booking';
              case 'booking_confirmed':         return '→ My bookings';
              case 'booking_cancelled':         return '→ My bookings';
              case 'booking_cancelled_by_owner':return '→ My bookings';
              default: return null;
            }
          })();
          const isClickable = !!hint && !!onNavigate;
          const handleClick = () => {
            if (!n.is_read) markRead(n.id);
            if (isClickable) { onNavigate({ type: n.type, related_id: n.related_id, related_type: n.related_type }); onClose(); }
          };
          return (
            <div key={n.id}
              className={`notif-item ${!n.is_read ? 'unread' : ''}`}
              onClick={handleClick}
              style={isClickable ? { cursor: 'pointer' } : {}}
            >
              <span className="notif-icon">{typeIcon(n.type)}</span>
              <div className="notif-body">
                <p className="notif-msg">{n.message}</p>
                <span className="notif-time">
                  {timeAgo(n.created_at)}
                  {isClickable && <span style={{ color: '#4ade80', marginLeft: 6, fontSize: 10 }}>{hint}</span>}
                </span>
              </div>
              {!n.is_read && <div className="notif-dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default NotificationsPanel;
