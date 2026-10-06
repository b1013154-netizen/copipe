// 範囲コピー用ブックマークレット本体。
// index.html の「設定」タブがこのファイルを読み込み、__APP_URL__ を置き換えて javascript: URL を生成する。
(function () {
  var APP = '__APP_URL__';
  var BAR_ID = '__copipe_bar';

  if (document.getElementById(BAR_ID)) {
    if (window.__copipeStop) window.__copipeStop();
    return;
  }

  var startRange = null;
  var range = null;
  var text = '';
  var marker = null;
  var spacer = document.createElement('div');
  spacer.style.height = '160px';

  var bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.setAttribute('style', [
    'position:fixed', 'left:8px', 'right:8px', 'bottom:calc(8px + env(safe-area-inset-bottom))',
    'z-index:2147483647', 'background:#1f2937', 'color:#fff',
    'font:15px/1.4 -apple-system,BlinkMacSystemFont,sans-serif', 'border-radius:12px',
    'padding:10px 12px', 'display:flex', 'flex-wrap:wrap', 'gap:8px', 'align-items:center',
    'box-shadow:0 4px 16px rgba(0,0,0,.35)', 'text-align:left'
  ].join(';'));

  function render(message, buttons) {
    bar.textContent = '';
    var msg = document.createElement('div');
    msg.textContent = message;
    msg.style.flex = '1 1 100%';
    bar.appendChild(msg);
    buttons.forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.textContent = b[0];
      el.setAttribute('style', 'all:unset;padding:8px 14px;border-radius:8px;cursor:pointer;' +
        'font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;color:#fff;background:' +
        (b[2] ? '#2563eb' : '#4b5563'));
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        b[1]();
      });
      bar.appendChild(el);
    });
  }

  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (!p) return null;
      var r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
      return r;
    }
    return null;
  }

  function unselectable(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    var s = getComputedStyle(el);
    return s.userSelect === 'none' || s.webkitUserSelect === 'none';
  }

  function placeMarker(x, y) {
    removeMarker();
    marker = document.createElement('div');
    marker.setAttribute('style', 'position:absolute;z-index:2147483646;width:4px;height:24px;' +
      'background:#2563eb;border-radius:2px;pointer-events:none;' +
      'left:' + (x + window.scrollX - 2) + 'px;top:' + (y + window.scrollY - 12) + 'px');
    document.body.appendChild(marker);
  }

  function removeMarker() {
    if (marker && marker.parentNode) marker.parentNode.removeChild(marker);
    marker = null;
  }

  // ページ側が copy イベントを打ち消している（コピー禁止）かを調べる。
  // 出典を付け足すだけのサイトは打ち消した上でデータを入れるので、それは許可する。
  function copyBlocked() {
    var target = range.commonAncestorContainer;
    if (target.nodeType !== 1) target = target.parentElement;
    var ev;
    try {
      ev = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    } catch (err) {
      ev = new Event('copy', { bubbles: true, cancelable: true });
    }
    target.dispatchEvent(ev);
    if (!ev.defaultPrevented) return false;
    var data = ev.clipboardData && ev.clipboardData.getData('text/plain');
    return !data;
  }

  function writeClipboard(t) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, t.length);
      try { document.execCommand('copy'); } catch (err) { /* 何もしない */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(fallback);
    } else {
      fallback();
    }
  }

  function doCopy(openApp) {
    if (copyBlocked()) {
      render('このサイトはコピーが禁止されているため、コピーしませんでした。', [['閉じる', stop]]);
      return;
    }
    writeClipboard(text);
    if (openApp) {
      window.open(APP + '#t=' + encodeURIComponent(text) + '&u=' + encodeURIComponent(location.href), '_blank');
    }
    stop();
  }

  function waitStart() {
    startRange = null;
    range = null;
    text = '';
    removeMarker();
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    render('始点をタップしてください（スクロールしても大丈夫です）', [['やめる', stop]]);
  }

  function onTap(e) {
    if (bar.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (range) return;

    var r = caretAt(e.clientX, e.clientY);
    if (!r) return;
    if (unselectable(r.startContainer)) {
      render('この場所は選択できません。文章の上をタップしてください。', [['やめる', stop]]);
      return;
    }

    if (!startRange) {
      startRange = r;
      placeMarker(e.clientX, e.clientY);
      render('始点を決めました。スクロールして終点をタップしてください。', [['始点をやり直す', waitStart], ['やめる', stop]]);
      return;
    }

    var a = startRange;
    var b = r;
    if (a.compareBoundaryPoints(Range.START_TO_START, b) > 0) {
      var tmp = a; a = b; b = tmp;
    }
    range = document.createRange();
    range.setStart(a.startContainer, a.startOffset);
    range.setEnd(b.startContainer, b.startOffset);
    removeMarker();

    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    text = sel.toString() || range.toString();
    if (!text) {
      render('範囲が空でした。もう一度始点からタップしてください。', [['やり直す', waitStart], ['やめる', stop]]);
      return;
    }
    render(text.length + '文字を選択しました。', [
      ['コピーして保存', function () { doCopy(true); }, true],
      ['コピーのみ', function () { doCopy(false); }],
      ['やり直す', waitStart],
      ['やめる', stop]
    ]);
  }

  function stop() {
    document.removeEventListener('click', onTap, true);
    removeMarker();
    if (bar.parentNode) bar.parentNode.removeChild(bar);
    if (spacer.parentNode) spacer.parentNode.removeChild(spacer);
    window.__copipeStop = null;
  }

  window.__copipeStop = stop;
  // ページ末尾の文章が操作バーに隠れないよう、下に余白を足す。
  document.body.appendChild(spacer);
  document.body.appendChild(bar);
  document.addEventListener('click', onTap, true);
  waitStart();
})();
