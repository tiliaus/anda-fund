// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer': 'https://www.moneydj.com/',
};

// type: 'foreign' 境外基金, 'domestic' 境內基金
const CODE_MAP = {
  'BGUAL040': { code: 'TLZF9',   type: 'foreign' },
  'BSUAL044': { code: 'TLZF9',   type: 'foreign' },
  'BGUAL001': { code: 'TLZ64',   type: 'foreign' },
  'BSUAL001': { code: 'TLZ64',   type: 'foreign' },
  'BGUAB007': { code: 'ACTI71',  navPage: 'yp010000', rrPage: 'yp011000', divPage: 'funddividend' },
  'BSUAB008': { code: 'ACTI71',  navPage: 'yp010000', rrPage: 'yp011000', divPage: 'funddividend' },
  'ECUAB056': { code: 'albt8',   type: 'foreign' },
  'EQUAB057': { code: 'albt8',   type: 'foreign' },
  'BGUPC041': { code: 'MMG55',   type: 'foreign' },
  'BGUSC032': { code: 'pyzw3',   type: 'foreign' },
  'ECUML002': { code: 'SHZT9',   type: 'foreign' },
  'EQUML034': { code: 'SHZT9',   type: 'foreign' },
  'ECUML003': { code: 'SHZV9',   type: 'foreign' },
  'BGUPC029': { code: 'ACCP138', navPage: 'yp010000', rrPage: 'yp011000', divPage: 'funddividend' },
  'BSUPC044': { code: 'ACCP138', navPage: 'yp010000', rrPage: 'yp011000', divPage: 'funddividend' },
  'BCUPI011': { code: 'PIZO5',   type: 'foreign' },
  'BNUP1017': { code: 'PIZO5',   type: 'foreign' },
  'BGUJF059': { code: 'JFZN3',   type: 'foreign' },
  'BSUJF060': { code: 'JFZN3',   type: 'foreign' },
  'BGZAL001': { code: 'TLZ78',   type: 'foreign' },
  'BSZAL002': { code: 'TLZ78',   type: 'foreign' },
  'ECZML031': { code: 'SHZV1',   type: 'foreign' },
  'EQZML030': { code: 'SHZV1',   type: 'foreign' },
  'BGZSC031': { code: 'pyzt6',   type: 'foreign' },
  'BCZPI014': { code: 'PIZM2',   type: 'foreign' },
  'BCZPI005': { code: 'pizc5',   type: 'foreign' },
  'BNZPI016': { code: 'pizc5',   type: 'foreign' },
  'BGZAB026': { code: 'ALBG7',   type: 'foreign' },
  'BGAAL041': { code: 'tlzg0',   type: 'foreign' },
  'BSAAL045': { code: 'tlzg0',   type: 'foreign' },
  'ECAML002': { code: 'shzt7',   type: 'foreign' },
};

async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 共用：從 HTML 解析 RR1~RR5 風險等級
function parseRiskLevel(html) {
  // 多種格式：RR3、>RR3<、風險報酬等級...RR3
  const patterns = [
    /風險報酬等級[^<]{0,30}(RR[1-5])/,
    />(RR[1-5])</,
    /\b(RR[1-5])\b/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

// 共用：從 HTML 解析最新日期
function parseBestDate(html) {
  let best = null;
  const dates = html.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || [];
  for (const d of dates) {
    const p = d.split('/');
    if (parseInt(p[0]) >= 2020) {
      const n = p[0] + '-' + p[1].padStart(2,'0') + '-' + p[2].padStart(2,'0');
      if (!best || n > best) best = n;
    }
  }
  return best;
}

// 解析境外基金淨值（yp011001）：class="t3n2"
function parseNavForeign(html) {
  let nav = null;

  const t3 = html.match(/<td[^>]*class="t3n[12]"[^>]*>([\d,]+\.[\d]{2,6})<\/td>/i);
  if (t3) {
    const v = parseFloat(t3[1].replace(/,/g, ''));
    if (v >= 0.1 && v <= 50000) nav = v;
  }
  if (!nav) {
    const tds = html.match(/<td[^>]*>([\d]+\.[\d]{2,6})<\/td>/g) || [];
    for (const td of tds) {
      const v = parseFloat(td.replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
      if (v >= 0.1 && v <= 50000) { nav = v; break; }
    }
  }

  return { nav, date: parseBestDate(html), risk_level: parseRiskLevel(html) };
}

// 解析境內基金淨值（yp010000）
function parseNavDomestic(html) {
  let nav = null;

  const patterns = [
    /<td[^>]*class="t3n[12]"[^>]*>([\d,]+\.[\d]{2,6})<\/td>/i,
    /<td[^>]*>([\d]+\.[\d]{4})<\/td>/g,
    /最新淨值[^<]{0,50}([\d]+\.[\d]{4})/,
  ];

  for (const p of patterns) {
    if (p.global) {
      const ms = [...html.matchAll(p)];
      for (const m of ms) {
        const v = parseFloat(m[1].replace(/,/g,''));
        if (v >= 0.1 && v <= 50000) { nav = v; break; }
      }
    } else {
      const m = html.match(p);
      if (m) {
        const v = parseFloat(m[1].replace(/,/g,''));
        if (v >= 0.1 && v <= 50000) nav = v;
      }
    }
    if (nav) break;
  }

  return { nav, date: parseBestDate(html), risk_level: parseRiskLevel(html) };
}

// 解析境外基金配息（wb05）
// 欄位：配息基準日 | 除息日 | 發放日 | 狀態 | 每單位分配金額 | 年化配息率%
function parseDivForeign(html) {
  const divs = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [])
      .map(c => c.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim());
    if (cells.length < 5) continue;
    const dm = cells[0].match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!dm) continue;
    const basisDate = dm[1]+'-'+dm[2].padStart(2,'0')+'-'+dm[3].padStart(2,'0');
    const amount = parseFloat(cells[4].replace(/,/g,''));
    if (isNaN(amount) || amount <= 0) continue;
    const annual_rate = parseFloat(cells[5].replace(/,/g,'')) || null;
    divs.push({ basis_date: basisDate, amount, annual_rate });
    if (divs.length >= 3) break;
  }
  return divs;
}

// 解析境內基金配息（funddividend）
function parseDivDomestic(html) {
  const divs = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [])
      .map(c => c.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim());
    if (cells.length < 5) continue;
    const dm = cells[0].match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!dm) continue;
    const basisDate = dm[1]+'-'+dm[2].padStart(2,'0')+'-'+dm[3].padStart(2,'0');
    const amount = parseFloat(cells[4].replace(/,/g,''));
    if (isNaN(amount) || amount <= 0) continue;
    const annual_rate = parseFloat(cells[5].replace(/,/g,'')) || null;
    divs.push({ basis_date: basisDate, amount, annual_rate });
    if (divs.length >= 3) break;
  }
  return divs;
}

async function fetchNav(djCode, mapping) {
  const navPage = mapping.navPage;
  const rrPage  = mapping.rrPage;

  // yp010000：境內基金淨值頁（ya/ 路徑）
  if (navPage === 'yp010000') {
    let nav = null, date = null, risk_level = null;
    try {
      const html = await fetchPage(`https://www.moneydj.com/funddj/ya/yp010000.djhtm?a=${djCode}`);
      const r = parseNavDomestic(html);
      nav = r.nav; date = r.date; risk_level = r.risk_level;
    } catch {}
    // 若 risk_level 沒抓到，從 rrPage 補抓
    if (!risk_level && rrPage) {
      try {
        const html2 = await fetchPage(`https://www.moneydj.com/funddj/yp/${rrPage}.djhtm?a=${djCode}`);
        risk_level = parseRiskLevel(html2);
      } catch {}
    }
    if (nav) return { nav, date, risk_level };
    return null;
  }

  // 境外基金：依序嘗試指定頁面
  const pages = navPage
    ? [navPage, ...['yp011001','yp011000'].filter(p=>p!==navPage)]
    : ['yp011001', 'yp011000'];
  for (const page of pages) {
    try {
      const html = await fetchPage(`https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${djCode}`);
      const r = parseNavForeign(html);
      if (r.nav) return r;
    } catch {}
  }
  return null;
}

async function fetchDiv(djCode, isDomestic, divPage) {
  // 若指定 divPage=funddividend，用境內配息格式
  if (isDomestic || divPage === 'funddividend') {
    try {
      const html = await fetchPage(`https://www.moneydj.com/funddj/yp/funddividend.djhtm?a=${djCode}`);
      const divs = parseDivDomestic(html);
      if (divs.length > 0) return divs;
    } catch {}
  } else {
    try {
      const html = await fetchPage(`https://www.moneydj.com/funddj/yp/wb05.djhtm?a=${djCode}`);
      const divs = parseDivForeign(html);
      if (divs.length > 0) return divs;
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
    res.status(404).json({ error: `找不到 ${code} 的 MoneyDJ 代碼` });
    return;
  }

  const { code: djCode, type: fundType } = mapping;
  const isDomestic = fundType === 'domestic';

  try {
    if (type === 'div') {
      const divs = await fetchDiv(djCode, isDomestic, mapping.divPage||null);
      if (divs && divs.length > 0) {
        res.status(200).json({ ok: true, djCode, code, dividend_data: divs });
      } else {
        res.status(404).json({ error: '無法取得配息資料', djCode });
      }
    } else {
      const result = await fetchNav(djCode, mapping);
      if (result && result.nav) {
        res.status(200).json({
          ok: true, djCode, code,
          latest_nav: result.nav,
          latest_nav_date: result.date,
          risk_level: result.risk_level || null,
        });
      } else {
        res.status(404).json({ error: '無法取得淨值資料', djCode });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message, djCode, code });
  }
};
