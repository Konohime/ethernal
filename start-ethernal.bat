@echo off
cd /d C:\Users\moi\Documents\GIT\ethernal
concurrently "npm start --prefix backend" "npm run dev --prefix webapp"
pause
