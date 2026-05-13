// ============================================================
// WIADUKT — GAME SCRIPT
// ============================================================


// === CUSTOMIZE BELOW ===
const CONFIG = {
    defaultPlayerNames:  ['Player 1', 'Player 2'],
    defaultSideNames:    ['Left', 'Right'],
    defaultPlayerColors: ['#3b82f6', '#e11d48'], // blue, rose
    storageKey:          'wiadukt_v1',
};
// === END CUSTOM SECTION ===


// ============================================================
// SECTION: UTILITIES
// ============================================================

function el(id) {
    return document.getElementById(id);
}

function show(element) {
    element.classList.remove('hidden');
}

function hide(element) {
    element.classList.add('hidden');
}

// Returns today as YYYY-MM-DD in local time
function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Returns '#000000' or '#ffffff' depending on whether the hex colour is light or dark
function contrastColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Perceived luminance (standard coefficients)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 160 ? '#000000' : '#ffffff';
}

// Formats a YYYY-MM-DD string to a readable local date
function fmtDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}


// ============================================================
// SECTION: STATE MANAGEMENT
// ============================================================

function defaultState() {
    return {
        players:      [...CONFIG.defaultPlayerNames],
        sideNames:    [...CONFIG.defaultSideNames],
        playerColors: [...CONFIG.defaultPlayerColors],
        round: {
            number:        1,
            drawerIndex:   0,           // 0 = Player 1 draws, 1 = Player 2 draws
            sidesAssigned: false,
            playerSides:   [null, null], // index into sideNames[] per player
            scored:        false,
            result:        null,         // { winnerIndex, points } or null
            startDate:     todayStr(),
        },
        scoreHistory: [],
        // scoreHistory items: { date: 'YYYY-MM-DD', winnerIndex: 0|1, points: 1|0.5 }
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        if (raw) {
            const saved = JSON.parse(raw);
            // Patch in any fields added after the state was first saved
            if (!saved.playerColors) saved.playerColors = [...CONFIG.defaultPlayerColors];
            return saved;
        }
    } catch (_) { /* fall through to default */ }
    return defaultState();
}

function saveState() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
}

let state = loadState();


// ============================================================
// SECTION: ROUND MANAGEMENT
// ============================================================

// Called on page load to handle rounds that missed a midnight rollover
function checkAutoReset() {
    if (state.round.startDate && state.round.startDate !== todayStr()) {
        advanceRound();
    }
}

// End the current round and prepare the next one
function advanceRound() {
    state.round = {
        number:        state.round.number + 1,
        drawerIndex:   1 - state.round.drawerIndex, // flip who draws
        sidesAssigned: false,
        playerSides:   [null, null],
        scored:        false,
        result:        null,
        startDate:     todayStr(),
    };
    saveState();
    renderGame();
}

// Randomly assign sides to both players for this round
function drawSides() {
    const di    = state.round.drawerIndex;
    const drawn = Math.random() < 0.5 ? 0 : 1; // random side for the drawer
    state.round.playerSides[di]     = drawn;
    state.round.playerSides[1 - di] = 1 - drawn; // other player gets the other side
    state.round.sidesAssigned = true;
    saveState();
    renderGame();
}

// Record the outcome after the train passes
// winnerIndex: 0 or 1 (the player whose assigned side the train came from)
// points: 1 (on viaduct) or 0.5 (near viaduct) or 0 (no score)
function recordScore(winnerIndex, points) {
    if (state.round.scored) return;

    if (winnerIndex !== null && points > 0) {
        state.scoreHistory.push({
            date:        todayStr(),
            winnerIndex,
            points,
        });
        state.round.result = { winnerIndex, points };
    } else {
        state.round.result = null; // no score this round
    }

    state.round.scored = true;
    saveState();
    renderGame();
}


// ============================================================
// SECTION: STATS CALCULATION
// ============================================================

// Returns the Monday of the week containing dateStr (YYYY-MM-DD)
function weekStart(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day  = date.getDay();             // 0 = Sunday
    date.setDate(date.getDate() - ((day + 6) % 7)); // shift to Monday
    const wy = date.getFullYear();
    const wm = String(date.getMonth() + 1).padStart(2, '0');
    const wd = String(date.getDate()).padStart(2, '0');
    return `${wy}-${wm}-${wd}`;
}

function monthKey(dateStr) { return dateStr.slice(0, 7); } // YYYY-MM
function yearKey(dateStr)  { return dateStr.slice(0, 4); } // YYYY

// Aggregate scoreHistory into { periodKey: [p0total, p1total] }
function aggregateByPeriod(period) {
    const keyFn = period === 'weekly'  ? weekStart
                : period === 'monthly' ? monthKey
                : yearKey;

    const map = {};
    for (const entry of state.scoreHistory) {
        const k = keyFn(entry.date);
        if (!map[k]) map[k] = [0, 0];
        map[k][entry.winnerIndex] += entry.points;
    }
    return map;
}

// Sum all scores for a quick all-time total
function allTimeTotal() {
    const totals = [0, 0];
    for (const entry of state.scoreHistory) {
        totals[entry.winnerIndex] += entry.points;
    }
    return totals;
}

// Human-readable label for a period key
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
    return key; // year is its own label
}


// ============================================================
// SECTION: RENDERING
// ============================================================

function renderGame() {
    const { round, players, sideNames } = state;

    // Round info bar
    el('round-number').textContent = round.number;
    el('round-date').textContent   = fmtDate(round.startDate);

    const phaseDraw   = el('phase-draw');
    const phaseActive = el('phase-active');

    if (!round.sidesAssigned) {
        // === DRAW PHASE ===
        show(phaseDraw);
        hide(phaseActive);
        el('drawer-prompt').textContent =
            `${players[round.drawerIndex]} draws a side this round.`;
    } else {
        // === ACTIVE PHASE ===
        hide(phaseDraw);
        show(phaseActive);

        // Player side cards
        el('p0-name-display').textContent = players[0];
        el('p1-name-display').textContent = players[1];
        el('p0-side-badge').textContent   = sideNames[round.playerSides[0]];
        el('p1-side-badge').textContent   = sideNames[round.playerSides[1]];

        const scoringSection = el('scoring-section');
        const scoreResult    = el('score-result');
        const totalsDiv      = el('current-totals');

        // New Round is only available once a result has been submitted
        round.scored ? show(el('btn-new-round')) : hide(el('btn-new-round'));

        // Apply player colours to their score buttons, with auto text contrast
        [0, 1].forEach(i => {
            const bg   = state.playerColors[i];
            const text = contrastColor(bg);
            document.querySelectorAll(`.score-btn[data-player="${i}"]`).forEach(btn => {
                btn.style.background = bg;
                btn.style.color      = text;
            });
        });

        if (!round.scored) {
            // Scoring controls visible
            show(scoringSection);
            hide(scoreResult);
            totalsDiv.innerHTML = '';
            el('score-p0-name').textContent = players[0];
            el('score-p1-name').textContent = players[1];
        } else {
            // Scoring done — show result and totals
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

            // All-time totals
            const totals = allTimeTotal();
            totalsDiv.innerHTML = `
                <div class="totals-card">
                    <div class="totals-title">All-time totals</div>
                    <div class="total-row">
                        <span class="total-name">${players[0]}</span>
                        <span class="total-score">${totals[0] % 1 === 0 ? totals[0] : totals[0].toFixed(1)}</span>
                    </div>
                    <div class="total-row">
                        <span class="total-name">${players[1]}</span>
                        <span class="total-score">${totals[1] % 1 === 0 ? totals[1] : totals[1].toFixed(1)}</span>
                    </div>
                </div>
            `;
        }
    }
}

function renderStats() {
    const period   = document.querySelector('.period-btn.active')?.dataset.period || 'weekly';
    const groups   = aggregateByPeriod(period);
    const keys     = Object.keys(groups).sort().reverse(); // most recent first
    const display  = el('stats-display');

    if (keys.length === 0) {
        display.innerHTML = '<p class="no-data">No scores recorded yet.</p>';
        return;
    }

    const { players } = state;
    display.innerHTML = keys.map(k => {
        const [p0, p1] = groups[k];
        const fmtPts = n => n % 1 === 0 ? String(n) : n.toFixed(1);
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
    el('input-p0-name').value  = state.players[0];
    el('input-p1-name').value  = state.players[1];
    el('input-side-0').value   = state.sideNames[0];
    el('input-side-1').value   = state.sideNames[1];
    el('input-color-0').value  = state.playerColors[0];
    el('input-color-1').value  = state.playerColors[1];
}


// ============================================================
// SECTION: EVENT HANDLING
// ============================================================

function initEvents() {
    // --- Tab navigation ---
    function switchTo(viewId) {
        const currentView = document.querySelector('.view:not(.hidden)');
        const leavingGame = currentView?.id === 'view-game' && viewId !== 'view-game';

        if (leavingGame && state.round.sidesAssigned && !state.round.scored) {
            // Block navigation — result not yet submitted
            showNavBlockedMsg();
            return;
        }

        if (leavingGame && state.round.scored) {
            // Result submitted — auto-advance the round on the way out
            advanceRound();
        }

        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === viewId);
        });
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        el(viewId).classList.remove('hidden');
        if (viewId === 'view-stats') renderStats();
    }

    function showNavBlockedMsg() {
        let msg = el('nav-blocked-msg');
        if (!msg) return;
        msg.classList.remove('hidden');
        clearTimeout(msg._hideTimer);
        msg._hideTimer = setTimeout(() => msg.classList.add('hidden'), 2500);
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTo(btn.dataset.view));
    });

    // --- Home nav cards ---
    document.querySelectorAll('.home-nav-card').forEach(card => {
        card.addEventListener('click', () => switchTo(card.dataset.view));
    });

    // --- Back to home (bypasses nav guard, preserves round state) ---
    el('btn-back-home').addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === 'view-home');
        });
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        el('view-home').classList.remove('hidden');
    });

    // --- Draw sides ---
    el('btn-draw').addEventListener('click', drawSides);

    // --- Score buttons (event delegation on the scoring section) ---
    el('scoring-section').addEventListener('click', e => {
        const btn = e.target.closest('[data-player][data-points]');
        if (!btn) return;
        recordScore(
            parseInt(btn.dataset.player, 10),
            parseFloat(btn.dataset.points)
        );
    });

    // --- No score ---
    el('btn-no-score').addEventListener('click', () => recordScore(null, 0));

    // --- New round ---
    el('btn-new-round').addEventListener('click', advanceRound);

    // --- Period buttons (stats view) ---
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderStats();
        });
    });

    // --- Save settings ---
    el('btn-save-settings').addEventListener('click', () => {
        state.players[0]      = el('input-p0-name').value.trim() || CONFIG.defaultPlayerNames[0];
        state.players[1]      = el('input-p1-name').value.trim() || CONFIG.defaultPlayerNames[1];
        state.sideNames[0]    = el('input-side-0').value.trim()  || CONFIG.defaultSideNames[0];
        state.sideNames[1]    = el('input-side-1').value.trim()  || CONFIG.defaultSideNames[1];
        state.playerColors[0] = el('input-color-0').value;
        state.playerColors[1] = el('input-color-1').value;
        saveState();
        renderGame();
        // Brief confirmation flash
        const msg = el('settings-saved-msg');
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 2000);
    });

    // --- Reset all data ---
    el('btn-reset-data').addEventListener('click', () => {
        if (confirm('Reset all game data? This cannot be undone.')) {
            state = defaultState();
            saveState();
            renderGame();
            renderSettings();
        }
    });
}


// ============================================================
// SECTION: MIDNIGHT AUTO-RESET SCHEDULER
// ============================================================

function scheduleMidnightCheck() {
    const now      = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntil  = midnight - now + 500; // +500 ms buffer past midnight
    setTimeout(() => {
        checkAutoReset();
        scheduleMidnightCheck(); // reschedule for the next midnight
    }, msUntil);
}


// ============================================================
// SECTION: INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    checkAutoReset();   // handle any missed midnight rollovers
    renderGame();
    renderSettings();
    initEvents();
    scheduleMidnightCheck();
});
