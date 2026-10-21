// 入れなくなったお客様に送る、1回限りの「入り直しのリンク」を発行する(運営用・手動)。
// メールのログイン(Resend)が未設定のあいだの復旧手段。メール設定後も、問い合わせ対応に使える。
//
// 使い方(products/sakumon で実行。Cloudflare にログイン済みの wrangler を使う):
//   node scripts/recovery-link.mjs お客様のメールアドレス [有効時間(時間・省略は24)]
//
// 発行するリンクは、契約が有効(active / trialing)な会員のものだけ。1回限りで、期限が切れると使えない。
// お客様のご本人確認(問い合わせフォームに届いたメールアドレスが、ご契約のものか)は、運営が先に行うこと。
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://sakumon.sakumon-app.workers.dev';

// SQLに埋め込む値は、ここで通ったものだけ(記号は使えない)。シェルとSQLの両方で安全な文字に限る
export const validEmail = (s) => /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/.test(String(s || ''));

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function buildSql(email, tokenHash, hours = 24, nowSec = Math.floor(Date.now() / 1000)) {
  if (!validEmail(email)) throw new Error('メールアドレスの形式が正しくありません(使えない文字が含まれています)');
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('トークンのハッシュが正しくありません');
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || h > 168) throw new Error('有効時間は、1〜168時間で指定してください');
  const exp = nowSec + Math.floor(h * 3600);
  return (
    `INSERT INTO recovery_links (id, customer_id, expires_at, used, created_at) ` +
    `SELECT '${tokenHash}', customer_id, ${exp}, 0, ${nowSec} FROM members ` +
    `WHERE lower(email) = '${email.toLowerCase()}' AND status IN ('active','trialing') ORDER BY updated_at DESC LIMIT 1`
  );
}

function main() {
  const [email, hoursArg] = process.argv.slice(2);
  if (!email) {
    console.error('使い方: node scripts/recovery-link.mjs お客様のメールアドレス [有効時間(時間)]');
    process.exit(2);
  }
  const token = randomBytes(24).toString('hex'); // 48桁。DBにはハッシュだけ保存する
  const sql = buildSql(email, hashToken(token), hoursArg ?? 24);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const out = execFileSync(npx, ['--yes', 'wrangler@4', 'd1', 'execute', 'sakumon', '--remote', '--json', '--command', `"${sql}"`], {
    encoding: 'utf8',
    shell: true,
  });
  const changes = JSON.parse(out.slice(out.indexOf('[')))?.[0]?.meta?.changes ?? 0;
  if (!changes) {
    console.error('契約中の会員が見つかりませんでした。メールアドレス(Stripeに登録されたもの)と、契約の状態を確認してください。リンクは発行していません。');
    process.exit(1);
  }
  const hours = Number(hoursArg ?? 24);
  console.log('入り直しのリンクを発行しました(1回限り・有効時間' + hours + '時間)。このリンクを、お客様に、問い合わせへの返信で、お送りしてください。\n');
  console.log(`${BASE_URL}/recover/${token}\n`);
  console.log('お客様への案内の例:\n  下のリンクを、新しい端末のブラウザで開き、「このブラウザで入り直す」を押してください。リンクは1回だけ、' + hours + '時間以内に使えます。他の人には教えないでください。');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
