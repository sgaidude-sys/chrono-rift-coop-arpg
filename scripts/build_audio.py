"""
Chrono-Rift audio build pipeline.

  python scripts/build_audio.py            # build everything (skips files that already exist)
  python scripts/build_audio.py --force    # rebuild everything
  python scripts/build_audio.py voice      # only voices (also: music, sfx)

Requires: pip install kokoro-onnx soundfile ; ffmpeg on PATH.
Kokoro model + voices are read from the Hugging Face cache (fastrtc/kokoro-onnx) or
from KOKORO_MODEL / KOKORO_VOICES env vars.

Outputs (all served from public/assets/audio/):
  voice/<id>.mp3 + voice/manifest.json   (id -> {file, dur, speaker, text})
  music/<zone>.mp3                       (seamless loops)
  ambience/<zone>.mp3                    (seamless loops)
  sfx/<name>.mp3                         (trimmed one-shots)
  step/<surface>_<n>.mp3                 (footstep variants)
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "audio")
FORCE = "--force" in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith("--")]
# --redo=hero_,grunt_  -> force-rebuild only lines whose id starts with one of these prefixes
REDO = tuple(x for a in sys.argv[1:] if a.startswith("--redo=") for x in a[7:].split(",") if x)
# --redo-speaker=lyra,aldous -> force-rebuild every line spoken by these characters
REDO_SPK = tuple(x for a in sys.argv[1:] if a.startswith("--redo-speaker=") for x in a[15:].split(",") if x)

# ---------------------------------------------------------------------------
# VOICE CAST — Kokoro voice, speed, language and an ffmpeg FX chain per character
# ---------------------------------------------------------------------------
ROOM = "aecho=0.8:0.4:22:0.10"
CAST = {
    "aldous":    dict(voice="bm_george",   speed=0.92, lang="en-gb", fx=ROOM),
    # Lyra: British blend, clean natural chain (no short comb echo), higher bitrate
    "lyra":      dict(voice="bf_alice", blend=[("bf_alice", 0.6), ("bf_lily", 0.4)], speed=0.95, lang="en-gb", kbps="128k",
                      fx="highpass=f=75,equalizer=f=220:t=q:w=1.0:g=1.5,equalizer=f=3200:t=q:w=1.2:g=1.5,equalizer=f=7000:t=q:w=1.5:g=-2.5,"
                         "acompressor=threshold=-22dB:ratio=2.5:attack=6:release=90:makeup=1.5,aecho=0.85:0.9:120|190:0.06|0.035"),
    "gronk":     dict(voice="am_puck",     speed=0.98, lang="en-us", pitch=0.80,
                      fx="acrusher=bits=9:mix=0.18,bass=g=5,aecho=0.8:0.55:55|110:0.25|0.12"),
    "kaelen":    dict(voice="am_onyx",     speed=0.97, lang="en-us", fx=ROOM),
    "xeno":      dict(voice="af_nova",     speed=0.95, lang="en-us", pitch=0.92,
                      fx="afftfilt=real='hypot(re,im)*cos(0)':imag='hypot(re,im)*sin(0)':win_size=256:overlap=0.75,"
                         "flanger=delay=2:depth=3:speed=0.4,aecho=0.8:0.5:18:0.2,highpass=f=160"),
    "malakor":   dict(voice="bm_lewis",    speed=0.9, lang="en-gb", pitch=0.85,
                      fx="bass=g=5,aecho=0.8:0.7:60|130|240:0.22|0.12|0.06", layer_octave=True),
    "seraphina": dict(voice="bf_emma",     speed=0.96, lang="en-gb", fx="aecho=0.8:0.6:80|160:0.22|0.12"),
}

# Playable heroes: blended voices (two Kokoro style vectors mixed into one distinct
# timbre) + a proper vocal chain: rumble cut, mud cut, presence lift, gentle
# compression and a short "room" so the hero sits in the world but stays clear.
HERO_FX = ("highpass=f=85,equalizer=f=280:t=q:w=1.1:g=-2.5,equalizer=f=3300:t=q:w=1.0:g=3,"
           "acompressor=threshold=-20dB:ratio=3:attack=4:release=70:makeup=2")
CAST.update({
    "vanguard":  dict(voice="am_michael", blend=[("am_michael", 0.58), ("am_onyx", 0.42)], speed=1.0, lang="en-us",
                      fx=HERO_FX + ",bass=g=1.5,aecho=0.8:0.3:24|42:0.09|0.05"),
    "ranger":    dict(voice="af_bella", blend=[("af_bella", 0.6), ("af_heart", 0.4)], speed=1.05, lang="en-us",
                      fx=HERO_FX + ",aecho=0.8:0.28:20|38:0.08|0.05"),
    "arcanist":  dict(voice="bf_emma", blend=[("bf_emma", 0.55), ("bf_isabella", 0.45)], speed=0.97, lang="en-gb",
                      fx=HERO_FX + ",aecho=0.8:0.45:38|85|140:0.14|0.08|0.04"),
    "berserker": dict(voice="am_fenrir", blend=[("am_fenrir", 0.62), ("am_onyx", 0.38)], speed=1.04, lang="en-us", pitch=0.94,
                      fx=HERO_FX + ",bass=g=3,acrusher=bits=12:mix=0.05,aecho=0.8:0.3:24|40:0.1|0.05"),
})

SPEAKER_LABEL = {
    "aldous": "Lorekeeper Aldous", "lyra": "Rift Gatekeeper Lyra", "gronk": "Gronk, Puglin Warlord",
    "kaelen": "Blacksmith Kaelen", "xeno": "Xeno-Harbinger", "malakor": "Archon Malakor",
    "seraphina": "High Cleric Seraphina", "vanguard": "Vanguard Knight", "ranger": "Shadow Ranger",
    "arcanist": "Reaper Arcanist", "berserker": "Berserker Warlord",
}

LINES = {
    # --- Story cutscenes (ids match STORY_CHAPTERS shot order in index.html) ---
    "cs_ch1_0": ("aldous", "When the Chrono-Rifts tore open above Ashenvale Bastion, ancient stone and astral steel collided across time."),
    "cs_ch1_1": ("lyra", "Abyssal Imps and Puglin Marauders are breaching the northern gate! Clear the Outskirts Raiders, and rally your party!"),
    "cs_ch2_0": ("gronk", "Fresh steel wanders into my crypts! Come, heroes... feed your chrono-shards to the Bestiary!"),
    "cs_ch2_1": ("kaelen", "Strike down Gronk and his pack. Their cores will temper your relics for the Astral Breach ahead!"),
    "cs_ch3_0": ("xeno", "Timeline convergence detected. Astral Cyclops Juggernaut... purge all organic anomalies."),
    "cs_ch3_1": ("lyra", "Press Space to vault over the shockwaves, and focus fire on the Juggernaut!"),
    "cs_ch4_0": ("malakor", "I am the nexus of every broken age! Kneel before the Chrono-Fused Throne, mortals!"),
    "cs_ch4_1": ("seraphina", "Charge your Co-Op Synergy, and unleash Astral Convergence together. Now!"),
    "cs_ch5_0": ("aldous", "Malakor falls, and golden light breaks across Ashenvale. Yet deeper echoes stir, beyond the Endless Rift..."),
    "cs_ch5_1": ("lyra", "Victory belongs to your party! Prepare yourselves. The Endless Rift escalates to the next tier!"),

    # --- First-run prologue: played as Lyra, then "Answer the call" (mmo_prologue.js / mmo_inkcine.js) ---
    "pro_open": ("aldous", "Ashenvale. The night the sky tore open... and the Rift Gatekeeper stood alone."),
    "pro_lyra_0": ("lyra", "I'm Lyra, keeper of the Rift Gate. The breach is right outside the walls. I have to hold it!"),
    "pro_lyra_1": ("lyra", "More of them! They're pouring through!"),
    "pro_lyra_surge": ("lyra", "No... the breach is tearing wider!"),
    "call_0": ("lyra", "There are too many... I can't seal it alone."),
    "call_1": ("lyra", "Across every timeline... hear me. Answer my call!"),
    "call_2": ("aldous", "Her call echoed through four timelines. Four champions turned toward the light... but only one would answer."),
    "answer_0": ("aldous", "The call was answered. A champion stepped out of the rift, and the battle for Ashenvale began."),
    "town_lyra_0": ("lyra", "You came... Then the rift chose well. Take my reserve weapon, and clear the Meadows before more break through."),

    # --- NPC greetings & services ---
    "kaelen_greet": ("kaelen", "Hail, hero! The Chrono-Rifts warped steel and starlight alike. Bring me your blades, and I'll temper them hot enough to cleave an Archon."),
    "kaelen_temper": ("kaelen", "Hah! Feel that edge? That'll bite."),
    "kaelen_forge": ("kaelen", "A fine relic. Wield it with pride."),
    "kaelen_broke": ("kaelen", "Come back when your purse is heavier, friend."),
    "seraphina_greet": ("seraphina", "May the Twin Moons shield your spirit. Rest at the Sanctuary Shrine, and let Solaris mend your party's wounds."),
    "seraphina_heal": ("seraphina", "Be whole again, all of you."),
    "seraphina_elixirs": ("seraphina", "Three elixirs, freshly blessed. Use them well."),
    "seraphina_blessing": ("seraphina", "Solaris burns within you. Strike true!"),
    "seraphina_sanctuary": ("seraphina", "The Sanctuary's blessing restores your party. Fight on."),
    "lyra_greet": ("lyra", "The Astral Gate hums with power. Step through when your squad is ready, or shift timelines at once."),
    "lyra_wave": ("lyra", "A new Rift Wave has awakened. Steel yourselves!"),
    "aldous_lore_0": ("aldous", "Before the Chrono-Rifts tore open the northern sky, Ashenvale Bastion stood as the serene frontier of Sunsteel knights and woodland trackers. Now, medieval stone and alien monoliths share one horizon."),
    "aldous_lore_1": ("aldous", "Beneath the western crypts, Puglin Warlords and Abyssal Imps guard ancient chests, forged in flame and frost. Hunters who clear the catacombs harvest rare relics for Blacksmith Kaelen."),
    "aldous_lore_2": ("aldous", "In the far northern Citadel hovers Malakor, the Chrono-Fused Archon. Armed with a void scythe and a golden broadsword, only coordinated Convergence can shatter his temporal shield."),
    "aldous_tome": ("aldous", "The Chrono-Rifts tore open above Ashenvale Bastion, fusing medieval stone with future citadels. Forge mythic weapons, and strike down Archon Malakor!"),

    # --- Bosses & elites ---
    "malakor_engage": ("malakor", "So, the insects crawl to my throne. Your timelines end here!"),
    "malakor_half": ("malakor", "You wound me? I have died a thousand times, in a thousand ages!"),
    "malakor_quarter": ("malakor", "Enough! Let every age collapse upon you!"),
    "malakor_death": ("malakor", "Impossible... The Rift... will consume... all timelines!"),
    "gronk_engage": ("gronk", "Smash the shiny ones! Gronk wants their shards!"),
    "gronk_death": ("gronk", "Gronk... not... finished..."),
    "xeno_engage": ("xeno", "Organic anomaly located. Commencing purge."),
    "xeno_death": ("xeno", "Critical failure. Timeline... corrupted."),
}

# Hero lines: several takes per moment so they rarely repeat (the game shuffles
# between hero_<cls>_<key>, hero_<cls>_<key>_1, ... / sig_0..3 / kill_0..2).
HERO_BARKS = {
    "vanguard": {
        "spawn": ["Vanguard, reporting. Let's make Ashenvale proud.", "Shield up, eyes forward. We move."],
        "ult": ["By the Sunsteel oath... converge!", "Light of the Bastion... answer me!"],
        "sig": ["Stand behind the banner!", "Rally to me!", "Hold the line!", "Not one step back!"],
        "levelup": ["My oath grows stronger.", "I can feel the Sunsteel burning brighter."],
        "lowhp": ["I'm hurt... but I'm still standing!", "Steady... steady. I can hold."],
        "revived": ["Back on my feet. For Ashenvale!", "Thank you. Let's finish this."],
        "kill": ["Rest now.", "Another threat ended.", "For the Bastion!"],
        "boss": ["A worthy foe. Stand with me!", "That one's big. Shields up!"],
        "zone": ["New ground. Stay sharp.", "So this is what lies beyond the wall."],
        "quest": ["Duty done. The people can rest easy.", "Another promise kept."],
    },
    "ranger": {
        "spawn": ["Shadow Ranger, in position.", "Quiet now. Let them come to us."],
        "ult": ["Stars above... fall with me!", "Every arrow finds its mark. Watch!"],
        "sig": ["Rain them down!", "Nowhere to hide.", "Marked you.", "Too slow!"],
        "levelup": ["Sharper eyes. Steadier hands.", "Ha. I'm getting good at this."],
        "lowhp": ["Too close! I need cover!", "Okay... that one hurt."],
        "revived": ["Thanks. I owe you one.", "Back in the fight. Don't tell anyone."],
        "kill": ["Clean shot.", "Down you go.", "Bullseye!"],
        "boss": ["That's a big target. Easy to hit, at least.", "Keep it busy. I'll do the rest."],
        "zone": ["Fresh tracks... and a view worth the climb.", "New woods, new secrets."],
        "quest": ["Job done. What's next?", "Told you we'd make it look easy."],
    },
    "arcanist": {
        "spawn": ["The Reaper walks. Shall we?", "Time is short. Let us not waste it."],
        "ult": ["Time itself bends to us. Converge!", "Every clock stops... for you."],
        "sig": ["Time... stand still.", "Freeze, and wither.", "Your hour has come.", "Fade into the rift."],
        "levelup": ["The rift whispers new secrets.", "Ah... power, at last."],
        "lowhp": ["My aether is fading...", "Careful... the veil grows thin."],
        "revived": ["Death is merely a pause.", "I have seen my end. This was not it."],
        "kill": ["Reaped.", "Your time is up.", "Into the dark with you."],
        "boss": ["Such ancient power... I will take it.", "Let us see how long you last."],
        "zone": ["This place remembers things it shouldn't.", "The rift runs deep here."],
        "quest": ["As foretold.", "Another thread, neatly cut."],
    },
    "berserker": {
        "spawn": ["The Warlord has arrived. Who's first?", "I smell a fight. Good."],
        "ult": ["Burn it all! Together!", "Fury unchained! Raaagh!"],
        "sig": ["Blood and fire!", "More! Bring me more!", "Come here!", "Crush them!"],
        "levelup": ["I grow stronger!", "Ha! Feel that? That's power!"],
        "lowhp": ["Is that all you've got?", "Pain just makes me angry!"],
        "revived": ["Can't kill me that easy!", "Ha! Round two!"],
        "kill": ["Next!", "Too easy!", "Who's next?!"],
        "boss": ["Finally, something worth smashing!", "You're big. I'm angrier."],
        "zone": ["New land, new fights!", "Hope something here hits back."],
        "quest": ["Done! Where's the ale?", "Ha! Another victory!"],
    },
}
# ids: legacy single keys keep their old id for the first take (hero_<cls>_spawn, ..._1, ...);
# sig keeps sig_0..3; new moments use <key>_0..n
LEGACY_SINGLE = {"spawn", "ult", "levelup", "lowhp", "revived"}
for cls, barks in HERO_BARKS.items():
    for key, texts in barks.items():
        for i, text in enumerate(texts):
            if key in LEGACY_SINGLE:
                lid = f"hero_{cls}_{key}" if i == 0 else f"hero_{cls}_{key}_{i}"
            else:
                lid = f"hero_{cls}_{key}_{i}"
            LINES[lid] = (cls, text)

# ---------------------------------------------------------------------------
# MMO EXPANSION CAST — zone bosses, world bosses, quest givers, announcer
# ---------------------------------------------------------------------------
OCT = dict(layer_octave=True)
CAST.update({
    "mycelord":  dict(voice="am_onyx",    speed=0.9,  lang="en-us", pitch=0.78, fx="vibrato=f=5:d=0.25,bass=g=4,aecho=0.8:0.6:45|90:0.25|0.12"),
    "grimtooth": dict(voice="am_puck",    speed=1.0,  lang="en-us", pitch=0.84, fx="acrusher=bits=10:mix=0.15,bass=g=4,aecho=0.8:0.5:30:0.18"),
    "skullcrusher": dict(voice="am_fenrir", speed=0.92, lang="en-us", pitch=0.76, fx="acrusher=bits=9:mix=0.2,bass=g=6,aecho=0.8:0.6:50|100:0.25|0.12"),
    "frostmaw":  dict(voice="am_onyx",    speed=0.86, lang="en-us", pitch=0.7,  fx="bass=g=5,aecho=0.8:0.8:90|180|320:0.3|0.18|0.08", **OCT),
    "azhazel":   dict(voice="bm_lewis",   speed=0.9,  lang="en-gb", pitch=0.82, fx="bass=g=5,aecho=0.8:0.6:60|130:0.18|0.08", **OCT),
    "ignaroth":  dict(voice="am_michael", speed=0.88, lang="en-us", pitch=0.74, fx="bass=g=5,aecho=0.8:0.7:110|230:0.2|0.1", **OCT),
    "hywirl":    dict(voice="af_kore",    speed=0.92, lang="en-us", pitch=0.88, fx="flanger=delay=4:depth=6:speed=0.6,aecho=0.8:0.7:70|160:0.3|0.15"),
    "leviathan": dict(voice="am_echo",    speed=0.86, lang="en-us", pitch=0.74, fx="lowpass=f=4200,bass=g=5,aecho=0.8:0.7:100|220:0.2|0.1", **OCT),
    "elric":     dict(voice="bm_daniel",  speed=0.98, lang="en-gb", fx=ROOM),
    "sylwen":    dict(voice="bf_alice",   speed=1.0,  lang="en-gb", fx=ROOM),
    "moss":      dict(voice="bm_george",  speed=0.9,  lang="en-gb", pitch=0.92, fx="acrusher=bits=12:mix=0.06," + ROOM),
    "rhaz":      dict(voice="am_eric",    speed=1.0,  lang="en-us", fx=ROOM),
    "ylva":      dict(voice="bf_lily",    speed=0.95, lang="en-gb", fx="aecho=0.8:0.6:60|130:0.2|0.1"),
    "ozen":      dict(voice="am_liam",    speed=0.98, lang="en-us", fx="flanger=delay=1:depth=1.5:speed=0.3," + ROOM),
    "ashka":     dict(voice="af_river",   speed=1.0,  lang="en-us", fx="aecho=0.8:0.5:40:0.15"),
})
SPEAKER_LABEL.update({k: k.title() for k in ["mycelord", "grimtooth", "skullcrusher", "frostmaw", "azhazel", "ignaroth", "hywirl", "leviathan", "elric", "sylwen", "moss", "rhaz", "ylva", "ozen", "ashka"]})

BOSS_LINES = {
    "mycelord": ["Trespassers in my meadow! You will feed the spores!", "Spores... everywhere!", "", "My mycelium... withers..."],
    "grimtooth": ["Who dares climb Grimtooth's canopy?", "The canopy trembles!", "", "The forest... falls silent..."],
    "skullcrusher": ["More skulls for my throne! Charge!", "Beat the war drums!", "", "The dunes... take me..."],
    "frostmaw": ["The mountain does not want you here.", "The mountain answers me!", "", "The thaw... comes..."],
    "azhazel": ["Kneel in the flames, mortals. Kneel!", "Rise, children of the rift!", "Burn with me!", "Blue fire... fading..."],
    "ignaroth": ["Little sparks. You come to the furnace of the sky?", "Burn beneath my wings!", "The sky itself ignites!", "My flame... eternal... no..."],
    "hywirl": ["The storm has found you.", "Feel the gale!", "The storm is endless!", "The winds... are still..."],
    "leviathan": ["The abyss... hungers for you, little ones.", "Sink with me into the dark.", "All rifts end in me!", "The deep... reclaims me..."],
    "gronk": ["", "Puglins! To Gronk!", "Gronk smash!", ""],
    "xeno": ["", "Escalating purge protocol.", "Critical. Overclocking.", ""],
}
for b, (eng, p2, p3, death) in BOSS_LINES.items():
    for key, text in (("engage", eng), ("p2", p2), ("p3", p3), ("death", death)):
        if text:
            LINES[f"boss_{b}_{key}"] = (b, text)

GIVER_LINES = {
    "elric": ("Welcome, recruit. The meadows need a steady blade. Take a task from the board.", "Fine work. The Bastion sleeps easier tonight."),
    "sylwen": ("Quiet steps, friend. Whisperwood bites the careless.", "The forest thanks you. So do I."),
    "moss": ("Mind the graves... the dead here don't stay put.", "Good. The crypts are a little quieter."),
    "rhaz": ("Water's scarce, coin's scarcer. Want work?", "Ha! The caravan owes you a drink."),
    "ylva": ("The ice whispers your name, traveler. Will you listen?", "The frost recedes. Well done."),
    "ozen": ("Readings off the charts. Help me stabilise this breach.", "Breach stabilising. Excellent work."),
    "ashka": ("Stay out of the lava and you might live. Might.", "You walked through fire for us. Respect."),
}
for g, (greet, thanks) in GIVER_LINES.items():
    LINES[f"qg_{g}_greet"] = (g, greet)
    LINES[f"qg_{g}_thanks"] = (g, thanks)

ANNOUNCER = {
    "wb_ember_wyrm": "Ignaroth, the Ember Wyrm, has awakened in the Scorched Badlands! Gather your party!",
    "wb_storm_sovereign": "Hywirl, the Storm Sovereign, stirs above Frostpeak! Heroes, to arms!",
    "wb_leviathan": "The Abyssal Leviathan rises in the Infernal Rift! All heroes, answer the call!",
    "ann_boss_slain": "A great foe has fallen! Glory to the party!",
    "ann_quest_done": "Quest complete!",
    "ann_new_zone": "New lands discovered.",
}
for k, text in ANNOUNCER.items():
    LINES[k] = ("lyra", text)

# Short hero effort grunts (attacks / taking a big hit)
GRUNTS = {"attack": ["Hah!", "Hyah!", "Huah!", "Tch!", "Hmph!"], "hurt": ["Agh!", "Ugh!", "Nngh!"]}
GRUNTS_BY_CLASS = {"berserker": {"attack": ["Hah!", "Raah!", "Huargh!", "Hyah!", "Graah!"], "hurt": ["Agh!", "Grr... ugh!", "Ngh!"]}}
for cls in ("vanguard", "ranger", "arcanist", "berserker"):
    for kind, texts in GRUNTS_BY_CLASS.get(cls, GRUNTS).items():
        for i, t in enumerate(texts):
            LINES[f"grunt_{cls}_{kind}_{i}"] = (cls, t)

# Creature voices: Kokoro reads short pseudo-words, ffmpeg turns them into monster sounds
CAST.update({
    "cr_critter": dict(voice="af_sky",    speed=1.15, lang="en-us", pitch=1.55, fx="highpass=f=400,aecho=0.8:0.3:12:0.1", norm=-20),
    "cr_slime":   dict(voice="am_puck",   speed=0.9,  lang="en-us", pitch=0.68, fx="vibrato=f=14:d=0.7,lowpass=f=1600,bass=g=6", norm=-20),
    "cr_beast":   dict(voice="am_onyx",   speed=0.95, lang="en-us", pitch=0.58, fx="acrusher=bits=8:mix=0.25,bass=g=8,lowpass=f=3000,aecho=0.8:0.4:25:0.15", norm=-19),
    "cr_insect":  dict(voice="af_nova",   speed=1.1,  lang="en-us", pitch=1.3,  fx="tremolo=f=55:d=0.85,flanger=delay=1:depth=2:speed=3,highpass=f=300", norm=-21),
    "cr_undead":  dict(voice="af_nicole", speed=0.8,  lang="en-us", pitch=0.72, fx="vibrato=f=4:d=0.4,aecho=0.8:0.85:80|170|300:0.4|0.25|0.12,lowpass=f=4000", norm=-20),
    "cr_brute":   dict(voice="am_fenrir", speed=1.0,  lang="en-us", pitch=0.7,  fx="acrusher=bits=9:mix=0.2,bass=g=6,aecho=0.8:0.4:20:0.12", norm=-19),
    "cr_demon":   dict(voice="bm_lewis",  speed=0.9,  lang="en-gb", pitch=0.6,  fx="bass=g=7,aecho=0.8:0.6:50|110:0.25|0.12", layer_octave=True, norm=-19),
    "cr_alien":   dict(voice="af_nova",   speed=1.05, lang="en-us", pitch=0.9,
                       fx="afftfilt=real='hypot(re,im)*cos(0)':imag='hypot(re,im)*sin(0)':win_size=128:overlap=0.75,flanger=delay=1:depth=3:speed=2,highpass=f=250", norm=-21),
    "cr_drake":   dict(voice="am_michael", speed=0.85, lang="en-us", pitch=0.5, fx="acrusher=bits=9:mix=0.15,bass=g=8,aecho=0.8:0.8:90|200:0.35|0.18", layer_octave=True, norm=-18),
})
CREATURES = {
    "critter": {"aggro": ["Eek!", "Skree!"], "hurt": ["Eep!"], "death": ["Eeeeee."]},
    "slime":   {"aggro": ["Blorp!", "Gloop!"], "hurt": ["Blup!"], "death": ["Glorrb."]},
    "beast":   {"aggro": ["Grrah!", "Rawrr!"], "hurt": ["Rruf!"], "death": ["Awrooo."]},
    "insect":  {"aggro": ["Bzzt!", "Hiss!"], "hurt": ["Tsst!"], "death": ["Bzz... tzz."]},
    "undead":  {"aggro": ["Ooooh!", "Haaah!"], "hurt": ["Hah!"], "death": ["Nooooo."]},
    "brute":   {"aggro": ["Raaah!", "Grah! Fresh meat!"], "hurt": ["Ugh!"], "death": ["Aaargh!"]},
    "demon":   {"aggro": ["Ha ha ha!", "Burn!"], "hurt": ["Gah!"], "death": ["Nooo!"]},
    "alien":   {"aggro": ["Target acquired.", "Kreet kreet!"], "hurt": ["Zzt!"], "death": ["System failure."]},
    "drake":   {"aggro": ["Rooaar!", "Grraaah!"], "hurt": ["Rrah!"], "death": ["Rraaawr."]},
}
for fam, kinds in CREATURES.items():
    for kind, texts in kinds.items():
        for i, t in enumerate(texts):
            LINES[f"cr_{fam}_{kind}_{i}"] = ("cr_" + fam, t)
            SPEAKER_LABEL["cr_" + fam] = fam

# ---------------------------------------------------------------------------
# MUSIC / AMBIENCE / SFX sources (raw packs at repo root, gitignored)
# ---------------------------------------------------------------------------
GQ = os.path.join(ROOT, "Gregor Quendel - Designed Series - Free Downloads")
FS = os.path.join(ROOT, "JDSherbert - Footstep Foley SFX Pack (FREE)")


def gq(name):
    hits = [p for p in glob.glob(os.path.join(GQ, "**", f"*{name}*.wav"), recursive=True)
            if not os.path.basename(p).startswith("._")]
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


def fs(name):
    hits = [p for p in glob.glob(os.path.join(FS, "**", f"*({name}).mp3"), recursive=True)
            if not os.path.basename(p).startswith("._")]
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]


# name -> (source, start, length, loop crossfade, bitrate, channels, gain dB)
MUSIC = {
    "music/town":      (os.path.join(ROOT, "castle barricade.wav"), 0, None, 4.0, "112k", 2, 0),
    "music/catacombs": (os.path.join(ROOT, "ancient cave.wav"), 0, None, 4.0, "112k", 2, 0),
}
AMBIENCE = {
    "ambience/town":      (lambda: gq("Wind - 001"), 0, 50, 3.0, "64k", 1, -2),
    "ambience/catacombs": (lambda: gq("Sub - 003"), 0, 60, 3.0, "64k", 1, 0),
    "ambience/breach":    (lambda: gq("Subcycle"), 0, 56, 3.0, "64k", 1, -1),
    "ambience/citadel":   (lambda: gq("Harmonic - 008"), 10, 70, 4.0, "64k", 1, -1),
}
# name -> (source, start, max length, fade out, gain dB)
SFX = {
    "sfx/fire_sizzle":  (lambda: gq("Short - Swoosh Burst Sizzling 01"), 0, 1.8, 0.5, 0),
    "sfx/fire_impact":  (lambda: gq("Impacts - Complex 04"), 0, 2.2, 0.8, 0),
    "sfx/fire_whoosh":  (lambda: gq("Swooshes - Burst Evolving 19"), 0, 2.4, 0.9, 0),
    "sfx/ice_freeze":   (lambda: gq("Ice - Sequences 01"), 0, 2.6, 1.0, 0),
    "sfx/mecha_impact": (lambda: gq("Mecha - Elements - Impact 01"), 0, 1.6, 0.5, 0),
    "sfx/rock_crumble": (lambda: gq("Rocks - Elements 09"), 0, 2.2, 0.8, 0),
    "sfx/summon":       (lambda: gq("Sci-Fi - Summon_01"), 0, 3.4, 1.0, 0),
    "sfx/blink":        (lambda: gq("Tuner_Chaoswhip_02"), 0, 1.6, 0.4, 0),
    "sfx/arcane_orb":   (lambda: gq("Sci-Fi - Aquapur_10"), 0, 2.4, 0.8, 0),
    "sfx/xeno_death":   (lambda: gq("Sci-Fi - Gourd_Scramble"), 0, 2.2, 0.8, 0),
    "sfx/chime":        (lambda: gq("Sci-Fi - Science_07"), 0, 1.0, 0.3, 0),
    "sfx/goo_death":    (lambda: gq("Plastic - Elements - Liquid 17"), 0, 1.3, 0.3, 0),
    "sfx/ult_swell":    (lambda: gq("Sci-Fi - Noids_Korvax_01"), 0, 2.5, 0.6, 0),
}
STEPS = {
    "grass": ["Grass - 1", "Grass - 2"],
    "stone": ["Stone - 1", "Stone - 2"],
    "metal": ["Metal - 1", "Metal - 2"],
    "gravel": ["Gravel - 1", "Gravel - 2"],
}


def ff(args):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + args
    subprocess.run(cmd, check=True)


def probe_dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout.strip()
    return round(float(out), 3)


def need(path):
    return FORCE or not os.path.exists(path)


# ---------------------------------------------------------------------------
def build_voices():
    from kokoro_onnx import Kokoro
    import soundfile as sf

    model = os.environ.get("KOKORO_MODEL")
    voices = os.environ.get("KOKORO_VOICES")
    if not model:
        snap = glob.glob(os.path.expanduser("~/.cache/huggingface/hub/models--fastrtc--kokoro-onnx/snapshots/*/"))
        if not snap:
            raise SystemExit("Kokoro model not found: set KOKORO_MODEL and KOKORO_VOICES")
        model = os.path.join(snap[0], "kokoro-v1.0.onnx")
        voices = os.path.join(snap[0], "voices-v1.0.bin")
    kokoro = Kokoro(model, voices)

    vdir = os.path.join(OUT, "voice")
    os.makedirs(vdir, exist_ok=True)
    manifest_path = os.path.join(vdir, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path) and not FORCE:
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)

    tmp = tempfile.mkdtemp(prefix="crvoice_")
    for line_id, (speaker, text) in LINES.items():
        out_path = os.path.join(vdir, f"{line_id}.mp3")
        prev = manifest.get(line_id)
        redo = (bool(REDO) and line_id.startswith(REDO)) or speaker in REDO_SPK
        if not redo and not need(out_path) and prev and prev.get("text") == text:
            continue
        c = CAST[speaker]
        voice = c["voice"]
        if c.get("blend"):
            # mix Kokoro style vectors -> a distinct timbre per hero
            voice = sum(kokoro.get_voice_style(n) * w for n, w in c["blend"])
        samples, sr = kokoro.create(text, voice=voice, speed=c["speed"], lang=c["lang"])
        raw = os.path.join(tmp, f"{line_id}.wav")
        sf.write(raw, samples, sr)

        chain = ["silenceremove=start_periods=1:start_threshold=-50dB"]
        pitch = c.get("pitch")
        if pitch:
            chain.append(f"asetrate={int(sr * pitch)},aresample={sr},atempo={1 / pitch:.4f}")
        chain.append(c["fx"])
        chain.append(f"loudnorm=I={c.get('norm', -16)}:TP=-1.5:LRA=11")
        chain.append("areverse,silenceremove=start_periods=1:start_threshold=-55dB,apad=pad_dur=0.12,areverse")

        if c.get("layer_octave"):
            # thicken the Archon with a quiet octave-down double
            fc = (f"[0:a]asplit=2[a][b];"
                  f"[b]asetrate={int(sr * 0.5)},aresample={sr},atempo=2.0,volume=0.22[low];"
                  f"[a][low]amix=inputs=2:normalize=0,{','.join(chain)}[out]")
            ff(["-i", raw, "-filter_complex", fc, "-map", "[out]", "-ac", "1", "-ar", "24000",
                "-c:a", "libmp3lame", "-b:a", "64k", out_path])
        else:
            ff(["-i", raw, "-af", ",".join(chain), "-ac", "1", "-ar", "24000",
                "-c:a", "libmp3lame", "-b:a", c.get("kbps", "64k"), out_path])
        manifest[line_id] = {
            "file": f"assets/audio/voice/{line_id}.mp3",
            "dur": probe_dur(out_path),
            "speaker": SPEAKER_LABEL[speaker],
            "text": text,
        }
        print(f"voice  {line_id:28s} {manifest[line_id]['dur']:5.2f}s  [{c['voice']}]")

    manifest = {k: manifest[k] for k in LINES if k in manifest}
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print(f"voice manifest: {len(manifest)} lines")


def seamless_loop(name, spec):
    src, start, length, xf, br, ch, gain = spec
    src = src() if callable(src) else src
    out_path = os.path.join(OUT, name + ".mp3")
    if not need(out_path):
        return
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    total = probe_dur(src)
    end = min(total, start + length) if length else total
    # a = [start+xf, end], b = [start, start+xf]; crossfading a's tail into b makes end -> start seamless
    fc = (f"[0:a]atrim=start={start + xf}:end={end},asetpts=PTS-STARTPTS[a];"
          f"[1:a]atrim=start={start}:end={start + xf},asetpts=PTS-STARTPTS[b];"
          f"[a][b]acrossfade=d={xf}:c1=tri:c2=tri,volume={gain}dB[out]")
    ff(["-i", src, "-i", src, "-filter_complex", fc, "-map", "[out]", "-ac", str(ch), "-ar", "44100",
        "-c:a", "libmp3lame", "-b:a", br, out_path])
    print(f"loop   {name:28s} {probe_dur(out_path):6.1f}s")


def build_music():
    for name, spec in {**MUSIC, **AMBIENCE}.items():
        seamless_loop(name, spec)


def build_sfx():
    for name, (src, start, length, fade, gain) in SFX.items():
        out_path = os.path.join(OUT, name + ".mp3")
        if not need(out_path):
            continue
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        af = (f"atrim=start={start}:end={start + length},asetpts=PTS-STARTPTS,"
              f"afade=t=out:st={max(0, length - fade)}:d={fade},volume={gain}dB,"
              f"loudnorm=I=-14:TP=-1:LRA=11")
        ff(["-i", src(), "-af", af, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", out_path])
        print(f"sfx    {name}")
    for surface, names in STEPS.items():
        for i, n in enumerate(names):
            out_path = os.path.join(OUT, "step", f"{surface}_{i + 1}.mp3")
            if not need(out_path):
                continue
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            ff(["-i", fs(n), "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "80k", out_path])
            print(f"step   {surface}_{i + 1}")


if __name__ == "__main__":
    if not ONLY or "voice" in ONLY:
        build_voices()
    if not ONLY or "music" in ONLY:
        build_music()
    if not ONLY or "sfx" in ONLY:
        build_sfx()
