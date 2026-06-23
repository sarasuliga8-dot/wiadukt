// ============================================================
// WIADUKT — GAME SCRIPT
// ============================================================

const CONFIG = {
    defaultPlayerNames:  ['Player 1', 'Player 2'],
    defaultSideNames:    ['Left', 'Right'],
    defaultPlayerColors: ['#3b82f6', '#e11d48'],
};

const SUPABASE_URL = 'https://muczxnxnhwdcnsscwthc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Y3p4bnhuaHdkY25zc2N3dGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjUzMTMsImV4cCI6MjA5NzIwMTMxM30.FEcwe_TUDmtm6DEH30fy6QW24GoyLcMIEucxIPGYbIg';


// ============================================================
// SECTION: SUPABASE CLIENT
// ============================================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


// ============================================================
// SECTION: UTILITIES
// ============================================================

function el(id) { return document.getElementById(id); }
function show(element) { element.classList.remove('hidden'); }
function hide(element) { element.classList.add('hidden'); }

function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function contrastColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 160 ? '#000000' : '#ffffff';
}

function fmtDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

function fmtPts(n) {
    return n % 1 === 0 ? String(n) : n.toFixed(1);
}


// ============================================================
// SECTION: STATE MANAGEMENT
// ============================================================

let state = null;

async function loadState() {
    const [
        { data: settings, error: e1 },
        { data: round,    error: e2 },
        { data: history,  error: e3 },
    ] = await Promise.all([
        db.from('game_settings').select('*').eq('id', 1).single(),
        db.from('current_round').select('*').eq('id', 1).single(),
        db.from('score_history').select('*').order('created_at', { ascending: true }),
    ]);

    if (e1 || e2 || e3) {
        console.error('Failed to load state', e1, e2, e3);
        return;
    }

    state = {
        players:      [settings.player_0_name, settings.player_1_name],
        sideNames:    [settings.side_0_name,    settings.side_1_name],
        playerColors: [settings.player_0_color, settings.player_1_color],
        round: {
            number:        round.round_number,
            drawerIndex:   round.drawer_index,
            sidesAssigned: round.sides_assigned,
            playerSides:   [round.player_0_side, round.player_1_side],
            scored:        round.scored,
            result:        round.winner_index !== null
                               ? { winnerIndex: round.winner_index, points: Number(round.points) }
                               : null,
            startDate:     round.start_date,
        },
        scoreHistory: (history || []).map(h => ({
            date:        h.date,
            winnerIndex: h.winner_index,
            points:      Number(h.points),
        })),
    };
}

async function saveRound() {
    const { round } = state;
    await db.from('current_round').update({
        round_number:   round.number,
        drawer_index:   round.drawerIndex,
        sides_assigned: round.sidesAssigned,
        player_0_side:  round.playerSides[0],
        player_1_side:  round.playerSides[1],
        scored:         round.scored,
        winner_index:   round.result?.winnerIndex ?? null,
        points:         round.result?.points ?? null,
        start_date:     round.startDate,
        updated_at:     new Date().toISOString(),
    }).eq('id', 1);
}

async function saveSettings() {
    await db.from('game_settings').update({
        player_0_name:  state.players[0],
        player_1_name:  state.players[1],
        player_0_color: state.playerColors[0],
        player_1_color: state.playerColors[1],
        side_0_name:    state.sideNames[0],
        side_1_name:    state.sideNames[1],
        updated_at:     new Date().toISOString(),
    }).eq('id', 1);
}

async function appendScore(entry) {
    await db.from('score_history').insert({
        round_number: state.round.number,
        date:         entry.date,
        winner_index: entry.winnerIndex ?? null,
        points:       entry.points ?? null,
    });
}

async function clearScoreHistory() {
    await db.from('score_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

function subscribeToChanges() {
    db.channel('game-sync')
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'current_round' },
            async () => { await loadState(); renderGame(); })
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'game_settings' },
            async () => { await loadState(); renderGame(); renderSettings(); })
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'score_history' },
            async () => { await loadState(); renderGame(); })
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'archived_games' },
            () => {
                const cur = document.querySelector('.view:not(.hidden)');
                if (cur?.id === 'view-past-games') renderPastGames();
            })
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'archived_games' },
            () => {
                const cur = document.querySelector('.view:not(.hidden)');
                if (cur?.id === 'view-past-games') renderPastGames();
            })
        .subscribe();
}


// ============================================================
// SECTION: ARCHIVED GAMES (Supabase)
// ============================================================

async function loadArchivedGames() {
    const { data, error } = await db
        .from('archived_games')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load archived games', error);
        return [];
    }

    return (data || []).map(row => ({
        id:           row.id,
        createdAt:    row.created_at,
        players:      [row.player_0_name, row.player_1_name],
        playerColors: [row.player_0_color, row.player_1_color],
        sideNames:    [row.side_0_name,    row.side_1_name],
        scoreHistory: row.score_history || [],
        totalScores:  [Number(row.total_score_0), Number(row.total_score_1)],
    }));
}

async function archiveCurrentGame() {
    if (state.scoreHistory.length === 0) return;

    const totalScores = [0, 0];
    for (const entry of state.scoreHistory) {
        if (entry.winnerIndex !== null) totalScores[entry.winnerIndex] += entry.points;
    }

    await db.from('archived_games').insert({
        player_0_name:  state.players[0],
        player_1_name:  state.players[1],
        player_0_color: state.playerColors[0],
        player_1_color: state.playerColors[1],
        side_0_name:    state.sideNames[0],
        side_1_name:    state.sideNames[1],
        total_score_0:  totalScores[0],
        total_score_1:  totalScores[1],
        score_history:  state.scoreHistory,
    });
}

// One-time migration: moves localStorage games into Supabase and clears local storage.
async function deleteArchivedGame(id) {
    await db.from('archived_games').delete().eq('id', id);
}

async function resetAllGames() {
    await db.from('archived_games').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await clearScoreHistory();
    state.players      = [...CONFIG.defaultPlayerNames];
    state.sideNames    = [...CONFIG.defaultSideNames];
    state.playerColors = [...CONFIG.defaultPlayerColors];
    state.scoreHistory = [];
    state.round = {
        number: 1, drawerIndex: 0, sidesAssigned: false,
        playerSides: [null, null], scored: false, result: null, startDate: todayStr(),
    };
    await Promise.all([saveSettings(), saveRound()]);
    renderGame();
    renderSettings();
}

async function continueArchivedGame(game) {
    if (!confirm('Resume this game? Your current game will be saved to Past Games.')) return;

    await archiveCurrentGame();
    await clearScoreHistory();

    for (let i = 0; i < game.scoreHistory.length; i++) {
        const entry = game.scoreHistory[i];
        await db.from('score_history').insert({
            round_number: i + 1,
            date:         entry.date,
            winner_index: entry.winnerIndex ?? null,
            points:       entry.points ?? null,
        });
    }

    state.players      = [...game.players];
    state.playerColors = [...game.playerColors];
    state.sideNames    = [...game.sideNames];
    state.scoreHistory = game.scoreHistory.map(e => ({ ...e }));

    state.round = {
        number:        game.scoreHistory.length + 1,
        drawerIndex:   0,
        sidesAssigned: false,
        playerSides:   [null, null],
        scored:        false,
        result:        null,
        startDate:     todayStr(),
    };

    await Promise.all([saveSettings(), saveRound()]);
    await db.from('archived_games').delete().eq('id', game.id);

    renderGame();
    renderSettings();

    navStack = ['view-home', 'view-play'];
    _activateView('view-game');
}

async function migrateLocalStorageGames() {
    const raw = localStorage.getItem('wiadukt_games');
    if (!raw) return;

    let localGames;
    try { localGames = JSON.parse(raw); } catch { return; }
    if (!localGames.length) return;

    const rows = localGames.slice().reverse().map(g => ({
        created_at:     g.createdAt,
        player_0_name:  g.players[0],
        player_1_name:  g.players[1],
        player_0_color: g.playerColors[0],
        player_1_color: g.playerColors[1],
        side_0_name:    g.sideNames[0],
        side_1_name:    g.sideNames[1],
        total_score_0:  (g.totalScores || [0, 0])[0],
        total_score_1:  (g.totalScores || [0, 0])[1],
        score_history:  g.scoreHistory || [],
    }));

    const { error } = await db.from('archived_games').insert(rows);
    if (!error) localStorage.removeItem('wiadukt_games');
}


// ============================================================
// SECTION: NAVIGATION
// ============================================================

let navStack = [];
let currentPastGame = null;

function showView(viewId) {
    const current = document.querySelector('.view:not(.hidden)');
    if (current) navStack.push(current.id);
    _activateView(viewId);
}

function goBack() {
    const target = navStack.length > 0 ? navStack.pop() : 'view-home';
    _activateView(target);
}

function _activateView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    el(viewId).classList.remove('hidden');
    if (viewId === 'view-stats')            renderStats();
    if (viewId === 'view-settings')         renderSettings();
    if (viewId === 'view-past-games')       renderPastGames();
    if (viewId === 'view-past-game-detail') renderPastGameDetail(currentPastGame);
}


// ============================================================
// SECTION: ROUND MANAGEMENT
// ============================================================

function checkAutoReset() {
    if (state.round.startDate && state.round.startDate !== todayStr()) {
        advanceRound();
    }
}

async function advanceRound() {
    state.round = {
        number:        state.round.number + 1,
        drawerIndex:   1 - state.round.drawerIndex,
        sidesAssigned: false,
        playerSides:   [null, null],
        scored:        false,
        result:        null,
        startDate:     todayStr(),
    };
    await saveRound();
    renderGame();
}

async function drawSides() {
    const di    = state.round.drawerIndex;
    const drawn = Math.random() < 0.5 ? 0 : 1;
    state.round.playerSides[di]     = drawn;
    state.round.playerSides[1 - di] = 1 - drawn;
    state.round.sidesAssigned = true;
    await saveRound();
    renderGame();
}

async function recordScore(winnerIndex, points) {
    if (state.round.scored) return;

    const entry = { date: todayStr(), winnerIndex: null, points: null };

    if (winnerIndex !== null && points > 0) {
        entry.winnerIndex = winnerIndex;
        entry.points      = points;
        state.scoreHistory.push(entry);
        state.round.result = { winnerIndex, points };
    } else {
        state.round.result = null;
    }

    state.round.scored = true;

    await Promise.all([saveRound(), appendScore(entry)]);
    renderGame();
}


// ============================================================
// SECTION: STATS CALCULATION
// ============================================================

function weekStart(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day  = date.getDay();
    date.setDate(date.getDate() - ((day + 6) % 7));
    const wy = date.getFullYear();
    const wm = String(date.getMonth() + 1).padStart(2, '0');
    const wd = String(date.getDate()).padStart(2, '0');
    return `${wy}-${wm}-${wd}`;
}

function monthKey(dateStr) { return dateStr.slice(0, 7); }
function yearKey(dateStr)  { return dateStr.slice(0, 4); }

function aggregateByPeriod(period) {
    const keyFn = period === 'weekly'  ? weekStart
                : period === 'monthly' ? monthKey
                : yearKey;
    const map = {};
    for (const entry of state.scoreHistory) {
        const k = keyFn(entry.date);
        if (!map[k]) map[k] = [0, 0];
        if (entry.winnerIndex !== null) map[k][entry.winnerIndex] += entry.points;
    }
    return map;
}

function allTimeTotal() {
    const totals = [0, 0];
    for (const entry of state.scoreHistory) {
        if (entry.winnerIndex !== null) totals[entry.winnerIndex] += entry.points;
    }
    return totals;
}

function periodLabel(key, period) {
    if (period === 'weekly') {
        const [y, m, d] = key.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        const end   = new Date(start);
        end.setDate(end.getDate() + 6);
        const fmt = { month: 'short', day: 'numeric' };
        return `${start.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, { ...fmt, year: 'numeric' })}`;
    }
    if (period === 'monthly') {
        const [y, mo] = key.split('-').map(Number);
        return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    return key;
}


// ============================================================
// SECTION: RENDERING
// ============================================================

function renderGame() {
    const { round, players, sideNames } = state;

    el('round-number').textContent = round.number;
    el('round-date').textContent   = fmtDate(round.startDate);

    const phaseDraw   = el('phase-draw');
    const phaseActive = el('phase-active');

    if (!round.sidesAssigned) {
        show(phaseDraw);
        hide(phaseActive);
        el('drawer-prompt').textContent =
            `${players[round.drawerIndex]} draws a side this round.`;
    } else {
        hide(phaseDraw);
        show(phaseActive);

        el('p0-name-display').textContent = players[0];
        el('p1-name-display').textContent = players[1];
        el('p0-side-badge').textContent   = sideNames[round.playerSides[0]];
        el('p1-side-badge').textContent   = sideNames[round.playerSides[1]];

        const scoringSection = el('scoring-section');
        const scoreResult    = el('score-result');
        const totalsDiv      = el('current-totals');

        round.scored ? show(el('btn-new-round')) : hide(el('btn-new-round'));

        [0, 1].forEach(i => {
            const bg   = state.playerColors[i];
            const text = contrastColor(bg);
            document.querySelectorAll(`.score-btn[data-player="${i}"]`).forEach(btn => {
                btn.style.background = bg;
                btn.style.color      = text;
            });
        });

        if (!round.scored) {
            show(scoringSection);
            hide(scoreResult);
            totalsDiv.innerHTML = '';
            el('score-p0-name').textContent = players[0];
            el('score-p1-name').textContent = players[1];
        } else {
            hide(scoringSection);
            show(scoreResult);

            if (round.result) {
                const winner = players[round.result.winnerIndex];
                const pts    = round.result.points;
                scoreResult.textContent = `${winner} scored ${pts} point${pts === 1 ? '' : 's'}!`;
                scoreResult.classList.remove('no-score-result');
            } else {
                scoreResult.textContent = 'No score this round.';
                scoreResult.classList.add('no-score-result');
            }

            const totals = allTimeTotal();
            totalsDiv.innerHTML = `
                <div class="totals-card">
                    <div class="totals-title">All-time totals</div>
                    <div class="total-row">
                        <span class="total-name">${players[0]}</span>
                        <span class="total-score">${fmtPts(totals[0])}</span>
                    </div>
                    <div class="total-row">
                        <span class="total-name">${players[1]}</span>
                        <span class="total-score">${fmtPts(totals[1])}</span>
                    </div>
                </div>
            `;
        }
    }
}

function renderStats() {
    const period  = document.querySelector('.period-btn.active')?.dataset.period || 'weekly';
    const groups  = aggregateByPeriod(period);
    const keys    = Object.keys(groups).sort().reverse();
    const display = el('stats-display');

    if (keys.length === 0) {
        display.innerHTML = '<p class="no-data">No scores recorded yet.</p>';
        return;
    }

    const { players } = state;
    display.innerHTML = keys.map(k => {
        const [p0, p1] = groups[k];
        return `
            <div class="stat-row">
                <div class="stat-period">${periodLabel(k, period)}</div>
                <div class="stat-scores">
                    <span class="stat-player">${players[0]}: <strong>${fmtPts(p0)}</strong></span>
                    <span class="stat-player">${players[1]}: <strong>${fmtPts(p1)}</strong></span>
                </div>
            </div>
        `;
    }).join('');
}

function renderSettings() {
    el('input-p0-name').value = state.players[0];
    el('input-p1-name').value = state.players[1];
    el('input-side-0').value  = state.sideNames[0];
    el('input-side-1').value  = state.sideNames[1];
    el('input-color-0').value = state.playerColors[0];
    el('input-color-1').value = state.playerColors[1];
}

async function renderPastGames() {
    const list = el('past-games-list');
    list.innerHTML = '<p class="no-data">Loading…</p>';

    const games = await loadArchivedGames();

    if (games.length === 0) {
        list.innerHTML = '<p class="no-data">No past games yet.</p>';
        return;
    }

    list.innerHTML = games.map(game => {
        const date = new Date(game.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
        });
        const [s0, s1] = game.totalScores;
        return `
            <div class="past-game-card" data-game-id="${game.id}">
                <div class="past-game-card-main">
                    <div class="past-game-date">${date}</div>
                    <div class="past-game-scores">
                        <span class="past-game-player">${game.players[0]}: <strong>${fmtPts(s0)}</strong></span>
                        <span class="past-game-player">${game.players[1]}: <strong>${fmtPts(s1)}</strong></span>
                    </div>
                </div>
                <button class="btn-delete-game" data-game-id="${game.id}" title="Delete game">✕</button>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.past-game-card-main').forEach(main => {
        main.addEventListener('click', () => {
            const gameId = main.closest('.past-game-card').dataset.gameId;
            currentPastGame = games.find(g => g.id === gameId) || null;
            showView('view-past-game-detail');
        });
    });

    list.querySelectorAll('.btn-delete-game').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Delete this game? This cannot be undone.')) return;
            await deleteArchivedGame(btn.dataset.gameId);
            renderPastGames();
        });
    });
}

function renderPastGameDetail(game) {
    if (!game) return;
    const content = el('past-game-detail-content');
    const [s0, s1] = game.totalScores;

    const date = new Date(game.createdAt).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', year: 'numeric',
    });

    const historyRows = game.scoreHistory.length === 0
        ? '<p class="no-data">No rounds recorded.</p>'
        : game.scoreHistory.map(entry => {
            const result = entry.winnerIndex !== null
                ? `${game.players[entry.winnerIndex]} +${fmtPts(entry.points)}`
                : 'No score';
            return `
                <div class="stat-row">
                    <div class="stat-period">${fmtDate(entry.date)}</div>
                    <div class="stat-scores">
                        <span class="stat-player">${result}</span>
                    </div>
                </div>
            `;
        }).join('');

    content.innerHTML = `
        <p class="past-game-detail-date">${date}</p>
        <div class="totals-card">
            <div class="totals-title">Final Scores</div>
            <div class="total-row">
                <span class="total-name">${game.players[0]}</span>
                <span class="total-score">${fmtPts(s0)}</span>
            </div>
            <div class="total-row">
                <span class="total-name">${game.players[1]}</span>
                <span class="total-score">${fmtPts(s1)}</span>
            </div>
        </div>
        <button class="btn-primary" id="btn-continue-past-game">Continue This Game</button>
        <p class="past-game-history-title">Round History</p>
        <div class="past-game-history-list">${historyRows}</div>
    `;

    el('btn-continue-past-game').addEventListener('click', () => continueArchivedGame(game));
}


// ============================================================
// SECTION: EVENT HANDLING
// ============================================================

function initEvents() {

    function showNavBlockedMsg() {
        const msg = el('nav-blocked-msg');
        if (!msg) return;
        msg.classList.remove('hidden');
        clearTimeout(msg._hideTimer);
        msg._hideTimer = setTimeout(() => msg.classList.add('hidden'), 2500);
    }

    function tryLeaveGame(onLeave) {
        if (state.round.sidesAssigned && !state.round.scored) {
            showNavBlockedMsg();
            return;
        }
        if (state.round.scored) {
            advanceRound().then(onLeave);
            return;
        }
        onLeave();
    }

    // Home nav cards
    document.querySelectorAll('[data-nav]').forEach(card => {
        card.addEventListener('click', () => showView(card.dataset.nav));
    });

    // Play menu
    el('btn-continue-game').addEventListener('click', () => {
        renderGame();
        showView('view-game');
    });

    el('btn-past-games-nav').addEventListener('click', () => showView('view-past-games'));

    el('btn-new-game').addEventListener('click', async () => {
        if (!confirm('Start a new game? The current game will be saved to Past Games.')) return;
        await archiveCurrentGame();
        state.players      = [...CONFIG.defaultPlayerNames];
        state.sideNames    = [...CONFIG.defaultSideNames];
        state.playerColors = [...CONFIG.defaultPlayerColors];
        state.scoreHistory = [];
        state.round = {
            number: 1, drawerIndex: 0, sidesAssigned: false,
            playerSides: [null, null], scored: false, result: null, startDate: todayStr(),
        };
        await Promise.all([saveRound(), clearScoreHistory(), saveSettings()]);
        renderGame();
        renderSettings();
        showView('view-game');
    });

    el('btn-reset-all-games').addEventListener('click', async () => {
        if (!confirm('Delete all games and reset everything? This cannot be undone.')) return;
        await resetAllGames();
        navStack = [];
        _activateView('view-home');
    });

    // Back buttons
    el('btn-back-play').addEventListener('click', goBack);
    el('btn-back-game').addEventListener('click', () => tryLeaveGame(goBack));
    el('btn-back-past-games').addEventListener('click', goBack);
    el('btn-back-game-detail').addEventListener('click', goBack);
    el('btn-back-stats').addEventListener('click', goBack);
    el('btn-back-settings').addEventListener('click', goBack);

    // Game actions
    el('btn-draw').addEventListener('click', drawSides);

    el('scoring-section').addEventListener('click', e => {
        const btn = e.target.closest('[data-player][data-points]');
        if (!btn) return;
        recordScore(
            parseInt(btn.dataset.player, 10),
            parseFloat(btn.dataset.points)
        );
    });

    el('btn-no-score').addEventListener('click', () => recordScore(null, 0));
    el('btn-new-round').addEventListener('click', async () => {
        await advanceRound();
        navStack = [];
        _activateView('view-home');
    });

    // Stats period buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderStats();
        });
    });

    // Settings
    el('btn-save-settings').addEventListener('click', async () => {
        state.players[0]      = el('input-p0-name').value.trim() || CONFIG.defaultPlayerNames[0];
        state.players[1]      = el('input-p1-name').value.trim() || CONFIG.defaultPlayerNames[1];
        state.sideNames[0]    = el('input-side-0').value.trim()  || CONFIG.defaultSideNames[0];
        state.sideNames[1]    = el('input-side-1').value.trim()  || CONFIG.defaultSideNames[1];
        state.playerColors[0] = el('input-color-0').value;
        state.playerColors[1] = el('input-color-1').value;
        await saveSettings();
        renderGame();
        const msg = el('settings-saved-msg');
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 2000);
    });

    el('btn-reset-data').addEventListener('click', async () => {
        if (!confirm('Reset all game data? This cannot be undone.')) return;
        await clearScoreHistory();
        state.players      = [...CONFIG.defaultPlayerNames];
        state.sideNames    = [...CONFIG.defaultSideNames];
        state.playerColors = [...CONFIG.defaultPlayerColors];
        state.scoreHistory = [];
        state.round = {
            number: 1, drawerIndex: 0, sidesAssigned: false,
            playerSides: [null, null], scored: false, result: null, startDate: todayStr(),
        };
        await Promise.all([saveSettings(), saveRound()]);
        renderGame();
        renderSettings();
    });
}


// ============================================================
// SECTION: MIDNIGHT AUTO-RESET SCHEDULER
// ============================================================

function scheduleMidnightCheck() {
    const now      = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntil  = midnight - now + 500;
    setTimeout(() => {
        checkAutoReset();
        scheduleMidnightCheck();
    }, msUntil);
}


// ============================================================
// SECTION: INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    checkAutoReset();
    renderGame();
    renderSettings();
    initEvents();
    subscribeToChanges();
    scheduleMidnightCheck();
    migrateLocalStorageGames(); // moves any locally-saved games into Supabase
});
