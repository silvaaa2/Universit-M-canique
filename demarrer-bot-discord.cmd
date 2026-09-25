@echo off
cd /d "%~dp0"
node --env-file=.env.local scripts\discord-presence.mjs
echo.
echo Le bot est arrete. Appuyez sur une touche pour fermer cette fenetre.
pause >nul
