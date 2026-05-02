// Vercel Serverless Function：從 MoneyDJ 取得基金即時資料
// 路徑：/api/fund-proxy?code=BGUAL040&type=nav

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

function parseNav(html) {
  let nav = null, date = null;
  const navPatterns = [
    /id="?c_nav"?[^>]*>\s*([\d,]+\.[\d]+)/i,
    /class="[^"]*price[^"]*"[^>]*>\s*([\d,]+\.[\d]+)/i,
    /最新淨值[^<]{0,50}<[^>]+>\s*([\d,]+\.[\d]+)/,
    /"nav"\s*:\s*([\d.]+)/,
    /淨值[^\d]{0,20}([\d]{1,6}\.[\d]{2,6})/,
  ];
  for (const p of navPatterns) {
    const m = html.match(p);
    if (m) { const v = parseFloat(m[1].replace(/,/g,'')); if(v>0){nav=v;break;} }
  }
  const datePatterns = [
    /\((\d{4})\/(\d{2})\/(\d{2})\)/,
    /(\d{4})\/(\d{2})\/(\d{2})/,
    /"navDate"\s*:\s*"([\d\-\/]+)"/,
  ];
  for (const p of datePatterns) {
    const m = html.match(p);
    if (m) { date = m[2] ? `${m[1]}-${m[2]}-${m[3]}` : m[1].replace(/\//g,'-'); break; }
  }
  return { nav, date };
}

function parseDiv(html) {
  const divs = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const tbl of tables) {
    if (!/配息|除息/i.test(tbl)) continue;
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows.slice(1,5)) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
        .map(c=>c.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim());
      const dateStr = cells[0]||'';
      const amount = parseFloat((cells[1]||cells[2]||'0').replace(/,/g,''));
      if (/\d{4}/.test(dateStr) && amount>0)
        divs.push({ basis_date: dateStr.replace(/\//g,'-'), amount });
    }
    if (divs.length>0) break;
  }
  return divs;
}

// Vercel 的 Function 格式（使用 req/res）
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { code, type } = req.query;
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
