// --- Environment Check ---
const isRawGitHub = window.location.hostname.includes('raw.githubusercontent.com');
if (isRawGitHub) {
    alert('このURL（GitHub Raw）ではアプリが正常に動作しません。GitHub Pagesなどの適切なプレビュー環境で開いてください。');
}

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyD_7-voz_0SjD-zmc237hnU_jDMSxsHIsY",
    authDomain: "time-6950d.firebaseapp.com",
    projectId: "time-6950d",
    storageBucket: "time-6950d.firebasestorage.app",
    messagingSenderId: "698929145702",
    appId: "1:698929145702:web:e499b30e7a933c852dcaa7",
    measurementId: "G-FPDJTVY2YL"
};

let db = null;
try {
    if (Object.keys(firebaseConfig).length > 0) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    } else {
        console.warn('[Firebase] Config is missing.');
    }
} catch (e) {
    console.error('[Firebase] Initialization error:', e);
}

// --- Store (Data Management) ---
class Store {
    constructor() {
        this.initialState = {
            users: [{ id: 'admin', name: '管理者', email: 'admin@example.com', password: 'password', role: 'admin' }],
            projects: [{ id: 'p_default', name: '一般業務', status: 'active' }],
            workContents: [{ id: 'w_default', name: '通常作業' }],
            timeEntries: [],
            auditLogs: [],
            activeTimer: {}
        };

        let backup = null;
        try {
            const data = localStorage.getItem('tt_pro_backup');
            if (data) backup = JSON.parse(data);
        } catch (e) {
            console.error('[Store] Backup load error:', e);
        }

        this.state = backup || { ...this.initialState };
        this.listeners = [];
        this.savedUser = null;

        try {
            const user = localStorage.getItem('tt_pro_user');
            if (user) this.savedUser = JSON.parse(user);
        } catch (e) {
            console.error('LocalStorage load error:', e);
        }
    }

    async init() {
        console.log('[Store] Initializing...');
        await this._loadFromFirebase();
        
        if (this.savedUser && !this.state.currentUser) {
            console.log('[Store] Attempting to restore user session:', this.savedUser.id);
            const user = this.state.users.find(u => u.id === this.savedUser.id);
            if (user) {
                this.state.currentUser = { ...user };
                delete this.state.currentUser.password;
                console.log('[Store] User session restored.');
            } else {
                console.warn('[Store] Saved user not found in current user list.');
            }
        }
        
        this._setupRealtimeSync();
        this._backupToLocal();
    }

    _setupRealtimeSync() {
        if (!db) return;
        
        const nodes = ['users', 'projects', 'workContents', 'timeEntries', 'auditLogs', 'activeTimer'];
        nodes.forEach(node => {
            db.ref(`tt_pro/${node}`).on('value', (snapshot) => {
                const data = snapshot.val();
                console.log(`[Store] Realtime update from node: ${node}`);
                if (data) {
                    let processedData = data;
                    if (['users', 'projects', 'workContents', 'timeEntries', 'auditLogs'].includes(node)) {
                        processedData = Object.keys(data).map(key => ({
                            ...data[key],
                            id: data[key].id || key
                        }));
                    }
                    
                    this.state[node] = processedData;
                    
                    if (this.state.currentUser) {
                        const allTimers = (node === 'activeTimer' ? data : this.state.activeTimer) || {};
                        this.state.activeTimerForUser = allTimers[this.state.currentUser.id] || null;
                    }

                    this._backupToLocal();
                    this._notifyListeners();
                } else if (node === 'activeTimer') {
                    this.state.activeTimer = {};
                    this.state.activeTimerForUser = null;
                    this._notifyListeners();
                }
            });
        });
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    _notifyListeners() {
        this.listeners.forEach(listener => listener(this.state));
    }

    async _loadFromFirebase() {
        if (!db) return;
        try {
            const snapshot = await Promise.race([
                db.ref('tt_pro').once('value'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
            
            const remoteData = snapshot.val();
            if (remoteData) {
                Object.keys(remoteData).forEach(node => {
                    if (['users', 'projects', 'workContents', 'timeEntries', 'auditLogs'].includes(node)) {
                        this.state[node] = Object.keys(remoteData[node]).map(key => ({
                            ...remoteData[node][key],
                            id: remoteData[node][key].id || key
                        }));
                    } else {
                        this.state[node] = remoteData[node];
                    }
                });
                console.log('[Store] Full load from Firebase success.');
            }
        } catch (e) {
            console.warn('[Store] Firebase initial load failed or timed out. Falling back to local data.', e);
        }
    }

    _backupToLocal() {
        try {
            const backupState = { ...this.state };
            delete backupState.currentUser;
            localStorage.setItem('tt_pro_backup', JSON.stringify(backupState));
        } catch (e) {
            console.error('[Store] Local backup failed:', e);
        }
    }

    async _save(path, data) {
        if (!db) return;
        try {
            await db.ref(`tt_pro/${path}`).set(data);
        } catch (e) {
            console.error(`[Firebase] Save failed at ${path}:`, e);
        }
    }

    login(email, password) {
        console.log('[Store] Login attempt for:', email);
        const user = this.state.users.find(u => u.email === email && u.password === password);
        if (user) {
            this.state.currentUser = { ...user };
            delete this.state.currentUser.password;
            localStorage.setItem('tt_pro_user', JSON.stringify(this.state.currentUser));
            console.log('[Store] Login success.');
            return true;
        }
        console.warn('[Store] Login failed: User not found or password mismatch.');
        return false;
    }

    logout() {
        console.log('[Store] Logout.');
        this.state.currentUser = null;
        localStorage.removeItem('tt_pro_user');
        localStorage.removeItem('tt_pro_backup');
        location.reload();
    }

    getCurrentUser() {
        return this.state.currentUser;
    }

    async addTimeEntry(entry) {
        const id = 'tm_' + Date.now();
        const newEntry = { id, createdAt: new Date().toISOString(), status: 'draft', ...entry };
        await this._save(`timeEntries/${id}`, newEntry);
        this.logAction('CREATE_ENTRY', `Entry added: ${id}`);
    }

    async deleteTimeEntry(id) {
        const entry = this.state.timeEntries.find(e => e.id === id);
        if (entry) {
            if (entry.status === 'approved' || entry.status === 'submitted') return false;
            await this._save(`timeEntries/${id}`, null);
            return true;
        }
        return false;
    }

    async updateTimeEntry(id, updates) {
        const entry = this.state.timeEntries.find(e => e.id === id);
        if (entry) {
            const updated = { ...entry, ...updates, updatedAt: new Date().toISOString() };
            await this._save(`timeEntries/${id}`, updated);
        }
    }

    async register(name, email, password) {
        console.log('[Store] Registration attempt for:', email);
        if (this.state.users.find(u => u.email === email)) {
            return { success: false, message: 'このメールアドレスは既に登録されています。' };
        }
        const id = 'u' + Date.now();
        const newUser = { id, name, email, password, role: 'user' };
        
        // Save to Firebase
        await this._save(`users/${id}`, newUser);
        
        // Critical: Update local state immediately to allow instant login
        this.state.users.push(newUser);
        this._notifyListeners();
        
        console.log('[Store] Registration success.');
        return { success: true, user: newUser };
    }

    async updatePassword(userId, newPassword) {
        const user = this.state.users.find(u => u.id === userId);
        if (user) {
            await this._save(`users/${userId}/password`, newPassword);
            return true;
        }
        return false;
    }

    async logAction(action, details) {
        const id = 'log_' + Date.now();
        const log = { id, userId: this.state.currentUser?.id || 'system', timestamp: new Date().toISOString(), action, details };
        await this._save(`auditLogs/${id}`, log);
    }
}

const store = new Store();
let app;

// --- Views ---
const Views = {
    login: () => {
        const container = document.createElement('div');
        container.className = 'container fade-in';
        container.style.cssText = 'display: flex; align-items: center; justify-content: center; min-height: 80vh;';
        
        const render = () => {
            container.innerHTML = `
                <div class="glass card" style="width: 100%; max-width: 400px; padding: 2.5rem;">
                    <div style="text-align: center; margin-bottom: 2rem;">
                        <h1 class="brand">TimeTracking Pro</h1>
                        <p id="form-subtitle" style="color: var(--text-secondary);">ログインして工数を管理しましょう</p>
                    </div>
                    <form id="auth-form">
                        <div id="name-group" class="input-group" style="display: none;">
                            <label>名前</label>
                            <input type="text" id="name" class="input-field" placeholder="山田 太郎">
                        </div>
                        <div class="input-group">
                            <label>メールアドレス</label>
                            <input type="email" id="email" class="input-field" placeholder="example@example.com" required>
                        </div>
                        <div class="input-group">
                            <label>パスワード</label>
                            <input type="password" id="password" class="input-field" placeholder="••••••••" required>
                        </div>
                        <div id="auth-error" style="color: var(--danger); font-size: 0.875rem; margin-bottom: 1rem; display: none;"></div>
                        <button type="submit" id="submit-btn" class="btn btn-primary" style="width: 100%;">ログイン</button>
                        <div style="text-align: center; margin-top: 1rem;">
                            <button type="button" id="toggle-mode-btn" class="btn" style="background: none; color: var(--primary); font-size: 0.875rem; padding: 0;">新規登録はこちら</button>
                        </div>
                    </form>
                </div>
            `;
            
            const form = container.querySelector('#auth-form');
            const nameGroup = container.querySelector('#name-group');
            const submitBtn = container.querySelector('#submit-btn');
            const switchBtn = container.querySelector('#toggle-mode-btn');
            const subtitle = container.querySelector('#form-subtitle');
            const authError = container.querySelector('#auth-error');

            let isLoginMode = true;

            switchBtn.onclick = () => {
                isLoginMode = !isLoginMode;
                authError.style.display = 'none';
                if (isLoginMode) {
                    nameGroup.style.display = 'none';
                    submitBtn.textContent = 'ログイン';
                    switchBtn.textContent = '新規登録はこちら';
                    subtitle.textContent = 'ログインして工数を管理しましょう';
                } else {
                    nameGroup.style.display = 'block';
                    submitBtn.textContent = '登録してログイン';
                    switchBtn.textContent = 'ログイン画面に戻る';
                    subtitle.textContent = '新しいアカウントを作成します';
                }
            };

            form.onsubmit = async (e) => {
                e.preventDefault();
                authError.style.display = 'none';
                const email = container.querySelector('#email').value;
                const password = container.querySelector('#password').value;
                
                if (isLoginMode) {
                    if (store.login(email, password)) {
                        app.navigate('/');
                    } else {
                        authError.textContent = 'メールアドレスまたはパスワードが正しくありません。';
                        authError.style.display = 'block';
                    }
                } else {
                    const name = container.querySelector('#name').value;
                    const res = await store.register(name, email, password);
                    if (res.success) {
                        // Registration success, try login immediately
                        if (store.login(email, password)) {
                            app.navigate('/');
                        } else {
                            authError.textContent = '登録は成功しましたが、ログインに失敗しました。再試行してください。';
                            authError.style.display = 'block';
                        }
                    } else {
                        authError.textContent = res.message;
                        authError.style.display = 'block';
                    }
                }
            };
        };
        
        render();
        return { element: container };
    },

    dashboard: () => {
        const user = store.getCurrentUser();
        const container = document.createElement('div');
        container.className = 'container fade-in';
        let timerInterval = null;

        const render = () => {
            const entries = store.state.timeEntries.filter(e => e.userId === user.id);
            container.innerHTML = `
                <nav class="navbar glass">
                    <h1 class="brand">TimeTracking Pro</h1>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button class="btn" id="pw-change-btn" style="background: rgba(16, 185, 129, 0.1); color: var(--success); font-size: 0.875rem;">PW変更</button>
                        <span>${user.name}さん</span>
                        <button class="btn" id="logout-btn" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">ログアウト</button>
                    </div>
                </nav>
                <div class="dashboard-grid">
                    <div>
                        <div class="glass card" style="padding: 1.5rem; margin-bottom: 2rem;">
                            <h2 style="margin-bottom: 1rem;">工数入力</h2>
                            <form id="time-entry-form" class="entry-form">
                                <div class="input-group" style="margin-bottom:0;"><label>プロジェクト</label>
                                    <select id="project-id" class="input-field" required>${store.state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
                                </div>
                                <div class="input-group" style="margin-bottom:0;"><label>時間 (h)</label>
                                    <input type="number" id="hours" class="input-field" step="0.5" min="0.5" max="24" required>
                                </div>
                                <div class="input-group" style="margin-bottom:0;"><label>内容</label>
                                    <select id="description" class="input-field" required>${store.state.workContents.map(w => `<option value="${w.name}">${w.name}</option>`).join('')}</select>
                                </div>
                                <button type="submit" class="btn btn-primary">保存</button>
                            </form>
                        </div>
                        <div class="glass card" style="padding: 1.5rem;">
                            <h2 style="margin-bottom: 1rem;">最近の記録</h2>
                            <div style="overflow-x: auto;">
                                <table class="data-table">
                                    <thead><tr><th>日付</th><th>PJ</th><th>時間</th><th>内容</th><th>状態</th><th>操作</th></tr></thead>
                                    <tbody>${entries.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 2rem;">記録なし</td></tr>' : ''}
                                    ${entries.slice().reverse().map(e => {
                                        const p = store.state.projects.find(proj => proj.id === e.projectId);
                                        const isLocked = e.status === 'approved' || e.status === 'submitted';
                                        return `<tr>
                                            <td>${new Date(e.createdAt).toLocaleDateString()}</td>
                                            <td>${p ? p.name : '?'}</td>
                                            <td>${e.hours}h</td>
                                            <td>${e.description}</td>
                                            <td><span style="color: ${e.status === 'approved' ? 'var(--success)' : 'var(--warning)'}">${e.status}</span></td>
                                            <td>${isLocked ? '' : `<button class="btn edit-btn" data-id="${e.id}" style="padding:0.25rem 0.5rem; font-size:0.75rem;">修</button> <button class="btn delete-btn" data-id="${e.id}" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger);">削</button>`}</td>
                                        </tr>`;
                                    }).join('')}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="glass card timer-card" style="padding: 2rem; text-align: center;">
                            <h3 style="color: var(--text-secondary); margin-bottom: 1rem;">リアルタイム計測</h3>
                            <div id="timer-display" class="timer-display">00:00:00</div>
                            <button id="tracker-btn" class="btn btn-primary" style="width: 100%; height: 60px;">開始</button>
                        </div>
                    </div>
                </div>
            `;

            container.querySelector('#logout-btn').onclick = () => store.logout();
            container.querySelector('#pw-change-btn').onclick = () => {
                const nw = prompt('新パスワード');
                if(nw) store.updatePassword(user.id, nw).then(() => alert('変更しました'));
            };

            container.querySelector('#time-entry-form').onsubmit = async (e) => {
                e.preventDefault();
                const f = e.target;
                await store.addTimeEntry({ userId: user.id, projectId: f['project-id'].value, hours: parseFloat(f.hours.value), description: f.description.value });
                f.hours.value = '';
            };

            container.querySelectorAll('.delete-btn').forEach(b => b.onclick = () => confirm('削除しますか？') && store.deleteTimeEntry(b.dataset.id));
            
            container.querySelectorAll('.edit-btn').forEach(b => b.onclick = () => {
                const e = store.state.timeEntries.find(entry => entry.id === b.dataset.id);
                const nh = prompt('時間', e.hours);
                const nd = prompt('内容', e.description);
                if(nh && nd) store.updateTimeEntry(e.id, { hours: parseFloat(nh), description: nd });
            });

            const tBtn = container.querySelector('#tracker-btn');
            const tDisp = container.querySelector('#timer-display');
            const updateTimerDisp = () => {
                if (!store.state.activeTimerForUser) {
                    tDisp.textContent = '00:00:00';
                    tBtn.textContent = '開始';
                    tBtn.style.background = '';
                    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                    return;
                }
                const diff = Date.now() - store.state.activeTimerForUser.startTime;
                const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                tDisp.textContent = `${h}:${m}:${s}`;
                tBtn.textContent = '停止';
                tBtn.style.background = 'var(--danger)';
                if (!timerInterval) timerInterval = setInterval(updateTimerDisp, 1000);
            };
            updateTimerDisp();

            tBtn.onclick = async () => {
                if (store.state.activeTimerForUser) {
                    const st = store.state.activeTimerForUser.startTime;
                    await store._save(`activeTimer/${user.id}`, null);
                    const hours = Math.round(((Date.now() - st) / 3600000) * 2) / 2;
                    if (hours >= 0.5) {
                        const desc = prompt('作業内容を入力', store.state.workContents[0]?.name);
                        if(desc) await store.addTimeEntry({ userId: user.id, projectId: container.querySelector('#project-id').value, hours, description: desc });
                    } else if (hours > 0) {
                        alert('0.5h未満のため記録されませんでした');
                    }
                } else {
                    await store._save(`activeTimer/${user.id}`, { userId: user.id, startTime: Date.now() });
                }
            };
        };

        render();
        return { element: container, update: render };
    },

    admin: () => {
        const user = store.getCurrentUser();
        const container = document.createElement('div');
        container.className = 'container fade-in';
        let activeTab = 'approvals';

        const render = () => {
            const entries = store.state.timeEntries;
            const pending = entries.filter(e => e.status !== 'approved');

            container.innerHTML = `
                <nav class="navbar glass">
                    <h1 class="brand">Admin Panel</h1>
                    <div style="display: flex; gap: 1rem; align-items:center;">
                        <span>${user.name}</span>
                        <button class="btn" id="logout-btn" style="color:var(--danger);">Logout</button>
                    </div>
                </nav>
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                    <button class="btn ${activeTab === 'approvals' ? 'btn-primary' : ''}" id="tab-appr">承認待ち</button>
                    <button class="btn ${activeTab === 'settings' ? 'btn-primary' : ''}" id="tab-sett">設定管理</button>
                    <button class="btn" id="export-csv">CSV出力</button>
                </div>
                ${activeTab === 'approvals' ? `
                    <div class="glass card" style="padding:1.5rem;">
                        <h2>承認待ちリスト (${pending.length})</h2>
                        <table class="data-table">
                            <thead><tr><th>User</th><th>PJ</th><th>Time</th><th>Action</th></tr></thead>
                            <tbody>${pending.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding:2rem;">待機データなし</td></tr>' : pending.map(e => `
                                <tr>
                                    <td>${store.state.users.find(u => u.id === e.userId)?.name || '?'}</td>
                                    <td>${store.state.projects.find(p => p.id === e.projectId)?.name || '?'}</td>
                                    <td>${e.hours}h</td>
                                    <td><button class="btn approve-btn" data-id="${e.id}" style="color:var(--success);">承認</button></td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                ` : `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <div class="glass card" style="padding:1.5rem;">
                            <h2>Projects <button id="add-pj" class="btn" style="padding:0.25rem 0.5rem;">+</button></h2>
                            ${store.state.projects.map(p => `<div style="padding:0.5rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;"><span>${p.name}</span> <button class="delete-pj-btn" data-id="${p.id}">x</button></div>`).join('')}
                        </div>
                        <div class="glass card" style="padding:1.5rem;">
                            <h2>Work Types <button id="add-wt" class="btn" style="padding:0.25rem 0.5rem;">+</button></h2>
                            ${store.state.workContents.map(w => `<div style="padding:0.5rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;"><span>${w.name}</span> <button class="delete-wt-btn" data-id="${w.id}">x</button></div>`).join('')}
                        </div>
                    </div>
                `}
            `;

            container.querySelector('#logout-btn').onclick = () => store.logout();
            container.querySelector('#tab-appr').onclick = () => { activeTab = 'approvals'; render(); };
            container.querySelector('#tab-sett').onclick = () => { activeTab = 'settings'; render(); };
            container.querySelector('#export-csv').onclick = () => {
                const header = 'User,Project,Hours,Description,Status\n';
                const rows = store.state.timeEntries.map(e => `"${store.state.users.find(u => u.id === e.userId)?.name}",${store.state.projects.find(p => p.id === e.projectId)?.name},${e.hours},"${e.description}",${e.status}`).join('\n');
                const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv' })); link.download = 'timetracking.csv'; link.click();
            };

            if(activeTab === 'approvals') {
                container.querySelectorAll('.approve-btn').forEach(b => b.onclick = () => store.updateTimeEntry(b.dataset.id, { status: 'approved' }));
            } else {
                container.querySelector('#add-pj').onclick = () => {
                    const n = prompt('Project Name'); 
                    if(n) { const id = 'p'+Date.now(); store._save(`projects/${id}`, { id, name: n, status: 'active' }); }
                };
                container.querySelector('#add-wt').onclick = () => {
                    const n = prompt('Work Name');
                    if(n) { const id = 'w'+Date.now(); store._save(`workContents/${id}`, { id, name: n }); }
                };
                container.querySelectorAll('.delete-pj-btn').forEach(b => b.onclick = () => confirm('削除しますか？') && store._save(`projects/${b.dataset.id}`, null));
                container.querySelectorAll('.delete-wt-btn').forEach(b => b.onclick = () => confirm('削除しますか？') && store._save(`workContents/${b.dataset.id}`, null));
            }
        };

        render();
        return { element: container, update: render };
    }
};

// --- App Controller ---
class App {
    constructor() {
        this.appElement = document.getElementById('app');
        this.unsubscribe = null;
        window.addEventListener('hashchange', () => this.route());
    }

    route() {
        const loader = document.getElementById('initial-loader');
        if (loader) loader.style.display = 'none';

        if (this.unsubscribe) {
            console.log('[App] Unsubscribing previous view.');
            this.unsubscribe();
            this.unsubscribe = null;
        }

        const user = store.getCurrentUser();
        let path = window.location.hash.replace(/^#/, '') || '/';
        if (!path.startsWith('/')) path = '/' + path;

        console.log('[App] Routing path:', path, 'Authenticated:', !!user);

        if (!user && path !== '/login') {
            console.log('[App] Redirecting to /login');
            this.navigate('/login');
            return;
        }
        if (user && path === '/login') {
            this.navigate('/');
            return;
        }

        let viewResult;
        if (path === '/login') {
            viewResult = Views.login();
        } else if (user && user.role === 'admin') {
            viewResult = Views.admin();
        } else {
            viewResult = Views.dashboard();
        }

        if (viewResult.update) {
            console.log('[App] Subscribing new view to store updates.');
            this.unsubscribe = store.subscribe(() => {
                console.log('[App] Store changed, updating view.');
                viewResult.update();
            });
        }

        this.appElement.innerHTML = '';
        this.appElement.appendChild(viewResult.element);
    }

    navigate(path) {
        window.location.hash = path;
    }
}

// --- Init ---
(async function() {
    try {
        await store.init();
        app = new App();
        window.app = app;
        app.route();
    } catch (e) {
        console.error('[Critical] App initialization failed:', e);
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.innerHTML = '<div style="padding:2rem; color:red;">エラーが発生しました。リロードしてください。</div>';
    }
})();
