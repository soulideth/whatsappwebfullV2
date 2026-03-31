import React, { useState, useEffect } from 'react';
import api from '../api/axios';

const ChatItem = ({ chat, activeChat, setActiveChat, isOnline, isTyping, presenceState, avatars, setAvatars, broadcasts, onDragStart, onContextMenu }) => {
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
      draggable
      onDragStart={(e) => onDragStart(e, chat.id)}
      onContextMenu={(e) => onContextMenu(e, chat)}
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
const Sidebar = ({ user, whatsappInfo, chats, activeChat, setActiveChat, onLogout, onWaLogout, onSwitchSuccess, onChatsUpdate, onInternalChatSelect, internalMessages, internalUnreadCount, presence, broadcasts }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredChats, setFilteredChats] = useState([]);
  const [avatars, setAvatars] = useState({});
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatError, setNewChatError] = useState('');
  const [isBackgroundEnabled, setIsBackgroundEnabled] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [folders, setFolders] = useState([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});

  const fetchFolders = async () => {
    try {
      const { data } = await api.get('/folder');
      if (data.status === 'success') {
        const foldersData = data.folders;
        setFolders(foldersData);

        // Initialize all folders as expanded by default
        const initialExpanded = {};
        foldersData.forEach(folder => {
          initialExpanded[folder.name] = true;
        });
        setExpandedFolders(initialExpanded);
      }
    } catch (err) { }
  };

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/settings/groups');
      if (data.status === 'success') {
        setUserGroups(data.groups);
      }
    } catch (err) { }
  };

  useEffect(() => {
    fetchGroups();
    fetchFolders();
    const handleUpdate = (e) => {
      const newFolders = e.detail;
      setFolders(newFolders);

      // Auto-expand any folders that we don't know about yet
      setExpandedFolders(prev => {
        const next = { ...prev };
        newFolders.forEach(f => {
          if (next[f.name] === undefined) {
            next[f.name] = true;
          }
        });
        return next;
      });
    };
    window.addEventListener('folders_updated', handleUpdate);
    return () => window.removeEventListener('folders_updated', handleUpdate);
  }, [user.groupId]);

  const handleSwitchGroup = async (groupId) => {
    if (groupId === user.groupId) return;
    if (isSwitching) return;

    try {
      setIsSwitching(true);
      const { data } = await api.post('/auth/switch-group', { groupId });
      if (data.status === 'success') {
        onSwitchSuccess(data.token, data.user);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to switch group';
      alert('Failed to switch group: ' + msg);
    } finally {
      setIsSwitching(false);
    }
  };

  useEffect(() => {
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
        alert(`Background Mode ${newValue ? 'Enabled' : 'Disabled'}.`);
      }
    } catch (err) {
      alert('Failed to update settings');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const { data } = await api.post('/folder/create', { name: newFolderName });
      if (data.status === 'success') {
        const name = newFolderName;
        setShowFolderModal(false);
        setNewFolderName('');
        setExpandedFolders(prev => ({ ...prev, [name]: true }));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create folder');
    }
  };

  const handleMoveChat = async (chatId, folderName) => {
    try {
      await api.post('/folder/move', { chatId, folderName });
    } catch (err) {
      alert('Failed to move chat');
    }
  };

  const handleDeleteFolder = async (name) => {
    try {
      await api.post('/folder/delete', { name });
    } catch (err) {
      alert('Failed to delete folder');
    }
  };

  const handleDragStart = (e, chatId) => {
    e.dataTransfer.setData('chatId', chatId);
  };

  const handleDrop = (e, folderName) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData('chatId');
    if (chatId) {
      handleMoveChat(chatId, folderName);
    }
  };

  const handleContextMenu = (e, chat) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      chat
    });
  };

  useEffect(() => {
    const closeContext = () => setContextMenu(null);
    window.addEventListener('click', closeContext);
    return () => window.removeEventListener('click', closeContext);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const container = document.querySelector('.user-info-display');
      if (showGroupDropdown && container && !container.contains(event.target)) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGroupDropdown]);

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
        onChatsUpdate();
      } else {
        setNewChatError('Not on WhatsApp.');
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
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', transition: 'background-color 0.2s' }}
          onClick={(e) => {
            if (userGroups.length > 1) {
              setShowGroupDropdown(!showGroupDropdown);
            } else {
              setShowProfileModal(true);
            }
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel-color-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div className="user-avatar" style={{ position: 'relative' }} onClick={(e) => { if (userGroups.length > 1) { e.stopPropagation(); setShowProfileModal(true); } }}>
            <i className="fas fa-user-circle" style={{ fontSize: '42px', color: '#8696a0' }}></i>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '140px', lineHeight: '1.2' }}>
            <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }} title={`Team: ${groupName}`}>
              {groupName}
              {userGroups.length > 1 && <i className={`fas fa-chevron-${showGroupDropdown ? 'up' : 'down'}`} style={{ fontSize: '10px', marginTop: '2px' }}></i>}
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

          {showGroupDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '60px',
                left: '0',
                width: '220px',
                background: '#ffff',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 3000,
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                animation: 'slideDown 0.2s ease-out'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', background: 'var(--panel-color-hover)' }}>
                SWITCH ORGANIZATION
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {userGroups.map(g => (
                  <div
                    key={g.groupId}
                    onClick={() => { handleSwitchGroup(g.groupId); setShowGroupDropdown(false); }}
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: g.groupId === user.groupId ? 'rgba(37, 211, 102, 0.05)' : 'transparent',
                      transition: 'background-color 0.2s'
                    }}
                    className="dropdown-item"
                    onMouseEnter={(e) => g.groupId !== user.groupId && (e.currentTarget.style.backgroundColor = 'var(--panel-color-hover)')}
                    onMouseLeave={(e) => g.groupId !== user.groupId && (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: g.groupId === user.groupId ? '#25D366' : 'var(--text-primary)' }}>{g.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>ID: {g.groupId}</div>
                    </div>
                    {g.groupId === user.groupId && <i className="fas fa-check" style={{ color: '#25D366', fontSize: '12px' }}></i>}
                  </div>
                ))}
              </div>
              <div
                onClick={() => { setShowProfileModal(true); setShowGroupDropdown(false); }}
                style={{ padding: '12px 14px', borderTop: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel-color-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <i className="fas fa-user-circle"></i> View Profile
              </div>
            </div>
          )}
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

      <div className="internal-chat-wrapper" style={{ padding: '0 16px', marginBottom: '8px' }}>
        <div
          className={`internal-chat-item ${activeChat?.id === 'internal_group_chat' ? 'active' : ''}`}
          onClick={() => {
            setActiveChat({ id: 'internal_group_chat', name: `Team Internal Chat (${user.groupId})`, isInternal: true });
            onInternalChatSelect();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            borderRadius: '10px',
            cursor: 'pointer',
            background: activeChat?.id === 'internal_group_chat' ? 'rgba(37, 211, 102, 0.1)' : 'var(--panel-color-hover)',
            border: `1px solid ${activeChat?.id === 'internal_group_chat' ? '#25D366' : 'transparent'}`,
            transition: 'all 0.2s',
            marginTop: '10px'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: '#25D366',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}>
            <i className="fas fa-users-cog"></i>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>Team Internal Chat</div>
              <div style={{ fontSize: '11px', color: '#25D366', fontWeight: 'bold' }}>{user.groupId}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {internalMessages.length > 0
                  ? `${internalMessages[internalMessages.length - 1].senderName}: ${internalMessages[internalMessages.length - 1].body}`
                  : 'Real-time collaboration'
                }
              </div>
              {internalUnreadCount > 0 && (
                <div style={{
                  background: '#25D366',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  marginLeft: '8px'
                }}>
                  {internalUnreadCount}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="folders-section" style={{ padding: '4px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--background-alt)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Folders</h4>
          <i className="fas fa-folder-plus" style={{ cursor: 'pointer', color: 'var(--accent-color)' }} onClick={() => setShowFolderModal(true)} title="Create Folder"></i>
        </div>
        <div className="folders-list" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, null)}>
          {folders.map(folder => (
            <div key={folder.name} className="folder-item" style={{ marginBottom: '4px' }}>
              <div
                className="folder-header"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, folder.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'var(--panel-color-hover)',
                  transition: 'background 0.2s'
                }}
                onClick={() => setExpandedFolders(prev => ({ ...prev, [folder.name]: !prev[folder.name] }))}
              >
                <i className={`fas fa-chevron-${expandedFolders[folder.name] ? 'down' : 'right'}`} style={{ fontSize: '10px', color: 'var(--text-secondary)' }}></i>
                <i className="fas fa-folder" style={{ color: '#25D366' }}></i>
                <span style={{ fontWeight: '600', fontSize: '13px' }}>{folder.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '10px' }}>{folder.chats?.length || 0}</span>
                <i className="fas fa-trash" style={{ fontSize: '10px', marginLeft: '6px', color: '#d32f2f', opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.name); }}></i>
              </div>
              {expandedFolders[folder.name] && (
                <div
                  className="folder-chats"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, folder.name)}
                  style={{ padding: '4px 0 4px 20px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: '40px' }}
                >
                  {chats.filter(c => folder.chats?.includes(c.id)).map(chat => (
                    <ChatItem
                      key={`f-${folder.name}-${chat.id}`}
                      chat={chat}
                      activeChat={activeChat}
                      setActiveChat={setActiveChat}
                      isOnline={presence[chat.id] === 'online'}
                      isTyping={presence[chat.id] === 'typing' || presence[chat.id] === 'recording'}
                      presenceState={presence[chat.id]}
                      avatars={avatars}
                      setAvatars={setAvatars}
                      broadcasts={broadcasts}
                      onDragStart={handleDragStart}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                  {(!folder.chats || folder.chats.length === 0) && (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, folder.name)}
                      style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic' }}
                    >
                      Drag chats here
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chat-list"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, null)}
      >
        {filteredChats.filter(chat => !folders.some(f => f.chats?.includes(chat.id))).map(chat => {
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
              onDragStart={handleDragStart}
              onContextMenu={handleContextMenu}
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
              <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                <i className="fas fa-user-circle" style={{ fontSize: '64px', color: '#8696a0', marginTop: '4px' }}></i>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>Available Groups</p>
                  <div className="groups-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {userGroups.length > 0 ? userGroups.map(g => (
                      <div
                        key={g.groupId}
                        onClick={() => handleSwitchGroup(g.groupId)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: g.groupId === user.groupId ? 'rgba(37, 211, 102, 0.1)' : 'var(--panel-color-hover)',
                          border: `1px solid ${g.groupId === user.groupId ? '#25D366' : 'transparent'}`,
                          cursor: g.groupId === user.groupId ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => g.groupId !== user.groupId && (e.currentTarget.style.filter = 'brightness(0.9)')}
                        onMouseLeave={(e) => g.groupId !== user.groupId && (e.currentTarget.style.filter = 'none')}
                      >
                        <div>
                          <div style={{ fontWeight: '700', color: g.groupId === user.groupId ? '#25D366' : 'var(--text-primary)' }}>{g.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID: {g.groupId}</div>
                        </div>
                        {g.groupId === user.groupId && <i className="fas fa-check-circle" style={{ color: '#25D366' }}></i>}
                      </div>
                    )) : (
                      <div style={{ fontWeight: '700', fontSize: '18px' }}>{groupName}</div>
                    )}
                  </div>
                  <p style={{ margin: '12px 0 0 0', color: 'var(--text-secondary)' }}>Logged in as: <strong>{user.username}</strong></p>
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
                <p style={{ margin: '6px 0' }}><strong>Background Mode:</strong> {isBackgroundEnabled ? <span style={{ color: '#25D366', fontWeight: 'bold' }}>Enabled <i className="fas fa-check-circle"></i></span> : <span style={{ color: 'var(--text-secondary)' }}>Disabled</span>}</p>
                <p style={{ margin: '6px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isBackgroundEnabled ? "Session remains active on server restart." : "Session boots only when logged into UI."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {showFolderModal && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <header className="modal-header">
              <h3>Create Folder</h3>
              <span className="close-modal" onClick={() => setShowFolderModal(false)}>&times;</span>
            </header>
            <div className="modal-body" style={{ padding: '20px' }}>
              <input
                type="text"
                placeholder="Folder Name"
                style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-footer" style={{ padding: '15px', justifyContent: 'flex-end', display: 'flex' }}>
              <button className="btn-primary" onClick={handleCreateFolder}>Create</button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="context-menu" style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: '#fff',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          borderRadius: '8px',
          zIndex: 10000,
          minWidth: '180px',
          padding: '6px 0'
        }}>
          <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>MOVE TO FOLDER</div>
          {folders.map(f => (
            <div
              key={f.name}
              className="context-menu-item"
              onClick={() => handleMoveChat(contextMenu.chat.id, f.name)}
              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--panel-color-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <i className="fas fa-folder" style={{ color: '#25D366' }}></i> {f.name}
            </div>
          ))}
          <div
            className="context-menu-item"
            onClick={() => handleMoveChat(contextMenu.chat.id, null)}
            style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '14px', color: '#d32f2f', display: 'flex', alignItems: 'center', gap: '10px' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--panel-color-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <i className="fas fa-thumbtack"></i> Unpin from folder
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
