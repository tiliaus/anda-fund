// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料
// 淨值來源：yp011001 頁面 class="t3n2"
// 配息來源：wb05 頁面配息表格（配息基準日 + 每單位分配金額）

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer': 'https://www.moneydj.com/',
};

const CODE_MAP = {
  'BGUAL040': { code: 'TLZF9',   navPage: 'yp011001' },
  'BSUAL044': { code: 'TLZF9',   navPage: 'yp011001' },
  'BGUAL001': { code: 'TLZ64',   navPage: 'yp011001' },
  'BSUAL001': { code: 'TLZ64',   navPage: 'yp011001' },
  'BGUAB007': { code: 'ACTI71',  navPage: 'yp011000' },
  'BSUAB008': { code: 'ACTI71',  navPage: 'yp011000' },
  'ECUAB056': { code: 'albt8',   navPage: 'yp011001' },
  'EQUAB057': { code: 'albt8',   navPage: 'yp011001' },
  'BGUPC041': { code: 'MMG55',   navPage: 'yp011001' },
  'BGUSC032': { code: 'pyzw3',   navPage: 'yp011001' },
  'ECUML002': { code: 'SHZT9',   navPage: 'yp011001' },
  'EQUML034': { code: 'SHZT9',   navPage: 'yp011001' },
  'ECUML003': { code: 'SHZV9',   navPage: 'yp011001' },
  'BGUPC029': { code: 'ACCP138', navPage: 'yp011000' },
  'BSUPC044': { code: 'ACCP138', navPage: 'yp011000' },
  'BCUPI011': { code: 'PIZO5',   navPage: 'yp011001' },
  'BNUP1017': { code: 'PIZO5',   navPage: 'yp011001' },
  'BGUJF059': { code: 'JFZN3',   navPage: 'yp011001' },
  'BSUJF060': { code: 'JFZN3',   navPage: 'yp011001' },
  'BGZAL001': { code: 'TLZ78',   navPage: 'yp011001' },
  'BSZAL002': { code: 'TLZ78',   navPage: 'yp011001' },
  'ECZML031': { code: 'SHZV1',   navPage: 'yp011001' },
  'EQZML030': { code: 'SHZV1',   navPage: 'yp011001' },
  'BGZSC031': { code: 'pyzt6',   navPage: 'yp011001' },
  'BCZPI014': { code: 'PIZM2',   navPage: 'yp011001' },
  'BCZPI005': { code: 'pizc5',   navPage: 'yp011001' },
  'BNZPI016': { code: 'pizc5',   navPage: 'yp011001' },
  'BGZAB026': { code: 'ALBG7',   navPage: 'yp011001' },
  'BGAAL041': { code: 'tlzg0',   navPage: 'yp011001' },
  'BSAAL045': { code: 'tlzg0',   navPage: 'yp011001' },
  'ECAML002': { code: 'shzt7',   navPage: 'yp011001' },
};

async function fetchPage(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 解析淨值：MoneyDJ class="t3n2" 存放淨值
function parseNav(html) {
  let nav = null, date = null;

  // 方法一：class="t3n2" 或 class="t3n1"
  const t3 = html.match(/<td[^>]*class="t3n[12]"[^>]*>([\d,]+\.[\d]{2,6})<\/td>/i);
  if (t3) {
    const v = parseFloat(t3[1].replace(/,/g, ''));
    if (v >= 0.1 && v <= 50000) nav = v;
  }

  // 方法二：備用 td
  if (!nav) {
    const tds = html.match(/<td[^>]*>([\d]+\.[\d]{2,6})<\/td>/g) || [];
    for (const td of tds) {
      const v = parseFloat(td.replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
      if (v >= 0.1 && v <= 50000) { nav = v; break; }
    }
  }

  // 最新日期
  let bestDate = null;
  const dates = html.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || [];
  for (const d of dates) {
    const parts = d.split('/');
    if (parseInt(parts[0]) >= 2020) {
      const norm = parts[0] + '-' + parts[1].padStart(2,'0') + '-' + parts[2].padStart(2,'0');
      if (!bestDate || norm > bestDate) bestDate = norm;
    }
  }
  date = bestDate;

  return { nav, date };
}

// 解析配息：wb05 頁面格式
// 表格欄位：配息基準日 | 除息日 | 發放日 | 狀態 | 每單位分配金額 | 年化配息率% | 幣別 | 備註
function parseDiv(html) {
  const divs = [];

  // 找所有 tr 行
  const allRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const row of allRows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
      .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());

    if (cells.length < 5) continue;

    // 第一欄應為配息基準日（YYYY/MM/DD）
    const dateMatch = cells[0].match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!dateMatch) continue;

    const basisDate = dateMatch[1] + '-' + dateMatch[2].padStart(2,'0') + '-' + dateMatch[3].padStart(2,'0');

    // 第五欄（index 4）為每單位分配金額
    const amount = parseFloat(cells[4].replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) continue;

    divs.push({ basis_date: basisDate, amount });
    if (divs.length >= 3) break;
  }

  return divs;
}

async function fetchNav(djCode, navPage) {
  const pages = [navPage, 'yp011001', 'yp011000'].filter((v,i,a) => a.indexOf(v) === i);
  for (const page of pages) {
    try {
      const html = await fetchPage(`https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${djCode}`);
      const { nav, date } = parseNav(html);
      if (nav) return { nav, date };
    } catch {}
  }
  return null;
}

async function fetchDiv(djCode) {
  // 所有基金統一用 wb05 配息頁面
  try {
    const html = await fetchPage(`https://www.moneydj.com/funddj/yp/wb05.djhtm?a=${djCode}`);
    const divs = parseDiv(html);
    if (divs.length > 0) return divs;
  } catch {}

  // 備用：yp011001 中的配息資訊
  try {
    const html = await fetchPage(`https://www.moneydj.com/funddj/yp/yp011001.djhtm?a=${djCode}`);
    const divs = parseDiv(html);
    if (divs.length > 0) return divs;
  } catch {}

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

  const { code: djCode, navPage } = mapping;

  try {
    if (type === 'div') {
      const divs = await fetchDiv(djCode);
      if (divs && divs.length > 0) {
        res.status(200).json({ ok: true, djCode, code, dividend_data: divs });
      } else {
        res.status(404).json({ error: '無法取得配息資料', djCode });
      }
    } else {
      const result = await fetchNav(djCode, navPage);
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
