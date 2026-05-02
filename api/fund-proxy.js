// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料
// 已修正 HTML 解析邏輯

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer': 'https://www.moneydj.com/',
};

const CODE_MAP = {
  'BGUAL040': { code: 'TLZF9',   page: 'yp011001' },
  'BSUAL044': { code: 'TLZF9',   page: 'yp011001' },
  'BGUAL001': { code: 'TLZ64',   page: 'yp011001' },
  'BSUAL001': { code: 'TLZ64',   page: 'yp011001' },
  'BGUAB007': { code: 'ACTI71',  page: 'yp011000' },
  'BSUAB008': { code: 'ACTI71',  page: 'yp011000' },
  'ECUAB056': { code: 'albt8',   page: 'yp011001' },
  'EQUAB057': { code: 'albt8',   page: 'yp011001' },
  'BGUPC041': { code: 'MMG55',   page: 'yp011001' },
  'BGUSC032': { code: 'pyzw3',   page: 'yp011001' },
  'ECUML002': { code: 'SHZT9',   page: 'yp011001' },
  'EQUML034': { code: 'SHZT9',   page: 'yp011001' },
  'ECUML003': { code: 'SHZV9',   page: 'yp011001' },
  'BGUPC029': { code: 'ACCP138', page: 'yp011000' },
  'BSUPC044': { code: 'ACCP138', page: 'yp011000' },
  'BCUPI011': { code: 'PIZO5',   page: 'yp011001' },
  'BNUP1017': { code: 'PIZO5',   page: 'yp011001' },
  'BGUJF059': { code: 'JFZN3',   page: 'yp011001' },
  'BSUJF060': { code: 'JFZN3',   page: 'yp011001' },
  'BGZAL001': { code: 'TLZ78',   page: 'yp011001' },
  'BSZAL002': { code: 'TLZ78',   page: 'yp011001' },
  'ECZML031': { code: 'SHZV1',   page: 'yp011001' },
  'EQZML030': { code: 'SHZV1',   page: 'yp011001' },
  'BGZSC031': { code: 'pyzt6',   page: 'yp011001' },
  'BCZPI014': { code: 'PIZM2',   page: 'yp011001' },
  'BCZPI005': { code: 'pizc5',   page: 'yp011001' },
  'BNZPI016': { code: 'pizc5',   page: 'yp011001' },
  'BGZAB026': { code: 'ALBG7',   page: 'wb05'     },
  'BGAAL041': { code: 'tlzg0',   page: 'yp011001' },
  'BSAAL045': { code: 'tlzg0',   page: 'yp011001' },
  'ECAML002': { code: 'shzt7',   page: 'yp011001' },
};

// 解析淨值與日期 - 廣泛比對多種 MoneyDJ 頁面格式
function parseNav(html) {
  let nav = null, date = null;

  // ── 淨值 ── 
  // 方法1：找所有數值大於 0.1 的小數（排除日期格式）
  // MoneyDJ 淨值通常在特定 td 或 span 內
  const navPatterns = [
    // 常見格式：id=c_nav 或 id=nav
    /id=["']?[cC]?_?[nN][aA][vV]["']?[^>]*>\s*([0-9]{1,6}(?:,[0-9]{3})*\.[0-9]{2,6})/,
    // class 包含 nav 或 price
    /class=["'][^"']*(?:nav|price|value)[^"']*["'][^>]*>\s*([0-9]{1,6}(?:,[0-9]{3})*\.[0-9]{2,6})/i,
    // 表格 td 中的純數字（去掉逗號後是合理淨值範圍）
    /<td[^>]*>\s*([0-9]{1,4}\.[0-9]{2,6})\s*<\/td>/g,
    // JavaScript 資料
    /['"](nav|price|unitNav)['"]\s*:\s*([0-9]+\.[0-9]+)/i,
    // 最寬鬆：連續數字加小數點
    />\s*([1-9][0-9]{0,5}\.[0-9]{2,6})\s*</g,
  ];

  // 先試精確匹配
  for (const p of navPatterns.slice(0, 4)) {
    if (p.global) {
      const matches = [...html.matchAll(p)];
      for (const m of matches) {
        const idx = m[0].includes(':') ? 2 : 1;
        const v = parseFloat((m[idx]||'').replace(/,/g, ''));
        if (v > 0.1 && v < 99999) { nav = v; break; }
      }
    } else {
      const m = html.match(p);
      if (m) {
        const v = parseFloat((m[1]||m[2]||'').replace(/,/g, ''));
        if (v > 0.1 && v < 99999) { nav = v; }
      }
    }
    if (nav) break;
  }

  // 若還是 null，用最寬鬆方式找第一個合理數值
  if (!nav) {
    const allNums = [...html.matchAll(/>\s*([1-9][0-9]{0,3}\.[0-9]{2,4})\s*</g)];
    for (const m of allNums) {
      const v = parseFloat(m[1]);
      if (v > 0.5 && v < 50000) { nav = v; break; }
    }
  }

  // ── 日期 ── 找最近的日期（排除舊日期）
  const datePatterns = [
    // id 包含 date
    /id=["']?[^"']*date[^"']*["']?[^>]*>\s*(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/i,
    /id=["']?[^"']*date[^"']*["']?[^>]*>\s*(\d{4})(\d{2})(\d{2})/i,
    // JavaScript 資料
    /"(?:navDate|baseDate|date)"\s*:\s*"?(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/i,
    // 括號內的日期（MoneyDJ 常用格式）
    /\((\d{4})\/(\d{1,2})\/(\d{1,2})\)/,
    // 一般日期格式，取最新年份
    /(\d{4})\/(\d{2})\/(\d{2})/g,
  ];

  let bestDate = null;
  for (const p of datePatterns) {
    if (p.global) {
      const matches = [...html.matchAll(p)];
      // 取年份最大（最新）的日期
      for (const m of matches) {
        const year = parseInt(m[1]);
        if (year >= 2020) {
          const candidate = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
          if (!bestDate || candidate > bestDate) bestDate = candidate;
        }
      }
    } else {
      const m = html.match(p);
      if (m) {
        const year = parseInt(m[1]);
        if (year >= 2020) {
          date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
          break;
        }
      }
    }
  }
  if (!date && bestDate) date = bestDate;

  return { nav, date };
}

function parseDiv(html) {
  const divs = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const tbl of tables) {
    if (!/配息|除息|dividend/i.test(tbl)) continue;
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows.slice(1, 5)) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      const dateStr = cells[0] || '';
      const amount = parseFloat((cells[1] || cells[2] || '0').replace(/,/g, ''));
      if (/\d{4}/.test(dateStr) && amount > 0)
        divs.push({ basis_date: dateStr.replace(/\//g, '-'), amount });
    }
    if (divs.length > 0) break;
  }
  return divs;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, type, debug } = req.query;
  if (!code) { res.status(400).json({ error: '缺少 code 參數' }); return; }

  const mapping = CODE_MAP[code];
  if (!mapping) { res.status(404).json({ error: `找不到 ${code} 的 MoneyDJ 代碼` }); return; }

  const { code: djCode, page } = mapping;
  const pageType = type === 'div' ? 'yp131' : page;
  const url = `https://www.moneydj.com/funddj/yp/${pageType}.djhtm?a=${djCode}`;

  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `MoneyDJ HTTP ${response.status}`, url, djCode });
      return;
    }
    const html = await response.text();

    // debug=1 時回傳 HTML 片段供分析
    if (debug === '1') {
      // 擷取含數字的關鍵片段
      const snippets = [];
      const tds = html.match(/<td[^>]*>[\s\S]{0,50}<\/td>/gi) || [];
      tds.filter(t => /\d+\.\d{2,}/.test(t)).slice(0, 20).forEach(t => snippets.push(t.replace(/\s+/g,' ')));
      res.status(200).json({ debug: true, djCode, url, htmlLength: html.length, tdSnippets: snippets });
      return;
    }

    if (type === 'div') {
      const dividend_data = parseDiv(html);
      res.status(200).json({ ok: true, djCode, code, dividend_data });
    } else {
      const { nav, date } = parseNav(html);
      res.status(200).json({ ok: true, djCode, code, latest_nav: nav, latest_nav_date: date });
    }
  } catch (err) {
    res.status(500).json({ error: err.message, djCode, code, url });
  }
};
