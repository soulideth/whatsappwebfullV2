document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatList = document.getElementById('chat-list');
    const chatSearch = document.getElementById('chat-search');
    const noChatSelected = document.getElementById('no-chat-selected');
    const activeChat = document.getElementById('active-chat');
    const chatName = document.getElementById('active-chat-name');
    const chatAbout = document.getElementById('active-chat-about');
    const chatStatus = document.getElementById('active-chat-status');
    const messageList = document.getElementById('message-list');
    const messageInput = document.getElementById('message-input');
    const btnSend = document.getElementById('btn-send');
    const btnAttach = document.getElementById('btn-attach');
    const attachmentMenu = document.getElementById('attachment-menu');
    const imageInput = document.getElementById('image-input');
    const videoInput = document.getElementById('video-input');
    const mediaModal = document.getElementById('media-modal');
    const previewContainer = document.getElementById('preview-container');
    const closeModal = document.getElementById('close-modal');
    const btnSendMedia = document.getElementById('btn-send-media');
    const mediaCaption = document.getElementById('media-caption');

    // Action Buttons
    const btnPin = document.getElementById('btn-pin');
    const btnArchive = document.getElementById('btn-archive');
    const btnMute = document.getElementById('btn-mute');

    // Context Menu Elements
    const contextMenu = document.getElementById('message-context-menu');
    const reactionPicker = document.getElementById('reaction-picker');
    const ctxReact = document.getElementById('ctx-react');
    const ctxDelete = document.getElementById('ctx-delete');

    // New Chat Elements
    const btnNewChat = document.getElementById('btn-new-chat');
    const newChatModal = document.getElementById('new-chat-modal');
    const btnStartNewChat = document.getElementById('btn-start-new-chat');
    const newChatPhone = document.getElementById('new-chat-phone');
    const newChatError = document.getElementById('new-chat-error');
    const closeNewChat = document.getElementById('close-new-chat');

    let currentChatId = null;
    let selectedMsgId = null;
    let chatsData = [];
    let pollingInterval = null;
    let pendingMediaFile = null;
    let pendingMediaType = null;
    let renderedMessageIds = new Set();

    // Auth Elements
    const authOverlay = document.getElementById('auth-overlay');
    const authQRCode = document.getElementById('auth-qrcode');
    const authStatusText = document.getElementById('auth-status');
    const btnLogout = document.getElementById('btn-logout');

    let isAuthOverlayVisible = false;
    let qrRendered = false;

    // Initialize
    fetchChats();
    checkAuthStatus();
    setInterval(checkAuthStatus, 5000);

    // Fetch All Chats
    async function fetchChats() {
        try {
            const response = await fetch('/chat/getchats');
            const data = await response.json();
            if (data.status === 'success') {
                chatsData = data.message;
                renderChatList(chatsData);
            }
        } catch (error) {
            console.error('Error fetching chats:', error);
            chatList.innerHTML = '<div class="loading-chats">Error loading chats</div>';
        }
    }

    // Render Chat List
    function renderChatList(chats) {
        chatList.innerHTML = '';
        if (chats.length === 0) {
            chatList.innerHTML = '<div class="loading-chats">No chats found</div>';
            return;
        }

        chats.forEach(async chat => {
            const chatItem = document.createElement('div');
            chatItem.className = `chat-item ${currentChatId === chat.id ? 'active' : ''} ${chat.archived ? 'archived' : ''} ${chat.pinned ? 'pinned' : ''}`;
            chatItem.dataset.id = chat.id;

            // Fetch profile pic thumbnail if possible (async)
            let avatarHtml = `<i class="fas fa-user-circle"></i>`;
            try {
                const picRes = await fetch(`/chat/getprofilepic/${chat.id}`);
                const picData = await picRes.json();
                if (picData.status === 'success' && picData.message) {
                    avatarHtml = `<img src="${picData.message}" style="width:100%; height:100%; border-radius:50%;">`;
                }
            } catch (err) { }

            chatItem.innerHTML = `
                <div class="chat-item-avatar">
                    ${avatarHtml}
                </div>
                <div class="chat-item-content">
                    <div class="chat-item-header">
                        <span class="chat-item-name">${chat.name || chat.id}</span>
                        <span class="chat-item-time">${chat.date || ''}</span>
                    </div>
                    <div class="chat-item-last-msg">${chat.lastMessage ? chat.lastMessage.body : 'No messages'}</div>
                </div>
            `;

            chatItem.addEventListener('click', () => selectChat(chat));
            chatList.appendChild(chatItem);
        });
    }

    // Search/Filter Chats
    chatSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = chatsData.filter(chat =>
            (chat.name && chat.name.toLowerCase().includes(searchTerm)) ||
            chat.id.includes(searchTerm)
        );
        renderChatList(filtered);
    });

    // Select a Chat
    async function selectChat(chat) {
        currentChatId = chat.id;

        // Update UI
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        const activeItem = document.querySelector(`.chat-item[data-id="${chat.id}"]`);
        if (activeItem) activeItem.classList.add('active');

        noChatSelected.style.display = 'none';
        activeChat.style.display = 'flex';
        chatName.textContent = chat.name || chat.id;
        chatStatus.textContent = chat.isGroup ? 'group' : 'online';

        // Fetch About and Profile Pic for header
        fetchAbout(chat.id);
        fetchHeaderProfilePic(chat.id);

        // Update Action Button States
        btnPin.classList.toggle('active', chat.pinned);
        btnArchive.classList.toggle('active', chat.archived);
        btnMute.classList.toggle('active', chat.isMuted);

        // Load messages
        await fetchMessages(chat.id);

        // Start polling for new messages
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(() => fetchMessages(chat.id, true), 3000);
    }

    // Fetch Messages for a Chat
    async function fetchMessages(phone, isPolling = false) {
        if (!phone) return;
        try {
            const response = await fetch(`/chat/getchatbyid/${phone}`);
            const data = await response.json();
            if (data.status === 'success') {
                renderMessages(data.message, isPolling);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }

    // Render Messages
    function renderMessages(messages, isPolling = false) {
        if (!isPolling) {
            messageList.innerHTML = '';
            renderedMessageIds.clear();
        }

        const shouldScroll = isPolling ?
            (messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 50) :
            true;

        messages.forEach(msg => {
            const msgId = msg.id._serialized;
            if (renderedMessageIds.has(msgId)) {
                // If message already rendered, check if body changed (e.g. deleted/edited)
                const existingMsg = document.querySelector(`.message[data-id="${msgId}"]`);
                if (existingMsg) {
                    const textDiv = existingMsg.querySelector('.message-text');
                    if (textDiv && textDiv.textContent !== (msg.body || '')) {
                        textDiv.textContent = msg.body || '';
                    }
                }
                return;
            }

            renderedMessageIds.add(msgId);
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${msg.fromMe ? 'sent' : 'received'}`;

            let content = '';
            if (msg.hasMedia) {
                // Media will be appeneded after this content string is set
                content += `<div class="message-media" data-msg-id="${msg.id._serialized}"><div class="loading-media"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>`;
            }

            content += `<div class="message-text">${msg.body || ''}</div>`;

            // Add Reactions if any
            if (msg.links && msg.links.length > 0) {
                // Logic for showing reactions could go here if exposed by API
            }

            content += `<div class="message-time">${msg.timestamp.split(' ')[1].substring(0, 5)}</div>`;

            msgDiv.innerHTML = content;
            msgDiv.dataset.id = msg.id._serialized;

            // Right click for context menu
            msgDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e.pageX, e.pageY, msg.id._serialized);
            });

            messageList.appendChild(msgDiv);
        });

        if (shouldScroll) {
            messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
        }

        // Fetch media for any media messages
        document.querySelectorAll('.message-media:not(.loaded)').forEach(container => {
            const msgId = container.dataset.msgId;
            container.classList.add('loaded');
            fetchMedia(msgId, container);
        });
    }

    async function fetchMedia(msgId, container) {
        try {
            const response = await fetch(`/chat/getmedia/${msgId}`);
            const data = await response.json();
            if (data.status === 'success') {
                const media = data.message;
                const base64Data = `data:${media.mimetype};base64,${media.data}`;

                container.innerHTML = '';
                if (media.mimetype.startsWith('image/')) {
                    const img = document.createElement('img');
                    img.src = base64Data;
                    img.style.cursor = 'pointer';
                    img.onclick = () => {
                        // Show in a simple lightbox if you want, or just open in new tab
                        const newTab = window.open();
                        newTab.document.write(`<img src="${base64Data}" style="max-width:100%;">`);
                    };
                    container.appendChild(img);
                } else if (media.mimetype.startsWith('video/')) {
                    const video = document.createElement('video');
                    video.src = base64Data;
                    video.controls = true;
                    video.style.maxWidth = '100%';
                    container.appendChild(video);
                } else if (media.mimetype.startsWith('audio/')) {
                    const audio = document.createElement('audio');
                    audio.src = base64Data;
                    audio.controls = true;
                    audio.style.maxWidth = '100%';
                    container.appendChild(audio);
                } else {
                    const link = document.createElement('a');
                    link.href = base64Data;
                    link.download = media.filename || 'file';
                    link.className = 'file-download-link';
                    link.innerHTML = `<i class="fas fa-file-download"></i> Download ${media.filename || 'File'}`;
                    container.appendChild(link);
                }
            } else {
                container.innerHTML = `<div class="media-error"><i class="fas fa-exclamation-triangle"></i> Media not found</div>`;
            }
        } catch (error) {
            console.error('Error fetching media:', error);
            container.innerHTML = `<div class="media-error"><i class="fas fa-exclamation-triangle"></i> Error loading media</div>`;
        }
    }

    // Send Message
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message || !currentChatId) return;

        messageInput.value = '';
        try {
            const response = await fetch(`/chat/sendmessage/${currentChatId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await response.json();
            if (data.status === 'success') {
                fetchMessages(currentChatId);
            } else {
                alert('Error: ' + data.message);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    btnSend.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Attachment Menu
    btnAttach.addEventListener('click', () => {
        attachmentMenu.style.display = attachmentMenu.style.display === 'none' ? 'flex' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (!btnAttach.contains(e.target) && !attachmentMenu.contains(e.target)) {
            attachmentMenu.style.display = 'none';
        }
    });

    // Media Handling
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            pendingMediaFile = file;
            pendingMediaType = 'image';
            showMediaPreview(file, 'image');
        }
        attachmentMenu.style.display = 'none';
    });

    videoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 15 * 1024 * 1024) {
                alert('Video size must be less than 15MB');
                return;
            }
            pendingMediaFile = file;
            pendingMediaType = 'video';
            showMediaPreview(file, 'video');
        }
        attachmentMenu.style.display = 'none';
    });

    function showMediaPreview(file, type) {
        previewContainer.innerHTML = '';
        const reader = new FileReader();

        reader.onload = (e) => {
            if (type === 'image') {
                const img = document.createElement('img');
                img.src = e.target.result;
                previewContainer.appendChild(img);
            } else {
                const video = document.createElement('video');
                video.src = e.target.result;
                video.controls = true;
                previewContainer.appendChild(video);
            }
            mediaModal.style.display = 'flex';
        };

        reader.readAsDataURL(file);
    }

    closeModal.addEventListener('click', () => {
        mediaModal.style.display = 'none';
        pendingMediaFile = null;
        pendingMediaType = null;
    });

    btnSendMedia.addEventListener('click', async () => {
        if (!pendingMediaFile || !currentChatId) return;

        const caption = mediaCaption.textContent;
        const formData = new FormData();

        mediaModal.style.display = 'none';

        try {
            if (pendingMediaType === 'image') {
                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = reader.result.split(',')[1];
                    const response = await fetch(`/chat/sendimage/${currentChatId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64, caption: mediaCaption.value })
                    });
                    const data = await response.json();
                    if (data.status === 'success') fetchMessages(currentChatId);
                };
                reader.readAsDataURL(pendingMediaFile);
            } else {
                const formData = new FormData();
                formData.append('video', pendingMediaFile);
                formData.append('caption', mediaCaption.value);

                const response = await fetch(`/chat/sendvideo/${currentChatId}`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                if (data.status === 'success') fetchMessages(currentChatId);
            }
        } catch (error) {
            console.error('Error sending media:', error);
        }

        mediaCaption.value = '';
    });

    // --- New Features Logic ---

    async function fetchAbout(phone) {
        chatAbout.textContent = 'Loading about...';
        try {
            const res = await fetch(`/chat/getabout/${phone}`);
            const data = await res.json();
            if (data.status === 'success') {
                chatAbout.textContent = data.message || 'No status';
            } else {
                chatAbout.textContent = '';
            }
        } catch (err) {
            chatAbout.textContent = '';
        }
    }

    async function fetchHeaderProfilePic(phone) {
        const avatarDiv = document.getElementById('active-chat-avatar');
        // Keep existing avatar if it's already an image to avoid flickers
        if (avatarDiv.querySelector('img')) return;

        try {
            const res = await fetch(`/chat/getprofilepic/${phone}`);
            const data = await res.json();
            if (data.status === 'success' && data.message) {
                avatarDiv.innerHTML = `<img src="${data.message}" style="width:40px; height:40px; border-radius:50%; object-fit: cover;">`;
            }
        } catch (err) { }
    }

    function showContextMenu(x, y, msgId) {
        selectedMsgId = msgId;
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        reactionPicker.style.display = 'none';
    }

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    ctxReact.addEventListener('click', (e) => {
        e.stopPropagation();
        reactionPicker.style.display = reactionPicker.style.display === 'none' ? 'flex' : 'none';
    });

    ctxReact.addEventListener('mouseenter', () => {
        reactionPicker.style.display = 'flex';
    });

    reactionPicker.querySelectorAll('span').forEach(span => {
        span.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!selectedMsgId || !currentChatId) return;
            const reaction = span.textContent;
            contextMenu.style.display = 'none';
            try {
                await fetch(`/chat/react/${currentChatId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ msgId: selectedMsgId, reaction })
                });
                fetchMessages(currentChatId);
            } catch (err) { console.error(err); }
        });
    });

    ctxDelete.addEventListener('click', async () => {
        if (!selectedMsgId || !currentChatId) return;
        if (confirm('Delete this message for everyone?')) {
            try {
                await fetch(`/chat/delete/${currentChatId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ msgId: selectedMsgId, everyone: true })
                });
                fetchMessages(currentChatId);
            } catch (err) { console.error(err); }
        }
    });

    // Chat Actions
    btnPin.addEventListener('click', async () => {
        if (!currentChatId) return;
        const isPinned = btnPin.classList.contains('active');
        const endpoint = isPinned ? 'unpin' : 'pin';
        try {
            const res = await fetch(`/chat/${endpoint}/${currentChatId}`, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                btnPin.classList.toggle('active');
                fetchChats();
            }
        } catch (err) { console.error(err); }
    });

    btnArchive.addEventListener('click', async () => {
        if (!currentChatId) return;
        const isArchived = btnArchive.classList.contains('active');
        const endpoint = isArchived ? 'unarchive' : 'archive';
        try {
            const res = await fetch(`/chat/${endpoint}/${currentChatId}`, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                btnArchive.classList.toggle('active');
                fetchChats();
            }
        } catch (err) { console.error(err); }
    });

    btnMute.addEventListener('click', async () => {
        if (!currentChatId) return;
        const isMuted = btnMute.classList.contains('active');
        if (isMuted) {
            // Logic for unmuting: mute(null) or a separate endpoint
            try {
                const res = await fetch(`/chat/mute/${currentChatId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ unmuteDate: new Date(0) }) // Past date to unmute
                });
                const data = await res.json();
                if (data.status === 'success') {
                    btnMute.classList.remove('active');
                }
            } catch (err) { console.error(err); }
        } else {
            try {
                const res = await fetch(`/chat/mute/${currentChatId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ unmuteDate: null }) // Forever
                });
                const data = await res.json();
                if (data.status === 'success') {
                    btnMute.classList.add('active');
                }
            } catch (err) { console.error(err); }
        }
    });

    // New Chat Logic
    btnNewChat.addEventListener('click', () => {
        newChatModal.style.display = 'flex';
        newChatPhone.value = '';
        newChatError.style.display = 'none';
        newChatPhone.focus();
    });

    closeNewChat.addEventListener('click', () => {
        newChatModal.style.display = 'none';
    });

    btnStartNewChat.addEventListener('click', async () => {
        const phone = newChatPhone.value.trim();
        if (!phone) return;

        newChatError.textContent = 'Checking number...';
        newChatError.style.color = 'var(--text-secondary)';
        newChatError.style.display = 'block';

        try {
            const res = await fetch(`/chat/checknumber/${phone}`);
            const data = await res.json();

            if (data.status === 'success') {
                if (data.message === true) {
                    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
                    const newChatObj = {
                        id: chatId,
                        name: phone,
                        isGroup: false
                    };

                    // Add to list if not present
                    if (!chatsData.find(c => c.id === chatId)) {
                        chatsData.unshift(newChatObj);
                        renderChatList(chatsData);
                    }

                    selectChat(newChatObj);
                    newChatModal.style.display = 'none';
                } else {
                    newChatError.textContent = 'This number is not registered on WhatsApp.';
                    newChatError.style.color = 'red';
                }
            } else {
                newChatError.textContent = 'Error: ' + data.message;
                newChatError.style.color = 'red';
            }
        } catch (err) {
            newChatError.textContent = 'Failed to check number.';
            newChatError.style.color = 'red';
        }
    });

    // --- Authentication Logic ---

    async function checkAuthStatus() {
        try {
            const res = await fetch('/auth/status');
            const data = await res.json();

            if (data.status === 'success') {
                if (!data.authenticated) {
                    showAuthOverlay();
                    fetchQRData();
                } else {
                    hideAuthOverlay();
                    if (chatsData.length === 0) fetchChats();
                }
            }
        } catch (err) {
            console.error("Auth check failed:", err);
        }
    }

    function showAuthOverlay() {
        if (!isAuthOverlayVisible) {
            authOverlay.style.display = 'flex';
            isAuthOverlayVisible = true;
        }
    }

    function hideAuthOverlay() {
        if (isAuthOverlayVisible) {
            authOverlay.style.display = 'none';
            isAuthOverlayVisible = false;
            qrRendered = false;
            authQRCode.innerHTML = '';
        }
    }

    async function fetchQRData() {
        if (qrRendered) return;
        try {
            const res = await fetch('/auth/qrdata');
            const data = await res.json();
            if (data.status === 'success' && data.qr) {
                authQRCode.innerHTML = '';
                new QRCode(authQRCode, {
                    text: data.qr,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
                authStatusText.innerHTML = '<i class="fas fa-check-circle"></i> QR Code ready. Please scan with WhatsApp.';
                qrRendered = true;
            } else {
                authStatusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating QR code...';
            }
        } catch (err) {
            authStatusText.textContent = "Error loading QR code.";
        }
    }

    const logoutConfirmModal = document.getElementById('logout-confirm-modal');
    const btnConfirmLogout = document.getElementById('btn-confirm-logout');
    const btnCancelLogout = document.getElementById('btn-cancel-logout');

    if (btnLogout) {
        console.log("Logout button detected and listener attached.");
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Logout icon clicked, showing confirmation modal.");
            logoutConfirmModal.style.display = 'flex';
        });
    }

    if (btnCancelLogout) {
        btnCancelLogout.addEventListener('click', () => {
            logoutConfirmModal.style.display = 'none';
        });
    }

    if (btnConfirmLogout) {
        btnConfirmLogout.addEventListener('click', async () => {
            console.log("Logout confirmed, starting process...");
            logoutConfirmModal.style.display = 'none';
            
            try {
                authOverlay.style.display = 'flex';
                authStatusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out and clearing data...';
                authQRCode.innerHTML = '';
                
                const res = await fetch('/auth/logout', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    console.log("Logout successful, reloading...");
                    window.location.reload();
                } else {
                    console.error("Logout response error:", data);
                    alert('Logout failed: ' + (data.message || 'Unknown error'));
                    isAuthOverlayVisible = false;
                    checkAuthStatus();
                }
            } catch (err) {
                console.error("Logout interaction error:", err);
                alert('Logout error: ' + err.message);
                isAuthOverlayVisible = false;
                checkAuthStatus();
            }
        });
    }

});
