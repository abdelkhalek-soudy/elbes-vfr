(function () {
  const fitOptions = document.getElementById('fitOptions');
  let selectedFit = 'regular';
  fitOptions.querySelectorAll('.fit-option').forEach(el => {
    el.addEventListener('click', () => {
      fitOptions.querySelectorAll('.fit-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedFit = el.dataset.fit;
    });
  });

  const detailsToggle = document.getElementById('detailsToggle');
  const detailsPanel = document.getElementById('detailsPanel');
  detailsToggle.addEventListener('click', () => {
    detailsPanel.classList.toggle('open');
    detailsToggle.textContent = detailsPanel.classList.contains('open')
      ? '- إخفاء القياسات الدقيقة'
      : '+ إضافة قياسات دقيقة (اختياري، بتزوّد الدقة)';
  });

  const form = document.getElementById('measureForm');
  const errorBox = document.getElementById('errorBox');
  const submitBtn = document.getElementById('submitBtn');
  const faceInput = document.getElementById('faceImage');
  const demoImg = document.querySelector('.demo-img');

  if (faceInput) {
    faceInput.addEventListener('change', () => {
      if (faceInput.files && faceInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (demoImg) demoImg.src = e.target.result;
          sessionStorage.setItem('userFace', e.target.result);
        };
        reader.readAsDataURL(faceInput.files[0]);
      } else {
        sessionStorage.removeItem('userFace');
      }
    });
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  }
  function clearError() {
    errorBox.classList.remove('show');
    errorBox.textContent = '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const payload = {
      height: document.getElementById('height').value,
      weight: document.getElementById('weight').value,
      fit: selectedFit,
      chest: document.getElementById('chest').value || null,
      waist: document.getElementById('waist').value || null,
      shoulder: document.getElementById('shoulder').value || null,
      name: document.getElementById('name').value || null,
      phone: document.getElementById('phone').value || null
    };

    if (!faceInput || !faceInput.files || !faceInput.files[0]) {
      sessionStorage.removeItem('userFace');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الحساب...';

    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'حصل خطأ، حاول تاني');
        submitBtn.disabled = false;
        submitBtn.textContent = 'احسب مقاسي';
        return;
      }
      window.location.href = '/result.html?code=' + encodeURIComponent(data.tracking_code);
    } catch (err) {
      showError('تعذر الاتصال بالسيرفر. تأكد إن السيرفر شغال.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'احسب مقاسي';
    }
  });
})();
