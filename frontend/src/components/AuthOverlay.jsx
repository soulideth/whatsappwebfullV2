import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api/axios';

const AuthOverlay = ({ qrCode, status, user, onLogout, onSwitchSuccess }) => {
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const { data } = await api.get('/settings/groups');
        if (data.status === 'success') {
          setUserGroups(data.groups);
        }
      } catch (err) { }
    };
    fetchGroups();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showGroupDropdown && 
          !event.target.closest('.group-name-trigger') && 
          !event.target.closest('.group-dropdown')) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGroupDropdown]);

  const handleSwitchGroup = async (groupId) => {
    if (groupId === user?.groupId) return;
    if (isSwitching) return;

    try {
      setIsSwitching(true);
      const { data } = await api.post('/auth/switch-group', { groupId });
      if (data.status === 'success') {
        onSwitchSuccess(data.token, data.user);
      }
    } catch (err) {
      alert('Failed to switch group');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div id="auth-overlay" className="modal" style={{ display: 'flex', zIndex: 2000 }}>
      <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <header className="modal-header">
          <h3>WhatsApp Login</h3>
        </header>
        <div className="modal-body" style={{ padding: '30px' }}>
          <div style={{ position: 'relative', zIndex: 10 }}>
            <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
              Open WhatsApp on your phone and scan this code to login to {" "}
              <span
                className="group-name-trigger"
                onClick={() => {
                  if (userGroups.length > 1) {
                    setShowGroupDropdown(!showGroupDropdown);
                  }
                }}
                style={{
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: userGroups.length > 1 ? 'pointer' : 'default',
                  background: 'var(--accent-color)', // Use theme's accent color (green-ish usually, but we want it to look like a button)
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                  boxShadow: userGroups.length > 1 ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (userGroups.length > 1) {
                    e.currentTarget.style.filter = 'brightness(1.1)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (userGroups.length > 1) {
                    e.currentTarget.style.filter = 'none';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                <i className="fas fa-building" style={{ fontSize: '10px' }}></i>
                {user?.groupId}
                {userGroups.length > 1 && <i className={`fas fa-chevron-${showGroupDropdown ? 'up' : 'down'}`} style={{ fontSize: '10px' }}></i>}
              </span>
            </p>
            {showGroupDropdown && (
              <div
                className="group-dropdown"
                style={{
                  position: 'absolute',
                  top: '35px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '240px',
                  background: '#fff',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                  zIndex: 3000,
                  border: '1px solid var(--border-color)',
                  textAlign: 'left',
                  overflow: 'hidden'
                }}
              >
                <div style={{ padding: '12px 14px', fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', background: 'var(--panel-color-hover)', letterSpacing: '0.5px' }}>
                  SWITCH ORGANIZATION
                </div>
                {userGroups.map(g => (
                  <div
                    key={g.groupId}
                    onClick={() => handleSwitchGroup(g.groupId)}
                    style={{
                      padding: '14px',
                      cursor: 'pointer',
                      background: g.groupId === user?.groupId ? 'rgba(37, 211, 102, 0.05)' : 'transparent',
                      transition: 'background-color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => g.groupId !== user?.groupId && (e.currentTarget.style.backgroundColor = 'var(--panel-color-hover)')}
                    onMouseLeave={(e) => g.groupId !== user?.groupId && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: g.groupId === user?.groupId ? '#25D366' : 'var(--text-primary)' }}>{g.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{g.groupId}</div>
                    </div>
                    {g.groupId === user?.groupId && <i className="fas fa-check-circle" style={{ color: '#25D366', fontSize: '14px' }}></i>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', background: 'white', padding: '10px', borderRadius: '8px' }}>
            {qrCode ? (
              <QRCodeSVG value={qrCode} size={256} />
            ) : (
              <div style={{ height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '40px' }}></i>
              </div>
            )}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--accent-color)', marginBottom: '20px' }}>
            <i className={`fas ${qrCode ? 'fa-check-circle' : 'fa-spinner fa-spin'}`}></i> {status}
          </div>

          <div 
            onClick={(e) => {
              console.log('Sign out button clicked in AuthOverlay');
              onLogout();
            }}
            style={{ 
              marginTop: '10px', 
              padding: '20px 0 10px 0', 
              borderTop: '1px solid var(--border-color)',
              color: '#ea0038', 
              cursor: 'pointer', 
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              userSelect: 'none'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            <i className="fas fa-sign-out-alt"></i> Sign out from system
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthOverlay;
