const fs = require('fs');
const UD = require('./userdata');

// sequenceWatchers[userId] = Map<memberId, { sequenceId, nextStep, lastSentAt }>
const sequenceWatchers = {};

function getWatcher(userId) {
    if (!sequenceWatchers[userId]) sequenceWatchers[userId] = new Map();
    return sequenceWatchers[userId];
}

function loadSequences(userId) {
    const fp = UD.userFile(userId, 'sequences.json');
    if (!fs.existsSync(fp)) return [];
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return []; }
}

function saveSequences(userId, sequences) {
    fs.writeFileSync(UD.userFile(userId, 'sequences.json'), JSON.stringify(sequences, null, 2));
}

function watchForReply(userId, memberId, sequenceId) {
    if (!sequenceId) return;
    const watcher = getWatcher(userId);
    if (!watcher.has(memberId)) {
        watcher.set(memberId, { sequenceId, nextStep: 0, lastSentAt: Date.now() });
    }
}

function onReplyReceived(userId, senderId) {
    const watcher = getWatcher(userId);
    const state = watcher.get(senderId);
    if (!state) return null;

    const sequences = loadSequences(userId);
    const seq = sequences.find(s => s.id === state.sequenceId && s.enabled !== false);
    if (!seq || !seq.steps || !seq.steps.length) {
        watcher.delete(senderId);
        return null;
    }

    const step = seq.steps[state.nextStep];
    if (!step) {
        watcher.delete(senderId);
        return null;
    }

    state.nextStep++;
    state.lastSentAt = Date.now();
    watcher.set(senderId, state);

    return {
        message: step.message,
        delayMs: step.delayMs || 3000,
        stepsRemaining: seq.steps.length - state.nextStep,
    };
}

function getWatcherStats(userId) {
    const watcher = getWatcher(userId);
    return {
        watching: watcher.size,
        members: Array.from(watcher.entries()).map(([id, s]) => ({
            id,
            sequenceId: s.sequenceId,
            nextStep: s.nextStep,
            lastSentAt: s.lastSentAt,
        })),
    };
}

function clearWatcher(userId) {
    if (sequenceWatchers[userId]) sequenceWatchers[userId].clear();
}

module.exports = { loadSequences, saveSequences, watchForReply, onReplyReceived, getWatcherStats, clearWatcher };
