(function () {
  'use strict';

  var HISTORY_KEY = 'copipe.history';
  var APPS_KEY = 'copipe.apps';
  var MAX_HISTORY = 200;

  var DEFAULT_APPS = [
    { name: 'LINE', url: 'https://line.me/R/share?text={text}' },
    { name: 'X', url: 'https://x.com/intent/post?text={text}' },
    { name: 'メモ', url: 'shortcuts://run-shortcut?name=メモに追加&input=text&text={text}' },
    { name: 'Instagram', url: 'instagram://app' },
    { name: 'Safari', url: '{web}' },
    { name: 'Chrome', url: '{chrome}' },
    { name: 'メール', url: 'mailto:?body={text}' }
  ];

  function $(id) { return document.getElementById(id); }

  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast('保存できませんでした（容量不足の可能性があります）');
    }
  }

  var history = load(HISTORY_KEY, []);
  var apps = load(APPS_KEY, DEFAULT_APPS.slice());
  var currentId = history.length ? history[0].id : null;

  function current() {
    for (var i = 0; i < history.length; i++) {
      if (history[i].id === currentId) return history[i];
    }
    return null;
  }

  function addEntry(text, src) {
    if (!text) return;
    if (history.length && history[0].text === text) {
      currentId = history[0].id;
      return;
    }
    var entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text, src: src || '', ts: Date.now() };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    currentId = entry.id;
    save(HISTORY_KEY, history);
  }

  // ブックマークレットから #t=本文&u=元ページ で渡される。
  function ingestHash() {
    if (location.hash.length < 2) return false;
    var params = new URLSearchParams(location.hash.slice(1));
    var t = params.get('t');
    if (t === null) return false;
    addEntry(t, params.get('u'));
    window.history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2000);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
    }
    legacyCopy(text);
    return Promise.resolve();
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    try { document.execCommand('copy'); } catch (e) { /* 何もしない */ }
    document.body.removeChild(ta);
  }

  function formatDate(ts) {
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function isUrl(text) {
    return /^https?:\/\/\S+$/.test(text.trim());
  }

  function buildUrl(template, text) {
    var trimmed = text.trim();
    var web = isUrl(trimmed) ? trimmed : 'https://www.google.com/search?q=' + encodeURIComponent(text);
    return template
      .replace('{chrome}', web.replace(/^http(s?):\/\//, function (m, s) { return s ? 'googlechromes://' : 'googlechrome://'; }))
      .replace('{web}', web)
      .replace('{text}', encodeURIComponent(text));
  }

  // ---- 本文タブ ----
  function renderDetail() {
    var e = current();
    $('empty').hidden = !!e;
    $('detail').hidden = !e;
    if (!e) return;
    $('text').value = e.text;
    $('meta-date').textContent = formatDate(e.ts) + '・' + e.text.length + '文字';
    var src = $('meta-src');
    src.textContent = e.src || '';
    src.href = e.src || '#';
    src.hidden = !e.src;
  }

  function renderAppButtons() {
    var box = $('apps');
    box.textContent = '';
    apps.forEach(function (app) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = app.name;
      b.addEventListener('click', function () {
        var text = $('text').value;
        copy(text);
        location.href = buildUrl(app.url, text);
      });
      box.appendChild(b);
    });
  }

  $('select-all').addEventListener('click', function () {
    var ta = $('text');
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
  });

  $('copy-all').addEventListener('click', function () {
    copy($('text').value).then(function () { toast('全文をコピーしました'); });
  });

  $('text').addEventListener('change', function () {
    var e = current();
    if (!e) return;
    e.text = $('text').value;
    save(HISTORY_KEY, history);
  });

  $('delete-one').addEventListener('click', function () {
    if (!confirm('このテキストを削除しますか？')) return;
    history = history.filter(function (h) { return h.id !== currentId; });
    currentId = history.length ? history[0].id : null;
    save(HISTORY_KEY, history);
    renderAll();
  });

  $('paste-in').addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast('このブラウザでは取り込めません');
      return;
    }
    navigator.clipboard.readText().then(function (t) {
      if (!t) { toast('クリップボードが空です'); return; }
      addEntry(t, '');
      renderAll();
      toast('取り込みました');
    }).catch(function () { toast('取り込みが許可されませんでした'); });
  });

  // ---- 履歴タブ ----
  function renderHistory() {
    var ul = $('history');
    ul.textContent = '';
    if (!history.length) {
      var li = document.createElement('li');
      li.textContent = '履歴はありません';
      ul.appendChild(li);
    }
    history.forEach(function (h) {
      var li = document.createElement('li');
      var date = document.createElement('div');
      date.className = 'date';
      date.textContent = formatDate(h.ts) + '・' + h.text.length + '文字';
      var preview = document.createElement('div');
      preview.className = 'preview';
      preview.textContent = h.text;
      li.appendChild(date);
      li.appendChild(preview);
      li.addEventListener('click', function () {
        currentId = h.id;
        renderDetail();
        showTab('detail');
      });
      ul.appendChild(li);
    });
    $('clear-all').hidden = !history.length;
  }

  $('clear-all').addEventListener('click', function () {
    if (!confirm('履歴をすべて削除しますか？')) return;
    history = [];
    currentId = null;
    save(HISTORY_KEY, history);
    renderAll();
  });

  // ---- 設定タブ ----
  function renderAppList() {
    var ul = $('app-list');
    ul.textContent = '';
    apps.forEach(function (app, i) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = app.name;
      var url = document.createElement('span');
      url.className = 'url';
      url.textContent = app.url;
      li.appendChild(name);
      li.appendChild(url);
      [['↑', -1], ['↓', 1]].forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = m[0];
        b.disabled = (i + m[1] < 0) || (i + m[1] >= apps.length);
        b.addEventListener('click', function () {
          var j = i + m[1];
          var tmp = apps[i]; apps[i] = apps[j]; apps[j] = tmp;
          saveApps();
        });
        li.appendChild(b);
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '削除';
      del.className = 'danger';
      del.addEventListener('click', function () {
        apps.splice(i, 1);
        saveApps();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function saveApps() {
    save(APPS_KEY, apps);
    renderAppList();
    renderAppButtons();
  }

  $('add-app').addEventListener('click', function () {
    var name = $('new-name').value.trim();
    var url = $('new-url').value.trim();
    if (!name || !url) { toast('表示名とURLを入力してください'); return; }
    apps.push({ name: name, url: url });
    $('new-name').value = '';
    $('new-url').value = '';
    saveApps();
  });

  $('reset-apps').addEventListener('click', function () {
    if (!confirm('送り先アプリを初期設定に戻しますか？')) return;
    apps = DEFAULT_APPS.slice();
    saveApps();
  });

  function appUrl() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }

  function loadBookmarklet() {
    fetch('bookmarklet.js', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (src) {
      var code = src
        .split('\n')
        .filter(function (line) { return !/^\s*\/\//.test(line); })
        .map(function (line) { return line.trim(); })
        .join('\n')
        .replace('__APP_URL__', appUrl());
      $('bm-code').value = 'javascript:' + encodeURIComponent(code);
    }).catch(function () {
      $('bm-code').value = 'ブックマークレットを読み込めませんでした。ページを再読み込みしてください。';
    });
  }

  $('copy-bm').addEventListener('click', function () {
    copy($('bm-code').value).then(function () { toast('コードをコピーしました'); });
  });

  // ---- タブ切り替え ----
  function showTab(name) {
    ['detail', 'history', 'settings'].forEach(function (t) {
      $('tab-' + t).hidden = t !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
    b.addEventListener('click', function () {
      var tab = b.getAttribute('data-tab');
      if (tab === 'history') renderHistory();
      showTab(tab);
    });
  });

  function renderAll() {
    renderDetail();
    renderHistory();
  }

  window.addEventListener('hashchange', function () {
    if (ingestHash()) {
      renderAll();
      showTab('detail');
    }
  });

  ingestHash();
  renderAll();
  renderAppButtons();
  renderAppList();
  loadBookmarklet();
})();
