/* 小家电理论题库 · 单页应用（数据仅存 localStorage） */
/* SECTION: core */
(function () {
  "use strict";
  var DATA = window.QUIZ_DATA || [];
  var META = window.QUIZ_META || {};
  var SECTIONS = [
    { key: "single", label: "单项选择题" },
    { key: "multi", label: "多项选择题" },
    { key: "judge", label: "判断题" }
  ];
  var KEY = "xjdquiz.v1";
  /* 记忆曲线间隔（分钟）：5分钟、30分钟、12小时、1天、2天、4天、7天、15天 */
  var IV = [5, 30, 720, 1440, 2880, 5760, 10080, 21600];

  var state = { rec: {}, star: {}, cleared: {}, days: {} };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.rec) state = { rec: s.rec || {}, star: s.star || {}, cleared: s.cleared || {}, days: s.days || {} };
    } catch (e) { }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert("本地存储写入失败：" + e.message); } }

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function typeLabel(t) { return t === "single" ? "单选" : t === "multi" ? "多选" : "判断"; }
  function byId(id) { for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i]; return null; }
  function choices(q) {
    if (q.type === "judge") return [{ l: "对", t: "对" }, { l: "错", t: "错" }];
    var out = [];
    for (var i = 0; i < (q.opts || []).length; i++) {
      if (q.opts[i] !== "") out.push({ l: "ABCD"[i], t: q.opts[i] });
    }
    return out;
  }
  function shuffle(a) { var r = a.slice(); for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; } return r; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmtClock(sec) { var m = Math.floor(sec / 60), s = sec % 60; return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); }
  function fmtDue(ts) {
    if (!ts) return "待首学";
    var d = new Date(ts), now = new Date();
    if (d <= now) return "已到期";
    var diff = Math.round((d - now) / 60000);
    if (diff < 60) return diff + "分钟后";
    if (diff < 1440) return Math.round(diff / 60) + "小时后";
    return Math.round(diff / 1440) + "天后";
  }
  function recOf(id) { return state.rec[id]; }
  function isWrong(q) { var r = recOf(q.id); return r && r.s === 0 && !state.cleared[q.id]; }
  function dueList() { var now = Date.now(), out = []; for (var i = 0; i < DATA.length; i++) { var r = recOf(DATA[i].id); if (r && r.due && r.due <= now) out.push(DATA[i]); } return out; }
  function attempted() { var n = 0; for (var k in state.rec) if (state.rec[k].n > 0) n++; return n; }
  function accuracy() { var a = 0, c = 0; for (var i = 0; i < DATA.length; i++) { var r = recOf(DATA[i].id); if (r && r.n > 0) { a += r.n; c += r.c || 0; } } return a ? Math.round(c / a * 100) : null; }
  function wrongList() { return DATA.filter(isWrong); }
  function starList() { return DATA.filter(function (q) { return state.star[q.id]; }); }
  function dayAdd(ok) { var t = today(); var d = state.days[t] || (state.days[t] = { a: 0, c: 0 }); d.a++; if (ok) d.c++; }
  function countOf(type) { return DATA.filter(function (x) { return x.type === type; }).length; }

  function record(q, ok) {
    var r = state.rec[q.id] || (state.rec[q.id] = { s: 0, n: 0, c: 0, due: 0, lvl: 0 });
    r.n++; r.c = (r.c || 0) + (ok ? 1 : 0); r.s = ok ? 1 : 0;
    if (ok) { r.lvl = Math.min((r.lvl || 0) + 1, IV.length - 1); } else { r.lvl = 0; delete state.cleared[q.id]; }
    r.due = Date.now() + IV[r.lvl] * 60000;
    dayAdd(ok); save();
  }
  /* 题目配图：优先公网链接；加载失败且非单文件环境时自动回退仓库内副本；均失败给出对照原稿页码提示 */
  function figNode(q) {
    if (!q.fig && !q.figfile) return "";
    var d = document.createElement("div");
    d.className = "fig";
    var im = document.createElement("img");
    im.alt = "第" + q.no + "题配图";
    im.loading = "lazy";
    var triedRepo = false;
    im.onerror = function () {
      if (!triedRepo && q.figfile && location.protocol !== "file:") {
        triedRepo = true;
        im.src = ["assets", "img", q.figfile].join("/");
        return;
      }
      d.innerHTML = "<div class='cap'>配图加载失败，可对照题库原稿第 " + q.page + " 页查看。</div>";
    };
    im.src = q.fig || ["assets", "img", q.figfile].join("/");
    d.appendChild(im);
    var cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = "题图（原稿第 " + q.page + " 页）";
    d.appendChild(cap);
    return d;
  }

  /* ---------- 路由 ---------- */
  var app = document.getElementById("app");
  var nav = document.getElementById("nav");
  var examTimer = null;
  function route() {
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    var h = location.hash || "#/home";
    var qi = h.indexOf("?");
    var path = qi < 0 ? h : h.slice(0, qi);
    var q = {};
    if (qi >= 0) h.slice(qi + 1).split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
    var marks = { "#/home": 0, "#/practice": 1, "#/exam": 2, "#/review": 3, "#/wrong": 4, "#/star": 5, "#/stats": 6, "#/settings": 7 };
    var links = nav.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) links[i].className = (links[i].getAttribute("href") === path) ? "on" : "";
    app.innerHTML = "";
    if (path === "#/practice") return viewQuiz(q);
    if (path === "#/exam") return viewExam(q);
    if (path === "#/review") return viewReview(q);
    if (path === "#/wrong") return viewWrong(q);
    if (path === "#/star") return viewStar(q);
    if (path === "#/stats") return viewStats();
    if (path === "#/settings") return viewSettings();
    return viewHome();
  }
  window.addEventListener("hashchange", route);

  function card(html) { var d = document.createElement("div"); d.className = "card"; d.innerHTML = html; return d; }
  function go(h) { location.hash = h; }
  function tile(cls, num, lab) { return "<div class='tile " + cls + "'><div class='num'>" + num + "</div><div class='lab'>" + lab + "</div></div>"; }

  /* SECTION: home */
  function viewHome() {
    var acc = accuracy();
    app.appendChild(card("<h2>学习概览</h2><div class='sub'>题库共 " + DATA.length + " 题（单选 " + countOf("single") + " / 多选 " + countOf("multi") + " / 判断 " + countOf("judge") + "）· 数据版本 v" + (META.version || 1) + "</div>" +
      "<div class='grid'>" +
      tile("", DATA.length, "总题数") + tile("g", attempted(), "已练题数") + tile("b", acc === null ? "—" : acc + "%", "累计正确率") +
      tile("r", wrongList().length, "待消错题") + tile("o", dueList().length, "到期复习") + tile("", starList().length, "收藏题数") +
      "</div>"));
    app.appendChild(card("<h2>开始练习</h2><div class='sub'>按题型刷题、组卷模考、或用记忆曲线复习到期题目</div><div class='row'>" +
      "<a class='btn pri' data-primary-action href='#/practice'>分型练习</a><a class='btn' href='#/exam'>模拟考试</a><a class='btn' href='#/review'>记忆复习（" + dueList().length + "）</a>" +
      "<a class='btn' href='#/wrong'>错题本（" + wrongList().length + "）</a><a class='btn' href='#/star'>收藏（" + starList().length + "）</a><a class='btn' href='#/stats'>统计</a></div>"));
    var rows = SECTIONS.map(function (s) {
      var list = DATA.filter(function (x) { return x.type === s.key; });
      var done = list.filter(function (x) { var r = recOf(x.id); return r && r.n > 0; }).length;
      var pct = list.length ? Math.round(done / list.length * 100) : 0;
      return "<div class='item'><span class='no'>" + esc(s.label) + "</span><span class='tx'><span class='t'>" + done + " / " + list.length + " 题已练</span>" +
        "<div class='prog' style='margin-top:6px'><i style='width:" + pct + "%'></i></div></span>" +
        "<a class='btn sm' href='#/practice?tp=" + s.key + "'>练习</a></div>";
    }).join("");
    app.appendChild(card("<h2>分型进度</h2><div class='list'>" + rows + "</div>"));
  }

  /* SECTION: quiz-engine —— 练习引擎（分型练习 / 错题重练 / 收藏练习 / 记忆复习共用） */
  function startQuiz(opts) {
    var list = opts.shuffleOrd ? shuffle(opts.list) : opts.list.slice();
    var idx = 0, answered = {};
    var perms = {};
    list.forEach(function (q) {
      var ch = choices(q);
      perms[q.id] = (opts.shuffleOpt && q.type !== "judge") ? shuffle(ch) : ch;
    });
    var t0 = Date.now();
    function cur() { return list[idx]; }
    function ansStr(q, sel) { return sel.slice().sort().join(","); }
    function isOk(q, sel) { return ansStr(q, sel) === q.ans; }
    function render() {
      app.innerHTML = "";
      var q = cur();
      var head = card("<div class='bar'><div class='qmeta'><span class='tag b'>" + esc(opts.title) + "</span><span class='tag'>" + typeLabel(q.type) + "</span><span class='tag'>原编号 " + q.no + " · 第 " + q.page + " 页</span>" + ((q.fig || q.figfile) ? "<span class='tag o'>含图</span>" : "") + "</div>" +
        "<div class='row' style='margin-left:auto'><button class='btn sm' id='st'>" + (state.star[q.id] ? "★ 已收藏" : "☆ 收藏") + "</button><a class='btn sm' href='" + opts.backHash + "'>退出</a></div></div>" +
        "<div class='bar'><span class='muted'>第 " + (idx + 1) + " / " + list.length + " 题</span><div class='prog'><i style='width:" + Math.round(idx / list.length * 100) + "%'></i></div></div>" +
        "<div class='stem'>" + esc(q.stem) + "</div><div id='figbox'></div><div class='opts' id='opts'></div><div id='fb'></div>" +
        "<div class='row' style='margin-top:14px'><button class='btn' id='prev' " + (idx === 0 ? "disabled" : "") + ">上一题</button>" +
        (q.type === "multi" ? "<button class='btn pri' id='commit' style='display:none'>提交本题</button>" : "") +
        "<button class='btn " + (q.type === "multi" ? "" : "pri") + "' id='next'>" + (idx === list.length - 1 ? "查看小结" : "下一题") + "</button></div>");
      app.appendChild(head);
      var fb = figNode(q);
      if (fb) head.querySelector("#figbox").appendChild(fb);
      var obox = head.querySelector("#opts");
      var st = answered[q.id];
      var pending = [];
      perms[q.id].forEach(function (o) {
        var b = document.createElement("button");
        b.className = "opt";
        b.innerHTML = "<span class='ol'>" + esc(o.l) + "</span>" + esc(o.t);
        if (st) {
          b.disabled = true;
          var mine = st.sel.indexOf(o.l) >= 0;
          var good = q.ans.split(",").indexOf(o.l) >= 0;
          if (mine) b.className += good ? " ok" : " bad";
          else if (good) b.className += " ok";
        } else if (q.type === "multi") {
          b.onclick = function () {
            var i2 = pending.indexOf(o.l);
            if (i2 >= 0) pending.splice(i2, 1); else pending.push(o.l);
            b.className = "opt" + (pending.indexOf(o.l) >= 0 ? " sel" : "");
            head.querySelector("#commit").style.display = pending.length ? "" : "none";
          };
        } else {
          b.onclick = function () {
            if (answered[q.id]) return;
            var ok = o.l === q.ans;
            answered[q.id] = { sel: [o.l], ok: ok };
            record(q, ok);
            render();
          };
        }
        obox.appendChild(b);
      });
      var cm = head.querySelector("#commit");
      if (cm) cm.onclick = function () {
        if (!pending.length) return;
        var ok = isOk(q, pending);
        answered[q.id] = { sel: pending.slice(), ok: ok };
        record(q, ok);
        render();
      };
      if (st) {
        var expHtml = q.exp ? "<div class='muted' style='margin-top:6px'>解析：" + esc(q.exp) + "</div>" : "";
        head.querySelector("#fb").innerHTML = "<div class='fb " + (st.ok ? "ok" : "bad") + "'>" + (st.ok ? "回答正确。" : "回答错误，正确答案：" + esc(q.ans) + "。") + expHtml + "</div>";
      }
      head.querySelector("#st").onclick = function () {
        if (state.star[q.id]) delete state.star[q.id]; else state.star[q.id] = 1;
        save(); render();
      };
      head.querySelector("#prev").onclick = function () { idx--; render(); };
      head.querySelector("#next").onclick = function () {
        if (idx === list.length - 1) return summary();
        idx++; render();
      };
    }
    function summary() {
      var a = 0, c = 0;
      list.forEach(function (q) { var s = answered[q.id]; if (s) { a++; if (s.ok) c++; } });
      var sec = Math.round((Date.now() - t0) / 1000);
      var wrongs = list.filter(function (q) { return answered[q.id] && !answered[q.id].ok; });
      app.innerHTML = "";
      app.appendChild(card("<h2>" + esc(opts.title) + " · 小结</h2><div class='sub'>用时 " + fmtClock(sec) + " · 已答 " + a + " / " + list.length + " 题</div>" +
        "<div class='grid'>" + tile("g", c, "答对") + tile("r", a - c, "答错") + tile("", list.length - a, "未答") + tile("b", a ? Math.round(c / a * 100) + "%" : "—", "正确率") + "</div>"));
      if (wrongs.length) {
        app.appendChild(card("<h2>本次错题</h2><div class='list'>" + wrongs.map(function (q) {
          return "<div class='item'><span class='no'>" + typeLabel(q.type) + q.no + "</span><span class='tx'><span class='t'>" + esc(q.stem) + "</span><div class='ans'>你的答案：" + esc((answered[q.id].sel || []).join(",")) + "　正确答案：" + esc(q.ans) + "</div></span></div>";
        }).join("") + "</div>"));
      }
      app.appendChild(card("<div class='row'><a class='btn pri' href='" + opts.backHash + "'>返回</a>" + (wrongs.length ? "<button class='btn' id='rw'>重练本次错题</button>" : "") + "</div>"));
      var rw = document.getElementById("rw");
      if (rw) rw.onclick = function () {
        startQuiz({ title: opts.title + "·错题重练", list: wrongs, shuffleOpt: opts.shuffleOpt, shuffleOrd: false, backHash: opts.backHash });
      };
    }
    render();
  }

  /* SECTION: practice */
  function viewQuiz(q) {
    var tp = q.tp || "all";
    if (q.go === "1" && q.id) {
      var one = byId(q.id);
      if (one) return startQuiz({ title: "单题查看 " + typeLabel(one.type) + one.no, list: [one], shuffleOpt: false, shuffleOrd: false, backHash: "#/practice?tp=" + tp });
    }
    var pool = DATA.filter(function (x) { return tp === "all" || x.type === tp; });
    if (q.go === "1" && pool.length) {
      return startQuiz({
        title: tp === "all" ? "全部题型" : (tp === "single" ? "单项选择题" : tp === "multi" ? "多项选择题" : "判断题"),
        list: pool, shuffleOpt: q.shuf !== "0", shuffleOrd: q.ord !== "0",
        backHash: "#/practice?tp=" + tp
      });
    }
    app.appendChild(card("<h2>分型练习</h2><div class='sub'>选择题型后开始；默认开启选项乱序与题目乱序，答完即时判分并计入记忆曲线。多选题点选选项后提交本题</div>" +
      "<div class='chips' id='tps'>" + [["all", "全部题型"], ["single", "单项选择"], ["multi", "多项选择"], ["judge", "判断"]].map(function (p) { return "<button class='chip" + (tp === p[0] ? " on" : "") + "' data-tp='" + p[0] + "'>" + p[1] + "（" + (p[0] === "all" ? DATA.length : countOf(p[0])) + "）</button>"; }).join("") + "</div>" +
      "<div class='row' style='margin-top:14px'><label class='ck'><input type='checkbox' id='shuf' checked>选项乱序</label><label class='ck'><input type='checkbox' id='ord' checked>题目乱序</label>" +
      "<button class='btn pri' data-primary-action id='go'>开始练习（" + pool.length + " 题）</button></div>" +
      "<hr class='hr'><div class='row'><span class='muted'>按原稿题号练单题</span>" +
      "<select id='gsec'>" + SECTIONS.map(function (s) { return "<option value='" + s.key + "'" + (tp === s.key ? " selected" : "") + ">" + s.label + "</option>"; }).join("") + "</select>" +
      "<input type='number' id='gno' min='1' max='1200' style='width:90px' placeholder='题号'>" +
      "<button class='btn' id='gone'>查看该题</button><span class='muted' id='gerr'></span></div>"));
    document.getElementById("tps").onclick = function (e) {
      var t = e.target; if (!t.dataset || !t.dataset.tp) return;
      go("#/practice?tp=" + t.dataset.tp);
    };
    document.getElementById("go").onclick = function () {
      var s = document.getElementById("shuf").checked ? "1" : "0";
      var o = document.getElementById("ord").checked ? "1" : "0";
      go("#/practice?tp=" + tp + "&shuf=" + s + "&ord=" + o + "&go=1");
    };
    document.getElementById("gone").onclick = function () {
      var sec = document.getElementById("gsec").value;
      var no = parseInt(document.getElementById("gno").value, 10);
      var err = document.getElementById("gerr");
      var hit = DATA.filter(function (x) { return x.type === sec && x.no === no; })[0];
      if (!hit) { err.textContent = "未找到该题号（注意判断题423未收录）"; return; }
      err.textContent = "";
      go("#/practice?tp=" + tp + "&id=" + hit.id + "&go=1");
    };
  }

  /* SECTION: review */
  function viewReview(q) {
    var due = dueList();
    if (q.go === "1") {
      if (!due.length) { go("#/review"); return; }
      return startQuiz({ title: "记忆复习", list: due, shuffleOpt: true, shuffleOrd: true, backHash: "#/review" });
    }
    var soon = DATA.filter(function (x) { var r = recOf(x.id); return r && r.due && r.due > Date.now(); })
      .sort(function (a, b) { return recOf(a.id).due - recOf(b.id).due; }).slice(0, 8);
    app.appendChild(card("<h2>记忆曲线复习</h2><div class='sub'>答对升一级、间隔拉长（5分钟→30分钟→12小时→1天→2天→4天→7天→15天）；答错回到第一级</div>" +
      "<div class='grid'>" + tile("o", due.length, "现在到期") + tile("", DATA.filter(function (x) { var r = recOf(x.id); return r && r.due; }).length, "已进入排程") + "</div>" +
      "<div class='row' style='margin-top:14px'><button class='btn pri' id='go' " + (due.length ? "" : "disabled") + ">开始复习（" + due.length + " 题）</button></div>"));
    document.getElementById("go").onclick = function () { go("#/review?go=1"); };
    if (soon.length) {
      app.appendChild(card("<h2>接下来到期</h2><div class='list'>" + soon.map(function (x) {
        return "<div class='item'><span class='no'>" + fmtDue(recOf(x.id).due) + "</span><span class='tx'><span class='t'>" + esc(x.stem) + "</span></span></div>";
      }).join("") + "</div>"));
    }
  }

  /* SECTION: wrong */
  function viewWrong(q) {
    var list = wrongList();
    if (q.go === "1" && list.length) return startQuiz({ title: "错题重练", list: list, shuffleOpt: true, shuffleOrd: true, backHash: "#/wrong" });
    app.appendChild(card("<h2>错题本</h2><div class='sub'>答错的题自动进入；重练答对后仍保留记录，可手动移出。共 " + list.length + " 题</div>" +
      (list.length ? "<div class='row'><button class='btn pri' id='go'>重练全部错题</button></div>" : "<div class='empty'>暂无错题</div>")));
    var g = document.getElementById("go"); if (g) g.onclick = function () { go("#/wrong?go=1"); };
    if (list.length) {
      app.appendChild(card("<div class='list'>" + list.map(function (x) {
        var r = recOf(x.id);
        return "<div class='item'><span class='no'>" + typeLabel(x.type) + x.no + "</span><span class='tx'><span class='t'>" + esc(x.stem) + "</span><div class='ans'>正确答案：" + esc(x.ans) + "　错 " + (r.n - (r.c || 0)) + " 次　下次复习：" + fmtDue(r.due) + "</div></span>" +
          "<button class='btn sm' data-rm='" + x.id + "'>移出</button></div>";
      }).join("") + "</div>"));
      app.onclick = function (e) {
        var t = e.target;
        if (t.dataset && t.dataset.rm) { state.cleared[t.dataset.rm] = 1; save(); app.onclick = null; route(); }
      };
    }
  }

  /* SECTION: star */
  function viewStar(q) {
    var list = starList();
    if (q.go === "1" && list.length) return startQuiz({ title: "收藏练习", list: list, shuffleOpt: true, shuffleOrd: true, backHash: "#/star" });
    app.appendChild(card("<h2>收藏</h2><div class='sub'>练习中点 ☆ 收藏；共 " + list.length + " 题</div>" +
      (list.length ? "<div class='row'><button class='btn pri' id='go'>练习收藏题</button></div>" : "<div class='empty'>暂无收藏</div>")));
    var g = document.getElementById("go"); if (g) g.onclick = function () { go("#/star?go=1"); };
    if (list.length) {
      app.appendChild(card("<div class='list'>" + list.map(function (x) {
        return "<div class='item'><span class='no'>" + typeLabel(x.type) + x.no + "</span><span class='tx'><span class='t'>" + esc(x.stem) + "</span><div class='ans'>正确答案：" + esc(x.ans) + "</div></span><button class='btn sm' data-rm='" + x.id + "'>取消</button></div>";
      }).join("") + "</div>"));
      app.onclick = function (e) {
        var t = e.target;
        if (t.dataset && t.dataset.rm) { delete state.star[t.dataset.rm]; save(); app.onclick = null; route(); }
      };
    }
  }

  /* SECTION: exam */
  var EX = null;
  function viewExam(q) {
    if (EX && EX.phase === "run") return renderExam();
    if (EX && EX.phase === "done") return renderExamResult();
    var st = { tp: "all", n: 50, shuf: true, ord: true };
    function poolSize() { return DATA.filter(function (x) { return st.tp === "all" || x.type === st.tp; }).length; }
    function renderCfg() {
      app.innerHTML = "";
      app.appendChild(card("<h2>模拟考试</h2><div class='sub'>计时作答、交卷判分；交卷前不显示对错。默认时长按题量自动（约 1.2 分钟/题），可改</div>" +
        "<div class='chips' id='tps'>" + [["all", "全部题型"], ["single", "单项选择"], ["multi", "多项选择"], ["judge", "判断"]].map(function (p) { return "<button class='chip" + (st.tp === p[0] ? " on" : "") + "' data-tp='" + p[0] + "'>" + p[1] + "</button>"; }).join("") + "</div>" +
        "<div class='row' style='margin-top:12px'><span class='muted'>题量</span>" + [20, 50, 100, 0].map(function (v) { return "<button class='chip" + (st.n === v ? " on" : "") + "' data-n='" + v + "'>" + (v === 0 ? "全部(" + poolSize() + ")" : v) + "</button>"; }).join("") + "</div>" +
        "<div class='row' style='margin-top:12px'><span class='muted'>时长</span><input type='number' id='min' min='1' max='300' style='width:90px' value='" + Math.max(10, Math.round((st.n || poolSize()) * 1.2)) + "'><span class='muted'>分钟</span>" +
        "<label class='ck'><input type='checkbox' id='shuf' " + (st.shuf ? "checked" : "") + ">选项乱序</label><label class='ck'><input type='checkbox' id='ord' " + (st.ord ? "checked" : "") + ">题目乱序</label></div>" +
        "<div class='row' style='margin-top:16px'><button class='btn pri' data-primary-action id='start'>开始考试</button></div>"));
      document.getElementById("tps").onclick = function (e) { var t = e.target; if (t.dataset && t.dataset.tp) { st.tp = t.dataset.tp; renderCfg(); } };
      Array.prototype.forEach.call(app.querySelectorAll("[data-n]"), function (b) { b.onclick = function () { st.n = +b.dataset.n; renderCfg(); }; });
      document.getElementById("start").onclick = function () {
        var pool = DATA.filter(function (x) { return st.tp === "all" || x.type === st.tp; });
        if (!pool.length) return;
        var list = st.ord ? shuffle(pool) : pool.slice();
        if (st.n) list = list.slice(0, st.n);
        var mins = Math.max(1, +document.getElementById("min").value || 30);
        EX = {
          phase: "run", list: list, ans: {}, idx: 0, left: mins * 60,
          shuf: document.getElementById("shuf").checked, ord: st.ord,
          perms: {}, t0: Date.now(), cfg: { tp: st.tp }
        };
        list.forEach(function (qq) { var c = choices(qq); EX.perms[qq.id] = (EX.shuf && qq.type !== "judge") ? shuffle(c) : c; });
        examTimer = setInterval(tick, 1000);
        renderExam();
      };
    }
    renderCfg();
  }
  function tick() {
    if (!EX) return;
    EX.left--;
    var c = document.getElementById("clock");
    if (c) c.textContent = fmtClock(Math.max(0, EX.left));
    if (EX.left <= 0) { clearInterval(examTimer); examTimer = null; submitExam(true); }
  }
  function ansOk(q, str) { return (str || "").split(",").filter(Boolean).sort().join(",") === q.ans; }
  function renderExam() {
    var q = EX.list[EX.idx];
    app.innerHTML = "";
    var head = card("<div class='examhead'><span class='tag r'>模拟考试中</span><span class='muted'>" + (EX.cfg.tp === "all" ? "全部题型" : EX.cfg.tp === "single" ? "单项选择题" : EX.cfg.tp === "multi" ? "多项选择题" : "判断题") + " · 共 " + EX.list.length + " 题</span><span class='clock' id='clock'>" + fmtClock(EX.left) + "</span></div>" +
      "<div class='bar' style='margin-top:10px'><span class='muted'>第 " + (EX.idx + 1) + " 题 · " + typeLabel(q.type) + "</span><div class='prog'><i style='width:" + Math.round((EX.idx) / EX.list.length * 100) + "%'></i></div></div>" +
      "<div class='stem'>" + esc(q.stem) + "</div><div id='figbox'></div><div class='opts' id='opts'></div>" +
      "<div class='row' style='margin-top:14px'><button class='btn' id='prev' " + (EX.idx === 0 ? "disabled" : "") + ">上一题</button><button class='btn' id='next'>" + (EX.idx === EX.list.length - 1 ? "答题卡" : "下一题") + "</button><button class='btn warn' id='sub'>交卷</button></div>");
    app.appendChild(head);
    var fb = figNode(q);
    if (fb) head.querySelector("#figbox").appendChild(fb);
    var obox = head.querySelector("#opts");
    var curSel = (EX.ans[q.id] || "").split(",").filter(Boolean);
    EX.perms[q.id].forEach(function (o) {
      var b = document.createElement("button");
      b.className = "opt" + (curSel.indexOf(o.l) >= 0 ? " sel" : "");
      b.innerHTML = "<span class='ol'>" + esc(o.l) + "</span>" + esc(o.t);
      b.onclick = function () {
        var s = (EX.ans[q.id] || "").split(",").filter(Boolean);
        var i2 = s.indexOf(o.l);
        if (q.type === "multi") {
          if (i2 >= 0) s.splice(i2, 1); else s.push(o.l);
          EX.ans[q.id] = s.sort().join(",");
        } else {
          EX.ans[q.id] = o.l;
        }
        renderExam();
      };
      obox.appendChild(b);
    });
    head.querySelector("#prev").onclick = function () { EX.idx--; renderExam(); };
    head.querySelector("#next").onclick = function () {
      if (EX.idx === EX.list.length - 1) return renderPalette();
      EX.idx++; renderExam();
    };
    head.querySelector("#sub").onclick = function () { submitExam(false); };
  }
  function renderPalette() {
    app.innerHTML = "";
    var un = EX.list.filter(function (q) { return !EX.ans[q.id]; }).length;
    app.appendChild(card("<h2>答题卡</h2><div class='sub'>已答 " + (EX.list.length - un) + " / " + EX.list.length + "，未答 " + un + "。剩余 " + fmtClock(EX.left) + "</div>" +
      "<div class='chips'>" + EX.list.map(function (q, i) { return "<button class='chip" + (EX.ans[q.id] ? " on" : "") + "' data-i='" + i + "'>" + (i + 1) + "</button>"; }).join("") + "</div>" +
      "<div class='row' style='margin-top:16px'><button class='btn' id='back'>继续答题</button><button class='btn warn' id='sub'>交卷" + (un ? "（含 " + un + " 题未答）" : "") + "</button></div>"));
    app.querySelector(".chips").onclick = function (e) { var t = e.target; if (t.dataset && t.dataset.i) { EX.idx = +t.dataset.i; renderExam(); } };
    document.getElementById("back").onclick = renderExam;
    document.getElementById("sub").onclick = function () { submitExam(false); };
  }
  function submitExam(auto) {
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    var c = 0;
    EX.list.forEach(function (q) { var ok = ansOk(q, EX.ans[q.id]); record(q, ok); if (ok) c++; });
    EX.result = { correct: c, total: EX.list.length, auto: auto, sec: Math.round((Date.now() - EX.t0) / 1000) };
    EX.phase = "done";
    renderExamResult();
  }
  function renderExamResult() {
    var r = EX.result;
    var wrongs = EX.list.filter(function (q) { return !ansOk(q, EX.ans[q.id]); });
    app.innerHTML = "";
    app.appendChild(card("<h2>" + (r.auto ? "时间到，自动交卷" : "考试结果") + "</h2><div class='sub'>用时 " + fmtClock(r.sec) + "</div>" +
      "<div class='grid'>" + tile("b", Math.round(r.correct / r.total * 100) + "分", "得分（百分制）") + tile("g", r.correct, "答对") + tile("r", wrongs.length, "答错/未答") + tile("", r.total, "总题数") + "</div>"));
    if (wrongs.length) {
      app.appendChild(card("<h2>错题回顾</h2><div class='list'>" + wrongs.map(function (q) {
        return "<div class='item'><span class='no'>" + typeLabel(q.type) + q.no + "</span><span class='tx'><span class='t'>" + esc(q.stem) + "</span><div class='ans'>你的答案：" + esc(EX.ans[q.id] || "未答") + "　正确答案：" + esc(q.ans) + "</div></span></div>";
      }).join("") + "</div>"));
    }
    app.appendChild(card("<div class='row'><button class='btn pri' id='rw'>" + (wrongs.length ? "重练本次错题" : "再考一场") + "</button><button class='btn' id='ne'>再考一场</button><a class='btn' href='#/stats'>查看统计</a></div>"));
    document.getElementById("rw").onclick = function () {
      var l = wrongs.length ? wrongs : EX.list;
      EX = null;
      startQuiz({ title: "模考错题重练", list: l, shuffleOpt: true, shuffleOrd: false, backHash: "#/exam" });
    };
    document.getElementById("ne").onclick = function () { EX = null; route(); };
  }

  /* SECTION: stats */
  function viewStats() {
    var acc = accuracy();
    app.appendChild(card("<h2>统计</h2><div class='sub'>按作答次数累计（含练习、复习与模考）</div><div class='grid'>" +
      tile("", attempted(), "已练题数") + tile("b", acc === null ? "—" : acc + "%", "累计正确率") + tile("r", wrongList().length, "待消错题") + tile("o", dueList().length, "到期复习") + "</div>"));
    var rows = SECTIONS.map(function (s) {
      var list = DATA.filter(function (x) { return x.type === s.key; });
      var a = 0, c = 0, w = 0;
      list.forEach(function (x) { var r = recOf(x.id); if (r && r.n) { a += r.n; c += r.c || 0; } if (isWrong(x)) w++; });
      return "<tr><td>" + esc(s.label) + "</td><td class='n'>" + list.length + "</td><td class='n'>" + a + "</td><td class='n'>" + (a ? Math.round(c / a * 100) + "%" : "—") + "</td><td class='n'>" + w + "</td></tr>";
    }).join("");
    app.appendChild(card("<h2>分题型</h2><table class='tb'><tr><th>题型</th><th class='n'>题数</th><th class='n'>作答次数</th><th class='n'>正确率</th><th class='n'>待消错题</th></tr>" + rows + "</table>"));
    var days = Object.keys(state.days).sort().slice(-7);
    if (days.length) {
      app.appendChild(card("<h2>近 7 日作答</h2><table class='tb'><tr><th>日期</th><th class='n'>作答</th><th class='n'>正确</th><th class='n'>正确率</th></tr>" +
        days.map(function (d) { var v = state.days[d]; return "<tr><td>" + d + "</td><td class='n'>" + v.a + "</td><td class='n'>" + v.c + "</td><td class='n'>" + Math.round(v.c / v.a * 100) + "%</td></tr>"; }).join("") + "</table>"));
    }
  }

  /* SECTION: settings */
  function viewSettings() {
    app.appendChild(card("<h2>备份与数据</h2><div class='sub'>全部学习数据（练习记录、错题、收藏、复习排程、统计）仅存于本机浏览器 localStorage</div>" +
      "<div class='row'><button class='btn pri' id='exp'>导出备份（JSON）</button><label class='btn' style='display:inline-block'>导入备份<input type='file' id='imp' accept='.json,application/json' style='display:none'></label><button class='btn warn' id='rst'>清空本机学习数据</button></div>" +
      "<hr class='hr'><div class='muted'>题库版本 v" + (META.version || 1) + " · 共 " + DATA.length + " 题 · 来源：" + esc(META.source || "") + "</div>" +
      "<div class='muted' style='margin-top:6px'>收录说明：" + esc(META.excluded || "") + "</div>"));
    document.getElementById("exp").onclick = function () {
      var blob = new Blob([JSON.stringify({ app: "xjdquiz", version: 1, exportedAt: new Date().toISOString(), state: state }, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "小家电题库备份-" + today() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    };
    document.getElementById("imp").onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var o = JSON.parse(rd.result);
          if (!o || o.app !== "xjdquiz" || !o.state || !o.state.rec) throw new Error("文件格式不符");
          if (!confirm("导入将覆盖本机现有学习数据，确定继续？")) return;
          state = { rec: o.state.rec || {}, star: o.state.star || {}, cleared: o.state.cleared || {}, days: o.state.days || {} };
          save(); route();
        } catch (err) { alert("导入失败：" + err.message); }
      };
      rd.readAsText(f);
    };
    document.getElementById("rst").onclick = function () {
      if (!confirm("将清空本机全部练习记录、错题、收藏与统计，且不可恢复。确定？")) return;
      state = { rec: {}, star: {}, cleared: {}, days: {} };
      save(); route();
    };
  }

  load();
  route();
})();
