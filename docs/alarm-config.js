/* Pure alarm-model helpers shared by the editor and its automated tests. */
(function exposeAlarmConfig(globalScope) {
  const ACTIONS_SHORTCUT_NAME = 'Calendar Alarms Actions';
  const PUBLIC_ACTIONS = ['notification', 'timer', 'focus', 'display', 'open', 'openhabits_reminder', 'audio', 'cue'];
  const SOUND_FOLDER = 'Alarm Tones/';

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
    const shortcut = {
      name: typeof item?.name === 'string' ? item.name : '',
      input: Array.isArray(item?.input)
        ? item.input.map((value) => ({
            type: typeof value === 'number' ? 'number' : 'text',
            value: value ?? '',
          }))
        : [],
    };
    if (shortcut.name === ACTIONS_SHORTCUT_NAME && shortcut.input.length === 1 && shortcut.input[0].type === 'text') {
      try {
        const action = JSON.parse(String(shortcut.input[0].value));
        if (action && !Array.isArray(action) && PUBLIC_ACTIONS.includes(action.action)) {
          shortcut.editorType = action.action;
          shortcut.action = { ...defaultAction(action.action), ...action };
        }
      } catch (_) {
        // Invalid action JSON remains editable as a custom Shortcut invocation.
      }
    }
    shortcut.editorType ||= 'custom';
    return shortcut;
  }

  function defaultAction(action) {
    switch (action) {
      case 'notification': return { action, message: '', mode: 'show' };
      case 'timer': return { action, operation: 'start', minutes: 15 };
      case 'focus': return { action, name: '', state: 'on' };
      case 'display': return { action, operation: 'color_filters', state: 'on' };
      case 'open': return { action, operation: 'app', appName: '' };
      case 'openhabits_reminder': return { action, metricIDs: [''], mode: 'show' };
      case 'audio': return { action, operation: 'volume', percent: 50 };
      case 'cue': return { action, operation: 'haptic' };
      default: return null;
    }
  }

  function newActionShortcut(action = 'notification') {
    return {
      name: ACTIONS_SHORTCUT_NAME,
      input: [],
      editorType: action,
      action: defaultAction(action),
    };
  }

  function finiteNumber(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function normalizeSoundPath(value) {
    const path = String(value ?? '').trim().replace(/\\/g, '/');
    if (!path) return '';
    const marker = path.toLowerCase().lastIndexOf('/alarm tones/');
    if (marker >= 0) return `${SOUND_FOLDER}${path.slice(marker + '/alarm tones/'.length)}`;
    if (path.toLowerCase().startsWith(SOUND_FOLDER.toLowerCase())) return `${SOUND_FOLDER}${path.slice(SOUND_FOLDER.length)}`;
    return `${SOUND_FOLDER}${path.replace(/^\/+/, '')}`;
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
    if (PUBLIC_ACTIONS.includes(shortcut.editorType) && shortcut.action) {
      const action = { ...shortcut.action };
      if (action.action === 'cue' && action.operation === 'sound' && action.file) {
        action.file = normalizeSoundPath(action.file);
      }
      return {
        name: ACTIONS_SHORTCUT_NAME,
        input: [JSON.stringify(action)],
      };
    }
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
    if (alarm.qrSoundPath?.trim()) cleaned.qrSoundPath = normalizeSoundPath(alarm.qrSoundPath);
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

  function duplicateAlarm(alarm) {
    const duplicate = normalizeAlarm(JSON.parse(JSON.stringify(alarm)));
    if (duplicate.alarmName) duplicate.alarmName = `${duplicate.alarmName} Copy`;
    return duplicate;
  }

  function extractAlarmArray(text) {
    if (!text || typeof text !== 'string') return null;

    let start = text.indexOf('[');
    while (start !== -1) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (character === '\\') escaped = true;
          else if (character === '"') inString = false;
          continue;
        }
        if (character === '"') inString = true;
        else if (character === '[') depth += 1;
        else if (character === ']') {
          depth -= 1;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(text.slice(start, index + 1));
              if (Array.isArray(parsed) && (parsed.length === 0 || parsed.some((item) => item && typeof item === 'object' && !Array.isArray(item)))) {
                return parsed;
              }
            } catch {
              // Keep looking for an alarm array later in the notes.
            }
            break;
          }
        }
      }
      start = text.indexOf('[', start + 1);
    }
    return null;
  }

  function formatCalendarNotes(alarms, editorUrl) {
    return `${editorUrl}\n\n${JSON.stringify(alarms, null, 2)}\n\n${editorUrl}`;
  }

  const api = {
    ACTIONS_SHORTCUT_NAME,
    PUBLIC_ACTIONS,
    defaultAlarm,
    defaultAction,
    newActionShortcut,
    normalizeShortcut,
    normalizeAlarm,
    cleanShortcut,
    cleanAlarm,
    moveItem,
    duplicateAlarm,
    extractAlarmArray,
    formatCalendarNotes,
    normalizeSoundPath,
  };
  globalScope.AlarmConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
