const alarmsContainer = document.getElementById('alarmsContainer');
const alarmTemplate = document.getElementById('alarmCardTemplate');
const jsonInput = document.getElementById('jsonInput');
const jsonOutput = document.getElementById('jsonOutput');
const loadStatus = document.getElementById('loadStatus');
const copyStatus = document.getElementById('copyStatus');
const emptyState = document.getElementById('emptyState');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

const { PUBLIC_ACTIONS, defaultAlarm, defaultAction, newActionShortcut, normalizeAlarm, cleanAlarm, moveItem } = AlarmConfig;
const { buildQrShortcutUrl, validateQrCodeID } = QrTools;

let alarms = [];
let dragFromIndex = null;
let openAdvancedByIndex = [];
let history = [];
let historyIndex = -1;
let isNavigatingHistory = false;

function downloadDataUrl(filename, url) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}

function qrFilename(id, extension) {
  return `calendar-alarm-${id}.${extension}`;
}

function createQrCode(url) {
  if (typeof qrcode !== 'function') throw new Error('The QR generator could not be loaded. Check your connection and try again.');
  const code = qrcode(0, 'M');
  code.addData(url);
  code.make();
  return code;
}

function setupQrGenerator(card, alarm) {
  const toggle = card.querySelector('.qr-toggle-btn');
  const panel = card.querySelector('.qr-preview-panel');
  const preview = card.querySelector('.qr-preview');
  const message = card.querySelector('.qr-message');
  const urlInput = card.querySelector('.qr-url');
  const sharedNote = card.querySelector('.qr-shared-note');
  const actionButtons = card.querySelectorAll('.qr-preview-panel button');
  let code = null;

  const refresh = () => {
    preview.innerHTML = '';
    urlInput.value = '';
    sharedNote.textContent = '';
    code = null;
    preview.hidden = true;
    actionButtons.forEach((button) => { button.disabled = true; });
    const error = validateQrCodeID(alarm.qrCodeID);
    if (error) {
      setStatus(message, error, 'error');
      return;
    }
    try {
      const url = buildQrShortcutUrl(alarm.qrCodeID);
      code = createQrCode(url);
      preview.innerHTML = code.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
      preview.hidden = false;
      actionButtons.forEach((button) => { button.disabled = false; });
      urlInput.value = url;
      const matching = alarms.filter((item) => item.qrCodeID === alarm.qrCodeID).length;
      sharedNote.textContent = matching > 1
        ? `Shared by ${matching} alarms. Scanning this code silences every active alarm using this ID.`
        : `Scanning this code silences any active alarm using “${alarm.qrCodeID}”.`;
      setStatus(message, `QR code for “${alarm.qrCodeID}”.`, 'success');
    } catch (error) {
      setStatus(message, error.message, 'error');
    }
  };

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.textContent = panel.hidden ? 'Show QR Code' : 'Hide QR Code';
    if (!panel.hidden) refresh();
  });

  card.querySelector('[data-field="qrCodeID"]').addEventListener('input', () => {
    if (!panel.hidden) refresh();
  });
  card.querySelector('.qr-download-png').addEventListener('click', () => {
    if (code) downloadDataUrl(qrFilename(alarm.qrCodeID, 'png'), code.createDataURL(8, 32));
  });
  card.querySelector('.qr-download-svg').addEventListener('click', () => {
    if (!code) return;
    const blob = new Blob([code.createSvgTag({ cellSize: 8, margin: 4, scalable: true })], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(qrFilename(alarm.qrCodeID, 'svg'), url);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  card.querySelector('.qr-copy-link').addEventListener('click', async () => {
    if (!urlInput.value) return;
    try {
      await navigator.clipboard.writeText(urlInput.value);
      setStatus(message, 'QR destination copied to clipboard.', 'success');
    } catch {
      urlInput.focus();
      urlInput.select();
      setStatus(message, 'Clipboard access failed. The destination is selected so you can copy it manually.', 'error');
    }
  });
  card.querySelector('.qr-print').addEventListener('click', () => {
    if (!code) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setStatus(message, 'Allow pop-ups to print this QR code.', 'error');
      return;
    }
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><title>Calendar Alarm QR — ${alarm.qrCodeID}</title><style>body{text-align:center;font:20px system-ui;padding:2rem}svg{width:min(80vw,600px);height:auto}</style><h1>${alarm.qrCodeID}</h1>${code.createSvgTag({ cellSize: 8, margin: 4, scalable: true })}<p>Scan to silence Calendar Alarms using this ID.</p><script>onload=()=>print()<\/script>`);
    printWindow.document.close();
  });
}

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

function snapshotState() {
  return JSON.stringify(alarms);
}

function updateHistoryButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= history.length - 1;
}

function pushHistorySnapshot() {
  if (isNavigatingHistory) return;
  const snapshot = snapshotState();
  if (history[historyIndex] === snapshot) {
    updateHistoryButtons();
    return;
  }
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function restoreHistoryAt(index) {
  if (index < 0 || index >= history.length) return;
  isNavigatingHistory = true;
  historyIndex = index;
  alarms = JSON.parse(history[historyIndex]).map((alarm) => normalizeAlarm(alarm));
  render();
  updateOutput();
  isNavigatingHistory = false;
  updateHistoryButtons();
}

function renderAfterMutation() {
  render();
  updateOutput();
}

const ACTION_LABELS = {
  notification: 'Notification',
  timer: 'Timer',
  focus: 'Focus',
  display: 'Display',
  open: 'Open App / URL / Screen',
  openhabits_reminder: 'OpenHabits Reminder',
  audio: 'Volume / Audio',
  cue: 'Cue',
};

function actionField(label, field, type = 'text', attributes = '') {
  return `<label>${label}<input type="${type}" data-action-field="${field}" ${attributes} /></label>`;
}

function actionSelect(label, field, options) {
  return `<label>${label}<select data-action-field="${field}">${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`;
}

function renderActionEditor(container, item, rerender) {
  const payload = item.action;
  let fields = '';
  switch (item.editorType) {
    case 'notification':
      fields = `${actionField('Message', 'message', 'text', 'required')}${actionSelect('Output', 'mode', [['show', 'Show'], ['speak', 'Speak'], ['both', 'Speak + Show']])}${actionField('Title (optional)', 'title')}`;
      break;
    case 'timer':
      fields = `${actionSelect('Operation', 'operation', [['start', 'Start'], ['cancel', 'Cancel']])}${payload.operation === 'start' ? actionField('Minutes', 'minutes', 'number', 'min="0" step="any" required') : ''}`;
      break;
    case 'focus':
      fields = `${actionField('Focus Name', 'name', 'text', 'required')}${actionSelect('State', 'state', [['on', 'On'], ['off', 'Off']])}`;
      break;
    case 'display':
      fields = actionSelect('Operation', 'operation', [['color_filters', 'Color Filters'], ['brightness', 'Brightness'], ['appearance', 'Appearance']]);
      if (payload.operation === 'color_filters') fields += actionSelect('State', 'state', [['on', 'On'], ['off', 'Off']]);
      if (payload.operation === 'brightness') fields += actionField('Percent', 'percent', 'number', 'min="0" max="100" step="any" required');
      if (payload.operation === 'appearance') fields += actionSelect('Mode', 'mode', [['light', 'Light'], ['dark', 'Dark']]);
      break;
    case 'open':
      fields = actionSelect('Operation', 'operation', [['app', 'Open App'], ['url', 'Open URL / Deep Link'], ['home_screen', 'Go to Home Screen'], ['lock_screen', 'Lock Device']]);
      if (payload.operation === 'app') fields += actionField('App Name', 'appName', 'text', 'required');
      if (payload.operation === 'url') fields += actionField('URL / Deep Link', 'url', 'url', 'required');
      break;
    case 'openhabits_reminder':
      fields = `${actionField('Metric IDs (comma-separated)', 'metricIDs', 'text', 'required')}${actionSelect('Output', 'mode', [['show', 'Show'], ['speak', 'Speak'], ['both', 'Speak + Show']])}`;
      break;
    case 'audio':
      fields = actionSelect('Operation', 'operation', [['volume', 'Media Volume'], ['silent_mode', 'Silent Mode']]);
      if (payload.operation === 'volume') fields += actionField('Percent', 'percent', 'number', 'min="0" max="100" step="any" required');
      if (payload.operation === 'silent_mode') fields += actionSelect('State', 'state', [['on', 'On'], ['off', 'Off']]);
      break;
    case 'cue':
      fields = actionSelect('Operation', 'operation', [['haptic', 'Haptic'], ['sound', 'Sound']]);
      if (payload.operation === 'sound') fields += actionField('Sound File', 'file', 'text', 'required');
      break;
  }
  container.innerHTML = `<div class="grid two-col action-fields">${fields}</div>`;
  container.querySelectorAll('[data-action-field]').forEach((control) => {
    const field = control.dataset.actionField;
    control.value = field === 'metricIDs' ? (payload.metricIDs || []).join(', ') : (payload[field] ?? '');
    const eventName = control.tagName === 'SELECT' ? 'change' : 'input';
    control.addEventListener(eventName, () => {
      if (field === 'operation') {
        const next = defaultAction(item.editorType);
        next.operation = control.value;
        if (item.editorType === 'timer' && control.value === 'cancel') delete next.minutes;
        if (item.editorType === 'display') {
          if (control.value === 'brightness') next.percent = 50;
          if (control.value === 'appearance') next.mode = 'light';
          if (control.value !== 'color_filters') delete next.state;
        }
        if (item.editorType === 'open') {
          delete next.appName;
          if (control.value === 'app') next.appName = '';
          if (control.value === 'url') next.url = '';
        }
        if (item.editorType === 'audio') {
          if (control.value === 'silent_mode') { delete next.percent; next.state = 'on'; }
        }
        if (item.editorType === 'cue' && control.value === 'sound') next.file = '';
        item.action = next;
        rerender();
        return;
      }
      if (field === 'metricIDs') payload.metricIDs = control.value.split(',').map((value) => value.trim()).filter(Boolean);
      else if (control.type === 'number') payload[field] = control.value === '' ? '' : Number(control.value);
      else if (field === 'title' && control.value === '') delete payload.title;
      else payload[field] = control.value;
      updateOutput();
    });
  });
}

function renderShortcutList(container, alarm, key, alarmIndex) {
  container.innerHTML = '';
  const list = alarm[key];
  list.forEach((item, listIndex) => {
    const block = document.createElement('div');
    block.className = 'sub-card';
    block.innerHTML = `
      <div class="sub-card-header">
        <strong>Action ${listIndex + 1}</strong>
        <div class="button-row">
          <button type="button" class="btn secondary small" data-action="up">↑</button>
          <button type="button" class="btn secondary small" data-action="down">↓</button>
          <button type="button" class="btn danger small" data-action="delete">Delete</button>
        </div>
      </div>
      <label>Action Type<select data-action-type></select></label>
      <div data-action-editor></div>
    `;

    const typeSelect = block.querySelector('[data-action-type]');
    PUBLIC_ACTIONS.forEach((action) => typeSelect.add(new Option(ACTION_LABELS[action], action)));
    typeSelect.add(new Option('Run Custom Shortcut', 'custom'));
    typeSelect.value = item.editorType;
    typeSelect.addEventListener('change', () => {
      item.editorType = typeSelect.value;
      if (item.editorType === 'custom') {
        item.name = '';
        item.input = [];
        delete item.action;
      } else {
        item.name = AlarmConfig.ACTIONS_SHORTCUT_NAME;
        item.input = [];
        item.action = defaultAction(item.editorType);
      }
      renderAfterMutation();
    });

    const editor = block.querySelector('[data-action-editor]');
    if (item.editorType !== 'custom') {
      renderActionEditor(editor, item, renderAfterMutation);
    } else {
      editor.innerHTML = `<label>Shortcut Name<input type="text" data-shortcut-field="name" required /></label><div class="list-block" data-input-list></div><button type="button" class="btn small" data-action="add-input">+ Add Input</button><span class="help helper-inline" data-tip="This input will be passed into this configured shortcut.">?</span>`;
      const nameInput = editor.querySelector('[data-shortcut-field="name"]');
      nameInput.value = item.name;
      nameInput.addEventListener('input', () => {
        item.name = nameInput.value;
        updateOutput();
      });
      const inputListContainer = editor.querySelector('[data-input-list]');
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
        item.input[inputIndex].type = typeSelect.value;
        valueInput.type = typeSelect.value === 'number' ? 'number' : 'text';
        updateOutput();
      });
      valueInput.addEventListener('input', () => {
        item.input[inputIndex].value = valueInput.value;
        updateOutput();
      });
      row.querySelector('[data-action="delete-input"]').addEventListener('click', () => {
        item.input.splice(inputIndex, 1);
        renderAfterMutation();
      });
      inputListContainer.appendChild(row);
      });
      editor.querySelector('[data-action="add-input"]').addEventListener('click', () => {
        item.input.push({ type: 'text', value: '' });
        renderAfterMutation();
      });
    }

    block.querySelector('[data-action="up"]').addEventListener('click', () => {
      moveItem(alarm[key], listIndex, listIndex - 1);
      renderAfterMutation();
    });
    block.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm[key], listIndex, listIndex + 1);
      renderAfterMutation();
    });
    block.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm[key].splice(listIndex, 1);
      renderAfterMutation();
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
      renderAfterMutation();
    });
    block.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm.locations, idx, idx + 1);
      renderAfterMutation();
    });
    block.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm.locations.splice(idx, 1);
      renderAfterMutation();
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
      renderAfterMutation();
    });
    row.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm.taskIDs, idx, idx + 1);
      renderAfterMutation();
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm.taskIDs.splice(idx, 1);
      renderAfterMutation();
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
      renderAfterMutation();
    });
    row.querySelector('[data-action="down"]').addEventListener('click', () => {
      moveItem(alarm.conflictingCalendars, idx, idx + 1);
      renderAfterMutation();
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      alarm.conflictingCalendars.splice(idx, 1);
      renderAfterMutation();
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
    setupQrGenerator(card, alarm);
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
        else alarm[listName].push(newActionShortcut());
        renderAfterMutation();
      });
    });

    fragment.querySelector('.delete-alarm-btn').addEventListener('click', () => {
      alarms.splice(index, 1);
      renderAfterMutation();
    });

    fragment.querySelector('.move-up-btn').addEventListener('click', () => {
      moveItem(alarms, index, index - 1);
      renderAfterMutation();
    });
    fragment.querySelector('.move-down-btn').addEventListener('click', () => {
      moveItem(alarms, index, index + 1);
      renderAfterMutation();
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
      renderAfterMutation();
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
  pushHistorySnapshot();
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
  if (!jsonOutput.value.trim()) {
    setStatus(copyStatus, 'No output to copy yet.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(jsonOutput.value);
    setStatus(copyStatus, 'Copied to clipboard.', 'success');
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
  setStatus(loadStatus, 'Reset all alarms and cleared pasted JSON.', 'success');
  setStatus(copyStatus, '');
  render();
  updateOutput();
});

undoBtn.addEventListener('click', () => restoreHistoryAt(historyIndex - 1));
redoBtn.addEventListener('click', () => restoreHistoryAt(historyIndex + 1));

document.addEventListener('keydown', (event) => {
  const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
  const isRedo = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z';
  if (isUndo) {
    event.preventDefault();
    restoreHistoryAt(historyIndex - 1);
  } else if (isRedo) {
    event.preventDefault();
    restoreHistoryAt(historyIndex + 1);
  }
});

document.getElementById('loadJsonBtn').addEventListener('click', loadFromInput);
document.getElementById('addAlarmBtn').addEventListener('click', addAlarm);
document.getElementById('copyOutputBtn').addEventListener('click', copyOutput);

render();
updateOutput();
