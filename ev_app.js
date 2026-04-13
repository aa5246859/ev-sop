// ============================================================
// 充電樁安裝 SOP — 前端邏輯
// 把 API_URL 換成你的 Apps Script 部署網址
// ============================================================

var API_URL = 'https://script.google.com/macros/s/AKfycbyFB3mZ0a0HYckVzFbC2zwIafv6xM92-981ytEZiRGCHrx4EoCanEP_uCr9hHaXXbZL/exec';

(function () {
  var TOTAL = 15;
  var currentId = null, editingId = null;
  var casesCache = [], sitesCache = null, notesCache = [];
  var loading = false;
  var currentFilter = 'all';

  function statusLabel(s) {
    if (s === 'confirmed') return '確定安裝';
    if (s === 'done') return '已完成';
    return '排程中';
  }
  function statusClass(s) {
    if (s === 'confirmed') return 'status-confirmed';
    if (s === 'done') return 'status-done';
    return 'status-pending';
  }

  /* ---- HELPERS ---- */
  function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function gv(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function sv(id, v) { var e = document.getElementById(id); if (e) e.value = v || ''; }
  function el(id) { return document.getElementById(id); }

  /* ---- API ---- */
  function api(action, data) {
    var url = API_URL + '?action=' + encodeURIComponent(action);
    if (data) url += '&data=' + encodeURIComponent(JSON.stringify(data));
    return fetch(url)
      .then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: e.toString() }; });
  }

  function apiDel(action, id) {
    var url = API_URL + '?action=' + encodeURIComponent(action) + '&id=' + encodeURIComponent(id);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: e.toString() }; });
  }

  /* ---- LOADING UI ---- */
  function showLoading(msg) {
    var ov = el('loading-overlay');
    if (ov) { ov.querySelector('p').textContent = msg || '載入中…'; ov.style.display = 'flex'; }
  }
  function hideLoading() { var ov = el('loading-overlay'); if (ov) ov.style.display = 'none'; }

  /* ---- TABS ---- */
  function switchTab(id) {
    document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    el(id).classList.add('active');
    var btn = document.querySelector('[data-tab="' + id + '"]');
    if (btn) btn.classList.add('active');
    if (id === 'cases') renderList();
    if (id === 'sites') renderSites();
    if (id === 'notes') renderNotes();
  }

  /* ---- REMINDERS ---- */
  function renderReminders() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    var td = today.toISOString().slice(0, 10), tm = tomorrow.toISOString().slice(0, 10);
    var up = casesCache.filter(function (c) {
      if (!c.date) return false;
      if ((c.steps || []).filter(Boolean).length === TOTAL) return false;
      return c.date === td || c.date === tm;
    });
    var area = el('reminder-area');
    if (!area) return;
    if (!up.length) { area.innerHTML = ''; return; }
    area.innerHTML = up.map(function (c) {
      var label = c.date === td ? '今天施工' : '明天施工，出門前請確認';
      var div = document.createElement('div');
      div.className = 'reminder-banner';
      div.addEventListener('click', function () { openCase(c.id); });
      div.innerHTML = '<div class="reminder-top"><span>⚠</span><span class="reminder-title">' + esc(label) + '</span></div>'
        + '<div class="reminder-sub">' + esc(c.name || '') + ' ' + esc(c.addr || '') + ' ' + esc(c.charger || '') + ' → 點擊查看確認清單</div>';
      return div.outerHTML;
    }).join('');
  }

  /* ---- CASE LIST ---- */
  function loadAndRenderList() {
    showLoading('載入案件中…');
    api('getCases').then(function (res) {
      hideLoading();
      if (res.ok) { casesCache = res.data || []; renderList(); }
      else { alert('載入失敗：' + res.error); }
    });
  }

  function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-tab').forEach(function (t) {
      t.className = 'filter-tab';
    });
    if (btn) btn.className = 'filter-tab active-' + f;
    renderList();
  }

  function renderList() {
    showList();
    var filtered = currentFilter === 'all' ? casesCache : casesCache.filter(function (c) {
      var s = c.status || 'pending';
      return s === currentFilter;
    });
    var listEl = el('case-list-body');
    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty-state">' + (currentFilter === 'all' ? '還沒有案件<br>點右上角「＋ 新增案件」開始' : '沒有「' + statusLabel(currentFilter) + '」的案件') + '</div>';
      renderReminders(); return;
    }
    listEl.innerHTML = '';
    filtered.forEach(function (c) {
      var done = (c.steps || []).filter(Boolean).length;
      var pct = Math.round(done / TOTAL * 100);
      var dc = done === TOTAL ? 'dot-done' : done > 0 ? 'dot-wip' : 'dot-new';
      var hasSid = c.sidPhotos && c.sidPhotos.length > 0;
      var pillarTag = c.pillar === 'yes' ? '<div class="pillar-yes">立柱 ✓</div>' : c.pillar === 'no' ? '<div class="pillar-no">不立柱</div>' : '';
      var statusTag = '<div class="' + statusClass(c.status) + '">' + statusLabel(c.status) + '</div>';
      var card = document.createElement('div');
      card.className = 'case-card';
      card.addEventListener('click', function () { openCase(c.id); });
      card.innerHTML = '<div class="case-card-top">'
        + '<div><div class="case-card-name">' + esc(c.name || '未命名') + '</div>'
        + '<div class="case-card-addr">' + esc(c.addr || '—') + '</div>'
        + (c.status === 'pending' && c.reason ? '<div class="reason-tag">原因：' + esc(c.reason) + '</div>' : '')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">'
        + statusTag
        + (c.charger ? '<div class="case-card-brand">' + esc(c.charger) + '</div>' : '')
        + (c.switchbox ? '<div style="font-size:10px;background:var(--blue-bg);color:var(--blue);padding:2px 6px;border-radius:4px;font-weight:500;">' + esc(c.switchbox) + '</div>' : '')
        + pillarTag + (hasSid ? '<div class="sid-badge">SID ✓</div>' : '')
        + '</div></div>'
        + '<div class="case-card-bottom">'
        + '<div class="status-dot ' + dc + '"></div>'
        + '<div class="mini-bar-outer"><div class="mini-bar-inner" style="width:' + pct + '%"></div></div>'
        + '<span class="case-card-pct">' + done + '/' + TOTAL + '</span>'
        + '<span class="case-card-date">' + (c.date || (c.status === 'pending' ? '待定' : '')) + '</span>'
        + '</div>';
      var editBtn = document.createElement('button');
      editBtn.textContent = '編輯';
      editBtn.style.cssText = 'background:var(--blue-bg);color:var(--blue);border:1px solid rgba(79,156,249,0.25);border-radius:5px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;';
      editBtn.addEventListener('click', function (e) { e.stopPropagation(); openEdit(c.id); });
      var delBtn = document.createElement('button');
      delBtn.textContent = '刪除';
      delBtn.style.cssText = 'background:var(--red-bg);color:var(--red);border:1px solid rgba(248,113,113,0.2);border-radius:5px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;';
      delBtn.addEventListener('click', function (e) { e.stopPropagation(); delCase(c.id, c.name || ''); });
      card.querySelector('.case-card-bottom').appendChild(editBtn);
      card.querySelector('.case-card-bottom').appendChild(delBtn);
      listEl.appendChild(card);
    });
    renderReminders();
  }

  function showList() {
    el('view-list').style.display = '';
    el('view-detail').style.display = 'none';
    el('header-sub').textContent = '充明電能｜現場作業手冊';
  }

  /* ---- OPEN CASE ---- */
  function openCase(id) {
    currentId = id;
    var c = casesCache.find(function (x) { return x.id === id; });
    if (!c) return;
    el('header-sub').textContent = c.name || '案件';
    el('view-list').style.display = 'none';
    el('view-detail').style.display = '';
    el('detail-info').innerHTML =
      row('客戶', c.name) + row('電話', c.phone) + row('地點', c.addr)
      + row('開關箱', c.switchbox) + row('充電樁', c.charger)
      + row('立柱', c.pillar === 'yes' ? '是' : c.pillar === 'no' ? '否' : '未確認')
      + row('狀態', statusLabel(c.status))
      + (c.status === 'pending' && c.reason ? row('排程原因', c.reason) : '')
      + row('安裝日期', c.date);
    var steps = c.steps || Array(TOTAL).fill(false);
    for (var i = 0; i < TOTAL; i++) {
      var s = el('ds' + i), ch = el('dc' + i);
      if (s && ch) { if (steps[i]) { s.classList.add('step-done'); ch.textContent = '✓'; } else { s.classList.remove('step-done'); ch.textContent = '○'; } }
    }
    var pd = c.predep || [false, false, false, false];
    for (var j = 0; j < 4; j++) { var pde = el('pd' + j); if (pde) { pde.classList.toggle('on', !!pd[j]); pde.textContent = pd[j] ? '✓' : ''; } }
    if (el('pd-charger')) el('pd-charger').textContent = c.charger || '尚未設定';
    if (el('pd-switchbox')) el('pd-switchbox').textContent = c.switchbox || '尚未設定';
    if (el('pd-pillar')) el('pd-pillar').textContent = c.pillar === 'yes' ? '是 — 需準備立柱' : c.pillar === 'no' ? '否 — 不需立柱' : '尚未確認';
    renderPhotoGrid('sid-grid', c.sidPhotos || [], 'sid');
    renderPhotoGrid('done-grid', c.donePhotos || [], 'done');
    updateDP();
  }

  function row(label, val) {
    return '<div class="case-info-row"><span class="case-info-label">' + label + '</span><span class="case-info-val">' + esc(val || '—') + '</span></div>';
  }

  function dtoggle(i) {
    var c = casesCache.find(function (x) { return x.id === currentId; }); if (!c) return;
    if (!c.steps) c.steps = Array(TOTAL).fill(false);
    c.steps[i] = !c.steps[i];
    var s = el('ds' + i), ch = el('dc' + i);
    s.classList.toggle('step-done'); ch.textContent = c.steps[i] ? '✓' : '○';
    updateDP();
    api('saveCase', c);
  }

  function updateDP() {
    var done = document.querySelectorAll('#view-detail .step-done').length;
    el('d-bar').style.width = Math.round(done / TOTAL * 100) + '%';
    el('d-bar-txt').textContent = done + ' / ' + TOTAL;
  }

  function resetCase() {
    var c = casesCache.find(function (x) { return x.id === currentId; }); if (!c) return;
    if (!confirm('確定重置所有步驟？')) return;
    c.steps = Array(TOTAL).fill(false);
    for (var i = 0; i < TOTAL; i++) { var s = el('ds' + i), ch = el('dc' + i); if (s) s.classList.remove('step-done'); if (ch) ch.textContent = '○'; }
    updateDP();
    api('saveCase', c);
  }

  function deleteCase() {
    var c = casesCache.find(function (x) { return x.id === currentId; });
    delCase(currentId, (c && c.name) || '此案件');
  }

  function delCase(id, name) {
    if (!confirm('確定要刪除「' + name + '」嗎？\n所有進度和照片都會一併刪除，無法復原。')) return;
    showLoading('刪除中…');
    apiDel('deleteCase', id).then(function (res) {
      hideLoading();
      casesCache = casesCache.filter(function (x) { return x.id !== id; });
      if (currentId === id) showList();
      renderList();
    });
  }

  function togglePredep(i) {
    var c = casesCache.find(function (x) { return x.id === currentId; }); if (!c) return;
    if (!c.predep) c.predep = [false, false, false, false];
    c.predep[i] = !c.predep[i];
    var pde = el('pd' + i); var v = c.predep[i];
    pde.classList.toggle('on', v); pde.textContent = v ? '✓' : '';
    api('saveCase', c);
  }

  /* ---- PHOTOS ---- */
  function renderPhotoGrid(gridId, photos, type) {
    var grid = el(gridId);
    if (!photos || !photos.length) { grid.innerHTML = '<div class="photo-empty">尚未上傳' + (type === 'sid' ? 'SID 卡' : '完工') + '照片</div>'; return; }
    grid.innerHTML = '';
    photos.forEach(function (src, i) {
      var wrap = document.createElement('div'); wrap.className = 'photo-thumb-wrap';
      var img = document.createElement('img'); img.className = 'photo-thumb'; img.src = src;
      var btn = document.createElement('button'); btn.className = 'photo-del'; btn.textContent = '×';
      btn.addEventListener('click', function () { delPhoto(type, i); });
      wrap.appendChild(img); wrap.appendChild(btn); grid.appendChild(wrap);
    });
  }

  function handlePhoto(input, type) {
    var files = Array.from(input.files); if (!files.length) return;
    var c = casesCache.find(function (x) { return x.id === currentId; }); if (!c) return;
    var key = type === 'sid' ? 'sidPhotos' : 'donePhotos';
    if (!c[key]) c[key] = [];
    var done = 0;
    showLoading('上傳照片中…');
    files.forEach(function (f) {
      var r = new FileReader();
      r.onload = function (e) {
        c[key].push(e.target.result); done++;
        if (done === files.length) {
          api('saveCase', c).then(function () {
            hideLoading();
            renderPhotoGrid(type === 'sid' ? 'sid-grid' : 'done-grid', c[key], type);
          });
        }
      };
      r.readAsDataURL(f);
    });
    input.value = '';
  }

  function delPhoto(type, i) {
    if (!confirm('刪除這張照片？')) return;
    var c = casesCache.find(function (x) { return x.id === currentId; }); if (!c) return;
    var key = type === 'sid' ? 'sidPhotos' : 'donePhotos';
    c[key].splice(i, 1);
    api('saveCase', c).then(function () {
      renderPhotoGrid(type === 'sid' ? 'sid-grid' : 'done-grid', c[key], type);
    });
  }

  /* ---- MODAL ---- */
  function buildAddrSel() {
    var sel = el('f-addr'); var prev = sel.value;
    sel.innerHTML = '<option value="">選擇社區</option>';
    var sites = sitesCache || {};
    for (var city in sites) {
      var g = document.createElement('optgroup'); g.label = city;
      sites[city].forEach(function (s) { var o = document.createElement('option'); o.textContent = s; g.appendChild(o); });
      sel.appendChild(g);
    }
    var ot = document.createElement('option'); ot.value = '其他'; ot.textContent = '其他（手動輸入）'; sel.appendChild(ot);
    sel.value = prev || '';
  }

  function openModal() {
    editingId = null; buildAddrSel();
    el('modal-title').textContent = '新增案件';
    ['f-name', 'f-phone', 'f-addr-custom'].forEach(function (id) { sv(id, ''); });
    ['f-addr', 'f-switchbox', 'f-charger', 'f-pillar'].forEach(function (id) { sv(id, ''); });
    sv('f-status', 'pending');
    sv('f-reason', '');
    sv('f-reason-custom', '');
    el('f-addr-custom-wrap').style.display = 'none';
    el('f-reason-wrap').style.display = '';
    el('f-reason-custom-wrap').style.display = 'none';
    el('f-date').value = new Date().toISOString().slice(0, 10);
    el('modal').classList.add('open');
  }

  function openEdit(id) {
    var c = casesCache.find(function (x) { return x.id === id; }); if (!c) return;
    editingId = id; buildAddrSel();
    el('modal-title').textContent = '編輯案件';
    sv('f-name', c.name); sv('f-phone', c.phone);
    var sel = el('f-addr');
    var opts = Array.from(sel.options).map(function (o) { return o.value; });
    if (opts.indexOf(c.addr) >= 0) { sel.value = c.addr; el('f-addr-custom-wrap').style.display = 'none'; }
    else { sel.value = '其他'; sv('f-addr-custom', c.addr); el('f-addr-custom-wrap').style.display = ''; }
    sv('f-switchbox', c.switchbox); sv('f-charger', c.charger); sv('f-pillar', c.pillar);
    sv('f-status', c.status || 'pending');
    var isPending = (c.status || 'pending') === 'pending';
    el('f-reason-wrap').style.display = isPending ? '' : 'none';
    var r = c.reason || '';
    var knownReasons = ['等待客戶確認圖面','等待師傅排期','等待客戶回覆時間','等待社區審核','客戶暫緩','其他'];
    if (r && knownReasons.indexOf(r) < 0) {
      sv('f-reason', '其他'); sv('f-reason-custom', r);
      el('f-reason-custom-wrap').style.display = '';
    } else {
      sv('f-reason', r); sv('f-reason-custom', '');
      el('f-reason-custom-wrap').style.display = r === '其他' ? '' : 'none';
    }
    el('f-date').value = c.date || '';
    el('modal').classList.add('open');
  }

  function closeModal() { el('modal').classList.remove('open'); }

  function saveCase() {
    var name = gv('f-name').trim(); if (!name) { alert('請填寫客戶姓名'); return; }
    var addr = gv('f-addr');
    if (addr === '其他') addr = gv('f-addr-custom').trim();
    var status = gv('f-status') || 'pending';
    var reason = gv('f-reason');
    if (reason === '其他') reason = gv('f-reason-custom').trim() || '其他';
    var data = { name: name, phone: gv('f-phone').trim(), addr: addr, switchbox: gv('f-switchbox'), charger: gv('f-charger'), pillar: gv('f-pillar'), status: status, reason: status === 'pending' ? reason : '', date: gv('f-date') };
    showLoading('儲存中…');
    if (editingId) {
      var c = casesCache.find(function (x) { return x.id === editingId; });
      if (c) Object.assign(c, data);
      api('saveCase', c).then(function () { hideLoading(); closeModal(); renderList(); });
    } else {
      var nc = Object.assign({ id: gid(), steps: Array(TOTAL).fill(false), sidPhotos: [], donePhotos: [], predep: [false, false, false, false] }, data);
      casesCache.unshift(nc);
      api('saveCase', nc).then(function () { hideLoading(); closeModal(); renderList(); });
    }
  }

  /* ---- SITES ---- */
  function loadAndRenderSites() {
    showLoading('載入地點中…');
    api('getSites').then(function (res) {
      hideLoading();
      if (res.ok) {
        if (res.data) { sitesCache = res.data; }
        else { sitesCache = getDefaultSites(); saveSitesToServer(sitesCache); }
        renderSites();
      }
    });
  }

  function getDefaultSites() {
    return {
      '臺北': ['樂水莊','名豐時藝','敦峰','仰千里','云硯','天喆','天母紘琚','日升月恆'],
      '新北': ['久年青田','亞昕昕世代','幸福公園百合館','至真','傳家臻品','板信雙子星','誠','國美大悅','峰景翠峰','三多立涵美'],
      '桃園': ['誠豐大廈','京澄無為-上善若水','中麗NO7','太子馥'],
      '新竹': ['打里摺大榆二','小日山青','富宇九如','回建築'],
      '台中': ['碧根21號','打里摺春上楓樹','打里摺楓樹四季','森茂松竹','惠宇敦南','宏台敦旭'],
      '雲林': ['青森綠川'],
      '臺南': ['水舞川']
    };
  }

  function saveSitesToServer(data) {
    api('saveSites', data);
  }

  function renderSites() {
    var sites = sitesCache || {};
    var body = el('sites-body'); body.innerHTML = '';
    Object.keys(sites).forEach(function (city) {
      var block = document.createElement('div'); block.className = 'city-block';
      block.innerHTML = '<div class="city-label"><span class="city-badge">' + esc(city) + '</span></div><div class="site-list"></div>';
      var list = block.querySelector('.site-list');
      (sites[city] || []).forEach(function (s) {
        var chip = document.createElement('div'); chip.className = 'site-chip'; chip.textContent = s;
        var btn = document.createElement('button'); btn.className = 'site-chip-del'; btn.textContent = '×';
        btn.addEventListener('click', function (e) { e.stopPropagation(); delSite(city, s); });
        chip.appendChild(btn); list.appendChild(chip);
      });
      body.appendChild(block);
    });
  }

  function addSite() {
    var city = el('new-city').value.trim(); var name = el('new-site').value.trim();
    if (!city || !name) { alert('請填寫縣市和地點名稱'); return; }
    if (!sitesCache[city]) sitesCache[city] = [];
    if (sitesCache[city].indexOf(name) >= 0) { alert('此地點已存在'); return; }
    sitesCache[city].push(name);
    el('new-city').value = ''; el('new-site').value = '';
    renderSites(); buildAddrSel();
    saveSitesToServer(sitesCache);
  }

  function delSite(city, name) {
    if (!confirm('確定要刪除「' + name + '」嗎？\n刪除後無法復原。')) return;
    sitesCache[city] = sitesCache[city].filter(function (s) { return s !== name; });
    if (!sitesCache[city].length) delete sitesCache[city];
    renderSites(); buildAddrSel();
    saveSitesToServer(sitesCache);
  }

  /* ---- NOTES ---- */
  function loadAndRenderNotes() {
    showLoading('載入筆記中…');
    api('getNotes').then(function (res) {
      hideLoading();
      if (res.ok) { notesCache = res.data || []; renderNotes(); }
    });
  }

  function renderNotes() {
    var notesEl = el('notes-body');
    if (!notesCache.length) { notesEl.innerHTML = '<div class="empty-state">還沒有筆記<br>點右上角「＋ 新增筆記」</div>'; return; }
    notesEl.innerHTML = '';
    notesCache.forEach(function (n) {
      var preview = (n.body || '').slice(0, 40) + (n.body && n.body.length > 40 ? '…' : '');
      var card = document.createElement('div'); card.className = 'note-card';
      var toggle = document.createElement('div'); toggle.className = 'note-toggle';
      toggle.innerHTML = '<div style="flex:1;min-width:0"><div class="note-title">' + esc(n.title) + '</div>'
        + '<div style="font-size:10px;color:var(--muted);margin-top:1px">' + esc(n.date) + (preview ? ' · ' + esc(preview) : '') + '</div></div>'
        + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span class="note-arrow">▼</span></div>';
      var delBtn = document.createElement('button'); delBtn.className = 'note-del'; delBtn.textContent = '×';
      delBtn.addEventListener('click', function (e) { e.stopPropagation(); delNote(n.id); });
      toggle.querySelector('div:last-child').insertBefore(delBtn, toggle.querySelector('.note-arrow'));
      var bodyWrap = document.createElement('div'); bodyWrap.className = 'note-body-wrap collapsed'; bodyWrap.style.maxHeight = '0';
      bodyWrap.innerHTML = '<div class="note-body" style="padding-top:8px">' + esc(n.body) + '</div>';
      toggle.addEventListener('click', function () {
        var collapsed = bodyWrap.classList.toggle('collapsed');
        bodyWrap.style.maxHeight = collapsed ? '0' : bodyWrap.scrollHeight + 'px';
        toggle.querySelector('.note-arrow').style.transform = collapsed ? '' : 'rotate(180deg)';
      });
      card.appendChild(toggle); card.appendChild(bodyWrap); notesEl.appendChild(card);
    });
  }

  function addNote() {
    var id = gid(); var today = new Date().toLocaleDateString('zh-TW');
    var notesEl = el('notes-body');
    var card = document.createElement('div'); card.className = 'note-card'; card.id = 'nc' + id;
    var titleInput = document.createElement('input');
    titleInput.style.cssText = 'width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:6px 9px;font-size:13px;font-weight:700;color:var(--text);font-family:inherit;outline:none;margin-bottom:6px;';
    titleInput.placeholder = '標題';
    var textarea = document.createElement('textarea'); textarea.className = 'note-edit-area'; textarea.placeholder = '輸入備忘內容…';
    var saveBtn = document.createElement('button'); saveBtn.className = 'note-save-btn'; saveBtn.textContent = '儲存';
    saveBtn.addEventListener('click', function () {
      var title = titleInput.value.trim() || '（無標題）';
      var body = textarea.value.trim();
      var note = { id: id, title: title, body: body, date: today };
      showLoading('儲存筆記…');
      api('saveNote', note).then(function () {
        hideLoading();
        notesCache.unshift(note); renderNotes();
      });
    });
    card.appendChild(titleInput); card.appendChild(textarea); card.appendChild(saveBtn);
    notesEl.insertBefore(card, notesEl.firstChild);
    titleInput.focus();
  }

  function delNote(id) {
    if (!confirm('確定刪除此筆記？')) return;
    showLoading('刪除中…');
    apiDel('deleteNote', id).then(function () {
      hideLoading();
      notesCache = notesCache.filter(function (n) { return n.id !== id; }); renderNotes();
    });
  }

  /* ---- GEN CHECKLIST ---- */
  var genState = Array(TOTAL).fill(false);
  function gtoggle(i) {
    genState[i] = !genState[i]; var s = el('gs' + i), ch = el('gc' + i);
    s.classList.toggle('step-done'); ch.textContent = genState[i] ? '✓' : '○';
    var done = genState.filter(Boolean).length;
    el('g-bar').style.width = Math.round(done / TOTAL * 100) + '%';
    el('g-bar-txt').textContent = done + ' / ' + TOTAL;
  }
  function resetGen() {
    for (var i = 0; i < TOTAL; i++) { genState[i] = false; var s = el('gs' + i), ch = el('gc' + i); if (s) s.classList.remove('step-done'); if (ch) ch.textContent = '○'; }
    el('g-bar').style.width = '0%'; el('g-bar-txt').textContent = '0 / ' + TOTAL;
  }

  /* ---- EXPOSE GLOBALS ---- */
  window.setFilter = setFilter;
  window.switchTab = switchTab;
  window.openCase = openCase;
  window.openModal = openModal;
  window.openEdit = openEdit;
  window.closeModal = closeModal;
  window.saveCase = saveCase;
  window.showList = showList;
  window.deleteCase = deleteCase;
  window.resetCase = resetCase;
  window.dtoggle = dtoggle;
  window.togglePredep = togglePredep;
  window.handlePhoto = handlePhoto;
  window.delPhoto = delPhoto;
  window.renderSites = renderSites;
  window.addSite = addSite;
  window.delSite = delSite;
  window.renderNotes = renderNotes;
  window.addNote = addNote;
  window.delNote = delNote;
  window.gtoggle = gtoggle;
  window.resetGen = resetGen;

  /* ---- INIT ---- */
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
  });
  el('f-addr').addEventListener('change', function () {
    el('f-addr-custom-wrap').style.display = this.value === '其他' ? '' : 'none';
  });
  el('f-status').addEventListener('change', function () {
    el('f-reason-wrap').style.display = this.value === 'pending' ? '' : 'none';
    if (this.value !== 'pending') { el('f-reason-custom-wrap').style.display = 'none'; }
  });
  el('f-reason').addEventListener('change', function () {
    el('f-reason-custom-wrap').style.display = this.value === '其他' ? '' : 'none';
  });

  // 先載入案件和地點
  showLoading('連線中…');
  Promise.all([
    api('getCases'),
    api('getSites')
  ]).then(function (results) {
    hideLoading();
    var casesRes = results[0], sitesRes = results[1];
    if (casesRes.ok) casesCache = casesRes.data || [];
    if (sitesRes.ok) {
      sitesCache = sitesRes.data || getDefaultSites();
      if (!sitesRes.data) saveSitesToServer(sitesCache);
    }
    renderList();
  }).catch(function () {
    hideLoading();
    el('case-list-body').innerHTML = '<div class="empty-state" style="color:var(--red)">⚠ 無法連線<br>請確認 API_URL 是否設定正確</div>';
  });

})();
