const cheerio = require('cheerio');

// Common vocabulary markers for heuristic text classification if HTML tags are missing/unclear
const VOCAB_MARKERS = {
  nl: [' van ', ' het ', ' een ', ' voor ', ' met ', ' zijn ', ' niet ', ' op ', ' om ', ' ook ', ' door ', ' naar ', ' over ', ' of ', ' ze ', ' u ', ' uw ', ' wij ', ' ons ', ' contact ', ' diensten ', ' welkom ', ' over ons ', ' meer info '],
  fi: [' ja ', ' on ', ' tai ', ' mutta ', ' niin ', ' että ', ' se ', ' kun ', ' kuin ', ' sekä ', ' myös ', ' haku ', ' palvelut ', ' yhteystiedot ', ' meistä ', ' suomi ', ' lue lisää ', ' etusivu '],
  en: [' the ', ' and ', ' with ', ' for ', ' you ', ' that ', ' this ', ' from ', ' have ', ' are ', ' not ', ' our ', ' your ', ' more ', ' about ', ' contact ', ' services ', ' welcome ', ' home ', ' learn more ']
};

/**
 * Scrapes a domain to inspect <html lang>, hreflang tags, and heuristic content text
 * to verify if the site actually matches the claimed language portal.
 * 
 * @param {string} domain - Clean domain string (e.g. "example.com" or "example.be")
 * @param {string} claimedLanguage - Target portal language code ('nl', 'fi', or 'en')
 * @returns {Promise<{ verificationStatus: string, detectedLanguage: string|null, hreflangTags: string|null, verificationNotes: string }>}
 */
const verifyWorkspaceLanguage = async (domain, claimedLanguage) => {
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  let url = `https://${cleanDomain}`;
  let html = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SERPsupport-AuditBot/1.0'
      },
      signal: controller.signal
    }).catch(async (e) => {
      // Fallback to http if https fails
      url = `http://${cleanDomain}`;
      return await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SERPsupport-AuditBot/1.0'
        },
        signal: controller.signal
      });
    });

    clearTimeout(timeout);

    if (!res || !res.ok) {
      return {
        verificationStatus: 'FAILED',
        detectedLanguage: null,
        hreflangTags: null,
        verificationNotes: `HTTP status ${res ? res.status : 'error'} while inspecting ${cleanDomain}`
      };
    }

    html = await res.text();
  } catch (error) {
    return {
      verificationStatus: 'FAILED',
      detectedLanguage: null,
      hreflangTags: null,
      verificationNotes: `Could not reach ${cleanDomain}: ${error.name === 'AbortError' ? 'Connection timed out' : error.message}`
    };
  }

  if (!html) {
    return {
      verificationStatus: 'FAILED',
      detectedLanguage: null,
      hreflangTags: null,
      verificationNotes: 'Empty HTML response returned from website'
    };
  }

  // Parse HTML using Cheerio
  const $ = cheerio.load(html);

  // 1. Extract <html lang="..."> attribute
  const htmlLangAttr = $('html').attr('lang') || $('html').attr('xml:lang') || '';
  const htmlLangClean = htmlLangAttr.toLowerCase().trim();
  const primaryLangCode = htmlLangClean.split('-')[0]; // e.g. 'nl' from 'nl-BE' or 'nl-NL'

  // 2. Extract <meta http-equiv="content-language">
  const metaLangAttr = $('meta[http-equiv="content-language"]').attr('content') || $('meta[name="language"]').attr('content') || '';
  const metaLangCode = metaLangAttr.toLowerCase().trim().split('-')[0];

  // 3. Extract <link rel="alternate" hreflang="..."> tags
  const hreflangList = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hl = $(el).attr('hreflang') || '';
    const href = $(el).attr('href') || '';
    if (hl && href) {
      hreflangList.push({ hreflang: hl.toLowerCase().trim(), href });
    }
  });

  // 4. Extract text content (Title, Meta description, H1, H2, and Paragraphs)
  const titleText = $('title').text() || '';
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  let bodySample = '';
  $('h1, h2, h3, p').each((_, el) => {
    const text = $(el).text().trim();
    if (text) bodySample += ' ' + text;
    if (bodySample.length > 2500) return false;
  });

  const combinedText = ` ${titleText} ${metaDesc} ${bodySample} `.toLowerCase().replace(/\s+/g, ' ');

  // Score language vocabulary markers
  const scores = { nl: 0, fi: 0, en: 0 };
  for (const [lang, markers] of Object.entries(VOCAB_MARKERS)) {
    for (const word of markers) {
      if (combinedText.includes(word)) scores[lang]++;
    }
  }

  // Determine detected language based on strong HTML tags first, then vocabulary scores
  let detectedLanguage = null;
  let tagMatch = false;

  if (['nl', 'fi', 'en'].includes(primaryLangCode)) {
    detectedLanguage = primaryLangCode;
    tagMatch = true;
  } else if (['nl', 'fi', 'en'].includes(metaLangCode)) {
    detectedLanguage = metaLangCode;
    tagMatch = true;
  } else {
    // Determine winner from text scores if minimum threshold met
    let maxScore = 0;
    let winnerLang = null;
    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore && score >= 3) {
        maxScore = score;
        winnerLang = lang;
      }
    }
    detectedLanguage = winnerLang;
  }

  // Also check if any hreflang matches the claimed language exactly or by base code
  const hasMatchingHreflang = hreflangList.some(item => {
    const code = item.hreflang.split('-')[0];
    return code === claimedLanguage || item.hreflang === claimedLanguage;
  });

  // Decide verification status
  let verificationStatus = 'UNVERIFIED';
  let notes = [];

  if (tagMatch) {
    notes.push(`Detected HTML language attribute: '${htmlLangAttr || metaLangAttr}'`);
  }
  if (hreflangList.length > 0) {
    notes.push(`Found ${hreflangList.length} hreflang alternate tag(s): ${hreflangList.map(h => h.hreflang).join(', ')}`);
  }
  if (!tagMatch && detectedLanguage) {
    notes.push(`Detected language '${detectedLanguage}' from heuristic text analysis (scores: NL=${scores.nl}, FI=${scores.fi}, EN=${scores.en})`);
  }

  if (detectedLanguage === claimedLanguage || hasMatchingHreflang) {
    verificationStatus = 'VERIFIED';
    notes.unshift(`Verified ${claimedLanguage.toUpperCase()} regional content.`);
  } else if (detectedLanguage && detectedLanguage !== claimedLanguage) {
    verificationStatus = 'FLAGGED';
    notes.unshift(`Language mismatch: Site appears to be '${detectedLanguage.toUpperCase()}' but claimed portal language is '${claimedLanguage.toUpperCase()}'.`);
  } else {
    verificationStatus = 'UNVERIFIED';
    notes.unshift(`Could not definitively verify language; manual audit recommended.`);
  }

  return {
    verificationStatus,
    detectedLanguage: detectedLanguage || claimedLanguage,
    hreflangTags: hreflangList.length > 0 ? JSON.stringify(hreflangList) : null,
    verificationNotes: notes.join(' | ')
  };
};

module.exports = {
  verifyWorkspaceLanguage
};
