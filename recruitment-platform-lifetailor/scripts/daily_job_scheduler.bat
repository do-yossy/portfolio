@echo off
cd /d C:\Users\sqtan\portfolio\recruitment-platform-lifetailor
set PORT=3002
set INDEED_EMAIL=iife@ymail.ne.jp
set INDEED_PASSWORD=iife20262019
set SITE_NAME=株式会社Life Tailor 採用サイト
set SITE_URL=http://localhost:3002
set ADMIN_USER=admin
set ADMIN_PASSWORD=admin123
node scripts/auto_generate_jobs.js 25 16
echo 完了: %date% %time% >> logs\daily_job.log
