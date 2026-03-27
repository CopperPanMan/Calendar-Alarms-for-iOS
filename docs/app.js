const alarmsContainer = document.getElementById('alarmsContainer');
const alarmTemplate = document.getElementById('alarmCardTemplate');
const jsonInput = document.getElementById('jsonInput');
const jsonOutput = document.getElementById('jsonOutput');
const loadStatus = document.getElementById('loadStatus');
const copyStatus = document.getElementById('copyStatus');
const emptyState = document.getElementById('emptyState');

const defaultAlarm = () => ({
  alarmName: 'New Alarm',
  status: 'ON',
  offsetMin: 0,
  reference: 'start',
  qrCodeID: '',
  qrSoundPath: '',
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
});

let alarms = [];

function parseMaybeJson(value) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid JSON in one of the advanced text areas.');
  }
}

function cleanAlarm(alarm) {
  const cleaned = {
    alarmName: String(alarm.alarmName ?? '').trim() || 'Alarm',
    status: String(alarm.status ?? 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON',
    offsetMin: typeof alarm.offsetMin === 'number' ? alarm.offsetMin : alarm.offsetMin ?? 0,
    reference: String(alarm.reference ?? 'start').toLowerCase() === 'end' ? 'end' : 'start',
  };

  const optionalKeys = [
    'qrCodeID',
    'qrSoundPath',
    'qrVol',
    'qrShortcutsOnScan',
    'shortcutsOnTrigger',
    'silenceAlarm',
    'locationMode',
    'locations',
    'silenceIfDriving',
    'conflictingCalendars',
    'reschedMinutes',
    'maxReschedules',
  ];

  for (const key of optionalKeys) {
    const value = alarm[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }

  return cleaned;
}

function setStatus(el, message, type = '') {
  el.textContent = message;
  el.classList.remove('error', 'success');
  if (type) el.classList.add(type);
}

function render() {
  alarmsContainer.innerHTML = '';
  emptyState.style.display = alarms.length ? 'none' : 'block';

  alarms.forEach((alarm, index) => {
    const fragment = alarmTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.alarm-card');
    const title = fragment.querySelector('.alarm-title');
    title.textContent = `Alarm ${index + 1}`;

    const fieldMap = {
      alarmName: alarm.alarmName ?? '',
      status: alarm.status ?? 'ON',
      offsetMin: alarm.offsetMin ?? 0,
      reference: alarm.reference ?? 'start',
      qrCodeID: alarm.qrCodeID ?? '',
      qrSoundPath: alarm.qrSoundPath ?? '',
      qrVol: alarm.qrVol ?? 50,
      silenceAlarm: !!alarm.silenceAlarm,
      locationMode: alarm.locationMode ?? 'off',
      silenceIfDriving: alarm.silenceIfDriving ?? 'OFF',
      maxReschedules: alarm.maxReschedules ?? 2,
      qrShortcutsOnScan: JSON.stringify(alarm.qrShortcutsOnScan ?? [], null, 2),
      shortcutsOnTrigger: JSON.stringify(alarm.shortcutsOnTrigger ?? [], null, 2),
      locations: JSON.stringify(alarm.locations ?? [], null, 2),
      conflictingCalendars: JSON.stringify(alarm.conflictingCalendars ?? [], null, 2),
      reschedMinutes: JSON.stringify(alarm.reschedMinutes ?? { min: 10, max: 45 }, null, 2),
    };

    card.querySelectorAll('[data-field]').forEach((input) => {
      const key = input.dataset.field;
      if (input.type === 'checkbox') input.checked = fieldMap[key];
      else input.value = fieldMap[key];

      input.addEventListener('input', () => {
        try {
          if (input.type === 'checkbox') {
            alarms[index][key] = input.checked;
          } else if (['qrShortcutsOnScan', 'shortcutsOnTrigger', 'locations', 'conflictingCalendars', 'reschedMinutes'].includes(key)) {
            const parsed = parseMaybeJson(input.value);
            if (parsed === undefined) delete alarms[index][key];
            else alarms[index][key] = parsed;
          } else if (['qrVol', 'maxReschedules'].includes(key)) {
            if (input.value === '') delete alarms[index][key];
            else alarms[index][key] = Number(input.value);
          } else if (key === 'offsetMin') {
            const value = input.value.trim();
            if (/^-?\d+(\.\d+)?$/.test(value)) alarms[index][key] = Number(value);
            else alarms[index][key] = value;
          } else {
            alarms[index][key] = input.value;
          }
          updateOutput();
          setStatus(loadStatus, '');
        } catch (error) {
          setStatus(loadStatus, error.message, 'error');
        }
      });
    });

    fragment.querySelector('.delete-alarm-btn').addEventListener('click', () => {
      alarms.splice(index, 1);
      render();
      updateOutput();
    });

    alarmsContainer.appendChild(fragment);
  });
}

function updateOutput() {
  const cleaned = alarms.map(cleanAlarm);
  jsonOutput.value = JSON.stringify(cleaned, null, 2);
}

function loadFromInput() {
  setStatus(loadStatus, '');
  try {
    const raw = jsonInput.value.trim();
    if (!raw) {
      setStatus(loadStatus, 'Paste JSON first.', 'error');
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      setStatus(loadStatus, 'JSON must be an array of alarm objects.', 'error');
      return;
    }
    alarms = parsed.map((alarm) => ({ ...defaultAlarm(), ...alarm }));
    render();
    updateOutput();
    setStatus(loadStatus, `Loaded ${alarms.length} alarm(s).`, 'success');
  } catch (error) {
    setStatus(loadStatus, `Could not parse JSON: ${error.message}`, 'error');
  }
}

async function copyOutput() {
  updateOutput();
  try {
    await navigator.clipboard.writeText(jsonOutput.value);
    setStatus(copyStatus, 'JSON copied to clipboard.', 'success');
  } catch {
    jsonOutput.focus();
    jsonOutput.select();
    setStatus(copyStatus, 'Clipboard access failed. Output is selected so you can copy manually.', 'error');
  }
}

function addAlarm() {
  alarms.push(defaultAlarm());
  render();
  updateOutput();
}

document.getElementById('newConfigBtn').addEventListener('click', () => {
  alarms = [];
  jsonInput.value = '';
  setStatus(loadStatus, 'Started a fresh configuration.', 'success');
  render();
  updateOutput();
});

document.getElementById('loadJsonBtn').addEventListener('click', loadFromInput);
document.getElementById('addAlarmBtn').addEventListener('click', addAlarm);
document.getElementById('copyOutputBtn').addEventListener('click', copyOutput);

addAlarm();
