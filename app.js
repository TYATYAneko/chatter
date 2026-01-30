// StudyBoard - グループ学習ノートアプリケーション
// Firebase対応版 v2.0.0

// ========== Firebase設定 ==========
// ここにFirebaseの設定を入力してください
// Firebase Console → プロジェクト設定 → マイアプリ → ウェブアプリ からコピー
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ========== 設定 ==========
// アクセスコード（10桁の数字）- ここを変更してください
const SITE_PASSWORD = '1234567890';

// ========== Firebase初期化 ==========
let db = null;
let firebaseEnabled = false;

function initFirebase() {
    try {
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.log('Firebase未設定 - ローカルモードで動作します');
            return false;
        }
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log('Firebase接続成功');
        return true;
    } catch (error) {
        console.error('Firebase初期化エラー:', error);
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

    // セッション管理
    getCurrentUser() {
        return JSON.parse(sessionStorage.getItem('sb_currentUser') || 'null');
    },
    setCurrentUser(user) {
        sessionStorage.setItem('sb_currentUser', JSON.stringify(user));
    },
    clearCurrentUser() {
        sessionStorage.removeItem('sb_currentUser');
    },
    isEntryVerified() {
        return sessionStorage.getItem('sb_entry') === 'verified';
    },
    setEntryVerified() {
        sessionStorage.setItem('sb_entry', 'verified');
    },

    // Firebase操作 - ユーザー
    async getUsers() {
        if (!firebaseEnabled) {
            return JSON.parse(localStorage.getItem('sb_users') || '{}');
        }
        const snapshot = await db.ref('users').once('value');
        return snapshot.val() || {};
    },
    async saveUser(name, userData) {
        if (!firebaseEnabled) {
            const users = JSON.parse(localStorage.getItem('sb_users') || '{}');
            users[name] = userData;
            localStorage.setItem('sb_users', JSON.stringify(users));
            return;
        }
        await db.ref('users/' + name).set(userData);
    },
    async getUser(name) {
        if (!firebaseEnabled) {
            const users = JSON.parse(localStorage.getItem('sb_users') || '{}');
            return users[name] || null;
        }
        const snapshot = await db.ref('users/' + name).once('value');
        return snapshot.val();
    },

    // Firebase操作 - グループ
    async getGroups() {
        if (!firebaseEnabled) {
            return JSON.parse(localStorage.getItem('sb_groups') || '{}');
        }
        const snapshot = await db.ref('groups').once('value');
        return snapshot.val() || {};
    },
    async saveGroup(code, groupData) {
        if (!firebaseEnabled) {
            const groups = JSON.parse(localStorage.getItem('sb_groups') || '{}');
            groups[code] = groupData;
            localStorage.setItem('sb_groups', JSON.stringify(groups));
            return;
        }
        await db.ref('groups/' + code).set(groupData);
    },
    async getGroup(code) {
        if (!firebaseEnabled) {
            const groups = JSON.parse(localStorage.getItem('sb_groups') || '{}');
            return groups[code] || null;
        }
        const snapshot = await db.ref('groups/' + code).once('value');
        return snapshot.val();
    },
    async addNote(code, note) {
        if (!firebaseEnabled) {
            const groups = JSON.parse(localStorage.getItem('sb_groups') || '{}');
            if (groups[code]) {
                groups[code].notes.push(note);
                localStorage.setItem('sb_groups', JSON.stringify(groups));
            }
            return;
        }
        const notesRef = db.ref('groups/' + code + '/notes');
        await notesRef.push(note);
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
    // ボタンの無効化などでローディング状態を表現
    document.querySelectorAll('.btn.primary').forEach(btn => {
        btn.disabled = show;
    });
}

// ========== 画面管理 ==========
let currentGroup = null;
let groupListener = null;

// エントリー画面
function initEntryScreen() {
    const entryBtn = document.getElementById('entry-btn');
    const entryPassword = document.getElementById('entry-password');
    const entryError = document.getElementById('entry-error');

    entryBtn.addEventListener('click', () => {
        const password = entryPassword.value;

        if (password.length !== 10) {
            entryError.textContent = 'コードは10桁の数字です';
            return;
        }

        if (!/^\d+$/.test(password)) {
            entryError.textContent = '数字のみ入力してください';
            return;
        }

        if (password !== SITE_PASSWORD) {
            entryError.textContent = 'コードが正しくありません';
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

    loginBtn.addEventListener('click', async () => {
        const name = loginName.value.trim();
        const password = loginPassword.value;

        if (!name || !password) {
            loginError.textContent = 'ニックネームとパスワードを入力してください';
            return;
        }

        showLoading(true);
        try {
            const user = await Storage.getUser(name);
            if (!user || user.password !== password) {
                loginError.textContent = 'ニックネームまたはパスワードが正しくありません';
                showLoading(false);
                return;
            }

            Storage.setCurrentUser({ name });
            showLobby();
        } catch (error) {
            loginError.textContent = '接続エラーが発生しました';
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

        if (password.length < 4) {
            registerError.textContent = 'パスワードは4文字以上で入力してください';
            return;
        }

        if (password !== confirm) {
            registerError.textContent = 'パスワードが一致しません';
            return;
        }

        showLoading(true);
        try {
            const existingUser = await Storage.getUser(name);
            if (existingUser) {
                registerError.textContent = 'このニックネームは既に使用されています';
                showLoading(false);
                return;
            }

            await Storage.saveUser(name, { password, groups: [] });
            Storage.setCurrentUser({ name });
            showLobby();
        } catch (error) {
            registerError.textContent = '接続エラーが発生しました';
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

    logoutBtn.addEventListener('click', () => {
        Storage.clearCurrentUser();
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

            // ユーザーがコードを入力した場合
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
                    timestamp: Date.now()
                }],
                members: [currentUser.name]
            };
            await Storage.saveGroup(code, newGroup);

            // ユーザーのグループリストに追加
            const user = await Storage.getUser(currentUser.name);
            if (!user.groups) user.groups = [];
            if (!user.groups.includes(code)) {
                user.groups.push(code);
            }
            await Storage.saveUser(currentUser.name, user);

            // コード表示
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

            // メンバーに追加
            if (!group.members.includes(currentUser.name)) {
                group.members.push(currentUser.name);
                await Storage.addNote(code, {
                    type: 'system',
                    text: `${currentUser.name}さんが参加しました`,
                    timestamp: Date.now()
                });
                await Storage.saveGroup(code, group);
            }

            // ユーザーのグループリストに追加
            const user = await Storage.getUser(currentUser.name);
            if (!user.groups) user.groups = [];
            if (!user.groups.includes(code)) {
                user.groups.push(code);
            }
            await Storage.saveUser(currentUser.name, user);

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
        const user = await Storage.getUser(currentUser.name);
        const groups = await Storage.getGroups();

        const userGroups = user?.groups || [];

        if (userGroups.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">参加中のグループはありません</p>';
            return;
        }

        container.innerHTML = userGroups
            .filter(code => groups[code])
            .map(code => {
                const group = groups[code];
                return `
                    <div class="room-item">
                        <div class="room-info">
                            <span class="room-name">${group.name}</span>
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

    // グループ情報
    infoBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        showGroupInfo();
    });

    // 設定
    settingsBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        showSettings();
    });

    // 退出
    leaveBtn.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
        leaveGroup();
    });

    sendBtn.addEventListener('click', sendNote);
    noteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendNote();
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
        const user = await Storage.getUser(currentUser.name);

        // グループのメンバーリストから削除
        if (group) {
            group.members = group.members.filter(name => name !== currentUser.name);
            await Storage.addNote(currentGroup, {
                type: 'system',
                text: `${currentUser.name}さんが退出しました`,
                timestamp: Date.now()
            });
            await Storage.saveGroup(currentGroup, group);
        }

        // ユーザーのグループリストから削除
        if (user?.groups) {
            user.groups = user.groups.filter(code => code !== currentGroup);
            await Storage.saveUser(currentUser.name, user);
        }

        // リスナー停止してロビーへ
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

        document.getElementById('room-info-modal').classList.remove('hidden');
    } catch (error) {
        console.error('グループ情報取得エラー:', error);
    }
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
    const infoModal = document.getElementById('room-info-modal');
    const closeSettings = document.getElementById('close-settings');
    const closeInfo = document.getElementById('close-room-info');

    // モーダルを閉じる
    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    closeInfo.addEventListener('click', () => {
        infoModal.classList.add('hidden');
    });

    // モーダル背景クリックで閉じる
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

async function enterGroup(code) {
    const group = await Storage.getGroup(code);

    if (!group) return;

    currentGroup = code;
    document.getElementById('room-title').textContent = group.name;
    document.getElementById('room-code-info').textContent = group.code;

    showScreen('chat-screen');
    renderNotes(group.notes);

    // リアルタイムリスナーを設定
    startGroupListener(code);
}

function startGroupListener(code) {
    stopGroupListener();

    if (firebaseEnabled) {
        // Firebaseリアルタイムリスナー
        groupListener = db.ref('groups/' + code + '/notes').on('value', (snapshot) => {
            const notes = snapshot.val();
            if (notes) {
                // オブジェクトを配列に変換
                const notesArray = Object.values(notes);
                renderNotes(notesArray);
            }
        });
    } else {
        // ローカルモード: ポーリング
        groupListener = setInterval(async () => {
            const group = await Storage.getGroup(currentGroup);
            if (group) {
                renderNotes(group.notes);
            }
        }, 1000);
    }
}

function stopGroupListener() {
    if (groupListener) {
        if (firebaseEnabled) {
            db.ref('groups/' + currentGroup + '/notes').off('value', groupListener);
        } else {
            clearInterval(groupListener);
        }
        groupListener = null;
    }
}

async function sendNote() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text || !currentGroup) return;

    const currentUser = Storage.getCurrentUser();

    const note = {
        type: 'user',
        sender: currentUser.name,
        text,
        timestamp: Date.now()
    };

    input.value = '';

    try {
        if (firebaseEnabled) {
            await Storage.addNote(currentGroup, note);
        } else {
            const group = await Storage.getGroup(currentGroup);
            if (group) {
                group.notes.push(note);
                await Storage.saveGroup(currentGroup, group);
                renderNotes(group.notes);
            }
        }
    } catch (error) {
        console.error('送信エラー:', error);
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
        return `
            <div class="message ${isOwn ? 'own' : 'other'}">
                ${!isOwn ? `<div class="sender">${note.sender}</div>` : ''}
                <div class="text">${escapeHtml(note.text)}</div>
                <div class="time">${formatTime(note.timestamp)}</div>
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

// storageイベントでローカルモード時の同期
window.addEventListener('storage', async (e) => {
    if (!firebaseEnabled && e.key === 'sb_groups' && currentGroup) {
        const group = await Storage.getGroup(currentGroup);
        if (group) {
            renderNotes(group.notes);
        }
    }
});

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    firebaseEnabled = initFirebase();
    initEntryScreen();
    initAuthScreen();
    initLobbyScreen();
    initChatScreen();
    initSettings();
    initConfirmModal();
    checkAuthAndNavigate();
});

// グローバル関数として公開
window.enterGroup = enterGroup;
