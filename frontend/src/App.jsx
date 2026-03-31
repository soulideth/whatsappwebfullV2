import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthOverlay from './components/AuthOverlay';
import LoginPage from './pages/LoginPage';
import api from './api/axios';
import { io } from 'socket.io-client';

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isWaAuthenticated, setIsWaAuthenticated] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [authStatus, setAuthStatus] = useState('Initializing...');
  const [presence, setPresence] = useState({});
  const [broadcasts, setBroadcasts] = useState({});
  const [internalMessages, setInternalMessages] = useState([]);
  const [internalUnreadCount, setInternalUnreadCount] = useState(0);
  const [groupOnlineUsers, setGroupOnlineUsers] = useState([]);
  const socketRef = useRef(null);
  const activeChatRef = useRef(null);

  // Sync ref with state
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleSwitchSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    // Reset group-specific state to avoid showing stale data
    setIsWaAuthenticated(false);
    setChats([]);
    setActiveChat(null);
    setQrCode(null);
    setWhatsappInfo(null);
    setAuthStatus('Switching group...');

    // Update storage
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setInternalMessages([]);
    setInternalUnreadCount(0);

    // Force context re-fetch for new group
    api.get('/auth/status').then(({ data }) => {
      setIsWaAuthenticated(data.authenticated);
      if (data.info) setWhatsappInfo(data.info);
      if (data.authenticated) {
        fetchChats();
        fetchBroadcasts();
      } else {
        fetchQRData();
      }
      fetchInternalHistory();
    });
  };

  const [whatsappInfo, setWhatsappInfo] = useState(null);

  const fetchQRData = async () => {
    try {
      const { data } = await api.get('/auth/qrdata');
      if (data.status === 'success' && data.qr) {
        setQrCode(data.qr);
        setAuthStatus('QR Code ready. Please scan with WhatsApp.');
      } else {
        setAuthStatus('Generating QR code...');
      }
    } catch (err) {
      setAuthStatus('Error loading QR code.');
    }
  };

  const fetchChats = async () => {
    try {
      const { data } = await api.get('/chat/getchats');
      if (data.status === 'success') {
        setChats(data.message);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  const fetchBroadcasts = async () => {
    try {
      const { data } = await api.get('/chat/getbroadcasts');
      if (data.status === 'success') {
        const bMap = {};
        data.message.forEach(b => {
          bMap[b.id] = b;
        });
        setBroadcasts(bMap);
      }
    } catch (err) {
      console.error('Error fetching broadcasts:', err);
    }
  };

  const fetchInternalHistory = async (limit = 50) => {
    try {
      const { data } = await api.get(`/internal/history?limit=${limit}`);
      if (data.status === "success") {
        setInternalMessages(data.messages);
      }
    } catch (err) {
      console.error('Error fetching internal history:', err);
    }
  };

  const handleLogout = () => {
    console.log('handleLogout called - bypassing confirm');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
  };

  const handleWaLogout = async () => {
    console.log('handleWaLogout called - bypassing confirm');
    try {
      const { data } = await api.post('/auth/logout');
      if (data.status === 'success') {
        setIsWaAuthenticated(false);
        setQrCode(null);
        setWhatsappInfo(null);
        fetchQRData();
      }
    } catch (err) {
      alert('WhatsApp logout failed: ' + err.message);
    }
  }

  useEffect(() => {
    if (!token || !user) return;

    // Initial WhatsApp auth check
    api.get('/auth/status').then(({ data }) => {
      setIsWaAuthenticated(data.authenticated);
      if (data.info) setWhatsappInfo(data.info);
      if (!data.authenticated) {
        fetchQRData();
      } else {
        setQrCode(null);
        fetchChats();
        fetchBroadcasts();
      }
      fetchInternalHistory();
    }).catch(err => {
      console.error('Auth check failed:', err);
      setAuthStatus('Error checking authentication status.');
    });

    if (!socketRef.current) {
      socketRef.current = io('http://localhost:5000', { transports: ['websocket'] });

      socketRef.current.on('connect', () => {
        if (user && user.groupId) {
          console.log('Connected to socket, joining room:', user.groupId);
          socketRef.current.emit('join_group', { groupId: user.groupId, username: user.username });
        } else {
          console.warn('Socket connected but no valid groupId found for user');
        }
      });

      socketRef.current.on('qr', (qr) => {
        setQrCode(qr);
        setAuthStatus('QR Code ready. Please scan with WhatsApp.');
      });

      socketRef.current.on('auth_status', (status) => {
        setAuthStatus(status);
        if (status.includes('Restoring')) {
          setQrCode(null);
        }
      });

      socketRef.current.on('authenticated', () => {
        setIsWaAuthenticated(true);
        setQrCode(null);
        fetchChats();
        fetchBroadcasts();
      });

      socketRef.current.on('ready', (payload) => {
        setIsWaAuthenticated(true);
        setQrCode(null);
        if (payload && payload.info) setWhatsappInfo(payload.info);
        fetchChats();
        fetchBroadcasts();
      });

      socketRef.current.on('new_message', (msg) => {
        setChats(prev => {
          const currentChats = [...prev];
          const chatId = msg.fromMe ? msg.to : msg.from;
          const chatIdx = currentChats.findIndex(c => c.id === chatId);

          if (chatIdx > -1) {
            const chat = { ...currentChats[chatIdx] };
            chat.lastMessage = msg;
            const currentActiveChat = activeChatRef.current;
            if (!msg.fromMe && (!currentActiveChat || currentActiveChat.id !== msg.from)) {
              chat.unreadCount = (chat.unreadCount || 0) + 1;
            } else if (!msg.fromMe && currentActiveChat && currentActiveChat.id === msg.from) {
              api.post(`/chat/seen/${currentActiveChat.id}`);
            }
            currentChats.splice(chatIdx, 1);
            currentChats.unshift(chat);
            return currentChats;
          } else {
            fetchChats();
            return prev;
          }
        });
      });

      socketRef.current.on('presence_update', (data) => {
        setPresence(prev => ({ ...prev, [data.id]: data.state }));
      });

      socketRef.current.on('folders_updated', (folders) => {
        // We'll let the Sidebar component handle its own internal refreshes 
        // to simplify prop drilling, but we could also store it here.
        // For now, let's just trigger a custom event that Sidebar can listen to.
        window.dispatchEvent(new CustomEvent('folders_updated', { detail: folders }));
      });

      socketRef.current.on('new_internal_message', (msg) => {
        setInternalMessages(prev => {
          if (prev.find(m => m._id === msg._id)) return prev;

          const currentActiveChat = activeChatRef.current;
          // Increment unread if chat is not active and message is from someone else
          if ((!currentActiveChat || currentActiveChat.id !== 'internal_group_chat') && msg.senderId !== user.userId) {
            setInternalUnreadCount(u => u + 1);
          }

          return [...prev, msg];
        });
      });

      socketRef.current.on('group_online_users', (users) => {
        setGroupOnlineUsers(users);
      });

      socketRef.current.on('disconnected', () => {
        setIsWaAuthenticated(false);
        setAuthStatus('WhatsApp Disconnected. Reconnecting...');
        fetchQRData();
      });
    }

    const interval = setInterval(() => {
      if (isWaAuthenticated) {
        fetchBroadcasts();
      }
    }, 60000);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      clearInterval(interval);
    };
  }, [token, user, isWaAuthenticated]);

  if (!token || !user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`app-container ${activeChat ? 'chat-active' : ''}`}>
      {!isWaAuthenticated && (
        <AuthOverlay qrCode={qrCode} status={authStatus} user={user} onLogout={handleLogout} onSwitchSuccess={handleSwitchSuccess} />
      )}
      <Sidebar
        user={user}
        whatsappInfo={whatsappInfo}
        chats={chats}
        setActiveChat={(chat) => {
          setActiveChat(chat);
          if (chat) {
            setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
            api.post(`/chat/seen/${chat.id}`);
          }
        }}
        onLogout={handleLogout}
        onWaLogout={handleWaLogout}
        onSwitchSuccess={handleSwitchSuccess}
        onChatsUpdate={fetchChats}
        onInternalChatSelect={(limit = 50) => {
          fetchInternalHistory(limit);
          setInternalUnreadCount(0);
        }}
        internalMessages={internalMessages}
        internalUnreadCount={internalUnreadCount}
        presence={presence}
        broadcasts={broadcasts}
      />
      <ChatArea
        activeChat={activeChat}
        presence={presence}
        onPresenceUpdate={(id, state) => setPresence(prev => ({ ...prev, [id]: state }))}
        onChatsUpdate={(val) => {
          if (val === null) {
            setActiveChat(null);
          } else {
            fetchChats();
          }
        }}
        socket={socketRef.current}
        user={user}
        internalMessages={internalMessages}
        onInternalLoadMore={fetchInternalHistory}
        groupOnlineUsers={groupOnlineUsers}
      />
    </div>
  );
}

export default App;
