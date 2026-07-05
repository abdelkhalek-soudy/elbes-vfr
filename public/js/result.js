(function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMsg = document.getElementById('errorMsg');
  const content = document.getElementById('content');

  let order = null;
  let currentUser = null;
  let products = { jacket: [], shirt: [], pants: [], shoes: [] };

  if (!code) {
    showError('مفيش كود تتبع، لازم تعمل قياس الأول.');
  } else {
    Promise.all([
      fetch('/api/orders/' + encodeURIComponent(code)).then(r => r.json().then(d => ({ ok: r.ok, d }))),
      fetch('/api/auth/me').then(r => r.json()).catch(() => ({ user: null }))
    ]).then(([orderRes, meRes]) => {
      if (!orderRes.ok) { showError(orderRes.d.error || 'تعذر جلب النتيجة'); return; }
      order = orderRes.d;
      currentUser = meRes.user;
      // Update nav bar
      updateNavBar();
      loadProductsAndRender();
    }).catch(() => showError('تعذر الاتصال بالسيرفر'));
  }

  function updateNavBar() {
    const area = document.getElementById('navUserArea');
    if (!area) return;
    if (currentUser) {
      area.className = 'nav-user';
      const initial = currentUser.name ? currentUser.name.charAt(0) : '?';
      let links = '';
      if (currentUser.role === 'admin') links += '<a href="/admin.html">لوحة التحكم</a> | ';
      links += '<a href="#" id="logoutLink">خروج</a>';
      area.innerHTML = '<div class="user-avatar">' + initial + '</div><div><span class="user-name">' + currentUser.name + '</span><br/>' + links + '</div>';
      const logoutEl = document.getElementById('logoutLink');
      if (logoutEl) logoutEl.addEventListener('click', e => {
        e.preventDefault();
        fetch('/api/auth/logout', { method: 'POST' }).then(() => location.reload());
      });
    }
  }

  function showError(msg) {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    errorMsg.textContent = msg;
  }

  async function loadProductsAndRender() {
    const gender = order.gender || 'male';
    const [jacketList, shirtList, pantsList, shoesList] = await Promise.all([
      fetchProducts(order.top_category === 'tshirt' ? 'tshirt' : 'jacket', gender),
      fetchProducts('tshirt', gender),
      fetchProducts('pants', gender),
      fetchProducts('shoes', gender)
    ]);
    products = { jacket: jacketList, shirt: shirtList, pants: pantsList, shoes: shoesList };
    renderAll();
  }

  async function fetchProducts(category, gender) {
    const res = await fetch(`/api/products?category=${encodeURIComponent(category)}&gender=${encodeURIComponent(gender)}`);
    return res.ok ? res.json() : [];
  }

  function hexFor(list, colorName) {
    const found = list.find(p => p.color_name === colorName);
    return found ? found.color_hex : (list[0] ? list[0].color_hex : '#3a3a3a');
  }

  function renderAll() {
    loadingState.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('sizeBadge').textContent = order.size;
    document.getElementById('confidenceVal').textContent = order.confidence;
    document.getElementById('confidenceBar').style.width = order.confidence + '%';
    document.getElementById('trackingCode').textContent = order.tracking_code;

    setPill(document.getElementById('statusPill'), order.status);

    // Set login redirect URLs
    const resultUrl = encodeURIComponent(window.location.pathname + window.location.search);
    const loginRedirect = document.getElementById('loginRedirectBtn');
    const signupRedirect = document.getElementById('signupRedirectBtn');
    if (loginRedirect) loginRedirect.href = '/login.html?redirect=' + resultUrl;
    if (signupRedirect) signupRedirect.href = '/signup.html?redirect=' + resultUrl;

    if (order.status === 'confirmed') {
      document.getElementById('confirmForm').style.display = 'none';
      document.getElementById('loginPrompt').style.display = 'none';
      document.getElementById('confirmedMsg').style.display = 'block';
    } else if (!currentUser) {
      document.getElementById('confirmForm').style.display = 'none';
      document.getElementById('confirmedMsg').style.display = 'none';
      document.getElementById('loginPrompt').style.display = 'block';
    } else {
      document.getElementById('loginPrompt').style.display = 'none';
      document.getElementById('confirmedMsg').style.display = 'none';
      document.getElementById('confirmForm').style.display = 'block';
      if (currentUser.name) document.getElementById('confirmName').value = currentUser.name;
    }

    renderGenderTopToggles();
    renderAlterations();
    renderColorPickers();
    renderAvatarBox();
    renderTicket();
  }

  function setPill(pill, status) {
    const labels = { draft: 'مسودة (لم يتم التأكيد بعد)', confirmed: 'الطلب مؤكّد', in_progress: 'تحت التنفيذ', ready: 'جاهز', delivered: 'تم التسليم' };
    pill.textContent = labels[status] || status;
    pill.className = 'status-pill status-' + status;
  }

  function renderGenderTopToggles() {
    const genderToggle = document.getElementById('genderToggle');
    genderToggle.querySelectorAll('.gender-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.gender === (order.gender || 'male'));
      el.onclick = () => switchAttr({ gender: el.dataset.gender });
    });
    const topToggle = document.getElementById('topToggle');
    topToggle.querySelectorAll('.top-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.top === (order.top_category || 'jacket'));
      el.onclick = () => switchAttr({ top_category: el.dataset.top });
    });
    document.getElementById('topLabel').textContent = order.top_category === 'tshirt' ? 'التيشرت' : 'الجاكيت';
    document.getElementById('shirtGroup').style.display = order.top_category === 'tshirt' ? 'none' : 'block';
  }

  async function switchAttr(patch) {
    Object.assign(order, patch);
    await loadProductsAndRender();
    fetch('/api/orders/' + encodeURIComponent(order.tracking_code) + '/colors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).catch(() => { });
  }

  function renderAlterations() {
    const list = document.getElementById('alterationsList');
    list.innerHTML = '';
    order.alterations.forEach(a => {
      const row = document.createElement('div');
      row.className = 'alteration-row';
      let tag, cls;
      if (Math.abs(a.value) < 0.3) { tag = 'بدون تعديل'; cls = 'tag-neutral'; }
      else if (a.value > 0) { tag = 'زيادة ' + a.value.toFixed(1) + ' سم'; cls = 'tag-up'; }
      else { tag = 'تقليل ' + Math.abs(a.value).toFixed(1) + ' سم'; cls = 'tag-down'; }
      row.innerHTML = `<span>${a.label}</span><span class="${cls}">${tag}</span>`;
      list.appendChild(row);
    });
  }

  function renderColorPickers() {
    buildSwatchGroup('jacketColors', products.jacket, order.jacket_color, 'jacket');
    buildSwatchGroup('shirtColors', products.shirt, order.shirt_color, 'shirt');
    buildSwatchGroup('pantsColors', products.pants, order.pants_color, 'pants');
    buildSwatchGroup('shoesColors', products.shoes, order.shoes_color, 'shoes');
  }

  function buildSwatchGroup(containerId, list, currentName, field) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!list.length) {
      container.innerHTML = '<span style="color:var(--text-muted); font-size:13px;">مفيش خيارات متاحة لهذا التصنيف</span>';
      return;
    }
    list.forEach(p => {
      const wrap = document.createElement('div');
      wrap.className = 'swatch-wrap';
      const sw = document.createElement('div');
      sw.className = 'swatch' + (p.color_name === currentName ? ' selected' : '');
      sw.style.background = p.color_hex;
      sw.title = p.name + ' - ' + p.color_name;
      sw.addEventListener('click', () => selectColor(field, p.color_name));
      const label = document.createElement('div');
      label.className = 'swatch-label';
      label.textContent = p.color_name;
      wrap.appendChild(sw);
      wrap.appendChild(label);
      container.appendChild(wrap);
    });
  }

  function selectColor(field, name) {
    order[field + '_color'] = name;
    renderColorPickers();
    renderAvatarBox();
    renderTicket();
    const body = {};
    body[field] = name;
    fetch('/api/orders/' + encodeURIComponent(order.tracking_code) + '/colors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => { });
  }

  function renderAvatarBox() {
    const colors = {
      jacket: hexFor(products.jacket, order.jacket_color),
      shirt: hexFor(products.shirt, order.shirt_color),
      pants: hexFor(products.pants, order.pants_color),
      shoes: hexFor(products.shoes, order.shoes_color)
    };
    document.getElementById('avatarWrap').innerHTML = renderAvatar(order.size, colors, order.gender, order.top_category);
  }

  function renderTicket() {
    const lines = [];
    lines.push('=== أمر تشغيل — البس ===');
    lines.push('كود التتبع: ' + order.tracking_code);
    lines.push('المقاس: EU ' + order.size + ' (ثقة ' + order.confidence + '%)');
    lines.push('الجنس: ' + (order.gender === 'female' ? 'حريمي' : 'رجالي'));
    lines.push('القصة: ' + (order.fit === 'slim' ? 'ضيقة' : order.fit === 'relaxed' ? 'واسعة' : 'عادية'));
    lines.push('');
    lines.push('-- التنسيق --');
    lines.push((order.top_category === 'tshirt' ? 'تيشرت' : 'جاكيت') + ': ' + order.jacket_color);
    if (order.top_category !== 'tshirt') lines.push('قميص: ' + order.shirt_color);
    lines.push('بنطلون: ' + order.pants_color);
    lines.push('حذاء: ' + order.shoes_color);
    lines.push('');
    lines.push('-- تعديلات القطعة العلوية --');
    order.alterations.filter(a => ['sleeve', 'jacketLength', 'chest', 'shoulder'].includes(a.key)).forEach(a => {
      lines.push('  ' + a.label + ': ' + fmtDelta(a.value));
    });
    lines.push('');
    lines.push('-- تعديلات البنطلون --');
    order.alterations.filter(a => a.key === 'waist').forEach(a => {
      lines.push('  ' + a.label + ': ' + fmtDelta(a.value));
    });
    lines.push('');
    lines.push('الحالة: ' + order.status);
    document.getElementById('orderTicket').textContent = lines.join('\n');
  }

  function fmtDelta(v) {
    if (Math.abs(v) < 0.3) return 'بدون تعديل';
    return (v > 0 ? '+' : '') + v.toFixed(1) + ' سم';
  }

  document.getElementById('confirmBtn').addEventListener('click', async () => {
    const name = document.getElementById('confirmName').value.trim();
    const phone = document.getElementById('confirmPhone').value.trim();
    const errBox = document.getElementById('confirmError');
    errBox.classList.remove('show');

    if (!name || !phone) {
      errBox.textContent = 'محتاجين الاسم ورقم الهاتف عشان نأكد الطلب';
      errBox.classList.add('show');
      return;
    }
    try {
      const res = await fetch('/api/orders/' + encodeURIComponent(order.tracking_code) + '/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone })
      });
      const data = await res.json();
      if (!res.ok) {
        errBox.textContent = data.error || 'حصل خطأ في التأكيد';
        errBox.classList.add('show');
        return;
      }
      order = data;
      document.getElementById('confirmForm').style.display = 'none';
      document.getElementById('confirmedMsg').style.display = 'block';
      setPill(document.getElementById('statusPill'), order.status);
      renderTicket();
    } catch (e) {
      errBox.textContent = 'تعذر الاتصال بالسيرفر';
      errBox.classList.add('show');
    }
  });
})();
