// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料
// 淨值來源：yp011001 頁面 class="t3n2"
// 配息來源：yp011001 頁面中的配息率與基準日資訊

const FETCH_HEADERS = {
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

// 解析淨值：MoneyDJ class="t3n2" 存放淨值
function parseNav(html) {
  let nav = null;
  let date = null;

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
      const numStr = td.replace(/<[^>]+>/g, '').trim();
      const v = parseFloat(numStr.replace(/,/g, ''));
      if (v >= 0.1 && v <= 50000) { nav = v; break; }
    }
  }

  // 最新日期
  let bestDate = null;
  const dates = html.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || [];
  for (const d of dates) {
    const parts = d.split('/');
    const y = parseInt(parts[0]);
    if (y >= 2020) {
      const norm = parts[0] + '-' + parts[1].padStart(2,'0') + '-' + parts[2].padStart(2,'0');
      if (!bestDate || norm > bestDate) bestDate = norm;
    }
  }
  date = bestDate;

  return { nav, date };
}

// 解析配息：從 yp011001 頁面解析配息金額與基準日
// debug 顯示格式：
// "46.09%&nbsp;(2026/03)" — 配息率(年月)
// 表格行：日期 + 淨值 + 配息金額 等
function parseDiv(html) {
  const divs = [];

  // 方法一：找含 & nbsp; 配息率格式的行
  // 格式：XX.XX%&nbsp;(YYYY/MM) 或 XX.XX%（YYYY/MM）
  // 搭配附近的金額 0.0XXXX
  const divRateMatches = html.match(/[\d.]+%[^<(]{0,10}\((\d{4})\/(\d{1,2})\)/g) || [];
  // 這個找到的是年化配息率，不是我們要的基準日+金額

  // 方法二：找所有 tr 行，含有 YYYY/MM/DD 格式的日期
  const allRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of allRows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
      .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());

    for (let i = 0; i < cells.length; i++) {
      // 找 YYYY/MM/DD 格式的日期
      const dateMatch = cells[i].match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (dateMatch) {
        const basisDate = dateMatch[1] + '-' + dateMatch[2].padStart(2,'0') + '-' + dateMatch[3].padStart(2,'0');
        // 找相鄰欄位的金額（小數，0.01~100 範圍）
        for (let j = i + 1; j < Math.min(i + 5, cells.length); j++) {
          const amount = parseFloat(cells[j].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0.0001 && amount < 100) {
            divs.push({ basis_date: basisDate, amount });
            break;
          }
        }
        if (divs.length >= 3) break;
      }
    }
    if (divs.length >= 3) break;
  }

  // 方法三：從頁面中的數字序列解析
  // debug 顯示：trWithDates 含 "2026/04/30 8.7946 8.9078 8.1449"
  // 這些是淨值歷史，不是配息
  // 找包含小配息金額的行（0.04~0.2 範圍的小數）
  if (divs.length === 0) {
    for (const row of allRows) {
      const text = row.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const dateM = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (!dateM) continue;
      // 找 0.04~0.2 範圍的金額（月配息金額通常在這範圍）
      const amtM = text.match(/\b(0\.\d{4,6})\b/);
      if (amtM) {
        const amount = parseFloat(amtM[1]);
        if (amount > 0.001 && amount < 10) {
          const basisDate = dateM[1] + '-' + dateM[2].padStart(2,'0') + '-' + dateM[3].padStart(2,'0');
          divs.push({ basis_date: basisDate, amount });
          if (divs.length >= 3) break;
        }
      }
    }
  }

  // 方法四：從 HTML 全文搜尋日期+小金額配對
  if (divs.length === 0) {
    const pattern = /(\d{4})\/(\d{2})\/(\d{2})[^<]{0,150}(0\.\d{4,6})/g;
    let m;
    while ((m = pattern.exec(html)) !== null && divs.length < 3) {
      const amount = parseFloat(m[4]);
      if (amount > 0.001 && amount < 10) {
        divs.push({
          basis_date: m[1] + '-' + m[2] + '-' + m[3],
          amount,
        });
      }
    }
  }

  return divs;
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

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

async function fetchDiv(djCode, primaryPage) {
  // 先試 yp011001（主頁面，含配息資訊）
  const pages = [primaryPage, 'yp011001', 'yp011000'].filter((v,i,a)=>a.indexOf(v)===i);
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
      const result = await fetchDiv(djCode, page);
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
