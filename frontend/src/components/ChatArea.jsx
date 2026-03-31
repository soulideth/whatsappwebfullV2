import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ContextMenu from './ContextMenu';
import api from '../api/axios';
import MediaModal from './MediaModal';

const MediaPreview = ({ msgId, onOpenModal }) => {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const { data } = await api.get(`/chat/getmedia/${msgId}`);
        if (data.status === 'success') {
          setMedia(data.message);
        }
      } catch (err) {
        console.error('Media fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMedia();
  }, [msgId]);

  if (loading) return <div className="loading-media"><i className="fas fa-spinner fa-spin"></i> Loading...</div>;
  if (!media) return <div className="media-error"><i className="fas fa-exclamation-triangle"></i> Media unavailable</div>;

  const src = `data:${media.mimetype};base64,${media.data}`;

  if (media.mimetype.startsWith('image/')) {
    return (
      <div className="message-media clickable-media" onClick={() => onOpenModal(media)}>
        <img src={src} alt="WhatsApp Media" />
      </div>
    );
  }
  if (media.mimetype.startsWith('video/')) {
    return (
      <div className="message-media clickable-media" onClick={() => onOpenModal(media)}>
        <video src={src} muted />
        <div className="video-overlay"><i className="fas fa-play"></i></div>
      </div>
    );
  }
  if (media.mimetype.startsWith('audio/') || media.mimetype.startsWith('application/ogg')) {
    return <div className="message-media"><audio src={src} controls /></div>;
  }

  return <a href={src} download={media.filename || 'file'} className="file-download-link"><i className="fas fa-file-download"></i> Download {media.filename || 'File'}</a>;
};

const ChatArea = ({ activeChat, onChatsUpdate, presence, onPresenceUpdate, socket, user, internalMessages, onInternalLoadMore, groupOnlineUsers }) => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [about, setAbout] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [realPhoneNumber, setRealPhoneNumber] = useState(null);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [limit, setLimit] = useState(50);
  const [internalLimit, setInternalLimit] = useState(50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const messageListRef = useRef(null);
  const [showContactProfileModal, setShowContactProfileModal] = useState(false);
  const [showOnlineMembersModal, setShowOnlineMembersModal] = useState(false);

  const fetchMessages = async (currentLimit = limit) => {
    if (!activeChat || activeChat.isInternal) return;
    setIsChatLoading(true);
    try {
      const { data } = await api.get(`/chat/getchatbyid/${activeChat.id}?limit=${currentLimit}`);
      if (data.status === 'success') {
        setMessages(data.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const fetchMetadata = async () => {
    if (!activeChat || activeChat.isInternal) return;
    try {
      const aboutRes = await api.get(`/chat/getabout/${activeChat.id}`);
      if (aboutRes.data.status === 'success') setAbout(aboutRes.data.message);
      const picRes = await api.get(`/chat/getprofilepic/${activeChat.id}`);
      if (picRes.data.status === 'success') setAvatar(picRes.data.message);

      // Trigger presence check and update global state
      const presenceRes = await api.get(`/contact/getpresence/${activeChat.id}`);
      if (presenceRes.data.status === 'success' && presenceRes.data.presence) {
        onPresenceUpdate(activeChat.id, presenceRes.data.presence.type);
      }

      // Fetch the true un-obscured Phone Number directly from the contact layer for multi-device compatibility
      try {
        const contactRes = await api.get(`/chat/getcontact/${activeChat.id}`);
        if (contactRes.data.status === 'success' && contactRes.data.message) {
          setRealPhoneNumber(contactRes.data.message.number || null);
        } else {
          setRealPhoneNumber(null);
        }
      } catch (e) {
        setRealPhoneNumber(null);
      }

    } catch (err) { }
  };

  const handleMessageAction = async (action, msg) => {
    try {
      if (action === 'delete') {
        const everyone = window.confirm('Delete for everyone?');
        await api.post(`/chat/delete/${activeChat.id}`, { msgId: msg.id._serialized, everyone });
      } else if (action === 'react') {
        const reaction = prompt('Enter emoji:');
        if (reaction) await api.post(`/chat/react/${activeChat.id}`, { msgId: msg.id._serialized, reaction });
      } else if (action === 'edit') {
        setEditingMessage(msg);
        setMessageInput(msg.body);
      }
      fetchMessages();
    } catch (err) { }
  };

  const onContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      options: [
        { label: 'React', icon: 'far fa-smile', action: () => handleMessageAction('react', msg) },
        { label: 'Reply', icon: 'fas fa-reply', action: () => console.log('Reply', msg) },
        { label: 'Edit', icon: 'fas fa-edit', action: () => handleMessageAction('edit', msg) },
        { label: 'Forward', icon: 'fas fa-share', action: () => console.log('Forward', msg) },
        { label: 'Star', icon: 'far fa-star', action: () => console.log('Star', msg) },
        { label: 'Delete', icon: 'fas fa-trash', action: () => handleMessageAction('delete', msg) },
      ]
    });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !activeChat) return;
    const msgBody = messageInput;
    setMessageInput('');

    if (activeChat.isInternal) {
      if (socket) {
        socket.emit('send_internal_message', {
          userId: user.userId,
          username: user.username,
          body: msgBody
        });
      }
      return;
    }

    try {
      if (editingMessage) {
        await api.post(`/chat/edit/${activeChat.id}`, {
          msgId: editingMessage.id._serialized,
          newContent: msgBody
        });
        setEditingMessage(null);
      } else {
        await api.post(`/chat/sendmessage/${activeChat.id}`, { message: msgBody });
      }
      fetchMessages();
      onChatsUpdate();
    } catch (err) { }
  };

  const formatRecordingTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      // Use webm/ogg based on browser support
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access in your browser settings.');
    }
  };

  const _stopRecorderAndTracks = () => {
    clearInterval(recordingTimerRef.current);
    // Stop tracks AFTER stop() so ondataavailable has time to fire
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      // Stop the mic stream tracks after a tick so data flushes
      setTimeout(() => {
        recorder.stream?.getTracks().forEach(t => t.stop());
      }, 100);
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const cancelRecording = () => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null; // clear any onstop handler
    }
    _stopRecorderAndTracks();
  };

  const sendVoiceMessage = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    setIsSendingVoice(true);
    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      if (blob.size === 0) {
        console.error('Empty audio blob - nothing to send');
        setIsSendingVoice(false);
        return;
      }
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const formData = new FormData();
      formData.append('voice', blob, `voice.${ext}`);
      try {
        console.log("Frontend: Sending voice message to backend.");
        const { data } = await api.post(`/chat/sendvoice/${activeChat.id}`, formData);
        if (data.status === 'success') {
          console.log("Frontend: Voice message sent successfully.");
          fetchMessages(limit);
        } else {
          alert('Failed to send voice: ' + data.message);
          console.error("Frontend: Failed to send voice message, backend response:", data.message);
        }
      } catch (err) {
        console.error('Frontend: Failed to send voice message', err);
        alert('Error sending voice message. Check console.');
      } finally {
        setIsSendingVoice(false);
        audioChunksRef.current = [];
      }
    };
    _stopRecorderAndTracks();
  };

  const handleMediaSelect = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      setPendingMedia({ file, type });
      setShowMediaModal(true);
      setShowAttachMenu(false);
    }
  };

  const handleSendMedia = async () => {
    if (!pendingMedia) return;
    const { file, type } = pendingMedia;
    setShowMediaModal(false);
    try {
      if (type === 'image') {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          await api.post(`/chat/sendimage/${activeChat.id}`, { image: base64, caption: mediaCaption });
          fetchMessages();
        };
        reader.readAsDataURL(file);
      } else {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('caption', mediaCaption);
        await api.post(`/chat/sendvideo/${activeChat.id}`, formData);
        fetchMessages();
      }
    } catch (err) { }
    setPendingMedia(null);
  };

  useEffect(() => {
    if (activeChat) {
      setLimit(50);
      setInternalLimit(50);
      if (!activeChat.isInternal) {
        fetchMessages(limit);
        fetchMetadata();
      }

      // Use shared socket
      if (socket) {
        const messageHandler = (msg) => {
          if (msg.from === activeChat.id || msg.to === activeChat.id) {
            setMessages(prev => {
              if (prev.find(m => m.id._serialized === msg.id._serialized)) return prev;
              const newMessages = [...prev, msg];
              // Ensure we don't block auto-scroll for new messages
              setTimeout(() => {
                if (messageListRef.current) {
                  messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
                }
              }, 100);
              return newMessages;
            });
            onChatsUpdate();
          }
        };

        const ackHandler = ({ msgId, ack }) => {
          setMessages(prev => prev.map(m => m.id._serialized === msgId ? { ...m, ack } : m));
        };

        const editHandler = ({ msgId, newBody }) => {
          setMessages(prev => prev.map(m => m.id._serialized === msgId ? { ...m, body: newBody } : m));
        };

        const reactionHandler = ({ msgId, reactions }) => {
          setMessages(prev => prev.map(m => m.id._serialized === msgId ? { ...m, hasReaction: true, reactions } : m));
        };

        socket.on('new_message', messageHandler);
        socket.on('message_ack', ackHandler);
        socket.on('message_edit', editHandler);
        socket.on('message_reaction', reactionHandler);

        return () => {
          socket.off('new_message', messageHandler);
          socket.off('message_ack', ackHandler);
          socket.off('message_edit', editHandler);
          socket.off('message_reaction', reactionHandler);
        };
      }
    }
  }, [activeChat, socket]);

  useEffect(() => {
    if (messageListRef.current) {
      if (!isLoadingMore) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }
      setIsLoadingMore(false);
    }
  }, [messages, internalMessages]);

  if (!activeChat) {
    return (
      <main className="chat-main">
        <div className="no-chat-selected">
          <div className="welcome-content">
            <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" width="100" />
            <h1>WhatsApp Web API</h1>
            <p>Select a chat or start a new conversation.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-main">
      <div className="active-chat">
        <header className="chat-header">
          <div className="chat-info">
            <i className="fas fa-arrow-left back-button" onClick={() => onChatsUpdate(null)}></i>
            {activeChat.isInternal ? (
              <div
                className="chat-avatar"
                onClick={() => setShowOnlineMembersModal(true)}
                style={{ background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
                title="View Online Members"
              >
                <i className="fas fa-users-cog"></i>
              </div>
            ) : (
              <div className="chat-avatar" onClick={() => setShowContactProfileModal(true)} style={{ cursor: 'pointer' }} title="View Contact Info">
                {avatar ? <img src={avatar} style={{ width: 40, height: 40, borderRadius: '50%' }} /> : <i className="fas fa-user-circle"></i>}
                {presence[activeChat.id] === 'online' && <div className="status-online-dot header-dot"></div>}
              </div>
            )}
            <div
              className="chat-details"
              onClick={() => {
                if (activeChat.isInternal) {
                  setShowOnlineMembersModal(true);
                } else {
                  setShowContactProfileModal(true);
                }
              }}
              style={{ cursor: 'pointer' }}
              title={activeChat.isInternal ? "View Online Members" : "View Contact Info"}
            >
              <h2 style={{ margin: 0 }}>
                {activeChat.name || (realPhoneNumber ? `+${realPhoneNumber}` : `+${activeChat.phoneNumber.split('-')[0]}`)}
              </h2>
              <div className="status-wrapper">
                {activeChat.isInternal ? (
                  <p className="chat-about">{groupOnlineUsers?.length || 0} Online</p>
                ) : (
                  presence[activeChat.id] && presence[activeChat.id] !== 'offline' ? (
                    <span className={`status-text ${presence[activeChat.id]}`}>{presence[activeChat.id]}</span>
                  ) : (
                    <p className="chat-about">{activeChat.isGroup ? 'group' : about}</p>
                  )
                )}
              </div>
            </div>
          </div>
          <div className="chat-actions">
            {!activeChat.isInternal && (
              <>
                <i className="fas fa-thumbtack"></i>
                <i className="fas fa-archive"></i>
                <i className="fas fa-volume-mute"></i>
              </>
            )}
            <i className="fas fa-search"></i>
          </div>
        </header>

        <div className="message-list" ref={messageListRef}>
          {activeChat.isInternal ? (
            <>
              {internalMessages.length > 0 && (
                <div className="load-more-container" style={{ textAlign: 'center', padding: '15px' }}>
                  <button
                    onClick={() => {
                      setIsLoadingMore(true);
                      const newLimit = internalLimit + 50;
                      setInternalLimit(newLimit);
                      onInternalLoadMore(newLimit);
                    }}
                    className="btn-primary"
                    style={{ fontSize: '13px', padding: '6px 16px', borderRadius: '15px', border: 'none', cursor: 'pointer', background: '#e9edef', color: '#54656f', fontWeight: 500 }}
                  >
                    Load Older Messages
                  </button>
                </div>
              )}
              {internalMessages.map(msg => (
                <div key={msg._id} className={`message ${msg.senderId === user.userId ? 'sent' : 'received'}`}>
                  <div className="message-sender" style={{ fontSize: '12px', fontWeight: 'bold', color: '#25D366', marginBottom: '2px' }}>
                    {msg.senderName}
                  </div>
                  <div className="message-text">
                    {msg.body}
                  </div>
                  <div className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {isChatLoading && (
                <div className="loading-chat" style={{ textAlign: 'center', padding: '15px', color: '#8696a0', fontSize: '14px' }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Loading chats...
                </div>
              )}
              {!isChatLoading && messages.length > 0 && (
                <div className="load-more-container" style={{ textAlign: 'center', padding: '15px' }}>
                  <button
                    onClick={() => {
                      setIsLoadingMore(true);
                      const newLimit = limit + 50;
                      setLimit(newLimit);
                      fetchMessages(newLimit);
                    }}
                    className="btn-primary"
                    style={{ fontSize: '13px', padding: '6px 16px', borderRadius: '15px', border: 'none', cursor: 'pointer', background: '#e9edef', color: '#54656f', fontWeight: 500 }}
                  >
                    Load Older Messages
                  </button>
                </div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id._serialized}
                  className={`message ${msg.fromMe ? 'sent' : 'received'}`}
                  onContextMenu={(e) => onContextMenu(e, msg)}
                >
                  {msg.hasMedia && (
                    <MediaPreview
                      msgId={msg.id._serialized}
                      onOpenModal={(media) => {
                        setSelectedMedia(media);
                      }}
                    />
                  )}
                  <div className="message-text">
                    {msg.body}
                    {msg.hasReaction && msg.reactions && (
                      <div className="reactions-list">
                        {msg.reactions.map((reaction, i) => (
                          <span key={i}>{reaction}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="message-time">
                    {msg.timestamp.split(' ')[1]?.substring(0, 5)}
                    {msg.fromMe && (
                      <span className={`message-status ${msg.ack === 3 ? 'status-read' : 'status-unread'}`}>
                        <i className={`fas ${msg.ack >= 2 ? 'fa-check-double' : 'fa-check'}`}></i>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <footer className="chat-footer">
          {editingMessage && (
            <div className="editing-banner" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#e9edef', position: 'absolute', bottom: '62px', left: 0, right: 0 }}>
              <span>Editing: {editingMessage.body.substring(0, 30)}...</span>
              <i className="fas fa-times" onClick={() => { setEditingMessage(null); setMessageInput(''); }}></i>
            </div>
          )}
          {!activeChat.isInternal && (
            <div className="attachment-actions">
              <button onClick={() => setShowAttachMenu(!showAttachMenu)}><i className="fas fa-paperclip"></i></button>
              {showAttachMenu && (
                <div className="attachment-menu" style={{ display: 'flex' }}>
                  <label className="menu-item" style={{ background: '#bf59cf' }}>
                    <i className="fas fa-image"></i>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleMediaSelect(e, 'image')} />
                  </label>
                  <label className="menu-item" style={{ background: '#eb4034' }}>
                    <i className="fas fa-video"></i>
                    <input type="file" accept="video/mp4" style={{ display: 'none' }} onChange={(e) => handleMediaSelect(e, 'video')} />
                  </label>
                </div>
              )}
            </div>
          )}
          {isRecording ? (
            <div className="recording-ui" style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '12px', padding: '0 8px' }}>
              <button
                onClick={cancelRecording}
                disabled={isSendingVoice}
                style={{ background: 'none', border: 'none', color: '#ea4b4b', fontSize: '20px', cursor: isSendingVoice ? 'not-allowed' : 'pointer', opacity: isSendingVoice ? 0.5 : 1 }}
              >
                <i className="fas fa-trash"></i>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '8px', color: '#ea4b4b' }}>
                {isSendingVoice ? (
                  <span style={{ color: '#54656f', fontSize: '14px' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Sending voice...
                  </span>
                ) : (
                  <>
                    <i className="fas fa-circle" style={{ fontSize: '10px', animation: 'pulse 1.5s infinite' }}></i>
                    <span style={{ fontWeight: 500, fontSize: '15px', color: '#3b4a54' }}>{formatRecordingTime(recordingSeconds)}</span>
                    <div style={{ flex: 1, height: '2px', background: 'rgba(234,75,75,0.3)', borderRadius: '2px' }}></div>
                  </>
                )}
              </div>
              <button
                onClick={sendVoiceMessage}
                disabled={isSendingVoice}
                style={{
                  background: isSendingVoice ? '#8696a0' : '#25d366',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  color: '#fff',
                  fontSize: '16px',
                  cursor: isSendingVoice ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          ) : (
            <>
              <div className="input-wrapper">
                <input
                  type="text"
                  placeholder="Type a message"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
              </div>
              {messageInput.trim() || activeChat.isInternal ? (
                <button
                  className="btn-send"
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  style={{ opacity: messageInput.trim() ? 1 : 0.5, cursor: messageInput.trim() ? 'pointer' : 'default' }}
                >
                  <i className="fas fa-paper-plane"></i>
                </button>
              ) : (
                <button className="btn-send" onClick={startRecording} title="Record voice message"><i className="fas fa-microphone"></i></button>
              )}
            </>
          )}
        </footer>
      </div>

      {showMediaModal && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <header className="modal-header">
              <h3>Preview Media</h3>
              <span className="close-modal" onClick={() => setShowMediaModal(false)}>&times;</span>
            </header>
            <div className="preview-container">
              {pendingMedia.type === 'image' ? <img src={URL.createObjectURL(pendingMedia.file)} alt="" /> : <video src={URL.createObjectURL(pendingMedia.file)} controls />}
            </div>
            <div className="modal-footer">
              <input type="text" placeholder="Add a caption..." value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} />
              <button className="btn-primary" onClick={handleSendMedia}>Send</button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          options={contextMenu.options}
          onClose={() => setContextMenu(null)}
        />
      )}
      <MediaModal
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        media={selectedMedia}
      />

      {showContactProfileModal && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '400px', overflow: 'hidden' }}>
            <header className="modal-header">
              <h3>Contact Info</h3>
              <span className="close-modal" onClick={() => setShowContactProfileModal(false)}>&times;</span>
            </header>
            <div className="modal-body" style={{ padding: '0' }}>
              <div style={{ padding: '30px 20px', textAlign: 'center', background: 'var(--panel-header-bg)' }}>
                {avatar ? (
                  <img src={avatar} style={{ width: '150px', height: '150px', borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--accent-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} alt="Profile" />
                ) : (
                  <i className="fas fa-user-circle" style={{ fontSize: '120px', color: '#8696a0' }}></i>
                )}
                <h2 style={{ margin: '15px 0 5px 0', fontSize: '22px', color: 'var(--text-primary)' }}>{activeChat.name || (realPhoneNumber ? `+${realPhoneNumber}` : `+${activeChat.phoneNumber.split('-')[0]}`)}</h2>

                {activeChat.isGroup && (
                  <span style={{ display: 'inline-block', marginTop: '12px', background: 'var(--panel-color-hover)', color: 'var(--text-primary)', padding: '6px 14px', borderRadius: '15px', fontSize: '13px', fontWeight: 'bold' }}>
                    <i className="fas fa-users" style={{ marginRight: '6px' }}></i> WhatsApp Group
                  </span>
                )}
              </div>

              <div style={{ padding: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#25D366' }}><i className="fas fa-address-book"></i> Profile Details</h4>
                <div style={{ background: 'var(--panel-color-hover)', padding: '16px', borderRadius: '8px', color: 'var(--text-primary)', marginBottom: '20px' }}>
                  <p style={{ margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                    <strong>Contact Name:</strong> <span style={{ float: 'right' }}>{activeChat.name || 'Unknown'}</span>
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>{activeChat.isGroup ? "Group ID:" : (activeChat.id.includes('@broadcast') ? "Broadcast ID:" : "Phone Number:")}</strong>
                    <span style={{ float: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {activeChat.isGroup ? activeChat.phoneNumber.split('-')[0] : (activeChat.id.includes('@broadcast') ? activeChat.phoneNumber : (realPhoneNumber ? `+${realPhoneNumber}` : `+${activeChat.phoneNumber}`))}
                    </span>
                  </p>
                </div>

                <h4 style={{ margin: '0 0 10px 0', color: '#25D366' }}><i className="fas fa-info-circle"></i> About</h4>
                <div style={{ background: 'var(--panel-color-hover)', padding: '16px', borderRadius: '8px', color: 'var(--text-primary)' }}>
                  {about ? (
                    <p style={{ margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{about}</p>
                  ) : (
                    <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-secondary)' }}>Hey there! I am using WhatsApp.</p>
                  )}
                </div>

                <h4 style={{ margin: '20px 0 10px 0', color: 'var(--text-secondary)' }}><i className="fas fa-wifi"></i> Status</h4>
                <div style={{ background: 'var(--panel-color-hover)', padding: '16px', borderRadius: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: presence[activeChat.id] && presence[activeChat.id] !== 'offline' ? '#25D366' : '#8696a0',
                    boxShadow: presence[activeChat.id] && presence[activeChat.id] !== 'offline' ? '0 0 8px #25D366' : 'none'
                  }}></span>
                  <span style={{ fontSize: '15px', fontWeight: '500' }}>
                    {presence[activeChat.id] && presence[activeChat.id] !== 'offline' ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Online Group Members Modal */}
      {showOnlineMembersModal && (
        <div className="modal" onClick={() => setShowOnlineMembersModal(false)} style={{ zIndex: 2000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-users" style={{ marginRight: '10px', color: '#25D366' }}></i> Online Members</h3>
              <i className="fas fa-times close-icon" onClick={() => setShowOnlineMembersModal(false)}></i>
            </div>
            <div className="modal-body" style={{ maxHeight: '300px', overflowY: 'auto', gap: 5 }}>
              {groupOnlineUsers && groupOnlineUsers.length > 0 ? (
                <div className="online-list" style={{ padding: 5 }} >
                  {groupOnlineUsers.map((username, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e9edef', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#54656f' }}>
                        <i className="fas fa-user"></i>
                      </div>
                      <div style={{ flex: 1, fontWeight: '500' }}>{username} {username === user.username && <span style={{ color: '#8696a0', fontSize: '12px' }}>(You)</span>}</div>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#25D366' }}></div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#8696a0', padding: '20px 0' }}>No members currently online.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
};

export default ChatArea;
