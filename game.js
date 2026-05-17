// TRIGGERED - The Joe Ejection
// HTML5 Canvas + plain JS. No external assets.

(() => {
  'use strict';

  // ============================================================
  // CANVAS + SIZING
  // ============================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Internal resolution (9:16 portrait). All gameplay coords use this.
  const W = 540;
  const H = 960;
  canvas.width = W;
  canvas.height = H;

  function fitCanvas() {
    const wrap = document.getElementById('game-wrapper');
    const ww = wrap.clientWidth;
    const wh = wrap.clientHeight;
    const targetRatio = W / H;
    const winRatio = ww / wh;
    let cw, ch;
    if (winRatio > targetRatio) {
      ch = wh;
      cw = wh * targetRatio;
    } else {
      cw = ww;
      ch = ww / targetRatio;
    }
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', fitCanvas);
  fitCanvas();

  // ============================================================
  // Joe photo. Tries several filename variants.
  // Face position (relative to image) used to position the clip so only
  // Joe's head shows through (background + other people get cropped out).
  // ============================================================
  const joeImg = new Image();
  let joeImgReady = false;
  // Calibrated for the saved Joe.jpg portrait (face slightly left of center, upper third).
  const JOE_FACE = { x: 0.42, y: 0.27, rx: 0.20, ry: 0.18 };
  const joePathCandidates = ['assets/Joe.jpg', 'assets/joe.jpg', 'assets/joe.png', 'assets/Joe.png'];
  let joePathIdx = 0;
  joeImg.onload = () => { joeImgReady = joeImg.width > 0 && joeImg.height > 0; };
  joeImg.onerror = () => {
    joePathIdx++;
    if (joePathIdx < joePathCandidates.length) joeImg.src = joePathCandidates[joePathIdx];
  };
  joeImg.src = joePathCandidates[0];

  // ============================================================
  // STATE
  // ============================================================
  let state = 'title'; // 'title' | 'intro' | 'playing' | 'gameover'
  let stateTime = 0;   // seconds in current state
  let lastTime = performance.now();
  let paused = false;

  // Joe position (lane-free, 0..W)
  const joe = {
    x: W / 2,
    targetX: W / 2,
    y: H * 0.72,
    poseIndex: 0,
    faceShake: 0,
    blinkTimer: 0,
    armWag: 0
  };

  // Rocket
  const rocket = {
    speedTier: 1,
    flameAnim: 0,
    wobble: 0
  };

  // World
  const stars = [];
  const obstacles = [];
  const triggerBubbles = [];
  const particles = [];
  const floatingText = []; // score popups, trigger source labels

  let score = 0;
  let elapsedSurvived = 0;
  let triggersAbsorbed = 0;
  let highScore = parseInt(localStorage.getItem('joeRocketHighScore') || '0', 10);

  let obstacleTimer = 0;
  let triggerTimer = 0;
  let screenShake = 0;
  let redFlash = 0;

  // ============================================================
  // INPUT
  // ============================================================
  const keys = {};
  let touchLeftActive = false;
  let touchRightActive = false;
  let tapPulse = false;

  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
    if (state === 'title' || state === 'gameover' || state === 'intro') tapPulse = true;
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  function bindTouch(el, setter) {
    const on = e => {
      e.preventDefault();
      setter(true);
      el.classList.add('active');
      if (state === 'title' || state === 'gameover' || state === 'intro') tapPulse = true;
    };
    const off = e => {
      e.preventDefault();
      setter(false);
      el.classList.remove('active');
    };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  }
  bindTouch(document.getElementById('touch-left'), v => touchLeftActive = v);
  bindTouch(document.getElementById('touch-right'), v => touchRightActive = v);

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused) lastTime = performance.now();
    if (paused) stopMusic(); else if (state === 'playing' && !muted) startMusic();
  });

  // ============================================================
  // AUDIO - Web Audio API. No external files.
  // ============================================================
  let audioCtx = null;
  let masterGain = null;
  let musicGain = null;
  let muted = false;
  let musicSchedulerId = null;
  let musicNextNoteTime = 0;
  let musicStepIndex = 0;
  // Two-note alarm-bass ostinato with sub-bass drone
  const MUSIC_PITCHES = [110, 138.6, 110, 164.8]; // A2, C#3, A2, E3
  const MUSIC_DRONE = 55; // A1

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = muted ? 0 : 0.7;
      masterGain.connect(audioCtx.destination);
      musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(masterGain);
    } catch (e) {
      audioCtx = null;
    }
  }

  function setMuted(v) {
    muted = v;
    if (masterGain) masterGain.gain.value = v ? 0 : 0.7;
  }

  // Music scheduler: at every step, schedule the next note ahead of time
  // Tempo scales with rocket.speedTier so the music gets more frantic
  function musicStepInterval() {
    const baseBPM = 110;
    const tierBPM = baseBPM + rocket.speedTier * 14;
    return 60 / tierBPM / 2; // eighth notes
  }

  function startMusic() {
    if (!audioCtx || musicSchedulerId) return;
    musicNextNoteTime = audioCtx.currentTime + 0.05;
    musicStepIndex = 0;

    // Sustained drone
    const drone = audioCtx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = MUSIC_DRONE;
    const droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.12;
    const droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    drone.connect(droneFilter).connect(droneGain).connect(musicGain);
    drone.start();
    musicSchedulerId = { drone, droneGain };

    scheduleMusicNotes();
  }

  function scheduleMusicNotes() {
    if (!audioCtx || !musicSchedulerId) return;
    while (musicNextNoteTime < audioCtx.currentTime + 0.2) {
      const t = musicNextNoteTime;
      const freq = MUSIC_PITCHES[musicStepIndex % MUSIC_PITCHES.length];
      // Pluck note
      const osc = audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = audioCtx.createGain();
      const dur = 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1800 + rocket.speedTier * 80;
      osc.connect(filt).connect(g).connect(musicGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);

      // Heartbeat hi-hat-ish noise hit every 2 steps at high tier
      if (musicStepIndex % 2 === 1 && rocket.speedTier > 4) {
        const dur2 = 0.04;
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur2, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
        const ns = audioCtx.createBufferSource();
        ns.buffer = buf;
        const ng = audioCtx.createGain();
        ng.gain.value = 0.18;
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'highpass';
        nf.frequency.value = 6000;
        ns.connect(nf).connect(ng).connect(musicGain);
        ns.start(t);
      }

      musicNextNoteTime += musicStepInterval();
      musicStepIndex++;
    }
    if (musicSchedulerId) musicSchedulerId.tid = setTimeout(scheduleMusicNotes, 40);
  }

  function stopMusic() {
    if (!audioCtx || !musicSchedulerId) return;
    try { musicSchedulerId.drone.stop(); } catch (e) {}
    if (musicSchedulerId.tid) clearTimeout(musicSchedulerId.tid);
    musicSchedulerId = null;
  }

  // Pain SFX - oscillator yelp with frequency sweep
  function playPainSFX(severity) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    let startF, endF, dur, gainPeak, type;
    if (severity === 'mild') {
      startF = 320; endF = 180; dur = 0.22; gainPeak = 0.28; type = 'triangle';
    } else if (severity === 'spicy') {
      startF = 480; endF = 220; dur = 0.32; gainPeak = 0.36; type = 'sawtooth';
    } else {
      startF = 720; endF = 260; dur = 0.5; gainPeak = 0.45; type = 'sawtooth';
    }
    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startF * 0.7, t);
    osc.frequency.exponentialRampToValueAtTime(startF, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(endF, t + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Vibrato for spicy/nuclear
    if (severity !== 'mild') {
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = severity === 'nuclear' ? 18 : 11;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = severity === 'nuclear' ? 60 : 30;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    // Add a noise pop for nuclear
    if (severity === 'nuclear') {
      const dur2 = 0.18;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur2, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ns = audioCtx.createBufferSource();
      ns.buffer = buf;
      const ng = audioCtx.createGain();
      ng.gain.value = 0.3;
      const nf = audioCtx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 800;
      ns.connect(nf).connect(ng).connect(masterGain);
      ns.start(t);
    }
  }

  function playDeathSFX() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    // Big explosion noise
    const dur = 1.2;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const ns = audioCtx.createBufferSource();
    ns.buffer = buf;
    const ng = audioCtx.createGain();
    ng.gain.value = 0.5;
    const nf = audioCtx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(2000, t);
    nf.frequency.exponentialRampToValueAtTime(120, t + dur);
    ns.connect(nf).connect(ng).connect(masterGain);
    ns.start(t);

    // Low bass sweep
    const sub = audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(180, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    const sg = audioCtx.createGain();
    sg.gain.setValueAtTime(0.5, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    sub.connect(sg).connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.9);

    // Final wail
    const wail = audioCtx.createOscillator();
    wail.type = 'sawtooth';
    wail.frequency.setValueAtTime(440, t);
    wail.frequency.exponentialRampToValueAtTime(120, t + 0.8);
    const wg = audioCtx.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    wail.connect(wg).connect(masterGain);
    wail.start(t);
    wail.stop(t + 0.9);
  }

  // Mute toggle - M key
  window.addEventListener('keydown', e => {
    if (e.key === 'm' || e.key === 'M') setMuted(!muted);
  });

  // ============================================================
  // TRIGGER LIBRARY
  // Tiers: 'mild' (+1 speed), 'spicy' (+1 speed + shake), 'nuclear' (+2 speed + red flash)
  // ============================================================
  const TRIGGERS = [
    // FRANK - well-meaning friend hyping Joe (and Joe is sensitive about it).
    // Weighted: betting ~33%, conquests ~22%, going-out ~22%, life ~22%
    // "hy" = "hell yeah", "MN" = chat lingo. Spicy tier.
    // -- BETTING (his hammers + asking Joe) - 18 lines
    { src: 'Frank', tier: 'spicy', text: "NC STATE +14.5 LFG" },
    { src: 'Frank', tier: 'spicy', text: "Mets ML easy money 💰" },
    { src: 'Frank', tier: 'spicy', text: "Heat -3.5 locked in" },
    { src: 'Frank', tier: 'spicy', text: "Eagles -7 mortgage bet" },
    { src: 'Frank', tier: 'spicy', text: "5-leg SGP +1200 LFG" },
    { src: 'Frank', tier: 'spicy', text: "ON THE TUA OVER 🔒🔒" },
    { src: 'Frank', tier: 'spicy', text: "took Bills -3 ALL IN" },
    { src: 'Frank', tier: 'spicy', text: "tailing Kelce anytime TD" },
    { src: 'Frank', tier: 'spicy', text: "first basket Embiid +900 🚀" },
    { src: 'Frank', tier: 'spicy', text: "Joker first basket +600 hy" },
    { src: 'Frank', tier: 'spicy', text: "got anything tonight?" },
    { src: 'Frank', tier: 'spicy', text: "I'm on Mets/over you in?" },
    { src: 'Frank', tier: 'spicy', text: "what's your lock today" },
    { src: 'Frank', tier: 'spicy', text: "send me your plays MN" },
    { src: 'Frank', tier: 'spicy', text: "fade or tail my SGP?" },
    { src: 'Frank', tier: 'spicy', text: "Sunday plays MN?" },
    { src: 'Frank', tier: 'spicy', text: "MNF lock?" },
    { src: 'Frank', tier: 'spicy', text: "we boxing the parlay?" },

    // -- CONQUESTS / Tinder / brag updates - 13 lines
    { src: 'Frank', tier: 'spicy', text: "bout to fuck this PR mom hyhyhy" },
    { src: 'Frank', tier: 'spicy', text: "got a 21 yr old's IG MN" },
    { src: 'Frank', tier: 'spicy', text: "smashed last night hy" },
    { src: 'Frank', tier: 'spicy', text: "this Brazilian at gym 👀 MN" },
    { src: 'Frank', tier: 'spicy', text: "Tinder been EATING fr" },
    { src: 'Frank', tier: 'spicy', text: "Hinge on FIRE this week hy" },
    { src: 'Frank', tier: 'spicy', text: "got the bartender's # finally" },
    { src: 'Frank', tier: 'spicy', text: "hostess sent pics last night hy" },
    { src: 'Frank', tier: 'spicy', text: "back-to-back smashes MN" },
    { src: 'Frank', tier: 'spicy', text: "two going tonight LMAO hy" },
    { src: 'Frank', tier: 'spicy', text: "21 yr old at brunch hyhyhy" },
    { src: 'Frank', tier: 'spicy', text: "this nurse is DIRTY MN" },
    { src: 'Frank', tier: 'spicy', text: "PR mom slid back already hy" },

    // -- WATCH-PARTY / Piggy MN / wingman / casual hangs - 13 lines
    { src: 'Frank', tier: 'spicy', text: "yo time to text Piggy MN 🐷" },
    { src: 'Frank', tier: 'spicy', text: "let's get you some pussy bro" },
    { src: 'Frank', tier: 'spicy', text: "you watching the game tonight?" },
    { src: 'Frank', tier: 'spicy', text: "Piggy MN said wassup" },
    { src: 'Frank', tier: 'spicy', text: "come thru for the late game" },
    { src: 'Frank', tier: 'spicy', text: "lock in on Piggy MN" },
    { src: 'Frank', tier: 'spicy', text: "Piggy MN is DOWN btw" },
    { src: 'Frank', tier: 'spicy', text: "you down for wings sunday?" },
    { src: 'Frank', tier: 'spicy', text: "I'll wingman you fr" },
    { src: 'Frank', tier: 'spicy', text: "sports bar for the slate?" },
    { src: 'Frank', tier: 'spicy', text: "watch party at mine MN" },
    { src: 'Frank', tier: 'spicy', text: "we doing dinner Friday?" },
    { src: 'Frank', tier: 'spicy', text: "yo brunch Sunday hy?" },

    // -- WEED GUMMIES / life / banter / calling Joe out - 13 lines
    { src: 'Frank', tier: 'spicy', text: "ate 25mg, locked in MN" },
    { src: 'Frank', tier: 'spicy', text: "edible + the slate hy" },
    { src: 'Frank', tier: 'spicy', text: "gummies hitting tonight 🍬" },
    { src: 'Frank', tier: 'spicy', text: "indica gummy nap was UNREAL" },
    { src: 'Frank', tier: 'spicy', text: "took 2 gummies, vibes only" },
    { src: 'Frank', tier: 'spicy', text: "baked watching Tua MN" },
    { src: 'Frank', tier: 'spicy', text: "ate too many gummies fr 😵" },
    { src: 'Frank', tier: 'spicy', text: "where you been my G" },
    { src: 'Frank', tier: 'spicy', text: "stop ghosting fr" },
    { src: 'Frank', tier: 'spicy', text: "you alive MN?" },
    { src: 'Frank', tier: 'spicy', text: "haven't seen you in weeks" },
    { src: 'Frank', tier: 'spicy', text: "hit the gym hard hy" },
    { src: 'Frank', tier: 'spicy', text: "edible kicked in mid-meeting LMAO" },

    // DANNY - pestering with the same questions over and over
    { src: 'Danny', tier: 'mild', text: "any luck on the job hunt?" },
    { src: 'Danny', tier: 'mild', text: "you apply anywhere today?" },
    { src: 'Danny', tier: 'mild', text: "still unemployed?" },
    { src: 'Danny', tier: 'mild', text: "you update the resume?" },
    { src: 'Danny', tier: 'mild', text: "hows the search going" },
    { src: 'Danny', tier: 'mild', text: "you call that recruiter back?" },
    { src: 'Danny', tier: 'mild', text: "linkedin you yet?" },
    { src: 'Danny', tier: 'mild', text: "you finish the cover letter?" },
    { src: 'Danny', tier: 'mild', text: "any interviews lined up?" },
    { src: 'Danny', tier: 'mild', text: "you networking enough?" },
    { src: 'Danny', tier: 'mild', text: "did you hear back?" },
    { src: 'Danny', tier: 'mild', text: "what about that thing I sent" },
    { src: 'Danny', tier: 'mild', text: "you applied to my friend's co?" },
    { src: 'Danny', tier: 'spicy', text: "Kirk got DEMOLISHED lol" },
    { src: 'Danny', tier: 'spicy', text: "Kirk has zero arguments" },
    { src: 'Danny', tier: 'spicy', text: "did you watch Kirk get owned" },
    { src: 'Danny', tier: 'spicy', text: "Kirk lost that debate so bad" },
    { src: 'Danny', tier: 'spicy', text: "Kirk is embarrassing fr" },

    // IT (ex-wife) - NUCLEAR. Kids, swaps, vacations, laundry, her new job
    { src: 'IT', tier: 'nuclear', text: "Nathan needs new ones" },
    { src: 'IT', tier: 'nuclear', text: "Alex's stomach hurts" },
    { src: 'IT', tier: 'nuclear', text: "Nathan won't eat" },
    { src: 'IT', tier: 'nuclear', text: "Alex is crying" },
    { src: 'IT', tier: 'nuclear', text: "can we swap Saturday?" },
    { src: 'IT', tier: 'nuclear', text: "swap Tuesday?" },
    { src: 'IT', tier: 'nuclear', text: "going to Cabo, you got the kids" },
    { src: 'IT', tier: 'nuclear', text: "vacation in 3 weeks ok?" },
    { src: 'IT', tier: 'nuclear', text: "can i drop laundry off?" },
    { src: 'IT', tier: 'nuclear', text: "washer broke, using yours" },
    { src: 'IT', tier: 'nuclear', text: "got a new job btw $$$" },
    { src: 'IT', tier: 'nuclear', text: "Nathan needs the inhaler" },
    { src: 'IT', tier: 'nuclear', text: "Alex has a fever" },
    { src: 'IT', tier: 'nuclear', text: "I have plans Fri, you have them" },
    { src: 'IT', tier: 'nuclear', text: "going to Aspen, you got it?" },
    { src: 'IT', tier: 'nuclear', text: "drying my stuff at yours" },
    { src: 'IT', tier: 'nuclear', text: "promotion btw :)" },
    { src: 'IT', tier: 'nuclear', text: "btw I started dating" },
    { src: 'IT', tier: 'nuclear', text: "Nathan threw up at school" },
    { src: 'IT', tier: 'nuclear', text: "Alex needs a ride NOW" },
    { src: 'IT', tier: 'nuclear', text: "u home? bringing my laundry" },
    { src: 'IT', tier: 'nuclear', text: "switching weekends, FYI" },
    { src: 'IT', tier: 'nuclear', text: "I bought a house btw" },
    { src: 'IT', tier: 'nuclear', text: "Alex bumped his head" },
    { src: 'IT', tier: 'nuclear', text: "Nathan's tooth fell out" },

    // MOM - always making plans Joe doesn't want
    { src: 'Mom', tier: 'mild', text: "come to dinner Sunday" },
    { src: 'Mom', tier: 'mild', text: "Aunt Susan's christening Sat" },
    { src: 'Mom', tier: 'mild', text: "you HAVE to come" },
    { src: 'Mom', tier: 'mild', text: "cousin's bridal shower!!" },
    { src: 'Mom', tier: 'mild', text: "brunch Sunday, mandatory" },
    { src: 'Mom', tier: 'mild', text: "Father's Day at the house" },
    { src: 'Mom', tier: 'mild', text: "nephew's confirmation, 11am" },
    { src: 'Mom', tier: 'mild', text: "Grandma's 90th, RSVP NOW" },
    { src: 'Mom', tier: 'mild', text: "barbecue Saturday, be there" },
    { src: 'Mom', tier: 'mild', text: "Christmas Eve mass + dinner" },
    { src: 'Mom', tier: 'mild', text: "we're doing Easter at noon" },
    { src: 'Mom', tier: 'mild', text: "block off the whole weekend" },
    { src: 'Mom', tier: 'mild', text: "your sister's hosting, come" },
    { src: 'Mom', tier: 'mild', text: "FYI cocktail party Friday" },
    { src: 'Mom', tier: 'mild', text: "the family is asking about u" },
    { src: 'Mom', tier: 'mild', text: "you're coming Sunday right" },

    // DAD - pesky errands
    { src: 'Dad', tier: 'mild', text: "go take the mail in" },
    { src: 'Dad', tier: 'mild', text: "return this Amazon for me" },
    { src: 'Dad', tier: 'mild', text: "garage code broke, fix it" },
    { src: 'Dad', tier: 'mild', text: "drive me to airport tmrw" },
    { src: 'Dad', tier: 'mild', text: "pick up dry cleaning" },
    { src: 'Dad', tier: 'mild', text: "help w the new TV" },
    { src: 'Dad', tier: 'mild', text: "the wifi is out at the house" },
    { src: 'Dad', tier: 'mild', text: "come help w the gutters" },
    { src: 'Dad', tier: 'mild', text: "stop by Home Depot for me" },
    { src: 'Dad', tier: 'mild', text: "need help moving the couch" },
    { src: 'Dad', tier: 'mild', text: "set up the new printer" },
    { src: 'Dad', tier: 'mild', text: "drop this off at UPS" },
    { src: 'Dad', tier: 'mild', text: "water the plants Sat" },
    { src: 'Dad', tier: 'mild', text: "help me set up venmo" },
    { src: 'Dad', tier: 'mild', text: "the sprinkler is broken" },

    // RANDOM CHAT - penis size discourse
    { src: 'chat', tier: 'spicy', text: "size doesn't matter btw" },
    { src: 'chat', tier: 'spicy', text: "girls prefer big ones jsyk" },
    { src: 'chat', tier: 'spicy', text: "size DEF matters lol" },
    { src: 'chat', tier: 'spicy', text: "it's all about technique" },
    { src: 'chat', tier: 'spicy', text: "everyone's a grower bro" },
    { src: 'chat', tier: 'spicy', text: "no one cares about size" },
    { src: 'chat', tier: 'spicy', text: "women love big ones actually" }
  ];

  // Joe's exclamations - shouts above his head periodically
  const JOE_EMOTES = [
    "JESUS CHRIST",
    "FACK",
    "HOW MUCH CAN ONE MAN ENDURE",
    "TODAY... IS THE WORST DAY OF MY LIFE.",
    "WHY",
    "STOP IT",
    "I CAN'T",
    "NOT AGAIN",
    "WHY ME",
    "MAKE IT STOP",
    "ENOUGH",
    "PLEASE NO",
    "I AM TRYING",
    "GOD WHY",
    "EVERY DAY",
    "I JUST WANT PEACE",
    "FACK OFF",
    "LEAVE ME ALONE"
  ];

  function randomTrigger() {
    return TRIGGERS[Math.floor(Math.random() * TRIGGERS.length)];
  }

  // ============================================================
  // SPEED + DIFFICULTY
  // ============================================================
  const MAX_TIER = 12;
  function baseSpeed() {
    // px per second of vertical scroll
    return 220 + (rocket.speedTier - 1) * 55;
  }
  function obstacleInterval() {
    // seconds between obstacles
    return Math.max(0.35, 1.1 - rocket.speedTier * 0.06);
  }
  function triggerInterval() {
    return Math.max(1.4, 3.2 - rocket.speedTier * 0.15);
  }
  function lateralSpeed() {
    // px/sec horizontal - scales with rocket speed so dodging stays possible at high tiers
    return 360 + rocket.speedTier * 55;
  }

  function poseForTier(t) {
    if (t <= 2) return 0; // worried
    if (t <= 4) return 1; // terror
    if (t <= 6) return 2; // crying
    if (t <= 8) return 3; // scream
    if (t <= 10) return 4; // rage
    return 5; // meltdown
  }

  // ============================================================
  // STARFIELD
  // ============================================================
  function initStars() {
    stars.length = 0;
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.3 + Math.random() * 0.7,
        size: 0.5 + Math.random() * 2.2
      });
    }
  }
  initStars();

  // ============================================================
  // OBSTACLE SPAWNING
  // ============================================================
  const OBSTACLE_TYPES = ['asteroid', 'satellite', 'ufo', 'sign', 'asteroid'];

  function spawnObstacle() {
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const size = type === 'asteroid' ? 40 + Math.random() * 50
              : type === 'satellite' ? 70 + Math.random() * 20
              : type === 'ufo' ? 90
              : 80;
    const ob = {
      type,
      x: 40 + Math.random() * (W - 80),
      y: -size - 20,
      r: size / 2,
      size,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 1.6,
      signText: pickWarning(),
      bob: Math.random() * Math.PI * 2
    };
    // Avoid clustering: nudge x if too close to last
    if (obstacles.length > 0) {
      const last = obstacles[obstacles.length - 1];
      if (Math.abs(last.x - ob.x) < 100 && last.y < 60) {
        ob.x = (last.x + 250) % (W - 80) + 40;
      }
    }
    obstacles.push(ob);
  }

  const WARNINGS = ['PAIN', 'DOOM', 'WHY', 'NO', 'ANGER', 'CRINGE', 'COPE', 'L', 'NPC', 'BETA', 'OOF'];
  function pickWarning() {
    return WARNINGS[Math.floor(Math.random() * WARNINGS.length)];
  }

  // Notification toasts: small banners at top of screen.
  // They appear, immediately bump speed, slide in then slide out.
  // They are NOT obstacles - they don't occupy game lane space.
  function spawnTriggerBubble() {
    const t = randomTrigger();
    const padding = 18;
    ctx.font = 'bold 20px -apple-system, sans-serif';
    const textW = ctx.measureText(t.text).width;
    const labelW = ctx.measureText(t.src).width + 18;
    const bubW = Math.min(W - 40, Math.max(220, textW + labelW + padding * 2));
    const bub = {
      ...t,
      // Toast lives at the top of the screen
      bubW,
      h: 56,
      slot: pickToastSlot(),
      slideIn: 0,    // 0..1 in
      life: 2.4,     // total seconds visible (in + hold + out)
      age: 0
    };
    triggerBubbles.push(bub);
    // Trigger the speed bump + side effects right away (not on Joe collision)
    consumeTrigger(bub);
  }

  // Each toast occupies a vertical slot at the top of the screen so multiple stack cleanly
  function pickToastSlot() {
    const used = triggerBubbles.map(b => b.slot);
    for (let i = 0; i < 4; i++) if (!used.includes(i)) return i;
    return Math.floor(Math.random() * 4);
  }

  // ============================================================
  // COLLISION + DAMAGE
  // ============================================================
  // Two hitboxes: Joe (head/torso) + rocket body. Either hit = collision.
  function joeHitboxes() {
    return [
      { x: joe.x - 50, y: joe.y - 30, r: 42 }, // Joe head/torso
      { x: joe.x + 50, y: joe.y,       r: 38 }  // rocket body
    ];
  }

  function checkCollisions() {
    const boxes = joeHitboxes();
    for (const ob of obstacles) {
      for (const hb of boxes) {
        const dx = ob.x - hb.x;
        const dy = ob.y - hb.y;
        const minD = ob.r * 0.80 + hb.r * 0.70; // generous to player
        if (dx * dx + dy * dy < minD * minD) {
          triggerGameOver();
          return;
        }
      }
    }
  }

  function consumeTrigger(bub) {
    triggersAbsorbed++;
    let bump = 0;
    if (bub.tier === 'mild') { bump = 1; score += 5; playPainSFX('mild'); }
    else if (bub.tier === 'spicy') { bump = 1; score += 8; screenShake = Math.max(screenShake, 14); playPainSFX('spicy'); }
    else { bump = 2; score += 15; screenShake = Math.max(screenShake, 22); redFlash = 1; playPainSFX('nuclear'); }
    rocket.speedTier = Math.min(MAX_TIER, rocket.speedTier + bump);
    joe.poseIndex = poseForTier(rocket.speedTier);
    joe.faceShake = 1;
    floatingText.push({
      text: `+${bump} SPEED`,
      x: joe.x,
      y: joe.y - 80,
      vy: -60,
      life: 1,
      color: bub.tier === 'nuclear' ? '#ff3333' : (bub.tier === 'spicy' ? '#ff9933' : '#ffdd33')
    });
    // 60% chance Joe shouts an emote on trigger (90% on nuclear)
    const emoteChance = bub.tier === 'nuclear' ? 0.9 : 0.55;
    if (Math.random() < emoteChance) spawnEmote();
  }

  function spawnEmote() {
    // Don't stack too many at once
    if (emoteBubbles.length >= 2) return;
    const text = JOE_EMOTES[Math.floor(Math.random() * JOE_EMOTES.length)];
    emoteBubbles.push({
      text,
      x: joe.x,
      y: joe.y - 90,
      life: 1.6,
      age: 0
    });
  }
  const emoteBubbles = [];

  function triggerGameOver() {
    if (state !== 'playing') return;
    // Big explosion
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 280;
      particles.push({
        x: joe.x,
        y: joe.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.9,
        maxLife: 1,
        color: ['#ff4400', '#ffaa00', '#ffff00', '#ffffff', '#ff0000'][Math.floor(Math.random() * 5)],
        size: 4 + Math.random() * 8
      });
    }
    screenShake = 50;
    redFlash = 1;
    stopMusic();
    playDeathSFX();
    state = 'gameover';
    stateTime = 0;
    finalScore = Math.floor(score + elapsedSurvived * 10);
    if (finalScore > highScore) {
      highScore = finalScore;
      newHigh = true;
      localStorage.setItem('joeRocketHighScore', String(highScore));
    } else {
      newHigh = false;
    }
  }

  let finalScore = 0;
  let newHigh = false;

  // ============================================================
  // RESET
  // ============================================================
  function startIntro() {
    state = 'intro';
    stateTime = 0;
    joe.x = W / 2;
    joe.targetX = W / 2;
    joe.y = H * 0.55;
    joe.poseIndex = 0;
    joe.faceShake = 0;
    rocket.speedTier = 1;
    rocket.flameAnim = 0;
    obstacles.length = 0;
    triggerBubbles.length = 0;
    emoteBubbles.length = 0;
    particles.length = 0;
    floatingText.length = 0;
    score = 0;
    elapsedSurvived = 0;
    triggersAbsorbed = 0;
    obstacleTimer = 0;
    triggerTimer = 0;
    screenShake = 0;
    redFlash = 0;
    // pre-load the inciting message
    introMessage = randomTrigger();
    while (introMessage.tier !== 'nuclear') introMessage = randomTrigger();
  }
  let introMessage = randomTrigger();

  function startPlaying() {
    state = 'playing';
    stateTime = 0;
    joe.y = H * 0.72;
    obstacleTimer = obstacleInterval() * 0.5;
    triggerTimer = triggerInterval() * 0.6;
    if (!muted) startMusic();
  }

  // ============================================================
  // UPDATE
  // ============================================================
  function update(dt) {
    if (paused) return;
    stateTime += dt;

    // Star scroll (always - title menu has gentle drift)
    const starSpd = state === 'playing' ? baseSpeed() * 0.6 : 30;
    for (const s of stars) {
      s.y += s.z * starSpd * dt;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }

    // Screen shake decay
    if (screenShake > 0) screenShake = Math.max(0, screenShake - 80 * dt);
    if (redFlash > 0) redFlash = Math.max(0, redFlash - 1.8 * dt);

    // Rocket flame animation
    rocket.flameAnim += dt * 22;
    rocket.wobble += dt * (4 + rocket.speedTier * 0.4);

    // Joe blink + face shake decay
    joe.blinkTimer += dt;
    if (joe.faceShake > 0) joe.faceShake = Math.max(0, joe.faceShake - 3 * dt);
    joe.armWag += dt * 6;

    if (state === 'title') {
      if (tapPulse) {
        tapPulse = false;
        initAudio();
        startIntro();
      }
    } else if (state === 'intro') {
      // Allow skip after 0.6s
      if (stateTime > 0.6 && tapPulse) {
        tapPulse = false;
        startPlaying();
        return;
      }
      // Intro phases (3.2s total)
      // 0.0-1.2: phone bubble pops on screen, Joe stares
      // 1.2-1.8: face contorts, red flash, scream
      // 1.8-2.6: rocket whooshes in from below, Joe grabs on
      // 2.6-3.2: launch up, transition to playing
      if (stateTime < 1.2) {
        joe.poseIndex = 0; // worried
      } else if (stateTime < 1.8) {
        joe.poseIndex = 3; // scream
        redFlash = Math.min(1, redFlash + dt * 2);
        screenShake = 18;
      } else if (stateTime < 2.6) {
        joe.poseIndex = 1; // terror
        joe.y = H * 0.55 + (stateTime - 1.8) * 80;
      } else if (stateTime < 3.2) {
        joe.poseIndex = 1;
        joe.y = H * 0.72;
      } else {
        startPlaying();
      }
    } else if (state === 'playing') {
      // Lateral input
      let dir = 0;
      if (keys['a'] || keys['arrowleft'] || touchLeftActive) dir -= 1;
      if (keys['d'] || keys['arrowright'] || touchRightActive) dir += 1;
      joe.x += dir * lateralSpeed() * dt;
      const pad = 90;
      if (joe.x < pad) joe.x = pad;
      if (joe.x > W - pad) joe.x = W - pad;

      elapsedSurvived += dt;
      // score holds trigger bonuses only; time bonus added in HUD/final via elapsedSurvived * 10

      // Spawn obstacles
      obstacleTimer -= dt;
      if (obstacleTimer <= 0) {
        spawnObstacle();
        obstacleTimer = obstacleInterval() * (0.7 + Math.random() * 0.6);
      }

      // Spawn triggers
      triggerTimer -= dt;
      if (triggerTimer <= 0) {
        spawnTriggerBubble();
        triggerTimer = triggerInterval() * (0.8 + Math.random() * 0.5);
      }

      // Move obstacles
      const sp = baseSpeed();
      for (const ob of obstacles) {
        ob.y += sp * dt;
        ob.rot += ob.rotSpeed * dt;
        ob.bob += dt * 3;
      }
      // Remove off-screen
      for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].y > H + 100) obstacles.splice(i, 1);
      }

      // Age toasts: slide in 0..0.25s, hold, slide out last 0.4s
      for (const bub of triggerBubbles) {
        bub.age += dt;
        bub.slideIn = Math.min(1, bub.age / 0.25);
      }
      for (let i = triggerBubbles.length - 1; i >= 0; i--) {
        if (triggerBubbles[i].age > triggerBubbles[i].life) triggerBubbles.splice(i, 1);
      }

      // Age emote bubbles
      for (const e of emoteBubbles) {
        e.age += dt;
        e.x = joe.x; // emote follows Joe horizontally
        e.y = joe.y - 90 - e.age * 30;
      }
      for (let i = emoteBubbles.length - 1; i >= 0; i--) {
        if (emoteBubbles[i].age > emoteBubbles[i].life) emoteBubbles.splice(i, 1);
      }

      checkCollisions();
    } else if (state === 'gameover') {
      if (stateTime > 1.0 && tapPulse) {
        tapPulse = false;
        state = 'title';
        stateTime = 0;
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity-ish drift downward
      p.vx *= 0.98;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Floating text
    for (let i = floatingText.length - 1; i >= 0; i--) {
      const f = floatingText[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) floatingText.splice(i, 1);
    }
  }

  // ============================================================
  // DRAWING - JOE
  // The M: bald scalp visible, two black hair peaks on sides,
  // dramatic widow's peak diving down to between eyebrows.
  // ============================================================
  const SKIN = '#d4a574';
  const SKIN_SHADOW = '#a87a4d';
  const HAIR = '#1a1410';
  const SWEATER = '#f5f0e8';
  const SWEATER_SHADOW = '#d9d2c4';
  const GOLD = '#d4af37';
  const GOLD_SHADOW = '#9c7e22';

  function drawJoe(cx, cy, scale, pose, shake) {
    if (joeImgReady) return drawJoePhoto(cx, cy, scale, pose, shake);
    ctx.save();
    ctx.translate(cx + (Math.random() - 0.5) * shake * 3, cy + (Math.random() - 0.5) * shake * 3);
    ctx.scale(scale, scale);

    // Body (white sweater) - drawn first, behind head
    ctx.fillStyle = SWEATER;
    ctx.beginPath();
    ctx.moveTo(-46, 18);
    ctx.lineTo(-58, 70);
    ctx.lineTo(58, 70);
    ctx.lineTo(46, 18);
    ctx.closePath();
    ctx.fill();
    // Sweater shadow
    ctx.fillStyle = SWEATER_SHADOW;
    ctx.beginPath();
    ctx.moveTo(-46, 18);
    ctx.lineTo(-58, 70);
    ctx.lineTo(-28, 70);
    ctx.lineTo(-22, 18);
    ctx.closePath();
    ctx.fill();
    // Sweater neckline
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 18, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SKIN_SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, 14, 20, 6, 0, 0, Math.PI);
    ctx.fill();

    // Gold chain (V on chest)
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 18);
    ctx.quadraticCurveTo(0, 42, 22, 18);
    ctx.stroke();
    // chain links
    for (let i = -3; i <= 3; i++) {
      const t = (i + 3) / 6;
      const lx = -22 + 44 * t;
      const ly = 18 + Math.sin(t * Math.PI) * 22;
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD_SHADOW;
      ctx.beginPath();
      ctx.arc(lx + 0.7, ly + 0.7, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Neck
    ctx.fillStyle = SKIN;
    ctx.fillRect(-14, -2, 28, 22);
    ctx.fillStyle = SKIN_SHADOW;
    ctx.fillRect(-14, 14, 28, 6);

    // Head (oval, slightly tall/egg shape)
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.ellipse(0, -34, 42, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head shadow (right side)
    ctx.fillStyle = SKIN_SHADOW;
    ctx.beginPath();
    ctx.ellipse(8, -34, 36, 50, 0, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();
    // Forehead shine (showing the BALD)
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-8, -64, 18, 8, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // Light freckles / scalp texture spots (sells the bald look)
    ctx.fillStyle = 'rgba(120,80,55,0.25)';
    [[-12, -72], [10, -68], [-18, -56], [22, -60], [0, -80], [-26, -64]].forEach(p => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ears
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.ellipse(-42, -30, 8, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(42, -30, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SKIN_SHADOW;
    ctx.beginPath();
    ctx.ellipse(-44, -28, 4, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(43, -28, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ===== MOSTLY BALD =====
    // Joe USED to have an M widow's peak (hence "The M") but it has receded to
    // near-total baldness. Just thin hair remnants on the sides above the ears
    // and a faint stubble crown around the back. No widow's peak left.

    // Side hair above ears (the last holdouts)
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.ellipse(-38, -34, 7, 12, -0.15, 0, Math.PI * 2);
    ctx.ellipse(38, -34, 7, 12, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Faint stubble crown around the back of the head (very thin band)
    ctx.fillStyle = 'rgba(26,20,16,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, -78, 38, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(26,20,16,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, -72, 36, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ghost of the old M (where his widow's peak used to be) - very faint stubble shadow
    ctx.fillStyle = 'rgba(26,20,16,0.12)';
    ctx.beginPath();
    ctx.moveTo(-14, -78);
    ctx.lineTo(-3, -58);
    ctx.lineTo(0, -54);
    ctx.lineTo(3, -58);
    ctx.lineTo(14, -78);
    ctx.closePath();
    ctx.fill();

    // Eyebrows + eyes per pose
    drawFace(pose);

    // Beard
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(-30, -10);
    ctx.quadraticCurveTo(-36, 0, -32, 8);
    ctx.quadraticCurveTo(-24, 18, 0, 20);
    ctx.quadraticCurveTo(24, 18, 32, 8);
    ctx.quadraticCurveTo(36, 0, 30, -10);
    ctx.quadraticCurveTo(20, -4, 14, -8);
    ctx.lineTo(-14, -8);
    ctx.quadraticCurveTo(-20, -4, -30, -10);
    ctx.closePath();
    ctx.fill();
    // beard texture flecks
    ctx.fillStyle = '#2a1f18';
    for (let i = 0; i < 8; i++) {
      const bx = -26 + i * 7;
      ctx.beginPath();
      ctx.arc(bx, 6 + (i % 2) * 4, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // mustache
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(-18, -14);
    ctx.quadraticCurveTo(-10, -10, 0, -12);
    ctx.quadraticCurveTo(10, -10, 18, -14);
    ctx.quadraticCurveTo(14, -8, 0, -8);
    ctx.quadraticCurveTo(-14, -8, -18, -14);
    ctx.closePath();
    ctx.fill();

    // Glasses (drawn AFTER face so they sit on top)
    drawGlasses();

    // Arms (gripping rocket) - drawn last as overlay
    drawArms(pose);

    ctx.restore();
  }

  // ============================================================
  // PHOTO JOE - used when assets/Joe.jpg is available
  // Clips the photo to a head-shaped ellipse so background + other people
  // get cropped out, then draws cartoon body (sweater + chain + arms) below.
  // Distress effects (sweat, tears, screams, red flash) overlay on top.
  // ============================================================
  function drawJoePhoto(cx, cy, scale, pose, shake) {
    const sx = (Math.random() - 0.5) * shake * 3;
    const sy = (Math.random() - 0.5) * shake * 3;
    const ox = cx + sx;
    const oy = cy + sy;

    // 1) Cartoon arms BEHIND photo - so hands grip the rocket in front
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    drawArms(pose);
    ctx.restore();

    // 2) Photo clipped to a tall oval covering head + chest (so dark venue
    //    background + other people from the photo get clipped out)
    ctx.save();
    const clipCx = ox;
    const clipCy = oy - 10 * scale;
    const clipRX = 58 * scale;
    const clipRY = 85 * scale;
    ctx.beginPath();
    ctx.ellipse(clipCx, clipCy, clipRX, clipRY, 0, 0, Math.PI * 2);
    ctx.clip();

    const aspect = joeImg.width / joeImg.height;
    const displayH = 240 * scale;
    const displayW = displayH * aspect;
    // Face center lands at head position (oy - 40 * scale)
    const targetFaceX = ox;
    const targetFaceY = oy - 40 * scale;
    const px = targetFaceX - JOE_FACE.x * displayW;
    const py = targetFaceY - JOE_FACE.y * displayH;
    ctx.drawImage(joeImg, px, py, displayW, displayH);

    // Red tint for rage/meltdown
    if (pose >= 4) {
      ctx.fillStyle = `rgba(255, 30, 30, ${pose === 5 ? 0.45 : 0.28})`;
      ctx.fillRect(clipCx - clipRX - 10, clipCy - clipRY - 10, (clipRX + 10) * 2, (clipRY + 10) * 2);
    }
    ctx.restore();

    // 3) Distress overlays on top
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    drawDistressOverlay(pose);
    ctx.restore();
  }

  // Cartoon body parts only (no head) - sweater + chain + arms
  function drawCartoonBody(pose) {
    // Neck (peeks below clipped head)
    ctx.fillStyle = '#c89878';
    ctx.fillRect(-13, -4, 26, 24);
    ctx.fillStyle = '#a8785a';
    ctx.fillRect(-13, 14, 26, 6);

    // Sweater body
    ctx.fillStyle = SWEATER;
    ctx.beginPath();
    ctx.moveTo(-48, 18);
    ctx.lineTo(-62, 76);
    ctx.lineTo(62, 76);
    ctx.lineTo(48, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = SWEATER_SHADOW;
    ctx.beginPath();
    ctx.moveTo(-48, 18);
    ctx.lineTo(-62, 76);
    ctx.lineTo(-30, 76);
    ctx.lineTo(-22, 18);
    ctx.closePath();
    ctx.fill();
    // Sweater neckline (dark interior of sweater)
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 18, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8785a';
    ctx.beginPath();
    ctx.ellipse(0, 14, 20, 6, 0, 0, Math.PI);
    ctx.fill();

    // Gold chain (V shape on chest)
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 18);
    ctx.quadraticCurveTo(0, 48, 22, 18);
    ctx.stroke();
    for (let i = -4; i <= 4; i++) {
      const t = (i + 4) / 8;
      const lx = -22 + 44 * t;
      const ly = 18 + Math.sin(t * Math.PI) * 26;
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD_SHADOW;
      ctx.beginPath();
      ctx.arc(lx + 0.8, ly + 0.8, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arms gripping rocket
    drawArms(pose);
  }

  // Ambient distress effects around Joe's head (works for both photo + procedural)
  function drawDistressOverlay(pose) {
    const t = performance.now() / 1000;
    // pose 1+: sweat drops at temples
    if (pose >= 1) {
      ctx.fillStyle = '#9ec9ff';
      const bob = Math.sin(t * 8) * 2;
      ctx.beginPath();
      ctx.ellipse(-48, -56 + bob, 5, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(-49, -58 + bob, 1.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pose >= 2) {
      ctx.fillStyle = '#9ec9ff';
      const bob = Math.cos(t * 8) * 2;
      ctx.beginPath();
      ctx.ellipse(48, -50 + bob, 5, 8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(47, -52 + bob, 1.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // pose 2 (crying): tears flying outward from eye area
    if (pose >= 2) {
      ctx.fillStyle = '#5fb3ff';
      for (let i = 0; i < 4; i++) {
        const phase = (t * 1.2 + i * 0.3) % 1;
        const dropX = -20 - phase * 35;
        const dropY = -30 + phase * 55;
        ctx.beginPath();
        ctx.ellipse(dropX, dropY, 3, 6, -0.5, 0, Math.PI * 2);
        ctx.fill();
        const dropX2 = 20 + phase * 35;
        ctx.beginPath();
        ctx.ellipse(dropX2, dropY, 3, 6, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // pose 3+ (scream): radial lines around head
    if (pose >= 3) {
      ctx.strokeStyle = pose >= 5 ? '#ff4444' : '#ffffff';
      ctx.lineWidth = 3;
      const phase = (t * 2) % 1;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + phase * 0.3;
        const r1 = 65 + (i % 2) * 8;
        const r2 = 88 + (i % 2) * 14;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, -34 + Math.sin(a) * r1 * 0.85);
        ctx.lineTo(Math.cos(a) * r2, -34 + Math.sin(a) * r2 * 0.85);
        ctx.stroke();
      }
    }
    // pose 5 (meltdown): steam puffs above head
    if (pose >= 5) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 4; i++) {
        const tt = (t * 0.8 + i * 0.25) % 1;
        const px = (i - 1.5) * 12 + Math.sin(tt * Math.PI * 2) * 4;
        const py = -90 - tt * 30;
        ctx.beginPath();
        ctx.ellipse(px, py, 8 - tt * 3, 10 - tt * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFace(pose) {
    // pose 0=worried, 1=terror, 2=crying, 3=scream, 4=rage, 5=meltdown
    const lEyeX = -16, rEyeX = 16, eyeY = -36;

    // Eyebrows
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (pose === 0) { // worried - tilted up inner
      ctx.moveTo(-24, -52); ctx.lineTo(-8, -48);
      ctx.moveTo(24, -52); ctx.lineTo(8, -48);
    } else if (pose === 1) { // terror - raised high
      ctx.moveTo(-26, -56); ctx.lineTo(-6, -54);
      ctx.moveTo(26, -56); ctx.lineTo(6, -54);
    } else if (pose === 2) { // crying - super sad slant
      ctx.moveTo(-24, -54); ctx.lineTo(-6, -46);
      ctx.moveTo(24, -54); ctx.lineTo(6, -46);
    } else if (pose === 3) { // scream - high arch
      ctx.moveTo(-26, -58); ctx.quadraticCurveTo(-16, -62, -6, -56);
      ctx.moveTo(26, -58); ctx.quadraticCurveTo(16, -62, 6, -56);
    } else if (pose === 4) { // rage - V down inner (angry)
      ctx.moveTo(-26, -54); ctx.lineTo(-6, -48);
      ctx.moveTo(26, -54); ctx.lineTo(6, -48);
      // wait that's same as worried, let me do angry properly
    } else { // meltdown
      ctx.moveTo(-28, -54); ctx.lineTo(-4, -46);
      ctx.moveTo(28, -54); ctx.lineTo(4, -46);
    }
    ctx.stroke();

    // RAGE eyebrows override (downward inner)
    if (pose === 4) {
      ctx.strokeStyle = HAIR;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-28, -54); ctx.lineTo(-6, -46);
      ctx.moveTo(28, -54); ctx.lineTo(6, -46);
      ctx.stroke();
    }

    // Eye whites + pupils by pose
    ctx.fillStyle = '#fff';
    if (pose === 0) { // worried small
      circle(lEyeX, eyeY, 7); circle(rEyeX, eyeY, 7);
      ctx.fillStyle = '#000';
      circle(lEyeX - 1, eyeY + 1, 3); circle(rEyeX - 1, eyeY + 1, 3);
    } else if (pose === 1) { // terror HUGE whites tiny pupils
      circle(lEyeX, eyeY, 11); circle(rEyeX, eyeY, 11);
      ctx.fillStyle = '#000';
      circle(lEyeX + 2, eyeY - 1, 2.5); circle(rEyeX - 2, eyeY - 1, 2.5);
    } else if (pose === 2) { // crying - half closed with tears
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(lEyeX, eyeY, 7, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(rEyeX, eyeY, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      circle(lEyeX, eyeY, 2); circle(rEyeX, eyeY, 2);
      // tears
      ctx.fillStyle = '#7fc4ff';
      ctx.beginPath();
      ctx.ellipse(lEyeX - 3, eyeY + 12, 3, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(rEyeX + 3, eyeY + 12, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pose === 3) { // scream - squeezed shut with X
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lEyeX - 8, eyeY); ctx.lineTo(lEyeX + 8, eyeY);
      ctx.moveTo(lEyeX, eyeY - 4); ctx.lineTo(lEyeX, eyeY + 4);
      ctx.moveTo(rEyeX - 8, eyeY); ctx.lineTo(rEyeX + 8, eyeY);
      ctx.moveTo(rEyeX, eyeY - 4); ctx.lineTo(rEyeX, eyeY + 4);
      ctx.stroke();
    } else if (pose === 4) { // rage - red slits
      ctx.fillStyle = '#ffcccc';
      ctx.beginPath();
      ctx.ellipse(lEyeX, eyeY, 9, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(rEyeX, eyeY, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cc0000';
      circle(lEyeX, eyeY, 2.5); circle(rEyeX, eyeY, 2.5);
    } else { // meltdown - bloodshot wide
      ctx.fillStyle = '#fff';
      circle(lEyeX, eyeY, 10); circle(rEyeX, eyeY, 10);
      // red veins
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lEyeX - 8, eyeY - 2); ctx.lineTo(lEyeX, eyeY);
      ctx.moveTo(lEyeX + 7, eyeY + 3); ctx.lineTo(lEyeX, eyeY);
      ctx.moveTo(rEyeX - 7, eyeY - 3); ctx.lineTo(rEyeX, eyeY);
      ctx.moveTo(rEyeX + 8, eyeY + 2); ctx.lineTo(rEyeX, eyeY);
      ctx.stroke();
      ctx.fillStyle = '#000';
      circle(lEyeX + 2, eyeY, 2); circle(rEyeX - 2, eyeY, 2);
    }

    // Sweat drops (poses 1+)
    if (pose >= 1) {
      ctx.fillStyle = '#9ec9ff';
      ctx.beginPath();
      ctx.ellipse(-34, -42, 3, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      if (pose >= 3) {
        ctx.beginPath();
        ctx.ellipse(34, -38, 3, 6, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mouth
    if (pose === 0) {
      // small frown
      ctx.strokeStyle = HAIR;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-8, 4);
      ctx.quadraticCurveTo(0, 0, 8, 4);
      ctx.stroke();
    } else if (pose === 1) {
      // open o
      ctx.fillStyle = '#3a1a1a';
      ctx.beginPath();
      ctx.ellipse(0, 4, 6, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pose === 2) {
      // crying wail
      ctx.fillStyle = '#3a1a1a';
      ctx.beginPath();
      ctx.moveTo(-10, 2);
      ctx.quadraticCurveTo(0, 18, 10, 2);
      ctx.quadraticCurveTo(0, 8, -10, 2);
      ctx.closePath();
      ctx.fill();
    } else if (pose === 3) {
      // huge scream
      ctx.fillStyle = '#2a0a0a';
      ctx.beginPath();
      ctx.ellipse(0, 6, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cc4444';
      ctx.beginPath();
      ctx.ellipse(0, 14, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pose === 4) {
      // gritted teeth
      ctx.fillStyle = '#3a1a1a';
      ctx.fillRect(-12, 0, 24, 8);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(-11 + i * 5, 1, 4, 6);
      }
    } else {
      // meltdown - jagged mouth
      ctx.fillStyle = '#2a0a0a';
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-6, 4);
      ctx.lineTo(-2, 12);
      ctx.lineTo(2, 4);
      ctx.lineTo(6, 12);
      ctx.lineTo(10, 4);
      ctx.lineTo(14, 10);
      ctx.lineTo(14, 14);
      ctx.lineTo(-14, 14);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGlasses() {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    // Rectangular frames
    ctx.beginPath();
    ctx.roundRect(-28, -44, 22, 16, 3);
    ctx.roundRect(6, -44, 22, 16, 3);
    ctx.stroke();
    // bridge
    ctx.beginPath();
    ctx.moveTo(-6, -38);
    ctx.lineTo(6, -38);
    ctx.stroke();
    // arms (out to ears)
    ctx.beginPath();
    ctx.moveTo(-28, -38);
    ctx.lineTo(-40, -34);
    ctx.moveTo(28, -38);
    ctx.lineTo(40, -34);
    ctx.stroke();
    // glint
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-25, -41); ctx.lineTo(-20, -41);
    ctx.moveTo(9, -41); ctx.lineTo(14, -41);
    ctx.stroke();
  }

  function drawArms(pose) {
    // Arms reaching forward/down to grip rocket. Joe clings to rocket on his right side.
    const wag = Math.sin(joe.armWag) * (pose >= 3 ? 3 : 1);
    ctx.fillStyle = SWEATER;
    ctx.strokeStyle = SWEATER_SHADOW;
    ctx.lineWidth = 2;
    // Right arm (gripping forward)
    ctx.beginPath();
    ctx.moveTo(30, 22);
    ctx.quadraticCurveTo(60 + wag, 30, 70 + wag, 50);
    ctx.lineTo(56 + wag, 56);
    ctx.quadraticCurveTo(48, 36, 22, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Left arm (gripping forward too)
    ctx.beginPath();
    ctx.moveTo(-30, 22);
    ctx.quadraticCurveTo(-60 - wag, 30, -70 - wag, 50);
    ctx.lineTo(-56 - wag, 56);
    ctx.quadraticCurveTo(-48, 36, -22, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Hands (skin)
    ctx.fillStyle = SKIN;
    circle(70 + wag, 50, 8);
    circle(-70 - wag, 50, 8);
    ctx.fillStyle = SKIN_SHADOW;
    circle(72 + wag, 53, 4);
    circle(-68 - wag, 53, 4);
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ============================================================
  // DRAWING - ROCKET
  // ============================================================
  function drawRocket(cx, cy, scale) {
    ctx.save();
    ctx.translate(cx, cy);
    const wob = Math.sin(rocket.wobble) * 1.5;
    ctx.rotate(wob * 0.01);
    ctx.scale(scale, scale);

    // Flame trail (below)
    const fa = rocket.flameAnim;
    const tier = rocket.speedTier;
    const flameLen = 90 + tier * 12;

    // Outer flame
    ctx.fillStyle = '#ff5500';
    ctx.beginPath();
    ctx.moveTo(-22, 80);
    ctx.quadraticCurveTo(-30 + Math.sin(fa) * 3, 80 + flameLen * 0.5, 0, 80 + flameLen);
    ctx.quadraticCurveTo(30 - Math.sin(fa) * 3, 80 + flameLen * 0.5, 22, 80);
    ctx.closePath();
    ctx.fill();
    // Mid flame
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(-15, 82);
    ctx.quadraticCurveTo(-20 + Math.cos(fa) * 2, 82 + flameLen * 0.4, 0, 82 + flameLen * 0.85);
    ctx.quadraticCurveTo(20 - Math.cos(fa) * 2, 82 + flameLen * 0.4, 15, 82);
    ctx.closePath();
    ctx.fill();
    // Inner flame
    ctx.fillStyle = '#ffff66';
    ctx.beginPath();
    ctx.moveTo(-8, 84);
    ctx.quadraticCurveTo(-10, 84 + flameLen * 0.35, 0, 84 + flameLen * 0.7);
    ctx.quadraticCurveTo(10, 84 + flameLen * 0.35, 8, 84);
    ctx.closePath();
    ctx.fill();
    // Sparks
    for (let i = 0; i < 4; i++) {
      const sx = (Math.random() - 0.5) * 30;
      const sy = 90 + Math.random() * flameLen;
      ctx.fillStyle = Math.random() > 0.5 ? '#ffff00' : '#ff8800';
      circle(sx, sy, 1.5 + Math.random() * 1.5);
    }

    // Body
    ctx.fillStyle = '#d44';
    ctx.beginPath();
    ctx.roundRect(-26, -90, 52, 170, 6);
    ctx.fill();
    // Nose cone
    ctx.fillStyle = '#aa3333';
    ctx.beginPath();
    ctx.moveTo(-26, -90);
    ctx.lineTo(0, -130);
    ctx.lineTo(26, -90);
    ctx.closePath();
    ctx.fill();
    // White stripe
    ctx.fillStyle = '#fff';
    ctx.fillRect(-26, -40, 52, 18);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M', 0, -26);
    // Window/porthole
    ctx.fillStyle = '#88ddff';
    circle(0, -64, 10);
    ctx.fillStyle = '#225577';
    circle(2, -62, 4);
    ctx.strokeStyle = '#aa3333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -64, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Fins
    ctx.fillStyle = '#aa3333';
    ctx.beginPath();
    ctx.moveTo(-26, 60);
    ctx.lineTo(-50, 90);
    ctx.lineTo(-26, 90);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 60);
    ctx.lineTo(50, 90);
    ctx.lineTo(26, 90);
    ctx.closePath();
    ctx.fill();
    // Body shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(12, -90, 14, 170);

    ctx.restore();
  }

  // ============================================================
  // DRAWING - OBSTACLES
  // ============================================================
  function drawObstacle(ob) {
    ctx.save();
    ctx.translate(ob.x, ob.y);
    ctx.rotate(ob.rot);
    if (ob.type === 'asteroid') {
      ctx.fillStyle = '#7a6a5a';
      ctx.beginPath();
      const r = ob.r;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = r * (0.85 + Math.sin(i * 1.7) * 0.15);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // craters
      ctx.fillStyle = '#5a4a3a';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        const cr = r * 0.18;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, cr, 0, Math.PI * 2);
        ctx.fill();
      }
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(r * 0.3, r * 0.3, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (ob.type === 'satellite') {
      const s = ob.size;
      // solar panels
      ctx.fillStyle = '#3355aa';
      ctx.fillRect(-s * 0.8, -8, s * 0.45, 16);
      ctx.fillRect(s * 0.35, -8, s * 0.45, 16);
      // panel grid lines
      ctx.strokeStyle = '#1a3366';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const px = -s * 0.8 + (i / 4) * s * 0.45;
        ctx.beginPath();
        ctx.moveTo(px, -8); ctx.lineTo(px, 8);
        ctx.stroke();
        const px2 = s * 0.35 + (i / 4) * s * 0.45;
        ctx.beginPath();
        ctx.moveTo(px2, -8); ctx.lineTo(px2, 8);
        ctx.stroke();
      }
      // body
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(-s * 0.25, -s * 0.22, s * 0.5, s * 0.44);
      ctx.fillStyle = '#888';
      ctx.fillRect(-s * 0.25, -s * 0.22, 4, s * 0.44);
      // dish
      ctx.fillStyle = '#dddddd';
      ctx.beginPath();
      ctx.arc(0, -s * 0.28, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (ob.type === 'ufo') {
      const s = ob.size;
      // bottom dome
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(0, 4, s * 0.5, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      // top dome
      ctx.fillStyle = '#9aaad0';
      ctx.beginPath();
      ctx.ellipse(0, -6, s * 0.28, s * 0.22, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // lights
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = (Math.floor(rocket.flameAnim) + i) % 2 ? '#ffff00' : '#ff6600';
        ctx.beginPath();
        ctx.arc(i * s * 0.18, 6, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ob.type === 'sign') {
      // Warning sign (diamond shape)
      const s = ob.size;
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(0, s * 0.5);
      ctx.lineTo(-s * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.rotate(-ob.rot); // keep text upright
      ctx.fillText(ob.signText, 0, 0);
    }
    ctx.restore();
  }

  // ============================================================
  // DRAWING - TRIGGER BUBBLES
  // ============================================================
  function drawTriggerBubble(bub) {
    // Top-of-screen toast. Slot lays them out in vertical strips below the HUD.
    const slotH = 64;
    const HUD_H = 60;
    const targetY = HUD_H + 10 + bub.slot * slotH;
    // Slide-in from off the top edge
    const easeIn = 1 - Math.pow(1 - bub.slideIn, 3);
    // Fade out in last 0.4s of life
    const remaining = bub.life - bub.age;
    const fadeOut = remaining < 0.4 ? Math.max(0, remaining / 0.4) : 1;
    const slideOut = remaining < 0.4 ? remaining / 0.4 : 1;

    const y = -bub.h - 10 + (targetY - (-bub.h - 10)) * easeIn * slideOut;
    const x = W / 2 - bub.bubW / 2;
    const w = bub.bubW;
    const h = bub.h;

    ctx.save();
    ctx.globalAlpha = fadeOut;

    let bg, fg, labelBg;
    if (bub.tier === 'nuclear') { bg = '#1a0000'; fg = '#ff5555'; labelBg = '#ff2222'; }
    else if (bub.tier === 'spicy') { bg = '#1a1000'; fg = '#ffaa44'; labelBg = '#cc7722'; }
    else { bg = '#001a1a'; fg = '#66ddff'; labelBg = '#4488aa'; }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, w, h, 14);
    ctx.fill();

    // Bubble box
    ctx.fillStyle = bg;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();

    // Sender label tab (pill on left)
    ctx.font = 'bold 14px -apple-system, sans-serif';
    const labelW = ctx.measureText(bub.src).width + 16;
    ctx.fillStyle = labelBg;
    ctx.beginPath();
    ctx.roundRect(x + 8, y + 8, labelW, 22, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(bub.src, x + 16, y + 19);

    // Message text
    ctx.fillStyle = fg;
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(bub.text, x + 8 + labelW + 10, y + h / 2 + 4);

    ctx.restore();
  }

  function drawEmoteBubble(e) {
    const alpha = Math.min(1, e.age * 4) * Math.max(0, 1 - (e.age - e.life * 0.6) / (e.life * 0.4));
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = 'bold 32px Impact, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(e.text).width;
    const bw = tw + 30;
    const bh = 48;
    const bx = e.x - bw / 2;
    const by = e.y - bh / 2;
    // burst spikes around bubble
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    const cx = e.x, cy = e.y;
    const spikes = 14;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? bw / 2 + 14 : bw / 2 + 4;
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.7;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    // text
    ctx.fillStyle = '#000';
    ctx.fillText(e.text, e.x, e.y);
    ctx.restore();
  }

  // ============================================================
  // DRAWING - UI / HUD / SCREENS
  // ============================================================
  function drawHUD() {
    // Score (top left)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 56);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCORE  ' + Math.floor(score + elapsedSurvived * 10), 18, 28);

    // Speed tier (top right)
    ctx.textAlign = 'right';
    ctx.fillStyle = rocket.speedTier >= 9 ? '#ff4444' : (rocket.speedTier >= 5 ? '#ffaa44' : '#66ddff');
    ctx.fillText('SPD  ' + rocket.speedTier, W - 18, 28);

    // Speed tier bar
    const barX = 18, barY = 50, barW = W - 36, barH = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = rocket.speedTier >= 9 ? '#ff4444' : (rocket.speedTier >= 5 ? '#ffaa44' : '#66ddff');
    ctx.fillRect(barX, barY, barW * (rocket.speedTier / MAX_TIER), barH);
    ctx.restore();
  }

  function drawTitle() {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 88px -apple-system, sans-serif';
    ctx.fillText('TRIGGERED', W / 2, H * 0.22);
    ctx.font = 'bold 26px -apple-system, sans-serif';
    ctx.fillStyle = '#ff5555';
    ctx.fillText('The Joe Ejection', W / 2, H * 0.28);

    // Joe + rocket preview (drawJoe uses photo if available, procedural otherwise)
    drawRocket(W / 2 + 40, H * 0.56, 1.0);
    drawJoe(W / 2 - 50, H * 0.56, 1.0, 0, 0);

    ctx.fillStyle = '#ffdd55';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText('HIGH SCORE  ' + highScore, W / 2, H * 0.81);

    const pulse = 0.7 + 0.3 * Math.sin(stateTime * 4);
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.font = 'bold 32px -apple-system, sans-serif';
    ctx.fillText('TAP TO LAUNCH', W / 2, H * 0.89);
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('tap left/right or use A/D - press M to mute', W / 2, H * 0.93);
    ctx.restore();
  }

  function drawIntro() {
    if (stateTime < 1.2) {
      // Joe stands center, phone bubble pops in front
      drawJoe(W / 2, H * 0.55, 1.1, joe.poseIndex, joe.faceShake);
      // Phone-style speech bubble of inciting message
      const t = introMessage;
      ctx.save();
      ctx.font = 'bold 28px -apple-system, sans-serif';
      const tw = ctx.measureText(t.text).width + 60;
      const bw = Math.min(W - 80, tw);
      const bx = W / 2 - bw / 2;
      const by = H * 0.32;
      const scale = Math.min(1, stateTime / 0.4);
      ctx.translate(W / 2, by + 50);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(by + 50));
      ctx.fillStyle = '#1a0000';
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 90, 18);
      ctx.fill();
      ctx.stroke();
      // sender tab
      ctx.fillStyle = '#ff2222';
      ctx.beginPath();
      ctx.roundRect(bx + 14, by - 16, 70, 26, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.src, bx + 22, by - 3);
      ctx.fillStyle = '#ff5555';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(t.text, bx + 22, by + 48);
      ctx.restore();
    } else if (stateTime < 1.8) {
      // shake + scream
      drawJoe(W / 2, H * 0.55, 1.1, joe.poseIndex, 1);
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 56px -apple-system, sans-serif';
      ctx.fillText('NOPE.', W / 2, H * 0.3);
      ctx.restore();
    } else if (stateTime < 2.6) {
      // rocket arriving from below, Joe grabs on
      const t = (stateTime - 1.8) / 0.8;
      const ry = H * 1.2 - t * (H * 0.5);
      drawRocket(W / 2 + 30, ry, 1);
      drawJoe(W / 2 - 40, joe.y, 1.1, joe.poseIndex, 0.5);
    } else {
      // launching upward (camera follows rocket - rocket appears fixed, world scrolls)
      drawRocket(W / 2, H * 0.72, 1);
      drawJoe(W / 2 - 60, H * 0.72, 1, 1, 0);
    }
  }

  function drawGameOver() {
    ctx.save();
    // dim
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ff3333';
    ctx.textAlign = 'center';
    ctx.font = 'bold 88px -apple-system, sans-serif';
    ctx.fillText('MELTDOWN', W / 2, H * 0.24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText('Joe could not handle it', W / 2, H * 0.3);

    // Score panel
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(W * 0.1, H * 0.4, W * 0.8, H * 0.28, 16);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.fillText('FINAL SCORE', W / 2, H * 0.46);
    ctx.font = 'bold 64px -apple-system, sans-serif';
    ctx.fillStyle = newHigh ? '#ffdd33' : '#fff';
    ctx.fillText(String(finalScore), W / 2, H * 0.54);
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('triggers absorbed: ' + triggersAbsorbed, W / 2, H * 0.6);
    ctx.fillText('survived: ' + elapsedSurvived.toFixed(1) + 's', W / 2, H * 0.64);

    if (newHigh) {
      const pulse = 0.6 + 0.4 * Math.sin(stateTime * 6);
      ctx.fillStyle = `rgba(255,221,51,${pulse})`;
      ctx.font = 'bold 28px -apple-system, sans-serif';
      ctx.fillText('NEW HIGH SCORE', W / 2, H * 0.72);
    } else {
      ctx.fillStyle = '#888';
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.fillText('high score  ' + highScore, W / 2, H * 0.72);
    }

    if (stateTime > 1.0) {
      const pulse = 0.6 + 0.4 * Math.sin(stateTime * 4);
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      ctx.font = 'bold 26px -apple-system, sans-serif';
      ctx.fillText('TAP TO TRY AGAIN', W / 2, H * 0.86);
    }
    ctx.restore();
  }

  // ============================================================
  // RENDER
  // ============================================================
  function render() {
    // Screen shake offset
    const sx = (Math.random() - 0.5) * screenShake;
    const sy = (Math.random() - 0.5) * screenShake;

    ctx.save();
    ctx.translate(sx, sy);

    // background gradient (deep space)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#000010');
    grad.addColorStop(0.5, '#050018');
    grad.addColorStop(1, '#000005');
    ctx.fillStyle = grad;
    ctx.fillRect(-50, -50, W + 100, H + 100);

    // Stars
    for (const s of stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + s.z * 0.6})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    if (state === 'title') {
      drawTitle();
    } else if (state === 'intro') {
      drawIntro();
    } else if (state === 'playing' || state === 'gameover') {
      // World - rocket + joe
      drawRocket(joe.x + 50, joe.y, 1);
      drawJoe(joe.x - 50, joe.y, 1, joe.poseIndex, joe.faceShake);

      // Obstacles in the play field
      for (const ob of obstacles) drawObstacle(ob);

      // Joe's shouts (above everything in the play area)
      for (const e of emoteBubbles) drawEmoteBubble(e);

      // Toast notifications at TOP of screen (above obstacles, below HUD)
      for (const bub of triggerBubbles) drawTriggerBubble(bub);

      // Particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / 1.5);
        ctx.fillStyle = p.color;
        circle(p.x, p.y, p.size);
      }
      ctx.globalAlpha = 1;

      // Floating text
      for (const f of floatingText) {
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      if (state === 'playing') drawHUD();
      if (state === 'gameover') drawGameOver();
    }

    // Red flash overlay
    if (redFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${redFlash * 0.35})`;
      ctx.fillRect(-50, -50, W + 100, H + 100);
    }

    ctx.restore();
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1; // clamp on tab unfocus
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Patch CanvasRenderingContext2D.roundRect if missing (older browsers)
  if (!ctx.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = [r, r, r, r];
      this.beginPath();
      this.moveTo(x + r[0], y);
      this.lineTo(x + w - r[1], y);
      this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
      this.lineTo(x + w, y + h - r[2]);
      this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
      this.lineTo(x + r[3], y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
      this.lineTo(x, y + r[0]);
      this.quadraticCurveTo(x, y, x + r[0], y);
      return this;
    };
  }
})();
