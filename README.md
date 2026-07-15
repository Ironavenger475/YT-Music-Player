# YT Music Player

Play music from youtube directly in a playlist form like a music player.

## Version Changes:
- Downloads mp3 audio of the linked youtube video and temporarily downloads to the server
- Uses an API to download the mp3 to server
- The audio is deleted after 10 minutes of the server not receiving a signal from the browser

## Advantages to previous version:
- Can play videos that have embedded play disabled
- Can switch songs quickly

## Limitations:
- There is a slight delay on adding songs to the queue since it is downloading the mp3
- Limit on API useage
- Audio quality is inferior to previous version

## Future improvements:
- Improve UI
- Fix a bug where song stops playing when deleting a song from the queue
- Seek alternatives to API like "yt-dlp"
- Bug fixes



