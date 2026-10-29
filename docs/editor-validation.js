/* Validate active editor fields without treating collapsed sections as disabled. */
(function exposeEditorValidation(scope) {
  function fieldMessage(control) {
    const value = control.value.trim();
    if (control.required && !value) return 'Enter a value.';
    if (control.dataset.actionField === 'metricIDs' && !value.split(',').some(id => id.trim()))
      return 'Enter at least one Metric ID.';
    if (control.dataset.actionField === 'minutes' && value && Number(value) <= 0)
      return 'Enter a timer duration greater than zero.';
    const validity = control.validity;
    if (validity.badInput) return 'Enter a number.';
    if (validity.rangeUnderflow) return `Enter a value of at least ${control.min}.`;
    if (validity.rangeOverflow) return `Enter a value no greater than ${control.max}.`;
    if (validity.stepMismatch) return control.step === '1' ? 'Enter a whole number.' : 'Enter a value that matches the allowed step.';
    if (validity.typeMismatch) return 'Enter a valid URL, including its scheme (for example https:// or shortcuts://).';
    if (validity.patternMismatch) return 'Use only letters, numbers, -, ., _, or ~ for the QR Code ID.';
    return validity.valid ? '' : 'Check this value.';
  }

  function activeControl(control) {
    if (control.disabled || control.readOnly || control.closest('[hidden]')) return false;
    const card = control.closest('.alarm-card');
    if (control.closest('[data-section="qr"]') && control.dataset.field !== 'qrEnabled' && !card.alarm.qrEnabled) return false;
    if (control.closest('[data-list="locations"]') && card.alarm.locationMode === 'off') return false;
    return true;
  }

  function collectIssues(container) {
    const issues = [];
    container.querySelectorAll('input, select, textarea').forEach(control => {
      if (!activeControl(control)) return;
      const message = fieldMessage(control);
      if (message) issues.push({control, message});
    });
    container.querySelectorAll('.alarm-card').forEach(card => {
      if (card.alarm.taskLoopEnabled && !card.alarm.taskIDs.some(id => String(id).trim())) {
        if (!card.querySelector('[data-field="taskID"]'))
          issues.push({control: card.querySelector('[data-add="taskIDs"]'), message: 'Add at least one Metric ID for task looping.'});
      }
    });
    // Runtime validates an explicitly supplied speech volume even in Show mode.
    container.querySelectorAll('[data-action-editor]').forEach(editor => {
      const payload = editor.closest('.sub-card').actionItem?.action;
      if (!payload || !['notification', 'openhabits_reminder'].includes(payload.action) || payload.mode !== 'show') return;
      const volume = payload.speechVolume;
      const control = editor.querySelector('[data-action-field="mode"]');
      if (activeControl(control) && volume !== undefined &&
          (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 100))
        issues.push({control, message: 'Speech volume must be 0–100. Choose Speak to edit it.'});
    });
    return issues;
  }

  const api = {fieldMessage, activeControl, collectIssues};
  scope.EditorValidation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
