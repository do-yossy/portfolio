'use strict';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/recruitment.db');
db.prepare("DELETE FROM applicants WHERE name LIKE '%手元作業や%'").run();
db.prepare("DELETE FROM applicants WHERE name LIKE '%現場が期間内%'").run();
db.prepare("UPDATE applicants SET name='齋藤飛蝶' WHERE name LIKE '齋藤飛蝶%'").run();
const count = db.prepare('SELECT COUNT(*) as c FROM applicants').get().c;
console.log('完了:', count, '件');
db.close();
