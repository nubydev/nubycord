const analyticsState = {};

function init(userId) {
    analyticsState[userId] = {
        timeline: [],
        lastSnap: { sent: 0, errors: 0, blocked: 0 },
        intervalId: null,
    };
    return analyticsState[userId];
}

function startTracking(userId, getStatus) {
    let state = analyticsState[userId];
    if (!state) state = init(userId);
    if (state.intervalId) { clearInterval(state.intervalId); state.intervalId = null; }

    state.intervalId = setInterval(() => {
        const status = getStatus();
        if (!status) return;

        const sentNow    = status.messagesSent   || 0;
        const errorsNow  = status.errorsTotal    || 0;
        const blockedNow = status.blockedThisRun || 0;

        state.timeline.push({
            ts:      new Date().toISOString(),
            sent:    Math.max(0, sentNow    - state.lastSnap.sent),
            errors:  Math.max(0, errorsNow  - state.lastSnap.errors),
            blocked: Math.max(0, blockedNow - state.lastSnap.blocked),
        });

        if (state.timeline.length > 120) state.timeline.shift();
        state.lastSnap = { sent: sentNow, errors: errorsNow, blocked: blockedNow };
    }, 60000);
}

function stopTracking(userId) {
    const state = analyticsState[userId];
    if (state?.intervalId) { clearInterval(state.intervalId); state.intervalId = null; }
}

function getTimeline(userId) {
    return analyticsState[userId]?.timeline || [];
}

function getTotals(userId) {
    return getTimeline(userId).reduce((acc, s) => ({
        sent:    acc.sent    + (s.sent    || 0),
        errors:  acc.errors  + (s.errors  || 0),
        blocked: acc.blocked + (s.blocked || 0),
    }), { sent: 0, errors: 0, blocked: 0 });
}

function reset(userId) {
    stopTracking(userId);
    init(userId);
}

module.exports = { init, startTracking, stopTracking, getTimeline, getTotals, reset };
