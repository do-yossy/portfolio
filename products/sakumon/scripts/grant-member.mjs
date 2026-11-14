// 先行で使ってもらう先生に、無料で開通する(運営用・手動)。Stripe は通らない。期限が来たら自動で使えなくなる。
//
// 使い方(products/sakumon で実行。Cloudflare にログイン済みの wrangler を使う):
//   node scripts/grant-member.mjs 先生のメールアドレス [無料の月数(省略は3・最大12)]
//
// 会員を作り、続けて「入り直しのリンク」(1回限り・72時間)を表示する。そのリンクを、先生に、メールで送る。
// 先生が続けたいときは、期限が来る前に、通常のお申し込み(/subscribe)をしてもらう(新しい契約になる)。
// 同じメールアドレスで、すでに契約(Stripe)がある場合は、何もしない。
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validEmail, hashToken, buildSql } from './recovery-link.mjs';

const BASE_URL = 'https://sakumon.sakumon-app.workers.dev';
const SECONDS_PER_MONTH = 30 * 24 * 3600;

// SQL は、検証したメールアドレスと、数値だけから作る
export function buildGrantSql(email, months = 3, nowSec = Math.floor(Date.now() / 1000), id = randomBytes(8).toString('hex')) {
  if (!validEmail(email)) throw new Error('メールアドレスの形式が正しくありません(使えない文字が含まれています)');
  const m = Number(months);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('無料の月数は、1〜12の整数で指定してください');
  const until = nowSec + m * SECONDS_PER_MONTH;
  const e = email.toLowerCase();
  const customer = `manual_${id}`;
  const token = randomBytes(24).toString('hex');
  return (
    `INSERT INTO members (customer_id, token, email, subscription_id, status, updated_at) ` +
    `SELECT '${customer}', '${token}', '${e}', 'manual:${until}', 'trialing', ${nowSec} ` +
    `WHERE NOT EXISTS (SELECT 1 FROM members WHERE lower(email) = '${e}' AND status IN ('active','trialing'))`
  );
}

const run = (sql) => {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const out = execFileSync(npx, ['--yes', 'wrangler@4', 'd1', 'execute', 'sakumon', '--remote', '--json', '--command', `"${sql}"`], { encoding: 'utf8', shell: true });
  return JSON.parse(out.slice(out.indexOf('[')))?.[0]?.meta?.changes ?? 0;
};

function main() {
  const [email, monthsArg] = process.argv.slice(2);
  if (!email) {
    console.error('使い方: node scripts/grant-member.mjs 先生のメールアドレス [無料の月数]');
    process.exit(2);
  }
  const months = monthsArg ?? 3;
  if (!run(buildGrantSql(email, months))) {
    console.error('開通しませんでした。同じメールアドレスで、すでに有効な会員がいます。入れない場合は、scripts/recovery-link.mjs で入り直しのリンクを発行してください。');
    process.exit(1);
  }
  const token = randomBytes(24).toString('hex');
  if (!run(buildSql(email, hashToken(token), 72))) {
    console.error('会員は作りましたが、入り直しのリンクを発行できませんでした。scripts/recovery-link.mjs を、もう一度実行してください。');
    process.exit(1);
  }
  console.log(`開通しました(無料${months}か月)。次のリンクを、先生に、メールで送ってください(1回限り・72時間)。\n`);
  console.log(`${BASE_URL}/recover/${token}\n`);
  console.log('案内の例:\n  下のリンクを、ふだん使うブラウザ(自宅や私物のパソコン)で開き、「このブラウザで入り直す」を押してください。他の人には教えないでください。');
  console.log('\n運営の記録に、名前・メールアドレス・開通日・終了日を残してください。');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
