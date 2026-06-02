'use strict';

/**
 * Indeed Publisher API client (v2)
 * Docs: https://opensource.indeedeng.io/api-documentation/docs/publisher-api/
 *
 * Registration: https://ads.indeed.com/jobroll/xmlfeed
 * Required env vars:
 *   INDEED_PUBLISHER_ID  - Your Indeed Publisher ID (numeric string)
 *   INDEED_API_VERSION   - API version, default "2"
 *
 * Optional (for when Employer API access is granted):
 *   INDEED_CLIENT_ID     - OAuth client_id
 *   INDEED_CLIENT_SECRET - OAuth client_secret
 */

const https = require('https');
const url   = require('url');

const BASE = 'https://api.indeed.com/ads/apisearch';

async function get(endpoint, params) {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = `${endpoint}?${qs}`;
  const parsed  = url.parse(fullUrl);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.path,
      method:   'GET',
      headers:  { 'Accept': 'application/json', 'User-Agent': 'recruitment-platform/1.0' }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, data: d }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Search jobs on Indeed via Publisher API.
 * Returns array of job objects normalized to match our internal format.
 *
 * @param {object} opts
 * @param {string} opts.q        - Query (job title, keywords)
 * @param {string} opts.l        - Location (e.g. "東京都")
 * @param {string} [opts.sort]   - "relevance" | "date"
 * @param {number} [opts.limit]  - Max results (1-25)
 * @param {number} [opts.start]  - Offset for pagination
 * @param {string} [opts.jt]     - Job type: fulltime|parttime|contract|temporary|internship
 */
async function searchJobs({ q, l, sort = 'relevance', limit = 25, start = 0, jt } = {}) {
  const publisherId = process.env.INDEED_PUBLISHER_ID;
  if (!publisherId) throw new Error('INDEED_PUBLISHER_ID が設定されていません。Indeed Publisher登録後に設定してください。');

  const params = {
    publisher: publisherId,
    v:         process.env.INDEED_API_VERSION || '2',
    format:    'json',
    q:         q || '',
    l:         l || '',
    sort,
    start,
    limit,
    co:        'jp',   // Japan
    highlight:  0,
    filter:     1,     // Duplicate filtering
    latlong:    0,
  };
  if (jt) params.jt = jt;

  const r = await get(BASE, params);
  if (r.status !== 200 || !r.data?.results) {
    throw new Error(`Indeed API error (${r.status}): ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  return {
    total:   r.data.totalResults || 0,
    start:   r.data.start || 0,
    results: (r.data.results || []).map(normalizeJob),
  };
}

function normalizeJob(j) {
  return {
    indeedJobKey: j.jobkey || '',
    title:        j.jobtitle || '',
    company:      j.company || '',
    location:     j.formattedLocation || j.city || '',
    url:          j.url || '',
    date:         j.date || '',
    snippet:      j.snippet || '',
    salary:       j.formattedRelativeTime || '',
    sponsored:    !!j.sponsored,
    expired:      !!j.expired,
  };
}

/**
 * Check if Publisher API is configured.
 */
function isConfigured() {
  return !!process.env.INDEED_PUBLISHER_ID;
}

module.exports = { searchJobs, isConfigured };
