(function () {
  const btn = document.getElementById('trackBtn');
  const input = document.getElementById('codeInput');
  const errorBox = document.getElementById('errorBox');
  const resultCard = document.getElementById('resultCard');

  // لو الصفحة اتفتحت مباشرة بكود في الرابط ?code=...
  const params = new URLSearchParams(window.location.search);
  if (params.get('code')) {
    input.value = params.get('code');
    doSearch();
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  async function doSearch() {
    const code = input.value.trim();
    errorBox.classList.remove('show');
    resultCard.style.display = 'none';

    if (!code) {
      errorBox.textContent = 'اكتب كود التتبع الأول';
      errorBox.classList.add('show');
      return;
    }

    try {
      const res = await fetch('/api/orders/' + encodeURIComponent(code));
      const data = await res.json();
      if (!res.ok) {
        errorBox.textContent = data.error || 'الطلب غير موجود';
        errorBox.classList.add('show');
        return;
      }
      renderResult(data);
    } catch (e) {
      errorBox.textContent = 'تعذر الاتصال بالسيرفر';
      errorBox.classList.add('show');
    }
  }

  function renderResult(order) {
    document.getElementById('rSize').textContent = 'EU ' + order.size;
    document.getElementById('rFit').textContent =
      order.fit === 'slim' ? 'ضيقة' : order.fit === 'relaxed' ? 'واسعة' : 'عادية';
    document.getElementById('rConfidence').textContent = order.confidence + '%';
    document.getElementById('rColors').textContent =
      order.jacket_color + ' / ' + order.shirt_color + ' / ' + order.pants_color;

    const pill = document.getElementById('rStatus');
    if (order.status === 'confirmed') {
      pill.textContent = 'مؤكّد';
      pill.className = 'status-pill status-confirmed';
    } else {
      pill.textContent = 'مسودة';
      pill.className = 'status-pill status-draft';
    }

    document.getElementById('viewFullLink').href = '/result.html?code=' + encodeURIComponent(order.tracking_code);
    resultCard.style.display = 'block';
  }
})();
