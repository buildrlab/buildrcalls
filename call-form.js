// Logic behind the schedule-a-call form, kept apart from the DOM so the tests can load it directly.
// Loaded as a plain script in the renderer (window.CallForm) and with require() in tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CallForm = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const EDITABLE = ['scheduled', 'opening'];

  // Validates the form values, then adds a new call to data.calls or updates the one being edited. Throws an Error
  // with a message for the user when something is wrong. The caller saves data and re-renders.
  // form: {title, platform, customPlatform, url, date, time, duration}; helpers: {dateKey, timeOf, localToUtc, randomUUID}.
  function applyCallForm({ data, editingId, form, helpers }) {
    const existing = editingId ? data.calls.find(c => c.id === editingId) : null;
    if (editingId && (!existing || !EDITABLE.includes(existing.status))) throw Error('This call can no longer be edited because it has started or was removed.');
    const u = new URL(form.url);
    if (u.protocol !== 'https:') throw Error('Please use an HTTPS link.');
    const platform = form.platform === 'Other' ? form.customPlatform.trim() : form.platform;
    if (!platform) throw Error('Please enter a platform name.');
    const unchangedTime = existing && helpers.dateKey(new Date(existing.start)) === form.date && helpers.timeOf(existing) === form.time;
    const start = unchangedTime ? existing.start : helpers.localToUtc(form.date, form.time, data.timezone);
    if (new Date(start) <= new Date()) throw Error('Please choose a time in the future.');
    const values = { title: form.title.trim(), platform, url: u.href, start, duration: +form.duration };
    if (!values.title) throw Error('Please enter a call name.');
    data.defaults = { platform, duration: values.duration, time: form.time };
    if (existing) {
      if (existing.status === 'opening' && (existing.start !== start || existing.url !== u.href)) { existing.status = 'scheduled'; delete existing.error; }
      Object.assign(existing, values);
    } else data.calls.push({ id: helpers.randomUUID(), ...values, status: 'scheduled' });
    return { edited: !!existing };
  }

  return { applyCallForm };
});
