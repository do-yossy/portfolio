#!/usr/bin/env node
'use strict';
/**
 * AI求人自動生成スクリプト
 *
 * 毎日実行して軽貨物・軽配送の求人を自動生成しDBに保存する。
 *
 *   求人ボックス: 25件/日
 *   スタンバイ  : 16件/日
 *   有効期限    : 30日後（Jobs.expireOld()で自動非公開）
 *
 * 実行方法:
 *   node --experimental-sqlite scripts/generate-jobs-ai.js
 *   node --experimental-sqlite scripts/generate-jobs-ai.js --dry-run
 *   node --experimental-sqlite scripts/generate-jobs-ai.js --target kyujinbox --count 5
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY  Claude API キー (必須)
 *   AI_KYUJINBOX_COUNT 求人ボックス生成件数（デフォルト25）
 *   AI_STANBY_COUNT    スタンバイ生成件数（デフォルト16）
 *   COMPANY_NAME       会社名（デフォルト: 株式会社Social Quality）
 *
 * Windows タスクスケジューラーで毎日7:30 に実行推奨。
 */

const path = require('path');
const fs = require('fs');
const https = require('https');

// ── .env 読み込み ──────────────────────────────────────────
(function loadEnv() {
  const envFile = fs.existsSync(path.join(process.cwd(), '.env'))
    ? path.join(process.cwd(), '.env')
    : path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs, Logs } = require('../db-factory');
const AREAS = require('./areas');

// ── CLI 引数 ───────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const targetArg   = args.find(a => a.startsWith('--target='))?.split('=')[1]
                 || (args.includes('--target') ? args[args.indexOf('--target') + 1] : null);
const countArg    = parseInt(
  args.find(a => a.startsWith('--count='))?.split('=')[1]
  || (args.includes('--count') ? args[args.indexOf('--count') + 1] : '0'), 10
) || 0;

const KYUJINBOX_COUNT = countArg && (!targetArg || targetArg === 'kyujinbox')
  ? countArg
  : parseInt(process.env.AI_KYUJINBOX_COUNT || '25', 10);
const STANBY_COUNT = countArg && targetArg === 'stanby'
  ? countArg
  : parseInt(process.env.AI_STANBY_COUNT || '16', 10);

const COMPANY_NAME = process.env.COMPANY_NAME || '株式会社Social Quality';
const EXPIRES_DAYS = parseInt(process.env.AI_EXPIRES_DAYS || '30', 10);

// ── Anthropic API helper ───────────────────────────────────
function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reject(new Error('ANTHROPIC_API_KEY が未設定です'));

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.error) return reject(new Error(data.error.message));
          resolve(data.content?.[0]?.text || '');
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── エリア重複チェック ─────────────────────────────────────
async function getRecentAreaKeys(days = 3) {
  const all = await Jobs.findAll();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const recent = all.filter(j => (j.created_at || '') > cutoff);
  return new Set(recent.map(j => j.location || ''));
}

// ── エリア選択（最近使っていないエリアを優先） ─────────────
function pickAreas(areas, recentKeys, count) {
  const unused = areas.filter(a => !recentKeys.has(a.city + a.area));
  const used   = areas.filter(a =>  recentKeys.has(a.city + a.area));
  const pool = [...unused, ...used];
  const picked = [];
  const usedIdx = new Set();
  while (picked.length < count && picked.length < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!usedIdx.has(idx)) {
      usedIdx.add(idx);
      picked.push(pool[idx]);
    }
  }
  return picked;
}

// ── 給与バリエーション ─────────────────────────────────────
const SALARY_PATTERNS = [
  { salary: '月給25万〜35万円', payType: '月給', payMin: '250000', payMax: '350000' },
  { salary: '月給20万〜30万円', payType: '月給', payMin: '200000', payMax: '300000' },
  { salary: '月給22万〜32万円', payType: '月給', payMin: '220000', payMax: '320000' },
  { salary: '月給28万〜40万円', payType: '月給', payMin: '280000', payMax: '400000' },
  { salary: '業務委託報酬：月35万〜55万円', payType: '月給', payMin: '350000', payMax: '550000' },
  { salary: '業務委託報酬：月30万〜45万円', payType: '月給', payMin: '300000', payMax: '450000' },
];

function pickSalary() {
  return SALARY_PATTERNS[Math.floor(Math.random() * SALARY_PATTERNS.length)];
}

// ── 雇用形態バリエーション ─────────────────────────────────
const EMP_TYPES = ['業務委託', '正社員', 'アルバイト・パート'];

// ── AI プロンプト生成 ──────────────────────────────────────
function buildPrompt(area, salaryPat, empType, media) {
  const mediaNote = media === 'kyujinbox'
    ? '求人ボックス向け（詳細な業務説明を含む）'
    : 'スタンバイ向け（簡潔でキャッチーな表現）';

  return `あなたは採用コピーライターです。以下の条件で軽貨物・軽配送ドライバーの求人票を1件作成してください。

## 条件
- エリア: ${area.city} ${area.area}（最寄り駅: ${area.station}）
- エリア特徴: ${area.note}
- 1日配達件数目安: ${area.vol}
- 給与: ${salaryPat.salary}
- 雇用形態: ${empType}
- 媒体: ${mediaNote}
- 会社名: ${COMPANY_NAME}

## 出力形式（JSON のみ・余分なテキスト不要）
{
  "title": "求人タイトル（30字以内・エリア名と特徴を含む）",
  "catchcopy": "キャッチコピー（40字以内）",
  "description": "仕事内容（200〜300字・箇条書き可）",
  "rewarding": "やりがい・魅力（100〜150字）",
  "qualifications": "応募資格・条件（80〜120字）",
  "worktimeHoliday": "勤務時間・休日（60〜100字）",
  "transportation": "アクセス・駐車場情報（50〜80字）",
  "tags": ["タグ1", "タグ2", "タグ3"]
}

タイトルは毎回異なるバリエーションで作成し、同じ表現を繰り返さないこと。
JSON以外のテキストは出力しないこと。`;
}

// ── 求人生成（1件） ────────────────────────────────────────
async function generateJob(area, media, idx, total) {
  const salaryPat = pickSalary();
  const empType   = EMP_TYPES[idx % EMP_TYPES.length];
  const prompt    = buildPrompt(area, salaryPat, empType, media);

  console.log(`  [${idx + 1}/${total}] ${area.city} ${area.area} (${media}) ...`);

  let aiData = {};
  try {
    const raw = await callClaude(prompt);
    // JSON部分を抽出（```json ... ``` も考慮）
    const jsonMatch = raw.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      aiData = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn(`    ⚠️ AI生成失敗: ${e.message} → デフォルト使用`);
  }

  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return {
    title:          aiData.title          || `${area.area}エリア 軽配送ドライバー募集`,
    location:       `${area.pref}${area.city}`,
    salary:         salaryPat.salary,
    jobType:        'ドライバー',
    employmentType: empType,
    description:    aiData.description    || `${area.area}エリアの軽配送ドライバーを募集します。${area.note}。`,
    catchcopy:      aiData.catchcopy      || `${area.area}で稼げる！軽配送ドライバー`,
    rewarding:      aiData.rewarding      || '',
    qualifications: aiData.qualifications || '',
    worktimeHoliday:aiData.worktimeHoliday|| '8:00〜19:00の間で実働8時間 / 週休2日（シフト制）',
    transportation: aiData.transportation || `${area.station}から車で約10分 / 駐車場完備`,
    tags:           Array.isArray(aiData.tags) ? aiData.tags : ['未経験歓迎', '車通勤OK', '社会保険完備'],
    isPublished:    true,
    targetMedia:    [media],
    expiresAt,
    company:        COMPANY_NAME,
    // キャッシュキー（重複防止用）
    _areaKey:       area.city + area.area,
  };
}

// ── 期限切れ求人を削除 ─────────────────────────────────────
async function cleanupExpired() {
  const changed = await Jobs.expireOld();
  if (changed > 0) {
    console.log(`🗑️  期限切れ求人を非公開化: ${changed}件`);
    await Logs.create('ai_cleanup', 'success', `期限切れ求人 ${changed}件 を非公開化`);
  }
}

// ── メイン ─────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 AI求人自動生成 開始 ${new Date().toISOString().slice(0, 10)}`);
  if (DRY_RUN) console.log('   ⚠️  --dry-run モード（DBへの書き込みなし）');
  console.log(`   求人ボックス: ${KYUJINBOX_COUNT}件 / スタンバイ: ${STANBY_COUNT}件`);
  console.log(`   有効期限: ${EXPIRES_DAYS}日後`);

  // 期限切れ求人を先に片付ける
  await cleanupExpired();

  // 最近使ったエリアを取得（重複回避）
  const recentKeys = await getRecentAreaKeys(3);
  console.log(`\n📍 エリアプール: ${AREAS.length}件 / 直近3日使用: ${recentKeys.size}件`);

  const targets = [];
  if (!targetArg || targetArg === 'kyujinbox') {
    targets.push({ media: 'kyujinbox', count: KYUJINBOX_COUNT });
  }
  if (!targetArg || targetArg === 'stanby') {
    targets.push({ media: 'stanby', count: STANBY_COUNT });
  }

  let totalCreated = 0;
  let totalFailed  = 0;

  for (const { media, count } of targets) {
    console.log(`\n📦 ${media} — ${count}件生成`);
    const areas = pickAreas(AREAS, recentKeys, count);

    for (let i = 0; i < areas.length; i++) {
      const area = areas[i];
      try {
        const jobData = await generateJob(area, media, i, areas.length);
        const { _areaKey, ...insertData } = jobData;

        if (DRY_RUN) {
          console.log(`    ✅ [DRY-RUN] ${jobData.title}`);
        } else {
          const created = await Jobs.create(insertData);
          console.log(`    ✅ 保存: ${created.title} (id=${created.id})`);
          totalCreated++;
        }

        // API レート制限対策: 1秒以上間隔を空ける
        if (i < areas.length - 1) {
          await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
        }
      } catch (e) {
        console.warn(`    ❌ エラー: ${e.message}`);
        totalFailed++;
      }
    }
  }

  if (!DRY_RUN) {
    const summary = `AI生成完了: 作成${totalCreated}件 / 失敗${totalFailed}件`;
    await Logs.create('ai_generate', totalFailed === 0 ? 'success' : 'error', summary);
    console.log(`\n✅ ${summary}`);

    // Google サイトマップ ping
    if (totalCreated > 0) {
      const siteUrl = process.env.SITE_URL || '';
      if (siteUrl) {
        try {
          await new Promise(resolve => {
            const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(siteUrl + '/sitemap.xml')}`;
            https.get(pingUrl, res => {
              console.log(`🔔 Google ping: ${res.statusCode}`);
              resolve();
            }).on('error', e => {
              console.log(`⚠️  Google ping 失敗: ${e.message}`);
              resolve();
            });
          });
        } catch (e) {
          console.log(`⚠️  Google ping エラー: ${e.message}`);
        }
      }
    }
  } else {
    console.log(`\n✅ [DRY-RUN] 完了（実際には保存されていません）`);
  }
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
