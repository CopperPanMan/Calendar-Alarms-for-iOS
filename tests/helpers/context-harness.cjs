const {Harness} = require('./calendar-engine-harness.cjs');

async function fire({task = false, min = 10, max = 45, retries = 2, meetings = [], location, focus = '', timing = {}, enabled = true} = {}) {
  const definition = {alarmName: 'Context', reschedMinutes: {min, max}, maxReschedules: retries,
    shortcutsOnTrigger: [{name: 'Allowed', input: []}], contextEnabled: enabled, ...timing,
    ...(task ? {taskIDs: ['work'], taskLoopMin: 20} : {}),
    ...(meetings.length ? {conflictingCalendars: ['Meetings']} : {}),
    ...(location ? {locationMode: 'whitelist', locations: [[0, 0, 50]]} : {}),
    ...(focus ? {silenceIfDriving: 'ON'} : {})};
  const h = new Harness([definition], {focus});
  const original = h.context.bind(h);
  h.context = input => {
    const context = original(input);
    const between = context.CalendarEvent.between;
    context.Calendar.forEvents = async () => [{title: 'Meetings'}];
    context.CalendarEvent.between = async (start, end, calendars) => calendars
      ? meetings.map(([s, e]) => ({startDate: new Date(h.start + s * 60000), endDate: new Date(h.start + e * 60000)}))
      : between();
    if (location) {
      context.Location = {setAccuracyToHundredMeters() {}, current: async () => ({latitude: location.lat, longitude: location.lon})};
      const timer = context.Timer;
      context.Timer = {schedule(seconds, repeat, callback) {
        return seconds >= 4.5 ? {invalidate() {}} : timer.schedule(seconds, repeat, callback);
      }};
    }
    return context;
  };
  await h.install();
  const plan = await h.engine();
  return {h, plan};
}

module.exports = {fire};
