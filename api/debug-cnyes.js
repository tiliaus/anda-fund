// 診斷：測試鉅亨網 API（Vercel 可以連線）
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://fund.cnyes.com/',
    'Origin': 'https://fund.cnyes.com',
  };

  const results = {};

  // 1. 用基金名稱搜尋鉅亨代碼
  const keywords = ['安聯收益成長基金', '安聯AMg7', 'TLZF9'];
  results.search = [];
  for (const kw of keywords) {
    try {
      const url = `https://fund.api.cnyes.com/fund/api/v1/search?keyword=${encodeURIComponent(kw)}&type=fund&size=5`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      const json = await r.json();
      results.search.push({ keyword: kw, status: r.status, data: JSON.stringify(json).substring(0, 500) });
    } catch(e) { results.search.push({ keyword: kw, error: e.message }); }
  }

  // 2. 嘗試各種鉅亨代碼格式
  const cnyesCodes = ['B20168', 'B20,168', 'B20164', 'B20,164', 'B20073', 'B20,073'];
  results.navTests = [];
  for (const code of cnyesCodes) {
    try {
      const encoded = encodeURIComponent(code);
      const url = `https://fund.api.cnyes.com/fund/api/v1/funds/${encoded}/nav?format=table&page=1`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      const text = await r.text();
      results.navTests.push({ code, status: r.status, preview: text.substring(0, 200) });
    } catch(e) { results.navTests.push({ code, error: e.message }); }
  }

  // 3. 嘗試配息 API
  results.divTests = [];
  for (const code of ['B20,073', 'B20073']) {
    try {
      const encoded = encodeURIComponent(code);
      const url = `https://fund.api.cnyes.com/fund/api/v1/funds/${encoded}/dividends`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      const text = await r.text();
      results.divTests.push({ code, status: r.status, preview: text.substring(0, 400) });
    } catch(e) { results.divTests.push({ code, error: e.message }); }
  }

  res.status(200).json(results);
};
