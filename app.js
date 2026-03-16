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
        this.storageStatus = { available: this.isStorageAvailable, persistent: false, estimate: 0 };
        this._checkPersistence();
        this.state = this._load();
    }

    _checkStorageAvailable() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            console.warn('[Store] LocalStorage is not available:', e);
            return false;
        }
    }

    async _checkPersistence() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                this.storageStatus.persistent = await navigator.storage.persisted();
                if (navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    this.storageStatus.estimate = estimate.usage;
                }
            }
        } catch (e) {
            console.warn('[Store] Failed to check storage persistence, proceeding without it:', e);
        }
    }

    _load() {
        console.log('[Store] Loading state...');
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
            if (!saved) {
                console.log('[Store] No saved state found, using initial.');
                return initialState;
            }

            let state;
            try {
                state = JSON.parse(saved);
            } catch (parseErr) {
                console.error('[Store] Failed to parse saved state. Backing up corrupted data.', parseErr);
                // パース失敗したデータを退避し、その後リセット
                if (this.isStorageAvailable) {
                    const backupKey = this.STORAGE_KEY + '_corrupted_' + Date.now();
                    localStorage.setItem(backupKey, saved);
                    console.warn(`[Store] Corrupted data saved to: ${backupKey}`);
                }
                return initialState;
            }
            
            if (!state || typeof state !== 'object') {
                console.error('[Store] Saved state is invalid type, resetting.');
                return initialState;
            }

            // currentUser の型チェック（稀に文字列が入ることがあるため）
            if (state.currentUser && (typeof state.currentUser !== 'object' || !state.currentUser.id)) {
                console.warn('[Store] Invalid currentUser format detected, resetting user state.');
                state.currentUser = null;
            }

            const mergedState = { ...initialState, ...state };
            
            ['users', 'projects', 'workContents', 'timeEntries', 'auditLogs'].forEach(key => {
                if (!Array.isArray(mergedState[key])) {
                    mergedState[key] = initialState[key];
                }
            });

            console.log('[Store] State loaded successfully.');
            return mergedState;
        } catch (e) {
            console.error('[Store] Fatal error while loading state from localStorage:', e);
            return initialState;
        }
    }

    _pruneOldData(state) {
        // データ永続化のため、自動削除機能は無効化されました。
        return state;
    }

    _save() {
        if (this.isStorageAvailable) {
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            } catch (e) {
                console.error('Failed to save to localStorage:', e);
                // 容量不足などで保存できない場合に警告
                if (e.name === 'QuotaExceededError') {
                    alert('ブラウザの保存容量がいっぱいです。不要なデータを整理するか、データをエクスポートしてください。');
                } else {
                    alert('データの保存に失敗しました。ページをリロードせずに、データをエクスポートしてバックアップをとってください。');
                }
            }
        }
    }

    exportData() {
        const dataStr = JSON.stringify(this.state, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `timetracking_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);
                    if (imported && typeof imported === 'object') {
                        // データのマージではなく上書き（破壊的だが確実）
                        if (confirm('現在のデータが上書きされます。よろしいですか？')) {
                            this.state = { ...this.state, ...imported };
                            this._save();
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    }
                } catch (err) {
                    reject('ファイル形式が正しくありません。');
                }
            };
            reader.readAsText(file);
        });
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

    updatePassword(userId, newPassword) {
        const user = this.state.users.find(u => u.id === userId);
        if (user) {
            user.password = newPassword;
            this.logAction('UPDATE_PASSWORD', `User: ${user.email}`);
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

    deleteTimeEntry(id) {
        const index = this.state.timeEntries.findIndex(e => e.id === id);
        if (index !== -1) {
            const entry = this.state.timeEntries[index];
            if (entry.status === 'approved' || entry.status === 'submitted') {
                return false;
            }
            this.state.timeEntries.splice(index, 1);
            this.logAction('DELETE_ENTRY', `Entry deleted: ${id}`);
            this._save();
            return true;
        }
        return false;
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
                <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); text-align: center;">
                    <button id="import-btn" class="btn" style="font-size: 0.875rem; color: var(--text-secondary);">バックアップから復元</button>
                    <input type="file" id="import-file" style="display: none;" accept=".json">
                </div>
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

        const importBtn = container.querySelector('#import-btn');
        const fileInput = container.querySelector('#import-file');
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                try {
                    await store.importData(e.target.files[0]);
                    alert('復元が完了しました。');
                    location.reload();
                } catch (err) {
                    alert(err);
                }
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
                        <button class="btn" id="pw-change-btn" style="background: rgba(16, 185, 129, 0.1); color: var(--success); font-size: 0.875rem;">パスワード変更</button>
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
                return `<tr style="border-bottom: 1px solid var(--border);"><td style="padding: 1rem;">${new Date(e.createdAt).toLocaleDateString()}</td><td style="padding: 1rem;">${p ? p.name : '?'}</td><td style="padding: 1rem;">${e.hours}h</td><td style="padding: 1rem;">${e.description}</td><td style="padding: 1rem;"><span style="color: ${statusColor};">${e.status}</span></td><td style="padding: 1rem; display: flex; gap: 0.5rem;">${isLocked ? '' : `<button class="btn edit-btn" data-id="${e.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--bg-input);">修正</button><button class="btn delete-btn" data-id="${e.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); color: var(--danger);">削除</button>`}</td></tr>`;
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
                    const msg = `サイトのURLをコピーしました！利用中のURL: ${url}\n\n【重要】別のURL（ブランチ毎のプレビュー等）で開くとデータが引き継がれません。常にこのURLで開くようにしてください。`;
                    alert(msg);
                });
            });

            // 診断UIの追加（重複防止）
            const nav = container.querySelector('.navbar');
            if (!nav.querySelector('#diag-btn')) {
                const diagBtn = document.createElement('button');
                diagBtn.id = 'diag-btn';
                diagBtn.className = 'btn';
                diagBtn.style.cssText = 'background: rgba(16, 185, 129, 0.1); color: var(--success); font-size: 0.875rem;';
                diagBtn.textContent = 'データ診断/バックアップ';
                diagBtn.onclick = () => {
                    const s = store.storageStatus;
                    const msg = `【ストレージ診断】\n・保存機能: ${s.available ? 'OK' : 'エラー'}\n・永続化: ${s.persistent ? '許可済み' : 'ブラウザにより制限'}\n・現在の使用量: ${Math.round(s.estimate / 1024)} KB\n\n【データ保護】\n1日で消える場合は、ブラウザの設定で「終了時にCookieやデータを消去」が有効になっていないか確認してください。\n\n現在のデータをバックアップとしてダウンロードしますか？`;
                    if (confirm(msg)) {
                        store.exportData();
                    }
                };
                const div = nav.querySelector('div');
                div.insertBefore(diagBtn, div.firstChild);
            }

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

            container.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (confirm('この記録を削除してもよろしいですか？')) {
                        if (store.deleteTimeEntry(btn.dataset.id)) {
                            render();
                        } else {
                            alert('承認済みまたは提出済みの記録は削除できません。');
                        }
                    }
                });
            });

            container.querySelector('#pw-change-btn').addEventListener('click', () => {
                const newPw = prompt('新しいパスワードを入力してください');
                if (newPw && newPw.length >= 4) {
                    if (store.updatePassword(user.id, newPw)) {
                        alert('パスワードを変更しました。次回ログイン時から有効になります。');
                    }
                } else if (newPw) {
                    alert('パスワードは4文字以上で入力してください。');
                }
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
                    const msg = `サイトのURLをコピーしました！利用中のURL: ${url}\n\n【重要】別のURL（ブランチ毎のプレビュー等）で開くとデータが引き継がれません。常にこのURLで開くようにしてください。`;
                    alert(msg);
                });
            });

            // 診断UIの追加（重複防止）
            const nav = container.querySelector('.navbar');
            if (!nav.querySelector('#diag-btn')) {
                const diagBtn = document.createElement('button');
                diagBtn.id = 'diag-btn';
                diagBtn.className = 'btn';
                diagBtn.style.cssText = 'background: rgba(16, 185, 129, 0.1); color: var(--success); font-size: 0.875rem;';
                diagBtn.textContent = 'データ診断/バックアップ';
                diagBtn.onclick = () => {
                    const s = store.storageStatus;
                    const msg = `【ストレージ診断】\n・保存機能: ${s.available ? 'OK' : 'エラー'}\n・永続化: ${s.persistent ? '許可済み' : 'ブラウザにより制限'}\n・現在の使用量: ${Math.round(s.estimate / 1024)} KB\n\n【データ保護】\n1日で消える場合は、ブラウザの設定で「終了時にCookieやデータを消去」が有効になっていないか確認してください。\n\n現在のデータをバックアップとしてダウンロードしますか？`;
                    if (confirm(msg)) {
                        store.exportData();
                    }
                };
                const div = nav.querySelector('div');
                div.insertBefore(diagBtn, div.firstChild);
            }

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
        console.log('[App] Routing to:', window.location.hash || '/');
        
        // ローダーを非表示にする（確実な実行）
        const loader = document.getElementById('initial-loader');
        if (loader) loader.style.display = 'none';

        try {
            const user = store.getCurrentUser();
            let path = window.location.hash.replace(/^#/, '') || '/';
            if (path === '') path = '/';
            if (!path.startsWith('/')) path = '/' + path;
            
            this.lastHash = window.location.hash;

            if (!user && path !== '/login') { 
                console.log('[App] No user, redirecting to /login');
                this.navigate('/login'); 
                return; 
            }
            if (user && path === '/login') { 
                this.navigate('/'); 
                return; 
            }

            let view;
            if (path === '/login') {
                view = Views.login();
            } else if (user && user.role === 'admin') {
                view = Views.admin();
            } else if (user) {
                view = Views.dashboard();
            } else {
                this.navigate('/login');
                return;
            }

            this.render(view);
        } catch (err) {
            console.error('[App] Routing error:', err);
            // 致命的なエラー時はログイン画面に強制送還
            if (window.location.hash !== '#/login') {
                window.location.hash = '/login';
            }
        }
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

// 致命的なクラッシュ（フリーズ）を防ぐためのグローバル初期化トラップ
try {
    window.store = new Store(); // デバッグしやすいように window にもアタッチ
    window.app = new App();
} catch (globalErr) {
    console.error('[GlobalInit] Failed to initialize the application:', globalErr);
    
    // フリーズして真っ白・ローダー止まりになるのを防ぎ、緊急リセットUIを表示する
    const loader = document.getElementById('initial-loader');
    if (loader) loader.style.display = 'none';

    const appDiv = document.getElementById('app');
    if (appDiv) {
        appDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 2rem;">
                <h2 style="color: #ef4444; margin-bottom: 1rem;">システムの初期化に失敗しました</h2>
                <p style="margin-bottom: 2rem; color: #94a3b8;">ブラウザの保存データが壊れているか、環境に問題が発生しています。<br>アプリを初期状態にリセットして再起動しますか？（現在のデータは全て消去されます）</p>
                <button id="emergency-reset-btn" style="padding: 1rem 2rem; background: #ef4444; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: bold;">データをリセットしてアプリを再起動</button>
            </div>
        `;
        document.getElementById('emergency-reset-btn').addEventListener('click', () => {
            if (confirm('【警告】本当にすべてのデータをリセットしますか？')) {
                localStorage.removeItem('tt_pro_data');
                location.reload();
            }
        });
    }
}
