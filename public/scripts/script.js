let currentConfig = {};
let scrapedMembers = [];
let scrapedReactionMembers = [];
let scrapedBruteforceMembers = [];
let scrapedKeywordMembers = [];

// ─── SVG Icon Constants (modal + UI) ─────────────────────────────────────────
const SVG_WARN    = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const SVG_TRASH   = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const SVG_REFRESH = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
const SVG_FLAME   = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
const SVG_MERGE   = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>`;

// ─── Custom Modal ──────────────────────────────────────────────────────────────
function showConfirm({ title = 'Confirm', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = SVG_WARN } = {}) {
    return new Promise((resolve) => {
        const overlay  = document.getElementById('zModal');
        document.getElementById('zModalIcon').innerHTML    = icon;
        document.getElementById('zModalTitle').textContent   = title;
        document.getElementById('zModalMessage').textContent = message;
        const confirmBtn = document.getElementById('zModalConfirm');
        const cancelBtn  = document.getElementById('zModalCancel');
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent  = cancelText;
        cancelBtn.style.display = '';
        confirmBtn.className = 'z-btn z-btn-confirm' + (danger ? ' danger' : '');

        overlay.classList.add('active');

        function close(result) {
            overlay.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
            resolve(result);
        }
        function onConfirm() { close(true); }
        function onCancel()  { close(false); }
        function onOverlay(e) { if (e.target === overlay) close(false); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click',  onCancel);
        overlay.addEventListener('click', onOverlay);
    });
}

let logsPaused = false;
let logsPollingInterval = null;
let lastLogCount = 0;
let allLogs = [];
let currentLogFilter = null;
let campaignTimerInterval = null;

function startCampaignTimer(startTimeStr) {
    if (campaignTimerInterval) return; // already ticking
    const startMs = new Date(startTimeStr).getTime();
    const wrap  = document.getElementById('campaignTimerWrap');
    const timerEl = document.getElementById('campaignTimer');
    if (!wrap || !timerEl) return;
    wrap.style.display = 'flex';
    function tick() {
        const elapsed = Math.max(0, Date.now() - startMs);
        const h = Math.floor(elapsed / 3600000);
        const m = Math.floor((elapsed % 3600000) / 60000);
        const s = Math.floor((elapsed % 60000) / 1000);
        timerEl.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    tick();
    campaignTimerInterval = setInterval(tick, 1000);
}

function stopCampaignTimer() {
    if (campaignTimerInterval) { clearInterval(campaignTimerInterval); campaignTimerInterval = null; }
    const wrap = document.getElementById('campaignTimerWrap');
    if (wrap) wrap.style.display = 'none';
}

// ─── Custom select dropdowns ──────────────────────────────────────────────────
function setupCustomSelects() {
    function closeAll() {
        document.querySelectorAll('.select-dropdown-panel.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.select-trigger.open').forEach(t => t.classList.remove('open'));
    }
    // Global close: click outside, touch outside, ESC, or scroll
    document.addEventListener('click', closeAll);
    document.addEventListener('touchstart', (e) => {
        const open = document.querySelector('.select-dropdown-panel.open');
        if (!open) return;
        if (!open.contains(e.target) && !e.target.closest('.select-trigger')) closeAll();
    }, { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    window.addEventListener('scroll', closeAll, true);
    window.addEventListener('resize', closeAll);

    document.querySelectorAll('select').forEach(native => {
        // Wrap native select
        const wrapper = document.createElement('div');
        wrapper.className = 'select-wrapper';

        // Transfer layout-relevant classes to wrapper
        ['schedule-select'].forEach(cls => {
            if (native.classList.contains(cls)) wrapper.classList.add(cls);
        });

        native.parentNode.insertBefore(wrapper, native);
        wrapper.appendChild(native);

        // Trigger button
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'select-trigger';

        // Panel — appended to body to avoid card transform stacking context issues
        const panel = document.createElement('div');
        panel.className = 'select-dropdown-panel';
        document.body.appendChild(panel);

        function buildOptions() {
            panel.innerHTML = '';
            Array.from(native.options).forEach(opt => {
                const item = document.createElement('div');
                item.className = 'select-option' + (opt.selected ? ' selected' : '');
                item.dataset.value = opt.value;
                item.textContent = opt.textContent;
                const selectOption = () => {
                    native.value = opt.value;
                    native.dispatchEvent(new Event('change', { bubbles: true }));
                    syncTrigger();
                    closePanel();
                };
                item.addEventListener('mousedown', (e) => { e.preventDefault(); selectOption(); });
                item.addEventListener('touchend', (e) => { e.preventDefault(); selectOption(); }, { passive: false });
                panel.appendChild(item);
            });
        }

        function syncTrigger() {
            const sel = native.options[native.selectedIndex];
            trigger.textContent = sel ? sel.textContent : '—';
            panel.querySelectorAll('.select-option').forEach(item => {
                item.classList.toggle('selected', item.dataset.value === native.value);
            });
        }

        function positionPanel() {
            const rect = trigger.getBoundingClientRect();
            const panelMaxH = 240;
            const spaceBelow = window.innerHeight - rect.bottom - 8;
            const spaceAbove = rect.top - 8;
            const goUp = spaceBelow < panelMaxH && spaceAbove > spaceBelow;
            panel.classList.toggle('open-up', goUp);
            if (!goUp) {
                panel.style.top  = (rect.bottom + 6) + 'px';
                panel.style.bottom = 'auto';
                panel.style.transformOrigin = 'top center';
            } else {
                const panelH = Math.min(panelMaxH, spaceAbove);
                panel.style.top  = (rect.top - panelH - 6) + 'px';
                panel.style.bottom = 'auto';
                panel.style.transformOrigin = 'bottom center';
            }
            panel.style.left  = rect.left + 'px';
            panel.style.width = rect.width + 'px';
        }

        function openPanel() {
            document.querySelectorAll('.select-dropdown-panel.open').forEach(p => p.classList.remove('open'));
            document.querySelectorAll('.select-trigger.open').forEach(t => t.classList.remove('open'));
            positionPanel();
            trigger.classList.add('open');
            panel.classList.add('open');
            const sel = panel.querySelector('.select-option.selected');
            if (sel) sel.scrollIntoView({ block: 'nearest' });
        }

        function closePanel() {
            trigger.classList.remove('open');
            panel.classList.remove('open');
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.contains('open') ? closePanel() : openPanel();
        });

        buildOptions();
        syncTrigger();
        wrapper.appendChild(trigger);
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    applyStoredTheme();
    setupCustomSelects();
    setupTabs();
    setupEventListeners();
    setupMobileDrawer();
    setupSwipeGesture();
    restoreActiveTab();
    loadData();
    setInterval(loadData, 3000);
});

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyStoredTheme() {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }
    // Sync with server preference (async, updates if out of sync)
    fetch('/api/theme').then(r => r.json()).then(d => {
        const serverTheme = d.theme || 'dark';
        const localTheme  = localStorage.getItem('theme') || 'dark';
        if (serverTheme !== localTheme) {
            localStorage.setItem('theme', serverTheme);
            if (serverTheme === 'light') document.body.classList.add('light-mode');
            else document.body.classList.remove('light-mode');
        }
    }).catch(() => {});
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    const theme = isLight ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    fetch('/api/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme }) }).catch(() => {});
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────
function setupMobileDrawer() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const overlay      = document.getElementById('drawerOverlay');
    const tabs         = document.querySelector('.tabs');
    if (!hamburgerBtn || !overlay || !tabs) return;

    function openDrawer() {
        tabs.classList.add('open');
        overlay.classList.add('open');
    }

    function closeDrawer() {
        tabs.classList.remove('open');
        overlay.classList.remove('open');
    }

    hamburgerBtn.addEventListener('click', () => {
        // Close any stray custom-select dropdowns first
        document.querySelectorAll('.select-dropdown-panel.open').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.select-trigger.open').forEach(t => t.classList.remove('open'));
        tabs.classList.contains('open') ? closeDrawer() : openDrawer();
    });

    overlay.addEventListener('click', closeDrawer);

    tabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) closeDrawer();
    });
}

// ─── Swipe gesture (mobile drawer) ───────────────────────────────────────────
function setupSwipeGesture() {
    const DRAWER_WIDTH    = 220;
    const EDGE_ZONE       = 35;   // px from left edge to initiate open swipe
    const COMMIT_DISTANCE = 75;   // px needed to commit open/close
    const VELOCITY_MIN    = 0.35; // px/ms — fast flick commits regardless of distance

    const tabs    = document.querySelector('.tabs');
    const overlay = document.getElementById('drawerOverlay');
    if (!tabs || !overlay) return;

    let startX       = 0;
    let startY       = 0;
    let lastX        = 0;
    let startTime    = 0;
    let dragging     = false;
    let horizontal   = false; // direction locked in
    let dirLocked    = false;
    let wasOpen      = false;

    function isMobile() { return window.innerWidth <= 768; }

    function disableTransition() {
        tabs.style.transition = 'none';
    }

    function enableTransition() {
        tabs.style.transition = '';
    }

    function setLivePosition(offset) {
        tabs.style.left = offset + 'px';
        const progress = Math.max(0, Math.min(1, (offset + DRAWER_WIDTH) / DRAWER_WIDTH));
        overlay.style.display  = 'block';
        overlay.style.opacity  = String(progress * 0.85);
        overlay.style.pointerEvents = 'none';
    }

    function clearInlineStyles() {
        tabs.style.left            = '';
        overlay.style.display      = '';
        overlay.style.opacity      = '';
        overlay.style.pointerEvents = '';
    }

    function commitOpen() {
        enableTransition();
        clearInlineStyles();
        tabs.classList.add('open');
        overlay.classList.add('open');
    }

    function commitClose() {
        enableTransition();
        clearInlineStyles();
        tabs.classList.remove('open');
        overlay.classList.remove('open');
    }

    document.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        startX     = lastX = e.touches[0].clientX;
        startY     = e.touches[0].clientY;
        startTime  = Date.now();
        dragging   = false;
        dirLocked  = false;
        horizontal = false;
        wasOpen    = tabs.classList.contains('open');

        if (!wasOpen && startX > EDGE_ZONE) return;
        dragging = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!dragging || !isMobile()) return;

        const x  = e.touches[0].clientX;
        const y  = e.touches[0].clientY;
        const dx = x - startX;
        const dy = Math.abs(y - startY);
        lastX = x;

        if (!dirLocked) {
            if (Math.abs(dx) < 5 && dy < 5) return;
            if (dy > Math.abs(dx)) { dragging = false; return; }
            horizontal = true;
            dirLocked  = true;
            disableTransition();
        }

        const base   = wasOpen ? 0 : -DRAWER_WIDTH;
        const offset = Math.min(0, Math.max(-DRAWER_WIDTH, base + dx));
        setLivePosition(offset);
        e.preventDefault();
    }, { passive: false });

    function onTouchEnd() {
        if (!dragging || !isMobile()) { dragging = false; return; }
        dragging = false;
        if (!dirLocked) return;

        const dx       = lastX - startX;
        const elapsed  = Math.max(1, Date.now() - startTime);
        const velocity = dx / elapsed;

        let shouldOpen;
        if (wasOpen) {
            shouldOpen = !(dx < -COMMIT_DISTANCE || velocity < -VELOCITY_MIN);
        } else {
            shouldOpen = dx > COMMIT_DISTANCE || velocity > VELOCITY_MIN;
        }

        shouldOpen ? commitOpen() : commitClose();
    }

    document.addEventListener('touchend',    onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', () => {
        if (!dragging) return;
        dragging = false;
        wasOpen ? commitOpen() : commitClose();
    }, { passive: true });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            showTab(tabName);
            saveActiveTab(tabName);
            if (tabName === 'logs') startLogsPolling();
            else stopLogsPolling();
            if (tabName === 'history') loadHistory();
            if (tabName === 'panel') { loadPanelUsers(); loadPanelWebhookSettings(); }
        });
    });

    document.querySelectorAll('.scraper-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.scraper-type-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.scraper-section').forEach(s => s.style.display = 'none');
            e.target.classList.add('active');
            const type = e.target.dataset.type;
            document.getElementById(`${type}-scraper`).style.display = 'block';
        });
    });
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName)?.classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
}

function saveActiveTab(tabName) { localStorage.setItem('activeTab', tabName); }

function restoreActiveTab() {
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab && document.getElementById(savedTab)) {
        showTab(savedTab);
        if (savedTab === 'logs') startLogsPolling();
        if (savedTab === 'history') loadHistory();
    }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
    // Header
    document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Overview
    document.getElementById('startBtn')?.addEventListener('click', startCampaign);
    document.getElementById('stopBtn')?.addEventListener('click', stopCampaign);
    document.getElementById('pauseBtn')?.addEventListener('click', togglePause);
    document.getElementById('checkpointResumeBtn')?.addEventListener('click', resumeFromCheckpoint);
    document.getElementById('checkpointDiscardBtn')?.addEventListener('click', discardCheckpoint);
    document.getElementById('refreshBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('refreshBtn');
        if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }
        await loadData();
        if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
    });
    document.getElementById('historyRefreshBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('historyRefreshBtn');
        if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }
        await loadHistory();
        if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
    });
    document.getElementById('saveServerIdBtn')?.addEventListener('click', saveServerId);
    document.getElementById('clearBlockedBtn')?.addEventListener('click', clearBlocked);
    document.getElementById('scheduleBtn')?.addEventListener('click', scheduleCampaign);
    document.getElementById('cancelScheduleBtn')?.addEventListener('click', cancelSchedule);

    // Prevent clearing while typing
    document.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('focus', () => input.dataset.isFocused = 'true');
        input.addEventListener('blur', () => input.dataset.isFocused = 'false');
    });

    // Scraper Merger
    document.getElementById('mergeAllScrapersBtn')?.addEventListener('click', mergeAllScrapers);
    document.getElementById('downloadMergedBtn')?.addEventListener('click', downloadMergedMembers);

    // Scraper
    document.getElementById('scrapeOp14Btn')?.addEventListener('click', scrapeOpcode14);
    document.getElementById('downloadBtn')?.addEventListener('click', downloadScrapedMembers);
    document.getElementById('scrapeReactionBtn')?.addEventListener('click', scrapeReaction);
    document.getElementById('downloadReactionBtn')?.addEventListener('click', downloadReactionMembers);
    document.getElementById('scrapeBruteforceBtn')?.addEventListener('click', scrapeBruteforce);
    document.getElementById('downloadBruteforceBtn')?.addEventListener('click', downloadBruteforceMembers);
    document.getElementById('scrapeKeywordBtn')?.addEventListener('click', scrapeKeywords);
    document.getElementById('downloadKeywordBtn')?.addEventListener('click', downloadKeywordMembers);

    // Tokens
    document.getElementById('saveTokensBtn')?.addEventListener('click', saveTokens);
    document.getElementById('validateTokensBtn')?.addEventListener('click', validateTokens);
    document.getElementById('clearTokensBtn')?.addEventListener('click', () => {
        document.getElementById('tokensInput').value = '';
        saveTokens();
    });
    document.getElementById('copyTokensBtn')?.addEventListener('click', () => {
        const val = document.getElementById('tokensInput').value.trim();
        if (!val) return;
        navigator.clipboard.writeText(val).then(() => {
            const btn = document.getElementById('copyTokensBtn');
            const orig = btn.innerHTML;
            btn.innerHTML = '<svg class="btn-icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        });
    });

    // Members
    document.getElementById('saveMembersBtn')?.addEventListener('click', saveMembers);
    document.getElementById('exportMembersCSVBtn')?.addEventListener('click', exportMembersCSV);
    document.getElementById('clearMembersBtn')?.addEventListener('click', () => {
        document.getElementById('membersInput').value = '';
        saveMembers();
    });
    document.getElementById('copyMembersBtn')?.addEventListener('click', () => {
        const val = document.getElementById('membersInput').value.trim();
        if (!val) return;
        navigator.clipboard.writeText(val).then(() => {
            const btn = document.getElementById('copyMembersBtn');
            const orig = btn.innerHTML;
            btn.innerHTML = '<svg class="btn-icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        });
    });
    document.getElementById('tokensInput')?.addEventListener('input', updateTokensStats);
    document.getElementById('removeTokenDupsBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('tokensInput');
        const lines = ta.value.split('\n').map(l => l.trim()).filter(l => l);
        const unique = [...new Set(lines)];
        ta.value = unique.join('\n');
        updateTokensStats();
    });
    document.getElementById('normalizeTokensBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('tokensInput');
        const lines = ta.value.split('\n').map(l => l.trim()).filter(l => l);
        const normalized = lines.map(l => {
            const parts = l.split(':');
            return parts.length >= 3 ? parts[parts.length - 1] : l;
        });
        ta.value = normalized.join('\n');
        updateTokensStats();
    });
    document.getElementById('membersInput')?.addEventListener('input', updateMembersStats);
    document.getElementById('removeDupsBtn')?.addEventListener('click', () => {
        const ta = document.getElementById('membersInput');
        const lines = ta.value.split('\n').map(l => l.trim()).filter(l => l);
        const unique = [...new Set(lines)];
        ta.value = unique.join('\n');
        updateMembersStats();
    });

    // Config
    document.getElementById('addMessageBtn')?.addEventListener('click', () => addMessageInput());
    document.getElementById('saveConfigBtn')?.addEventListener('click', saveConfig);

    // Advanced — Joiner
    document.getElementById('joinAllTokensBtn')?.addEventListener('click', joinAllTokens);
    document.getElementById('saveJoinerConfigBtn')?.addEventListener('click', saveJoinerConfig);

    // Advanced — Captcha
    document.getElementById('saveCaptchaConfigBtn')?.addEventListener('click', saveCaptchaConfig);
    document.getElementById('testProxiesBtn')?.addEventListener('click', testAllProxies);
    document.getElementById('saveProxyConfigBtn')?.addEventListener('click', saveProxyConfig);
    document.getElementById('saveScraperSettingsBtn')?.addEventListener('click', saveScraperSettings);
    document.getElementById('enableNotificationsBtn')?.addEventListener('click', requestNotificationPermission);

    // History
    document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);

    // Panel (admin) — webhook
    document.getElementById('panelSaveWebhookBtn')?.addEventListener('click', savePanelWebhook);
    document.getElementById('panelTestWebhookBtn')?.addEventListener('click', testPanelWebhook);

    // Panel (admin)
    document.getElementById('generateMutexBtn')?.addEventListener('click', generatePanelMutex);
    document.getElementById('panelRefreshBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('panelRefreshBtn');
        btn.classList.add('btn-spinning');
        btn.disabled = true;
        await loadPanelUsers();
        btn.classList.remove('btn-spinning');
        btn.disabled = false;
    });

    // Logs — badge filters
    document.querySelectorAll('.log-badge[data-filter]').forEach(badge => {
        badge.addEventListener('click', () => {
            const filter = badge.dataset.filter;
            if (currentLogFilter === filter) {
                currentLogFilter = null;
                document.querySelectorAll('.log-badge[data-filter]').forEach(b => b.classList.remove('active'));
            } else {
                currentLogFilter = filter;
                document.querySelectorAll('.log-badge[data-filter]').forEach(b => {
                    b.classList.toggle('active', b.dataset.filter === filter);
                });
            }
            renderLogs(allLogs);
        });
    });

    // Logs — copy displayed
    document.getElementById('copyLogsBtn')?.addEventListener('click', () => {
        const viewer = document.getElementById('logViewer');
        if (!viewer) return;
        const rows = Array.from(viewer.querySelectorAll('.log-entry'));
        if (!rows.length) { showNotification('No logs to copy', 'error'); return; }
        const text = rows.map(row => {
            const ts  = row.querySelector('.log-ts')?.textContent  || '';
            const msg = row.querySelector('.log-msg')?.textContent || '';
            return `${ts}  ${msg}`;
        }).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copyLogsBtn');
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
        }).catch(() => showNotification('Copy failed', 'error'));
    });

    // Logs
    document.getElementById('clearLogsBtn')?.addEventListener('click', async () => {
        await fetch('/api/logs', { method: 'DELETE' });
        lastLogCount = 0;
        allLogs = [];
        currentLogFilter = null;
        document.querySelectorAll('.log-badge[data-filter]').forEach(b => b.classList.remove('active'));
        renderLogs([]);
    });

    document.getElementById('downloadLogsBtn')?.addEventListener('click', () => {
        if (!allLogs.length) { showNotification('No logs to download', 'error'); return; }
        const lines = allLogs.map(l => {
            const ts  = l.ts ? new Date(l.ts).toISOString() : new Date().toISOString();
            const lvl = (l.level || 'info').toUpperCase().padEnd(8);
            return `[${ts}] [${lvl}] ${l.message || ''}`;
        }).join('\n');
        const blob = new Blob([lines], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: `nubycord-logs-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.txt` });
        a.click();
        URL.revokeObjectURL(url);
        showNotification(`Downloaded ${allLogs.length} log entries`, 'success');
    });
    document.getElementById('pauseLogsBtn')?.addEventListener('click', () => {
        logsPaused = !logsPaused;
        const btn = document.getElementById('pauseLogsBtn');
        btn.textContent = logsPaused ? 'Resume' : 'Pause';
        btn.className = logsPaused ? 'btn btn-success' : 'btn btn-warning';
        btn.style.cssText = 'padding: 6px 14px; font-size: 0.82em;';
    });
    document.getElementById('refreshLogsBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('refreshLogsBtn');
        btn.classList.add('btn-spinning');
        btn.disabled = true;
        try {
            const res = await fetch('/api/logs');
            if (res.ok) {
                const logs = await res.json();
                lastLogCount = logs.length;
                renderLogs(logs);
            }
        } catch (_) {}
        btn.classList.remove('btn-spinning');
        btn.disabled = false;
    });
}

// ─── Load data ────────────────────────────────────────────────────────────────
async function loadData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Defensive normalisation — guard against any missing/malformed API fields
        if (!Array.isArray(data.tokens))  data.tokens  = [];
        if (!Array.isArray(data.members)) data.members = [];
        if (!data.status || typeof data.status !== 'object') data.status = {};
        if (!data.tokenStats || typeof data.tokenStats !== 'object') data.tokenStats = {};
        if (!Array.isArray(data.pausedTokens)) data.pausedTokens = [];

        updateInputValue('activeClients', data.activeClients || 0, 'textContent');
        updateInputValue('totalTokens', data.tokens.length, 'textContent');
        updateInputValue('totalMembers', data.members.length, 'textContent');
        updateInputValue('messagesRemaining', data.status.messagesRemaining ?? data.members.length, 'textContent');
        updateInputValue('messagesSent', data.messagesSent ?? data.status.messagesSent ?? 0, 'textContent');
        updateInputValue('blockedCount', data.blocked ?? 0, 'textContent');

        updateInputValue('tokensInput', data.tokens.join('\n'));
        updateTokensStats();
        updateInputValue('membersInput', data.members.join('\n'));
        updateMembersStats();
        updateInputValue('serverId', data.serverId);
        updateInputValue('op14-serverId', data.serverId);
        updateInputValue('reaction-serverId', data.serverId);

        // Progress bar
        const total = data.status?.totalMembers || 0;
        const sent  = data.status?.messagesSent || 0;
        const progressWrap = document.getElementById('progressWrap');
        if (total > 0 && data.status?.running) {
            const pct = Math.min(100, Math.round((sent / total) * 100));
            document.getElementById('progressFill').style.width = `${pct}%`;
            document.getElementById('progressLabel').textContent = `${pct}% (${sent} / ${total})`;
            progressWrap.style.display = 'flex';
        } else {
            progressWrap.style.display = 'none';
        }

        // Paused badge
        const pausedBadge = document.getElementById('pausedBadge');
        if (pausedBadge) pausedBadge.style.display = data.paused ? 'block' : 'none';

        // Pause button label — keep local isPaused in sync with server truth
        isPaused = !!data.paused;
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) pauseBtn.textContent = data.paused ? 'resume' : 'pause';

        // Start button label — reflect running state
        const startBtn = document.getElementById('startBtn');
        if (startBtn && !startBtn.disabled) {
            startBtn.textContent = data.status?.running ? 'running campaign...' : 'start campaign';
        }

        // Scheduled badge
        const scheduledBadge = document.getElementById('scheduledBadge');
        if (scheduledBadge) {
            if (data.scheduled && data.scheduledAt) {
                const t = new Date(data.scheduledAt).toLocaleTimeString();
                document.getElementById('scheduledTime').textContent = t;
                scheduledBadge.style.display = 'block';
            } else {
                scheduledBadge.style.display = 'none';
            }
        }

        // Toggle Schedule / Cancel buttons — only one visible at a time
        const schedBtn       = document.getElementById('scheduleBtn');
        const cancelSchedBtn = document.getElementById('cancelScheduleBtn');
        if (schedBtn && cancelSchedBtn) {
            if (data.scheduled) {
                schedBtn.style.display       = 'none';
                cancelSchedBtn.style.display = '';
            } else {
                schedBtn.style.display       = '';
                cancelSchedBtn.style.display = 'none';
            }
        }

        // Checkpoint resume banner — only show when campaign is not running
        const cpBanner = document.getElementById('checkpointBanner');
        if (cpBanner) {
            if (data.checkpoint && !data.status?.running) {
                const cp = data.checkpoint;
                const pct = cp.total > 0 ? Math.round(((cp.total - cp.remaining) / cp.total) * 100) : 0;
                const age = _timeAgo(new Date(cp.savedAt));
                const meta = document.getElementById('checkpointMeta');
                if (meta) meta.innerHTML =
                    `<strong>${cp.remaining.toLocaleString()}</strong> members left &nbsp;·&nbsp; ` +
                    `<strong>${cp.sent.toLocaleString()}</strong> already sent` +
                    (cp.total > 0 ? ` &nbsp;·&nbsp; <strong>${pct}%</strong> complete` : '') +
                    ` &nbsp;·&nbsp; saved ${age}`;
                cpBanner.style.display = 'flex';
            } else {
                cpBanner.style.display = 'none';
            }
        }

        // Live token stats (Tokens tab)
        updateLiveTokenStats(data.tokenStats || {}, data.pausedTokens || []);

        // Show Panel tab for admin users only
        const panelTabBtn = document.getElementById('panelTabBtn');
        if (panelTabBtn) panelTabBtn.style.display = data.isAdmin ? '' : 'none';

        // Members count badge in Members tab
        const membersCountBadge = document.getElementById('membersCountBadge');
        if (membersCountBadge) {
            if (data.members.length > 0) {
                membersCountBadge.textContent = data.members.length.toLocaleString();
                membersCountBadge.style.display = 'inline-block';
            } else {
                membersCountBadge.style.display = 'none';
            }
        }

        // Campaign timer + live send rate + ETA
        if (data.status?.running && data.status?.startTime) {
            startCampaignTimer(data.status.startTime);
            const elapsedMs  = Math.max(1000, Date.now() - new Date(data.status.startTime).getTime());
            const elapsedMin = elapsedMs / 60000;
            const sent       = data.status.messagesSent || 0;
            const remaining  = data.status.messagesRemaining || 0;
            const rate       = sent / elapsedMin; // msgs/min
            const rateEl     = document.getElementById('sendRateEl');
            const etaEl      = document.getElementById('campaignEtaEl');
            if (rateEl) {
                if (sent === 0)       rateEl.textContent = 'warming up…';
                else if (rate >= 1)   rateEl.textContent = `${Math.round(rate)} msg/min`;
                else                  rateEl.textContent = `${(rate * 60).toFixed(1)} msg/hr`;
            }
            if (etaEl) {
                if (sent === 0 || rate === 0)   etaEl.textContent = '—';
                else if (remaining === 0)        etaEl.textContent = 'done';
                else {
                    const etaMin = remaining / rate;
                    const etaH   = Math.floor(etaMin / 60);
                    const etaM   = Math.round(etaMin % 60);
                    etaEl.textContent = etaH > 0 ? `${etaH}h ${etaM}m` : `${etaM}m`;
                }
            }
        } else {
            stopCampaignTimer();
            const rateEl = document.getElementById('sendRateEl');
            const etaEl  = document.getElementById('campaignEtaEl');
            if (rateEl) rateEl.textContent = '—';
            if (etaEl)  etaEl.textContent  = '—';
        }

        // Scraper live progress
        const scrProg = data.scraperProgress;
        const progressMap = { opcode14: 'op14LiveProgress', reaction: 'reactionLiveProgress', opcode8: 'op8LiveProgress', keywords: 'keywordLiveProgress' };
        document.querySelectorAll('.scraper-live-progress').forEach(el => el.style.display = 'none');
        if (data.scrapingActive && scrProg) {
            const elId = progressMap[scrProg.type];
            const el   = elId ? document.getElementById(elId) : null;
            if (el) {
                const found   = scrProg.found ?? 0;
                const phase   = scrProg.phase === 'starting' ? 'Connecting…' : `Scanning — ${found.toLocaleString()} found so far`;
                el.style.display = 'block';
                el.innerHTML = `<div class="scraper-progress-bar"><span class="scraper-progress-pulse"></span><span>${phase}</span></div>`;
            }
        }

        // Check for campaign-complete notification
        if (data.status && !data.status.running && data.status.completedAt && data.status.messagesSent > 0) {
            maybeFireCompletionNotification(data.status.messagesSent);
        }

        const configResponse = await fetch('/api/config');
        if (!configResponse.ok) throw new Error(`HTTP ${configResponse.status}`);
        const config = await configResponse.json();
        currentConfig = { ...config };

        updateInputValue('loginDelayMin', config.login_delay_min);
        updateInputValue('loginDelayMax', config.login_delay_max);
        updateInputValue('dmDelayMin', config.dm_delay_min);
        updateInputValue('dmDelayMax', config.dm_delay_max);
        updateInputValue('perTokenLimit', config.per_token_limit ?? 0);
        updateInputValue('tokenCooldownMs', config.token_cooldown_ms ?? 30000);
        updateInputValue('perTokenRateLimit', config.per_token_rate_limit ?? 0);
        updateInputValue('dmRetryCount', config.dm_retry_count ?? 0);

        // Campaign Automation fields
        updateInputValue('tokenConcurrency',    config.token_concurrency        ?? 0);
        updateInputValue('campaignMinScore',    config.campaign_min_score       ?? 0);
        updateInputValue('failedRequeueDelay',  config.failed_requeue_delay_ms  ?? 30000);
        updateInputValue('tokenWarmingLimit',   config.token_warming_daily_limit ?? 0);
        updateInputValue('errorSpikeThreshold', config.error_spike_threshold    ?? 50);
        updateInputValue('errorSpikeWindow',    config.error_spike_window       ?? 20);
        const setChkField = (id, val) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.checked = !!val; };
        setChkField('failedRequeueEnabled', config.failed_requeue_enabled);
        setChkField('tokenWarmingEnabled',  config.token_warming_enabled);
        setChkField('errorSpikeEnabled',    config.error_spike_enabled);

        // Elite Automation fields
        setChkField('tokenTierEnabled',   config.token_tier_enabled);
        setChkField('friendRequestMode',  config.friend_request_mode);
        setChkField('paraphraseEnabled',  config.paraphrase_enabled);
        updateInputValue('friendRequestDmDelay', config.friend_request_dm_delay_ms ?? 90000);
        updateInputValue('paraphraseApiKey',  config.paraphrase_api_key  || '');
        updateInputValue('paraphraseModel',   config.paraphrase_model    || '');
        updateInputValue('paraphraseBaseUrl', config.paraphrase_base_url || '');
        const distModeEl = document.getElementById('distributedMode');
        if (distModeEl && document.activeElement !== distModeEl) distModeEl.value = config.distributed_mode || 'standalone';
        updateInputValue('nodeSecret',      config.node_secret      || '');
        updateInputValue('coordinatorUrl',  config.coordinator_url  || '');

        if (config.joiner) {
            const autoJoinEnabled = document.getElementById('autoJoinEnabled');
            if (autoJoinEnabled && document.activeElement !== autoJoinEnabled) autoJoinEnabled.checked = config.joiner.autoJoin || false;
            updateInputValue('joinerInvite', config.joiner.inviteCode || '');
            updateInputValue('joinerDelay', config.joiner.delay ?? 2000);
        }

        if (config.captcha) {
            const setChk = (id, val) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.checked = !!val; };
            setChk('captchaEnabled', config.captcha.enabled);
            updateInputValue('anticaptchaKey', config.captcha.apiKey || '');
        }

        if (config.proxy) {
            const proxyEnabled = document.getElementById('proxyEnabled');
            if (proxyEnabled && document.activeElement !== proxyEnabled) proxyEnabled.checked = config.proxy.enabled || false;
            updateInputValue('proxyInput', (config.proxy.proxies || []).join('\n'));
        }

        if (config.scraper) {
            updateInputValue('minAccountAge', config.scraper.minAccountAgeMinutes || 0);
            const filterAdmins = document.getElementById('filterAdmins');
            if (filterAdmins && document.activeElement !== filterAdmins) filterAdmins.checked = config.scraper.filterAdmins !== false;
            const filterBots = document.getElementById('filterBots');
            if (filterBots && document.activeElement !== filterBots) filterBots.checked = config.scraper.filterBots !== false;
        }

        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            const serverMessages = Array.isArray(config.dm_messages) ? config.dm_messages : [];
            // Sync localStorage with server messages when server has content
            if (serverMessages.length > 0) {
                try { localStorage.setItem('zc_dm_drafts', JSON.stringify(serverMessages)); } catch(e) {}
            }
            const anyMessageFocused = messagesContainer.querySelector('textarea:focus');
            if (!anyMessageFocused) {
                // Determine target: server messages, or localStorage fallback when server is empty
                let targetMessages = serverMessages;
                if (targetMessages.length === 0) {
                    try {
                        const drafts = JSON.parse(localStorage.getItem('zc_dm_drafts') || 'null');
                        if (Array.isArray(drafts) && drafts.some(v => v && v.trim())) {
                            targetMessages = drafts.filter(v => v && v.trim());
                        }
                    } catch(e) {}
                }
                // Filter out empty/blank textareas before comparing — newly added but
                // not-yet-typed textareas are invisible to the server and must not
                // trigger a container rebuild that would erase them.
                const currentSaved = Array.from(messagesContainer.querySelectorAll('textarea'))
                    .map(i => i.value.trim()).filter(v => v !== '');
                if (JSON.stringify(currentSaved) !== JSON.stringify(targetMessages)) {
                    messagesContainer.innerHTML = '';
                    targetMessages.forEach(msg => addMessageInput(msg));
                }
            }
        }

        updateNotificationStatusUI();

    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// ─── Live token stats panel ───────────────────────────────────────────────────
let lastNotifiedSent = 0;

function maybeFireCompletionNotification(totalSent) {
    if (totalSent > 0 && totalSent !== lastNotifiedSent) {
        lastNotifiedSent = totalSent;
        if (Notification.permission === 'granted') {
            new Notification('Nubycord — Campaign Complete', {
                body: `Successfully delivered ${totalSent} DMs!`,
                icon: '/favicon.ico'
            });
        }
    }
}

// ─── Live Token Stats sort + filter state ─────────────────────────────────────
let _ltsSort          = 'tag';
let _ltsSortDir       = 1;
let _ltsFilter        = '';
let _ltsLastStats     = null;
let _ltsLastPaused    = [];   // last pausedTokens array snapshot

function _ltsSetSort(col) {
    if (_ltsSort === col) { _ltsSortDir *= -1; }
    else { _ltsSort = col; _ltsSortDir = col === 'sent' || col === 'score' ? -1 : 1; }
}

function _ltsInitSearch() {
    const input = document.getElementById('ltsFilterInput');
    const clear = document.getElementById('ltsFilterClear');
    if (!input || input._ltsWired) return;
    input._ltsWired = true;
    input.addEventListener('input', () => {
        _ltsFilter = input.value.toLowerCase().trim();
        if (clear) clear.style.display = _ltsFilter ? '' : 'none';
        if (_ltsLastStats) updateLiveTokenStats(_ltsLastStats, _ltsLastPaused);
    });
    if (clear) {
        clear.addEventListener('click', () => {
            input.value = '';
            _ltsFilter = '';
            clear.style.display = 'none';
            input.focus();
            if (_ltsLastStats) updateLiveTokenStats(_ltsLastStats, _ltsLastPaused);
        });
    }
}

/**
 * Build a tiny inline SVG sparkline from an array of rate samples.
 * @param {number[]} samples  - up to 10 DMs/min values, oldest first
 * @param {string}   stroke   - CSS colour for the line
 * @returns {string} - SVG markup string, or a placeholder if data is too sparse
 */
function _buildSparkline(samples, stroke) {
    if (!samples || samples.length < 2) {
        return `<span style="color:var(--text-secondary);font-size:0.75em;line-height:1;">…</span>`;
    }
    const W = 62, H = 22, PAD = 3;
    const max = Math.max(...samples, 1);
    const pts = samples.map((v, i) => {
        const x = PAD + (i / (samples.length - 1)) * (W - PAD * 2);
        const y = PAD + (1 - v / max) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    // Filled area under the line for depth
    const firstX = PAD;
    const lastX  = (W - PAD).toFixed(1);
    const fillPts = `${firstX},${H - PAD} ${pts} ${lastX},${H - PAD}`;
    const peak = Math.max(...samples).toFixed(1);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;overflow:visible;" title="Peak: ${peak} DMs/min in last 5 min">` +
        `<polygon points="${fillPts}" fill="${stroke}" fill-opacity="0.12"/>` +
        `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="${pts.split(' ').pop().split(',')[0]}" cy="${pts.split(' ').pop().split(',')[1]}" r="2" fill="${stroke}"/>` +
        `</svg>`;
}

function updateLiveTokenStats(tokenStats, pausedTokens = []) {
    const card = document.getElementById('liveTokenStatsCard');
    const list = document.getElementById('liveTokenStatsList');
    if (!card || !list) return;

    const entries = Object.entries(tokenStats);
    if (entries.length === 0) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    // Persist snapshot so filter re-renders work without a new poll
    _ltsLastStats  = tokenStats;
    _ltsLastPaused = pausedTokens;
    _ltsInitSearch();

    const pausedSet = new Set(pausedTokens);

    const statusColors = {
        active: '#57f287', connecting: '#58a6ff', done: '#8b949e',
        limit: '#ffc83c', cooldown: '#ffa500', unhealthy: '#ed4245',
        captcha: '#ffc83c', invalid: '#ed4245', failed: '#ed4245',
        paused: '#5865f2', suspended: '#ff7700', warming: '#a78bfa',
    };

    // Enrich entries with computed fields
    let rows = entries.map(([token, stats]) => {
        const sent   = stats.sent   || 0;
        const errors = stats.errors || 0;
        const total  = sent + errors;
        const score  = total === 0 ? 100 : Math.round((sent / total) * 100);
        const tag    = stats.tag || (token.substring(0, 20) + '...');
        // DMs/min: overall rate since token connected
        const connectedAt = stats.connectedAt || Date.now();
        const elapsedMin  = Math.max(1 / 60, (Date.now() - connectedAt) / 60000);
        const rate        = sent > 0 ? +(sent / elapsedMin).toFixed(1) : 0;
        const rateSamples = Array.isArray(stats.rateSamples) ? stats.rateSamples : [];
        return { token, stats, sent, errors, score, tag, rate, rateSamples };
    });

    // Apply filter
    if (_ltsFilter) {
        rows = rows.filter(r =>
            r.tag.toLowerCase().includes(_ltsFilter) ||
            (r.stats.status || '').toLowerCase().includes(_ltsFilter)
        );
    }

    // Sort
    rows.sort((a, b) => {
        let av, bv;
        if      (_ltsSort === 'sent')   { av = a.sent;   bv = b.sent; }
        else if (_ltsSort === 'errors') { av = a.errors; bv = b.errors; }
        else if (_ltsSort === 'score')  { av = a.score;  bv = b.score; }
        else if (_ltsSort === 'status') { av = a.stats.status || ''; bv = b.stats.status || ''; return _ltsSortDir * av.localeCompare(bv); }
        else                            { av = a.tag.toLowerCase();   bv = b.tag.toLowerCase();  return _ltsSortDir * av.localeCompare(bv); }
        return _ltsSortDir * (av - bv);
    });

    // Helper: sort arrow
    const arrow = col => _ltsSort === col ? (_ltsSortDir === 1 ? ' ▲' : ' ▼') : '';

    const colDefs = [
        { key: 'tag',    label: 'Token',   style: 'flex:1;min-width:120px;' },
        { key: 'sent',   label: 'Sent',    style: 'width:52px;text-align:right;' },
        { key: 'errors', label: 'Errors',  style: 'width:56px;text-align:right;' },
        { key: 'rate',   label: 'DMs/min', style: 'width:68px;text-align:right;' },
        { key: 'trend',  label: 'Trend',   style: 'width:70px;text-align:center;' },
        { key: 'score',  label: 'Health',  style: 'width:62px;text-align:center;' },
        { key: 'status', label: 'Status',  style: 'width:80px;text-align:center;' },
        { key: 'cerr',   label: 'Streak',  style: 'width:96px;text-align:center;' },
    ];

    list.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'lts-header';
    colDefs.forEach(col => {
        const cell = document.createElement('span');
        cell.className = 'lts-th' + (_ltsSort === col.key ? ' lts-th--active' : '');
        cell.style.cssText = col.style;
        cell.textContent = col.label + arrow(col.key);
        cell.title = `Sort by ${col.label}`;
        cell.addEventListener('click', () => { _ltsSetSort(col.key); updateLiveTokenStats(tokenStats, pausedTokens); });
        header.appendChild(cell);
    });
    // Non-sortable pause column header
    const pauseTh = document.createElement('span');
    pauseTh.style.cssText = 'width:32px;text-align:center;';
    pauseTh.className = 'lts-th';
    pauseTh.title = 'Pause / resume individual token';
    pauseTh.textContent = '⏸';
    header.appendChild(pauseTh);
    list.appendChild(header);

    // No-results state
    if (rows.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:18px 12px;text-align:center;color:var(--text-secondary);font-size:0.85em;';
        empty.textContent = `No tokens match "${_ltsFilter}"`;
        list.appendChild(empty);
        return;
    }

    // Data rows
    rows.forEach(({ token, stats, sent, errors, score, tag, rate, rateSamples }) => {
        const isPaused  = pausedSet.has(token);
        const color     = statusColors[isPaused ? 'paused' : stats.status] || '#cdd9e5';
        const scoreTier = score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';

        // Highlight matched substring in tag
        let tagHtml = '@' + escHtml(tag);
        if (_ltsFilter) {
            const idx = tag.toLowerCase().indexOf(_ltsFilter);
            if (idx !== -1) {
                tagHtml = '@' + escHtml(tag.slice(0, idx))
                    + `<mark class="lts-highlight">${escHtml(tag.slice(idx, idx + _ltsFilter.length))}</mark>`
                    + escHtml(tag.slice(idx + _ltsFilter.length));
            }
        }

        const cerrVal = stats.consecutiveErrors || 0;
        const cerrMax = stats.maxConsecutiveErrors || 5;
        const cerrPct = Math.min(100, Math.round((cerrVal / cerrMax) * 100));
        const cerrColor = cerrVal === 0 ? '#57f287' : cerrVal >= cerrMax - 1 ? '#ed4245' : cerrVal >= Math.ceil(cerrMax / 2) ? '#ffc83c' : '#57f287';

        const row = document.createElement('div');
        row.className = 'lts-row' + (isPaused ? ' lts-row--paused' : '');
        const rateDisplay  = rate > 0 ? `${rate}` : '—';
        const sparkColor   = scoreTier === 'green' ? '#57f287' : scoreTier === 'yellow' ? '#ffc83c' : '#ed4245';
        const sparklineHtml = _buildSparkline(rateSamples, sparkColor);
        row.innerHTML = `
            <span style="flex:1;font-weight:600;color:var(--text-primary);min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tagHtml}</span>
            <span style="width:52px;text-align:right;color:var(--success);font-size:0.85em;font-weight:600;">✓ ${sent}</span>
            <span style="width:56px;text-align:right;color:var(--danger);font-size:0.85em;font-weight:600;">✗ ${errors}</span>
            <span style="width:68px;text-align:right;color:var(--text-secondary);font-size:0.82em;font-weight:600;" title="DMs delivered per minute since this token connected">${rateDisplay}</span>
            <span style="width:70px;display:flex;align-items:center;justify-content:center;">${sparklineHtml}</span>
            <span style="width:62px;text-align:center;">
                <span class="token-score-pill token-score-${scoreTier}" title="Health: ${score}/100">${score}%</span>
            </span>
            <span style="width:80px;text-align:center;">
                <span style="background:${color};color:#000;padding:3px 8px;border-radius:10px;font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;display:inline-block;">${escHtml(isPaused ? 'paused' : stats.status)}</span>
            </span>
            <span style="width:96px;text-align:center;" title="Consecutive errors: ${cerrVal}/${cerrMax} — retires at ${cerrMax}">
                <div class="lts-cerr-wrap">
                    <div class="lts-cerr-track"><div class="lts-cerr-fill" style="width:${cerrPct}%;background:${cerrColor};"></div></div>
                    <span class="lts-cerr-label" style="color:${cerrColor};">${cerrVal}/${cerrMax}</span>
                </div>
            </span>
        `;

        // Pause / resume toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'lts-pause-btn' + (isPaused ? ' lts-pause-btn--paused' : '');
        toggleBtn.title = isPaused ? 'Resume this token' : 'Pause this token';
        toggleBtn.innerHTML = isPaused
            ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>'
            : '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        toggleBtn.addEventListener('click', async () => {
            const endpoint = isPaused ? '/api/resume-token' : '/api/pause-token';
            try {
                await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            } catch (e) { /* ignore */ }
        });
        row.appendChild(toggleBtn);
        list.appendChild(row);
    });

    // ── Suspended tokens panel ───────────────────────────────────────────────
    _renderSuspendedPanel(list, tokenStats);
}

let _suspendCountdownTimer = null;

function _renderSuspendedPanel(list, tokenStats) {
    // Collect currently suspended tokens
    const now = Date.now();
    const suspended = Object.entries(tokenStats)
        .filter(([, s]) => s.status === 'suspended' && s.suspendedUntil && s.suspendedUntil > now)
        .map(([token, s]) => ({ token, s }));

    // Always remove any existing panel so it stays in sync
    const existing = list.querySelector('.lts-suspend-panel');
    if (existing) existing.remove();

    if (suspended.length === 0) {
        if (_suspendCountdownTimer) { clearInterval(_suspendCountdownTimer); _suspendCountdownTimer = null; }
        return;
    }

    // Build panel
    const panel = document.createElement('div');
    panel.className = 'lts-suspend-panel';
    panel.innerHTML = `
        <div class="lts-suspend-header">
            <span class="lts-suspend-icon">⏸</span>
            <span>Suspended Tokens</span>
            <span class="lts-suspend-count">${suspended.length}</span>
        </div>
        <div class="lts-suspend-rows" id="ltsSuspendRows"></div>`;
    list.appendChild(panel);

    function renderRows() {
        const rowsEl = document.getElementById('ltsSuspendRows');
        if (!rowsEl) return;
        const t = Date.now();
        rowsEl.innerHTML = suspended.map(({ token, s }) => {
            const tag         = s.tag || (token.substring(0, 24) + '…');
            const remaining   = Math.max(0, s.suspendedUntil - t);
            const total       = s.suspendedFor || 1;
            const pct         = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
            const secs        = Math.ceil(remaining / 1000);
            const mins        = Math.floor(secs / 60);
            const secsDisp    = secs % 60;
            const timeStr     = mins > 0 ? `${mins}m ${secsDisp}s` : `${secs}s`;
            const reason      = s.suspendReason || 'Rate-limit spike';
            return `
            <div class="lts-suspend-row">
                <span class="lts-suspend-tag" title="@${escHtml(tag)}">@${escHtml(tag)}</span>
                <span class="lts-suspend-reason">${escHtml(reason)}</span>
                <div class="lts-suspend-bar-wrap" title="${timeStr} remaining">
                    <div class="lts-suspend-bar" style="width:${pct}%;"></div>
                </div>
                <span class="lts-suspend-timer ${remaining <= 10000 ? 'lts-suspend-timer--ending' : ''}">${remaining === 0 ? 'resuming…' : timeStr}</span>
            </div>`;
        }).join('');
    }

    renderRows();

    // Clear any existing countdown and start a fresh one
    if (_suspendCountdownTimer) clearInterval(_suspendCountdownTimer);
    _suspendCountdownTimer = setInterval(() => {
        const nowTick = Date.now();
        // If all suspended tokens have completed, stop the timer
        const stillActive = suspended.some(({ s }) => s.suspendedUntil && s.suspendedUntil > nowTick);
        if (!stillActive) {
            clearInterval(_suspendCountdownTimer);
            _suspendCountdownTimer = null;
            const rowsEl = document.getElementById('ltsSuspendRows');
            if (rowsEl) rowsEl.innerHTML = '<div style="padding:8px 12px;font-size:0.82em;color:var(--success);">All tokens resumed ✓</div>';
            setTimeout(() => {
                const p = document.querySelector('.lts-suspend-panel');
                if (p) p.remove();
            }, 2000);
            return;
        }
        renderRows();
    }, 1000);
}

// ─── Notifications ────────────────────────────────────────────────────────────
function updateNotificationStatusUI() {
    const statusEl = document.getElementById('notificationStatus');
    const btn = document.getElementById('enableNotificationsBtn');
    if (!statusEl || !btn) return;
    if (!('Notification' in window)) {
        statusEl.textContent = 'Notifications not supported in this browser.';
        btn.style.display = 'none';
        return;
    }
    if (Notification.permission === 'granted') {
        statusEl.innerHTML = '<span style="color:#57f287;">✓ Notifications enabled</span>';
        btn.style.display = 'none';
    } else if (Notification.permission === 'denied') {
        statusEl.innerHTML = '<span style="color:#ed4245;">✗ Notifications blocked — allow them in your browser settings</span>';
        btn.style.display = 'none';
    } else {
        statusEl.textContent = 'Click the button below to allow notifications.';
        btn.style.display = '';
    }
}

async function requestNotificationPermission() {
    const result = await Notification.requestPermission();
    updateNotificationStatusUI();
    if (result === 'granted') showNotification('Notifications enabled!', 'success');
    else showNotification('Notification permission denied', 'error');
}

// ─── DM draft localStorage helpers ────────────────────────────────────────────
function _saveDmDrafts() {
    try {
        const vals = Array.from(document.querySelectorAll('#messagesContainer textarea')).map(t => t.value);
        if (vals.some(v => v.trim())) {
            localStorage.setItem('zc_dm_drafts', JSON.stringify(vals));
        }
    } catch(e) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function updateTokensStats() {
    const ta      = document.getElementById('tokensInput');
    const bar     = document.getElementById('tokensDupBar');
    const total   = document.getElementById('tokensTotalStat');
    const dupEl   = document.getElementById('tokensDupStat');
    const fmtEl   = document.getElementById('tokensFmtStat');
    const dupBtn  = document.getElementById('removeTokenDupsBtn');
    const fmtBtn  = document.getElementById('normalizeTokensBtn');
    if (!ta || !bar) return;

    const lines   = ta.value.split('\n').map(l => l.trim()).filter(l => l);
    const count   = lines.length;
    const unique  = new Set(lines).size;
    const dups    = count - unique;
    // email:pass:token has 2+ colons — the token is the last segment
    const prefixed = lines.filter(l => (l.match(/:/g) || []).length >= 2).length;

    if (count === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    total.textContent = `${count.toLocaleString()} total`;

    if (dups > 0) {
        dupEl.textContent = `· ${dups.toLocaleString()} duplicate${dups !== 1 ? 's' : ''}`;
        dupEl.style.color = 'var(--error, #ed4245)';
        dupBtn.textContent = `Remove ${dups.toLocaleString()} duplicate${dups !== 1 ? 's' : ''}`;
        dupBtn.style.display = 'inline-flex';
    } else {
        dupEl.textContent = '· no duplicates';
        dupEl.style.color = 'var(--success, #57f287)';
        dupBtn.style.display = 'none';
    }

    if (fmtEl && fmtBtn) {
        if (prefixed > 0) {
            fmtEl.textContent = `· ${prefixed.toLocaleString()} prefixed`;
            fmtEl.style.color = 'var(--warning, #ffc83c)';
            fmtBtn.textContent = `Strip ${prefixed.toLocaleString()} prefix${prefixed !== 1 ? 'es' : ''}`;
            fmtBtn.style.display = 'inline-flex';
        } else {
            fmtEl.textContent = '';
            fmtBtn.style.display = 'none';
        }
    }
}

function updateMembersStats() {
    const ta     = document.getElementById('membersInput');
    const bar    = document.getElementById('membersDupBar');
    const total  = document.getElementById('membersTotalStat');
    const dupEl  = document.getElementById('membersDupStat');
    const dupBtn = document.getElementById('removeDupsBtn');
    if (!ta || !bar) return;

    const lines  = ta.value.split('\n').map(l => l.trim()).filter(l => l);
    const count  = lines.length;
    const unique = new Set(lines).size;
    const dups   = count - unique;

    if (count === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    total.textContent = `${count.toLocaleString()} total`;
    if (dups > 0) {
        dupEl.textContent = `· ${dups.toLocaleString()} duplicate${dups !== 1 ? 's' : ''}`;
        dupEl.style.color = 'var(--error, #ed4245)';
        dupBtn.textContent = `Remove ${dups.toLocaleString()} duplicate${dups !== 1 ? 's' : ''}`;
        dupBtn.style.display = 'inline-flex';
    } else {
        dupEl.textContent = '· no duplicates';
        dupEl.style.color = 'var(--success, #57f287)';
        dupBtn.style.display = 'none';
    }
}

function updateInputValue(id, value, property = 'value') {
    const element = document.getElementById(id);
    if (!element) return;
    if (document.activeElement === element) return;
    if (property === 'textContent') element.textContent = value;
    else element.value = value;
}

// ─── Variable chip insertion ──────────────────────────────────────────────────
function insertVar(chipEl) {
    const text = chipEl.textContent.trim();
    const textareas = document.querySelectorAll('.dm-message-textarea');
    if (!textareas.length) return;

    // Use the textarea that last had focus, or the last one in the list
    let target = window._lastFocusedDMTextarea;
    if (!target || !document.contains(target)) target = textareas[textareas.length - 1];

    const start = target.selectionStart ?? target.value.length;
    const end   = target.selectionEnd   ?? target.value.length;
    target.value = target.value.slice(0, start) + text + target.value.slice(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + text.length;

    // Flash the chip to confirm insertion
    chipEl.classList.add('var-chip--flash');
    setTimeout(() => chipEl.classList.remove('var-chip--flash'), 400);

    // Trigger autosave
    target.dispatchEvent(new Event('blur'));
}

function previewInterpolate(template) {
    return template
        .replace(/\{random:([^}]+)\}/g, (_, opts) => {
            const choices = opts.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        })
        .replace(/\{username\}/gi, 'JohnDoe')
        .replace(/\{index\}/gi, '42');
}

function addMessageInput(message = '') {
    const container = document.getElementById('messagesContainer');
    const group = document.createElement('div');
    group.className = 'message-input-group';

    const wrap = document.createElement('div');
    wrap.className = 'msg-textarea-wrap';

    const input = document.createElement('textarea');
    input.className = 'dm-message-textarea';
    input.placeholder = 'Enter message (supports multiple lines)...';
    input.value = message;
    input.onfocus = () => { window._lastFocusedDMTextarea = input; };
    input.onblur = async () => { await saveConfig(); };

    const preview = document.createElement('div');
    preview.className = 'msg-preview';

    function updatePreview() {
        const val = input.value.trim();
        const hasVar = /\{username\}|\{index\}|\{random:/i.test(val);
        if (val && hasVar) {
            preview.textContent = '▸ ' + previewInterpolate(val);
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    }

    const counter = document.createElement('div');
    counter.className = 'dm-char-counter';
    function updateCounter() {
        const len = input.value.length;
        counter.textContent = `${len} / 2000`;
        counter.style.color = len > 2000 ? 'var(--error, #ed4245)' : '';
    }

    input.addEventListener('input', () => { updatePreview(); updateCounter(); _saveDmDrafts(); });
    updatePreview();
    updateCounter();

    wrap.appendChild(input);
    wrap.appendChild(preview);
    wrap.appendChild(counter);

    const btn = document.createElement('button');
    btn.className = 'btn btn-danger';
    btn.textContent = 'Remove';
    btn.type = 'button';
    btn.onclick = async (e) => { e.preventDefault(); group.remove(); await saveConfig(); };

    group.appendChild(wrap);
    group.appendChild(btn);
    container.appendChild(group);

    // Auto-focus when adding a new blank message (not when restoring from config)
    if (message === '') {
        setTimeout(() => input.focus(), 0);
    }
}

// ─── Campaign controls ────────────────────────────────────────────────────────
async function startCampaign() {
    const tokensRaw  = document.getElementById('tokensInput').value.trim();
    const membersRaw = document.getElementById('membersInput').value.trim();
    if (!tokensRaw)  { showNotification('Please add tokens first', 'error');  return; }
    if (!membersRaw) { showNotification('Please add members first', 'error'); return; }

    try {
        const cpRes  = await fetch('/api/checkpoint');
        const cpData = await cpRes.json();
        if (cpData.success && cpData.checkpoint) {
            const cp = cpData.checkpoint;
            const saved = new Date(cp.savedAt).toLocaleString();
            const shouldResume = await showConfirm({
                title: 'Resume Previous Campaign?',
                message: `A checkpoint from ${saved} was found — ${cp.remainingMembers.length} members remaining (${cp.messagesSent} already sent). Resume from where it left off?`,
                confirmText: 'Resume',
                cancelText: 'Start Fresh',
                icon: SVG_REFRESH
            });
            if (shouldResume) {
                const btn = document.getElementById('startBtn');
                if (btn) { btn.textContent = 'resuming...'; btn.disabled = true; }
                const resp = await fetch('/api/resume-checkpoint', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                const data = await resp.json();
                showNotification(data.message, data.success ? 'success' : 'error');
                if (btn) { btn.textContent = data.success ? 'running campaign...' : 'start campaign'; btn.disabled = false; }
                if (data.success) loadData();
                return;
            } else {
                await fetch('/api/checkpoint', { method: 'DELETE' });
            }
        }
    } catch (_) {}

    const btn = document.getElementById('startBtn');
    if (btn) { btn.textContent = 'starting...'; btn.disabled = true; }
    try {
        const tokens  = tokensRaw.split('\n').map(t => t.trim()).filter(t => t);
        const members = membersRaw.split('\n').map(m => m.trim()).filter(m => m);
        await Promise.all([
            fetch('/api/update-tokens',  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens }) }),
            fetch('/api/update-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members }) }),
            saveConfig()
        ]);
        const campaignLabel = (document.getElementById('campaignLabelInput')?.value || '').trim();
        const response = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: campaignLabel }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) {
            if (btn) { btn.textContent = 'running campaign...'; btn.disabled = false; }
            loadData();
        } else {
            if (btn) { btn.textContent = 'start campaign'; btn.disabled = false; }
        }
    } catch (error) {
        console.error('Start campaign error:', error);
        showNotification('Error starting campaign', 'error');
        if (btn) { btn.textContent = 'start campaign'; btn.disabled = false; }
    }
}

async function resumeFromCheckpoint() {
    const btn = document.getElementById('checkpointResumeBtn');
    if (btn) { btn.textContent = 'resuming...'; btn.disabled = true; }
    try {
        const resp = await fetch('/api/resume-checkpoint', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await resp.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) {
            document.getElementById('checkpointBanner').style.display = 'none';
            loadData();
        }
    } catch {
        showNotification('Error resuming from checkpoint', 'error');
    } finally {
        if (btn) { btn.textContent = 'Resume'; btn.disabled = false; }
    }
}

async function discardCheckpoint() {
    try {
        await fetch('/api/checkpoint', { method: 'DELETE' });
        document.getElementById('checkpointBanner').style.display = 'none';
        showNotification('Checkpoint discarded', 'info');
    } catch { /* ignore */ }
}

async function stopCampaign() {
    const btn = document.getElementById('stopBtn');
    if (btn) { btn.textContent = 'stopping...'; btn.disabled = true; }
    try {
        const response = await fetch('/api/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) loadData();
    } catch (error) {
        showNotification('Error stopping campaign', 'error');
    } finally {
        if (btn) { btn.textContent = 'stop campaign'; btn.disabled = false; }
    }
}

let isPaused = false;

async function togglePause() {
    const btn = document.getElementById('pauseBtn');
    if (btn) { btn.textContent = isPaused ? 'resuming...' : 'pausing...'; btn.disabled = true; }
    try {
        const endpoint = isPaused ? '/api/resume' : '/api/pause';
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        isPaused = !isPaused;
        showNotification(data.message, data.success ? 'success' : 'error');
        loadData();
    } catch (error) {
        showNotification('Error toggling pause', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function clearBlocked() {
    const btn = document.getElementById('clearBlockedBtn');
    if (btn) btn.disabled = true;
    try {
        const response = await fetch('/api/blocked', { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) loadData();
    } catch (error) {
        showNotification('Error clearing blocked list', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function scheduleCampaign() {
    const delayMs = parseInt(document.getElementById('scheduleDelay').value);
    if (!delayMs) { showNotification('Please select a delay', 'error'); return; }

    const tokensRaw  = document.getElementById('tokensInput').value.trim();
    const membersRaw = document.getElementById('membersInput').value.trim();
    if (!tokensRaw)  { showNotification('Please add tokens first', 'error');  return; }
    if (!membersRaw) { showNotification('Please add members first', 'error'); return; }

    const btn = document.getElementById('scheduleBtn');
    if (btn) { btn.textContent = 'scheduling...'; btn.disabled = true; }

    const tokens  = tokensRaw.split('\n').map(t => t.trim()).filter(t => t);
    const members = membersRaw.split('\n').map(m => m.trim()).filter(m => m);
    await Promise.all([
        fetch('/api/update-tokens',  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens }) }),
        fetch('/api/update-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members }) }),
        saveConfig()
    ]);

    try {
        const response = await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delayMs })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) loadData();
    } catch (error) {
        showNotification('Error scheduling campaign', 'error');
    } finally {
        if (btn) { btn.textContent = 'Schedule'; btn.disabled = false; }
    }
}

async function cancelSchedule() {
    const btn = document.getElementById('cancelScheduleBtn');
    if (btn) { btn.textContent = 'cancelling...'; btn.disabled = true; }
    try {
        const response = await fetch('/api/cancel-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        loadData();
    } catch (error) {
        showNotification('Error cancelling schedule', 'error');
    } finally {
        if (btn) { btn.textContent = 'Cancel'; btn.disabled = false; }
    }
}

async function saveTokens() {
    const raw = document.getElementById('tokensInput').value.split('\n').map(t => t.trim()).filter(t => t);
    const unique = [...new Set(raw)];
    try {
        const response = await fetch('/api/update-tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: unique }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) {
            const feedbackEl = document.getElementById('tokenSaveFeedback');
            if (feedbackEl) {
                const dupes = raw.length - unique.length;
                feedbackEl.textContent = `${unique.length} token${unique.length !== 1 ? 's' : ''} saved${dupes > 0 ? ` · ${dupes} duplicate${dupes > 1 ? 's' : ''} removed` : ''}`;
                feedbackEl.style.display = 'inline-block';
                setTimeout(() => { feedbackEl.style.display = 'none'; }, 5000);
            }
            loadData();
        }
    } catch (error) {
        showNotification('Error saving tokens', 'error');
    }
}

// ─── Server Auto-Joiner ───────────────────────────────────────────────────────
async function saveJoinerConfig() {
    const autoJoin   = document.getElementById('autoJoinEnabled')?.checked || false;
    const inviteCode = document.getElementById('joinerInvite')?.value.trim() || '';
    const delay      = parseInt(document.getElementById('joinerDelay')?.value) || 2000;
    try {
        const response = await fetch('/api/update-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ joiner: { autoJoin, inviteCode, delay } })
        });
        const data = await response.json();
        showNotification(data.success ? 'Joiner config saved' : data.message, data.success ? 'success' : 'error');
    } catch {
        showNotification('Error saving joiner config', 'error');
    }
}

async function runJoinOperation(tokens, inviteCode, delay) {
    const statusEl     = document.getElementById('joinerStatus');
    const summaryEl    = document.getElementById('joinerStatusSummary');
    const listEl       = document.getElementById('joinerStatusList');
    if (!statusEl) return;

    statusEl.style.display = 'block';
    listEl.innerHTML = '';
    summaryEl.textContent  = `Joining ${tokens.length} token(s) — please wait…`;

    try {
        const response = await fetch('/api/join-server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens, inviteCode, delay })
        });
        const data = await response.json();
        if (!data.success) { showNotification(data.message || 'Join failed', 'error'); return; }

        const results = data.results || [];
        const joined  = results.filter(r => r.status === 'joined').length;
        const failed  = results.filter(r => r.status === 'failed').length;
        const limited = results.filter(r => r.status === 'ratelimit').length;

        summaryEl.textContent = `Done — ${joined} joined, ${failed} failed${limited ? `, ${limited} rate-limited` : ''}`;

        listEl.innerHTML = '';
        results.forEach(r => {
            const colors = { joined: '#57f287', failed: '#ed4245', ratelimit: '#ffc83c' };
            const color  = colors[r.status] || '#b5bdc1';
            const row    = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.88em;';
            row.innerHTML = `<span style="font-family:monospace;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.token}…</span><span style="color:${color};font-weight:600;flex-shrink:0;">${r.message}</span>`;
            listEl.appendChild(row);
        });
    } catch {
        showNotification('Error running join operation', 'error');
    }
}

async function joinAllTokens() {
    const inviteCode = document.getElementById('joinerInvite')?.value.trim();
    const delay      = parseInt(document.getElementById('joinerDelay')?.value) || 2000;
    if (!inviteCode) { showNotification('Enter an invite URL or code first', 'error'); return; }

    const rawTokens = document.getElementById('tokensInput')?.value.split('\n').map(t => t.trim()).filter(t => t) || [];
    if (!rawTokens.length) { showNotification('No tokens loaded — add tokens first', 'error'); return; }

    const btn = document.getElementById('joinAllTokensBtn');
    btn.disabled = true;
    btn.textContent = 'Joining…';
    try {
        await runJoinOperation(rawTokens, inviteCode, delay);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Join All Tokens Now';
    }
}

async function validateTokens() {
    const tokens = document.getElementById('tokensInput').value.split('\n').map(t => t.trim()).filter(t => t);
    if (tokens.length === 0) { showNotification('Please add tokens first', 'error'); return; }
    const btn = document.getElementById('validateTokensBtn');
    btn.disabled = true;
    btn.textContent = 'Validating...';
    let validTokens = [];
    try {
        const response = await fetch('/api/validate-tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            displayTokenStatus(data.tokens);
            showNotification(`Validated ${data.tokens.length} tokens`, 'success');
            validTokens = data.tokens.filter(t => t.valid).map(t => t.token);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showNotification('Error validating tokens', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Validate Tokens';
    }

    const autoJoinEnabled = document.getElementById('autoJoinEnabled')?.checked;
    const inviteCode      = document.getElementById('joinerInvite')?.value.trim();
    if (autoJoinEnabled && inviteCode && validTokens.length > 0) {
        const delay = parseInt(document.getElementById('joinerDelay')?.value) || 2000;
        showNotification(`Auto-joining ${validTokens.length} valid token(s)…`, 'info');
        await runJoinOperation(validTokens, inviteCode, delay);
    }
}

function displayTokenStatus(tokenResults) {
    const statusList = document.getElementById('tokenStatusList');
    if (tokenResults.length === 0) {
        statusList.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">No tokens to display</p>';
        return;
    }

    statusList.innerHTML = '';

    tokenResults.forEach(result => {
        const isValid  = result.valid;
        const bgColor  = isValid ? '#57f287' : '#ed4245';
        const txtColor = isValid ? '#000' : '#fff';
        const username = result.username || 'Unknown';
        const tokenFirstSegment = result.token.split('.')[0];

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);gap:10px;flex-wrap:wrap;';

        const tokenSpan = document.createElement('span');
        tokenSpan.textContent = tokenFirstSegment;
        tokenSpan.style.cssText = 'font-family:monospace;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;min-width:80px;';
        tokenSpan.title = 'Click to copy token';
        tokenSpan.addEventListener('click', () => { navigator.clipboard.writeText(result.token).catch(() => {}); });

        const badge = document.createElement('span');
        badge.textContent = '@' + username;
        badge.style.cssText = `background-color:${bgColor};color:${txtColor};padding:4px 12px;border-radius:12px;font-size:0.85em;font-weight:600;white-space:nowrap;flex-shrink:0;cursor:default;`;
        badge.addEventListener('click', () => { navigator.clipboard.writeText(username).catch(() => {}); });

        row.appendChild(tokenSpan);
        row.appendChild(badge);

        // Health pills for valid tokens
        if (isValid) {
            const pillDefs = [
                { key: 'nitro',      label: 'Nitro',    color: '#f47fff' },
                { key: 'verified',   label: 'Verified', color: '#57f287', textColor: '#000' },
                { key: 'email',      label: 'Email',    color: '#5865f2' },
                { key: 'phone',      label: 'Phone',    color: '#faa61a', textColor: '#000' },
                { key: 'mfaEnabled', label: 'MFA',      color: '#43b581' },
            ];
            pillDefs.forEach(({ key, label, color, textColor = '#fff' }) => {
                if (result[key]) {
                    const pill = document.createElement('span');
                    pill.textContent = label;
                    pill.style.cssText = `background:${color};color:${textColor};padding:2px 8px;border-radius:10px;font-size:0.72em;font-weight:700;white-space:nowrap;flex-shrink:0;`;
                    row.appendChild(pill);
                }
            });
        }

        statusList.appendChild(row);
    });
}

// ─── Members ──────────────────────────────────────────────────────────────────
async function saveMembers() {
    const members = document.getElementById('membersInput').value.split('\n').map(m => m.trim()).filter(m => m);
    try {
        const response = await fetch('/api/update-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) loadData();
    } catch (error) {
        showNotification('Error saving members', 'error');
    }
}

function exportMembersCSV() {
    const raw = document.getElementById('membersInput').value.trim();
    const members = raw.split('\n').map(m => m.trim()).filter(m => m);
    if (!members.length) { showNotification('No members to export', 'error'); return; }
    const csvContent = 'user_id\n' + members.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `members_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    showNotification(`Exported ${members.length} IDs as CSV`, 'success');
}

// ─── Server ID ────────────────────────────────────────────────────────────────
async function saveServerId() {
    const serverId = document.getElementById('serverId').value.trim();
    try {
        const response = await fetch('/api/update-server-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serverId }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
    } catch (error) {
        showNotification('Error saving server ID', 'error');
    }
}

// ─── Config ───────────────────────────────────────────────────────────────────
async function saveConfig() {
    const messages = Array.from(document.querySelectorAll('#messagesContainer textarea')).map(t => t.value.trim()).filter(m => m);
    const config = {
        ...currentConfig,
        login_delay_min:   parseInt(document.getElementById('loginDelayMin').value)   || 1000,
        login_delay_max:   parseInt(document.getElementById('loginDelayMax').value)   || 2000,
        dm_delay_min:      parseInt(document.getElementById('dmDelayMin').value)      || 8000,
        dm_delay_max:      parseInt(document.getElementById('dmDelayMax').value)      || 16000,
        per_token_limit:      parseInt(document.getElementById('perTokenLimit').value)      || 0,
        per_token_rate_limit: parseInt(document.getElementById('perTokenRateLimit')?.value) || 0,
        token_cooldown_ms:    parseInt(document.getElementById('tokenCooldownMs').value)    || 30000,
        dm_retry_count:    parseInt(document.getElementById('dmRetryCount')?.value)   || 0,
        dm_messages: messages
    };
    // Elite settings are saved by their own button — don't clobber them here
    try {
        const response = await fetch('/api/update-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
    } catch (error) {
        showNotification('Error saving configuration', 'error');
    }
}

// ─── History ──────────────────────────────────────────────────────────────────
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const history = await response.json();
        renderHistory(history);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// ─── History Performance Chart ────────────────────────────────────────────────
let historyChartInstance = null;

function initHistoryChart() {
    const ctx = document.getElementById('historyChart');
    if (!ctx || historyChartInstance) return;
    const isDark    = !document.body.classList.contains('light-mode');
    const textColor = isDark ? '#b9bbbe' : '#4f545c';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    historyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'DMs Sent',
                    data: [],
                    backgroundColor: 'rgba(87,242,135,0.75)',
                    borderColor: '#57f287',
                    borderWidth: 1,
                    borderRadius: 3,
                    yAxisID: 'y',
                    order: 2,
                },
                {
                    label: 'Errors',
                    data: [],
                    backgroundColor: 'rgba(237,66,69,0.65)',
                    borderColor: '#ed4245',
                    borderWidth: 1,
                    borderRadius: 3,
                    yAxisID: 'y',
                    order: 3,
                },
                {
                    label: 'Blocked',
                    data: [],
                    backgroundColor: 'rgba(250,166,26,0.55)',
                    borderColor: '#faa61a',
                    borderWidth: 1,
                    borderRadius: 3,
                    yAxisID: 'y',
                    order: 4,
                },
                {
                    label: 'Success %',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(124,143,245,0.9)',
                    backgroundColor: 'rgba(124,143,245,0.12)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#7c8ff5',
                    fill: false,
                    tension: 0.35,
                    yAxisID: 'y2',
                    order: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.y;
                            return ctx.dataset.label === 'Success %'
                                ? ` ${ctx.dataset.label}: ${v.toFixed(1)}%`
                                : ` ${ctx.dataset.label}: ${v}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 10, font: { size: 10 }, color: textColor, maxRotation: 30, minRotation: 0 },
                    grid: { color: gridColor },
                },
                y: {
                    beginAtZero: true,
                    position: 'left',
                    ticks: { precision: 0, font: { size: 10 }, color: textColor },
                    grid: { color: gridColor },
                    title: { display: true, text: 'Count', font: { size: 10 }, color: textColor },
                },
                y2: {
                    beginAtZero: true,
                    max: 100,
                    position: 'right',
                    ticks: {
                        precision: 1,
                        font: { size: 10 },
                        color: 'rgba(124,143,245,0.85)',
                        callback: (v) => v + '%',
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Rate', font: { size: 10 }, color: 'rgba(124,143,245,0.85)' },
                },
            },
        },
    });
}

function updateHistoryChart(history) {
    const card = document.getElementById('historyChartCard');
    if (!card) return;
    if (!history || history.length < 2) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    if (!historyChartInstance) initHistoryChart();
    if (!historyChartInstance) return;

    const slice = [...history].reverse().slice(-20);

    const labels   = slice.map(e => {
        const d = new Date(e.startTime);
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    });
    const sentData    = slice.map(e => e.totalSent || 0);
    const errData     = slice.map(e => e.totalErrors || 0);
    const blockedData = slice.map(e => e.blockedThisRun || 0);
    const rateData    = slice.map(e => {
        const s = e.totalSent || 0;
        const total = s + (e.totalErrors || 0);
        return total > 0 ? parseFloat(((s / total) * 100).toFixed(1)) : 100;
    });

    historyChartInstance.data.labels                  = labels;
    historyChartInstance.data.datasets[0].data        = sentData;
    historyChartInstance.data.datasets[1].data        = errData;
    historyChartInstance.data.datasets[2].data        = blockedData;
    historyChartInstance.data.datasets[3].data        = rateData;
    historyChartInstance.update();

    const totalSent = slice.reduce((s, e) => s + (e.totalSent || 0), 0);
    const totalErr  = slice.reduce((s, e) => s + (e.totalErrors || 0), 0);
    const avgRate   = slice.reduce((s, e) => {
        const sent = e.totalSent || 0;
        const tot  = sent + (e.totalErrors || 0);
        return s + (tot > 0 ? (sent / tot) * 100 : 100);
    }, 0) / slice.length;

    const sentBadge = document.getElementById('hcTotalSentBadge');
    const errBadge  = document.getElementById('hcTotalErrBadge');
    const rateBadge = document.getElementById('hcAvgRateBadge');
    if (sentBadge) sentBadge.textContent = `${totalSent.toLocaleString()} total sent`;
    if (errBadge)  errBadge.textContent  = `${totalErr.toLocaleString()} total errors`;
    if (rateBadge) rateBadge.textContent = `${avgRate.toFixed(1)}% avg success`;
}

function buildTokenLeaderboard(history) {
    const card  = document.getElementById('tokenLeaderboardCard');
    const table = document.getElementById('tokenLeaderboardTable');
    if (!card || !table) return;

    const map = {};
    history.forEach(entry => {
        if (!entry.tokenSummary || !entry.tokenSummary.length) return;
        entry.tokenSummary.forEach(t => {
            if (!t.tag) return;
            if (!map[t.tag]) map[t.tag] = { tag: t.tag, sent: 0, errors: 0, campaigns: 0 };
            map[t.tag].sent     += t.sent    || 0;
            map[t.tag].errors   += t.errors  || 0;
            map[t.tag].campaigns++;
        });
    });

    const tokens = Object.values(map);
    if (tokens.length < 2) { card.style.display = 'none'; return; }

    tokens.sort((a, b) => {
        const rateA = a.sent + a.errors > 0 ? a.sent / (a.sent + a.errors) : 1;
        const rateB = b.sent + b.errors > 0 ? b.sent / (b.sent + b.errors) : 1;
        if (rateB !== rateA) return rateB - rateA;
        return b.sent - a.sent;
    });

    const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];

    const rows = tokens.map((t, i) => {
        const total   = t.sent + t.errors;
        const rate    = total > 0 ? Math.round((t.sent / total) * 100) : 100;
        const rankNum = i + 1;
        const medal   = rankNum <= 3 ? `<span style="color:${medalColors[i]};font-size:1em;">${['🥇','🥈','🥉'][i]}</span>` : `<span style="color:var(--text-secondary);font-size:0.85em;width:18px;display:inline-block;text-align:center;">${rankNum}</span>`;
        const barW    = rate;
        const barCol  = rate >= 80 ? '#57f287' : rate >= 50 ? '#faa61a' : '#ed4245';
        return `
        <div style="display:grid;grid-template-columns:28px 1fr auto auto auto;align-items:center;gap:8px 10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.82em;">
            <div style="text-align:center;">${medal}</div>
            <div>
                <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">@${t.tag}</div>
                <div style="background:var(--input-bg);border-radius:3px;height:4px;overflow:hidden;">
                    <div style="width:${barW}%;height:100%;background:${barCol};border-radius:3px;transition:width 0.4s;"></div>
                </div>
            </div>
            <div style="text-align:right;color:#57f287;font-weight:600;">${t.sent.toLocaleString()}<br><span style="color:var(--text-secondary);font-size:0.85em;font-weight:400;">sent</span></div>
            <div style="text-align:right;color:#ed4245;font-weight:600;">${t.errors.toLocaleString()}<br><span style="color:var(--text-secondary);font-size:0.85em;font-weight:400;">errors</span></div>
            <div style="text-align:right;font-weight:700;color:${barCol};min-width:42px;">${rate}%</div>
        </div>`;
    }).join('');

    table.innerHTML = `
        <div style="display:grid;grid-template-columns:28px 1fr auto auto auto;gap:0 10px;padding:0 0 6px;border-bottom:2px solid var(--border);font-size:0.72em;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">
            <div></div><div>Token</div><div style="text-align:right;">Sent</div><div style="text-align:right;">Errors</div><div style="text-align:right;">Rate</div>
        </div>
        ${rows}
        <p style="font-size:0.75em;color:var(--text-secondary);margin:10px 0 0;text-align:right;">${tokens.length} token${tokens.length !== 1 ? 's' : ''} · ${history.length} campaign${history.length !== 1 ? 's' : ''} analysed</p>
    `;
    card.style.display = 'block';
}

let _fullHistory = [];

function renderHistory(history) {
    _fullHistory = history || [];
    updateHistoryChart(history);
    buildTokenLeaderboard(history);
    _applyHistoryFilter();

    const filterEl = document.getElementById('historyFilterInput');
    if (filterEl && !filterEl._hfBound) {
        filterEl._hfBound = true;
        filterEl.addEventListener('input', () => _applyHistoryFilter());
    }
}

function _applyHistoryFilter() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const q = (document.getElementById('historyFilterInput')?.value || '').trim().toLowerCase();
    const filtered = q
        ? _fullHistory.filter(e => (e.label || '').toLowerCase().includes(q))
        : _fullHistory;

    if (!filtered.length) {
        list.innerHTML = q
            ? `<p style="color:var(--text-secondary);text-align:center;padding:30px;">No campaigns match "<em>${q}</em>".</p>`
            : '<p style="color:var(--text-secondary);text-align:center;padding:30px;">No campaign history yet. Run a campaign to see it here.</p>';
        return;
    }
    list.innerHTML = '';
    filtered.forEach(entry => {
        const start   = new Date(entry.startTime);
        const end     = new Date(entry.endTime);
        const durationMs = end - start;
        const durStr  = formatDuration(durationMs);
        const dateStr = start.toLocaleDateString();
        const timeStr = start.toLocaleTimeString();
        const labelHtml = entry.label
            ? `<span class="history-label-badge" data-id="${entry.id}">${escapeHtml(entry.label)}</span>`
            : `<span class="history-label-empty" data-id="${entry.id}">unlabelled</span>`;

        const card = document.createElement('div');
        card.className = 'history-entry';
        card.dataset.id = entry.id;
        card.innerHTML = `
            <div class="history-header">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
                    ${labelHtml}
                    <button class="history-rename-btn" data-id="${entry.id}" title="Rename label" style="background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text-secondary);opacity:0.6;line-height:1;" aria-label="Edit label">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <div class="history-date" style="margin-left:2px;">${dateStr} at ${timeStr}</div>
                </div>
                <div class="history-duration">${durStr}</div>
            </div>
            <div class="history-stats">
                <div class="history-stat history-stat--sent">
                    <span class="history-stat-val">${entry.totalSent}</span>
                    <span class="history-stat-label">DMs sent</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-val">${entry.totalMembers}</span>
                    <span class="history-stat-label">members targeted</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-val">${entry.totalTokens}</span>
                    <span class="history-stat-label">tokens used</span>
                </div>
                <div class="history-stat history-stat--blocked">
                    <span class="history-stat-val">${entry.blockedThisRun || 0}</span>
                    <span class="history-stat-label">newly blocked</span>
                </div>
            </div>
            ${entry.tokenSummary && entry.tokenSummary.length ? renderTokenSummary(entry.tokenSummary) : ''}
        `;
        card.querySelector('.history-rename-btn').addEventListener('click', () => renameHistoryCampaign(entry.id));
        list.appendChild(card);
    });
}

function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function renameHistoryCampaign(id) {
    const entry = _fullHistory.find(e => e.id === id);
    if (!entry) return;
    const current = entry.label || '';
    const newLabel = window.prompt('Enter a label for this campaign (leave blank to remove):', current);
    if (newLabel === null) return;
    try {
        const res = await fetch(`/api/history/${id}/label`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newLabel.trim() })
        });
        const data = await res.json();
        if (data.success) {
            entry.label = data.label;
            _applyHistoryFilter();
            showNotification(data.label ? `Label set: "${data.label}"` : 'Label removed', 'success');
        } else {
            showNotification(data.message || 'Failed to rename', 'error');
        }
    } catch (_) {
        showNotification('Error renaming campaign', 'error');
    }
}

function renderTokenSummary(summary) {
    if (!summary || !summary.length) return '';

    const maxSent   = Math.max(1, ...summary.map(t => t.sent || 0));
    const maxErrors = Math.max(1, ...summary.map(t => t.errors || 0));

    function sendBg(sent) {
        if (!sent) return null;
        const a = 0.12 + 0.78 * (sent / maxSent);
        return `rgba(87,242,135,${a.toFixed(2)})`;
    }
    function errBg(errors) {
        if (!errors) return null;
        const a = 0.12 + 0.78 * (errors / maxErrors);
        return `rgba(237,66,69,${a.toFixed(2)})`;
    }
    function statusClass(s) {
        const v = (s || '').toLowerCase();
        if (v === 'done' || v === 'completed') return 'thm-status--done';
        if (v === 'retired' || v === 'error')  return 'thm-status--retired';
        if (v === 'limited' || v === 'rate_limited') return 'thm-status--limited';
        if (v === 'active' || v === 'sending') return 'thm-status--active';
        return 'thm-status--idle';
    }

    const rows = summary.map(t => {
        const sent   = t.sent   || 0;
        const errors = t.errors || 0;
        const total  = sent + errors;
        const rate   = total > 0 ? Math.round((sent / total) * 100) : (sent > 0 ? 100 : 0);

        const sBg = sendBg(sent);
        const eBg = errBg(errors);

        const sendCell = sent
            ? `<td><div class="thm-cell thm-cell--send" style="background:${sBg};" title="${sent} DMs sent — ${rate}% success rate">${sent}</div></td>`
            : `<td><div class="thm-cell thm-cell--zero" title="0 DMs sent">0</div></td>`;

        const errCell = errors
            ? `<td><div class="thm-cell thm-cell--error" style="background:${eBg};" title="${errors} errors">${errors}</div></td>`
            : `<td><div class="thm-cell thm-cell--zero" title="0 errors">0</div></td>`;

        return `<tr>
            <td><div class="thm-name" title="@${escapeHtml(t.tag)}">@${escapeHtml(t.tag)}</div></td>
            ${sendCell}
            ${errCell}
            <td><div class="thm-status ${statusClass(t.status)}">${escapeHtml(t.status || 'idle')}</div></td>
        </tr>`;
    }).join('');

    const legend = `
        <div class="thm-legend">
            <div class="thm-legend-item"><div class="thm-legend-swatch thm-legend-swatch--send"></div>Send rate — brighter = more sent</div>
            <div class="thm-legend-item"><div class="thm-legend-swatch thm-legend-swatch--error"></div>Error rate — brighter = more errors</div>
        </div>`;

    const table = `
        <table class="token-heatmap">
            <thead>
                <tr>
                    <th style="width:40%;">Token</th>
                    <th style="width:17%;">Sent</th>
                    <th style="width:17%;">Errors</th>
                    <th style="width:26%;">Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${legend}`;

    return `<details class="history-tokens"><summary style="cursor:pointer;color:var(--text-secondary);font-size:0.85em;margin-top:10px;">Token health heatmap (${summary.length} token${summary.length !== 1 ? 's' : ''})</summary>${table}</details>`;
}

function formatDuration(ms) {
    if (ms < 1000) return 'Less than a second';
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const hrs  = Math.floor(mins / 60);
    if (hrs > 0)  return `${hrs}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
}

async function clearHistory() {
    const btn = document.getElementById('clearHistoryBtn');
    if (btn) btn.disabled = true;
    try {
        const response = await fetch('/api/history', { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        renderHistory([]);
    } catch (error) {
        showNotification('Error clearing history', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
function startLogsPolling() {
    stopLogsPolling();
    fetchAndRenderLogs();
    logsPollingInterval = setInterval(fetchAndRenderLogs, 2000);
}

function stopLogsPolling() {
    if (logsPollingInterval) { clearInterval(logsPollingInterval); logsPollingInterval = null; }
}

async function fetchAndRenderLogs() {
    if (logsPaused) return;
    try {
        const res = await fetch('/api/logs');
        if (!res.ok) return;
        const logs = await res.json();
        if (logs.length !== lastLogCount) { lastLogCount = logs.length; renderLogs(logs); }
    } catch (_) {}
}

function renderLogs(logs) {
    if (logs !== allLogs && logs.length !== undefined) allLogs = logs;
    const viewer = document.getElementById('logViewer');
    const empty  = document.getElementById('logEmpty');
    if (!viewer) return;

    let nSuccess = 0, nError = 0, nWarn = 0, nBlocked = 0;
    allLogs.forEach(e => {
        if (e.level === 'success') nSuccess++;
        else if (e.level === 'error')   nError++;
        else if (e.level === 'warn')    nWarn++;
        else if (e.level === 'blocked') nBlocked++;
    });
    document.getElementById('logCountSuccess').textContent = `${nSuccess} success`;
    document.getElementById('logCountError').textContent   = `${nError} error${nError !== 1 ? 's' : ''}`;
    document.getElementById('logCountWarn').textContent    = `${nWarn} captcha`;
    document.getElementById('logCountBlocked').textContent = `${nBlocked} blocked`;
    document.getElementById('logTotal').textContent        = `${allLogs.length} total`;

    const searchTerm = (document.getElementById('logSearchInput')?.value || '').toLowerCase().trim();
    const levelFiltered = currentLogFilter ? allLogs.filter(e => e.level === currentLogFilter) : allLogs;
    const displayed = searchTerm ? levelFiltered.filter(e => (e.message || '').toLowerCase().includes(searchTerm)) : levelFiltered;

    if (!displayed.length) {
        viewer.innerHTML = '';
        const msg = currentLogFilter
            ? `<div class="log-empty">No ${currentLogFilter} logs. Click the badge again to show all.</div>`
            : '<div class="log-empty">No logs yet — start a campaign or scrape to see output here.</div>';
        viewer.innerHTML = msg;
        return;
    }

    const wasAtBottom = viewer.scrollHeight - viewer.scrollTop <= viewer.clientHeight + 40;
    viewer.innerHTML = '';

    displayed.forEach(entry => {
        const row = document.createElement('div');
        row.className = `log-entry level-${entry.level}`;

        const ts     = new Date(entry.ts);
        const tsStr  = ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const tsSpan = document.createElement('span');
        tsSpan.className   = 'log-ts';
        tsSpan.textContent = tsStr;

        const msgSpan = document.createElement('span');
        msgSpan.className   = 'log-msg';
        msgSpan.textContent = entry.message;

        row.appendChild(tsSpan);
        row.appendChild(msgSpan);
        viewer.appendChild(row);
    });

    if (wasAtBottom) viewer.scrollTop = viewer.scrollHeight;
}

// ─── Scrapers ─────────────────────────────────────────────────────────────────
async function scrapeOpcode14() {
    const token       = document.getElementById('scraperToken').value.trim();
    const serverId    = document.getElementById('op14-serverId').value.trim() || document.getElementById('serverId').value.trim();
    const timePeriodMinutes = document.getElementById('op14TimePeriod').value;
    if (!token)    { showNotification('Please enter a token', 'error');     return; }
    if (!serverId) { showNotification('Please enter a server ID', 'error'); return; }
    const btn = document.getElementById('scrapeOp14Btn');
    btn.disabled = true; btn.textContent = 'Scraping...';
    try {
        const requestBody = { token, serverId };
        if (timePeriodMinutes) requestBody.timePeriodMinutes = parseInt(timePeriodMinutes);
        const response = await fetch('/api/scrape-opcode14', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            scrapedMembers = data.members;
            document.getElementById('scraperStatus').style.display = 'block';
            document.getElementById('scraperMessage').textContent = `✓ ${data.message}`;
            document.getElementById('downloadBtn').disabled = false;
            showNotification(`Scraped ${data.members.length} members`, 'success');
            updateMergeStats();
            await loadData();
        } else { showNotification(data.message, 'error'); }
    } catch (error) { showNotification('Scraping error', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Start Scraping'; }
}

async function scrapeReaction() {
    const token        = document.getElementById('reactionToken').value.trim();
    const serverId     = document.getElementById('reaction-serverId').value.trim();
    const channelId    = document.getElementById('channelId').value.trim();
    const messageId    = document.getElementById('messageId').value.trim();
    const reactionEmoji = document.getElementById('reactionEmoji').value.trim();
    if (!token || !serverId || !channelId || !messageId || !reactionEmoji) { showNotification('Please fill all reaction scraper fields', 'error'); return; }
    const btn = document.getElementById('scrapeReactionBtn');
    btn.disabled = true; btn.textContent = 'Scraping...';
    try {
        const response = await fetch('/api/scrape-reaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, serverId, channelId, messageId, reactionEmoji }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            scrapedReactionMembers = data.members;
            document.getElementById('reactionStatus').style.display = 'block';
            document.getElementById('reactionMessage').textContent = `✓ ${data.message}`;
            document.getElementById('downloadReactionBtn').disabled = false;
            showNotification(`Scraped ${data.members.length} reactions`, 'success');
            updateMergeStats();
            await loadData();
        } else { showNotification(data.message, 'error'); }
    } catch (error) { showNotification('Reaction scraping error', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Scrape Reactions'; }
}

async function scrapeBruteforce() {
    const token   = document.getElementById('bruteforceToken').value.trim();
    const idStart = document.getElementById('idStart').value.trim();
    const idEnd   = document.getElementById('idEnd').value.trim();
    if (!token) { showNotification('Please enter a token', 'error'); return; }
    const btn = document.getElementById('scrapeBruteforceBtn');
    btn.disabled = true; btn.textContent = 'Bruteforcing...';
    try {
        const response = await fetch('/api/scrape-opcode8', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, idStart, idEnd }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            scrapedBruteforceMembers = data.members;
            document.getElementById('bruteforceStatus').style.display = 'block';
            document.getElementById('bruteforceMessage').textContent = `✓ ${data.message}`;
            document.getElementById('downloadBruteforceBtn').disabled = false;
            showNotification(`Found ${data.members.length} users`, 'success');
            updateMergeStats();
            await loadData();
        } else { showNotification(data.message, 'error'); }
    } catch (error) { showNotification('Bruteforce scraping error', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Start Bruteforce'; }
}

async function scrapeKeywords() {
    const token    = document.getElementById('keywordToken').value.trim();
    const serverId = document.getElementById('keyword-serverId').value.trim() || document.getElementById('serverId').value.trim();
    const keywordsInput   = document.getElementById('keywordsList').value.trim();
    const timePeriodMinutes = document.getElementById('keywordTimePeriod').value;
    if (!token)    { showNotification('Please enter a token', 'error');    return; }
    if (!serverId) { showNotification('Please enter a server ID', 'error'); return; }
    if (!keywordsInput) { showNotification('Please enter keywords', 'error'); return; }
    const keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k);
    const btn = document.getElementById('scrapeKeywordBtn');
    btn.disabled = true; btn.textContent = 'Scraping...';
    try {
        const requestBody = { token, serverId, keywords };
        if (timePeriodMinutes) requestBody.timePeriodMinutes = parseInt(timePeriodMinutes);
        const response = await fetch('/api/scrape-keywords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            scrapedKeywordMembers = data.members;
            document.getElementById('keywordStatus').style.display = 'block';
            document.getElementById('keywordMessage').textContent = `✓ ${data.message}`;
            document.getElementById('downloadKeywordBtn').disabled = false;
            showNotification(`Found ${data.members.length} members`, 'success');
            updateMergeStats();
            await loadData();
        } else { showNotification(data.message, 'error'); }
    } catch (error) { showNotification('Keyword scraping error', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Start Keyword Scrape'; }
}

// ─── Download helpers ─────────────────────────────────────────────────────────
function downloadScrapedMembers()    { downloadMembers(scrapedMembers, 'opcode14_members'); }
function downloadReactionMembers()   { downloadMembers(scrapedReactionMembers, 'reaction_members'); }
function downloadBruteforceMembers() { downloadMembers(scrapedBruteforceMembers, 'bruteforce_members'); }
function downloadKeywordMembers()    { downloadMembers(scrapedKeywordMembers, 'keyword_members'); }

function downloadMembers(members, name) {
    if (!members.length) { showNotification('No members to download', 'error'); return; }
    const blob = new Blob([members.join('\n')], { type: 'text/plain' });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${name}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click();
    window.URL.revokeObjectURL(url); document.body.removeChild(a);
    showNotification(`Downloaded ${members.length} IDs`, 'success');
}

// ─── Advanced — Captcha ───────────────────────────────────────────────────────
async function checkCaptchaBalance() {
    const apiKey   = document.getElementById('anticaptchaKey')?.value.trim();
    const statusEl = document.getElementById('anticaptchaStatus');
    if (!statusEl) return;

    if (!apiKey) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<span style="color:var(--warning,#ffc83c);">⚠ Enter an API key first</span>';
        return;
    }

    statusEl.style.display = 'block';
    statusEl.innerHTML = '<span style="color:var(--text-secondary);">⏳ Checking...</span>';

    try {
        const res  = await fetch('/api/captcha-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey })
        });
        const data = await res.json();
        if (data.success) {
            statusEl.innerHTML = `<span style="color:var(--success);">✅ Balance: <strong>$${parseFloat(data.balance).toFixed(4)}</strong> — key is valid</span>`;
        } else {
            statusEl.innerHTML = `<span style="color:var(--danger,#ed4245);">❌ ${data.message}</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = `<span style="color:var(--danger,#ed4245);">❌ Connection error: ${e.message}</span>`;
    }
}

async function testAllProxies() {
    const proxies = document.getElementById('proxyInput').value.split('\n').filter(p => p.trim());
    if (!proxies.length) { showNotification('No proxies to test', 'error'); return; }
    const btn = document.getElementById('testProxiesBtn');
    btn.disabled = true; btn.textContent = 'Testing...';
    const results = [];
    for (const proxy of proxies) {
        try {
            const response = await fetch('/api/test-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxyString: proxy.trim() }) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            results.push(`${proxy.trim()}: ${data.working ? '✓ Working' : '✗ Failed'}`);
        } catch (error) { results.push(`${proxy.trim()}: ✗ Error`); }
    }
    document.getElementById('proxyStatus').style.display = 'block';
    document.getElementById('proxyStatusMessage').innerHTML = results.join('<br>');
    btn.disabled = false; btn.textContent = 'Test All Proxies';
}

async function saveCaptchaConfig() {
    const enabled = document.getElementById('captchaEnabled').checked;
    const apiKey  = document.getElementById('anticaptchaKey')?.value.trim() || '';
    try {
        const response = await fetch('/api/update-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ captcha: { enabled, apiKey } }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.success ? 'Captcha config saved' : data.message, data.success ? 'success' : 'error');
    } catch (error) { showNotification('Error saving captcha config', 'error'); }
}

async function saveProxyConfig() {
    const proxies = document.getElementById('proxyInput').value.split('\n').filter(p => p.trim());
    const enabled = document.getElementById('proxyEnabled').checked;
    try {
        const response = await fetch('/api/update-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxy: { enabled, proxies } }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
    } catch (error) { showNotification('Error saving proxy config', 'error'); }
}

async function saveScraperSettings() {
    try {
        const response = await fetch('/api/update-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            scraper: {
                type: 'opcode14',
                minAccountAgeMinutes: parseInt(document.getElementById('minAccountAge').value) || 0,
                filterAdmins: document.getElementById('filterAdmins').checked,
                filterBots: document.getElementById('filterBots').checked
            }
        })});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
    } catch (error) { showNotification('Error saving scraper settings', 'error'); }
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
function showNotification(message, type = 'error') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    setTimeout(() => notification.classList.remove('show'), 4000);
}

async function logout() {
    try {
        await fetch('/auth/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = '/login.html';
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
async function generatePanelMutex() {
    const btn = document.getElementById('generateMutexBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
        const res  = await fetch('/auth/admin/generate-mutex', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            document.getElementById('generatedMutexVal').textContent = data.mutex;
            document.getElementById('generatedMutexBox').style.display = 'block';
            document.getElementById('copyMutexBtn').textContent = 'Copy';
            showNotification('Mutex generated successfully', 'success');
            loadPanelUsers();
        } else {
            showNotification(data.message || 'Failed to generate mutex', 'error');
        }
    } catch {
        showNotification('Network error generating mutex', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Mutex';
    }
}

function copyGeneratedMutex() {
    const val = document.getElementById('generatedMutexVal').textContent;
    navigator.clipboard.writeText(val).then(() => {
        const btn = document.getElementById('copyMutexBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
    });
}

async function loadPanelUsers() {
    const container = document.getElementById('panelUserTable');
    try {
        const res  = await fetch('/auth/admin/users');
        const data = await res.json();
        if (!data.success || !data.users.length) {
            container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px;font-size:0.9em;">No users found.</p>';
            return;
        }
        const tdStyle = 'padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle;';
        const rows = data.users.map(u => `
            <tr>
                <td style="${tdStyle}font-family:monospace;font-size:0.85em;" title="${u.mutex}">${u.mutex.slice(0, 25)}…</td>
                <td style="${tdStyle}"><span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:0.78em;font-weight:700;background:${u.is_admin ? '#ffc83c' : 'var(--border)'};color:${u.is_admin ? '#000' : 'var(--text-secondary)'};">${u.is_admin ? 'Admin' : 'User'}</span></td>
                <td style="${tdStyle}font-size:0.82em;color:var(--text-secondary);">${u.password_hash ? 'Set' : '<span style="color:#ffc83c;">Not set</span>'}</td>
                <td style="${tdStyle}font-size:0.82em;color:var(--text-secondary);">${new Date(u.created_at).toLocaleString()}</td>
                <td style="${tdStyle}">${!u.is_admin ? `<button onclick="deletePanelUser('${u.mutex}')" style="padding:4px 12px;background:var(--danger);border:none;border-radius:6px;color:#fff;font-family:inherit;font-size:0.78em;font-weight:600;cursor:pointer;">Delete</button>` : '<span style="color:var(--text-secondary);font-size:0.8em;">—</span>'}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:0.88em;">
                <thead><tr>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.78em;text-transform:uppercase;letter-spacing:0.05em;">Mutex</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.78em;text-transform:uppercase;letter-spacing:0.05em;">Role</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.78em;text-transform:uppercase;letter-spacing:0.05em;">Password</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.78em;text-transform:uppercase;letter-spacing:0.05em;">Created</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.78em;text-transform:uppercase;letter-spacing:0.05em;">Action</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch {
        container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px;font-size:0.9em;">Error loading users.</p>';
    }
}

async function loadPanelWebhookSettings() {
    try {
        const res  = await fetch('/api/admin/settings');
        const data = await res.json();
        if (data.success) {
            updateInputValue('panelWebhookUrl', data.webhookUrl || '');
        }
    } catch {}
}

async function savePanelWebhook() {
    const url = document.getElementById('panelWebhookUrl').value.trim();
    const statusEl  = document.getElementById('panelWebhookStatus');
    const statusMsg = document.getElementById('panelWebhookStatusMsg');
    try {
        const res  = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ webhookUrl: url })
        });
        const data = await res.json();
        statusEl.style.display = 'block';
        if (data.success) {
            statusMsg.style.color = 'var(--success)';
            statusMsg.textContent = '✓ Webhook URL saved.';
            showNotification('Webhook saved', 'success');
        } else {
            statusMsg.style.color = 'var(--danger)';
            statusMsg.textContent = '✗ ' + (data.message || 'Failed to save.');
        }
    } catch {
        showNotification('Network error saving webhook', 'error');
    }
}

async function testPanelWebhook() {
    const statusEl  = document.getElementById('panelWebhookStatus');
    const statusMsg = document.getElementById('panelWebhookStatusMsg');
    const btn = document.getElementById('panelTestWebhookBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const res  = await fetch('/api/admin/test-webhook', { method: 'POST' });
        const data = await res.json();
        statusEl.style.display = 'block';
        if (data.success) {
            statusMsg.style.color = 'var(--success)';
            statusMsg.textContent = '✓ Test webhook sent successfully.';
            showNotification('Test webhook sent', 'success');
        } else {
            statusMsg.style.color = 'var(--danger)';
            statusMsg.textContent = '✗ ' + (data.message || 'Failed to send test.');
            showNotification(data.message || 'Test failed', 'error');
        }
    } catch {
        showNotification('Network error testing webhook', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test Webhook';
    }
}

async function deletePanelUser(mutex) {
    const ok = await showConfirm({
        icon: '🗑️',
        title: 'Delete User',
        message: `Remove mutex:\n${mutex}\n\nThis cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;
    try {
        const res  = await fetch('/auth/admin/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mutex })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('User deleted', 'success');
            loadPanelUsers();
        } else {
            showNotification(data.message || 'Failed to delete user', 'error');
        }
    } catch {
        showNotification('Network error deleting user', 'error');
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ─── FEATURE PACK: Analytics, Sequences, Intelligence, Profile, Dedup ───────
// ════════════════════════════════════════════════════════════════════════════

// ─── Analytics Charts ─────────────────────────────────────────────────────────
let analyticsTimelineChart = null;
let analyticsDonutChart    = null;
let analyticsIntervalId    = null;

function initAnalyticsCharts() {
    const isDark    = !document.body.classList.contains('light-mode');
    const textColor = isDark ? '#b9bbbe' : '#4f545c';
    Chart.defaults.color       = textColor;
    Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    const timelineCtx = document.getElementById('analyticsTimeline');
    if (timelineCtx && !analyticsTimelineChart) {
        analyticsTimelineChart = new Chart(timelineCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'DMs/min',
                    data: [],
                    backgroundColor: 'rgba(87,242,135,0.65)',
                    borderColor: '#57f287',
                    borderWidth: 1,
                    borderRadius: 3,
                }]
            },
            options: {
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } },
                    y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
                },
            },
        });
    }

    const donutCtx = document.getElementById('analyticsDonut');
    if (donutCtx && !analyticsDonutChart) {
        analyticsDonutChart = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Sent', 'Errors', 'Blocked'],
                datasets: [{
                    data: [1, 0, 0],
                    backgroundColor: ['#57f287', '#ed4245', '#faa61a'],
                    borderWidth: 0,
                }],
            },
            options: {
                animation: false,
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } }
                },
                cutout: '65%',
            },
        });
    }
}

async function fetchAndUpdateAnalytics() {
    try {
        const res  = await fetch('/api/analytics');
        const data = await res.json();
        renderAnalyticsUI(data);
    } catch (_) {}
}

function renderAnalyticsUI(data) {
    const card = document.getElementById('analyticsCard');
    if (!card) return;

    const { timeline = [], totals = {}, running } = data;
    const hasData = totals.sent > 0 || totals.errors > 0 || totals.blocked > 0 || timeline.length > 0;

    if (!hasData && !running) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    if (!analyticsTimelineChart || !analyticsDonutChart) initAnalyticsCharts();

    const totalsRow = document.getElementById('analyticsTotalsRow');
    if (totalsRow) {
        totalsRow.innerHTML =
            `<span style="padding:3px 10px;border-radius:12px;background:rgba(87,242,135,0.15);color:#57f287;font-size:0.8em;font-weight:700;">${totals.sent || 0} Sent</span>` +
            `<span style="padding:3px 10px;border-radius:12px;background:rgba(237,66,69,0.15);color:#ed4245;font-size:0.8em;font-weight:700;">${totals.errors || 0} Errors</span>` +
            `<span style="padding:3px 10px;border-radius:12px;background:rgba(250,166,26,0.15);color:#faa61a;font-size:0.8em;font-weight:700;">${totals.blocked || 0} Blocked</span>`;
    }

    if (analyticsTimelineChart && timeline.length) {
        analyticsTimelineChart.data.labels   = timeline.map(t => new Date(t.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
        analyticsTimelineChart.data.datasets[0].data = timeline.map(t => t.sent);
        analyticsTimelineChart.update();
    }

    if (analyticsDonutChart) {
        const s = totals.sent || 0, e = totals.errors || 0, b = totals.blocked || 0;
        analyticsDonutChart.data.datasets[0].data = s + e + b > 0 ? [s, e, b] : [1, 0, 0];
        analyticsDonutChart.update();
    }
}

function startAnalyticsPoll() {
    stopAnalyticsPoll();
    fetchAndUpdateAnalytics();
    analyticsIntervalId = setInterval(fetchAndUpdateAnalytics, 30000);
}
function stopAnalyticsPoll() {
    if (analyticsIntervalId) { clearInterval(analyticsIntervalId); analyticsIntervalId = null; }
}

// ─── Token Profile Manager ────────────────────────────────────────────────────
async function fetchTokenProfile() {
    const token = document.getElementById('profileToken')?.value.trim();
    if (!token) { showNotification('Enter a token first', 'error'); return; }
    const btn = document.getElementById('fetchProfileBtn');
    btn.disabled = true; btn.textContent = 'Fetching...';
    try {
        const res  = await fetch('/api/token-profile/fetch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        const el   = document.getElementById('profileFetchResult');
        if (!el) return;
        el.style.display = 'block';
        if (data.success) {
            el.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    ${data.avatarUrl ? `<img src="${data.avatarUrl}" style="width:48px;height:48px;border-radius:50%;border:2px solid var(--border);" />` : '<div style="width:48px;height:48px;border-radius:50%;background:var(--border);"></div>'}
                    <div>
                        <div style="font-weight:700;color:var(--text);">${data.globalName || data.username}</div>
                        <div style="font-size:0.82em;color:var(--text-secondary);">@${data.username} · ${data.nitro ? '⭐ Nitro' : 'Standard'}</div>
                        ${data.bio ? `<div style="font-size:0.8em;color:var(--text-secondary);margin-top:3px;">${data.bio}</div>` : ''}
                    </div>
                </div>`;
            updateInputValue('profileDisplayName', data.globalName || '');
        } else {
            el.innerHTML = `<span style="color:var(--danger);">✗ ${data.message}</span>`;
        }
    } catch { showNotification('Error fetching profile', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Fetch Profile'; }
}

async function updateTokenProfile() {
    const token       = document.getElementById('profileToken')?.value.trim();
    const displayName = document.getElementById('profileDisplayName')?.value.trim();
    const avatarUrl   = document.getElementById('profileAvatarUrl')?.value.trim();
    if (!token) { showNotification('Enter a token first', 'error'); return; }
    if (!displayName && !avatarUrl) { showNotification('Enter a display name or avatar URL', 'error'); return; }
    const btn = document.getElementById('updateProfileBtn');
    btn.disabled = true; btn.textContent = 'Updating...';
    const resEl = document.getElementById('profileUpdateResult');
    try {
        const res  = await fetch('/api/token-profile/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, displayName, avatarUrl })
        });
        const data = await res.json();
        if (resEl) {
            resEl.style.display = 'block';
            resEl.style.color   = data.success ? 'var(--success)' : 'var(--danger)';
            resEl.textContent   = data.success ? `✓ Updated: @${data.username}${data.globalName ? ' (' + data.globalName + ')' : ''}` : `✗ ${data.message}`;
        }
        showNotification(data.success ? 'Profile updated' : data.message, data.success ? 'success' : 'error');
    } catch { showNotification('Error updating profile', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Apply Changes'; }
}

// ─── Member Intelligence ──────────────────────────────────────────────────────
async function analyzeMembers() {
    const memberIds = (document.getElementById('membersInput')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!memberIds.length) { showNotification('No members loaded', 'error'); return; }
    const btn = document.getElementById('analyzeMembersBtn');
    btn.disabled = true; btn.textContent = 'Analyzing...';
    try {
        const res  = await fetch('/api/members/analyze', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds })
        });
        const data = await res.json();
        const el   = document.getElementById('memberIntelResult');
        if (!el) return;
        if (data.success) {
            const d = data.distribution;
            const pct = (n) => Math.round((n / data.total) * 100);
            el.style.display = 'block';
            el.innerHTML = `
                <div class="intel-grid">
                    <div class="intel-stat"><span class="intel-val">${data.total.toLocaleString()}</span><span class="intel-label">Members</span></div>
                    <div class="intel-stat"><span class="intel-val">${data.avgAgeDays}d</span><span class="intel-label">Avg Age</span></div>
                    <div class="intel-stat"><span class="intel-val">${data.avgScore}</span><span class="intel-label">Avg Score</span></div>
                    <div class="intel-stat"><span class="intel-val">${data.maxAgeDays}d</span><span class="intel-label">Oldest</span></div>
                </div>
                <div class="intel-dist">
                    <div class="intel-dist-row"><span class="intel-dist-label">&lt; 30 days</span><div class="intel-dist-bar"><div style="width:${pct(d.under30)}%;background:var(--danger);height:100%;border-radius:4px;"></div></div><span class="intel-dist-count">${d.under30}</span></div>
                    <div class="intel-dist-row"><span class="intel-dist-label">30–90 days</span><div class="intel-dist-bar"><div style="width:${pct(d.d30to90)}%;background:var(--warning);height:100%;border-radius:4px;"></div></div><span class="intel-dist-count">${d.d30to90}</span></div>
                    <div class="intel-dist-row"><span class="intel-dist-label">90–365 days</span><div class="intel-dist-bar"><div style="width:${pct(d.d90to365)}%;background:#57d4f2;height:100%;border-radius:4px;"></div></div><span class="intel-dist-count">${d.d90to365}</span></div>
                    <div class="intel-dist-row"><span class="intel-dist-label">1–3 years</span><div class="intel-dist-bar"><div style="width:${pct(d.y1to3)}%;background:var(--success);height:100%;border-radius:4px;"></div></div><span class="intel-dist-count">${d.y1to3}</span></div>
                    <div class="intel-dist-row"><span class="intel-dist-label">3+ years</span><div class="intel-dist-bar"><div style="width:${pct(d.over3y)}%;background:#5865f2;height:100%;border-radius:4px;"></div></div><span class="intel-dist-count">${d.over3y}</span></div>
                </div>`;
        } else {
            showNotification(data.message, 'error');
        }
    } catch { showNotification('Error analyzing members', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Analyze Members'; }
}

async function scoreAndFilterMembers() {
    const memberIds = (document.getElementById('membersInput')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    const threshold = parseInt(document.getElementById('scoreThreshold')?.value) || 0;
    if (!memberIds.length) { showNotification('No members loaded', 'error'); return; }
    const btn = document.getElementById('scoreMembersBtn');
    btn.disabled = true; btn.textContent = 'Scoring...';
    try {
        const res  = await fetch('/api/score-members', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds, threshold })
        });
        const data = await res.json();
        if (data.success) {
            const removedCount = data.total - data.kept;
            const el = document.getElementById('memberIntelResult');
            if (el) {
                el.style.display = 'block';
                el.innerHTML = `
                    <div style="padding:12px 16px;border-radius:8px;background:var(--surface);border:1px solid var(--border);">
                        <div style="font-weight:700;color:var(--text);margin-bottom:6px;">Score Filter — threshold: ${threshold}</div>
                        <div style="font-size:0.85em;color:var(--text-secondary);margin-bottom:8px;">
                            Kept: <strong style="color:var(--success);">${data.kept.toLocaleString()}</strong> &nbsp;·&nbsp;
                            Removed: <strong style="color:var(--danger);">${removedCount}</strong>
                        </div>
                        <div style="font-size:0.82em;display:flex;gap:10px;flex-wrap:wrap;">
                            <span class="score-tier-top">▲ ${data.distribution.top} veteran (≥80)</span>
                            <span class="score-tier-ok">● ${data.distribution.ok} established (≥50)</span>
                            <span class="score-tier-new">▼ ${data.distribution.new} new/bot (&lt;50)</span>
                        </div>
                    </div>`;
            }
            if (removedCount > 0) {
                const ok = await showConfirm({
                    icon: '🎯',
                    title: 'Apply Score Filter?',
                    message: `Remove ${removedCount} low-score members from your list?\n${data.kept} members will remain.`,
                    confirmText: 'Apply Filter',
                    cancelText: 'Preview Only',
                });
                if (ok) {
                    const filteredIds = data.scored.map(m => m.id);
                    document.getElementById('membersInput').value = filteredIds.join('\n');
                    await fetch('/api/update-members', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ members: filteredIds })
                    });
                    showNotification(`Filtered to ${data.kept} high-quality members`, 'success');
                    await loadData();
                }
            } else {
                showNotification('All members pass the score threshold', 'success');
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch { showNotification('Error scoring members', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Score & Filter'; }
}

// ─── Drip Sequences ───────────────────────────────────────────────────────────
let currentEditSeqId = null;
let seqStepCount = 0;

async function loadAndRenderSequences() {
    try {
        const res  = await fetch('/api/sequences');
        const data = await res.json();
        renderSequenceList(data.sequences || []);
        renderSequenceSelect(data.sequences || []);
        updateSeqWatcherStatus(data.stats);
    } catch (_) {}
}

function renderSequenceList(sequences) {
    const el = document.getElementById('seqList');
    if (!el) return;
    if (!sequences.length) {
        el.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:12px;">No sequences yet — create one above.</p>';
        return;
    }
    el.innerHTML = sequences.map(seq => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);flex-wrap:wrap;gap:8px;">
            <div>
                <span style="font-weight:600;color:var(--text);font-size:0.92em;">${seq.name}</span>
                <span style="margin-left:8px;font-size:0.75em;color:var(--text-secondary);">${seq.steps.length} step(s)</span>
                ${!seq.enabled ? '<span style="margin-left:6px;font-size:0.72em;background:var(--border);color:var(--text-secondary);padding:2px 7px;border-radius:10px;">disabled</span>' : ''}
            </div>
            <div style="display:flex;gap:6px;">
                <button onclick="editSequence('${seq.id}')" style="padding:4px 12px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);font-family:inherit;font-size:0.78em;cursor:pointer;">Edit</button>
                <button onclick="deleteSequence('${seq.id}')" style="padding:4px 12px;background:var(--danger);border:none;border-radius:6px;color:#fff;font-family:inherit;font-size:0.78em;cursor:pointer;">Delete</button>
            </div>
        </div>`).join('');
}

function renderSequenceSelect(sequences) {
    const el = document.getElementById('activeSequenceSelect');
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">— None (no drip) —</option>' +
        sequences.filter(s => s.enabled !== false).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (cur) el.value = cur;
}

function updateSeqWatcherStatus(stats) {
    const el = document.getElementById('seqWatcherStatus');
    if (!el) return;
    el.textContent = stats?.watching > 0 ? `● ${stats.watching} member(s) being watched for replies` : '';
    el.style.color = 'var(--success)';
}

function addSeqStep(message = '', delayMs = 5000) {
    const container = document.getElementById('seqSteps');
    if (!container) return;
    const stepNum = container.children.length + 1;
    seqStepCount++;
    const div = document.createElement('div');
    div.className = 'seq-step-row';
    div.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
            <span style="min-width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;font-size:0.72em;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:26px;flex-shrink:0;">${stepNum}</span>
            <div style="flex:1;">
                <label style="display:block;font-size:0.8em;color:var(--text-secondary);font-weight:600;margin-bottom:5px;">Message</label>
                <textarea class="form-textarea seq-step-msg" rows="2" placeholder="Follow-up message...">${message}</textarea>
            </div>
            <div style="min-width:120px;">
                <label style="display:block;font-size:0.8em;color:var(--text-secondary);font-weight:600;margin-bottom:5px;">Delay (ms)</label>
                <input type="number" class="form-input seq-step-delay" value="${delayMs}" min="1000" placeholder="5000" />
            </div>
            <button onclick="this.closest('.seq-step-row').remove()" style="padding:6px 10px;background:var(--danger);border:none;border-radius:6px;color:#fff;font-family:inherit;font-size:0.8em;cursor:pointer;margin-top:24px;flex-shrink:0;">✕</button>
        </div>`;
    container.appendChild(div);
}

function editSequence(id) {
    fetch('/api/sequences').then(r => r.json()).then(data => {
        const seq = (data.sequences || []).find(s => s.id === id);
        if (!seq) return;
        currentEditSeqId = seq.id;
        updateInputValue('seqName', seq.name);
        const stepsEl = document.getElementById('seqSteps');
        if (stepsEl) stepsEl.innerHTML = '';
        seqStepCount = 0;
        (seq.steps || []).forEach(s => addSeqStep(s.message, s.delayMs));
        showNotification('Sequence loaded into editor', 'success');
    }).catch(() => showNotification('Error loading sequence', 'error'));
}

async function saveSequence() {
    const name = document.getElementById('seqName')?.value.trim();
    if (!name) { showNotification('Sequence needs a name', 'error'); return; }
    const stepEls = document.querySelectorAll('.seq-step-row');
    const steps   = Array.from(stepEls).map(row => ({
        message: row.querySelector('.seq-step-msg')?.value || '',
        delayMs: parseInt(row.querySelector('.seq-step-delay')?.value) || 5000,
    })).filter(s => s.message.trim());
    if (!steps.length) { showNotification('Add at least one step with a message', 'error'); return; }
    try {
        const res  = await fetch('/api/sequences', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentEditSeqId || undefined, name, steps, enabled: true })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('Sequence saved', 'success');
            currentEditSeqId = data.sequence.id;
            await loadAndRenderSequences();
        } else { showNotification(data.message, 'error'); }
    } catch { showNotification('Error saving sequence', 'error'); }
}

async function deleteSequence(id) {
    const ok = await showConfirm({ icon: SVG_TRASH, title: 'Delete Sequence', message: 'Delete this sequence permanently?', confirmText: 'Delete', cancelText: 'Cancel', danger: true });
    if (!ok) return;
    try {
        await fetch(`/api/sequences/${id}`, { method: 'DELETE' });
        if (currentEditSeqId === id) {
            currentEditSeqId = null;
            if (document.getElementById('seqName')) document.getElementById('seqName').value = '';
            const stepsEl = document.getElementById('seqSteps');
            if (stepsEl) stepsEl.innerHTML = '';
        }
        await loadAndRenderSequences();
        showNotification('Sequence deleted', 'success');
    } catch { showNotification('Error deleting sequence', 'error'); }
}

async function saveActiveSequence() {
    const val = document.getElementById('activeSequenceSelect')?.value || '';
    try {
        const res  = await fetch('/api/update-config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active_sequence_id: val || null })
        });
        const data = await res.json();
        showNotification(data.success ? (val ? 'Active sequence saved' : 'Sequence cleared') : data.message, data.success ? 'success' : 'error');
    } catch { showNotification('Error saving active sequence', 'error'); }
}

// ─── Auto-Reply ───────────────────────────────────────────────────────────────
async function loadAutoReply() {
    try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        const el = document.getElementById('autoReplyEnabled');
        if (el) el.checked = !!cfg.auto_reply_enabled;
        updateInputValue('autoReplyMessage', cfg.auto_reply_message || '');
        updateInputValue('autoReplyDelay',   cfg.auto_reply_delay_ms != null ? cfg.auto_reply_delay_ms : 3000);
    } catch (_) {}
}

async function saveAutoReply() {
    const enabled  = document.getElementById('autoReplyEnabled')?.checked || false;
    const message  = document.getElementById('autoReplyMessage')?.value.trim() || '';
    const delayMs  = parseInt(document.getElementById('autoReplyDelay')?.value) || 3000;
    const statusEl = document.getElementById('autoReplyStatus');
    try {
        const res  = await fetch('/api/update-config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_reply_enabled: enabled, auto_reply_message: message, auto_reply_delay_ms: delayMs })
        });
        const data = await res.json();
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color   = data.success ? 'var(--success)' : 'var(--danger)';
            statusEl.textContent   = data.success ? '✓ Auto-reply saved' : '✗ ' + data.message;
            setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
        }
        showNotification(data.success ? 'Auto-reply saved' : data.message, data.success ? 'success' : 'error');
    } catch (_) {
        showNotification('Network error saving auto-reply', 'error');
    }
}

// ─── Campaign Webhook Alerts ──────────────────────────────────────────────────
async function loadCampaignWebhookConfig() {
    try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        updateInputValue('campaignWebhookUrl', cfg.campaign_webhook_url || '');
        const evts = cfg.campaign_webhook_events || {};
        const setCheck = (id, key) => { const el = document.getElementById(id); if (el) el.checked = !!evts[key]; };
        setCheck('webhookEvtStarted',      'campaign_started');
        setCheck('webhookEvtCompleted',    'campaign_completed');
        setCheck('webhookEvtStopped',      'campaign_stopped');
        setCheck('webhookEvtRetired',      'token_retired');
        setCheck('webhookEvtUnhealthy',    'token_unhealthy');
        setCheck('webhookEvtRlSpike',      'token_rate_limit_spike');
        if (cfg.active_sequence_id) {
            const selEl = document.getElementById('activeSequenceSelect');
            if (selEl) selEl.value = cfg.active_sequence_id;
        }
        if (cfg.global_dedup !== undefined) {
            const el = document.getElementById('globalDedupEnabled');
            if (el) el.checked = !!cfg.global_dedup;
        }
        const rlThreshEl = document.getElementById('rlAlertThreshold');
        if (rlThreshEl) rlThreshEl.value = cfg.rate_limit_alert_threshold ?? 5;
        const rlWindowEl = document.getElementById('rlAlertWindowSec');
        if (rlWindowEl) rlWindowEl.value = Math.round((cfg.rate_limit_alert_window_ms ?? 60000) / 1000);
        const rlAutoSuspEl = document.getElementById('rlSpikeAutoSuspend');
        if (rlAutoSuspEl) rlAutoSuspEl.checked = !!cfg.rl_spike_auto_suspend;
        const rlSuspSecEl = document.getElementById('rlSpikeSuspendSec');
        if (rlSuspSecEl) rlSuspSecEl.value = Math.round((cfg.rl_spike_suspend_ms ?? 300000) / 1000);
    } catch (_) {}
}

async function saveCampaignWebhookConfig() {
    const url    = document.getElementById('campaignWebhookUrl')?.value.trim() || '';
    const events = {
        campaign_started:       document.getElementById('webhookEvtStarted')?.checked   || false,
        campaign_completed:     document.getElementById('webhookEvtCompleted')?.checked || false,
        campaign_stopped:       document.getElementById('webhookEvtStopped')?.checked   || false,
        token_retired:          document.getElementById('webhookEvtRetired')?.checked   || false,
        token_unhealthy:        document.getElementById('webhookEvtUnhealthy')?.checked || false,
        token_rate_limit_spike: document.getElementById('webhookEvtRlSpike')?.checked   || false,
    };
    const rlThreshold   = parseInt(document.getElementById('rlAlertThreshold')?.value) || 5;
    const rlWindowMs    = parseInt(document.getElementById('rlAlertWindowSec')?.value || 60) * 1000;
    const rlAutoSuspend = document.getElementById('rlSpikeAutoSuspend')?.checked || false;
    const rlSuspendMs   = parseInt(document.getElementById('rlSpikeSuspendSec')?.value || 300) * 1000;
    const statusEl = document.getElementById('campaignWebhookStatus');
    try {
        const res  = await fetch('/api/update-config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_webhook_url: url, campaign_webhook_events: events, rate_limit_alert_threshold: rlThreshold, rate_limit_alert_window_ms: rlWindowMs, rl_spike_auto_suspend: rlAutoSuspend, rl_spike_suspend_ms: rlSuspendMs })
        });
        const data = await res.json();
        if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = data.success ? 'var(--success)' : 'var(--danger)'; statusEl.textContent = data.success ? '✓ Alert config saved' : '✗ ' + data.message; }
        showNotification(data.success ? 'Alert config saved' : data.message, data.success ? 'success' : 'error');
    } catch { showNotification('Error saving alert config', 'error'); }
}

// ─── Scraper Presets ──────────────────────────────────────────────────────────
function getCurrentScraperState() {
    const activeType = document.querySelector('.scraper-type-btn.active')?.dataset.type || 'opcode14';
    const d = {};
    if (activeType === 'opcode14') {
        d.token = document.getElementById('scraperToken')?.value || '';
        d.serverId = document.getElementById('op14-serverId')?.value || '';
        d.timePeriodMinutes = document.getElementById('op14TimePeriod')?.value || '';
    } else if (activeType === 'reaction') {
        d.token = document.getElementById('reactionToken')?.value || '';
        d.serverId = document.getElementById('reaction-serverId')?.value || '';
        d.channelId = document.getElementById('channelId')?.value || '';
        d.messageId = document.getElementById('messageId')?.value || '';
        d.reactionEmoji = document.getElementById('reactionEmoji')?.value || '';
    } else if (activeType === 'opcode8') {
        d.token = document.getElementById('bruteforceToken')?.value || '';
        d.idStart = document.getElementById('idStart')?.value || '';
        d.idEnd = document.getElementById('idEnd')?.value || '';
    } else if (activeType === 'keyword') {
        d.token = document.getElementById('keywordToken')?.value || '';
        d.serverId = document.getElementById('keyword-serverId')?.value || '';
        d.keywords = document.getElementById('keywordsList')?.value || '';
        d.timePeriodMinutes = document.getElementById('keywordTimePeriod')?.value || '';
    }
    return { type: activeType, data: d };
}

function applyScraperPreset(preset) {
    const typeBtn = document.querySelector(`.scraper-type-btn[data-type="${preset.type}"]`);
    if (typeBtn) typeBtn.click();
    const d = preset.data || {};
    if (preset.type === 'opcode14') {
        updateInputValue('scraperToken', d.token || '');
        updateInputValue('op14-serverId', d.serverId || '');
        const el = document.getElementById('op14TimePeriod');
        if (el) el.value = d.timePeriodMinutes || '';
    } else if (preset.type === 'reaction') {
        updateInputValue('reactionToken', d.token || '');
        updateInputValue('reaction-serverId', d.serverId || '');
        updateInputValue('channelId', d.channelId || '');
        updateInputValue('messageId', d.messageId || '');
        updateInputValue('reactionEmoji', d.reactionEmoji || '');
    } else if (preset.type === 'opcode8') {
        updateInputValue('bruteforceToken', d.token || '');
        updateInputValue('idStart', d.idStart || '');
        updateInputValue('idEnd', d.idEnd || '');
    } else if (preset.type === 'keyword') {
        updateInputValue('keywordToken', d.token || '');
        updateInputValue('keyword-serverId', d.serverId || '');
        updateInputValue('keywordsList', d.keywords || '');
        const el = document.getElementById('keywordTimePeriod');
        if (el) el.value = d.timePeriodMinutes || '';
    }
}

async function loadScraperPresets() {
    try {
        const res  = await fetch('/api/scraper-presets');
        const data = await res.json();
        const select = document.getElementById('scraperPresetSelect');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">— load a preset —</option>';
        (data.presets || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (${p.type})`;
            opt.dataset.preset = JSON.stringify(p);
            select.appendChild(opt);
        });
        if (current) select.value = current;
    } catch (_) {}
}

async function saveScraperPreset() {
    const name = document.getElementById('presetNameInput')?.value.trim();
    if (!name) { showNotification('Enter a preset name first', 'error'); return; }
    const { type, data } = getCurrentScraperState();
    try {
        const res    = await fetch('/api/scraper-presets', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, data })
        });
        const result = await res.json();
        if (result.success) {
            showNotification(`Preset "${name}" saved`, 'success');
            const nameInput = document.getElementById('presetNameInput');
            if (nameInput) nameInput.value = '';
            await loadScraperPresets();
        } else { showNotification(result.message, 'error'); }
    } catch { showNotification('Error saving preset', 'error'); }
}

async function loadSelectedPreset() {
    const select = document.getElementById('scraperPresetSelect');
    if (!select || !select.value) { showNotification('Select a preset first', 'error'); return; }
    const opt = select.options[select.selectedIndex];
    try {
        const preset = JSON.parse(opt.dataset.preset || '{}');
        applyScraperPreset(preset);
        showNotification(`Preset "${preset.name}" loaded`, 'success');
    } catch { showNotification('Error loading preset', 'error'); }
}

async function deleteSelectedPreset() {
    const select = document.getElementById('scraperPresetSelect');
    if (!select || !select.value) { showNotification('Select a preset first', 'error'); return; }
    const opt = select.options[select.selectedIndex];
    const ok = await showConfirm({ icon: SVG_TRASH, title: 'Delete Preset', message: `Delete "${opt.textContent}"?`, confirmText: 'Delete', cancelText: 'Cancel', danger: true });
    if (!ok) return;
    try {
        await fetch(`/api/scraper-presets/${select.value}`, { method: 'DELETE' });
        showNotification('Preset deleted', 'success');
        await loadScraperPresets();
    } catch { showNotification('Error deleting preset', 'error'); }
}

// ─── Global Deduplication ─────────────────────────────────────────────────────
async function loadDedupStats() {
    try {
        const res  = await fetch('/api/dedup-stats');
        const data = await res.json();
        const el   = document.getElementById('dedupCount');
        if (el) el.textContent = (data.count || 0).toLocaleString();
    } catch (_) {}
}

async function saveGlobalDedup() {
    const enabled = document.getElementById('globalDedupEnabled')?.checked || false;
    try {
        const res  = await fetch('/api/update-config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ global_dedup: enabled })
        });
        const data = await res.json();
        showNotification(data.success ? `Global dedup ${enabled ? 'enabled' : 'disabled'}` : data.message, data.success ? 'success' : 'error');
    } catch { showNotification('Error saving setting', 'error'); }
}

async function clearDedupRegistry() {
    const ok = await showConfirm({ icon: SVG_TRASH, title: 'Clear Registry', message: "Clear the global DM registry?\nAll previously DM'd IDs will be forgotten.", confirmText: 'Clear', cancelText: 'Cancel', danger: true });
    if (!ok) return;
    try {
        const res  = await fetch('/api/dedup-registry', { method: 'DELETE' });
        const data = await res.json();
        showNotification(data.success ? 'Registry cleared' : data.message, data.success ? 'success' : 'error');
        loadDedupStats();
    } catch { showNotification('Error clearing registry', 'error'); }
}

// ─── Distributed Scraping ─────────────────────────────────────────────────────
async function scrapeDistributed() {
    const tokensRaw = document.getElementById('distributedTokens')?.value || '';
    const tokens    = tokensRaw.split('\n').map(t => t.trim()).filter(Boolean);
    const serverId  = document.getElementById('distributedServerId')?.value.trim() || document.getElementById('serverId')?.value.trim() || '';
    if (tokens.length < 2) { showNotification('Add at least 2 tokens for distributed scraping', 'error'); return; }
    const btn      = document.getElementById('scrapeDistributedBtn');
    const statusEl = document.getElementById('distributedStatus');
    btn.disabled = true; btn.textContent = 'Scraping...';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--text-secondary)'; statusEl.textContent = `⏳ Running ${tokens.length} tokens in parallel...`; }
    try {
        const res  = await fetch('/api/scrape-distributed', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens, serverId })
        });
        const data = await res.json();
        if (statusEl) { statusEl.style.color = data.success ? 'var(--success)' : 'var(--danger)'; statusEl.textContent = data.success ? `✓ ${data.message}` : `✗ ${data.message}`; }
        showNotification(data.success ? data.message : data.message, data.success ? 'success' : 'error');
        if (data.success) await loadData();
    } catch { showNotification('Error starting distributed scrape', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Start Distributed Scrape'; }
}

// ─── History CSV Export ───────────────────────────────────────────────────────
async function exportHistoryCSV() {
    try {
        const res     = await fetch('/api/history');
        const history = await res.json();
        if (!history.length) { showNotification('No history to export', 'error'); return; }
        const rows = [['Campaign ID', 'Start Time', 'End Time', 'Duration (min)', 'DMs Sent', 'Errors', 'Success Rate %', 'Members', 'Tokens', 'Blocked This Run']];
        history.forEach(h => {
            rows.push([
                h.id,
                h.startTime ? new Date(h.startTime).toLocaleString() : '',
                h.endTime   ? new Date(h.endTime).toLocaleString()   : '',
                h.durationMs ? Math.round(h.durationMs / 60000) : '',
                h.totalSent       || 0,
                h.totalErrors     || 0,
                h.successRate     != null ? h.successRate : '',
                h.totalMembers    || 0,
                h.totalTokens     || 0,
                h.blockedThisRun  || 0,
            ]);
        });
        const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `nubycord_history_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(url); document.body.removeChild(a);
        showNotification(`Exported ${history.length} campaign(s) as CSV`, 'success');
    } catch { showNotification('Error exporting history', 'error'); }
}

// ─── Initialization: New Feature Event Listeners ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Analytics
    initAnalyticsCharts();
    fetchAndUpdateAnalytics();
    analyticsIntervalId = setInterval(fetchAndUpdateAnalytics, 30000);

    // Token profile
    document.getElementById('fetchProfileBtn')?.addEventListener('click', fetchTokenProfile);
    document.getElementById('updateProfileBtn')?.addEventListener('click', updateTokenProfile);

    // Member intelligence
    document.getElementById('analyzeMembersBtn')?.addEventListener('click', analyzeMembers);
    document.getElementById('scoreMembersBtn')?.addEventListener('click',   scoreAndFilterMembers);

    // Sequences
    document.getElementById('addSeqStepBtn')?.addEventListener('click',    () => addSeqStep());
    document.getElementById('saveSeqBtn')?.addEventListener('click',        saveSequence);
    document.getElementById('newSeqBtn')?.addEventListener('click',         () => { currentEditSeqId = null; seqStepCount = 0; updateInputValue('seqName', ''); const el = document.getElementById('seqSteps'); if (el) el.innerHTML = ''; });
    document.getElementById('saveActiveSeqBtn')?.addEventListener('click',  saveActiveSequence);

    // Auto-reply
    document.getElementById('saveAutoReplyBtn')?.addEventListener('click', saveAutoReply);

    // Campaign webhook
    document.getElementById('saveCampaignWebhookBtn')?.addEventListener('click', saveCampaignWebhookConfig);

    // Global dedup
    document.getElementById('saveGlobalDedupBtn')?.addEventListener('click',     saveGlobalDedup);
    document.getElementById('clearDedupRegistryBtn')?.addEventListener('click',  clearDedupRegistry);

    // Distributed scraping
    document.getElementById('scrapeDistributedBtn')?.addEventListener('click', scrapeDistributed);

    // History CSV
    document.getElementById('exportHistoryCSVBtn')?.addEventListener('click', exportHistoryCSV);

    // Export blocked list
    document.getElementById('exportBlockedBtn')?.addEventListener('click', () => {
        window.location.href = '/api/export-blocked';
    });

    // Log search
    document.getElementById('logSearchInput')?.addEventListener('input', () => {
        renderLogs(allLogs);
    });

    // Scraper presets
    document.getElementById('savePresetBtn')?.addEventListener('click',   saveScraperPreset);
    document.getElementById('loadPresetBtn')?.addEventListener('click',   loadSelectedPreset);
    document.getElementById('deletePresetBtn')?.addEventListener('click', deleteSelectedPreset);

    // App Version (admin)
    document.getElementById('saveAppVersionBtn')?.addEventListener('click', saveAppVersion);

    // Campaign Automation
    document.getElementById('saveAutomationBtn')?.addEventListener('click', saveAutomationConfig);

    // Token Warm-Up Scheduler
    document.getElementById('saveWarmingScheduleBtn')?.addEventListener('click', saveAutomationConfig);
    document.getElementById('resetWarmingScheduleBtn')?.addEventListener('click', () => {
        const defaults = [5, 10, 20, 35, 50, 75, 100];
        defaults.forEach((v, i) => { const el = document.getElementById(`warmingDay${i + 1}`); if (el) el.value = v; });
        showNotification('Schedule reset to defaults — click Save Schedule to apply', 'info');
    });
    document.getElementById('refreshWarmingBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('refreshWarmingBtn');
        if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }
        await loadWarmingStatus();
        if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
    });
    document.getElementById('clearWarmingRegistryBtn')?.addEventListener('click', async () => {
        const ok = await showConfirm({ icon: SVG_FLAME, title: 'Clear Warming Registry', message: 'Reset all token warm-up progress? Tokens will restart their 7-day schedule from Day 1.', confirmText: 'Clear', cancelText: 'Cancel', danger: true });
        if (!ok) return;
        const res = await fetch('/api/warming-registry', { method: 'DELETE' });
        const data = await res.json();
        showNotification(data.message || (data.success ? 'Registry cleared' : 'Failed'), data.success ? 'success' : 'error');
        if (data.success) loadWarmingStatus();
    });

    // Campaign Templates
    document.getElementById('saveTemplateBtn')?.addEventListener('click', saveAsTemplate);
    document.getElementById('refreshAbStatsBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('refreshAbStatsBtn');
        if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }
        await fetchAbStats();
        if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
    });
    document.getElementById('clearAbStatsBtn')?.addEventListener('click', clearAbStats);

    // Bulk Import
    document.getElementById('importTokensMergeBtn')?.addEventListener('click',   () => importFile('tokens', 'merge'));
    document.getElementById('importTokensReplaceBtn')?.addEventListener('click', () => importFile('tokens', 'replace'));
    document.getElementById('importMembersMergeBtn')?.addEventListener('click',   () => importFile('members', 'merge'));
    document.getElementById('importMembersReplaceBtn')?.addEventListener('click', () => importFile('members', 'replace'));

    // Discord Status
    document.getElementById('checkDiscordStatusBtn')?.addEventListener('click', checkDiscordStatus);

    // Session Manager
    document.getElementById('refreshSessionsBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('refreshSessionsBtn');
        if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }
        await loadSessions();
        if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
    });
    document.getElementById('killAllSessionsBtn')?.addEventListener('click', killAllSessions);

    // Password change
    document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);

    // Token Health
    document.getElementById('refreshTokenHealthBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('refreshTokenHealthBtn');
        if (btn) { btn.classList.add('btn-spinning'); btn.disabled = true; }
        await fetchTokenHealth();
        if (btn) { btn.classList.remove('btn-spinning'); btn.disabled = false; }
    });
    document.getElementById('clearTokenHealthBtn')?.addEventListener('click',   clearTokenHealth);

    // Elite Automation
    document.getElementById('saveEliteBtn')?.addEventListener('click', saveEliteConfig);

    // Token Tiers
    document.getElementById('autoAssignTiersBtn')?.addEventListener('click', autoAssignTiers);
    document.getElementById('refreshTiersBtn')?.addEventListener('click', fetchTokenTiers);

    // IP Reputation
    document.getElementById('refreshIpRepBtn')?.addEventListener('click', fetchIpReputation);
    document.getElementById('clearIpRepBtn')?.addEventListener('click', clearIpReputation);

    // Mutual Server Injection
    document.getElementById('mutualInjectBtn')?.addEventListener('click', runMutualInject);

    // Load initial data
    loadAppVersion();
    loadWarmingStatus();
    loadAndRenderSequences();
    loadAutoReply();
    loadDedupStats();
    loadCampaignWebhookConfig();
    loadScraperPresets();
    fetchAbStats();
    fetchTokenHealth();
    loadCampaignTemplates();
    loadSessions();
});

// ─── Campaign Automation ──────────────────────────────────────────────────────
async function saveAutomationConfig() {
    const defaults = [5, 10, 20, 35, 50, 75, 100];
    const schedule = [1,2,3,4,5,6,7].map((d, i) => parseInt(document.getElementById(`warmingDay${d}`)?.value) || defaults[i]);
    const config = {
        token_concurrency:        parseInt(document.getElementById('tokenConcurrency')?.value)    || 0,
        campaign_min_score:       parseInt(document.getElementById('campaignMinScore')?.value)    || 0,
        failed_requeue_enabled:   !!(document.getElementById('failedRequeueEnabled')?.checked),
        failed_requeue_delay_ms:  parseInt(document.getElementById('failedRequeueDelay')?.value)  || 30000,
        token_warming_enabled:    !!(document.getElementById('tokenWarmingEnabled')?.checked),
        token_warming_schedule:   schedule,
        error_spike_enabled:      !!(document.getElementById('errorSpikeEnabled')?.checked),
        error_spike_threshold:    parseInt(document.getElementById('errorSpikeThreshold')?.value) || 50,
        error_spike_window:       parseInt(document.getElementById('errorSpikeWindow')?.value)    || 20,
    };
    try {
        const res = await fetch('/api/update-config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config)
        });
        const data = await res.json();
        showNotification(data.success ? 'Automation settings saved' : (data.message || 'Failed to save'), data.success ? 'success' : 'error');
    } catch (err) {
        showNotification('Error saving automation settings', 'error');
    }
}

// ─── Scraper Results Merger ───────────────────────────────────────────────────
function updateMergeStats() {
    const el = document.getElementById('mergeScraperStats');
    if (!el) return;
    const sources = [
        { label: 'Opcode 14', count: scrapedMembers.length },
        { label: 'Reaction',  count: scrapedReactionMembers.length },
        { label: 'Opcode 8',  count: scrapedBruteforceMembers.length },
        { label: 'Keywords',  count: scrapedKeywordMembers.length },
    ];
    const total = sources.reduce((s, x) => s + x.count, 0);
    if (!total) {
        el.innerHTML = '<span style="color:var(--text-secondary);">No scraped data yet — run any scraper above to populate results here.</span>';
        return;
    }
    el.innerHTML = sources.map(s => s.count
        ? `<span><strong style="color:var(--text-primary);">${s.count.toLocaleString()}</strong> <span style="color:var(--text-secondary);">${s.label}</span></span>`
        : ''
    ).filter(Boolean).join('<span style="color:var(--border);margin:0 4px;">|</span>') +
    `<span style="margin-left:auto;"><strong style="color:var(--primary);">${total.toLocaleString()}</strong> <span style="color:var(--text-secondary);">total (before dedup)</span></span>`;
}

async function mergeAllScrapers() {
    const all = [
        ...scrapedMembers,
        ...scrapedReactionMembers,
        ...scrapedBruteforceMembers,
        ...scrapedKeywordMembers
    ];
    if (!all.length) {
        showNotification('No scraped results to merge — run at least one scraper first', 'warn');
        return;
    }
    const seen   = new Set();
    const deduped = all.filter(m => { if (!m || seen.has(m)) return false; seen.add(m); return true; });
    const removed = all.length - deduped.length;

    const textarea = document.getElementById('membersInput');
    if (textarea) textarea.value = deduped.join('\n');
    await saveMembers();

    window._mergedScraperData = deduped;
    const dlBtn = document.getElementById('downloadMergedBtn');
    if (dlBtn) dlBtn.disabled = false;

    const status = document.getElementById('mergeScraperStatus');
    if (status) {
        status.style.display = 'block';
        status.style.color   = 'var(--success)';
        status.textContent   = `Merged ${deduped.length.toLocaleString()} unique members from ${all.length.toLocaleString()} total${removed ? ` — ${removed.toLocaleString()} duplicates removed` : ''}. Loaded into campaign.`;
    }
    showNotification(`Merged ${deduped.length.toLocaleString()} unique members into campaign`, 'success');
}

function downloadMergedMembers() {
    const data = window._mergedScraperData;
    if (!data?.length) return;
    const blob = new Blob([data.join('\n')], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `merged_members_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ─── App Version ──────────────────────────────────────────────────────────────
async function loadAppVersion() {
    try {
        const res  = await fetch('/api/version');
        const data = await res.json();
        if (!data.success) return;
        const sidebar = document.querySelector('.drawer-version');
        if (sidebar) sidebar.textContent = data.version;
        const input   = document.getElementById('appVersionInput');
        if (input && document.activeElement !== input) input.value = data.version;
        const badge   = document.getElementById('versionCurrentBadge');
        if (badge) badge.textContent = data.version;
    } catch (_) {}
}

async function saveAppVersion() {
    const input   = document.getElementById('appVersionInput');
    const version = input?.value?.trim();
    if (!version) { showNotification('Enter a version string', 'error'); return; }
    try {
        const res  = await fetch('/api/admin/version', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version })
        });
        const data = await res.json();
        if (data.success) {
            const sidebar = document.querySelector('.drawer-version');
            if (sidebar) sidebar.textContent = data.version;
            const badge   = document.getElementById('versionCurrentBadge');
            if (badge) badge.textContent = data.version;
            showNotification(`Version updated to ${data.version}`, 'success');
        } else {
            showNotification(data.message || 'Failed to save version', 'error');
        }
    } catch (_) {
        showNotification('Error saving version', 'error');
    }
}

// ─── Token Warm-Up Status ────────────────────────────────────────────────────
async function loadWarmingStatus() {
    const container = document.getElementById('warmingStatusTable');
    if (!container) return;
    try {
        const res  = await fetch('/api/warming-status');
        const data = await res.json();
        if (!data.success || !data.tokens || !data.tokens.length) {
            container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">No warming data yet — run a campaign with Token Warming Mode enabled to see progress here.</p>';
            if (data.schedule) {
                const defaults = [5, 10, 20, 35, 50, 75, 100];
                data.schedule.forEach((v, i) => {
                    const el = document.getElementById(`warmingDay${i + 1}`);
                    if (el && document.activeElement !== el) el.value = v;
                });
            }
            return;
        }
        if (data.schedule) {
            data.schedule.forEach((v, i) => {
                const el = document.getElementById(`warmingDay${i + 1}`);
                if (el && document.activeElement !== el) el.value = v;
            });
        }
        const tdS = 'padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle;font-size:0.83em;';
        const rows = data.tokens.map(t => {
            const day = t.graduated ? `<span style="color:var(--success);font-weight:700;">✓ Graduated</span>` : `Day ${t.daysSince + 1} / ${t.scheduleLen}`;
            const limitTxt = t.graduated ? '—' : `${t.todayCount} / ${t.todayLimit}`;
            const pct = t.graduated ? 100 : Math.min(100, Math.round((t.daysSince / t.scheduleLen) * 100));
            const bar = `<div style="background:var(--border);border-radius:4px;height:5px;margin-top:4px;"><div style="background:${t.graduated ? 'var(--success)' : 'var(--primary)'};width:${pct}%;height:5px;border-radius:4px;transition:width 0.3s;"></div></div>`;
            const firstSeen = t.firstSeen ? new Date(t.firstSeen).toLocaleDateString() : '—';
            return `<tr>
                <td style="${tdS}font-family:monospace;font-size:0.8em;">${t.token}…</td>
                <td style="${tdS}color:var(--text-secondary);">${firstSeen}</td>
                <td style="${tdS}">${day}${bar}</td>
                <td style="${tdS}text-align:center;">${limitTxt}</td>
            </tr>`;
        }).join('');
        container.innerHTML = `
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;">Token</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;">First Seen</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;">Progress</th>
                    <th style="color:var(--text-secondary);font-weight:600;text-align:center;padding:6px 10px;border-bottom:1px solid var(--border);font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;">Today</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">Error loading warming status.</p>';
    }
}

// ─── Timing Profiles ─────────────────────────────────────────────────────────
async function applyTimingProfile(profile) {
    const resultEl = document.getElementById('timingProfileResult');
    try {
        const res = await fetch('/api/timing-profile/apply', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile })
        });
        const data = await res.json();
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = data.success ? 'var(--success)' : 'var(--danger)';
            if (data.success) {
                const t = data.timing;
                resultEl.textContent = `✓ "${profile}" applied — login: ${(t.login_delay_min/1000).toFixed(1)}–${(t.login_delay_max/1000).toFixed(1)}s, DM: ${(t.dm_delay_min/1000).toFixed(1)}–${(t.dm_delay_max/1000).toFixed(1)}s`;
            } else {
                resultEl.textContent = data.message || 'Failed to apply profile';
            }
        }
        if (data.success) loadData();
    } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = 'Error applying profile'; resultEl.style.color = 'var(--danger)'; }
    }
}

// ─── Campaign Templates ───────────────────────────────────────────────────────
async function loadCampaignTemplates() {
    try {
        const res = await fetch('/api/campaign-templates');
        const data = await res.json();
        renderCampaignTemplates(data.templates || []);
    } catch (_) {}
}

function renderCampaignTemplates(templates) {
    const container = document.getElementById('templateList');
    if (!container) return;
    if (!templates.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:12px;">No templates saved yet.</p>';
        return;
    }
    container.innerHTML = templates.map(t => `
        <div class="template-row">
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9em;">${escHtml(t.name)}</div>
                <div style="font-size:0.77em;color:var(--text-secondary);">${new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <div style="display:flex;gap:6px;">
                <button onclick="loadTemplate('${t.id}')" class="btn btn-secondary" style="font-size:0.8em;padding:5px 12px;">Load</button>
                <button onclick="deleteTemplate('${t.id}')" class="btn btn-danger" style="font-size:0.8em;padding:5px 10px;"><svg class="btn-icon-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
            </div>
        </div>
    `).join('');
}

async function saveAsTemplate() {
    const nameEl = document.getElementById('templateNameInput');
    const name = nameEl?.value?.trim();
    if (!name) { showNotification('Enter a template name', 'error'); return; }
    try {
        const res = await fetch('/api/campaign-templates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        });
        const data = await res.json();
        showNotification(data.success ? `Template "${name}" saved` : (data.message || 'Failed'), data.success ? 'success' : 'error');
        if (data.success) { if (nameEl) nameEl.value = ''; loadCampaignTemplates(); }
    } catch (_) {
        showNotification('Error saving template', 'error');
    }
}

async function loadTemplate(id) {
    try {
        const res = await fetch(`/api/campaign-templates/${id}/load`, { method: 'POST' });
        const data = await res.json();
        showNotification(data.success ? data.message : (data.message || 'Failed'), data.success ? 'success' : 'error');
        if (data.success) loadData();
    } catch (_) {
        showNotification('Error loading template', 'error');
    }
}

async function deleteTemplate(id) {
    try {
        await fetch(`/api/campaign-templates/${id}`, { method: 'DELETE' });
        loadCampaignTemplates();
    } catch (_) {}
}

// ─── A/B Stats ────────────────────────────────────────────────────────────────
async function fetchAbStats() {
    try {
        const res = await fetch('/api/ab-stats');
        const data = await res.json();
        renderAbStats(data);
    } catch (_) {}
}

function renderAbStats(data) {
    const container = document.getElementById('abStatsList');
    if (!container) return;
    if (!data.stats || !data.stats.length || data.total === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">Start a campaign with multiple messages to see A/B statistics here.</p>';
        return;
    }
    const totalReplies = data.totalReplies || 0;
    const paraphrase   = data.paraphraseCache;
    let headerHtml = '';
    if (totalReplies > 0) {
        headerHtml = `<div style="display:flex;gap:18px;margin-bottom:14px;font-size:0.83em;color:var(--text-secondary);">
            <span>Total replies tracked: <strong style="color:var(--success);">${totalReplies}</strong></span>
            ${paraphrase ? `<span>Paraphrase variants cached: <strong>${paraphrase.totalVariants}</strong></span>` : ''}
        </div>`;
    }
    container.innerHTML = headerHtml + data.stats.map(s => {
        const replyBadge = s.replies > 0
            ? `<span style="margin-left:8px;font-size:0.78em;background:var(--success);color:#fff;padding:1px 7px;border-radius:20px;font-weight:700;" title="Replies to this variant">${s.replies} repl${s.replies === 1 ? 'y' : 'ies'} · ${s.responseRate}%</span>`
            : '';
        return `
        <div class="ab-bar-row">
            <div class="ab-bar-label">Msg ${s.index + 1}</div>
            <div class="ab-bar-track"><div class="ab-bar-fill" style="width:${s.pct}%"></div></div>
            <div class="ab-bar-count">${s.count} (${s.pct}%)${replyBadge}</div>
        </div>
        <div style="font-size:0.77em;color:var(--text-secondary);margin-bottom:14px;padding-left:80px;">${escHtml((s.preview||''))}${(s.preview||'').length >= 80 ? '…' : ''}</div>`;
    }).join('');
}

async function clearAbStats() {
    try {
        await fetch('/api/ab-stats', { method: 'DELETE' });
        renderAbStats({ stats: [], total: 0 });
        showNotification('A/B stats cleared', 'success');
    } catch (_) {}
}

// ─── Token Health ─────────────────────────────────────────────────────────────
async function fetchTokenHealth() {
    try {
        const res = await fetch('/api/token-health');
        const data = await res.json();
        renderTokenHealth(data.entries || []);
    } catch (_) {}
}

function renderTokenHealth(entries) {
    const container = document.getElementById('tokenHealthList');
    if (!container) return;
    if (!entries.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">No unhealthy tokens recorded.</p>';
        return;
    }

    const now = Date.now();
    const totalSent = entries.reduce((s, e) => s + (e.totalSent || 0), 0);
    const recent1h  = entries.filter(e => now - new Date(e.lastError).getTime() < 3600000).length;

    const summaryHtml = `
        <div class="th-summary">
            <div class="th-summary-item">
                <span class="th-summary-val" style="color:var(--danger);">${entries.length}</span>
                <span class="th-summary-label">Retired Tokens</span>
            </div>
            <div class="th-summary-item">
                <span class="th-summary-val" style="color:#ffc83c;">${recent1h}</span>
                <span class="th-summary-label">Last Hour</span>
            </div>
            <div class="th-summary-item">
                <span class="th-summary-val">${totalSent.toLocaleString()}</span>
                <span class="th-summary-label">DMs Sent Before Retire</span>
            </div>
        </div>
    `;

    const cardsHtml = entries.map(e => {
        const maxCerr = 5;
        const cerrPct = Math.min(100, Math.round(((e.consecutiveErrors || 0) / maxCerr) * 100));
        const age = _timeAgo(new Date(e.lastError));
        return `
        <div class="th-card">
            <div class="th-card-top">
                <span class="th-card-token" title="${escHtml(e.key + '…')}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ed4245" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <code>${escHtml(e.key)}…</code>
                </span>
                <span class="th-card-badge">unhealthy</span>
            </div>
            <div class="th-card-meta">
                <span title="${new Date(e.lastError).toLocaleString()}">🕐 ${age}</span>
                <span>✓ ${e.totalSent || 0} sent</span>
                <span style="color:#ed4245;">✗ ${e.consecutiveErrors || 0} consec. errors</span>
            </div>
            <div class="th-cerr-bar-wrap" title="${e.consecutiveErrors || 0}/${maxCerr} consecutive errors at retirement">
                <div class="th-cerr-bar-track">
                    <div class="th-cerr-bar-fill" style="width:${cerrPct}%;"></div>
                </div>
                <span class="th-cerr-bar-label">${e.consecutiveErrors || 0}/${maxCerr} error streak</span>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = summaryHtml + `<div class="th-cards">${cardsHtml}</div>`;
}

function _timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
}

async function clearTokenHealth() {
    try {
        const res = await fetch('/api/token-health', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { renderTokenHealth([]); showNotification(data.message, 'success'); }
    } catch (_) {}
}

// ─── Discord Status ───────────────────────────────────────────────────────────
async function checkDiscordStatus() {
    const btn = document.getElementById('checkDiscordStatusBtn');
    const resultEl = document.getElementById('discordStatusResult');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/discord-status');
        const data = await res.json();
        if (!resultEl) return;
        resultEl.style.display = 'block';
        const overallEl = document.getElementById('discordStatusOverall');
        if (overallEl) {
            const dot = data.overall === 'none' ? 'ok' : data.overall === 'minor' ? 'minor' : 'major';
            overallEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span class="status-indicator status-${dot}"></span><strong>${escHtml(data.description || data.overall)}</strong></span>`;
        }
        const grid = document.getElementById('discordStatusGrid');
        if (grid && data.components) {
            grid.innerHTML = data.components.map(c => {
                const st   = c.status === 'operational' ? 'ok' : c.status.includes('degraded') ? 'minor' : 'major';
                const name = c.name.length > 22 ? c.name.slice(0, 20) + '…' : c.name;
                return `<span class="status-check-pill status-check-pill--${st}" title="${escHtml(c.name)}: ${escHtml(c.status)}">${escHtml(name)}</span>`;
            }).join('');
        }
        const incidents = document.getElementById('discordStatusIncidents');
        if (incidents) {
            if (data.incidents && data.incidents.length) {
                incidents.innerHTML = '<div style="font-size:0.82em;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Active Incidents</div>' +
                    data.incidents.map(i => `<div style="font-size:0.82em;margin-bottom:4px;"><a href="${escHtml(i.url||'')}" target="_blank" style="color:var(--danger);">${escHtml(i.name)}</a> <span style="color:var(--text-secondary);">[${escHtml(i.status)}]</span></div>`).join('');
            } else {
                incidents.innerHTML = '';
            }
        }
    } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; document.getElementById('discordStatusOverall').textContent = 'Failed to reach Discord status API'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─── Session Manager ──────────────────────────────────────────────────────────
async function loadSessions() {
    const card        = document.getElementById('sessionManagerCard');
    const versionCard = document.getElementById('versionConfigCard');
    const container   = document.getElementById('sessionList');
    if (!card) return;
    try {
        const res = await fetch('/api/admin/sessions');
        if (res.status === 403) {
            card.style.display = 'none';
            if (versionCard) versionCard.style.display = 'none';
            return;
        }
        card.style.display = 'block';
        if (versionCard) { versionCard.style.display = 'block'; loadAppVersion(); }
        const data = await res.json();
        if (!container) return;
        if (!data.sessions || !data.sessions.length) {
            container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:12px;">No active sessions.</p>';
            return;
        }
        container.innerHTML = data.sessions.map(s => `
            <div class="template-row">
                <div style="flex:1;">
                    <div style="font-size:0.85em;font-family:monospace;">${escHtml(s.sessionId)}</div>
                    <div style="font-size:0.77em;color:var(--text-secondary);">@${escHtml(s.mutex || '?')} — ${s.loginTime ? new Date(s.loginTime).toLocaleString() : '?'} ${s.isCurrent ? '(this session)' : ''}</div>
                </div>
                ${!s.isCurrent ? `<button onclick="killSession('${escHtml(s.sessionId)}')" class="btn btn-danger" style="font-size:0.8em;padding:5px 12px;">Kill</button>` : '<span style="font-size:0.78em;color:var(--text-secondary);">current</span>'}
            </div>
        `).join('');
    } catch (_) { if (card) card.style.display = 'none'; }
}

async function killSession(partialId) {
    try {
        const cleanId = partialId.replace('...', '');
        const res = await fetch(`/api/admin/sessions/${encodeURIComponent(cleanId)}`, { method: 'DELETE' });
        const data = await res.json();
        showNotification(data.killed ? 'Session killed' : 'Session not found', data.killed ? 'success' : 'error');
        loadSessions();
    } catch (_) {}
}

async function killAllSessions() {
    try {
        const res = await fetch('/api/admin/sessions', { method: 'DELETE' });
        const data = await res.json();
        showNotification(`${data.killed || 0} other session(s) terminated`, 'success');
        loadSessions();
    } catch (_) {}
}

// ─── Password Change ──────────────────────────────────────────────────────────
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const statusEl = document.getElementById('changePasswordStatus');
    const btn = document.getElementById('changePasswordBtn');
    if (!currentPassword || !newPassword) { showNotification('Fill both password fields', 'error'); return; }
    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/change-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = data.success ? 'var(--success)' : 'var(--danger)';
            statusEl.textContent = data.message;
        }
        if (data.success) {
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
        }
    } catch (_) {
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Error changing password'; statusEl.style.color = 'var(--danger)'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─── Bulk File Import ─────────────────────────────────────────────────────────
async function importFile(type, mode) {
    const fileEl = document.getElementById(type === 'tokens' ? 'importTokensFile' : 'importMembersFile');
    const resultEl = document.getElementById('importResult');
    if (!fileEl || !fileEl.files[0]) { showNotification('Select a file first', 'error'); return; }
    const text = await fileEl.files[0].text();
    const url = type === 'tokens' ? '/api/import-tokens' : '/api/import-members';
    try {
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, mode })
        });
        const data = await res.json();
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = data.success ? 'var(--success)' : 'var(--danger)';
            resultEl.textContent = data.message;
        }
        showNotification(data.message, data.success ? 'success' : 'error');
    } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = 'Import error: ' + err.message; resultEl.style.color = 'var(--danger)'; }
    }
}

// ─── Elite Automation ─────────────────────────────────────────────────────────
async function saveEliteConfig() {
    const statusEl = document.getElementById('eliteStatus');
    const config = {
        ...currentConfig,
        token_tier_enabled:          !!(document.getElementById('tokenTierEnabled')?.checked),
        friend_request_mode:         !!(document.getElementById('friendRequestMode')?.checked),
        friend_request_dm_delay_ms:  parseInt(document.getElementById('friendRequestDmDelay')?.value) || 90000,
        paraphrase_enabled:          !!(document.getElementById('paraphraseEnabled')?.checked),
        paraphrase_api_key:          document.getElementById('paraphraseApiKey')?.value?.trim()  || '',
        paraphrase_model:            document.getElementById('paraphraseModel')?.value?.trim()   || '',
        paraphrase_base_url:         document.getElementById('paraphraseBaseUrl')?.value?.trim() || '',
        distributed_mode:            document.getElementById('distributedMode')?.value           || 'standalone',
        node_secret:                 document.getElementById('nodeSecret')?.value?.trim()        || '',
        coordinator_url:             document.getElementById('coordinatorUrl')?.value?.trim()    || '',
    };
    try {
        const res = await fetch('/api/update-config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config)
        });
        const data = await res.json();
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = data.success ? 'var(--success)' : 'var(--danger)';
            statusEl.textContent = data.success ? 'Elite settings saved.' : (data.message || 'Failed to save.');
            setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
        }
        showNotification(data.success ? 'Elite settings saved' : (data.message || 'Failed to save'), data.success ? 'success' : 'error');
    } catch (err) {
        if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--danger)'; statusEl.textContent = 'Save error: ' + err.message; }
    }
}

// ─── Token Tiers ──────────────────────────────────────────────────────────────
async function fetchTokenTiers() {
    const container = document.getElementById('tokenTierTable');
    if (container) container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">Loading…</p>';
    try {
        const res = await fetch('/api/token-tiers');
        const data = await res.json();
        renderTokenTiers(data.tiers || []);
    } catch (_) {
        if (container) container.innerHTML = '<p style="color:var(--danger);font-size:0.85em;text-align:center;padding:16px;">Failed to load tier data.</p>';
    }
}

function renderTokenTiers(tiers) {
    const container = document.getElementById('tokenTierTable');
    if (!container) return;
    if (!tiers.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">No tokens loaded yet. Load tokens on the Overview tab first.</p>';
        return;
    }
    const tierColor = { T1: 'var(--success)', T2: '#58a6ff', T3: 'var(--text-secondary)' };
    const tierLabel = { T1: 'Elite', T2: 'Active', T3: 'Fresh' };
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85em;">
            <thead>
                <tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:0.8em;text-transform:uppercase;letter-spacing:0.04em;">
                    <th style="text-align:left;padding:6px 8px;">Token (truncated)</th>
                    <th style="text-align:center;padding:6px 8px;">Tier</th>
                    <th style="text-align:center;padding:6px 8px;">Score</th>
                    <th style="text-align:left;padding:6px 8px;">Reason</th>
                </tr>
            </thead>
            <tbody>
                ${tiers.map(t => `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:6px 8px;font-family:monospace;color:var(--text-secondary);">${escHtml(t.token.slice(0, 20))}…</td>
                    <td style="text-align:center;padding:6px 8px;">
                        <span style="font-weight:700;color:${tierColor[t.tier] || 'var(--text)'};">${t.tier} <span style="font-weight:400;font-size:0.85em;">(${tierLabel[t.tier] || ''})</span></span>
                    </td>
                    <td style="text-align:center;padding:6px 8px;font-weight:700;">${t.score}</td>
                    <td style="padding:6px 8px;color:var(--text-secondary);">${escHtml(t.reason || '')}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

async function autoAssignTiers() {
    const msgEl = document.getElementById('tierStatusMsg');
    const btn = document.getElementById('autoAssignTiersBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Assigning…'; }
    try {
        const res = await fetch('/api/token-tiers/assign', { method: 'POST' });
        const data = await res.json();
        if (msgEl) {
            msgEl.style.display = 'block';
            msgEl.style.color = data.success ? 'var(--success)' : 'var(--danger)';
            msgEl.textContent = data.message || (data.success ? 'Tiers assigned.' : 'Failed.');
        }
        if (data.success) await fetchTokenTiers();
        showNotification(data.message || 'Tiers assigned', data.success ? 'success' : 'error');
    } catch (err) {
        if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = 'var(--danger)'; msgEl.textContent = 'Error: ' + err.message; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Auto-Assign All Tiers'; }
    }
}

// ─── IP Reputation ────────────────────────────────────────────────────────────
async function fetchIpReputation() {
    const container = document.getElementById('ipRepTable');
    if (container) container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">Loading…</p>';
    try {
        const res = await fetch('/api/ip-reputation');
        const data = await res.json();
        renderIpReputation(data.entries || []);
    } catch (_) {
        if (container) container.innerHTML = '<p style="color:var(--danger);font-size:0.85em;text-align:center;padding:16px;">Failed to load IP reputation data.</p>';
    }
}

function renderIpReputation(entries) {
    const container = document.getElementById('ipRepTable');
    if (!container) return;
    if (!entries.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85em;text-align:center;padding:16px;">No IP data yet. Data accumulates as campaigns run with proxies enabled.</p>';
        return;
    }
    const scoreColor = (s) => s >= 60 ? 'var(--success)' : s >= 30 ? '#e3b341' : 'var(--danger)';
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.85em;">
            <thead>
                <tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:0.8em;text-transform:uppercase;letter-spacing:0.04em;">
                    <th style="text-align:left;padding:6px 8px;">IP</th>
                    <th style="text-align:center;padding:6px 8px;">Score</th>
                    <th style="text-align:center;padding:6px 8px;">Requests</th>
                    <th style="text-align:center;padding:6px 8px;">Errors</th>
                    <th style="text-align:center;padding:6px 8px;">Bans</th>
                    <th style="text-align:left;padding:6px 8px;">Last seen</th>
                </tr>
            </thead>
            <tbody>
                ${entries.map(e => {
                    const score = Math.round(e.score ?? 50);
                    const lastSeen = e.lastSeen ? new Date(e.lastSeen).toLocaleTimeString() : '—';
                    return `<tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:6px 8px;font-family:monospace;">${escHtml(e.ip)}</td>
                        <td style="text-align:center;padding:6px 8px;font-weight:700;color:${scoreColor(score)};">${score}</td>
                        <td style="text-align:center;padding:6px 8px;">${e.requests ?? 0}</td>
                        <td style="text-align:center;padding:6px 8px;color:${e.errors > 0 ? 'var(--danger)' : 'var(--text-secondary)'};">${e.errors ?? 0}</td>
                        <td style="text-align:center;padding:6px 8px;color:${e.bans > 0 ? 'var(--danger)' : 'var(--text-secondary)'};">${e.bans ?? 0}</td>
                        <td style="padding:6px 8px;color:var(--text-secondary);">${lastSeen}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

async function clearIpReputation() {
    try {
        const res = await fetch('/api/ip-reputation', { method: 'DELETE' });
        const data = await res.json();
        renderIpReputation([]);
        showNotification(data.message || 'IP reputation cleared', 'success');
    } catch (_) {
        showNotification('Error clearing IP reputation', 'error');
    }
}

// ─── Mutual Server Injection ──────────────────────────────────────────────────
async function runMutualInject() {
    const btn      = document.getElementById('mutualInjectBtn');
    const statusEl = document.getElementById('mutualInjectStatus');
    const resultsEl = document.getElementById('mutualInjectResults');
    const tokens   = (document.getElementById('mutualInjectTokens')?.value || '').split('\n').map(t => t.trim()).filter(Boolean);
    const invite   = document.getElementById('mutualInjectInvite')?.value?.trim() || '';
    const delay    = parseInt(document.getElementById('mutualInjectDelay')?.value) || 3000;

    if (!tokens.length) { showNotification('Paste at least one throwaway token', 'error'); return; }
    if (!invite)        { showNotification('Enter an invite code or URL', 'error'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Injecting…'; }
    if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = 'var(--text-secondary)'; statusEl.textContent = `Joining ${tokens.length} token(s)…`; }
    if (resultsEl) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; }

    try {
        const res = await fetch('/api/mutual-inject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens, invite, delay_ms: delay })
        });
        const data = await res.json();
        if (statusEl) {
            statusEl.style.color = data.success ? 'var(--success)' : 'var(--danger)';
            statusEl.textContent = data.message || (data.success ? 'Done.' : 'Failed.');
        }
        if (data.results && data.results.length && resultsEl) {
            resultsEl.style.display = 'block';
            resultsEl.innerHTML = data.results.map(r => {
                const color = r.success ? 'var(--success)' : 'var(--danger)';
                return `<div style="padding:6px 12px;border-bottom:1px solid var(--border);font-size:0.82em;font-family:monospace;color:${color};">${r.token.slice(0, 20)}… — ${escHtml(r.message || (r.success ? 'joined' : 'failed'))}</div>`;
            }).join('');
        }
        showNotification(data.message || (data.success ? 'Injection complete' : 'Injection failed'), data.success ? 'success' : 'error');
    } catch (err) {
        if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = 'Error: ' + err.message; }
        showNotification('Injection error: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Inject Tokens'; }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DM Status Tracker
// ═══════════════════════════════════════════════════════════════════════════════

let _dmsFilter  = 'all';
let _dmsSearch  = '';
let _dmsFullLog = [];

async function loadDmStatus() {
    try {
        const res  = await fetch('/api/dm-status');
        if (!res.ok) return;
        const data = await res.json();
        _dmsFullLog = data.log || [];

        const sent    = data.sent    || 0;
        const replied = data.replied || 0;
        const blocked = data.blocked || 0;
        const errors  = data.errors  || 0;
        const total   = data.total   || 0;
        const delivered = sent + replied;
        const rate = delivered > 0 ? Math.round((replied / delivered) * 100) : 0;

        document.getElementById('dmsBadgeSent')   .textContent = `${sent} sent`;
        document.getElementById('dmsBadgeReplied').textContent = `${replied} replied`;
        document.getElementById('dmsBadgeBlocked').textContent = `${blocked} blocked`;
        document.getElementById('dmsBadgeError')  .textContent = `${errors} errors`;
        document.getElementById('dmsBadgeTotal')  .textContent = `${total} total`;
        document.getElementById('dmsBadgeRate')   .textContent = `${rate}% response rate`;

        renderDmStatusTable();
    } catch (_) {}
}

function renderDmStatusTable() {
    const tbody = document.getElementById('dmsTableBody');
    if (!tbody) return;

    const q = _dmsSearch.toLowerCase();
    const rows = _dmsFullLog
        .filter(e => _dmsFilter === 'all' || e.status === _dmsFilter)
        .filter(e => !q ||
            (e.memberId || '').includes(q) ||
            (e.username || '').toLowerCase().includes(q) ||
            (e.tokenTag || '').toLowerCase().includes(q) ||
            (e.lastReplyText || '').toLowerCase().includes(q))
        .slice().reverse();

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-secondary);">No entries match the current filter.</td></tr>';
        return;
    }

    const statusBadge = s => {
        const map = {
            sent:    { bg: 'rgba(87,242,135,0.13)',   color: '#57f287', label: 'SENT'    },
            replied: { bg: 'rgba(88,101,242,0.15)',   color: '#7c8ff5', label: 'REPLIED' },
            blocked: { bg: 'rgba(250,166,26,0.13)',   color: '#faa61a', label: 'BLOCKED' },
            error:   { bg: 'rgba(237,66,69,0.13)',    color: '#ed4245', label: 'ERROR'   },
        };
        const m = map[s] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', label: s };
        return `<span style="padding:2px 9px;border-radius:8px;background:${m.bg};color:${m.color};font-weight:700;font-size:0.78em;">${m.label}</span>`;
    };

    const fmtTime = ts => {
        if (!ts) return '—';
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const reasonOrReply = e => {
        if (e.status === 'replied' && e.lastReplyText) {
            const count = e.replyCount > 1 ? ` <span style="opacity:0.55;">(×${e.replyCount})</span>` : '';
            return `<span style="color:#7c8ff5;" title="${escHtml(e.lastReplyText)}">💬 ${escHtml(e.lastReplyText.slice(0, 60))}${e.lastReplyText.length > 60 ? '…' : ''}</span>${count}`;
        }
        if (e.reason) return `<span title="${escHtml(e.reason)}">${escHtml(e.reason)}</span>`;
        return '<span style="opacity:0.4;">—</span>';
    };

    tbody.innerHTML = rows.map(e => `
        <tr style="border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
            <td style="padding:7px 10px;font-family:monospace;font-size:0.82em;">
                <span title="Click to copy" style="cursor:pointer;color:var(--text-secondary);" onclick="navigator.clipboard.writeText('${escHtml(e.memberId||'')}').then(()=>showNotification('Copied!','success'))">${escHtml(e.memberId||'—')}</span>
            </td>
            <td style="padding:7px 10px;">${escHtml(e.username||'—')}</td>
            <td style="padding:7px 10px;">${statusBadge(e.status)}</td>
            <td style="padding:7px 10px;color:var(--text-secondary);font-size:0.81em;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${reasonOrReply(e)}
            </td>
            <td style="padding:7px 10px;font-size:0.8em;color:var(--text-secondary);">${escHtml(e.tokenTag||'—')}</td>
            <td style="padding:7px 10px;font-size:0.8em;color:var(--text-secondary);white-space:nowrap;">
                ${fmtTime(e.timestamp)}${e.lastReplyAt ? `<br><span style="opacity:0.55;font-size:0.88em;">↩ ${fmtTime(e.lastReplyAt)}</span>` : ''}
            </td>
        </tr>`).join('');
}

function setupDmStatusTracker() {
    document.querySelectorAll('.dms-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dms-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _dmsFilter = btn.dataset.filter;
            renderDmStatusTable();
        });
    });

    const searchEl = document.getElementById('dmsSearchInput');
    if (searchEl) {
        searchEl.addEventListener('input', e => {
            _dmsSearch = e.target.value;
            renderDmStatusTable();
        });
    }

    document.getElementById('clearDmStatusBtn')?.addEventListener('click', async () => {
        await fetch('/api/dm-status', { method: 'DELETE' });
        _dmsFullLog = [];
        renderDmStatusTable();
        ['dmsBadgeSent','dmsBadgeReplied','dmsBadgeBlocked','dmsBadgeError','dmsBadgeTotal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = id.includes('Rate') ? '0% response rate' : `0 ${id.replace('dmsBadge','').toLowerCase()}`;
        });
        document.getElementById('dmsBadgeRate').textContent = '0% response rate';
        showNotification('DM status tracker cleared', 'success');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupDmStatusTracker();
    loadDmStatus();
    setInterval(loadDmStatus, 3000);
});
