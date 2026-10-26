// ══ QUANTUM MATH ENGINE v1.0 ══
// Napredna simulacija nogometnih ishoda i HT/FT korelacija

/** Poissonova distribucija za vjerojatnost točnog broja golova */
function poisson(lambda: number, k: number): number {
  // POPRAVAK: nevažeći λ i broj golova izvan potpore ne smiju proizvesti NaN.
  if (!Number.isFinite(lambda) || lambda < 0 || !Number.isInteger(k) || k < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n: number): number {
  if (n === 0) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

/** Glavna funkcija koja simulira utakmicu i vraća najvjerojatniji ishod */
export function simulateMatch(lh: number, la: number) {
  let p1 = 0, pX = 0, p2 = 0;
  let maxP = 0;
  let bestScore = "1:1";

  // POPRAVAK: proširi raspon da rep distribucije ne iskrivljuje 1X2 pri većim λ.
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const prob = poisson(lh, h) * poisson(la, a);
      
      if (h > a) p1 += prob;
      else if (h === a) pX += prob;
      else p2 += prob;

      if (prob > maxP) {
        maxP = prob;
        bestScore = `${h}:${a}`;
      }
    }
  }

  // Kalibracija HT/FT (44% golova u prvom poluvremenu)
  const htLh = lh * 0.44;
  const htLa = la * 0.44;
  let ht1 = 0, htX = 0, ht2 = 0;

  // POPRAVAK: širi HT raspon da ne odbaci značajnu masu pri većim λ.
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const prob = poisson(htLh, h) * poisson(htLa, a);
      if (h > a) ht1 += prob;
      else if (h === a) htX += prob;
      else ht2 += prob;
    }
  }

  // Normalizacija na stvarnu masu matrice (raspon rezultata je ograničen).
  const ftTotal = p1 + pX + p2;
  if (ftTotal > 0) { p1 /= ftTotal; pX /= ftTotal; p2 /= ftTotal; }
  const htTotal = ht1 + htX + ht2;
  if (htTotal > 0) { ht1 /= htTotal; htX /= htTotal; ht2 /= htTotal; }

  // Sigurnost = vjerojatnost najvjerojatnijeg ISHODA (1/X/2), ne vjerojatnost jednog točnog rezultata
  const confidence = Math.max(p1, pX, p2) * 100;

  return {
    fullTime: { p1: p1 * 100, pX: pX * 100, p2: p2 * 100 },
    halfTime: { p1: ht1 * 100, pX: htX * 100, p2: ht2 * 100 },
    bestScore,
    confidence
  };
}
