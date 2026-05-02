// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料
// 已修正所有頁面格式，支援 yp011000、yp011001、wb05

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer': 'https://www.moneydj.com/',
};

// 安達內部代碼 → MoneyDJ 正確代碼（來自基金連結.xlsx）
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

// 解析淨值（支援所有 MoneyDJ 頁面格式）
function parseNav(html) {
  let nav = null, date = null;

  // ── 淨值解析（由精確到寬鬆） ──
  const navPatterns = [
    // id 包含 nav（最精確）
    /id=["']?[^"'\s>]*nav[^"'\s>]*["']?\s*[^>]*>\s*([0-9]{1,6}(?:,[0-9]{3})*\.[0-9]{2,6})/i,
    // class 包含 nav 或 price
    /class=["'][^"']*(?:nav|price|value|unit)[^"']*["'][^>]*>\s*([0-9]{1,6}(?:,[0-9]{3})*\.[0-9]{2,6})/i,
    // JavaScript 資料物件
    /['"](nav|price|unitNav|closePrice|lastPrice)['"]\s*:\s*['"]?([0-9]+\.[0-9]+)/i,
    // td 中的純淨值數字
    /<td[^>]*>\s*([0-9]{1,4}\.[0-9]{2,6})\s*<\/td>/g,
    // span 中的數字
    /<span[^>]*>\s*([0-9]{1,4}\.[0-9]{2,6})\s*<\/span>/g,
  ];

  for (const p of navPatterns) {
    if (p.global) {
      const matches = [...html.matchAll(p)];
      for (const m of matches) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v >= 0.1 && v <= 99999) { nav = v; break; }
      }
    } else {
      const m = html.match(p);
      if (m) {
        const idx = m.length === 3 ? 2 : 1;
        const v = parseFloat((m[idx] || '').replace(/,/g, ''));
        if (v >= 0.1 && v <= 99999) nav = v;
      }
    }
    if (nav) break;
  }

  // ── 日期解析（取最新的日期）──
  let bestYear = 0;
  const allDates = [...html.matchAll(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g)];
  for (const m of allDates) {
    const y = parseInt(m[1]);
    if (y >= 2020 && y > bestYear) {
      bestYear = y;
      date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    }
  }

  return { nav, date };
}

// 解析配息資料（支援所有 MoneyDJ 頁面格式）
function parseDiv(html) {
  const divs = [];

  // 方法一：找配息相關表格
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const tbl of tables) {
    if (!/配息|除息|dividend|ex.div/i.test(tbl)) continue;
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows.slice(1, 7)) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s+/g, ' ').trim());
      // 嘗試各種欄位順序
      for (let i = 0; i < cells.length - 1; i++) {
        const dateStr = cells[i];
        const amtStr = cells[i+1] || '0';
        const amount = parseFloat(amtStr.replace(/,/g, ''));
        // 日期格式：YYYY/MM/DD 或 YYYY-MM-DD
        if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(dateStr.trim()) && amount > 0) {
          divs.push({
            basis_date: dateStr.trim().replace(/\//g, '-'),
            amount
          });
          break;
        }
      }
    }
    if (divs.length > 0) break;
  }

  // 方法二：從 JavaScript 資料解析
  if (divs.length === 0) {
    const patterns = [
      /"exDividendDate"\s*:\s*"([^"]+)"[\s\S]{0,100}"dividend(?:Amount)?"\s*:\s*([0-9.]+)/gi,
      /"date"\s*:\s*"([^"]+)"[\s\S]{0,100}"amount"\s*:\s*([0-9.]+)/gi,
      /"recordDate"\s*:\s*"([^"]+)"[\s\S]{0,100}"cash"\s*:\s*([0-9.]+)/gi,
    ];
    for (const p of patterns) {
      const matches = [...html.matchAll(p)];
      for (const m of matches.slice(0, 3)) {
        const amount = parseFloat(m[2]);
        if (amount > 0) divs.push({ basis_date: m[1].replace(/\//g, '-'), amount });
      }
      if (divs.length > 0) break;
    }
  }

  return divs;
}

// 嘗試多個頁面取得淨值（備援機制）
async function fetchNavWithFallback(djCode, primaryPage) {
  // 依序嘗試的頁面類型
  const pages = [primaryPage, 'yp011001', 'yp011000'].filter((v, i, a) => a.indexOf(v) === i);

  for (const page of pages) {
    try {
      const url = `https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${djCode}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const html = await res.text();
      const { nav, date } = parseNav(html);
      if (nav) return { nav, date, url, page };
    } catch {}
  }
  return null;
}

async function fetchDivWithFallback(djCode) {
  const pages = ['yp131', 'yp011001', 'yp011000'];
  for (const page of pages) {
    try {
      const url = `https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${djCode}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const html = await res.text();
      const divs = parseDiv(html);
      if (divs.length > 0) return { divs, url };
    } catch {}
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, type } = req.query;
  if (!code) { res.status(400).json({ error: '缺少 code 參數' }); return; }

  const mapping = CODE_MAP[code];
  if (!mapping) {
    res.status(404).json({ error: `找不到 ${code} 的 MoneyDJ 代碼，將使用備份資料` });
    return;
  }

  const { code: djCode, page } = mapping;

  try {
    if (type === 'div') {
      const result = await fetchDivWithFallback(djCode);
      if (result) {
        res.status(200).json({ ok: true, djCode, code, dividend_data: result.divs });
      } else {
        res.status(404).json({ error: '無法取得配息資料', djCode });
      }
    } else {
      const result = await fetchNavWithFallback(djCode, page);
      if (result) {
        res.status(200).json({ ok: true, djCode, code, latest_nav: result.nav, latest_nav_date: result.date });
      } else {
        res.status(404).json({ error: '無法取得淨值資料', djCode });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message, djCode, code });
  }
};
