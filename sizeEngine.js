'use strict';

/* ===== محرك حساب المقاس — نسخة السيرفر (المصدر الوحيد الموثوق) =====
   نفس منطق النموذج التجريبي اللي اتفق عليه، لكن دلوقتي بيشتغل على
   السيرفر عشان يبقى مصدر واحد للحساب (مش بيتكرر أو يتلاعب فيه من المتصفح) */

const SIZE_CHART = [
  { size: 44, chest: 88,  waist: 76,  shoulder: 43.0 },
  { size: 46, chest: 92,  waist: 80,  shoulder: 44.5 },
  { size: 48, chest: 96,  waist: 84,  shoulder: 46.0 },
  { size: 50, chest: 100, waist: 88,  shoulder: 47.5 },
  { size: 52, chest: 104, waist: 92,  shoulder: 49.0 },
  { size: 54, chest: 108, waist: 96,  shoulder: 50.5 },
  { size: 56, chest: 112, waist: 100, shoulder: 52.0 },
  { size: 58, chest: 116, waist: 104, shoulder: 53.5 },
  { size: 60, chest: 120, waist: 108, shoulder: 55.0 }
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function estimateBodyMeasurements(height, weight) {
  const bmi = weight / Math.pow(height / 100, 2);
  const bmiDelta = bmi - 22;
  const chest = height * 0.535 + bmiDelta * 1.3;
  const waist = height * 0.46 + bmiDelta * 1.8;
  const shoulder = height * 0.265 + bmiDelta * 0.15;
  return { chest, waist, shoulder, bmi };
}

function matchSizeChart(target) {
  const W = { chest: 0.5, waist: 0.3, shoulder: 0.2 };
  let best = null;
  let bestDist = Infinity;
  SIZE_CHART.forEach(row => {
    const dChest = Math.abs(target.chest - row.chest) / 4;
    const dWaist = Math.abs(target.waist - row.waist) / 4;
    const dShoulder = Math.abs(target.shoulder - row.shoulder) / 1.5;
    const dist = W.chest * dChest + W.waist * dWaist + W.shoulder * dShoulder;
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  });
  return { row: best, distance: bestDist };
}

function fitSizeShift(fit) {
  if (fit === 'slim') return -2;
  if (fit === 'relaxed') return 2;
  return 0;
}

function rowForSize(size) {
  return (
    SIZE_CHART.find(r => r.size === size) ||
    SIZE_CHART.reduce((a, b) => (Math.abs(b.size - size) < Math.abs(a.size - size) ? b : a))
  );
}

/**
 * يحسب المقاس والثقة والتعديلات المطلوبة بناءً على مدخلات العميل.
 * @param {object} input - { height, weight, fit, chest?, waist?, shoulder? }
 */
function calculateFit(input) {
  const height = Number(input.height);
  const weight = Number(input.weight);
  const fit = ['slim', 'regular', 'relaxed'].includes(input.fit) ? input.fit : 'regular';

  if (!height || height < 140 || height > 220) {
    throw new Error('الطول غير منطقي، لازم يكون بين 140 و220 سم');
  }
  if (!weight || weight < 35 || weight > 220) {
    throw new Error('الوزن غير منطقي، لازم يكون بين 35 و220 كجم');
  }

  const chest = input.chest !== undefined && input.chest !== null && input.chest !== '' ? Number(input.chest) : NaN;
  const waist = input.waist !== undefined && input.waist !== null && input.waist !== '' ? Number(input.waist) : NaN;
  const shoulder = input.shoulder !== undefined && input.shoulder !== null && input.shoulder !== '' ? Number(input.shoulder) : NaN;

  const hasDetailed = !isNaN(chest) || !isNaN(waist) || !isNaN(shoulder);
  const estimated = estimateBodyMeasurements(height, weight);

  const target = {
    chest: !isNaN(chest) ? chest : estimated.chest,
    waist: !isNaN(waist) ? waist : estimated.waist,
    shoulder: !isNaN(shoulder) ? shoulder : estimated.shoulder
  };

  const match = matchSizeChart(target);
  const size = clamp(match.row.size + fitSizeShift(fit), 44, 60);
  const chosenRow = rowForSize(size);

  let confidence = 96 - match.distance * 16;
  confidence += hasDetailed ? 4 : -8;
  confidence = clamp(Math.round(confidence), 55, 98);

  const sleeveDelta = Math.round((height - 175) * 0.045 * 10) / 10;
  const jacketLenDelta = Math.round((height - 175) * 0.05 * 10) / 10;
  const chestDelta = Math.round((target.chest - chosenRow.chest) * 10) / 10;
  const waistDelta = Math.round((target.waist - chosenRow.waist) * 10) / 10;
  const shoulderDelta = Math.round((target.shoulder - chosenRow.shoulder) * 10) / 10;

  const alterations = [
    { key: 'sleeve', label: 'طول كم الجاكيت', value: sleeveDelta },
    { key: 'jacketLength', label: 'طول الجاكيت الكلي', value: jacketLenDelta },
    { key: 'chest', label: 'اتساع صدر الجاكيت', value: chestDelta },
    { key: 'shoulder', label: 'عرض الكتف', value: shoulderDelta },
    { key: 'waist', label: 'خصر البنطلون', value: waistDelta }
  ];

  return {
    size,
    confidence,
    fit,
    hasDetailed,
    bmi: Math.round(estimated.bmi * 10) / 10,
    targetMeasurements: {
      chest: Math.round(target.chest * 10) / 10,
      waist: Math.round(target.waist * 10) / 10,
      shoulder: Math.round(target.shoulder * 10) / 10
    },
    matchedBlock: chosenRow,
    alterations
  };
}

module.exports = { calculateFit, SIZE_CHART };
