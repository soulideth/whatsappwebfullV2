import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const ChatItem = ({ chat, activeChat, setActiveChat, isOnline, isTyping, presenceState, avatars, setAvatars, broadcasts }) => {
  useEffect(() => {
    if (avatars[chat.id]) return;
    const fetchAvatar = async () => {
      try {
        const { data } = await api.get(`/chat/getprofilepic/${chat.id}`);
        if (data.status === 'success' && data.message) {
          setAvatars(prev => ({ ...prev, [chat.id]: data.message }));
        }
      } catch (err) { }
    };
    fetchAvatar();
  }, [chat.id]);

  const hasUnreadStatus = broadcasts[chat.id] && broadcasts[chat.id].unreadCount > 0;

  const formatWAID = (chat) => {
    return chat.phoneNumber ? chat.phoneNumber.split('-')[0] : chat.id.replace('@c.us', '').replace('@g.us', '');
  };

  return (
    <div 
      className={`chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
      onClick={() => setActiveChat(chat)}
    >
      <div className="chat-item-avatar">
        {hasUnreadStatus && <div className="status-ring"></div>}
        {avatars[chat.id] ? (
          <img src={avatars[chat.id]} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
        ) : (
          <i className={chat.isGroup ? "fas fa-users" : "fas fa-user-circle"}></i>
        )}
        {isOnline && <div className="status-online-dot"></div>}
      </div>
      <div className="chat-item-content">
        <div className="chat-item-header">
          <span className="chat-item-name" title={chat.id}>{chat.name || formatWAID(chat)}</span>
          <span className="chat-item-time">{chat.timestamp?.split(' ')[1]?.substring(0, 5) || chat.date}</span>
        </div>
        <div className="chat-item-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className={`chat-item-last-msg ${isTyping ? 'status-typing' : ''}`} style={{ flex: 1 }}>
            {isTyping ? (presenceState === 'typing' ? 'typing...' : 'recording...') : (chat.lastMessage ? chat.lastMessage.body : 'No messages')}
          </div>
          {chat.unreadCount > 0 && <span className="unread-badge">{chat.unreadCount}</span>}
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ user, whatsappInfo, chats, activeChat, setActiveChat, onLogout, onWaLogout, onChatsUpdate, presence, broadcasts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredChats, setFilteredChats] = useState([]);
  const [avatars, setAvatars] = useState({});
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatError, setNewChatError] = useState('');
  const [isBackgroundEnabled, setIsBackgroundEnabled] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    // Fetch background mode status and group name
    const fetchSettings = async () => {
      try {
        const { data } = await api.get('/settings/group');
        if (data.status === 'success') {
          setIsBackgroundEnabled(data.isOnlineEnabled);
          setGroupName(data.name || user.groupId);
        }
      } catch (err) { }
    };
    fetchSettings();
  }, [user.groupId]);

  const toggleBackgroundMode = async () => {
    try {
      const newValue = !isBackgroundEnabled;
      const { data } = await api.post('/settings/group', { isOnlineEnabled: newValue });
      if (data.status === 'success') {
        setIsBackgroundEnabled(newValue);
        alert(`Background Mode ${newValue ? 'Enabled' : 'Disabled'}. ${newValue ? 'Session will start automatically on reboot.' : 'Session will start only when you log in.'}`);
      }
    } catch (err) {
      alert('Failed to update settings');
    }
  };

  useEffect(() => {
    setFilteredChats(
      chats.filter(chat =>
        (chat.name && chat.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        chat.id.includes(searchTerm)
      )
    );
  }, [chats, searchTerm]);

  const handleStartNewChat = async () => {
    if (!newChatPhone.trim()) return;
    setNewChatError('Checking number...');
    try {
      const { data } = await api.get(`/chat/checknumber/${newChatPhone}`);
      if (data.status === 'success' && data.message === true) {
        setShowNewChatModal(false);
        setNewChatPhone('');
        onChatsUpdate(); // Refresh chat list
      } else {
        setNewChatError('This number is not registered on WhatsApp.');
      }
    } catch (err) {
      setNewChatError('Failed to check number.');
    }
  };

  return (
    <aside className="sidebar">
      <header className="sidebar-header" style={{ height: '70px', padding: '10px 16px' }}>
        <div 
          className="user-info-display" 
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', transition: 'background-color 0.2s' }}
          onClick={() => setShowProfileModal(true)}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel-color-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div className="user-avatar" style={{ position: 'relative' }}>
            <i className="fas fa-user-circle" style={{ fontSize: '42px', color: '#8696a0' }}></i>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '140px', lineHeight: '1.2' }}>
            <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`Team: ${groupName}`}>
                {groupName}
            </span>
            <span style={{ fontSize: '11px', color: '#667781', fontWeight: '500' }}>
                User: {user.username}
            </span>
            {whatsappInfo && (
                <span style={{ fontSize: '11px', color: '#25D366', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }} title={`WA Name: ${whatsappInfo.pushname}`}>
                    <i className="fab fa-whatsapp"></i>
                    {whatsappInfo.pushname || whatsappInfo.wid?.user}
                </span>
            )}
          </div>
        </div>
        <div className="header-actions">
          <i
            className="fas fa-microchip"
            onClick={toggleBackgroundMode}
            title={isBackgroundEnabled ? "Background Mode: ON (Always Active)" : "Background Mode: OFF (Start on Login)"}
            style={{ color: isBackgroundEnabled ? "var(--accent-color)" : "var(--text-secondary)" }}
          ></i>
          <i className="fas fa-plus" onClick={() => setShowNewChatModal(true)} title="New Chat"></i>
          <i className="fas fa-qrcode" onClick={onWaLogout} title="WhatsApp Session (Logout/Reset)" style={{ color: '#d32f2f' }}></i>
          <i className="fas fa-sign-out-alt" onClick={onLogout} title="Sign Out Account"></i>
        </div>
      </header>
      <div className="search-container">
        <div className="search-input-wrapper">
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="chat-list">
        {filteredChats.map(chat => {
          const isOnline = presence[chat.id] === 'online';
          const isTyping = presence[chat.id] === 'typing' || presence[chat.id] === 'recording';

          return (
            <ChatItem
              key={chat.id}
              chat={chat}
              activeChat={activeChat}
              setActiveChat={setActiveChat}
              isOnline={isOnline}
              isTyping={isTyping}
              presenceState={presence[chat.id]}
              avatars={avatars}
              setAvatars={setAvatars}
              broadcasts={broadcasts}
            />
          );
        })}
        {filteredChats.length === 0 && (
          <div className="loading-chats">Loading...</div>
        )}
      </div>

      {showNewChatModal && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <header className="modal-header">
              <h3>Start New Chat</h3>
              <span className="close-modal" onClick={() => setShowNewChatModal(false)}>&times;</span>
            </header>
            <div className="modal-body" style={{ padding: '20px' }}>
              <input
                type="text"
                placeholder="Enter phone number (85620xxx)"
                style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }}
                value={newChatPhone}
                onChange={(e) => setNewChatPhone(e.target.value)}
                autoFocus
              />
              {newChatError && <p style={{ color: '#f44336', fontSize: '13px', marginTop: '10px' }}>{newChatError}</p>}
            </div>
            <div className="modal-footer" style={{ padding: '15px', justifyContent: 'flex-end', display: 'flex' }}>
              <button className="btn-primary" onClick={handleStartNewChat}>Start Chat</button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <header className="modal-header">
              <h3>Client Information</h3>
              <span className="close-modal" onClick={() => setShowProfileModal(false)}>&times;</span>
            </header>
            <div className="modal-body" style={{ padding: '20px', fontSize: '14px', color: 'var(--text-primary)' }}>
              <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <i className="fas fa-user-circle" style={{ fontSize: '64px', color: '#8696a0' }}></i>
                  <div>
                      <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{groupName}</h2>
                      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Logged in as: {user.username}</p>
                  </div>
              </div>
              
              <h4 style={{ margin: '15px 0 10px 0', color: '#25D366' }}><i className="fab fa-whatsapp"></i> WhatsApp Status</h4>
              {whatsappInfo ? (
                  <div style={{ background: 'var(--panel-color-hover)', padding: '12px', borderRadius: '8px' }}>
                      <p style={{ margin: '6px 0' }}><strong>Pushname:</strong> {whatsappInfo.pushname || 'N/A'}</p>
                      <p style={{ margin: '6px 0' }}><strong>Phone Number:</strong> {whatsappInfo.wid?.user || 'Unknown'}</p>
                      <p style={{ margin: '6px 0' }}><strong>Platform:</strong> {whatsappInfo.platform || 'WhatsApp Web'}</p>
                      <p style={{ margin: '6px 0', overflowWrap: 'break-word' }}><strong>Auth ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{whatsappInfo.wid?._serialized || 'N/A'}</span></p>
                  </div>
              ) : (
                  <div style={{ background: '#ffebee', color: '#c62828', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="fas fa-exclamation-triangle"></i>
                      <span>WhatsApp is currently disconnected or initializing.</span>
                  </div>
              )}
              
              <h4 style={{ margin: '20px 0 10px 0', color: 'var(--text-secondary)' }}><i className="fas fa-server"></i> System Integration</h4>
              <div style={{ background: 'var(--panel-color-hover)', padding: '12px', borderRadius: '8px' }}>
                  <p style={{ margin: '6px 0' }}><strong>Workspace ID:</strong> <span style={{ fontFamily: 'monospace' }}>{user.groupId}</span></p>
                  <p style={{ margin: '6px 0' }}><strong>Background Mode:</strong> {isBackgroundEnabled ? <span style={{color: '#25D366', fontWeight: 'bold'}}>Enabled <i className="fas fa-check-circle"></i></span> : <span style={{color: 'var(--text-secondary)'}}>Disabled</span>}</p>
                  <p style={{ margin: '6px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {isBackgroundEnabled ? "Session remains active on server restart." : "Session boots only when logged into UI."}
                  </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
