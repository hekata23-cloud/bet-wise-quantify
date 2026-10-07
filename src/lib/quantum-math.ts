// ══ QUANTUM MATH ENGINE v1.0 ══
// Napredna simulacija nogometnih ishoda i HT/FT korelacija

/** Poissonova distribucija za vjerojatnost točnog broja golova */
function poisson(lambda: number, k: number): number {
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

  // Matrica 0-6 golova (pokriva 99% svih rezultata)
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
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

  for (let h = 0; h <= 3; h++) {
    for (let a = 0; a <= 3; a++) {
      const prob = poisson(htLh, h) * poisson(htLa, a);
      if (h > a) ht1 += prob;
      else if (h === a) htX += prob;
      else ht2 += prob;
    }
  }

  return {
    fullTime: { p1: p1 * 100, pX: pX * 100, p2: p2 * 100 },
    halfTime: { p1: ht1 * 100, pX: htX * 100, p2: ht2 * 100 },
    bestScore,
    confidence: maxP * 100
  };
}
