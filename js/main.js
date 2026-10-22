/**
 * main.js
 * ---------------------------------------------------------------------------
 * All behaviour for the portfolio. Each feature lives in its own init
 * function, and everything starts from the bottom of the file.
 *
 *   1. Theme toggle ........ light / dark switch
 *   2. Grid background ..... cursor glow and pulsing cells
 *   3. Hero timeline ....... draggable playhead, ruler and waveforms
 *   4. Work filters ........ category chips that filter the project grid
 *      (and automatic YouTube thumbnails for cards that have no picture)
 *   5. Video modal ......... opens a project or the showreel in a dialog
 *   6. Services tabs ....... "What I do" tab switcher
 *   7. Scroll reveal ....... fades sections in as they enter the screen
 *   8. Software orbit ...... logos circling the head, driven by the timeline
 *   9. Background sound .... soft cinematic ambience that follows the orbit and playhead
 *
 * This file is loaded with `defer`, so the DOM is ready when it runs.
 */
(function () {
  'use strict';

  /* ======================================================================
     Helpers
     ====================================================================== */

  /** querySelector shortcut: $('.foo') or $('.foo', someElement). */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /** querySelectorAll shortcut that returns a real Array. */
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /** Visitors who ask their device for less motion get static versions. */
  var prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * State shared by the timeline (3), the software orbit (8) and the sound (9).
   *   progress: playhead position, 0 to 1                    (written by the timeline)
   *   lap:      how many times the auto-play has looped, so the orbit keeps
   *             turning smoothly when the loop restarts       (written by the timeline)
   *   angle:    orbit angle in degrees                        (written by the orbit)
   *   velocity: orbit speed in degrees per second, negative   (written by the orbit)
   *             when going backwards
   */
  var timelineState = { progress: 0, lap: 0, angle: 0, velocity: 0 };

  /** Pads a number to two digits: 7 -> "07". Used for the timecode. */
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ======================================================================
     1. Theme toggle
     ----------------------------------------------------------------------
     The initial theme is set by theme-init.js. This only handles clicks.
     ====================================================================== */
  function initThemeToggle() {
    var button = $('#tg');
    if (!button) return;

    button.addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next); // remember the choice
      } catch (e) {
        /* storage blocked: the theme still changes for this visit */
      }
    });
  }

  /* ======================================================================
     2. Grid background
     ----------------------------------------------------------------------
     CSS draws the grid. This script:
       - moves an accent "glow" that lights up the grid under the cursor
         (it wanders on its own when there is no mouse, e.g. on phones)
       - adds a few cells that fade in and out at random grid positions
     ====================================================================== */
  function initGridBackground() {
    var bg = $('#bg');
    if (!bg) return;

    var CELL_SIZE = 56;  // keep in sync with `background-size` on .bg in styles.css
    var CELL_COUNT = 9;  // how many pulsing cells to create

    var glow = { x: innerWidth * 0.6, y: innerHeight * 0.3 }; // current position
    var target = { x: glow.x, y: glow.y };                     // where it is heading
    var hasPointer = false;                                    // has the cursor moved yet?

    // Follow the cursor (or finger).
    addEventListener('pointermove', function (e) {
      hasPointer = true;
      target.x = e.clientX;
      target.y = e.clientY;
    }, { passive: true });

    // Snap a cell to a random square of the grid.
    function placeCell(cell) {
      cell.style.left = Math.floor(Math.random() * Math.ceil(innerWidth / CELL_SIZE)) * CELL_SIZE + 'px';
      cell.style.top = Math.floor(Math.random() * Math.ceil(innerHeight / CELL_SIZE)) * CELL_SIZE + 'px';
    }

    // Pulsing cells (skipped entirely when motion is reduced).
    if (!prefersReducedMotion) {
      for (var i = 0; i < CELL_COUNT; i++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.animationDelay = (-Math.random() * 6).toFixed(2) + 's';
        cell.style.animationDuration = (4 + Math.random() * 4).toFixed(1) + 's';
        placeCell(cell);
        // After each fade cycle, move to a new square.
        cell.addEventListener('animationiteration', function () { placeCell(this); });
        bg.appendChild(cell);
      }
    }

    // Animation loop: ease the glow toward its target and publish it to CSS.
    function frame(time) {
      if (!hasPointer) {
        // No cursor yet: drift slowly in a loop.
        target.x = innerWidth * (0.5 + 0.3 * Math.sin(time / 4200));
        target.y = innerHeight * (0.35 + 0.2 * Math.cos(time / 5400));
      }
      glow.x += (target.x - glow.x) * 0.08;
      glow.y += (target.y - glow.y) * 0.08;
      bg.style.setProperty('--mx', glow.x.toFixed(1) + 'px');
      bg.style.setProperty('--my', glow.y.toFixed(1) + 'px');
      if (!prefersReducedMotion) requestAnimationFrame(frame);
    }
    frame(0);
  }

  /* ======================================================================
     3. Hero timeline
     ----------------------------------------------------------------------
     A fake editing timeline. The playhead moves on its own and can be
     dragged. The audio waveforms light up as the playhead passes them.
     ====================================================================== */
  function initTimeline() {
    var lanes = $('#lanes');
    var ruler = $('#ruler');
    var playhead = $('#head');
    var timecode = $('#tc');
    if (!lanes || !ruler || !playhead || !timecode) return;

    var DURATION = 30;   // seconds shown on the ruler
    var FPS = 24;        // frames per second for the timecode
    var LOOP_MS = 16000; // time for the playhead to cross the timeline
    var progress = prefersReducedMotion ? 0.35 : 0; // playhead position, 0 to 1
    var isDragging = false;
    var lastTime = 0;

    // --- Ruler labels: 00:00, 00:05, ... 00:30 ---
    for (var s = 0; s <= DURATION; s += 5) {
      var label = document.createElement('span');
      label.style.left = (s / DURATION * 100) + '%';
      label.textContent = '00:' + pad2(s);
      ruler.appendChild(label);
    }

    // --- Waveforms: generate bars for each audio clip ---
    // Each clip has two identical bar layers. The top one is clipped to the
    // played part (via the --q CSS variable) so it shows a brighter wave.
    var audioClips = $$('.clip.au');
    audioClips.forEach(function (clip, index) {
      var widthPercent = parseFloat(clip.dataset.w);
      var barCount = Math.round(widthPercent * 1.5);
      var bars = '';
      for (var i = 0; i < barCount; i++) {
        // Two sine waves give a speech-like envelope; a third adds variation.
        var envelope = Math.abs(Math.sin(i * 0.23 + index * 2)) * Math.abs(Math.sin(i * 0.051 + 1 + index));
        var variation = 0.55 + 0.45 * Math.abs(Math.sin(i * 7.13 + index));
        var height = Math.max(10, Math.min(92, 12 + 84 * envelope * variation));
        bars += '<i style="height:' + height.toFixed(0) + '%"></i>';
      }
      $$('.wv', clip).forEach(function (layer) { layer.innerHTML = bars; });
    });

    // --- Draw the current state: playhead, timecode and wave highlight ---
    function paint() {
      timelineState.progress = progress; // let the orbit follow
      var offset = ruler.offsetLeft; // width of the V1/V2/A1 label column
      var rulerWidth = ruler.offsetWidth;
      playhead.style.transform = 'translateX(' + (offset + progress * rulerWidth - 1) + 'px)';

      var frames = Math.round(progress * DURATION * FPS);
      timecode.textContent = '00:00:' + pad2(Math.floor(frames / FPS) % 60) + ':' + pad2(frames % FPS);

      // How much of each audio clip has been "played" (0 to 1).
      audioClips.forEach(function (clip) {
        var start = parseFloat(clip.dataset.s);
        var width = parseFloat(clip.dataset.w);
        var played = Math.min(1, Math.max(0, (progress * 100 - start) / width));
        clip.style.setProperty('--q', played);
      });
    }

    // --- Scrubbing: turn a pointer position into a 0 to 1 value ---
    function scrubTo(event) {
      var rect = ruler.getBoundingClientRect();
      progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      paint();
    }

    lanes.addEventListener('pointerdown', function (e) {
      isDragging = true;
      lanes.setPointerCapture(e.pointerId);
      scrubTo(e);
    });
    lanes.addEventListener('pointermove', function (e) { if (isDragging) scrubTo(e); });
    ['pointerup', 'pointercancel'].forEach(function (name) {
      lanes.addEventListener(name, function () { isDragging = false; });
    });

    // --- Auto-play loop (paused while dragging or when motion is reduced) ---
    function loop(time) {
      if (!prefersReducedMotion && !isDragging) {
        progress += (time - lastTime) / LOOP_MS;
        if (progress > 1) {
          progress -= 1;
          timelineState.lap += 1; // keeps (lap + progress) continuous for the orbit
        }
      }
      lastTime = time;
      paint();
      requestAnimationFrame(loop);
    }
    loop(0);
  }

  /* ======================================================================
     4. Work filters
     ----------------------------------------------------------------------
     Buttons carry data-f="short|youtube|motion|design|all". Project cards
     carry data-c with their category. Non-matching cards get `.hide`.
     The group headings (Long-form, Short-form, Graphics) only show on "All".
     ====================================================================== */
  function initWorkFilters() {
    var chips = $$('.chip');
    var cards = $$('.card');
    var headings = $$('.grp');

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        // Mark the active chip (also read by screen readers).
        chips.forEach(function (other) { other.setAttribute('aria-pressed', other === chip); });

        var filter = chip.dataset.f;
        headings.forEach(function (heading) { heading.classList.toggle('hide', filter !== 'all'); });
        cards.forEach(function (card) {
          var show = filter === 'all' || card.dataset.c === filter;
          card.classList.toggle('hide', !show);
          card.classList.remove('in');
          if (show) {
            void card.offsetWidth;    // force a reflow so the animation restarts
            card.classList.add('in'); // small "pop" entrance
          }
        });

        // Hide the before / after wrapper (and its arrow) when both of its videos are hidden.
        $$('.ba').forEach(function (pair) {
          pair.classList.toggle('hide', !$('.card:not(.hide)', pair));
        });
      });
    });
  }

  /* ======================================================================
     4b. Automatic YouTube thumbnails
     ----------------------------------------------------------------------
     A landscape card with a YouTube link in data-src but no <img> of its own
     gets YouTube's thumbnail for that video. Add your own <img> in the card
     and this skips it.
     ====================================================================== */
  function initYouTubeThumbnails() {
    $$('.card.l').forEach(function (card) {
      var thumb = $('.thumb', card);
      if (!thumb || $('img', thumb)) return;               // it already has its own picture

      var match = (card.dataset.src || '').match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
      if (!match) return;                                   // not a YouTube link

      var base = 'https://i.ytimg.com/vi/' + match[1] + '/';
      var img = document.createElement('img');
      img.alt = card.dataset.title + ' thumbnail';
      img.loading = 'lazy';
      img.decoding = 'async';

      // Prefer the HD thumbnail; fall back to the medium one if it is missing.
      img.addEventListener('load', function () {
        // YouTube sends a tiny grey picture when there is no HD version.
        if (img.naturalWidth <= 120 && img.src.indexOf('maxresdefault') !== -1) img.src = base + 'mqdefault.jpg';
      });
      img.addEventListener('error', function () {
        if (img.src.indexOf('mqdefault') === -1) img.src = base + 'mqdefault.jpg';
        else img.remove();                                  // give up: the gradient shows instead
      });
      img.src = base + 'maxresdefault.jpg';
      thumb.appendChild(img);
    });
  }

  /* ======================================================================
     5. Video modal
     ----------------------------------------------------------------------
     Clicking a project card (or the showreel) opens a <dialog> that shows
     that item:
       - Graphics cards (class "d") show their image at full size, uncropped.
         The image is the card's own <img>, or a bigger one given in
         data-full="assets/images/big.jpg".
       - Video cards play the link stored in data-src. If a video card has no
         link yet but has an image, the image is shown instead.
     While a video is playing, the background sound pauses and resumes when
     it closes. Graphics do not pause the sound. Supported video links:
       - YouTube (watch, youtu.be and Shorts links)
       - Vimeo
       - a direct video file (.mp4, etc.)
     ====================================================================== */
  function initVideoModal() {
    var dialog = $('#dlg');
    var frame = $('#vf');          // the player area
    var title = $('#vt');          // the title under the player
    var closeButton = $('#cl');
    if (!dialog || !frame || !title || !closeButton) return;

    // Wrap the player and its caption so both can be sized to the video's shape.
    // (No HTML change is needed for this.)
    var caption = $('.mt', dialog);
    var wrap = document.createElement('div');
    wrap.className = 'vwrap';
    frame.parentNode.insertBefore(wrap, frame);
    wrap.appendChild(frame);
    if (caption) wrap.appendChild(caption);

    /** Sizes the player to a width / height ratio, never taller than 78% of the screen. */
    function fitTo(ratio) {
      frame.style.aspectRatio = ratio;
      wrap.style.width = 'min(100%, calc(78vh * ' + ratio + '))';
    }

    /** Builds the right player markup for a given link. */
    function buildPlayer(src) {
      if (!src) {
        return '<p>Video goes here. Add the video link in the data-src attribute of this project.</p>';
      }
      var youtube = src.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
      var vimeo = src.match(/vimeo\.com\/(\d+)/);
      if (youtube) {
        return '<iframe src="https://www.youtube.com/embed/' + youtube[1] + '?autoplay=1" allow="autoplay;fullscreen" allowfullscreen title="Video"></iframe>';
      }
      if (vimeo) {
        return '<iframe src="https://player.vimeo.com/video/' + vimeo[1] + '?autoplay=1" allow="autoplay;fullscreen" allowfullscreen title="Video"></iframe>';
      }
      return '<video src="' + src + '" controls autoplay playsinline></video>';
    }

    // True while the open item is a video, so the close handler knows to resume the sound.
    var soundPaused = false;

    /** Puts a full-size image in the frame (used for graphics). */
    function showImage(src, alt) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      frame.appendChild(img);
    }

    /** Puts a coloured box with a hint in the frame (when there is nothing to show yet). */
    function showPlaceholder(card, message) {
      var box = document.createElement('div');
      box.className = 'empty-art';
      var thumb = $('.thumb', card);
      if (thumb) box.style.background = getComputedStyle(thumb).backgroundImage;
      box.textContent = message;
      frame.appendChild(box);
    }

    /** Opens whatever was clicked: an image for graphics, a player for videos. */
    function openItem(element) {
      var isGraphic = element.classList.contains('d');
      var isPortrait = element.classList.contains('p') && !isGraphic;
      var thumbImage = $('.thumb img', element);
      var imageSrc = element.dataset.full || (thumbImage ? thumbImage.getAttribute('src') : '');
      var altText = thumbImage && thumbImage.alt && thumbImage.alt !== '...' ? thumbImage.alt : element.dataset.title;
      var videoSrc = element.dataset.src;

      title.textContent = element.dataset.title;
      frame.innerHTML = '';
      frame.removeAttribute('style');
      wrap.removeAttribute('style');

      if (isGraphic) {
        frame.className = 'vf img';
        if (imageSrc) showImage(imageSrc, altText);
        else showPlaceholder(element, 'Add an image to this card and it will show here.');
      } else if (videoSrc) {
        frame.className = 'vf';
        frame.innerHTML = buildPlayer(videoSrc);
        fitTo(isPortrait ? 9 / 16 : 16 / 9); // portrait cards get a tall player, the rest a wide one

        // For a video file, switch to the file's real shape once it is known.
        var videoFile = $('video', frame);
        if (videoFile) {
          videoFile.addEventListener('loadedmetadata', function () {
            if (videoFile.videoWidth) fitTo(videoFile.videoWidth / videoFile.videoHeight);
          });
        }
      } else if (imageSrc) {
        frame.className = 'vf img';           // no video link yet: show the thumbnail
        showImage(imageSrc, altText);
      } else {
        frame.className = 'vf hint';          // shows the "video goes here" hint
        frame.innerHTML = buildPlayer('');
      }

      // Only a playing video pauses the background sound. Graphics leave it playing.
      soundPaused = !isGraphic && !!videoSrc;
      if (soundPaused) document.dispatchEvent(new CustomEvent('portfolio:video-open'));

      dialog.showModal();
    }

    function closeVideo() {
      frame.innerHTML = ''; // removing the player also stops playback
      dialog.close();
    }

    // Project cards and the showreel all open the same dialog.
    var triggers = $$('.card');
    var reel = $('#reel');
    if (reel) triggers.push(reel);

    triggers.forEach(function (element) {
      element.addEventListener('click', function () { openItem(element); });
      // The reel is a <div role="button">, so give it keyboard support.
      element.addEventListener('keydown', function (e) {
        if (element.id === 'reel' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openItem(element);
        }
      });
    });

    closeButton.addEventListener('click', closeVideo);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeVideo(); }); // click the backdrop
    dialog.addEventListener('cancel', function () { frame.innerHTML = ''; });                  // Esc key

    // The dialog fires "close" however it was closed (button, backdrop or Esc).
    dialog.addEventListener('close', function () {
      if (soundPaused) {
        soundPaused = false;
        document.dispatchEvent(new CustomEvent('portfolio:video-close')); // sound resumes
      }
    });
  }

  /* ======================================================================
     6. Services tabs ("What I do")
     ----------------------------------------------------------------------
     Tab N shows panel N. Arrow keys move between tabs.
     ====================================================================== */
  function initServicesTabs() {
    var tabs = $$('.sv-tab');
    var panels = $$('.sv-panel');
    if (!tabs.length) return;

    function select(index, moveFocus) {
      tabs.forEach(function (tab, i) {
        var isActive = i === index;
        tab.setAttribute('aria-selected', isActive);
        tab.tabIndex = isActive ? 0 : -1; // only the active tab is in the tab order
        panels[i].classList.toggle('on', isActive);
      });
      if (moveFocus) tabs[index].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        var count = tabs.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          select((i + 1) % count, true);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          select((i + count - 1) % count, true);
        }
      });
    });
  }

  /* ======================================================================
     7. Scroll reveal
     ----------------------------------------------------------------------
     Elements with class "rv" start hidden (see styles.css) and fade in once,
     the first time they enter the screen.
     ====================================================================== */
  function initRevealOnScroll() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('on');
          observer.unobserve(entry.target); // only animate once
        }
      });
    }, { threshold: 0.12 });

    $$('.rv').forEach(function (element) { observer.observe(element); });
  }

  /* ======================================================================
     8. Software orbit
     ----------------------------------------------------------------------
     The four software logos circle the head in the hero portrait.

     Link to the timeline: the orbit angle is (lap + progress) x 360 degrees.
       - Drag the playhead forward and the logos turn one way; drag it back
         and they turn the other way.
       - Let go and the timeline auto-plays, so the logos keep turning.
       - One full timeline loop is exactly one full turn, so the loop restart
         is seamless.

     Depth: each logo sits on an ellipse. Logos on the near half are larger,
     brighter and drawn in front of the portrait (class "front"). Logos on
     the far half are smaller, dimmer and pass behind the head.
     ====================================================================== */
  function initOrbit() {
    var orbit = $('#orbit');
    if (!orbit) return;
    var orbs = $$('.orb', orbit);

    // Tune the look here. All values are fractions of the portrait width.
    var HEAD_X = 0.5;      // horizontal centre of the head
    var HEAD_Y = -0.055;   // vertical centre of the orbit, about jaw height (negative = above the portrait box)
    var RADIUS_X = 0.235;  // how far the logos swing left and right
    var RADIUS_Y = 0.115;  // how far they move up and down (the 3D tilt). Front logos pass below the chin, back logos behind the hair
    var ASPECT = 1.12;     // portrait height / width (matches aspect-ratio in styles.css)
    var INTRO_DELAY = 900; // ms to wait before the logos appear (after the portrait rises)
    var INTRO_TIME = 1400; // ms for the logos to spread out from the head

    var angle = 0;         // the angle currently drawn, in degrees
    var startTime = null;
    var lastFrame = null;

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function frame(time) {
      if (startTime === null) startTime = time;

      // Intro: logos start hidden at the head and spread out to the orbit.
      var intro = prefersReducedMotion
        ? 1
        : easeOut(Math.min(1, Math.max(0, (time - startTime - INTRO_DELAY) / INTRO_TIME)));

      // Ease toward the angle the timeline asks for (smooths out dragging).
      var target = (timelineState.lap + timelineState.progress) * 360;
      var previous = angle;
      angle += (target - angle) * (prefersReducedMotion ? 1 : 0.15);

      // Publish angle and speed so the sound (9) can react to the movement.
      var dt = lastFrame === null ? 16 : Math.max(1, time - lastFrame);
      lastFrame = time;
      timelineState.velocity += (((angle - previous) / dt) * 1000 - timelineState.velocity) * 0.25;
      timelineState.angle = angle;

      orbs.forEach(function (orb, i) {
        var theta = (angle + (i * 360) / orbs.length) * Math.PI / 180;
        var depth = Math.cos(theta);            // 1 = nearest, -1 = farthest
        var near = (depth + 1) / 2;             // 0 to 1

        var x = HEAD_X + RADIUS_X * Math.sin(theta) * intro;
        var y = (HEAD_Y + RADIUS_Y * depth * intro) / ASPECT; // top % is relative to the figure height
        var scale = (0.78 + 0.3 * near) * (0.4 + 0.6 * intro);

        orb.style.left = (x * 100).toFixed(2) + '%';
        orb.style.top = (y * 100).toFixed(2) + '%';
        orb.style.transform = 'translate(-50%, -50%) scale(' + scale.toFixed(3) + ')';
        orb.style.opacity = ((0.55 + 0.45 * near) * intro).toFixed(3);
        orb.classList.toggle('front', depth > 0);
      });

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ======================================================================
     9. Background sound
     ----------------------------------------------------------------------
     An airy, angelic ambience made with the Web Audio API (no audio files),
     meant to feel like sunrise on a hillside: relaxed, open and hopeful.
     It is a slow major-key pad with a soft choir-like "ah" on top, a long
     bright reverb, and tiny bell-like glints. There are no drums, low rumble
     or piano notes. It follows the orbit, which follows the timeline:
       - Each time a logo passes the front, the pad glides to the next chord
         (four chords per full turn) and swells gently. Scrubbing the
         playhead back glides back through the same chords.
       - A tiny, soft glint plays as the playhead passes each second mark on
         the ruler. The glints are notes from a happy five-note scale, so they
         climb as you scrub forwards and fall as you scrub back. They are very
         quiet during auto-play and a little clearer when you scrub.
       - The whole sound drifts left and right with the orbit.

     The sound pauses while a video is playing in the modal and fades back in
     when it closes (see initVideoModal).

     Browsers block sound until the visitor interacts with the page, so it
     starts on the first click, tap or key press. The speaker button beside
     the theme toggle mutes and unmutes, and remembers the choice.
     ====================================================================== */
  function initSound() {
    var button = $('#snd');
    if (!button) return;

    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { button.hidden = true; return; } // very old browsers

    // Four chords, one per quarter turn of the orbit. Each has four notes (Hz).
    // C major 9 -> G major 7 -> A minor 9 -> F major 7: bright, floating and unresolved
    // in a happy way. Everything stays high and open (nothing below about 290 Hz),
    // which keeps it light and angelic instead of heavy.
    var CHORDS = [
      [329.63, 392.00, 493.88, 587.33],
      [293.66, 392.00, 493.88, 739.99],
      [392.00, 440.00, 523.25, 659.25],
      [349.23, 440.00, 523.25, 659.25]
    ];
    // Notes for the glints: C major pentatonic (C D E G A) in a high octave.
    var GLINT_NOTES = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00];
    var MASTER_VOLUME = 0.6;   // overall loudness, 0 to 1
    var PAD_LEVEL = 0.09;      // resting loudness of the pad
    var GLIDE = 1.8;           // seconds-ish it takes the pad to float to a new chord (slower = more dreamy)
    var TICK_MARKS = 30;       // one tick per second mark on the ruler
    var TICK_LEVEL = 0.045;    // loudness of a glint at full strength

    var wantSound = false;
    try { wantSound = localStorage.getItem('sound') !== 'off'; } catch (e) { /* ignore */ }

    var ctx = null;        // the AudioContext (created on first use)
    var audio = null;      // the nodes we adjust while playing
    var timer = null;      // update interval
    var lastStep = null;   // which 90 degree step the orbit was in
    var lastTickMark = null; // which second mark of the timeline the playhead was last at
    var lastTickAt = 0;    // time of the last tick, so very fast scrubbing stays soft
    var pausedForVideo = false; // true while a video is open in the modal

    /** Builds a long, soft reverb tail from decaying noise. */
    function makeReverbImpulse(seconds, decay) {
      var rate = ctx.sampleRate;
      var length = Math.floor(rate * seconds);
      var impulse = ctx.createBuffer(2, length, rate);
      for (var channel = 0; channel < 2; channel++) {
        var data = impulse.getChannelData(channel);
        for (var i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }
      return impulse;
    }

    /** Creates the audio graph: pad + air, both through a reverb, into one master volume. */
    function build() {
       ctx = new AudioContextClass();

      var master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // Reverb: a long tail that makes everything feel spacious.
      var reverb = ctx.createConvolver();
      reverb.buffer = makeReverbImpulse(5.5, 1.8); // long and bright, like a cathedral full of light
      var reverbLevel = ctx.createGain();
      reverbLevel.gain.value = 0.8;
      reverb.connect(reverbLevel);
      reverbLevel.connect(master);

      // Optional stereo panner so the ambience can drift left and right.
      var panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      var bus = ctx.createGain();            // everything musical goes through here
      if (panner) { bus.connect(panner); panner.connect(master); panner.connect(reverb); }
      else { bus.connect(master); bus.connect(reverb); }

      // Pad: four voices, each made of two slightly detuned oscillators.
      var padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 3000; // wide open, so the pad is bright and airy
      padFilter.Q.value = 0.4;
      var padLevel = ctx.createGain();
      padLevel.gain.value = PAD_LEVEL;
      padFilter.connect(padLevel);
      padLevel.connect(bus);

      // Choir "ah": a soft sawtooth for each chord note goes through three band-pass
      // filters placed at the formants of the vowel "ah", which gives a gentle human tone.
      var choirSum = ctx.createGain();
      var choirSoft = ctx.createBiquadFilter();
      choirSoft.type = 'lowpass';
      choirSoft.frequency.value = 3200;
      var choirOut = ctx.createGain();
      choirOut.gain.value = 1.0;
      [[800, 1], [1150, 0.5], [2900, 0.25]].forEach(function (formant) {
        var band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = formant[0];
        band.Q.value = 5;
        var level = ctx.createGain();
        level.gain.value = formant[1];
        choirSum.connect(band);
        band.connect(level);
        level.connect(choirSoft);
      });
      choirSoft.connect(choirOut);
      choirOut.connect(padLevel);

      // Slow vibrato (about 5 times a second, a few cents) so the choir feels alive.
      var vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5.2;
      var vibratoDepth = ctx.createGain();
      vibratoDepth.gain.value = 7;
      vibrato.connect(vibratoDepth);
      vibrato.start();

      var voices = CHORDS[0].map(function (freq) {
        // Three layers per note: a sine, a slightly detuned triangle (warm chorus)
        // and a quiet sine one octave up (a little sparkle). Format: [type, detune in cents, level]
        var pair = [['sine', -5, 0.28], ['triangle', 5, 0.14], ['sine', 1200, 0.09]].map(function (def) {
          var osc = ctx.createOscillator();
          osc.type = def[0];
          osc.frequency.value = freq;
          osc.detune.value = def[1];
          var level = ctx.createGain();
          level.gain.value = def[2];
          osc.connect(level);
          level.connect(padFilter);
          osc.start();
          return osc;
        });
        // Choir layer for this note.
        var choir = ctx.createOscillator();
        choir.type = 'sawtooth';
        choir.frequency.value = freq;
        var choirLevel = ctx.createGain();
        choirLevel.gain.value = 0.22;
        choir.connect(choirLevel);
        choirLevel.connect(choirSum);
        vibratoDepth.connect(choir.detune);
        choir.start();
        pair.push(choir); // so it glides with the rest when the chord changes
        return pair;
      });

      // A very slow LFO makes the pad's brightness breathe on its own.
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      var lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 500;
      lfo.connect(lfoDepth);
      lfoDepth.connect(padFilter.frequency);
      lfo.start();

      audio = { master: master, panner: panner, padFilter: padFilter, padLevel: padLevel,
                voices: voices, bus: bus };
    }

    /** Glides the four pad voices to a chord. */
    function setChord(index) {
      var now = ctx.currentTime;
      var chord = CHORDS[index];
      audio.voices.forEach(function (pair, i) {
        pair.forEach(function (osc) { osc.frequency.setTargetAtTime(chord[i], now, GLIDE / 3); });
      });
    }

    /**
     * One tiny glint: a soft, bell-like note from the pentatonic scale, sent
     * through the reverb so it shimmers like light on dew. Because the
     * note depends on the timeline mark, scrubbing forwards climbs the scale
     * and scrubbing back falls down it.
     *   mark:     which second mark the playhead just reached (any integer)
     *   strength: 0 to 1
     */
    function glint(mark, strength) {
      var now = ctx.currentTime;
      var freq = GLINT_NOTES[((mark % GLINT_NOTES.length) + GLINT_NOTES.length) % GLINT_NOTES.length];
      var envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(TICK_LEVEL * strength, now + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      envelope.connect(audio.bus); // the bus pans with the orbit and feeds the reverb
      [[1, 1], [2.76, 0.12], [5.4, 0.05]].forEach(function (partial) { // the note plus bell-like overtones
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * partial[0];
        var level = ctx.createGain();
        level.gain.value = partial[1];
        osc.connect(level);
        level.connect(envelope);
        osc.start(now);
        osc.stop(now + 1.2);
      });
    }

    /** A gentle swell: the pad rises a little in volume, then settles back. */
    function swell() {
      var now = ctx.currentTime;
      audio.padLevel.gain.setTargetAtTime(PAD_LEVEL * 1.6, now, 0.8);
      audio.padLevel.gain.setTargetAtTime(PAD_LEVEL, now + 1.8, 1.6);
    }

    /** Runs ~25 times a second while playing: reads the orbit and updates the sound. */
    function update() {
      var now = ctx.currentTime;
      var speed = Math.abs(timelineState.velocity);        // degrees per second
      var radians = timelineState.angle * Math.PI / 180;

      // Pad brightness drifts gently with the orbit angle, like light changing slowly.
      var drift = 0.5 + 0.5 * Math.sin(radians);
      audio.padFilter.frequency.setTargetAtTime(2600 + 800 * drift, now, 0.6);

      // Glints: one each time the playhead passes a second mark on the ruler.
      var mark = Math.floor((timelineState.lap + timelineState.progress) * TICK_MARKS);
      if (lastTickMark === null) lastTickMark = mark;
      if (mark !== lastTickMark) {
        var clock = performance.now();
        if (clock - lastTickAt > 55) {
          var strength = 0.25 + 0.75 * Math.min(1, speed / 360); // very soft when auto-playing, clearer when scrubbing
          glint(mark, strength);
          lastTickAt = clock;
        }
        lastTickMark = mark;
      }

      // Drift the whole ambience left and right with the orbit.
      if (audio.panner) audio.panner.pan.setTargetAtTime(0.45 * Math.sin(radians), now, 0.2);

      // Every 90 degrees (a logo passing the front): next chord and a swell.
      var step = Math.floor(timelineState.angle / 90);
      if (lastStep === null) lastStep = step;
      if (step !== lastStep) {
        setChord(((step % CHORDS.length) + CHORDS.length) % CHORDS.length);
        swell();
        lastStep = step;
      }
    }

    function start() {
      if (!wantSound || pausedForVideo) return;
      if (!ctx) build();
      ctx.resume();
      audio.master.gain.setTargetAtTime(MASTER_VOLUME, ctx.currentTime, 0.9); // slow fade in
      if (!timer) timer = setInterval(update, 40);
    }

    function stop() {
      if (!ctx) return;
      audio.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);             // fade out
      clearInterval(timer);
      timer = null;
      setTimeout(function () {
        if ((!wantSound || pausedForVideo) && ctx) ctx.suspend();             // then save CPU
      }, 1500);
    }

    function render() {
      button.dataset.sound = wantSound ? 'on' : 'off';
      button.setAttribute('aria-label', wantSound ? 'Mute sound' : 'Unmute sound');
    }

    // Mute / unmute button.
    button.addEventListener('click', function () {
      wantSound = !wantSound;
      try { localStorage.setItem('sound', wantSound ? 'on' : 'off'); } catch (e) { /* ignore */ }
      render();
      if (wantSound) start(); else stop();
    });

    // Start on the first interaction (browsers block sound before that).
    var unlockEvents = ['pointerdown', 'click', 'touchend', 'keydown'];
    function unlock(e) {
      if (e.target && e.target.closest && e.target.closest('#snd')) return; // the button handles itself
      if (!wantSound || pausedForVideo) return;
      start();
      if (!ctx) return;
      ctx.resume().then(function () {
        if (ctx.state === 'running') {
          unlockEvents.forEach(function (name) { removeEventListener(name, unlock); });
        }
      });
    }
    unlockEvents.forEach(function (name) { addEventListener(name, unlock, { passive: true }); });

    // Pause when the tab is hidden.
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else if (wantSound && !pausedForVideo) ctx.resume();
    });

    // A video opened in the modal: fade the sound out. It resumes when the modal closes.
    document.addEventListener('portfolio:video-open', function () {
      pausedForVideo = true;
      stop();
    });
    document.addEventListener('portfolio:video-close', function () {
      pausedForVideo = false;
      start();
    });

    render();
  }

  /* ======================================================================
     Start everything
     ====================================================================== */
  initThemeToggle();
  initGridBackground();
  initTimeline();
  initWorkFilters();
  initYouTubeThumbnails();
  initVideoModal();
  initServicesTabs();
  initRevealOnScroll();
  initOrbit();
  initSound();
})();