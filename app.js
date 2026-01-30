// Chatter - チャットアプリケーション

// ========== 設定 ==========
// サイトエントリーパスワード（10桁の数字）- ここを変更してください
const SITE_PASSWORD = '1234567890';

// ========== データ管理 ==========
const Storage = {
    getUsers() {
        return JSON.parse(localStorage.getItem('chatter_users') || '{}');
    },
    saveUsers(users) {
        localStorage.setItem('chatter_users', JSON.stringify(users));
    },
    getRooms() {
        return JSON.parse(localStorage.getItem('chatter_rooms') || '{}');
    },
    saveRooms(rooms) {
        localStorage.setItem('chatter_rooms', JSON.stringify(rooms));
    },
    getCurrentUser() {
        return JSON.parse(sessionStorage.getItem('chatter_currentUser') || 'null');
    },
    setCurrentUser(user) {
        sessionStorage.setItem('chatter_currentUser', JSON.stringify(user));
    },
    clearCurrentUser() {
        sessionStorage.removeItem('chatter_currentUser');
    },
    isEntryVerified() {
        return sessionStorage.getItem('chatter_entry') === 'verified';
    },
    setEntryVerified() {
        sessionStorage.setItem('chatter_entry', 'verified');
    },
    getSettings() {
        return JSON.parse(localStorage.getItem('chatter_settings') || '{"theme":"light","fontSize":"medium"}');
    },
    saveSettings(settings) {
        localStorage.setItem('chatter_settings', JSON.stringify(settings));
    }
};

// ========== ユーティリティ ==========
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ========== 画面管理 ==========
let currentRoom = null;
let messagePollingInterval = null;

// エントリーパスワード画面
function initEntryScreen() {
    const entryBtn = document.getElementById('entry-btn');
    const entryPassword = document.getElementById('entry-password');
    const entryError = document.getElementById('entry-error');

    entryBtn.addEventListener('click', () => {
        const password = entryPassword.value;

        if (password.length !== 10) {
            entryError.textContent = 'パスワードは10桁の数字です';
            return;
        }

        if (!/^\d+$/.test(password)) {
            entryError.textContent = '数字のみ入力してください';
            return;
        }

        if (password !== SITE_PASSWORD) {
            entryError.textContent = 'パスワードが正しくありません';
            return;
        }

        Storage.setEntryVerified();
        checkAuthAndNavigate();
    });

    entryPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') entryBtn.click();
    });
}

// 認証画面
function initAuthScreen() {
    // タブ切り替え
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
        });
    });

    // ログイン
    const loginBtn = document.getElementById('login-btn');
    const loginName = document.getElementById('login-name');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');

    loginBtn.addEventListener('click', () => {
        const name = loginName.value.trim();
        const password = loginPassword.value;

        if (!name || !password) {
            loginError.textContent = 'ユーザー名とパスワードを入力してください';
            return;
        }

        const users = Storage.getUsers();
        if (!users[name] || users[name].password !== password) {
            loginError.textContent = 'ユーザー名またはパスワードが正しくありません';
            return;
        }

        Storage.setCurrentUser({ name });
        showLobby();
    });

    // 登録
    const registerBtn = document.getElementById('register-btn');
    const registerName = document.getElementById('register-name');
    const registerPassword = document.getElementById('register-password');
    const registerPasswordConfirm = document.getElementById('register-password-confirm');
    const registerError = document.getElementById('register-error');

    registerBtn.addEventListener('click', () => {
        const name = registerName.value.trim();
        const password = registerPassword.value;
        const confirm = registerPasswordConfirm.value;

        if (name.length < 3) {
            registerError.textContent = 'ユーザー名は3文字以上で入力してください';
            return;
        }

        if (password.length < 4) {
            registerError.textContent = 'パスワードは4文字以上で入力してください';
            return;
        }

        if (password !== confirm) {
            registerError.textContent = 'パスワードが一致しません';
            return;
        }

        const users = Storage.getUsers();
        if (users[name]) {
            registerError.textContent = 'このユーザー名は既に使用されています';
            return;
        }

        users[name] = { password, rooms: [] };
        Storage.saveUsers(users);
        Storage.setCurrentUser({ name });
        showLobby();
    });

    // Enterキーでの送信
    [loginName, loginPassword].forEach(el => {
        el.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loginBtn.click();
        });
    });

    [registerName, registerPassword, registerPasswordConfirm].forEach(el => {
        el.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') registerBtn.click();
        });
    });
}

// ロビー画面
function initLobbyScreen() {
    const logoutBtn = document.getElementById('logout-btn');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const roomName = document.getElementById('room-name');
    const joinCode = document.getElementById('join-code');

    logoutBtn.addEventListener('click', () => {
        Storage.clearCurrentUser();
        showScreen('auth-screen');
    });

    createRoomBtn.addEventListener('click', () => {
        const name = roomName.value.trim();
        const roomCodeInput = document.getElementById('room-code-input');
        const createError = document.getElementById('create-error');

        if (!name) {
            createError.textContent = 'ルーム名を入力してください';
            return;
        }

        const rooms = Storage.getRooms();
        let code;

        // ユーザーがコードを入力した場合
        const userCode = roomCodeInput.value.trim().toUpperCase();
        if (userCode) {
            // 6桁の英数字かチェック
            if (!/^[A-Z0-9]{6}$/.test(userCode)) {
                createError.textContent = 'コードは6桁の英数字で入力してください';
                return;
            }
            // 既に使われているかチェック
            if (rooms[userCode]) {
                createError.textContent = 'このコードは既に使用されています';
                return;
            }
            code = userCode;
        } else {
            // 自動生成
            do {
                code = generateRoomCode();
            } while (rooms[code]);
        }

        const currentUser = Storage.getCurrentUser();
        rooms[code] = {
            name,
            code,
            creator: currentUser.name,
            messages: [{
                type: 'system',
                text: `${currentUser.name}さんがルームを作成しました`,
                timestamp: Date.now()
            }],
            members: [currentUser.name]
        };
        Storage.saveRooms(rooms);

        // ユーザーのルームリストに追加
        const users = Storage.getUsers();
        if (!users[currentUser.name].rooms) {
            users[currentUser.name].rooms = [];
        }
        if (!users[currentUser.name].rooms.includes(code)) {
            users[currentUser.name].rooms.push(code);
        }
        Storage.saveUsers(users);

        // コード表示
        document.getElementById('generated-code').textContent = code;
        document.getElementById('room-code-display').classList.remove('hidden');
        createError.textContent = '';
        roomName.value = '';
        roomCodeInput.value = '';

        updateMyRooms();
    });

    copyCodeBtn.addEventListener('click', () => {
        const code = document.getElementById('generated-code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            copyCodeBtn.textContent = 'コピーしました!';
            setTimeout(() => {
                copyCodeBtn.textContent = 'コピー';
            }, 2000);
        });
    });

    joinRoomBtn.addEventListener('click', () => {
        const code = joinCode.value.trim().toUpperCase();
        const joinError = document.getElementById('join-error');

        if (code.length !== 6) {
            joinError.textContent = '6桁のコードを入力してください';
            return;
        }

        const rooms = Storage.getRooms();
        if (!rooms[code]) {
            joinError.textContent = 'ルームが見つかりません';
            return;
        }

        const currentUser = Storage.getCurrentUser();

        // メンバーに追加
        if (!rooms[code].members.includes(currentUser.name)) {
            rooms[code].members.push(currentUser.name);
            rooms[code].messages.push({
                type: 'system',
                text: `${currentUser.name}さんが入室しました`,
                timestamp: Date.now()
            });
            Storage.saveRooms(rooms);
        }

        // ユーザーのルームリストに追加
        const users = Storage.getUsers();
        if (!users[currentUser.name].rooms) {
            users[currentUser.name].rooms = [];
        }
        if (!users[currentUser.name].rooms.includes(code)) {
            users[currentUser.name].rooms.push(code);
        }
        Storage.saveUsers(users);

        joinCode.value = '';
        joinError.textContent = '';
        enterRoom(code);
    });

    joinCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoomBtn.click();
    });
}

function showLobby() {
    const currentUser = Storage.getCurrentUser();
    document.getElementById('current-user').textContent = currentUser.name;
    document.getElementById('room-code-display').classList.add('hidden');
    updateMyRooms();
    showScreen('lobby-screen');
}

function updateMyRooms() {
    const myRoomsContainer = document.getElementById('my-rooms');
    const currentUser = Storage.getCurrentUser();
    const users = Storage.getUsers();
    const rooms = Storage.getRooms();

    const userRooms = users[currentUser.name]?.rooms || [];

    if (userRooms.length === 0) {
        myRoomsContainer.innerHTML = '<p style="color: #888; text-align: center;">参加中のルームはありません</p>';
        return;
    }

    myRoomsContainer.innerHTML = userRooms
        .filter(code => rooms[code])
        .map(code => {
            const room = rooms[code];
            return `
                <div class="room-item">
                    <div class="room-info">
                        <span class="room-name">${room.name}</span>
                        <span class="room-code">${room.code}</span>
                    </div>
                    <button class="btn small" onclick="enterRoom('${room.code}')">入る</button>
                </div>
            `;
        }).join('');
}

// チャット画面
function initChatScreen() {
    const backBtn = document.getElementById('back-to-lobby');
    const sendBtn = document.getElementById('send-btn');
    const messageInput = document.getElementById('message-input');
    const menuBtn = document.getElementById('menu-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const roomInfoBtn = document.getElementById('room-info-btn');

    backBtn.addEventListener('click', () => {
        if (messagePollingInterval) {
            clearInterval(messagePollingInterval);
            messagePollingInterval = null;
        }
        currentRoom = null;
        showLobby();
    });

    // メニュー開閉
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
    });

    // メニュー外クリックで閉じる
    document.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
    });

    dropdownMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // ルーム情報
    roomInfoBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        showRoomInfo();
    });

    // 設定
    settingsBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        showSettings();
    });

    // 退出
    leaveRoomBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        leaveRoom();
    });

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function leaveRoom() {
    if (!currentRoom) return;
    showConfirm('このルームから退出しますか？', doLeaveRoom);
}

function doLeaveRoom() {
    const currentUser = Storage.getCurrentUser();
    const rooms = Storage.getRooms();
    const users = Storage.getUsers();

    // ルームのメンバーリストから削除
    if (rooms[currentRoom]) {
        rooms[currentRoom].members = rooms[currentRoom].members.filter(
            name => name !== currentUser.name
        );
        rooms[currentRoom].messages.push({
            type: 'system',
            text: `${currentUser.name}さんが退出しました`,
            timestamp: Date.now()
        });
        Storage.saveRooms(rooms);
    }

    // ユーザーのルームリストから削除
    if (users[currentUser.name]?.rooms) {
        users[currentUser.name].rooms = users[currentUser.name].rooms.filter(
            code => code !== currentRoom
        );
        Storage.saveUsers(users);
    }

    // ポーリング停止してロビーへ
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
    currentRoom = null;
    showLobby();
}

// カスタム確認モーダル
let confirmCallback = null;

function showConfirm(message, callback) {
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function initConfirmModal() {
    const confirmModal = document.getElementById('confirm-modal');
    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');

    confirmOk.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
    });

    confirmCancel.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    });

    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        }
    });
}

function showRoomInfo() {
    const rooms = Storage.getRooms();
    const room = rooms[currentRoom];
    if (!room) return;

    document.getElementById('info-room-name').textContent = room.name;
    document.getElementById('info-room-code').textContent = room.code;
    document.getElementById('info-room-creator').textContent = room.creator;
    document.getElementById('info-room-members').textContent = room.members.join(', ');

    document.getElementById('room-info-modal').classList.remove('hidden');
}

function showSettings() {
    const settings = Storage.getSettings();

    // 現在の設定をUIに反映
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === settings.fontSize);
    });

    document.getElementById('settings-modal').classList.remove('hidden');
}

function initSettings() {
    const settingsModal = document.getElementById('settings-modal');
    const roomInfoModal = document.getElementById('room-info-modal');
    const closeSettings = document.getElementById('close-settings');
    const closeRoomInfo = document.getElementById('close-room-info');

    // モーダルを閉じる
    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    closeRoomInfo.addEventListener('click', () => {
        roomInfoModal.classList.add('hidden');
    });

    // モーダル背景クリックで閉じる
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    roomInfoModal.addEventListener('click', (e) => {
        if (e.target === roomInfoModal) {
            roomInfoModal.classList.add('hidden');
        }
    });

    // テーマ切り替え
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            const settings = Storage.getSettings();
            settings.theme = theme;
            Storage.saveSettings(settings);
            applySettings();

            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // フォントサイズ切り替え
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.dataset.size;
            const settings = Storage.getSettings();
            settings.fontSize = size;
            Storage.saveSettings(settings);
            applySettings();

            document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 初期設定を適用
    applySettings();
}

function applySettings() {
    const settings = Storage.getSettings();

    // テーマ
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-blue', 'theme-green');
    if (settings.theme !== 'light') {
        document.body.classList.add(`theme-${settings.theme}`);
    }

    // フォントサイズ
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${settings.fontSize}`);
}

function enterRoom(code) {
    const rooms = Storage.getRooms();
    const room = rooms[code];

    if (!room) return;

    currentRoom = code;
    document.getElementById('room-title').textContent = room.name;
    document.getElementById('room-code-info').textContent = room.code;

    showScreen('chat-screen');
    renderMessages();

    // メッセージのポーリング開始
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }
    messagePollingInterval = setInterval(renderMessages, 1000);
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text || !currentRoom) return;

    const currentUser = Storage.getCurrentUser();
    const rooms = Storage.getRooms();

    if (!rooms[currentRoom]) return;

    rooms[currentRoom].messages.push({
        type: 'user',
        sender: currentUser.name,
        text,
        timestamp: Date.now()
    });

    Storage.saveRooms(rooms);
    input.value = '';
    renderMessages();
}

function renderMessages() {
    const container = document.getElementById('messages');
    const rooms = Storage.getRooms();
    const room = rooms[currentRoom];
    const currentUser = Storage.getCurrentUser();

    if (!room) return;

    container.innerHTML = room.messages.map(msg => {
        if (msg.type === 'system') {
            return `<div class="message system">${msg.text}</div>`;
        }

        const isOwn = msg.sender === currentUser.name;
        return `
            <div class="message ${isOwn ? 'own' : 'other'}">
                ${!isOwn ? `<div class="sender">${msg.sender}</div>` : ''}
                <div class="text">${escapeHtml(msg.text)}</div>
                <div class="time">${formatTime(msg.timestamp)}</div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== 初期化 ==========
function checkAuthAndNavigate() {
    if (!Storage.isEntryVerified()) {
        showScreen('entry-screen');
        return;
    }

    const currentUser = Storage.getCurrentUser();
    if (currentUser) {
        showLobby();
    } else {
        showScreen('auth-screen');
    }
}

// storageイベントでリアルタイム同期
window.addEventListener('storage', (e) => {
    if (e.key === 'chatter_rooms' && currentRoom) {
        renderMessages();
    }
});

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initEntryScreen();
    initAuthScreen();
    initLobbyScreen();
    initChatScreen();
    initSettings();
    initConfirmModal();
    checkAuthAndNavigate();
});

// グローバル関数として公開（HTMLから呼び出し用）
window.enterRoom = enterRoom;
