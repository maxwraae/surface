'use strict';

(async function inlineEdit() {
  if (!window.surface?.isSurface) return;

  const filePath = decodeURIComponent(location.pathname);
  if (!/\.html?$/i.test(filePath)) return;

  let handle;
  try {
    handle = await window.surface.open(filePath);
  } catch (err) {
    console.warn('[surface inline-edit] cannot open handle:', err.message);
    return;
  }

  const filename = filePath.replace(/^.*\//, '');

  // Inject a style to suppress the contenteditable focus outline.
  const styleTag = document.createElement('style');
  styleTag.setAttribute('data-surface-inline-edit', '');
  styleTag.textContent = '[contenteditable] { outline: none; caret-color: currentColor; }';
  document.head.appendChild(styleTag);

  document.body.contentEditable = 'true';

  let saveTimer = null;
  let saving = false;

  function setStatus(text) {
    document.title = filename + ' — ' + text;
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function serialize() {
    // Clone the DOM to read clean HTML without disrupting the live editor.
    const clone = document.documentElement.cloneNode(true);
    const cloneBody = clone.querySelector('body');
    if (cloneBody) cloneBody.removeAttribute('contenteditable');
    const cloneStyle = clone.querySelector('style[data-surface-inline-edit]');
    if (cloneStyle) cloneStyle.remove();

    const dt = document.doctype;
    const doctype = dt
      ? '<!DOCTYPE ' + dt.name +
        (dt.publicId ? ' PUBLIC "' + dt.publicId + '"' : '') +
        (dt.systemId ? ' "' + dt.systemId + '"' : '') + '>'
      : '<!DOCTYPE html>';
    return doctype + '\n' + clone.outerHTML + '\n';
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const html = serialize();
      const r = await handle.write(html);
      setStatus('saved · ' + fmtTime(r.mtime));
    } catch (err) {
      if ((err.message || '').includes('ConflictError')) {
        setStatus('conflict — reload to resolve');
      } else {
        setStatus('save: ' + err.message);
      }
    } finally {
      saving = false;
    }
  }

  document.addEventListener('input', () => {
    setStatus('editing…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  });

  document.body.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  });

  let pendingReload = false;
  handle.watch((ev) => {
    if (ev.byMe) return;
    if (ev.type === 'unlink') {
      document.body.contentEditable = 'false';
      setStatus('file deleted');
      return;
    }
    if (document.activeElement === document.body || document.body.contains(document.activeElement)) {
      pendingReload = true;
      return;
    }
    setStatus('external change — reloading…');
    location.reload();
  });
  document.body.addEventListener('blur', () => {
    if (pendingReload) { pendingReload = false; location.reload(); }
  });

  setStatus('opened · ' + fmtTime(handle.mtime));
})();
