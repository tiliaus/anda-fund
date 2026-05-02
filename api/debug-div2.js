// 深度診斷：找 MoneyDJ 配息資料的 AJAX 端點
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const djCode = req.query.code || 'TLZF9';
  const results = {};

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'zh-TW,zh;q=0.9',
    'Referer': 'https://www.moneydj.com/',
  };

  const ajaxHeaders = {
    ...headers,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  };

  // 1. 看 yp131 完整內容（只有1136bytes，應該能看完整）
  try {
    const r = await fetch(`https://www.moneydj.com/funddj/yp/yp131.djhtm?a=${djCode}`, { headers, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    results.yp131_full = { status: r.status, length: html.length, content: html.replace(/\s+/g,' ').trim() };
  } catch(e) { results.yp131_full = { error: e.message }; }

  // 2. 嘗試 MoneyDJ AJAX 配息端點
  const ajaxUrls = [
    `https://www.moneydj.com/funddj/djajaxhandler.ashx?a=djfunddiv&b=${djCode}`,
    `https://www.moneydj.com/funddj/djajaxhandler.ashx?a=djfund&b=${djCode}&t=3`,
    `https://www.moneydj.com/funddj/djajaxhandler.ashx?a=djfund&b=${djCode}&t=4`,
    `https://www.moneydj.com/funddj/djajaxhandler.ashx?T=FI&B=${djCode}`,
    `https://www.moneydj.com/funddj/djajaxhandler.ashx?a=djfundbase&b=${djCode}`,
    `https://www.moneydj.com/QAPI/api/fund/GetFundDividend?fundCode=${djCode}`,
    `https://www.moneydj.com/QAPI/api/fund/GetFundInfo?fundCode=${djCode}`,
  ];

  results.ajaxTests = [];
  for (const url of ajaxUrls) {
    try {
      const r = await fetch(url, {
        headers: { ...ajaxHeaders, Referer: `https://www.moneydj.com/funddj/yp/yp131.djhtm?a=${djCode}` },
        signal: AbortSignal.timeout(6000),
      });
      const text = await r.text();
      results.ajaxTests.push({
        url, status: r.status, length: text.length,
        preview: text.substring(0, 300).replace(/\s+/g,' '),
      });
    } catch(e) {
      results.ajaxTests.push({ url, error: e.message });
    }
  }

  // 3. 試試 cnyes API（從 Vercel 伺服器）
  try {
    const cnyesUrl = 'https://fund.api.cnyes.com/fund/api/v1/funds/B20%2C168/dividends';
    const r = await fetch(cnyesUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.cnyes.com/', 'Origin': 'https://fund.cnyes.com' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.cnyes_test = { status: r.status, preview: text.substring(0, 300) };
  } catch(e) {
    results.cnyes_test = { error: e.message };
  }

  res.status(200).json(results);
};
