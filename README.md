# bga-theoracleofdelphi
🎲 The Oracle of Delphi implementation for Board Game Arena
(c) 2026 George Tzavelas

Designer: Stephan Feld
Artist: Dennis Lohausen
Publisher: Hall Games
BGG: https://boardgamegeek.com/boardgame/193558/the-oracle-of-delphi

This work is done using licensed material from Hall Games with their agreement.

https://hallgames.de/en_us/spiele-delphi/

All rights remain reserved to the publisher Hall Games.

## Local deploy setup

Uploads to BGA Studio run through the VS Code SFTP extension, configured by
`.vscode/sftp.json`. That file holds a live Studio password, so it is
gitignored and each developer supplies their own copy locally:

    cp .vscode/sftp.json.example .vscode/sftp.json

Then fill in `username` and `password` with your own BGA Studio credentials.
Never commit `.vscode/sftp.json`.
