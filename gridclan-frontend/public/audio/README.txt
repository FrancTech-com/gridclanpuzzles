Background music is now SYNTHESIZED in code (src/services/sound.ts) — a gentle
looping arpeggio + bass played via the Web Audio API. No audio file is needed,
and it starts automatically on the player's first tap (browser autoplay rules),
respecting the in-app sound toggle (Profile → Sound).

Sound EFFECTS (tap, move, hit, win, lose) are likewise synthesized in code.

If you ever want to replace the procedural music with a real licensed track,
drop a looping `background.mp3` here and wire it up in sound.ts (startMusic).
