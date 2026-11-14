const app = document.querySelector('#app');
let poll, previewUrl, stream, uploadAbort;
const icon = '↗';
function clear() { if (uploadAbort) uploadAbort.abort(); uploadAbort = null; clearInterval(poll); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
function escapeText(s) { const el = document.createElement('span'); el.textContent = s; return el.innerHTML; }
async function api(url, options = {}) { const res = await fetch(url, options); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again'); return body; }
function home() { clear(); history.replaceState(null, '', '/'); app.innerHTML = `<section class="home"><div class="art" aria-hidden="true"><div class="file-illustration"><span class="file-fold"></span><span class="file-arrow">↗</span></div><span class="art-caption">FROM ONE SCREEN TO ANOTHER</span></div><div class="home-actions"><div class="actions"><button class="button" id="send">Send <span>${icon}</span></button><button class="button secondary" id="receive">Receive <span>↓</span></button></div><p class="hint">No app. No account. Just the file.</p></div></section>`; document.querySelector('#send').onclick = () => send(); document.querySelector('#receive').onclick = receive; const saved = sessionStorage.getItem('flick-sender'); if (saved) { const resume = document.createElement('button'); resume.className = 'text-button'; resume.textContent = 'Resume an interrupted transfer'; resume.onclick = () => { try { choose(JSON.parse(saved)); } catch { sessionStorage.removeItem('flick-sender'); home(); } }; document.querySelector('.home-actions').append(resume); } }
function layout(label, title, description, panel) { app.innerHTML = `<section class="view send-view"><div class="panel">${panel}</div></section>`; }
function previewMarkup(file, url) {
  if (file.mime && file.mime.startsWith('image/')) return `<button class="image-enlarge" id="enlarge" type="button" aria-label="Enlarge received image"><img class="preview" src="${url}?preview=1" alt="Received image"><span>Click to enlarge ↗</span></button><dialog class="image-dialog" id="image-dialog" aria-label="Enlarged received image"><button class="image-close" id="image-close" type="button" aria-label="Close enlarged image">✕</button><img src="${url}?preview=1" alt="Received image enlarged"></dialog>`;
  if (file.mime && file.mime.startsWith('video/')) return `<video class="media-preview" controls preload="metadata" src="${url}?preview=1">Your browser cannot preview this video</video>`;
  if (file.mime === 'application/pdf') return `<div class="pdf-viewer"><div class="pdf-canvas-wrap"><canvas id="pdf-canvas" aria-label="PDF page preview"></canvas></div><div class="pdf-controls"><button class="text-button" id="pdf-prev" type="button">Previous</button><span id="pdf-page" aria-live="polite">Loading preview…</span><button class="text-button" id="pdf-next" type="button">Next</button></div></div>`;
  return `<div class="file-card"><span class="file-icon">↗</span><strong>${escapeText(file.name)}</strong><span>${formatSize(file.size)}</span></div>`;
}
function bindPreview(file, url) {
  if (file.mime && file.mime.startsWith('image/')) { const dialog = document.querySelector('#image-dialog'); document.querySelector('#enlarge').onclick = () => dialog.showModal(); document.querySelector('#image-close').onclick = () => dialog.close(); }
  if (file.mime === 'application/pdf') {
    const canvas = document.querySelector('#pdf-canvas'), status = document.querySelector('#pdf-page');
    const prev = document.querySelector('#pdf-prev'), next = document.querySelector('#pdf-next');
    import('/vendor/pdfjs/pdf.mjs').then(async pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
      const doc = await pdfjs.getDocument({url: `${url}?preview=1`, isEvalSupported: false, enableXfa: false}).promise;
      let page = 1, rendering = false;
      async function render() {
        if (rendering || !canvas.isConnected) return;
        rendering = true; prev.disabled = true; next.disabled = true;
        try {
          const pdfPage = await doc.getPage(page), viewport = pdfPage.getViewport({scale: 1});
          const scale = Math.min(2, Math.max(1, 800 / viewport.width)), view = pdfPage.getViewport({scale});
          canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
          await pdfPage.render({canvasContext: canvas.getContext('2d'), viewport:view}).promise;
          status.textContent = `Page ${page} of ${doc.numPages}`;
        } finally { rendering = false; prev.disabled = page === 1; next.disabled = page === doc.numPages; }
      }
      prev.onclick = () => { if (page > 1) { page--; render(); } };
      next.onclick = () => { if (page < doc.numPages) { page++; render(); } };
      await render();
    }).catch(() => { if (status.isConnected) status.textContent = 'Preview unavailable · download to view'; prev.disabled = true; next.disabled = true; });
  }
}
async function createShare(url, button) {
  const container = document.querySelector('#share-link-area');
  button.disabled = true;
  try {
    const share = await api(`${url}/share`, { method:'POST', headers:{'X-Flick-Request':'1'} });
    const link = `${location.origin}/#share=${share.token}`;
    container.innerHTML = `<label class="small-label" for="share-link">SHARE LINK</label><input class="field share-field" id="share-link" readonly value="${link}"><button class="button secondary wide" id="copy-link" type="button">Copy link</button><p class="expiry">Anyone with this link can open the file until it expires or is deleted.${['localhost','127.0.0.1','::1'].includes(location.hostname) ? ' Use your computer’s network address instead of localhost so other devices can open it.' : ''}</p>`;
    const field = document.querySelector('#share-link');
    document.querySelector('#copy-link').onclick = async () => { try { await navigator.clipboard.writeText(link); document.querySelector('#copy-link').textContent = 'Copied'; } catch { field.focus(); field.select(); } };
  } catch (err) { container.textContent = err.message; } finally { button.disabled = false; }
}
async function sharedView(share) {
  clear();
  layout('', '', '', '<div><h2>Opening file…</h2></div>');
  try {
    const file = await api(`/api/shared/${encodeURIComponent(share)}`);
    const url = `/api/shared/${encodeURIComponent(share)}/file`;
    layout('', '', '', `<div><div class="small-label">SHARED FILE</div><h2>${escapeText(file.name)}</h2>${previewMarkup(file, url)}<div class="expiry">Available until ${escapeText(new Date(file.expires).toLocaleString())}</div><div class="actions" style="margin-top:20px"><a class="button wide" href="${url}">Download file <span>↓</span></a><button class="button secondary wide" id="shared-home" type="button">Back to Flick</button></div></div>`);
    bindPreview(file, url);
  } catch (err) { layout('', '', '', `<div><h2>File unavailable</h2><p>${escapeText(err.message)}</p><button class="button secondary wide" id="shared-home" type="button">Back to Flick</button></div>`); }
  document.querySelector('#shared-home').onclick = home;
}
async function receive() { clear(); layout('Receive a file', 'Make room<br>for a <em>moment.</em>', 'Connect another device and your file will land right here.', '<div class="center"><p>Creating your private connection…</p></div>'); try { const session = await api('/api/sessions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:location.origin})}); const panel = document.querySelector('.panel'); panel.innerHTML = `<div class="center"><img class="qr" src="${session.qr}" alt="QR code to connect a sending device"><div class="small-label">OR ENTER THIS CODE ON THE OTHER DEVICE</div><div class="code">${session.code.slice(0,4)} ${session.code.slice(4)}</div><div class="status"><span class="dot"></span><span id="status">Waiting for a device</span></div><p class="expiry">Scan with your phone camera, or choose Send and enter the code</p><button class="button secondary wide" id="receive-back" type="button">Back</button></div>`; document.querySelector('#receive-back').onclick = home;
 let last = ''; const update = async () => { try { const data = await api(`/api/sessions/${session.id}`, {headers:{Authorization:`Bearer ${session.receiver}`}}); if (data.file && data.file.id !== last) { last = data.file.id; const url = `/api/sessions/${session.id}/files/${data.file.id}`; const safeName = escapeText(data.file.name); panel.innerHTML = `<div><div class="small-label success">FILE RECEIVED</div><h2>A little something, delivered</h2>${previewMarkup(data.file, url)}<div class="file-name">${safeName} · ${formatSize(data.file.size)}</div><div class="actions" style="margin-top:16px"><a class="button" href="${url}">Download file <span>↓</span></a><button class="button secondary" id="share-current" type="button">Share link</button><button class="button secondary" id="delete-current" type="button">Delete file</button></div><div id="share-link-area"></div><div class="expiry">Available until ${new Date(data.file.expires).toLocaleString()}. A downloaded copy stays on your device.</div><div class="status"><span class="dot"></span> Ready for another file</div></div>`; bindPreview(data.file, url); document.querySelector('#share-current').onclick = e => createShare(url, e.currentTarget); document.querySelector('#delete-current').onclick = async () => { if (!confirm('Delete this file for everyone? This cannot be undone.')) return; try { await api(url, { method:'DELETE', headers:{'X-Flick-Request':'1'} }); clear(); home(); historyView(); } catch (err) { alert(err.message); } }; if (data.files.length > 1) { const list = document.createElement('div'); list.className = 'received-list'; list.innerHTML = `<p class="expiry">${data.files.length} files received · select one to view</p>` + data.files.map((file, i) => `<button class="history-item" data-index="${i}" type="button"><span class="history-file-name">${escapeText(file.name)}</span><span>${formatSize(file.size)}</span></button>`).join(''); panel.append(list); list.querySelectorAll('button').forEach(button => button.onclick = () => { clear(); historyFile(data.files[Number(button.dataset.index)]); }); } } else if (!last && data.connected) document.querySelector('#status').textContent = 'Connected · waiting for a file'; } catch(e) { clearInterval(poll); panel.insertAdjacentHTML('beforeend', `<p class="error" role="alert">${escapeText(e.message)}</p>`); } }; await update(); poll = setInterval(update, 2000);
 } catch(e) { document.querySelector('.panel').innerHTML = `<p class="error" role="alert">${escapeText(e.message)}</p><button class="button secondary" id="retry">Try again</button>`; document.querySelector('#retry').onclick=receive; } }
const historyButton = document.querySelector('#history-button');
const historyMenu = document.querySelector('#history-menu');
function closeHistory() { historyMenu.hidden = true; historyButton.setAttribute('aria-expanded', 'false'); }
async function historyView() {
  historyMenu.hidden = false;
  historyButton.setAttribute('aria-expanded', 'true');
  const list = document.querySelector('#history-list');
  list.textContent = 'Loading files…';
  try {
    const { files } = await api('/api/history');
    if (historyMenu.hidden) return;
    if (!files.length) { list.textContent = 'No files received in the past 24 hours'; return; }
    list.innerHTML = files.map((file, index) => `<button type="button" class="history-item" data-index="${index}"><span class="history-file-name">${escapeText(file.name)}</span><span>${formatSize(file.size)} · expires ${escapeText(new Date(file.expires).toLocaleString())}</span></button>`).join('');
    list.querySelectorAll('.history-item').forEach(button => { button.onclick = () => { closeHistory(); clear(); historyFile(files[Number(button.dataset.index)]); }; });
  } catch (err) { if (!historyMenu.hidden) list.textContent = err.message; }
}
function historyFile(file) {
  const url = `/api/sessions/${encodeURIComponent(file.session)}/files/${encodeURIComponent(file.id)}`;
  layout('', '', '', `<div><div class="small-label">RECEIVED FILE</div><h2>${escapeText(file.name)}</h2>${previewMarkup(file, url)}<div class="expiry">Available until ${escapeText(new Date(file.expires).toLocaleString())}</div><div class="actions" style="margin-top:20px"><a class="button wide" href="${url}">Download file <span>↓</span></a><button class="button secondary wide" id="share-file" type="button">Share link</button><div id="share-link-area" class="wide"></div><button class="button secondary wide" id="delete-file" type="button">Delete file</button><button class="button secondary wide" id="history-return" type="button">Back</button></div></div>`);
  document.querySelector('#share-file').onclick = e => createShare(url, e.currentTarget);
  document.querySelector('#history-return').onclick = () => { home(); historyView(); };
  document.querySelector('#delete-file').onclick = async () => { if (!confirm('Delete this file for everyone? This cannot be undone.')) return; try { await api(url, { method:'DELETE', headers:{ 'X-Flick-Request':'1' } }); home(); historyView(); } catch (err) { alert(err.message); } };
  bindPreview(file, url);
}
historyButton.onclick = () => historyMenu.hidden ? historyView() : closeHistory();
document.addEventListener('click', e => { if (!historyMenu.hidden && !e.target.closest('.history-wrap')) closeHistory(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !historyMenu.hidden) { closeHistory(); historyButton.focus(); } });
function send(prefill = '') { clear(); layout('Send a file', 'Send a little<br><em>something.</em>', 'Connect to the other screen, choose a file, and flick it across.', `<div><div class="overline">STEP 01 / CONNECT</div><h2>Where is it going?</h2><p>Enter the 8-digit code shown on the receiving device</p><form id="join"><label class="small-label" for="code">CONNECTION CODE</label><input class="field" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="9" placeholder="0000 0000" value="${escapeText(prefill)}" required><button class="button wide" type="submit">Connect <span>↗</span></button></form><p class="error" id="error" role="alert"></p><p class="expiry">Have a QR code? Scan it with your phone's camera to connect.</p><button class="button secondary wide" id="send-back" type="button">Back</button></div>`); document.querySelector('#send-back').onclick = home; document.querySelector('#join').onsubmit = async e => { e.preventDefault(); const btn=e.submitter; btn.disabled=true; try { const data=await api('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:document.querySelector('#code').value})}); sessionStorage.setItem('flick-sender', JSON.stringify(data)); choose(data); } catch(err){document.querySelector('#error').textContent=err.message;btn.disabled=false;} }; }
function formatSize(size) { return size < 1000 ? `${size} B` : size < 1000000 ? `${(size / 1000).toFixed(0)} KB` : size < 1000000000 ? `${(size / 1000000).toFixed(1)} MB` : '1 GB'; }
function choose(session) {
  layout('', '', '', `<div><div class="overline success">CONNECTED · CODE ${escapeText(session.code || '')}</div><h2>Choose your files</h2><p>Choose one or more files, each smaller than 1 GB</p><label class="upload" for="file"><span class="upload-icon">↗</span><span>Choose files</span><small>Any file type · smaller than 1 GB each</small></label><input id="file" type="file" multiple hidden><p class="expiry">To resume after a refresh, select the same files again within 24 hours</p><p class="error" role="alert" id="error"></p><button class="button secondary wide" id="choose-back" type="button">Back</button></div>`);
  document.querySelector('#choose-back').onclick = home;
  document.querySelector('#file').onchange = e => { const files = Array.from(e.target.files); if (!files.length) return; if (files.some(file => file.size >= 1000000000)) { document.querySelector('#error').textContent = 'Each file must be smaller than 1 GB'; return; } showPreview(session, files); };
}
async function fingerprint(file, label, signal) {
  const { sha256 } = await import('/vendor/hashes/sha2.js');
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
    if (signal.aborted) throw new DOMException('Transfer paused', 'AbortError');
    hash.update(new Uint8Array(await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer()));
    label.textContent = `Checking file · ${Math.min(100, Math.round((offset + 4 * 1024 * 1024) / file.size * 100))}%`;
  }
  return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('');
}
function showPreview(session, files) {
  const panel = document.querySelector('.panel');
  panel.innerHTML = `<div><div class="overline">READY TO SEND</div><h2>${files.length === 1 ? 'Your file' : `${files.length} files`}</h2><div id="transfer-list">${files.map((file, i) => `<div class="transfer-item"><div class="transfer-name">${escapeText(file.name)}</div><div class="transfer-meta" id="progress-label-${i}">${formatSize(file.size)} · Waiting</div><progress id="progress-${i}" max="100" value="0" aria-label="Upload progress for ${escapeText(file.name).replace(/"/g, '&quot;')}"></progress></div>`).join('')}</div><button class="button wide" id="flick">Flick to send <span>↗</span></button><p class="expiry">If the connection drops, choose Retry to continue where it stopped</p><p class="error" id="error" role="alert"></p><button class="button secondary wide" id="choose-again">Choose other files</button></div>`;
  const done = new Set(), button = document.querySelector('#flick'), error = document.querySelector('#error');
  document.querySelector('#choose-again').onclick = () => choose(session);
  async function sendFiles() {
    button.disabled = true; document.querySelector('#choose-again').disabled = true; error.textContent = '';
    const controller = new AbortController(); uploadAbort = controller;
    try {
      for (let i = 0; i < files.length; i++) {
        if (done.has(i)) continue;
        const file = files[i], label = document.querySelector(`#progress-label-${i}`), progress = document.querySelector(`#progress-${i}`);
        label.textContent = 'Preparing…';
        const hash = await fingerprint(file, label, controller.signal);
        let upload = await api(`/api/sessions/${session.id}/uploads`, { method:'POST', headers:{ Authorization:`Bearer ${session.sender}`, 'Content-Type':'application/json' }, body:JSON.stringify({ name:file.name, size:file.size, fingerprint:hash }), signal:controller.signal });
        let offset = upload.offset;
        do {
          progress.value = file.size ? Math.floor(offset / file.size * 100) : 0;
          label.textContent = `Sending · ${progress.value}%`;
          const response = await fetch(`/api/sessions/${session.id}/uploads/${upload.id}`, { method:'PUT', headers:{ Authorization:`Bearer ${session.sender}`, 'Content-Type':'application/octet-stream', 'Upload-Offset':String(offset) }, body:file.slice(offset, Math.min(offset + upload.chunkSize, file.size)), signal:controller.signal });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'Connection interrupted');
          offset = result.offset;
          if (result.complete) break;
        } while (true);
        done.add(i); progress.value = 100; label.textContent = 'Sent · 100%';
      }
      button.textContent = 'All files sent';
      document.querySelector('#choose-again').disabled = false;
      document.querySelector('#choose-again').textContent = 'Send more files';
    } catch (err) {
      if (controller.signal.aborted || !panel.isConnected) return;
      error.textContent = `${err.message}. Retry to continue.`; button.disabled = false; button.textContent = 'Retry'; document.querySelector('#choose-again').disabled = false;
    }
  }
  button.onclick = sendFiles;
  let start; const list = document.querySelector('#transfer-list');
  list.addEventListener('touchstart', e => { start = e.touches[0].clientY; }, { passive:true });
  list.addEventListener('touchend', e => { if (!button.disabled && start - e.changedTouches[0].clientY > 70) sendFiles(); start = null; }, { passive:true });
}
const params = new URLSearchParams(location.hash.slice(1)); const share = params.get('share'), code = params.get('join'); if (share && /^[A-Za-z0-9_-]{43}$/.test(share)) sharedView(share); else if (code && /^\d{8}$/.test(code)) { history.replaceState(null,'','/'); send(code); } else home();
