// StudyBoard - グループ学習ノートアプリケーション
// Firebase専用版 v2.5.0

// ========== 設定 ==========
const EMAIL_DOMAIN = 'studyboard.local'; // Firebase Auth用メールドメイン
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_MESSAGES = 100; // グループあたりの最大メッセージ数
const MAX_TEXT_LENGTH = 500; // メッセージの最大文字数

// ========== Firebase初期化 ==========
let db = null;
let auth = null;

function initFirebase() {
    if (typeof firebaseConfig === 'undefined' || typeof firebase === 'undefined') {
        alert('Firebase設定が見つかりません。index.htmlのfirebaseConfigを確認してください。');
        return false;
    }
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
        alert('Firebase APIキーが設定されていません。');
        return false;
    }
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();
        return true;
    } catch (error) {
        console.error('Firebase初期化エラー:', error);
        alert('Firebaseの初期化に失敗しました。');
        return false;
    }
}

// ========== データ管理 ==========
const Storage = {
    // ローカル設定（テーマ・フォントサイズ）
    getSettings() {
        return JSON.parse(localStorage.getItem('sb_settings') || '{"theme":"light","fontSize":"medium"}');
    },
    saveSettings(settings) {
        localStorage.setItem('sb_settings', JSON.stringify(settings));
    },

    // 既読管理
    getReadCounts() {
        return JSON.parse(localStorage.getItem('sb_readCounts') || '{}');
    },
    setReadCount(groupCode, count) {
        const readCounts = this.getReadCounts();
        readCounts[groupCode] = count;
        localStorage.setItem('sb_readCounts', JSON.stringify(readCounts));
    },
    getUnreadCount(groupCode, totalCount) {
        const readCounts = this.getReadCounts();
        const lastRead = readCounts[groupCode] || 0;
        return Math.max(0, totalCount - lastRead);
    },

    // 通知設定
    getNotificationSettings() {
        return JSON.parse(localStorage.getItem('sb_notifications') || '{}');
    },
    isNotificationEnabled(groupCode) {
        const settings = this.getNotificationSettings();
        return settings[groupCode] === true;
    },
    setNotificationEnabled(groupCode, enabled) {
        const settings = this.getNotificationSettings();
        settings[groupCode] = enabled;
        localStorage.setItem('sb_notifications', JSON.stringify(settings));
    },

    // 現在のユーザー
    getCurrentUser() {
        if (auth.currentUser) {
            return {
                name: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
                uid: auth.currentUser.uid,
                email: auth.currentUser.email
            };
        }
        return null;
    },

    // Firebase操作 - ユーザーグループ
    async getUserGroups(uid) {
        const snapshot = await db.ref('userGroups/' + uid).once('value');
        return snapshot.val() || [];
    },
    async saveUserGroups(uid, groups) {
        await db.ref('userGroups/' + uid).set(groups);
    },

    // Firebase操作 - グループ
    async getGroups() {
        const snapshot = await db.ref('groups').once('value');
        return snapshot.val() || {};
    },
    async saveGroup(code, groupData) {
        await db.ref('groups/' + code).set(groupData);
    },
    async getGroup(code) {
        const snapshot = await db.ref('groups/' + code).once('value');
        return snapshot.val();
    },
    async addNote(code, note) {
        const notesRef = db.ref('groups/' + code + '/notes');
        await notesRef.push(note);
        await this.trimOldNotes(code);
    },
    async trimOldNotes(code) {
        const notesRef = db.ref('groups/' + code + '/notes');
        const snapshot = await notesRef.once('value');
        const notes = snapshot.val();
        if (!notes) return;
        const keys = Object.keys(notes);
        if (keys.length > MAX_MESSAGES) {
            const deleteCount = keys.length - MAX_MESSAGES;
            const keysToDelete = keys.slice(0, deleteCount);
            const updates = {};
            keysToDelete.forEach(key => {
                updates[key] = null;
            });
            await notesRef.update(updates);
        }
    }
};

// ========== 通知システム ==========
const Notification = {
    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('このブラウザは通知をサポートしていません');
            return false;
        }
        if (window.Notification.permission === 'granted') {
            return true;
        }
        if (window.Notification.permission !== 'denied') {
            const permission = await window.Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    },

    async send(title, body, groupCode) {
        if (!('Notification' in window)) return;
        if (window.Notification.permission !== 'granted') return;
        if (document.visibilityState === 'visible' && currentGroup === groupCode) return;

        try {
            const notification = new window.Notification(title, {
                body: body,
                icon: 'favicon.svg',
                tag: groupCode,
                renotify: true
            });

            notification.onclick = () => {
                window.focus();
                if (groupCode && groupCode !== currentGroup) {
                    enterGroup(groupCode);
                }
                notification.close();
            };

            setTimeout(() => notification.close(), 5000);
        } catch (error) {
            console.error('通知エラー:', error);
        }
    }
};

// ========== ユーティリティ ==========
function generateCode() {
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

function showLoading(show) {
    document.querySelectorAll('.btn.primary').forEach(btn => {
        btn.disabled = show;
    });
}

function getFirebaseErrorMessage(errorCode) {
    const messages = {
        'auth/email-already-in-use': 'このニックネームは既に使用されています',
        'auth/invalid-email': 'ニックネームが無効です',
        'auth/weak-password': 'パスワードは6文字以上で入力してください',
        'auth/user-not-found': 'ユーザーが見つかりません',
        'auth/wrong-password': 'パスワードが正しくありません',
        'auth/invalid-credential': 'ニックネームまたはパスワードが正しくありません',
        'auth/too-many-requests': 'しばらく時間をおいてから再度お試しください'
    };
    return messages[errorCode] || '接続エラーが発生しました';
}

// ========== 画面管理 ==========
let currentGroup = null;
let groupListener = null;

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

    loginBtn.addEventListener('click', async () => {
        const name = loginName.value.trim();
        const password = loginPassword.value;

        if (!name || !password) {
            loginError.textContent = 'ニックネームとパスワードを入力してください';
            return;
        }

        showLoading(true);
        loginError.textContent = '';

        const email = `${name}@${EMAIL_DOMAIN}`;
        try {
            await auth.signInWithEmailAndPassword(email, password);
            showLobby();
        } catch (error) {
            loginError.textContent = getFirebaseErrorMessage(error.code);
            console.error(error);
        }
        showLoading(false);
    });

    // 登録
    const registerBtn = document.getElementById('register-btn');
    const registerName = document.getElementById('register-name');
    const registerPassword = document.getElementById('register-password');
    const registerPasswordConfirm = document.getElementById('register-password-confirm');
    const registerError = document.getElementById('register-error');

    registerBtn.addEventListener('click', async () => {
        const name = registerName.value.trim();
        const password = registerPassword.value;
        const confirm = registerPasswordConfirm.value;

        if (name.length < 3) {
            registerError.textContent = 'ニックネームは3文字以上で入力してください';
            return;
        }

        if (password.length < 6) {
            registerError.textContent = 'パスワードは6文字以上で入力してください';
            return;
        }

        if (password !== confirm) {
            registerError.textContent = 'パスワードが一致しません';
            return;
        }

        showLoading(true);
        registerError.textContent = '';

        const email = `${name}@${EMAIL_DOMAIN}`;
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.updateProfile({ displayName: name });
            await Storage.saveUserGroups(userCredential.user.uid, []);
            showLobby();
        } catch (error) {
            registerError.textContent = getFirebaseErrorMessage(error.code);
            console.error(error);
        }
        showLoading(false);
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
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const groupName = document.getElementById('room-name');
    const joinCode = document.getElementById('join-code');

    logoutBtn.addEventListener('click', async () => {
        await auth.signOut();
        showScreen('auth-screen');
    });

    createBtn.addEventListener('click', async () => {
        const name = groupName.value.trim();
        const codeInput = document.getElementById('room-code-input');
        const createError = document.getElementById('create-error');

        if (!name) {
            createError.textContent = 'グループ名を入力してください';
            return;
        }

        showLoading(true);
        try {
            const groups = await Storage.getGroups();
            let code;

            const userCode = codeInput.value.trim().toUpperCase();
            if (userCode) {
                if (!/^[A-Z0-9]{6}$/.test(userCode)) {
                    createError.textContent = 'コードは6桁の英数字で入力してください';
                    showLoading(false);
                    return;
                }
                if (groups[userCode]) {
                    createError.textContent = 'このコードは既に使用されています';
                    showLoading(false);
                    return;
                }
                code = userCode;
            } else {
                do {
                    code = generateCode();
                } while (groups[code]);
            }

            const currentUser = Storage.getCurrentUser();
            const newGroup = {
                name,
                code,
                creator: currentUser.name,
                notes: [{
                    type: 'system',
                    text: `${currentUser.name}さんがグループを作成しました`,
                    timestamp: Date.now(),
                    sender: currentUser.name
                }],
                members: [currentUser.name]
            };
            await Storage.saveGroup(code, newGroup);

            const userGroups = await Storage.getUserGroups(currentUser.uid);
            if (!userGroups.includes(code)) {
                userGroups.push(code);
            }
            await Storage.saveUserGroups(currentUser.uid, userGroups);

            document.getElementById('generated-code').textContent = code;
            document.getElementById('room-code-display').classList.remove('hidden');
            createError.textContent = '';
            groupName.value = '';
            codeInput.value = '';

            await updateMyGroups();
        } catch (error) {
            createError.textContent = '接続エラーが発生しました';
            console.error(error);
        }
        showLoading(false);
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

    joinBtn.addEventListener('click', async () => {
        const code = joinCode.value.trim().toUpperCase();
        const joinError = document.getElementById('join-error');

        if (code.length !== 6) {
            joinError.textContent = '6桁のコードを入力してください';
            return;
        }

        showLoading(true);
        try {
            const group = await Storage.getGroup(code);
            if (!group) {
                joinError.textContent = 'グループが見つかりません';
                showLoading(false);
                return;
            }

            const currentUser = Storage.getCurrentUser();

            if (!group.members.includes(currentUser.name)) {
                group.members.push(currentUser.name);
                const joinNote = {
                    type: 'system',
                    text: `${currentUser.name}さんが参加しました`,
                    timestamp: Date.now(),
                    sender: currentUser.name
                };

                await db.ref('groups/' + code + '/members').set(group.members);
                await db.ref('groups/' + code + '/notes').push(joinNote);
            }

            const userGroups = await Storage.getUserGroups(currentUser.uid);
            if (!userGroups.includes(code)) {
                userGroups.push(code);
            }
            await Storage.saveUserGroups(currentUser.uid, userGroups);

            joinCode.value = '';
            joinError.textContent = '';
            enterGroup(code);
        } catch (error) {
            joinError.textContent = '接続エラーが発生しました';
            console.error(error);
        }
        showLoading(false);
    });

    joinCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinBtn.click();
    });
}

async function showLobby() {
    const currentUser = Storage.getCurrentUser();
    document.getElementById('current-user').textContent = currentUser.name;
    document.getElementById('room-code-display').classList.add('hidden');
    await updateMyGroups();
    showScreen('lobby-screen');
}

async function updateMyGroups() {
    const container = document.getElementById('my-rooms');
    const currentUser = Storage.getCurrentUser();

    try {
        const userGroups = await Storage.getUserGroups(currentUser.uid);
        const groups = await Storage.getGroups();

        if (!userGroups || userGroups.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">参加中のグループはありません</p>';
            return;
        }

        container.innerHTML = userGroups
            .filter(code => groups[code])
            .map(code => {
                const group = groups[code];
                const noteCount = group.notes ? (Array.isArray(group.notes) ? group.notes.length : Object.keys(group.notes).length) : 0;
                const unreadCount = Storage.getUnreadCount(code, noteCount);
                const unreadBadge = unreadCount > 0
                    ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
                    : '';
                return `
                    <div class="room-item">
                        <div class="room-info">
                            <span class="room-name">${group.name}${unreadBadge}</span>
                            <span class="room-code">${group.code}</span>
                        </div>
                        <button class="btn small" onclick="enterGroup('${group.code}')">開く</button>
                    </div>
                `;
            }).join('');
    } catch (error) {
        container.innerHTML = '<p style="color: #d32f2f; text-align: center;">データの読み込みに失敗しました</p>';
        console.error(error);
    }
}

// ノート画面
function initChatScreen() {
    const backBtn = document.getElementById('back-to-lobby');
    const sendBtn = document.getElementById('send-btn');
    const noteInput = document.getElementById('message-input');
    const menuBtn = document.getElementById('menu-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const leaveBtn = document.getElementById('leave-room-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const infoBtn = document.getElementById('room-info-btn');

    backBtn.addEventListener('click', () => {
        stopGroupListener();
        currentGroup = null;
        showLobby();
    });

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
    });

    dropdownMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    infoBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        showGroupInfo();
    });

    settingsBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        showSettings();
    });

    leaveBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        leaveGroup();
    });

    sendBtn.addEventListener('click', sendNote);
    noteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendNote();
    });

    // 画像アップロード
    const imageInput = document.getElementById('image-input');
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('画像ファイルを選択してください');
            imageInput.value = '';
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            alert('画像サイズは5MB以下にしてください');
            imageInput.value = '';
            return;
        }

        await sendImage(file);
        imageInput.value = '';
    });
}

async function sendImage(file) {
    if (!currentGroup) return;

    const currentUser = Storage.getCurrentUser();
    const timestamp = Date.now();

    const sendBtn = document.getElementById('send-btn');
    const imageBtn = document.querySelector('.image-upload-btn');
    sendBtn.disabled = true;
    imageBtn.classList.add('uploading');

    try {
        const imageUrl = await fileToBase64(file);

        const note = {
            type: 'image',
            sender: currentUser.name,
            imageUrl: imageUrl,
            timestamp: timestamp
        };

        await Storage.addNote(currentGroup, note);
    } catch (error) {
        console.error('画像送信エラー:', error);
        alert('画像の送信に失敗しました');
    } finally {
        sendBtn.disabled = false;
        imageBtn.classList.remove('uploading');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function leaveGroup() {
    if (!currentGroup) return;
    showConfirm('このグループから退出しますか？', doLeaveGroup);
}

async function doLeaveGroup() {
    const currentUser = Storage.getCurrentUser();

    try {
        const group = await Storage.getGroup(currentGroup);
        const userGroups = await Storage.getUserGroups(currentUser.uid);

        if (group) {
            group.members = group.members.filter(name => name !== currentUser.name);

            if (group.members.length === 0) {
                // メンバーがいなくなったらグループを削除
                await db.ref('groups/' + currentGroup).remove();
            } else {
                // まだメンバーがいる場合は通常の退出処理
                const leaveNote = {
                    type: 'system',
                    text: `${currentUser.name}さんが退出しました`,
                    timestamp: Date.now(),
                    sender: currentUser.name
                };
                await db.ref('groups/' + currentGroup + '/members').set(group.members);
                await db.ref('groups/' + currentGroup + '/notes').push(leaveNote);
            }
        }

        if (userGroups) {
            const newGroups = userGroups.filter(code => code !== currentGroup);
            await Storage.saveUserGroups(currentUser.uid, newGroups);
        }

        stopGroupListener();
        currentGroup = null;
        showLobby();
    } catch (error) {
        console.error('退出エラー:', error);
    }
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

async function showGroupInfo() {
    try {
        const group = await Storage.getGroup(currentGroup);
        if (!group) return;

        document.getElementById('info-room-name').textContent = group.name;
        document.getElementById('info-room-code').textContent = group.code;
        document.getElementById('info-room-creator').textContent = group.creator;
        document.getElementById('info-room-members').textContent = group.members.join(', ');

        const notificationToggle = document.getElementById('notification-toggle');
        notificationToggle.checked = Storage.isNotificationEnabled(currentGroup);

        document.getElementById('room-info-modal').classList.remove('hidden');
    } catch (error) {
        console.error('グループ情報取得エラー:', error);
    }
}

function showSettings() {
    const settings = Storage.getSettings();

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === settings.fontSize);
    });

    const settingsNotificationToggle = document.getElementById('settings-notification-toggle');
    settingsNotificationToggle.checked = Storage.isNotificationEnabled(currentGroup);

    document.getElementById('settings-modal').classList.remove('hidden');
}

function initSettings() {
    const settingsModal = document.getElementById('settings-modal');
    const infoModal = document.getElementById('room-info-modal');
    const closeSettings = document.getElementById('close-settings');
    const closeInfo = document.getElementById('close-room-info');

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    closeInfo.addEventListener('click', () => {
        infoModal.classList.add('hidden');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.add('hidden');
        }
    });

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

    const notificationToggle = document.getElementById('notification-toggle');
    notificationToggle.addEventListener('change', async () => {
        if (notificationToggle.checked) {
            const granted = await Notification.requestPermission();
            if (!granted) {
                notificationToggle.checked = false;
                alert('通知の許可が必要です。ブラウザの設定で通知を許可してください。');
                return;
            }
        }
        Storage.setNotificationEnabled(currentGroup, notificationToggle.checked);
    });

    const settingsNotificationToggle = document.getElementById('settings-notification-toggle');
    settingsNotificationToggle.addEventListener('change', async () => {
        if (settingsNotificationToggle.checked) {
            const granted = await Notification.requestPermission();
            if (!granted) {
                settingsNotificationToggle.checked = false;
                alert('通知の許可が必要です。ブラウザの設定で通知を許可してください。');
                return;
            }
        }
        Storage.setNotificationEnabled(currentGroup, settingsNotificationToggle.checked);
    });

    applySettings();
}

function applySettings() {
    const settings = Storage.getSettings();

    document.body.classList.remove('theme-light', 'theme-dark', 'theme-blue', 'theme-green');
    if (settings.theme !== 'light') {
        document.body.classList.add(`theme-${settings.theme}`);
    }

    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${settings.fontSize}`);
}

async function enterGroup(code) {
    const group = await Storage.getGroup(code);

    if (!group) return;

    currentGroup = code;
    document.getElementById('room-title').textContent = group.name;
    document.getElementById('room-code-info').textContent = group.code;

    const noteCount = group.notes ? (Array.isArray(group.notes) ? group.notes.length : Object.keys(group.notes).length) : 0;
    Storage.setReadCount(code, noteCount);

    showScreen('chat-screen');
    renderNotes(group.notes);

    startGroupListener(code);
}

let lastNoteCount = 0;

function startGroupListener(code) {
    stopGroupListener();
    lastNoteCount = 0;

    let isFirstLoad = true;
    groupListener = db.ref('groups/' + code + '/notes').on('value', async (snapshot) => {
        const notes = snapshot.val();
        if (notes) {
            // キーを保持したまま配列に変換
            const notesArray = Object.entries(notes).map(([key, note]) => ({ ...note, _key: key }));
            renderNotes(notesArray);

            if (!isFirstLoad && notesArray.length > lastNoteCount) {
                const newNotes = notesArray.slice(lastNoteCount);
                await sendNotifications(code, newNotes);
            }
            lastNoteCount = notesArray.length;
            isFirstLoad = false;

            Storage.setReadCount(code, notesArray.length);
        }
    });
}

async function sendNotifications(groupCode, newNotes) {
    if (!Storage.isNotificationEnabled(groupCode)) return;

    const currentUser = Storage.getCurrentUser();
    const group = await Storage.getGroup(groupCode);
    const groupName = group ? group.name : 'グループ';

    for (const note of newNotes) {
        if (note.sender === currentUser.name) continue;
        const title = `${groupName}`;
        const body = note.type === 'system' ? note.text : `${note.sender}: ${note.text}`;
        await Notification.send(title, body, groupCode);
    }
}

function stopGroupListener() {
    if (groupListener) {
        db.ref('groups/' + currentGroup + '/notes').off('value', groupListener);
        groupListener = null;
    }
}

async function sendNote() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text || !currentGroup) return;

    if (text.length > MAX_TEXT_LENGTH) {
        alert(`メッセージは${MAX_TEXT_LENGTH}文字以内で入力してください。`);
        return;
    }

    const currentUser = Storage.getCurrentUser();

    const note = {
        type: 'user',
        sender: currentUser.name,
        text,
        timestamp: Date.now()
    };

    input.value = '';

    try {
        await Storage.addNote(currentGroup, note);
    } catch (error) {
        console.error('送信エラー:', error);
    }
}

async function deleteNote(noteKey) {
    if (!currentGroup || !noteKey) return;

    if (!confirm('このメッセージを削除しますか？')) return;

    try {
        await db.ref('groups/' + currentGroup + '/notes/' + noteKey).remove();
    } catch (error) {
        console.error('削除エラー:', error);
        alert('メッセージの削除に失敗しました');
    }
}

function renderNotes(notes) {
    const container = document.getElementById('messages');
    const currentUser = Storage.getCurrentUser();

    if (!notes || !Array.isArray(notes)) {
        notes = [];
    }

    container.innerHTML = notes.map(note => {
        if (note.type === 'system') {
            return `<div class="message system">${note.text}</div>`;
        }

        const isOwn = note.sender === currentUser.name;

        const deleteBtn = isOwn && note._key ? `<button class="delete-note-btn" onclick="deleteNote('${note._key}')">×</button>` : '';

        if (note.type === 'image') {
            return `
                <div class="message ${isOwn ? 'own' : 'other'}">
                    ${deleteBtn}
                    ${!isOwn ? `<div class="sender">${note.sender}</div>` : ''}
                    <div class="image-content">
                        <img src="${note.imageUrl}" alt="画像" onclick="openImageModal(this.src)">
                    </div>
                    <div class="time">${formatTime(note.timestamp)}</div>
                </div>
            `;
        }

        return `
            <div class="message ${isOwn ? 'own' : 'other'}">
                ${deleteBtn}
                ${!isOwn ? `<div class="sender">${note.sender}</div>` : ''}
                <div class="text">${escapeHtml(note.text)}</div>
                <div class="time">${formatTime(note.timestamp)}</div>
            </div>
        `;
    }).join('');

    // 即座にスクロール
    container.scrollTop = container.scrollHeight;

    // 画像読み込み後に再度スクロール
    const images = container.querySelectorAll('img');
    images.forEach(img => {
        if (!img.complete) {
            img.addEventListener('load', () => {
                container.scrollTop = container.scrollHeight;
            }, { once: true });
        }
    });
}

function openImageModal(src) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="image-modal-content">
            <img src="${src}" alt="画像">
            <button class="image-modal-close">×</button>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('image-modal-close')) {
            modal.remove();
        }
    });
    document.body.appendChild(modal);
}

window.openImageModal = openImageModal;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== 初期化 ==========
function checkAuthAndNavigate() {
    if (auth.currentUser) {
        showLobby();
    } else {
        showScreen('auth-screen');
    }
}

function setupAuthListener() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            showLobby();
        }
    });
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    if (!initFirebase()) {
        return;
    }
    setupAuthListener();
    initAuthScreen();
    initLobbyScreen();
    initChatScreen();
    initSettings();
    initConfirmModal();
    checkAuthAndNavigate();
});

// グローバル関数として公開
window.enterGroup = enterGroup;
