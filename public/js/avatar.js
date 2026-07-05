// يبني أفاتار SVG بسيط بيتغيّر حجمه حسب المقاس ويتلوّن حسب اختيار العميل
function renderAvatar(size, colors, gender, topCategory) {
      // نطاق المقاسات 44-60 -> عامل تكبير للعرض بين 0.86 و1.16
      const scale = 0.86 + ((size - 44) / (60 - 44)) * 0.3;
      const bodyWidth = 130 * scale;
      const half = bodyWidth / 2;
      const cx = 130;
      const isFemale = gender === 'female';
      const isTshirt = topCategory === 'tshirt';

      const skinTone = isFemale ? '#f0d5b8' : '#e8c9a8';
      const hairColor = isFemale ? '#2c1b0e' : '#1a1a1a';

      const userFace = sessionStorage.getItem('userFace');

      // الشعر والرأس والرقبة
      let headAndHair = '';
      let background = '';
      let neck = '';

      if (userFace) {
            // إخفاء جسم اليوزر ورسم رأسه فقط
            background = `
      <defs>
        <clipPath id="smartHeadClip">
          <ellipse cx="130" cy="45" rx="36" ry="46" />
        </clipPath>
      </defs>
      <image href="${userFace}" x="0" y="0" width="260" height="360" preserveAspectRatio="xMidYMin meet" clip-path="url(#smartHeadClip)" />
    `;
      } else {
            // الشعر والوش الافتراضي لو مفيش صورة
            const hair = isFemale
                  ? `<ellipse cx="0" cy="38" rx="30" ry="30" fill="${hairColor}" />
         <path d="M -28 45 Q -35 80, -22 90 Q 0 80, 22 90 Q 35 80, 28 45 Z" fill="${hairColor}" />`
                  : `<ellipse cx="0" cy="30" rx="28" ry="14" fill="${hairColor}" />`;
            const head = `<circle cx="0" cy="45" r="26" fill="${skinTone}" />`;

            // عشان نجمعهم في جروب نقدر نعمل عليه شيفت
            headAndHair = `<g transform="translate(130,0) scale(${scale})"> ` + hair + head + `</g>`;
            neck = `<g transform="translate(130,0) scale(${scale})"><rect x="-10" y="65" width="20" height="20" fill="${skinTone}" /></g>`;
      }

      // رسم الجسم بالاستعانة بمحاور صفرية (X=0 في النص)
      const drawGroup = `
    <g transform="translate(130,0) scale(${scale})">
      
      <!-- الأذرع واليدين الأساسية -->
      <!-- الذراع الأيسر -->
      <path d="M -20 80 L -60 210 L -45 205 L -40 130 Z" fill="${skinTone}" />
      <ellipse cx="-52" cy="216" rx="9" ry="13" fill="${skinTone}" transform="rotate(15 -52 216)" />
      <!-- الذراع الأيمن -->
      <path d="M 20 80 L 60 210 L 45 205 L 40 130 Z" fill="${skinTone}" />
      <ellipse cx="52" cy="216" rx="9" ry="13" fill="${skinTone}" transform="rotate(-15 52 216)" />

      <!-- القطعة العلوية -->
      ${isTshirt ? `
        <!-- تيشرت -->
        <path d="
          M -20 80 
          Q 0 95, 20 80 
          L 55 95
          L 60 145
          L 40 140
          L 42 215
          L -42 215
          L -40 140
          L -60 145
          L -55 95
          Z" fill="${colors.jacket}" stroke="rgba(0,0,0,0.1)" />
      ` : `
        <!-- القميص الداخلي -->
        <path d="
          M -15 80 
          L 0 100 
          L 15 80 
          L 40 95 
          L 38 215 
          L -38 215 
          L -40 95 
          Z" fill="${colors.shirt}" />
        <!-- الجاكيت (جانب أيسر) -->
        <path d="
          M -20 80 
          L -55 95 
          L -64 210 
          L -44 205 
          L -44 140 
          L -40 220 
          L -5 220 
          L 0 130 
          L -10 100 
          Z" fill="${colors.jacket}" stroke="rgba(0,0,0,0.15)" stroke-width="0.5" />
        <!-- الجاكيت (جانب أيمن) -->
        <path d="
          M 20 80 
          L 55 95 
          L 64 210 
          L 44 205 
          L 44 140 
          L 40 220 
          L 5 220 
          L 0 130 
          L 10 100 
          Z" fill="${colors.jacket}" stroke="rgba(0,0,0,0.15)" stroke-width="0.5" />
      `}

      <!-- البنطلون -->
      <!-- رجل يسرى -->
      <path d="M -38 ${isTshirt ? 215 : 220} L -5 ${isTshirt ? 215 : 220} L -8 328 L -30 328 Z" fill="${colors.pants}" />
      <!-- رجل يمنى -->
      <path d="M 38 ${isTshirt ? 215 : 220} L 5 ${isTshirt ? 215 : 220} L 8 328 L 30 328 Z" fill="${colors.pants}" />

      <!-- الأحذية -->
      <ellipse cx="-18" cy="334" rx="15" ry="7" fill="${colors.shoes}" />
      <ellipse cx="18" cy="334" rx="15" ry="7" fill="${colors.shoes}" />

    </g>
  `;

      return `
  <svg width="260" height="360" viewBox="0 0 260 360" xmlns="http://www.w3.org/2000/svg">
    ${background}
    ${neck}
    ${headAndHair}
    ${drawGroup}
  </svg>`;
}
