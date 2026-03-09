// --- Environment Check ---
const isRawGitHub = window.location.hostname.includes('raw.githubusercontent.com');
if (isRawGitHub) {
    alert('このURL（GitHub Raw）ではアプリが正常に動作しません。GitHub Pagesなどの適切なプレビュー環境で開いてください。');
}

// --- Store (Data Management) ---
class Store {
    constructor() {
        this.STORAGE_KEY = 'tt_pro_data';
        this.isStorageAvailable = this._checkStorageAvailable();
        this.state = this._load();
    }

    _checkStorageAvailable() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            console.warn('LocalStorage is not available, using in-memory storage.');
            return false;
        }
    }

    _load() {
        const initialState = {
            currentUser: null,
            users: [
                { id: 'admin', name: '管理者', email: 'admin@example.com', password: 'password', role: 'admin' },
                { id: 'user1', name: '一般ユーザー1', email: 'user@example.com', password: 'password', role: 'user' }
            ],
            projects: [
                { id: 'p1', name: 'プロジェクトA', status: 'active' },
                { id: 'p2', name: 'プロジェクトB', status: 'active' }
            ],
            workContents: [
                { id: 'w1', name: '開発' },
                { id: 'w2', name: 'ミーティング' },
                { id: 'w3', name: '資料作成' },
                { id: 'w4', name: 'その他' }
            ],
            timeEntries: [],
            auditLogs: []
        };

        try {
            const saved = this.isStorageAvailable ? localStorage.getItem(this.STORAGE_KEY) : null;
            if (!saved) return this._pruneOldData(initialState);
            
            const state = JSON.parse(saved);
            // 必須プロパティの存在チェック
            if (!state || typeof state !== 'object' || !Array.isArray(state.users) || !Array.isArray(state.timeEntries)) {
                console.warn('Invalid state structure found, resetting to initial state.');
                return this._pruneOldData(initialState);
            }
            return this._pruneOldData(state);
        } catch (e) {
            console.error('Failed to load state from localStorage:', e);
            return this._pruneOldData(initialState);
        }
    }

    _pruneOldData(state) {
        if (!state || !Array.isArray(state.timeEntries)) return state;

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const initialCount = state.timeEntries.length;
        state.timeEntries = state.timeEntries.filter(entry => {
            const entryDate = new Date(entry.createdAt);
            return !isNaN(entryDate) && entryDate >= oneMonthAgo;
        });

        if (state.timeEntries.length < initialCount) {
            console.log(`Pruned ${initialCount - state.timeEntries.length} old entries.`);
        }
        
        if (Array.isArray(state.auditLogs)) {
            state.auditLogs = state.auditLogs.filter(log => {
                const logDate = new Date(log.timestamp);
                return !isNaN(logDate) && logDate >= oneMonthAgo;
            });
        }
        
        return state;
    }

    _save() {
        if (this.isStorageAvailable) {
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
            }
        }
    }

    login(email, password) {
        const user = this.state.users.find(u => u.email === email && u.password === password);
        if (user) {
            this.state.currentUser = { ...user };
            delete this.state.currentUser.password;
            this._save();
            return true;
        }
        return false;
    }

    logout() {
        this.state.currentUser = null;
        this._save();
    }

    getCurrentUser() {
        return this.state.currentUser;
    }

    addTimeEntry(entry) {
        const newEntry = {
            id: 'tm_' + Date.now(),
            createdAt: new Date().toISOString(),
            status: 'draft',
            ...entry
        };
        this.state.timeEntries.push(newEntry);
        this.logAction('CREATE_ENTRY', `Entry added: ${newEntry.id}`);
        this._save();
        return newEntry;
    }

    updateTimeEntry(id, updates) {
        const index = this.state.timeEntries.findIndex(e => e.id === id);
        if (index !== -1) {
            this.state.timeEntries[index] = { ...this.state.timeEntries[index], ...updates, updatedAt: new Date().toISOString() };
            this.logAction('UPDATE_ENTRY', `Entry updated: ${id}`);
            this._save();
        }
    }

    logAction(action, details) {
        const log = {
            id: 'log_' + Date.now(),
            userId: this.state.currentUser?.id || 'system',
            timestamp: new Date().toISOString(),
            action,
            details
        };
        this.state.auditLogs.unshift(log);
        this._save();
    }
}

const store = new Store();

// --- Views (Components) ---

const Views = {
    login: () => {
        const container = document.createElement('div');
        container.className = 'container fade-in';
        container.style.cssText = 'display: flex; align-items: center; justify-content: center; min-height: 80vh;';
        container.innerHTML = `
            <div class="glass" style="width: 100%; max-width: 400px; padding: 2.5rem;">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <h1 class="brand" style="font-size: 2rem; margin-bottom: 0.5rem;">TimeTracking Pro</h1>
                    <p style="color: var(--text-secondary);">ログインして工数を管理しましょう</p>
                </div>
                <form id="login-form">
                    <div class="input-group">
                        <label for="email">メールアドレス</label>
                        <input type="email" id="email" class="input-field" placeholder="example@example.com" required>
                    </div>
                    <div class="input-group">
                        <label for="password">パスワード</label>
                        <input type="password" id="password" class="input-field" placeholder="••••••••" required>
                    </div>
                    <div id="login-error" style="color: var(--danger); font-size: 0.875rem; margin-bottom: 1rem; display: none;">
                        メールアドレスまたはパスワードが正しくありません。
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">ログイン</button>
                </form>
            </div>
        `;
        const form = container.querySelector('#login-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (store.login(form.email.value, form.password.value)) {
                app.navigate('/');
            } else {
                container.querySelector('#login-error').style.display = 'block';
            }
        });
        return container;
    },

    dashboard: () => {
        const user = store.getCurrentUser();
        const container = document.createElement('div');
        container.className = 'container fade-in';

        let isTracking = false;
        let startTime = null;
        let timerInterval = null;

        const render = () => {
            const entries = store.state.timeEntries.filter(e => e.userId === user.id);
            container.innerHTML = `
                <nav class="navbar glass">
                    <h1 class="brand">TimeTracking Pro</h1>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button class="btn" id="share-btn" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); font-size: 0.875rem;">URLを共有</button>
                        <span>${user.name}さん</span>
                        <button class="btn" id="logout-btn" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">ログアウト</button>
                    </div>
                </nav>
                <div style="display: grid; grid-template-columns: 1fr 350px; gap: 2rem;">
                    <div>
                        <div class="glass" style="padding: 1.5rem; margin-bottom: 2rem;">
                            <h2 style="margin-bottom: 1rem;">工数入力</h2>
                            <form id="time-entry-form" style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 1rem; align-items: end;">
                                <div class="input-group" style="margin-bottom:0;"><label>プロジェクト</label>
                                    <select id="project-id" class="input-field" required>${store.state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
                                </div>
                                <div class="input-group" style="margin-bottom:0;"><label>時間 (時間)</label>
                                    <input type="number" id="hours" class="input-field" step="0.5" min="0.5" max="24" placeholder="1.5" required>
                                </div>
                                <div class="input-group" style="margin-bottom:0;"><label>作業内容</label>
                                    <select id="description" class="input-field" required>
                                        ${store.state.workContents.map(w => `<option value="${w.name}">${w.name}</option>`).join('')}
                                    </select>
                                </div>
                                <button type="submit" class="btn btn-primary">保存</button>
                            </form>
                        </div>
                        <div class="glass" style="padding: 1.5rem;">
                            <h2 style="margin-bottom: 1rem;">最近の記録</h2>
                            <div style="overflow-x: auto;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <thead><tr style="border-bottom: 1px solid var(--border); text-align: left;"><th style="padding: 1rem;">日付</th><th style="padding: 1rem;">プロジェクト</th><th style="padding: 1rem;">時間</th><th style="padding: 1rem;">内容</th><th style="padding: 1rem;">ステータス</th><th style="padding: 1rem;">操作</th></tr></thead>
                                    <tbody>${entries.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">記録がありません</td></tr>' : ''}${entries.slice().reverse().map(e => {
                const p = store.state.projects.find(proj => proj.id === e.projectId);
                const statusColor = e.status === 'approved' ? 'var(--success)' : (e.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
                const isLocked = e.status === 'approved' || e.status === 'submitted';
                return `<tr style="border-bottom: 1px solid var(--border);"><td style="padding: 1rem;">${new Date(e.createdAt).toLocaleDateString()}</td><td style="padding: 1rem;">${p ? p.name : '?'}</td><td style="padding: 1rem;">${e.hours}h</td><td style="padding: 1rem;">${e.description}</td><td style="padding: 1rem;"><span style="color: ${statusColor};">${e.status}</span></td><td style="padding: 1rem;">${isLocked ? '' : `<button class="btn edit-btn" data-id="${e.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--bg-input);">修正</button>`}</td></tr>`;
            }).join('')}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="glass" style="padding: 2rem; text-align: center;">
                            <h3 style="margin-bottom: 1.5rem; color: var(--text-secondary);">リアルタイム計測</h3>
                            <div id="timer-display" style="font-size: 3rem; font-family: var(--font-heading); font-weight: 700; margin-bottom: 1.5rem;">00:00:00</div>
                            <button id="tracker-btn" class="btn btn-primary" style="width: 100%; height: 60px; font-size: 1.25rem;">開始</button>
                        </div>
                    </div>
                </div>
            `;
            container.querySelector('#logout-btn').addEventListener('click', () => { store.logout(); app.navigate('/login'); });

            container.querySelector('#share-btn').addEventListener('click', () => {
                const url = window.location.href.split('#')[0];
                navigator.clipboard.writeText(url).then(() => {
                    alert('サイトのURLをコピーしました！ネットリフトなどにアップロードして共有してください。');
                });
            });

            container.querySelector('#time-entry-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const form = e.target;
                const hours = parseFloat(form.hours.value);
                const today = new Date().toDateString();
                const todayHours = entries.filter(e => new Date(e.createdAt).toDateString() === today).reduce((sum, e) => sum + e.hours, 0);
                if (todayHours + hours > 24) { alert('1日の合計工数が24時間を超えることはできません。'); return; }
                store.addTimeEntry({ userId: user.id, projectId: form['project-id'].value, hours, description: form.description.value });
                render();
            });

            container.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const entry = store.state.timeEntries.find(e => e.id === btn.dataset.id);
                    if (!entry) return;
                    const newHours = prompt('時間を入力 (h)', entry.hours);
                    const newDesc = prompt('内容を入力', entry.description);
                    if (newHours !== null && newDesc !== null) {
                        store.updateTimeEntry(entry.id, { hours: parseFloat(newHours), description: newDesc, status: 'draft' });
                        render();
                    }
                });
            });

            const trackerBtn = container.querySelector('#tracker-btn');
            const timerDisplay = container.querySelector('#timer-display');
            trackerBtn.addEventListener('click', () => {
                if (!isTracking) {
                    isTracking = true; startTime = Date.now(); trackerBtn.textContent = '停止'; trackerBtn.style.backgroundColor = 'var(--danger)';
                    timerInterval = setInterval(() => {
                        const diff = Date.now() - startTime;
                        const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000); const s = Math.floor((diff % 60000) / 1000);
                        timerDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    }, 1000);
                } else {
                    isTracking = false; clearInterval(timerInterval);
                    const hours = Math.round(((Date.now() - startTime) / 3600000) * 2) / 2;
                    if (hours >= 0.5) {
                        const entryForm = container.querySelector('#time-entry-form');
                        const options = store.state.workContents.map(w => w.name).join(', ');
                        const desc = prompt(`計測を終了しました (${hours}h)。作業内容を入力または選択してください:\n${options}`, store.state.workContents[0].name);
                        if (desc) { store.addTimeEntry({ userId: user.id, projectId: entryForm['project-id'].value, hours, description: desc }); render(); }
                    } else { alert('計測時間不足（0.5h未満）のため記録されませんでした。'); render(); }
                }
            });
        };
        render(); return container;
    },

    admin: () => {
        const user = store.getCurrentUser();
        const container = document.createElement('div');
        container.className = 'container fade-in';
        let activeTab = 'approvals'; // 'approvals' or 'members'

        const render = () => {
            const entries = store.state.timeEntries;
            const pendingEntries = entries.filter(e => e.status === 'draft' || e.status === 'submitted');

            container.innerHTML = `
                <nav class="navbar glass">
                    <h1 class="brand">TimeTracking Pro (管理者)</h1>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button class="btn" id="share-btn" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); font-size: 0.875rem;">URLを共有</button>
                        <span>${user.name}さん</span>
                        <button class="btn" id="logout-btn" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">ログアウト</button>
                    </div>
                </nav>

                <div style="margin-bottom: 2rem; display: flex; gap: 1rem;">
                    <button class="btn ${activeTab === 'approvals' ? 'btn-primary' : ''}" id="tab-approvals" style="${activeTab !== 'approvals' ? 'background: var(--bg-input);' : ''}">承認待ち</button>
                    <button class="btn ${activeTab === 'members' ? 'btn-primary' : ''}" id="tab-members" style="${activeTab !== 'members' ? 'background: var(--bg-input);' : ''}">メンバー管理</button>
                    <button class="btn ${activeTab === 'settings' ? 'btn-primary' : ''}" id="tab-settings" style="${activeTab !== 'settings' ? 'background: var(--bg-input);' : ''}">設定管理</button>
                </div>

                ${activeTab === 'approvals' ? renderApprovals(entries, pendingEntries) : (activeTab === 'members' ? renderMembers() : renderSettings())}

                <div class="glass" style="padding: 1.5rem; margin-top: 2rem;">
                    <h3 style="margin-bottom: 1rem;">操作ログ</h3>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); max-height: 200px; overflow-y: auto;">
                        ${store.state.auditLogs.map(log => `<div style="border-bottom: 1px solid var(--border); padding: 0.5rem 0;"><span>${new Date(log.timestamp).toLocaleTimeString()}</span> - <strong>${log.action}</strong>: ${log.details}</div>`).join('')}
                    </div>
                </div>
            `;

            // Tab Events
            container.querySelector('#tab-approvals').addEventListener('click', () => { activeTab = 'approvals'; render(); });
            container.querySelector('#tab-members').addEventListener('click', () => { activeTab = 'members'; render(); });
            container.querySelector('#tab-settings').addEventListener('click', () => { activeTab = 'settings'; render(); });

            // Logout
            container.querySelector('#logout-btn').addEventListener('click', () => { store.logout(); app.navigate('/login'); });

            container.querySelector('#share-btn').addEventListener('click', () => {
                const url = window.location.href.split('#')[0];
                navigator.clipboard.writeText(url).then(() => {
                    alert('サイトのURLをコピーしました！ネットリフトなどにアップロードして共有してください。');
                });
            });

            if (activeTab === 'approvals') {
                container.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', () => { store.updateTimeEntry(btn.dataset.id, { status: 'approved' }); store.logAction('APPROVE', `Approved: ${btn.dataset.id}`); render(); }));
                container.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', () => {
                    const com = prompt('差し戻し理由'); if (com) { store.updateTimeEntry(btn.dataset.id, { status: 'rejected', comment: com }); store.logAction('REJECT', `Rejected: ${btn.dataset.id}`); render(); }
                }));
                container.querySelector('#export-btn').addEventListener('click', () => {
                    const header = 'Date,User,Project,Hours,Description,Status\n';
                    const rows = store.state.timeEntries.filter(e => e.status === 'approved').map(e => `${new Date(e.createdAt).toLocaleDateString()},"${store.state.users.find(u => u.id === e.userId)?.name}",${store.state.projects.find(p => p.id === e.projectId)?.name},${e.hours},"${e.description}",${e.status}`).join('\n');
                    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv' })); link.download = 'export.csv'; link.click();
                });
                container.querySelector('#add-project-btn').addEventListener('click', () => {
                    const n = prompt('プロジェクト名'); if (n) { store.state.projects.push({ id: 'p' + Date.now(), name: n, status: 'active' }); store.logAction('CREATE_PROJECT', n); store._save(); render(); }
                });
            } else if (activeTab === 'members') {
                container.querySelector('#invite-btn').addEventListener('click', () => {
                    const name = prompt('名前を入力してください');
                    const email = prompt('メールアドレスを入力してください');
                    if (name && email) {
                        const newUser = { id: 'u' + Date.now(), name, email, password: 'password', role: 'user' };
                        store.state.users.push(newUser);
                        store.logAction('INVITE_USER', `Invited: ${email}`);
                        store._save();

                        // Generate mailto link
                        const subject = encodeURIComponent('【TimeTracking Pro】招待のお知らせ');
                        const body = encodeURIComponent(`${name}様\n\n工数管理ツール TimeTracking Pro へ招待されました。\n\nログイン情報:\nメール: ${email}\n初期パスワード: password\n\nツールを開いてログインしてください。`);
                        const mailto = `mailto:${email}?subject=${subject}&body=${body}`;

                        if (confirm(`${name}さんを登録しました。メールで招待を送りますか？`)) {
                            window.location.href = mailto;
                        }
                        render();
                    }
                });
            } else if (activeTab === 'settings') {
                container.querySelector('#add-proj-settings-btn').addEventListener('click', () => {
                    const n = prompt('新規プロジェクト名'); if (n) { store.state.projects.push({ id: 'p' + Date.now(), name: n, status: 'active' }); store.logAction('CREATE_PROJECT', n); store._save(); render(); }
                });
                container.querySelectorAll('.delete-proj-btn').forEach(btn => btn.addEventListener('click', () => {
                    if (confirm('このプロジェクトを削除しますか？')) {
                        store.state.projects = store.state.projects.filter(p => p.id !== btn.dataset.id);
                        store.logAction('DELETE_PROJECT', btn.dataset.id);
                        store._save(); render();
                    }
                }));
                container.querySelector('#add-content-settings-btn').addEventListener('click', () => {
                    const n = prompt('新規作業内容'); if (n) { store.state.workContents.push({ id: 'w' + Date.now(), name: n }); store.logAction('CREATE_CONTENT', n); store._save(); render(); }
                });
                container.querySelectorAll('.delete-content-btn').forEach(btn => btn.addEventListener('click', () => {
                    if (confirm('この作業内容を削除しますか？')) {
                        store.state.workContents = store.state.workContents.filter(w => w.id !== btn.dataset.id);
                        store.logAction('DELETE_CONTENT', btn.dataset.id);
                        store._save(); render();
                    }
                }));
            }
        };

        const renderApprovals = (entries, pendingEntries) => {
            return `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                    <div class="glass" style="padding: 1.5rem;">
                        <h2 style="margin-bottom: 1rem;">統計概略</h2>
                        <div style="display: flex; gap: 2rem;">
                            <div><p style="font-size: 0.875rem; color: var(--text-secondary);">全申請数</p><p style="font-size: 2rem; font-weight: 700;">${entries.length}</p></div>
                            <div><p style="font-size: 0.875rem; color: var(--text-secondary);">未承認</p><p style="font-size: 2rem; font-weight: 700; color: var(--warning);">${pendingEntries.length}</p></div>
                        </div>
                    </div>
                    <div class="glass" style="padding: 1.5rem;">
                        <h2 style="margin-bottom: 1rem;">データ操作</h2>
                        <div style="display: flex; gap: 1rem;"><button id="export-btn" class="btn btn-primary">CSVエクスポート</button><button id="add-project-btn" class="btn">新規プロジェクト</button></div>
                    </div>
                </div>
                <div class="glass" style="padding: 1.5rem;">
                    <h2 style="margin-bottom: 1rem;">承認待ちリスト</h2>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead><tr style="border-bottom: 1px solid var(--border); text-align: left;"><th style="padding: 1rem;">ユーザー</th><th style="padding: 1rem;">日付</th><th style="padding: 1rem;">プロジェクト</th><th style="padding: 1rem;">時間</th><th style="padding: 1rem;">内容</th><th style="padding: 1rem;">アクション</th></tr></thead>
                            <tbody>${pendingEntries.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">待機データなし</td></tr>' : ''}${pendingEntries.map(e => {
                const u = store.state.users.find(usr => usr.id === e.userId);
                const p = store.state.projects.find(proj => proj.id === e.projectId);
                return `<tr style="border-bottom: 1px solid var(--border);"><td style="padding: 1rem;">${u ? u.name : '?'}</td><td style="padding: 1rem;">${new Date(e.createdAt).toLocaleDateString()}</td><td style="padding: 1rem;">${p ? p.name : '?'}</td><td style="padding: 1rem;">${e.hours}h</td><td style="padding: 1rem;">${e.description}</td><td style="padding: 1rem;"><div style="display: flex; gap: 0.5rem;"><button class="btn approve-btn" data-id="${e.id}" style="color: var(--success); background: rgba(16, 185, 129, 0.1);">承認</button><button class="btn reject-btn" data-id="${e.id}" style="color: var(--danger); background: rgba(239, 68, 68, 0.1);">却下</button></div></td></tr>`;
            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
        };

        const renderMembers = () => {
            const users = store.state.users;
            return `
                <div class="glass" style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h2>メンバー一覧</h2>
                        <button id="invite-btn" class="btn btn-primary">メンバーを招待</button>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead><tr style="border-bottom: 1px solid var(--border); text-align: left;"><th style="padding: 1rem;">名前</th><th style="padding: 1rem;">メールアドレス</th><th style="padding: 1rem;">権限</th><th style="padding: 1rem;">ステータス</th></tr></thead>
                            <tbody>
                                ${users.map(u => `
                                    <tr style="border-bottom: 1px solid var(--border);">
                                        <td style="padding: 1rem;">${u.name}</td>
                                        <td style="padding: 1rem;">${u.email}</td>
                                        <td style="padding: 1rem;">${u.role === 'admin' ? '管理者' : '一般ユーザー'}</td>
                                        <td style="padding: 1rem;"><span style="color: var(--success);">有効</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-secondary);">※ 招待ボタンを押すと、メールアプリを起動してログイン情報を送信できます。</p>
                </div>
            `;
        };

        const renderSettings = () => {
            return `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div class="glass" style="padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h2>プロジェクト管理</h2>
                            <button id="add-proj-settings-btn" class="btn btn-primary">追加</button>
                        </div>
                        <div style="max-height: 400px; overflow-y: auto;">
                            ${store.state.projects.map(p => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border);">
                                    <span>${p.name}</span>
                                    <button class="btn delete-proj-btn" data-id="${p.id}" style="color: var(--danger); background: rgba(239, 68, 68, 0.1); padding: 0.25rem 0.5rem; font-size: 0.75rem;">削除</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="glass" style="padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h2>作業内容管理</h2>
                            <button id="add-content-settings-btn" class="btn btn-primary">追加</button>
                        </div>
                        <div style="max-height: 400px; overflow-y: auto;">
                            ${store.state.workContents.map(w => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--border);">
                                    <span>${w.name}</span>
                                    <button class="btn delete-content-btn" data-id="${w.id}" style="color: var(--danger); background: rgba(239, 68, 68, 0.1); padding: 0.25rem 0.5rem; font-size: 0.75rem;">削除</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        };

        render(); return container;
    }
};

// --- App Controller (Router) ---
class App {
    constructor() {
        this.appElement = document.getElementById('app');
        this.lastHash = window.location.hash;
        
        window.addEventListener('popstate', () => this.route());
        window.addEventListener('hashchange', () => this.route());
        
        // Simple polling for hash changes as backup
        setInterval(() => {
            const currentHash = window.location.hash;
            if (this.lastHash !== currentHash) {
                this.lastHash = currentHash;
                this.route();
            }
        }, 500);
        
        // Start routing
        this.route();
    }

    route() {
        const user = store.getCurrentUser();
        // Clean up hash to get path
        let path = window.location.hash.replace(/^#/, '') || '/';
        if (path === '') path = '/';
        if (!path.startsWith('/')) path = '/' + path;
        
        this.lastHash = window.location.hash; // Sync lastHash

        if (!user && path !== '/login') { this.navigate('/login'); return; }
        if (user && path === '/login') { this.navigate('/'); return; }

        let view;
        if (path === '/login') view = Views.login();
        else if (user.role === 'admin') view = Views.admin();
        else view = Views.dashboard();

        this.render(view);
    }

    navigate(path) {
        window.location.hash = path;
        this.route();
    }

    render(content) {
        this.appElement.innerHTML = '';
        this.appElement.appendChild(content);
    }
}

const app = new App();
