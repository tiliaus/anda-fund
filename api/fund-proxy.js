// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料
// 解析邏輯基於 debug-fund 回傳的真實 HTML 結構

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer': 'https://www.moneydj.com/',
};

// 安達內部代碼 → MoneyDJ 代碼（來自基金連結.xlsx）
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

// 解析淨值（根據 debug 確認：MoneyDJ 用 class="t3n2" 存淨值）
function parseNav(html) {
  let nav = null;
  let date = null;

  // 方法一：MoneyDJ class="t3n2" 或 class="t3n1"（最精確）
  const t3Matches = html.match(/<td[^>]*class="t3n[12]"[^>]*>([\d,]+\.[\d]{2,6})<\/td>/gi) || [];
  for (const m of t3Matches) {
    const numStr = m.replace(/<[^>]+>/g, '').trim();
    const v = parseFloat(numStr.replace(/,/g, ''));
    if (v >= 0.1 && v <= 50000) { nav = v; break; }
  }

  // 方法二：備用 - 任何 td 中的純小數
  if (!nav) {
    const tdMatches = html.match(/<td[^>]*>([\d]+\.[\d]{2,6})<\/td>/gi) || [];
    for (const m of tdMatches) {
      const numStr = m.replace(/<[^>]+>/g, '').trim();
      const v = parseFloat(numStr.replace(/,/g, ''));
      if (v >= 0.1 && v <= 50000) { nav = v; break; }
    }
  }

  // 日期：從所有日期中取最新的
  const dateMatches = html.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || [];
  let bestDate = null;
  for (const d of dateMatches) {
    const parts = d.split('/');
    const y = parseInt(parts[0]);
    if (y >= 2020) {
      const normalized = parts[0] + '-' + parts[1].padStart(2,'0') + '-' + parts[2].padStart(2,'0');
      if (!bestDate || normalized > bestDate) bestDate = normalized;
    }
  }
  date = bestDate;

  return { nav, date };
}

// 解析配息（MoneyDJ 配息頁面 yp131）
function parseDiv(html) {
  const divs = [];

  // 找所有表格，尋找配息/除息相關表格
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const tbl of tables) {
    if (!/配息|除息|dividend/i.test(tbl)) continue;

    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows.slice(1, 8)) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());

      // 找日期欄（YYYY/MM/DD 格式）
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i].trim();
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cell)) {
          // 下一欄為配息金額
          for (let j = i + 1; j < cells.length; j++) {
            const amount = parseFloat(cells[j].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0 && amount < 10000) {
              divs.push({
                basis_date: cell.replace(/\//g, '-'),
                amount,
              });
              break;
            }
          }
          break;
        }
      }
      if (divs.length >= 3) break;
    }
    if (divs.length > 0) break;
  }

  // 備用：從整頁 HTML 找日期+金額配對
  if (divs.length === 0) {
    const matches = html.match(/(\d{4}\/\d{2}\/\d{2})[^<]{0,80}?([\d]+\.[\d]{4,6})/g) || [];
    for (const m of matches.slice(0, 3)) {
      const dateMatch = m.match(/(\d{4}\/\d{2}\/\d{2})/);
      const numMatch = m.match(/([\d]+\.[\d]{4,6})/);
      if (dateMatch && numMatch) {
        const amount = parseFloat(numMatch[1]);
        if (amount > 0 && amount < 10000) {
          divs.push({ basis_date: dateMatch[1].replace(/\//g, '-'), amount });
        }
      }
    }
  }

  return divs;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 嘗試多個頁面取得淨值（備援機制）
async function fetchNav(djCode, primaryPage) {
  const pages = [primaryPage, 'yp011001', 'yp011000'].filter((v,i,a)=>a.indexOf(v)===i);
  for (const page of pages) {
    try {
      const url = `https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${djCode}`;
      const html = await fetchPage(url);
      const { nav, date } = parseNav(html);
      if (nav) return { nav, date, url };
    } catch {}
  }
  return null;
}

async function fetchDiv(djCode) {
  const pages = ['yp131', 'yp011001', 'yp011000'];
  for (const page of pages) {
    try {
      const url = `https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${djCode}`;
      const html = await fetchPage(url);
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
    res.status(404).json({ error: `找不到 ${code} 的 MoneyDJ 代碼` });
    return;
  }

  const { code: djCode, page } = mapping;

  try {
    if (type === 'div') {
      const result = await fetchDiv(djCode);
      if (result) {
        res.status(200).json({ ok: true, djCode, code, dividend_data: result.divs });
      } else {
        res.status(404).json({ error: '無法取得配息資料', djCode });
      }
    } else {
      const result = await fetchNav(djCode, page);
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
