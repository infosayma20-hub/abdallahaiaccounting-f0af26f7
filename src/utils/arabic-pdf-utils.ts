/**
 * Arabic Text Reshaper for jsPDF
 * Converts logical Arabic text to visual presentation forms
 * so jsPDF can render Arabic correctly with connected letters and RTL ordering.
 */

// ─── Character Forms Mapping ───
// Format: logical code -> [isolated, final, initial, medial]
// null = character doesn't have that form (right-joining only)
const FORMS: Record<number, [number, number | null, number | null, number | null]> = {
  0x0621: [0xFE80, null, null, null],         // HAMZA
  0x0622: [0xFE81, 0xFE82, null, null],       // ALEF MADDA
  0x0623: [0xFE83, 0xFE84, null, null],       // ALEF HAMZA ABOVE
  0x0624: [0xFE85, 0xFE86, null, null],       // WAW HAMZA
  0x0625: [0xFE87, 0xFE88, null, null],       // ALEF HAMZA BELOW
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],  // YEH HAMZA
  0x0627: [0xFE8D, 0xFE8E, null, null],       // ALEF
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],  // BA
  0x0629: [0xFE93, 0xFE94, null, null],       // TEH MARBUTA
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],  // TEH
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],  // THEH
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],  // JEEM
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],  // HAH
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],  // KHAH
  0x062F: [0xFEA9, 0xFEAA, null, null],       // DAL
  0x0630: [0xFEAB, 0xFEAC, null, null],       // THAL
  0x0631: [0xFEAD, 0xFEAE, null, null],       // REH
  0x0632: [0xFEAF, 0xFEB0, null, null],       // ZAIN
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],  // SEEN
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],  // SHEEN
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],  // SAD
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],  // DAD
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],  // TAH
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],  // ZAH
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],  // AIN
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],  // GHAIN
  // 0x0640 is TATWEEL (kashida) - joins both sides
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],  // FA
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],  // QAF
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],  // KAF
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],  // LAM
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],  // MEEM
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],  // NOON
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],  // HEH
  0x0648: [0xFEED, 0xFEEE, null, null],       // WAW
  0x0649: [0xFEEF, 0xFEF0, null, null],       // ALEF MAKSURA
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],  // YEH
};

// Lam-Alef ligatures: [isolated, final]
const LAM_ALEF_LIGATURES: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6], // LAM + ALEF MADDA
  0x0623: [0xFEF7, 0xFEF8], // LAM + ALEF HAMZA ABOVE
  0x0625: [0xFEF9, 0xFEFA], // LAM + ALEF HAMZA BELOW
  0x0627: [0xFEFB, 0xFEFC], // LAM + ALEF
};

const isArabicChar = (code: number): boolean => FORMS[code] !== undefined || code === 0x0640;
const isTashkeel = (code: number): boolean => code >= 0x064B && code <= 0x0655;
const isTransparent = (code: number): boolean => isTashkeel(code) || (code >= 0x0610 && code <= 0x061A);

// Can this character join to the next (left) character?
const canJoinNext = (code: number): boolean => {
  if (code === 0x0640) return true; // Tatweel
  const forms = FORMS[code];
  return forms ? forms[2] !== null : false;
};

// Can this character join to the previous (right) character?
const canJoinPrev = (code: number): boolean => {
  if (code === 0x0640) return true;
  const forms = FORMS[code];
  return forms !== undefined;
};

// Get the next non-transparent character code
const getNextNonTransparent = (chars: number[], index: number): number | null => {
  for (let i = index + 1; i < chars.length; i++) {
    if (!isTransparent(chars[i])) return chars[i];
  }
  return null;
};

// Get the previous non-transparent character code
const getPrevNonTransparent = (chars: number[], index: number): number | null => {
  for (let i = index - 1; i >= 0; i--) {
    if (!isTransparent(chars[i])) return chars[i];
  }
  return null;
};

/**
 * Reshape Arabic text: convert logical characters to presentation forms
 */
const reshapeArabic = (text: string): string => {
  const codes = Array.from(text).map(c => c.charCodeAt(0));
  const result: number[] = [];
  
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    
    // Keep non-Arabic characters as-is
    if (!isArabicChar(code) && !isTransparent(code)) {
      result.push(code);
      continue;
    }
    
    // Keep tashkeel/diacritics as-is
    if (isTransparent(code)) {
      result.push(code);
      continue;
    }
    
    // Tatweel
    if (code === 0x0640) {
      result.push(0x0640);
      continue;
    }
    
    const forms = FORMS[code];
    if (!forms) {
      result.push(code);
      continue;
    }
    
    const prevCode = getPrevNonTransparent(codes, i);
    const nextCode = getNextNonTransparent(codes, i);
    
    const prevJoins = prevCode !== null && isArabicChar(prevCode) && canJoinNext(prevCode);
    const nextJoins = nextCode !== null && isArabicChar(nextCode) && canJoinPrev(nextCode);
    
    // Check for Lam-Alef ligature
    if (code === 0x0644 && nextCode !== null && LAM_ALEF_LIGATURES[nextCode]) {
      const lig = LAM_ALEF_LIGATURES[nextCode];
      if (prevJoins) {
        result.push(lig[1]); // final form
      } else {
        result.push(lig[0]); // isolated form
      }
      // Skip the next Alef character (but keep any tashkeel in between)
      let skip = i + 1;
      while (skip < codes.length && isTransparent(codes[skip])) {
        result.push(codes[skip]);
        skip++;
      }
      i = skip; // skip the Alef
      continue;
    }
    
    // Determine form: 0=isolated, 1=final, 2=initial, 3=medial
    let formIndex: number;
    if (prevJoins && nextJoins && forms[3] !== null) {
      formIndex = 3; // medial
    } else if (prevJoins && forms[1] !== null) {
      formIndex = 1; // final
    } else if (nextJoins && forms[2] !== null) {
      formIndex = 2; // initial
    } else {
      formIndex = 0; // isolated
    }
    
    result.push(forms[formIndex] ?? forms[0]);
  }
  
  return String.fromCharCode(...result);
};

/**
 * Check if text contains Arabic characters
 */
const hasArabic = (text: string): boolean =>
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

/**
 * Process text for jsPDF: reshape Arabic and handle RTL ordering.
 * Splits mixed Arabic/Latin text into runs and reverses Arabic runs.
 */
export const processArabicText = (text: string): string => {
  if (!text || !hasArabic(text)) return text;
  
  // Split into segments: Arabic runs vs non-Arabic runs
  type Segment = { text: string; isArabic: boolean };
  const segments: Segment[] = [];
  let current = '';
  let currentIsArabic = false;
  
  for (const char of text) {
    const code = char.charCodeAt(0);
    const charIsArabic = isArabicChar(code) || isTransparent(code) || code === 0x0020;
    
    // Spaces are ambiguous - treat as part of current segment
    if (code === 0x0020) {
      current += char;
      continue;
    }
    
    const thisCharArabic = isArabicChar(code) || isTransparent(code);
    
    if (current && thisCharArabic !== currentIsArabic) {
      segments.push({ text: current, isArabic: currentIsArabic });
      current = '';
    }
    
    current += char;
    currentIsArabic = thisCharArabic;
  }
  if (current) {
    segments.push({ text: current, isArabic: currentIsArabic });
  }
  
  // Reshape Arabic segments and reverse overall order for RTL
  const processed = segments.map(seg => {
    if (seg.isArabic) {
      return reshapeArabic(seg.text);
    }
    return seg.text;
  });
  
  // Reverse segment order for RTL visual display
  return processed.reverse().join('');
};

/**
 * Convenience alias
 */
export const ar = processArabicText;
