/* Pure alarm-model helpers shared by the editor and its automated tests. */
(function exposeAlarmConfig(globalScope) {
  const defaultAlarm = () => ({
    alarmName: 'New Alarm',
    status: 'ON',
    offsetMin: 0,
    reference: 'start',
    qrCodeID: '',
    qrSoundPath: '',
    qrSoundLen: 2.13,
    qrVol: 50,
    qrShortcutsOnScan: [],
    shortcutsOnTrigger: [],
    silenceAlarm: false,
    locationMode: 'off',
    locations: [],
    silenceIfDriving: 'OFF',
    conflictingCalendars: [],
    reschedMinutes: { min: 10, max: 45 },
    maxReschedules: 2,
    taskIDs: [],
    taskLoopMin: 30,
    checkTasksFirstTime: true,
  });

  function normalizeShortcut(item) {
    return {
      name: typeof item?.name === 'string' ? item.name : '',
      input: Array.isArray(item?.input)
        ? item.input.map((value) => ({
            type: typeof value === 'number' ? 'number' : 'text',
            value: value ?? '',
          }))
        : [],
    };
  }

  function finiteNumber(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function normalizeAlarm(raw = {}) {
    const alarm = { ...defaultAlarm(), ...(raw && typeof raw === 'object' ? raw : {}) };
    alarm.qrShortcutsOnScan = Array.isArray(alarm.qrShortcutsOnScan)
      ? alarm.qrShortcutsOnScan.map(normalizeShortcut)
      : [];
    alarm.shortcutsOnTrigger = Array.isArray(alarm.shortcutsOnTrigger)
      ? alarm.shortcutsOnTrigger.map(normalizeShortcut)
      : [];
    alarm.locations = Array.isArray(alarm.locations)
      ? alarm.locations.map((loc) => {
          const values = Array.isArray(loc)
            ? { lat: loc[0], lon: loc[1], radius: loc[2], name: loc[3] }
            : loc || {};
          return {
            lat: finiteNumber(values.lat, 0),
            lon: finiteNumber(values.lon, 0),
            radius: finiteNumber(values.radius, 50),
            name: typeof values.name === 'string' ? values.name : '',
          };
        })
      : [];
    alarm.conflictingCalendars = Array.isArray(alarm.conflictingCalendars)
      ? alarm.conflictingCalendars.map((name) => String(name))
      : [];
    alarm.taskIDs = Array.isArray(alarm.taskIDs) ? alarm.taskIDs.map((id) => String(id)) : [];
    alarm.taskLoopMin = finiteNumber(alarm.taskLoopMin, 30);
    alarm.checkTasksFirstTime = typeof alarm.checkTasksFirstTime === 'boolean' ? alarm.checkTasksFirstTime : true;
    return alarm;
  }

  function cleanShortcut(shortcut) {
    return {
      name: String(shortcut.name || '').trim(),
      input: shortcut.input
        .filter((entry) => String(entry.value).trim() !== '')
        .map((entry) => (entry.type === 'number' ? Number(entry.value) : String(entry.value))),
    };
  }

  function cleanAlarm(alarm) {
    const cleaned = {
      alarmName: String(alarm.alarmName ?? '').trim() || 'Alarm',
      status: String(alarm.status ?? 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON',
      offsetMin: /^[-+]?\d+$/.test(String(alarm.offsetMin)) ? Number(alarm.offsetMin) : String(alarm.offsetMin || '0'),
      reference: String(alarm.reference ?? 'start').toLowerCase() === 'end' ? 'end' : 'start',
    };

    if (alarm.qrCodeID?.trim()) cleaned.qrCodeID = alarm.qrCodeID.trim();
    if (alarm.qrSoundPath?.trim()) cleaned.qrSoundPath = alarm.qrSoundPath.trim();
    if (Number.isFinite(Number(alarm.qrSoundLen)) && Number(alarm.qrSoundLen) > 0) cleaned.qrSoundLen = Number(alarm.qrSoundLen);
    if (Number.isFinite(Number(alarm.qrVol))) cleaned.qrVol = Number(alarm.qrVol);

    const qrShortcuts = alarm.qrShortcutsOnScan.map(cleanShortcut).filter((item) => item.name);
    if (qrShortcuts.length) cleaned.qrShortcutsOnScan = qrShortcuts;
    const triggerShortcuts = alarm.shortcutsOnTrigger.map(cleanShortcut).filter((item) => item.name);
    if (triggerShortcuts.length) cleaned.shortcutsOnTrigger = triggerShortcuts;

    if (alarm.silenceAlarm) cleaned.silenceAlarm = true;
    if (alarm.locationMode && alarm.locationMode !== 'off') cleaned.locationMode = alarm.locationMode;
    const locations = alarm.locations
      .filter((loc) => Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon)) && Number.isFinite(Number(loc.radius)))
      .map((loc) => [Number(loc.lat), Number(loc.lon), Number(loc.radius)]);
    if (locations.length) cleaned.locations = locations;
    if (alarm.silenceIfDriving === 'ON') cleaned.silenceIfDriving = 'ON';

    const conflicting = alarm.conflictingCalendars.map((name) => name.trim()).filter(Boolean);
    if (conflicting.length) cleaned.conflictingCalendars = conflicting;
    cleaned.reschedMinutes = alarm.reschedType === 'fixed'
      ? Number(alarm.reschedFixed || 0)
      : { min: Number(alarm.reschedMin || 0), max: Number(alarm.reschedMax || 45) };
    if (Number.isFinite(Number(alarm.maxReschedules))) cleaned.maxReschedules = Number(alarm.maxReschedules);
    cleaned.taskIDs = Array.isArray(alarm.taskIDs) ? alarm.taskIDs.map((id) => String(id).trim()).filter(Boolean) : [];
    cleaned.taskLoopMin = Number.isFinite(Number(alarm.taskLoopMin)) ? Number(alarm.taskLoopMin) : 30;
    cleaned.checkTasksFirstTime = typeof alarm.checkTasksFirstTime === 'boolean' ? alarm.checkTasksFirstTime : true;
    return cleaned;
  }

  function moveItem(list, fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return false;
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item);
    return true;
  }

  const api = { defaultAlarm, normalizeShortcut, normalizeAlarm, cleanShortcut, cleanAlarm, moveItem };
  globalScope.AlarmConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
