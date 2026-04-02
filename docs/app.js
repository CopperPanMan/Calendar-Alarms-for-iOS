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
  taskIDs: [],
  taskLoopMin: 30,
  checkTasksFirstTime: true,
});

let alarms = [];
let dragFromIndex = null;
let openAdvancedByIndex = [];

function preserveAdvancedState() {
  const cards = Array.from(alarmsContainer.querySelectorAll('.alarm-card'));
  openAdvancedByIndex = cards.map((card) => {
    const advancedToggle = card.querySelector('details');
    return !!advancedToggle?.open;
  });
}

function setStatus(el, message, type = '') {
  el.textContent = message;
  el.classList.remove('error', 'success');
  if (type) el.classList.add(type);
}

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

function normalizeAlarm(raw = {}) {
  const alarm = { ...defaultAlarm(), ...raw };
  alarm.qrShortcutsOnScan = Array.isArray(alarm.qrShortcutsOnScan)
    ? alarm.qrShortcutsOnScan.map(normalizeShortcut)
    : [];
  alarm.shortcutsOnTrigger = Array.isArray(alarm.shortcutsOnTrigger)
    ? alarm.shortcutsOnTrigger.map(normalizeShortcut)
    : [];
  alarm.locations = Array.isArray(alarm.locations)
    ? alarm.locations.map((loc) => {
        if (Array.isArray(loc)) {
          return {
            lat: Number(loc[0]) || 0,
            lon: Number(loc[1]) || 0,
            radius: Number(loc[2]) || 50,
            name: typeof loc[3] === 'string' ? loc[3] : '',
          };
        }
        return {
          lat: Number(loc?.lat) || 0,
          lon: Number(loc?.lon) || 0,
          radius: Number(loc?.radius) || 50,
          name: typeof loc?.name === 'string' ? loc.name : '',
        };
      })
    : [];
  alarm.conflictingCalendars = Array.isArray(alarm.conflictingCalendars)
    ? alarm.conflictingCalendars.map((name) => String(name))
    : [];
  alarm.taskIDs = Array.isArray(alarm.taskIDs) ? alarm.taskIDs.map((id) => String(id)) : [];
  alarm.taskLoopMin = Number.isFinite(Number(alarm.taskLoopMin)) ? Number(alarm.taskLoopMin) : 30;
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
  if (Number.isFinite(Number(alarm.qrVol))) cleaned.qrVol = Number(alarm.qrVol);

  const qrShortcuts = alarm.qrShortcutsOnScan.map(cleanShortcut).filter((item) => item.name);
  if (qrShortcuts.length) cleaned.qrShortcutsOnScan = qrShortcuts;

  const triggerShortcuts = alarm.shortcutsOnTrigger.map(cleanShortcut).filter((item) => item.name);
  if (triggerShortcuts.length) cleaned.shortcutsOnTrigger = triggerShortcuts;

  if (alarm.silenceAlarm) cleaned.silenceAlarm = true;
  if (alarm.locationMode && alarm.locationMode !== 'off') cleaned.locationMode = alarm.locationMode;

  const locations = alarm.locations
    .filter((loc) => Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon)) && Number.isFinite(Number(loc.radius)))
    .map((loc) => [Number(loc.lat), Number(loc.lon), Number(loc.radius), String(loc.name || '')]);
  if (locations.length) cleaned.locations = locations;

  if (alarm.silenceIfDriving === 'ON') cleaned.silenceIfDriving = 'ON';

  const conflicting = alarm.conflictingCalendars.map((name) => name.trim()).filter(Boolean);
  if (conflicting.length) cleaned.conflictingCalendars = conflicting;

  if (alarm.reschedType === 'fixed') {
    cleaned.reschedMinutes = Number(alarm.reschedFixed || 0);
  } else {
    cleaned.reschedMinutes = {
      min: Number(alarm.reschedMin || 0),
      max: Number(alarm.reschedMax || 45),
    };
  }

  if (Number.isFinite(Number(alarm.maxReschedules))) cleaned.maxReschedules = Number(alarm.maxReschedules);
  cleaned.taskIDs = Array.isArray(alarm.taskIDs) ? alarm.taskIDs.map((id) => String(id).trim()).filter(Boolean) : [];
  cleaned.taskLoopMin = Number.isFinite(Number(alarm.taskLoopMin)) ? Number(alarm.taskLoopMin) : 30;
  cleaned.checkTasksFirstTime = typeof alarm.checkTasksFirstTime === 'boolean' ? alarm.checkTasksFirstTime : true;

  return cleaned;
}

function moveItem(list, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= list.length) return;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
}

function renderShortcutList(container, alarm, key, alarmIndex) {
  container.innerHTML = '';
  const list = alarm[key];
  list.forEach((item, listIndex) => {
    const block = document.createElement('div');
    block.className = 'sub-card';
    block.innerHTML = `
      <div class="sub-card-header">
        <strong>Shortcut ${listIndex + 1}</strong>
        <div class="button-row">
          <button type="button" class="btn secondary small" data-action="up">↑</button>
          <button type="button" class="btn secondary small" data-action="down">↓</button>
          <button type="button" class="btn danger small" data-action="delete">Delete</button>
        </div>
      </div>
      <label>Shortcut Name<input type="text" data-shortcut-field="name" required /></label>
      <div class="list-block" data-input-list></div>
      <button type="button" class="btn small" data-action="add-input">+ Add Input</button>
      <span class="help helper-inline" data-tip="This input will be passed into this configured shortcut.">?</span>
    `;

    const nameInput = block.querySelector('[data-shortcut-field="name"]');
    nameInput.value = item.name;
    nameInput.addEventListener('input', () => {
      alarm[key][listIndex].name = nameInput.value;
      updateOutput();
    });

    const inputListContainer = block.querySelector('[data-input-list]');
    item.input.forEach((entry, inputIndex) => {
      const row = document.createElement('div');
      row.className = 'inline-row';
      row.innerHTML = `
        <select data-field="type"><option value="text">Text</option><option value="number">Number</option></select>
        <input data-field="value" type="text" />
        <button type="button" class="btn danger small" data-action="delete-input">x</button>
      `;
      const typeSelect = row.querySelector('[data-field="type"]');
      const valueInput = row.querySelector('[data-field="value"]');
      typeSelect.value = entry.type;
      valueInput.value = entry.value;
      valueInput.type = entry.type === 'number' ? 'number' : 'text';

      typeSelect.addEventListener('change', () => {
        alarm[key][listIndex].input[inputIndex].type = typeSelect.value;
        valueInput.type = typeSelect.value === 'number' ? 'number' : 'text';
        updateOutput();
      });
      valueInput.addEventListener('input', () => {
        alarm[key][listIndex].input[inputIndex].value = valueInput.value;
        updateOutput();
      });
      row.querySelector('[data-action="delete-input"]').addEventListener('click', () => {
        alarm[key][listIndex].input.splice(inputIndex, 1);
        render();
      });
      inputListContainer.appendChild(row);
    });

    block.querySelector('[data-action="add-input"]').addEventListener('click', () => {
      alarm[key][listIndex].input.push({ type: 'text', value: '' });
      render();
    });

    block.querySelector('[data-action="up"]').addEventListener('click', () => {
      moveItem(alarm[key], listIndex, listIndex - 1);
      render();
    });
    block.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm[key], listIndex, listIndex + 1);
      render();
    });
    block.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm[key].splice(listIndex, 1);
      render();
    });

    container.appendChild(block);
  });
}

function renderLocations(container, alarm) {
  container.innerHTML = '';
  alarm.locations.forEach((loc, idx) => {
    const block = document.createElement('div');
    block.className = 'sub-card';
    block.innerHTML = `
      <div class="sub-card-header">
        <strong>Location ${idx + 1}</strong>
        <div class="button-row">
          <button type="button" class="btn secondary small" data-action="up">↑</button>
          <button type="button" class="btn secondary small" data-action="down">↓</button>
          <button type="button" class="btn danger small" data-action="delete">Delete</button>
        </div>
      </div>
      <div class="grid four-col">
        <label>Lat <span class="help" data-tip="Latitude coordinate for this location.">?</span><input type="number" step="any" data-field="lat" /></label>
        <label>Long <span class="help" data-tip="Longitude coordinate for this location.">?</span><input type="number" step="any" data-field="lon" /></label>
        <label>Radius m <span class="help" data-tip="Distance in meters around this coordinate.">?</span><input type="number" min="1" step="1" data-field="radius" /></label>
        <label>Name <span class="help" data-tip="Visual label only for identifying this location in the editor.">?</span><input type="text" data-field="name" /></label>
      </div>
    `;

    block.querySelector('[data-field="lat"]').value = loc.lat;
    block.querySelector('[data-field="lon"]').value = loc.lon;
    block.querySelector('[data-field="radius"]').value = loc.radius;
    block.querySelector('[data-field="name"]').value = loc.name || '';

    ['lat', 'lon', 'radius', 'name'].forEach((field) => {
      block.querySelector(`[data-field="${field}"]`).addEventListener('input', (event) => {
        alarm.locations[idx][field] = field === 'name' ? event.target.value : Number(event.target.value);
        updateOutput();
      });
    });

    block.querySelector('[data-action="up"]').addEventListener('click', () => {
      moveItem(alarm.locations, idx, idx - 1);
      render();
    });
    block.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm.locations, idx, idx + 1);
      render();
    });
    block.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm.locations.splice(idx, 1);
      render();
    });

    container.appendChild(block);
  });
}

function renderTaskIDs(container, alarm) {
  container.innerHTML = '';
  alarm.taskIDs.forEach((taskID, idx) => {
    const row = document.createElement('div');
    row.className = 'inline-row';
    row.innerHTML = `
      <input type="text" data-field="taskID" placeholder="Task ID" />
      <button type="button" class="btn secondary small" data-action="up">↑</button>
      <button type="button" class="btn secondary small" data-action="down">↓</button>
      <button type="button" class="btn danger small" data-action="delete">Delete</button>
    `;
    row.querySelector('[data-field="taskID"]').value = taskID;
    row.querySelector('[data-field="taskID"]').addEventListener('input', (event) => {
      alarm.taskIDs[idx] = event.target.value;
      updateOutput();
    });
    row.querySelector('[data-action="up"]').addEventListener('click', () => {
      moveItem(alarm.taskIDs, idx, idx - 1);
      render();
    });
    row.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm.taskIDs, idx, idx + 1);
      render();
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm.taskIDs.splice(idx, 1);
      render();
    });
    container.appendChild(row);
  });
}

function renderConflictCalendars(container, alarm) {
  container.innerHTML = '';
  alarm.conflictingCalendars.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'inline-row';
    row.innerHTML = `
      <input type="text" data-field="name" placeholder="Calendar name" />
      <button type="button" class="btn secondary small" data-action="up">↑</button>
      <button type="button" class="btn secondary small" data-action="down">↓</button>
      <button type="button" class="btn danger small" data-action="delete">Delete</button>
    `;
    row.querySelector('[data-field="name"]').value = name;
    row.querySelector('[data-field="name"]').addEventListener('input', (event) => {
      alarm.conflictingCalendars[idx] = event.target.value;
      updateOutput();
    });
    row.querySelector('[data-action="up"]').addEventListener('click', () => {
      moveItem(alarm.conflictingCalendars, idx, idx - 1);
      render();
    });
    row.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm.conflictingCalendars, idx, idx + 1);
      render();
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm.conflictingCalendars.splice(idx, 1);
      render();
    });
    container.appendChild(row);
  });
}

function setRescheduleForm(card, alarm) {
  const isFixed = typeof alarm.reschedMinutes === 'number';
  alarm.reschedType = isFixed ? 'fixed' : alarm.reschedType || 'range';
  alarm.reschedFixed = isFixed ? alarm.reschedMinutes : alarm.reschedFixed ?? 10;
  alarm.reschedMin = !isFixed ? alarm.reschedMinutes?.min ?? 10 : alarm.reschedMin ?? 10;
  alarm.reschedMax = !isFixed ? alarm.reschedMinutes?.max ?? 45 : alarm.reschedMax ?? 45;

  const typeSelect = card.querySelector('[data-field="reschedType"]');
  const fixedWrap = card.querySelector('[data-resched="fixed"]');
  const minWrap = card.querySelector('[data-resched="min"]');
  const maxWrap = card.querySelector('[data-resched="max"]');

  typeSelect.value = alarm.reschedType;
  card.querySelector('[data-field="reschedFixed"]').value = alarm.reschedFixed;
  card.querySelector('[data-field="reschedMin"]').value = alarm.reschedMin;
  card.querySelector('[data-field="reschedMax"]').value = alarm.reschedMax;

  const updateVisibility = () => {
    const fixed = typeSelect.value === 'fixed';
    fixedWrap.style.display = fixed ? 'block' : 'none';
    minWrap.style.display = fixed ? 'none' : 'block';
    maxWrap.style.display = fixed ? 'none' : 'block';
  };
  updateVisibility();

  typeSelect.addEventListener('change', () => {
    alarm.reschedType = typeSelect.value;
    updateVisibility();
    updateOutput();
  });
}

function render() {
  preserveAdvancedState();
  alarmsContainer.innerHTML = '';
  emptyState.style.display = alarms.length ? 'none' : 'block';

  alarms.forEach((alarm, index) => {
    const fragment = alarmTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.alarm-card');
    const title = fragment.querySelector('.alarm-title');
    const advancedToggle = fragment.querySelector('details');
    title.innerHTML = `Alarm ${index + 1} <span class="help" data-tip="One alarm on an event.">?</span>`;

    card.dataset.index = index;
    advancedToggle.open = !!openAdvancedByIndex[index];

    card.querySelectorAll('[data-field]').forEach((input) => {
      const key = input.dataset.field;
      if (key.startsWith('resched')) return;
      if (input.type === 'checkbox') input.checked = !!alarm[key];
      else input.value = alarm[key] ?? '';

      input.addEventListener('input', () => {
        if (input.type === 'checkbox') alarm[key] = input.checked;
        else if (input.type === 'number') alarm[key] = input.value === '' ? '' : Number(input.value);
        else alarm[key] = input.value;
        updateOutput();
      });
    });

    setRescheduleForm(card, alarm);
    card.querySelector('[data-field="reschedFixed"]').addEventListener('input', (e) => {
      alarm.reschedFixed = Number(e.target.value);
      updateOutput();
    });
    card.querySelector('[data-field="reschedMin"]').addEventListener('input', (e) => {
      alarm.reschedMin = Number(e.target.value);
      updateOutput();
    });
    card.querySelector('[data-field="reschedMax"]').addEventListener('input', (e) => {
      alarm.reschedMax = Number(e.target.value);
      updateOutput();
    });

    renderShortcutList(card.querySelector('[data-list="qrShortcutsOnScan"]'), alarm, 'qrShortcutsOnScan', index);
    renderShortcutList(card.querySelector('[data-list="shortcutsOnTrigger"]'), alarm, 'shortcutsOnTrigger', index);
    renderLocations(card.querySelector('[data-list="locations"]'), alarm, index);
    renderConflictCalendars(card.querySelector('[data-list="conflictingCalendars"]'), alarm, index);
    renderTaskIDs(card.querySelector('[data-list="taskIDs"]'), alarm, index);

    card.querySelectorAll('.add-list-item').forEach((button) => {
      button.addEventListener('click', () => {
        const listName = button.dataset.add;
        if (listName === 'locations') alarm.locations.push({ lat: 0, lon: 0, radius: 50, name: '' });
        else if (listName === 'conflictingCalendars') alarm.conflictingCalendars.push('');
        else if (listName === 'taskIDs') alarm.taskIDs.push('task-id');
        else alarm[listName].push({ name: '', input: [] });
        render();
        updateOutput();
      });
    });

    fragment.querySelector('.delete-alarm-btn').addEventListener('click', () => {
      alarms.splice(index, 1);
      render();
      updateOutput();
    });

    fragment.querySelector('.move-up-btn').addEventListener('click', () => {
      moveItem(alarms, index, index - 1);
      render();
      updateOutput();
    });
    fragment.querySelector('.move-down-btn').addEventListener('click', () => {
      moveItem(alarms, index, index + 1);
      render();
      updateOutput();
    });

    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', String(index));
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (event) => event.preventDefault());
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      const fromIndex = Number(event.dataTransfer.getData('text/plain'));
      const toIndex = Number(card.dataset.index);
      moveItem(alarms, fromIndex, toIndex);
      render();
      updateOutput();
    });

    alarmsContainer.appendChild(fragment);
  });
}

alarmsContainer.addEventListener('dragover', (event) => {
  event.preventDefault();
});

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
    alarms = parsed.map((alarm) => normalizeAlarm(alarm));
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
  alarms.push(normalizeAlarm(defaultAlarm()));
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
