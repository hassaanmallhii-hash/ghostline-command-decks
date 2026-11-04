document.addEventListener('DOMContentLoaded', () => {
    // ================= CONFIG =================
    const DEFAULT_API_KEY = "AQ.Ab8RN6LCUvafaNit6oD8cOxGeeZhticl53Gq5FWGXlEK9l3CvQ";
    try { localStorage.removeItem('gl_api_key'); } catch (e) {}
    const MODELS = [
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (fast + smart)' },
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (fastest)' },
        { id: 'gemini-flash-latest', label: 'Gemini Flash (latest alias)' },
        { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (best quality)' },
    ];
    const RETIRED = /^gemini-(1\.|2\.)/; // old names now return 404
    const FALLBACK_ORDER = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'];
    const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
    // ==========================================

    const settings = {
        apiKey: DEFAULT_API_KEY,
        model: 'gemini-3.8-flash',
        temperature: 0.7,
    };

    const $ = (id) => document.getElementById(id);
    const chatWindow = $('chat-window');
    const chatInput = $('chat-input');
    const sendBtn = $('send-btn');
    const previewFrame = $('preview-frame');
    const previewPlaceholder = $('preview-placeholder');
    const agentCards = document.querySelectorAll('.agent-card');
    const chatbarTarget = $('chatbar-target');
    const previewViewport = $('preview-viewport');
    const previewAppTitle = $('preview-app-title');
    const errorCountBadge = $('error-count-badge');
    const consoleDrawer = $('console-drawer');
    const consoleLogs = $('console-logs');

    let activeAgent = 'architect';
    let currentBlobUrl = null;
    let lastGeneratedCode = '';
    let constellationAnimId = null;
    const histories = { architect: [], director: [], host: [] }; // per-agent memory
    const messageLogs = { architect: [], director: [], host: [] }; // per-agent rendered message history
    const buildVersions = []; // historical snapshots: [{ id, time, code, prompt, agent }]
    const MAX_HISTORY_TURNS = 14;

    // Sandbox error tracking
    const runtimeLogs = [];

    // ================= EXPERT KNOWLEDGE BASES =================
    const SHADOWS = `
SHADOWS (expert):
- CSS: layered realistic box-shadow (3-6 stacked soft layers), inset, neumorphism, neon glow, long shadows, text-shadow 3D extrude, filter: drop-shadow for PNG/SVG, SVG feDropShadow.
- Canvas 2D: shadowBlur/offset, projected silhouettes skewed along light direction, raycast visibility polygons with soft penumbra (jittered multi-sample lights), blob shadows.
- Three.js: renderer.shadowMap.enabled, PCFSoftShadowMap/VSMShadowMap, castShadow/receiveShadow, tight shadow camera frustum that follows the player, mapSize 2048-4096, tuned bias/normalBias (no acne, no peter-panning), SpotLight penumbra, PointLight cube shadows, contact shadows, SSAO/GTAO, ShadowMaterial catchers.
- GLSL: manual shadow maps, PCF/Poisson, PCSS contact-hardening, raymarched SDF soft shadows (k*h/t).
- Stylized: cel/toon steps, hatching, pixel shadows, animated day/night sun.`;

    const AUDIO = `
SOUND EFFECTS & MUSIC (expert, no external files needed):
- Use the Web Audio API. Create AudioContext lazily and resume() on the first user gesture (click/key) — show a "Click to start" overlay if audio matters.
- Procedurally synthesize SFX: explosions (filtered noise burst + low sine thump + distortion WaveShaper), gunshots (short noise + highpass + fast decay), footsteps (bandpassed noise ticks varied per surface), jumps/coins (pitch-swept oscillators), lasers (fast frequency ramp), UI clicks, engine hum (sawtooth + LFO tied to speed), wind/rain/fire ambience (looping filtered noise with slow modulation).
- Always use ADSR envelopes via gain.setValueAtTime/exponentialRampToValueAtTime to avoid clicks. Randomize pitch/volume ±5-10% per play so repeats sound natural.
- Spatial audio: PannerNode (HRTF) positioned at 3D objects; distance falloff; ConvolverNode reverb with a generated impulse response for caves/halls.
- Master gain + DynamicsCompressor, a mute toggle (M key) and volume slider. Optional procedural background music (scheduled notes with lookahead scheduler).`;

    const ANIMATION = `
ANIMATION (expert):
- Drive everything from requestAnimationFrame with delta time (clamp dt to 0.05) — never frame-dependent speeds. Use a fixed-timestep physics loop if there is physics.
- Easing (easeOutCubic, easeInOutQuad, spring/damped harmonic motion), lerp/slerp smoothing for cameras, squash & stretch, anticipation, follow-through, secondary motion, screen shake with decay, hit-stop, particles (sparks, smoke, dust, debris) with object pooling.
- CSS: transform/opacity only (GPU), @keyframes, View Transitions, staggered entrances, micro-interactions on hover/press.
- 3D: AnimationMixer for skeletal clips with crossFadeTo blending, procedural walk bob, head look-at, IK-like foot placement where possible.`;

    const REALISM = `
PHOTOREALISM (expert):
- Three.js (import map: "three": "https://unpkg.com/three@0.170.0/build/three.module.js", "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"). Use MeshStandardMaterial/MeshPhysicalMaterial (PBR: roughness, metalness, clearcoat, transmission, sheen), renderer.toneMapping = ACESFilmicToneMapping, outputColorSpace = SRGBColorSpace, physically correct light intensities.
- Image-based lighting: RoomEnvironment + PMREMGenerator for reflections. Sky addon for realistic sky, fog/FogExp2 for depth.
- Post-processing (EffectComposer): UnrealBloomPass (subtle), SSAO/GTAO, SMAA/FXAA, OutputPass, optional vignette/film grain/depth-of-field.
- Procedural textures with canvas noise (fBm) for ground, bark, rock, normal-like variation; vary color and scale so nothing looks repeated. Water with reflections/fresnel, grass via InstancedMesh with wind sway in the vertex shader.
- Real-scale world units (1 unit = 1 meter), realistic gravity (9.81), proper camera FOV (60-75).`;

    const CONTROLS = `
CONTROLS (always rich & polished):
- Keyboard: WASD + arrows, Space jump, Shift sprint, C crouch, E interact, R reload/reset, P/Esc pause menu, M mute, F fullscreen, H toggle help.
- Mouse: PointerLock for FPS look (with sensitivity setting), click to shoot/select, wheel zoom; OrbitControls with damping for viewers.
- Touch: on-screen virtual joystick + action buttons auto-shown on touch devices. Gamepad API support (left stick move, right stick look, A jump).
- Always include: a clean HUD, an on-screen controls help panel, a pause menu with settings (volume, sensitivity, graphics quality Low/Medium/High/Ultra, invert Y), and a restart button. Save settings/high scores in localStorage.`;

    const PERFORMANCE = `
PERFORMANCE & LAG ELIMINATION (CRITICAL - MUST RUN AT 60FPS WITH ZERO STUTTER ON ANY DEVICE):
- HARDWARE LIMITS: Always set renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1)). Never exceed pixel ratio 1.0!
- SCALE & SIZING MANAGER: When the user asks for a massive, gigantic, or large model (e.g., giant sun, colossal black hole, planetary system, huge robot, titan), NEVER render it overflowing or clipping the camera. Fit it neatly into view with a normalized radius (e.g. radius ~2-3 units).
- USER SIZE CONTROLS: ALWAYS provide an on-screen sleek UI control (slider or buttons in a compact glass HUD) allowing the user to adjust the model's size/scale smoothly in real-time from 0.1x to 5.0x.
- MOUSE & TOUCH ORBIT ZOOM: Enable wide mouse wheel and touch pinch zoom (OrbitControls minDistance 1.5, maxDistance 350) so the user can freely zoom deep in or far out without clipping.
- LIGHTING & SHADOWS: If creating a sun, star, or light source, ensure the sun's core mesh itself IS ALWAYS FULLY VISIBLE! Use MeshBasicMaterial or MeshStandardMaterial with high emissive intensity (emissive: 0xffaa00, emissiveIntensity: 2.0). Never rely only on invisible point lights or transparent bloom that hides the sun body!
- PARTICLES: Cap total particle count to 150 max. Do not allocate objects, arrays, or vectors in render loops.`;

    const OUTPUT_RULES = `
OUTPUT RULES:
- GREETINGS & CHAT: If the user greets you (e.g. "hello", "hi", "hey", "who are you"), reply warmly and charismatically in character with your persona, welcoming them and asking what they'd like to construct or engineer today. Do not output code for simple greetings or questions.
- 2D vs 3D BUILDING MODES:
  * If the user specifies "3D" (or by default in 3D mode): Build a rich, interactive 3D scene using Three.js with OrbitControls, proper camera framing, and lighting.
  * If the user specifies "2D": Build a high-performance 2D canvas or interactive HTML5/SVG simulation with crisp 2D physics, smooth requestAnimationFrame loops, and interactive mouse/touch controls.
- SOLAR SYSTEMS, CELESTIAL & GRAVITY EXPERIMENTS (REAL DYNAMIC N-BODY GRAVITY, INWARD BLACK HOLE PULL & MERGING):
  * INITIAL PLANET SPAWNING (MUST ALWAYS SPAWN VISIBLE ORBITING PLANETS AT START!):
    - ALWAYS spawn at least 6 to 9 distinct, colorful planets (Mercury, Venus, Earth with Moon, Mars, Jupiter with rings/belts, Saturn with rings, Uranus, Neptune, Pluto) or labeled celestial bodies at startup!
    - Position each planet at well-spaced orbital distances (e.g. radius from 8 to 45 units from the center) with visible colored PBR or glowing materials and orbital trail lines.
    - INITIAL VELOCITY: Every planet MUST start with a stable tangential orbital velocity perpendicular to its radial position:
      \`const speed = Math.sqrt((G * centerBody.mass) / dist);\`
      \`p.vx = -Math.sin(angle) * speed; p.vz = Math.cos(angle) * speed; p.vy = 0;\`
    - NEVER start planets inside or touching the center body! Planets must begin in stable, beautiful orbits.
  * DYNAMIC IN-LOOP GRAVITY ENGINE (CRITICAL - NEVER USE STATIC ORBITAL ANGLES OR STATIC ROTATIONS!):
    - Do NOT hardcode planet positions with static \`angle += speed\` or circular math (\`Math.cos(angle) * r\`)!
    - Every planet/body MUST have true velocity vectors (\`planet.vx\`, \`planet.vy\`, \`planet.vz\`) and update position via real physics forces in the render loop.
    - STAR COLLAPSE & BLACK HOLE TRANSFORMATION:
      * Provide interactive HUD controls: "Collapse into Black Hole" toggle/button, Mass slider, Gravity slider, and Time-Warp slider (0.1x to 100x).
      * While the center is a normal star/sun, it shines brightly and planets orbit stably.
      * When user collapses it or cranks up mass/gravity, it transforms into an ominous Black Hole (black sphere with glowing distortion accretion ring).
      * ONLY WHEN IT COLLAPSES OR WHEN GRAVITY IS CRANKED UP: The Black Hole actively and irresistibly pulls all planets inward toward itself along decaying spiral paths!
    - IMPLEMENT THIS EXACT PHYSICS LOOP IN YOUR CODE:
      \`\`\`js
      // Inside the animation loop:
      const dt = Math.min(clock.getDelta(), 0.05);
      const effectiveDt = dt * timeWarp; // timeWarp controlled by UI slider (0.1x to 100x)

      planets.forEach((p) => {
          if (p.devoured || !p.mesh) return;
          const dx = centerBody.position.x - p.position.x;
          const dy = centerBody.position.y - p.position.y;
          const dz = centerBody.position.z - p.position.z;
          const distSq = dx*dx + dy*dy + dz*dz + 0.01;
          const dist = Math.sqrt(distSq);

          // Standard Newtonian gravitational acceleration: a = G * M / r^2
          const G = 15.0; // Scaled simulation gravity constant
          let forceMag = (G * centerBody.mass) / distSq;

          // When center body is a Black Hole: Apply overwhelming inward gravitational pull & frame-dragging
          if (centerBody.isBlackHole) {
              // Extra inward pull inversely proportional to distance:
              forceMag += (centerBody.mass * 8.0) / (dist + 0.1);
              // Orbital decay drag: causes orbits to decay and spiral directly inward into the black hole
              p.vx *= Math.pow(0.995, effectiveDt * 60);
              p.vy *= Math.pow(0.995, effectiveDt * 60);
              p.vz *= Math.pow(0.995, effectiveDt * 60);
          }

          // Inward acceleration vectors toward the center
          p.vx += (dx / dist) * forceMag * effectiveDt;
          p.vy += (dy / dist) * forceMag * effectiveDt;
          p.vz += (dz / dist) * forceMag * effectiveDt;

          p.position.x += p.vx * effectiveDt;
          p.position.y += p.vy * effectiveDt;
          p.position.z += p.vz * effectiveDt;
          p.mesh.position.copy(p.position);

          // Collision & Accretion Merging into Black Hole:
          const horizonRadius = centerBody.horizonRadius || (centerBody.isBlackHole ? 1.5 * centerBody.scale.x : 0.8);
          if (centerBody.isBlackHole && dist <= horizonRadius) {
              p.devoured = true;
              scene.remove(p.mesh);
              // Grow black hole mass and size
              centerBody.mass += p.mass || 5;
              centerBody.scale.multiplyScalar(1.08);
              triggerAccretionBurst(p.position.clone()); // Flash particle explosion or shockwave ring!
              updateHUD(); // Reflect absorbed mass and grown event horizon
          }
      });
      \`\`\`
  * BLACK HOLE PULL, ACCRETION MERGING & REAL-TIME GROWTH:
    - The black hole MUST pull planets inward visibly until they spiral into the event horizon and are consumed!
    - When a planet hits the black hole:
      * Trigger an explosive shockwave particle burst or flash ring.
      * Remove the devoured planet.
      * Increase black hole mass and visually expand the black hole's event horizon radius and accretion disk in real time.
  * 100x TIME-WARP CONTROL:
    - ALWAYS provide a prominent UI slider in the HUD allowing the user to scrub time from 0.1x to 100x so they can immediately fast-forward the gravitational pull, see planets get pulled in, merge with the black hole, and watch the system evolve.
  * GALAXY EVOLUTION:
    - When the black hole devours planets or when galaxy mode triggers, generate hundreds of orbiting cosmic stars forming a giant swirling spiral galaxy around the supermassive black hole.
- BUILDING APPS: Output ONE complete, self-contained, runnable HTML document inside a single \`\`\`html code block. No placeholders, no "TODO", no truncated code. All JS/CSS inline.
- Before the code block, write at most 2 short sentences describing what you built and how the controls work. Nothing after the code block.
- ZERO-LAG REQUIREMENT: Every generated application MUST be ultra-lightweight, strictly targeting 60FPS with minimal CPU/GPU load.
- If the user asks to modify the previous app, return the FULL updated document with the changes applied.
- Code must run without errors: wrap audio in user gestures, and wrap localStorage in try/catch.`;

    const AGENTS = {
        architect: {
            title: "The Architect",
            role: "SYSTEMS & STRATEGY",
            tag: "3D • Physics • Engine Architecture",
            color: "#10b981",
            greeting: "Systems operational. I'm The Architect — lead engineer for 3D worlds, game physics, procedural simulations, and full engine architecture. Tell me what to construct.",
            persona: `You are THE ARCHITECT, an elite senior game & graphics engineer (AAA engine + web expert). You specialize in complete games, physics, 3D worlds, simulations, AI enemies, and robust app architecture. You prioritize gameplay feel, correct physics, clean structure, and zero bugs.`,
            suggestions: [
                "🏎 Build 3D Cyberpunk racer with Three.js",
                "🪐 Create solar system gravity simulation",
                "⚔ Make a top-down dungeon crawler with AI enemies",
                "⚡ Add realistic physics & collision engine"
            ],
            specialties: [
                { label: "🎮 Three.js Game", prompt: "Build a complete 3D action game using Three.js with player movement, collision detection, enemy logic, and scoring." },
                { label: "⚙ Physics Rig", prompt: "Implement realistic rigid body physics, velocity verlet integration, elastic bounces, and gravity." },
                { label: "👾 AI Pathfinding", prompt: "Add intelligent enemy pathfinding, state machines (patrol, chase, attack), and responsive behaviors." },
                { label: "📊 Perf Monitor", prompt: "Add an in-game telemetry HUD showing real-time FPS, draw calls, particle counts, and memory usage." }
            ],
            enhancePrefix: "As The Architect, engineer a rock-solid, high-performance architecture with zero runtime bugs: "
        },
        director: {
            title: "The Art Director",
            role: "VISUALS & IDENTITY",
            tag: "PBR • Shaders • Cinematic Lighting",
            color: "#c084fc",
            greeting: "Visuals online. I'm The Art Director — cinematic lighting, PBR materials, custom GLSL shaders, camera effects, and UI/UX styling. How can we make this look breathtaking?",
            persona: `You are THE ART DIRECTOR, a world-class technical artist and motion designer. You specialize in photorealistic rendering, cinematic lighting and shadows, shaders (GLSL), post-processing, particle VFX, UI/UX design, typography and animation. Every frame you produce should look like a premium product or film still.`,
            suggestions: [
                "✨ Upgrade lighting with bloom, shadows & fog",
                "🎨 Add custom GLSL water/fire shader effects",
                "💎 Redesign UI with sleek glassmorphism HUD",
                "🎥 Add dynamic cinematic camera transitions"
            ],
            specialties: [
                { label: "✨ Unreal Bloom & Post-FX", prompt: "Upgrade this scene with EffectComposer UnrealBloomPass, film grain, subtle chromatic aberration, and ACESFilmicToneMapping." },
                { label: "🔮 GLSL Shaders", prompt: "Inject custom animated vertex and fragment GLSL shaders with procedural simplex noise, fresnel rim lighting, and iridescent colors." },
                { label: "💎 Glassmorphism HUD", prompt: "Redesign the UI overlay into an ultra-modern glassmorphic cyber-interface with backdrop filters, neon borders, and smooth micro-interactions." },
                { label: "🌌 Dynamic Skybox & Fog", prompt: "Implement volumetric exponential distance fog, celestial gradient lighting, and star dust particle fields." }
            ],
            enhancePrefix: "As The Art Director, render breathtaking cinema-grade visuals, PBR textures, and artistic lighting: "
        },
        host: {
            title: "The Host",
            role: "VOICE & PERSONA",
            tag: "Procedural Audio • Haptics • Interaction",
            color: "#38bdf8",
            greeting: "Audio synthesizer and interaction matrix active. I'm The Host — procedural Web Audio soundscapes, reactive music, voice synthesis, and multi-modal controls. What experience are we designing?",
            persona: `You are THE HOST, an expert sound designer and interaction/experience designer. You specialize in procedural Web Audio sound effects, music, spatial 3D audio, speech (Web Speech API speechSynthesis / SpeechRecognition), haptics (navigator.vibrate), and intuitive controls across keyboard, mouse, touch and gamepad. You also make everything look polished.`,
            suggestions: [
                "🔊 Add procedural synthesizer engine & SFX",
                "🎮 Implement gamepad & mobile touch joystick",
                "🗣 Enable voice command speech recognition",
                "🎶 Add dynamic procedural synthwave soundtrack"
            ],
            specialties: [
                { label: "🎹 Procedural Synthwave", prompt: "Synthesize an interactive procedural multi-track synthwave track with Web Audio oscillators, lowpass filters, and chord arpeggiators." },
                { label: "💥 Juicy Web Audio SFX", prompt: "Add custom procedural sound effects for clicks, impacts, lasers, sweeps, and explosions using frequency ramps and noise buffers." },
                { label: "🕹 Mobile Touch Joysticks", prompt: "Implement responsive dual-analog on-screen touch virtual joysticks and gamepad button bindings." },
                { label: "🗣 Speech & Voice FX", prompt: "Integrate Web Speech API voice announcements, interactive sound haptics, and custom acoustic feedback." }
            ],
            enhancePrefix: "As The Host, integrate rich procedural Web Audio soundscapes, intuitive controls, and tactile feedback: "
        },
    };

    function buildSystemInstruction(agentKey, isCollab = false) {
        let agentPrompt = AGENTS[agentKey].persona;
        if (isCollab) {
            agentPrompt += `\nCOLLABORATION MODE ACTIVATED: You are collaborating with the other Ghostline agents (The Architect, The Art Director, The Host). Deliver a masterclass build integrating top-tier architecture, cinematic visuals, and procedural audio.`;
        }
        return [agentPrompt, SHADOWS, AUDIO, ANIMATION, REALISM, CONTROLS, PERFORMANCE, OUTPUT_RULES].join('\n');
    }

    // ================= CHAT UI & AGENT SWITCHER =================
    function renderAgentChatHistory(agentKey) {
        chatWindow.innerHTML = '';
        const list = messageLogs[agentKey] || [];
        list.forEach(item => {
            appendMessageToDom(item.text, item.sender, item.agentName, item.time);
        });
        updateTabBadges();
    }

    function updateTabBadges() {
        ['architect', 'director', 'host'].forEach(key => {
            const badge = $(`badge-${key}`);
            if (badge) {
                badge.textContent = (messageLogs[key] || []).filter(m => m.sender === 'user').length;
            }
        });
    }

    function appendMessageToDom(text, sender, agentName = 'SYSTEM', timestamp = null) {
        const timeStr = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msgDiv = document.createElement('div');
        if (sender === 'system') {
            msgDiv.className = 'system-notice';
            msgDiv.textContent = text;
        } else {
            msgDiv.className = sender === 'user' ? 'message user-message' : 'message';
            const header = document.createElement('div');
            header.className = 'message-header';
            
            const tag = document.createElement('div');
            tag.className = 'msg-agent-tag';

            let color = '#3b82f6';
            let icon = '⚡';
            if (sender === 'user') {
                tag.textContent = 'OPERATOR';
                tag.style.color = '#93c5fd';
            } else {
                if (agentName.includes('Director')) { color = '#c084fc'; icon = '✦'; }
                else if (agentName.includes('Host')) { color = '#38bdf8'; icon = '🎙'; }
                else { color = '#10b981'; icon = '⚡'; }
                tag.innerHTML = `<span>${icon}</span> <span>${agentName.toUpperCase()}</span>`;
                tag.style.color = color;
            }

            const timeSpan = document.createElement('span');
            timeSpan.className = 'msg-time';
            timeSpan.textContent = timeStr;

            header.append(tag, timeSpan);

            const body = document.createElement('div');
            body.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
            body.textContent = text;

            msgDiv.append(header, body);
        }
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return msgDiv;
    }

    function appendMessage(text, sender, agentName = 'SYSTEM') {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (sender !== 'system') {
            messageLogs[activeAgent].push({ text, sender, agentName, time: timeStr });
        }
        const el = appendMessageToDom(text, sender, agentName, timeStr);
        updateTabBadges();
        return el;
    }

    function switchAgent(targetKey) {
        if (!AGENTS[targetKey]) return;
        activeAgent = targetKey;
        const agentObj = AGENTS[targetKey];

        // Update Agent Cards
        agentCards.forEach(c => {
            const isMatch = c.getAttribute('data-agent') === targetKey;
            c.classList.toggle('active', isMatch);
            const statusEl = c.querySelector('.agent-status');
            if (statusEl) {
                statusEl.innerHTML = isMatch 
                    ? '<span class="dot online"></span> ONLINE' 
                    : '<span class="dot offline"></span> STANDBY';
            }
        });

        // Update Chat Tabs
        document.querySelectorAll('.chat-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-agent-tab') === targetKey);
        });

        // Morph and re-render the Chatbar for the selected agent
        const chatbar = $('chatbar-wrapper');
        if (chatbar) {
            // Apply theme classes
            chatbar.classList.remove('theme-architect', 'theme-director', 'theme-host');
            chatbar.classList.add(`theme-${targetKey}`);
            
            // Trigger dynamic appearance animation
            chatbar.classList.remove('agent-switch-anim');
            void chatbar.offsetWidth; // trigger reflow
            chatbar.classList.add('agent-switch-anim');
        }

        // Update Chatbar target title & placeholder
        if (chatbarTarget) {
            chatbarTarget.innerHTML = `
                <span class="target-indicator" style="background:${agentObj.color};box-shadow:0 0 10px ${agentObj.color}"></span>
                <span class="target-name">${agentObj.title} Channel</span>
            `;
        }
        chatInput.placeholder = `Command ${agentObj.title}... [${agentObj.role}]`;

        // Render this agent's history or welcome greeting
        if (!messageLogs[targetKey] || messageLogs[targetKey].length === 0) {
            messageLogs[targetKey] = [];
            appendMessage(agentObj.greeting, 'ai', agentObj.title);
        } else {
            renderAgentChatHistory(targetKey);
        }

        chatInput.focus();
    }

    agentCards.forEach(card => card.addEventListener('click', () => {
        const key = card.getAttribute('data-agent');
        switchAgent(key);
    }));

    document.querySelectorAll('.chat-tab').forEach(tab => tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-agent-tab');
        switchAgent(key);
    }));

    // Auto-expand textarea
    function adjustTextareaHeight() {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    }
    chatInput.addEventListener('input', adjustTextareaHeight);

    // Voice recognition (Speech-to-text) support
    let recognition = null;
    let isRecording = false;
    const btnMic = $('btn-mic');
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
        const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechClass();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + transcript;
            adjustTextareaHeight();
        };
        recognition.onend = () => {
            isRecording = false;
            btnMic.classList.remove('recording');
        };
        recognition.onerror = () => {
            isRecording = false;
            btnMic.classList.remove('recording');
        };

        btnMic?.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                    isRecording = true;
                    btnMic.classList.add('recording');
                } catch (e) {
                    // Ignore start error
                }
            }
        });
    } else {
        if (btnMic) btnMic.title = 'Speech recognition not supported in this browser';
    }

    // Clear current agent chat
    $('btn-clear-agent-chat')?.addEventListener('click', () => {
        histories[activeAgent] = [];
        messageLogs[activeAgent] = [];
        chatWindow.innerHTML = '';
        appendMessage(`${AGENTS[activeAgent].title} chat history cleared.`, 'system');
        updateTabBadges();
    });

    // Collab Mode
    let isCollabMode = false;
    $('btn-agent-collab')?.addEventListener('click', () => {
        isCollabMode = !isCollabMode;
        const btn = $('btn-agent-collab');
        const chatbar = $('chatbar-wrapper');
        if (isCollabMode) {
            btn.classList.add('primary');
            btn.textContent = '⚡ Collab [ACTIVE]';
            if (chatbar) chatbar.classList.add('theme-collab');
            appendMessage('⚡ Multi-Agent Collaboration Active: All 3 agents will synchronize graphics, audio, and physics.', 'system');
        } else {
            btn.classList.remove('primary');
            btn.textContent = '⚡ Collab Mode';
            if (chatbar) {
                chatbar.classList.remove('theme-collab');
                chatbar.classList.add(`theme-${activeAgent}`);
            }
            appendMessage('Collaboration mode deactivated. Individual agent responding.', 'system');
        }
    });

    // Auto-Fix errors in the current preview using the active agent
    $('btn-fix-last')?.addEventListener('click', () => {
        if (!lastGeneratedCode) {
            appendMessage('No application generated yet to fix.', 'system');
            return;
        }
        const recentErrors = runtimeLogs.filter(l => l.level === 'error').slice(-5).map(l => l.text);
        let fixPrompt = `Please diagnose and fix any bugs in the current application. Ensure it runs cleanly with zero console errors.`;
        if (recentErrors.length > 0) {
            fixPrompt += `\nRecent runtime errors recorded in preview sandbox:\n${recentErrors.join('\n')}`;
        }
        chatInput.value = fixPrompt;
        adjustTextareaHeight();
        sendMessage();
    });

    // Supercharge / Enhance prompt button
    $('btn-enhance-prompt')?.addEventListener('click', () => {
        const raw = chatInput.value.trim();
        const agentObj = AGENTS[activeAgent];
        if (!raw) {
            chatInput.value = "Create a complete, interactive 3D web experience";
        } else {
            const prefix = agentObj.enhancePrefix || `As ${agentObj.title}: `;
            if (!chatInput.value.includes(prefix)) {
                chatInput.value = `${prefix}${raw} with realistic shadows, procedural Web Audio SFX, responsive controls, smooth animations, and zero bugs.`;
            }
        }
        adjustTextareaHeight();
        chatInput.focus();
    });


    // ================= PREVIEW & SANDBOX LOGS =================
    function instrumentCodeWithLogger(rawHtml) {
        // Injects an error & console catcher into the sandbox code so the deck console can display it
        const injectScript = `
        <script>
        (function() {
            function sendDeck(type, args) {
                try {
                    var msg = Array.prototype.slice.call(args).map(function(a) {
                        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                        catch(e) { return String(a); }
                    }).join(' ');
                    window.parent.postMessage({ type: 'GHOSTLINE_LOG', level: type, text: msg }, '*');
                } catch(e) {}
            }
            var _err = console.error;
            console.error = function() { sendDeck('error', arguments); _err.apply(console, arguments); };
            var _warn = console.warn;
            console.warn = function() { sendDeck('warn', arguments); _warn.apply(console, arguments); };
            var _log = console.log;
            console.log = function() { sendDeck('info', arguments); _log.apply(console, arguments); };
            window.addEventListener('error', function(e) {
                sendDeck('error', [e.message + ' (' + (e.filename || 'sandbox') + ':' + e.lineno + ')']);
            });
            window.addEventListener('unhandledrejection', function(e) {
                sendDeck('error', ['Unhandled Promise Rejection: ' + (e.reason ? e.reason.message || e.reason : 'unknown')]);
            });
        })();
        <\/script>
        `;
        if (/<head>/i.test(rawHtml)) {
            return rawHtml.replace(/<head>/i, '<head>' + injectScript);
        }
        return injectScript + rawHtml;
    }

    function addConsoleLog(level, text) {
        runtimeLogs.push({ level, text, time: new Date().toLocaleTimeString() });
        const emptyEl = consoleLogs.querySelector('.console-log-empty');
        if (emptyEl) emptyEl.remove();

        const row = document.createElement('div');
        row.className = `console-log-item log-${level}`;
        row.innerHTML = `<span style="opacity:0.4;">[${new Date().toLocaleTimeString()}]</span> <strong>[${level.toUpperCase()}]</strong> <span>${escapeHtml(text)}</span>`;
        consoleLogs.appendChild(row);
        consoleLogs.scrollTop = consoleLogs.scrollHeight;

        const errCount = runtimeLogs.filter(l => l.level === 'error').length;
        if (errorCountBadge) {
            errorCountBadge.textContent = errCount;
            errorCountBadge.className = errCount > 0 ? 'badge-err' : 'badge-zero';
        }
    }

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GHOSTLINE_LOG') {
            addConsoleLog(event.data.level, event.data.text);
        }
    });

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function loadPreview(code, appTitle = "Generated Application") {
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        
        // Stop background constellation animation completely to ensure zero CPU/GPU overhead
        if (constellationAnimId) {
            cancelAnimationFrame(constellationAnimId);
            constellationAnimId = null;
        }
        if (starCanvas) starCanvas.style.display = 'none';

        // Instrument code with error reporter
        const instrumented = instrumentCodeWithLogger(code);
        currentBlobUrl = URL.createObjectURL(new Blob([instrumented], { type: 'text/html' }));
        previewPlaceholder.style.display = 'none';
        previewFrame.classList.remove('hidden-frame');
        previewFrame.style.display = 'block';
        previewFrame.src = currentBlobUrl;
        document.body.classList.add('previewing');
        zoomBar.style.display = 'flex';
        applyZoom();
        previewFrame.focus();

        if (previewAppTitle) {
            previewAppTitle.textContent = appTitle;
        }

        // Save into version history
        buildVersions.unshift({
            id: buildVersions.length + 1,
            time: new Date().toLocaleTimeString(),
            title: appTitle,
            code: code,
            agent: activeAgent
        });
    }

    // Console drawer toggle
    $('btn-inspect-errors')?.addEventListener('click', () => {
        consoleDrawer.classList.toggle('closed');
    });
    $('btn-close-console')?.addEventListener('click', () => {
        consoleDrawer.classList.add('closed');
    });

    // Refresh preview
    $('btn-refresh-preview')?.addEventListener('click', () => {
        if (lastGeneratedCode) loadPreview(lastGeneratedCode, previewAppTitle.textContent);
    });

    // Open in new window
    $('btn-new-tab')?.addEventListener('click', () => {
        if (!lastGeneratedCode) return appendMessage('No app generated yet.', 'system');
        const win = window.open();
        if (win) {
            win.document.open();
            win.document.write(lastGeneratedCode);
            win.document.close();
        }
    });

    // Device switcher simulation
    const deviceButtons = document.querySelectorAll('.device-btn');
    deviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            deviceButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const dev = btn.getAttribute('data-device');
            previewViewport.classList.remove('device-desktop', 'device-tablet', 'device-mobile');
            if (dev !== 'full') {
                previewViewport.classList.add(`device-${dev}`);
            }
        });
    });

    // Starter prompts in empty state
    document.querySelectorAll('.starter-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            chatInput.value = prompt;
            adjustTextareaHeight();
            sendMessage();
        });
    });

    // Low-power detection
    const isWeakDevice = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ||
        matchMedia('(pointer:coarse)').matches;
    if (isWeakDevice) document.body.classList.add('low-power');

    // ================= PREVIEW ZOOM (EXTREME WIDE RANGE 0.1x - 6.0x) =================
    const ZOOM_MIN = 0.1, ZOOM_MAX = 6.0;
    let zoom = parseFloat(localStorage.getItem('gl_zoom')) || 1;
    const previewArea = previewFrame.parentElement;
    const zoomBar = document.createElement('div');
    zoomBar.className = 'zoom-bar';
    zoomBar.style.display = 'none';
    zoomBar.innerHTML = `
        <button type="button" id="zoom-out" title="Zoom out (Ctrl -)" aria-label="Zoom out">−</button>
        <input type="range" id="zoom-slider" min="${ZOOM_MIN * 100}" max="${ZOOM_MAX * 100}" step="2" aria-label="Zoom level">
        <button type="button" id="zoom-in" title="Zoom in (Ctrl +)" aria-label="Zoom in">+</button>
        <span class="zoom-val" id="zoom-val" title="Reset to 100% (Ctrl 0)"></span>
        <button type="button" id="zoom-fit" title="Fit desktop size into view">FIT</button>
        <button type="button" id="zoom-full" title="Fullscreen preview" aria-label="Fullscreen">⛶</button>`;
    previewArea.appendChild(zoomBar);

    function applyZoom() {
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
        previewFrame.style.width = `${100 / zoom}%`;
        previewFrame.style.height = `${100 / zoom}%`;
        previewFrame.style.transform = zoom === 1 ? 'none' : `scale(${zoom})`;
        $('zoom-val').textContent = `${Math.round(zoom * 100)}%`;
        $('zoom-slider').value = Math.round(zoom * 100);
        localStorage.setItem('gl_zoom', String(zoom));
    }
    const setZoom = (z) => { zoom = z; applyZoom(); };

    $('zoom-in').addEventListener('click', () => setZoom(zoom * 1.1));
    $('zoom-out').addEventListener('click', () => setZoom(zoom / 1.1));
    $('zoom-val').addEventListener('click', () => setZoom(1));
    $('zoom-slider').addEventListener('input', (e) => setZoom(e.target.value / 100));
    $('zoom-fit').addEventListener('click', () => setZoom(Math.min(1, previewArea.clientWidth / 1280)));
    $('zoom-full').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else previewArea.requestFullscreen?.().catch(() => {});
    });

    previewArea.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || zoomBar.style.display === 'none') return;
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom * 1.1); }
        else if (e.key === '-') { e.preventDefault(); setZoom(zoom / 1.1); }
        else if (e.key === '0') { e.preventDefault(); setZoom(1); }
    });

    function extractHtml(text) {
        const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (fenced && /<(html|!doctype|body|canvas|script|div)/i.test(fenced[1])) return fenced[1].trim();
        const raw = text.match(/<!DOCTYPE html[\s\S]*<\/html>/i) || text.match(/<html[\s\S]*<\/html>/i);
        return raw ? raw[0] : null;
    }

    // ================= GEMINI API ENGINE =================
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function callGemini(model, contents, agentKey, signal) {
        for (let attempt = 0; ; attempt++) {
            try {
                return await callGeminiOnce(model, contents, agentKey, signal);
            } catch (e) {
                if (e.status !== 503 || attempt >= 2 || signal.aborted) throw e;
                await sleep(2000 * (attempt + 1));
            }
        }
    }

    async function callGeminiOnce(model, contents, agentKey, signal) {
        const payload = {
            systemInstruction: { parts: [{ text: buildSystemInstruction(agentKey, isCollabMode) }] },
            contents,
            generationConfig: { temperature: settings.temperature, maxOutputTokens: 65536 },
        };

        const res = await fetch(`${API_BASE}/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error?.message || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
        if (!text) throw new Error(`Empty response (${data.candidates?.[0]?.finishReason || 'unknown reason'}).`);
        return { text, truncated: data.candidates?.[0]?.finishReason === 'MAX_TOKENS' };
    }

    let discoveredModels = null;
    async function discoverModels() {
        if (discoveredModels) return discoveredModels;
        const res = await fetch(`${API_BASE}?pageSize=1000&key=${encodeURIComponent(settings.apiKey)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`ListModels failed (${res.status}): ${data.error?.message || ''}`);
        const score = (id) => (/flash/.test(id) ? 0 : /pro/.test(id) ? 1 : 2) + (/lite/.test(id) ? 0.5 : 0) + (/preview|exp/.test(id) ? 0.2 : 0);
        discoveredModels = (data.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''))
            .filter(id => /^gemini/.test(id) && !/(tts|image|audio|live|embedding|vision)/.test(id))
            .sort((a, b) => score(a) - score(b) || b.localeCompare(a, undefined, { numeric: true }));
        return discoveredModels;
    }

    let abortCtrl = null;

    async function sendMessage(overrideText = null, overrideDimension = null) {
        const userText = (overrideText || chatInput.value).trim();
        if (!userText) return;
        const agentName = AGENTS[activeAgent].title;
        const agentKey = activeAgent;

        const isBuildRequest = /\b(build|make|create|generate|code|simulate|design|model)\b/i.test(userText);
        const hasDimensionExplicit = /\b(2d|3d|two dimensional|three dimensional)\b/i.test(userText);

        // If the user asks to build something without specifying 2D or 3D, ask them to pick:
        if (isBuildRequest && !hasDimensionExplicit && !overrideDimension) {
            appendMessage(userText, 'user');
            chatInput.value = '';
            adjustTextareaHeight();

            // Host/Agent asks: 2D or 3D?
            const promptMsg = appendMessage(`Would you like to build "${userText}" in 2D or 3D? Click below to generate:`, 'ai', agentName);
            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
            btnGroup.innerHTML = `
                <button type="button" class="blue-btn" style="padding:6px 14px;font-size:11px;cursor:pointer;">⚡ 3D Dimensional</button>
                <button type="button" class="outline-btn" style="padding:6px 14px;font-size:11px;cursor:pointer;">🎨 2D Dimensional</button>
            `;
            const [btn3D, btn2D] = btnGroup.querySelectorAll('button');
            btn3D.addEventListener('click', () => {
                btnGroup.remove();
                sendMessage(`${userText} in 3D dimensional format`, '3D');
            });
            btn2D.addEventListener('click', () => {
                btnGroup.remove();
                sendMessage(`${userText} in 2D dimensional canvas format`, '2D');
            });
            promptMsg.appendChild(btnGroup);
            return;
        }

        appendMessage(userText, 'user');
        chatInput.value = '';
        adjustTextareaHeight();

        const userContent = lastGeneratedCode
            ? `${userText}\n\n[Current app in preview — modify it if my request refers to it, otherwise ignore]\n\`\`\`html\n${lastGeneratedCode}\n\`\`\``
            : userText;

        const history = histories[agentKey];
        const contents = [...history, { role: 'user', parts: [{ text: userContent }] }];

        setBusy(true);
        const notice = appendMessage(`Working...`, 'system');
        abortCtrl = new AbortController();

        const models = [settings.model, ...FALLBACK_ORDER.filter(m => m !== settings.model)];
        try {
            let result, usedModel;
            const failures = [];
            for (const m of models) {
                try {
                    result = await callGemini(m, contents, agentKey, abortCtrl.signal);
                    usedModel = m;
                    break;
                } catch (e) {
                    if (e.name === 'AbortError') throw e;
                    if (![404, 429, 500, 503].includes(e.status)) {
                        throw new Error(`${m} (${e.status || 'network'}): ${e.message}` +
                            ([400, 401, 403].includes(e.status) ? '\n→ Your API key was rejected. Re-copy it from aistudio.google.com/apikey into ⚙ SETTINGS.' : ''));
                    }
                    failures.push(`• ${m} (${e.status}): ${e.message}`);
                    notice.textContent = `Working...`;
                }
            }
            if (!result) {
                notice.textContent = 'Working...';
                const available = (await discoverModels().catch(() => [])).filter(m => !models.includes(m) && !/omni/.test(m)).slice(0, 4);
                for (const m of available) {
                    try {
                        result = await callGemini(m, contents, agentKey, abortCtrl.signal);
                        usedModel = m;
                        settings.model = m;
                        localStorage.setItem('gl_model', m);
                        break;
                    } catch (e) {
                        if (e.name === 'AbortError') throw e;
                        failures.push(`• ${m} (${e.status}): ${e.message}`);
                    }
                }
                if (!available.length) failures.push('• No other Gemini text models found for this key.');
            }
            if (!result) {
                const quota = failures.some(f => f.includes('(429)'));
                const busy = failures.some(f => f.includes('(503)'));
                throw new Error('All models failed:\n' + failures.join('\n') +
                    (busy ? '\n→ Google\'s servers are overloaded right now (503). Try again in a minute.' : '') +
                    (quota ? '\n→ Some models have no free quota on your key (429). Enable billing in Google AI Studio to use them.' : ''));
            }
            notice.remove();

            history.push({ role: 'user', parts: [{ text: userText }] });
            const code = extractHtml(result.text);
            history.push({ role: 'model', parts: [{ text: code ? result.text.replace(/```[\s\S]*?```/g, '[generated app code]') : result.text }] });
            if (history.length > MAX_HISTORY_TURNS * 2) history.splice(0, history.length - MAX_HISTORY_TURNS * 2);

            if (code) {
                lastGeneratedCode = code;
                const shortTitle = userText.slice(0, 32) + (userText.length > 32 ? '...' : '');
                loadPreview(code, shortTitle);
                const summary = result.text.split(/```/)[0].trim();
                appendMessage(`${summary || 'App generated.'}\n\n✔ Loaded in preview. Click PUBLISH to export.`, 'ai', agentName);
            } else {
                appendMessage(result.text, 'ai', agentName);
            }
        } catch (err) {
            notice.remove();
            appendMessage(err.name === 'AbortError' ? 'Request cancelled.' : `System Error: ${err.message}`, 'ai', agentName);
        } finally {
            setBusy(false);
        }
    }

    function setBusy(busy) {
        chatInput.disabled = busy;
        const btnText = sendBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = busy ? 'STOP' : 'SEND';
        sendBtn.classList.toggle('busy-mode', busy);
        if (!busy) { 
            abortCtrl = null; 
            chatInput.focus(); 
        }
    }

    sendBtn.addEventListener('click', () => (abortCtrl ? abortCtrl.abort() : sendMessage()));
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !abortCtrl) {
            e.preventDefault();
            sendMessage();
        }
    });

    // ================= PUBLISH & CODE EXPORT =================
    function triggerDownload(content, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type: 'text/html' }));
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    $('btn-publish')?.addEventListener('click', () => {
        if (!lastGeneratedCode) return appendMessage('Nothing to publish yet — generate an app first.', 'system');
        triggerDownload(lastGeneratedCode, 'ghostline-app.html');
        appendMessage('✔ Application exported as standalone ghostline-app.html', 'system');
    });

    // ================= HIGH-PERFORMANCE 60FPS SHINING CONSTELLATION =================
    const starCanvas = $('preview-stars-canvas');
    if (starCanvas) {
        const ctx = starCanvas.getContext('2d', { alpha: false });
        let width = starCanvas.width = starCanvas.offsetWidth || 800;
        let height = starCanvas.height = starCanvas.offsetHeight || 600;

        // Adaptive count based on device power & screen size (never lags on mobile or low-end PCs)
        const isLowEnd = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 4;
        const STAR_COUNT = isLowEnd ? 45 : 70;
        const CONNECT_DIST = 105;
        const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;
        const stars = [];

        // Pre-render a tiny, blazing-fast radiant star sprite offscreen (avoids creating gradients per frame)
        const spriteSize = 32;
        const starSprite = document.createElement('canvas');
        starSprite.width = spriteSize;
        starSprite.height = spriteSize;
        const sCtx = starSprite.getContext('2d');
        const half = spriteSize / 2;
        const spriteGrad = sCtx.createRadialGradient(half, half, 0, half, half, half);
        spriteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        spriteGrad.addColorStop(0.2, 'rgba(199, 210, 254, 0.9)');
        spriteGrad.addColorStop(0.5, 'rgba(129, 140, 248, 0.4)');
        spriteGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        sCtx.fillStyle = spriteGrad;
        sCtx.beginPath();
        sCtx.arc(half, half, half, 0, Math.PI * 2);
        sCtx.fill();

        for (let i = 0; i < STAR_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.2 + 0.08;
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                baseSize: Math.random() * 6 + 10,
                pulseSpeed: Math.random() * 0.003 + 0.002,
                phase: Math.random() * Math.PI * 2
            });
        }

        let resizeTimeout;
        function resizeStars() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (!starCanvas) return;
                width = starCanvas.width = starCanvas.offsetWidth;
                height = starCanvas.height = starCanvas.offsetHeight;
            }, 100);
        }
        window.addEventListener('resize', resizeStars);

        let lastTime = performance.now();

        function animateConstellation(now) {
            // Completely pause when hidden or when app is in preview (zero CPU/battery waste)
            if (document.hidden || (previewFrame && !previewFrame.classList.contains('hidden-frame') && previewFrame.style.display !== 'none')) {
                requestAnimationFrame(animateConstellation);
                return;
            }

            const dt = Math.min((now - lastTime) / 16.67, 2); // clamped delta time
            lastTime = now;

            // Fill dark backdrop directly (alpha: false for max hardware acceleration)
            ctx.fillStyle = '#060911';
            ctx.fillRect(0, 0, width, height);

            // 1. Batch draw all shining constellation lines in a single stroke call
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(147, 161, 255, 0.22)';
            ctx.lineWidth = 0.75;
            for (let i = 0; i < STAR_COUNT; i++) {
                const s1 = stars[i];
                for (let j = i + 1; j < STAR_COUNT; j++) {
                    const s2 = stars[j];
                    const dx = s1.x - s2.x;
                    const dy = s1.y - s2.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < CONNECT_DIST_SQ) {
                        ctx.moveTo(s1.x, s1.y);
                        ctx.lineTo(s2.x, s2.y);
                    }
                }
            }
            ctx.stroke();

            // 2. Render all shining stars using GPU pre-rendered sprite
            for (let i = 0; i < STAR_COUNT; i++) {
                const s = stars[i];
                s.x += s.vx * dt;
                s.y += s.vy * dt;

                if (s.x < 0) s.x = width;
                else if (s.x > width) s.x = 0;
                if (s.y < 0) s.y = height;
                else if (s.y > height) s.y = 0;

                const shimmer = Math.sin(now * s.pulseSpeed + s.phase) * 0.35 + 0.85;
                const renderSize = s.baseSize * shimmer;
                const offset = renderSize / 2;

                ctx.globalAlpha = Math.min(1, 0.6 + shimmer * 0.35);
                ctx.drawImage(starSprite, s.x - offset, s.y - offset, renderSize, renderSize);
            }
            ctx.globalAlpha = 1.0;

            constellationAnimId = requestAnimationFrame(animateConstellation);
        }
        constellationAnimId = requestAnimationFrame(animateConstellation);
    }

    // ================= GENERATED CODE VIEWER (RESTRICTED TO USER-REQUESTED CODE ONLY) =================
    const codeModalBg = $('code-modal-bg');
    const codeViewContent = $('code-view-content');
    const fileTabs = document.querySelectorAll('.file-tab');
    let currentSelectedFile = 'generated';

    async function loadFileContent(fileKey) {
        currentSelectedFile = 'generated';
        // Security & IP Protection: Never expose app.js, index.html, styles.css, or server.js.
        // Only return the code generated from the user's prompts.
        return lastGeneratedCode || '<!-- No code generated yet. Ask an agent in Normal Preview mode to build an app, simulation, or game! -->';
    }

    async function displayFile(fileKey) {
        fileTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-file') === 'generated'));
        if (codeViewContent) {
            const code = await loadFileContent('generated');
            codeViewContent.textContent = code;
        }
    }

    fileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            displayFile('generated');
        });
    });

    $('btn-export-code')?.addEventListener('click', () => {
        if (codeModalBg) {
            codeModalBg.classList.add('open');
            displayFile('generated');
        }
    });

    $('btn-close-code-modal')?.addEventListener('click', () => {
        if (codeModalBg) codeModalBg.classList.remove('open');
    });

    codeModalBg?.addEventListener('click', (e) => {
        if (e.target === codeModalBg) codeModalBg.classList.remove('open');
    });

    $('btn-copy-code')?.addEventListener('click', () => {
        if (!lastGeneratedCode) {
            appendMessage('No generated code available to copy yet. Ask for code first!', 'system');
            return;
        }
        if (codeViewContent) {
            navigator.clipboard.writeText(lastGeneratedCode).then(() => {
                appendMessage('✔ Copied your generated code to clipboard.', 'system');
            }).catch(() => {
                appendMessage('Failed to copy to clipboard.', 'system');
            });
        }
    });

    $('btn-download-code-modal')?.addEventListener('click', () => {
        if (!lastGeneratedCode) {
            appendMessage('No generated code available to download yet. Ask for code first!', 'system');
            return;
        }
        triggerDownload(lastGeneratedCode, 'generated-code.html');
        appendMessage('✔ Downloaded your generated code (generated-code.html).', 'system');
    });

    // ================= WORKSPACE MODE SWITCHER (1: NORMAL PREVIEW vs 2: PURE Q&A CHAT) =================
    const modeBtnPreview = $('mode-btn-preview');
    const modeBtnQa = $('mode-btn-qa');
    const leftSidebar = document.querySelector('.left-sidebar');
    const rightPreviewPanel = $('right-preview-panel');
    const qaChatPanel = $('qa-chat-panel');
    const btnExportCode = $('btn-export-code');
    const btnPublish = $('btn-publish');
    let currentWorkspaceMode = 'preview';

    function switchWorkspaceMode(mode) {
        currentWorkspaceMode = mode;
        const isQa = mode === 'qa';
        modeBtnPreview?.classList.toggle('active', !isQa);
        modeBtnQa?.classList.toggle('active', isQa);

        if (isQa) {
            leftSidebar?.classList.add('hidden-panel');
            rightPreviewPanel?.classList.add('hidden-panel');
            qaChatPanel?.classList.remove('hidden-panel');
            if (btnExportCode) btnExportCode.style.display = 'none';
            if (btnPublish) btnPublish.style.display = 'none';
            $('qa-chat-input')?.focus();
        } else {
            leftSidebar?.classList.remove('hidden-panel');
            rightPreviewPanel?.classList.remove('hidden-panel');
            qaChatPanel?.classList.add('hidden-panel');
            if (btnExportCode) btnExportCode.style.display = '';
            if (btnPublish) btnPublish.style.display = '';
            chatInput?.focus();
        }
    }

    modeBtnPreview?.addEventListener('click', () => switchWorkspaceMode('preview'));
    modeBtnQa?.addEventListener('click', () => switchWorkspaceMode('qa'));

    // ================= 2ND MODE: PURE Q&A CHAT (CHATGPT + GEMINI + CLAUDE AI KNOWLEDGE MIX) =================
    const qaChatWindow = $('qa-chat-window');
    const qaChatInput = $('qa-chat-input');
    const qaSendBtn = $('qa-send-btn');
    const qaHistory = [];
    let qaAbortCtrl = null;

    const QA_TRINITY_SYSTEM_INSTRUCTION = `You are TRINITY AI OMNI-MIND — an elite unified intelligence combining the core strengths of three frontier AI architectures:
1. ChatGPT (OpenAI GPT-4o): Structured analytical reasoning, step-by-step problem breakdown, clear formatting, and practical intuition.
2. Google Gemini (DeepMind): Broad real-world encyclopedic synthesis, scientific accuracy, deep cross-domain connections, and multi-perspective verification.
3. Claude AI (Anthropic Claude 3.5 Sonnet): Nuanced articulation, intellectual honesty, crystal-clear explanations, and thoughtful depth.

STRICT Q&A MODE RULES (RESPONSE ONLY — NO CODE BLOCKS OR APP PREVIEWS):
- This channel is strictly a Question & Answer knowledge chat. You can ONLY answer questions and provide explanations, insights, analysis, and advice.
- NEVER output runnable HTML apps, code blocks, scripts, or anything other than a direct conversational response.
- If the user asks you to build an app, game, or write code, politely inform them: "This is the Q&A Knowledge Chat (Response-Only Mode). To generate or download runnable code and live previews, switch to '1. Normal Preview' at the top!"
- Structure your answers clearly using clean bullet points or numbered steps when helpful, synthesizing the best of ChatGPT, Gemini, and Claude AI in one cohesive, authoritative response.`;

    function appendQaMessage(text, sender) {
        if (!qaChatWindow) return null;
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msgDiv = document.createElement('div');
        msgDiv.className = `qa-msg ${sender === 'user' ? 'qa-user' : 'qa-ai'}`;

        const header = document.createElement('div');
        header.className = 'qa-msg-header';

        const tag = document.createElement('div');
        if (sender === 'user') {
            tag.textContent = 'YOU (QUESTION)';
            tag.style.color = '#e0e7ff';
        } else {
            tag.className = 'qa-fusion-tag';
            tag.innerHTML = '<span>🧠</span> <span>CHATGPT + GEMINI + CLAUDE AI MIX</span>';
        }

        const timeSpan = document.createElement('span');
        timeSpan.style.cssText = 'font-size:10px;opacity:0.65;font-weight:normal;';
        timeSpan.textContent = timeStr;

        header.append(tag, timeSpan);

        const body = document.createElement('div');
        body.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
        body.textContent = text;

        msgDiv.append(header, body);
        qaChatWindow.appendChild(msgDiv);
        qaChatWindow.scrollTop = qaChatWindow.scrollHeight;
        return msgDiv;
    }

    function initQaGreeting() {
        if (!qaChatWindow) return;
        qaChatWindow.innerHTML = '';
        appendQaMessage(
            "Welcome to Trinity AI Omni-Chat (Pure Q&A Mode).\n\nI fuse the structured logic of ChatGPT, the deep knowledge synthesis of Google Gemini, and the nuanced clarity of Anthropic Claude AI.\n\nAsk me any question — science, strategy, math, history, philosophy, or concepts. (Note: This mode outputs direct answers only, with no code generation or sandbox preview.)",
            'ai'
        );
    }
    initQaGreeting();

    function adjustQaTextarea() {
        if (!qaChatInput) return;
        qaChatInput.style.height = 'auto';
        qaChatInput.style.height = Math.min(qaChatInput.scrollHeight, 120) + 'px';
    }
    qaChatInput?.addEventListener('input', adjustQaTextarea);

    $('btn-clear-qa-chat')?.addEventListener('click', () => {
        qaHistory.length = 0;
        initQaGreeting();
    });

    document.querySelectorAll('.qa-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const q = chip.getAttribute('data-qa');
            if (qaChatInput && q) {
                qaChatInput.value = q;
                adjustQaTextarea();
                sendQaQuestion();
            }
        });
    });

    async function callQaGeminiOnce(model, contents, signal) {
        const payload = {
            systemInstruction: { parts: [{ text: QA_TRINITY_SYSTEM_INSTRUCTION }] },
            contents,
            generationConfig: { temperature: settings.temperature, maxOutputTokens: 8192 },
        };

        const res = await fetch(`${API_BASE}/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const err = new Error(data.error?.message || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
        if (!text) throw new Error(`Empty response (${data.candidates?.[0]?.finishReason || 'unknown reason'}).`);
        return { text };
    }

    function setQaBusy(busy) {
        if (!qaChatInput || !qaSendBtn) return;
        qaChatInput.disabled = busy;
        const txt = qaSendBtn.querySelector('.qa-btn-text');
        if (txt) txt.textContent = busy ? 'STOP' : 'ASK AI';
        qaSendBtn.classList.toggle('busy-mode', busy);
        if (!busy) {
            qaAbortCtrl = null;
            qaChatInput.focus();
        }
    }

    async function sendQaQuestion() {
        if (!qaChatInput) return;
        const question = qaChatInput.value.trim();
        if (!question) return;

        appendQaMessage(question, 'user');
        qaChatInput.value = '';
        adjustQaTextarea();

        const contents = [...qaHistory, { role: 'user', parts: [{ text: question }] }];
        setQaBusy(true);
        const thinkingEl = appendQaMessage('Synthesizing response across ChatGPT, Gemini & Claude knowledge bases...', 'ai');
        qaAbortCtrl = new AbortController();

        const models = [settings.model, ...FALLBACK_ORDER.filter(m => m !== settings.model)];
        try {
            let result = null;
            const failures = [];
            for (const m of models) {
                try {
                    result = await callQaGeminiOnce(m, contents, qaAbortCtrl.signal);
                    break;
                } catch (e) {
                    if (e.name === 'AbortError') throw e;
                    failures.push(`• ${m} (${e.status || 'err'}): ${e.message}`);
                }
            }
            if (!result) {
                throw new Error('Could not reach AI models:\n' + failures.join('\n'));
            }
            thinkingEl?.remove();

            // Strip any accidental fenced code blocks to strictly guarantee response-only output
            const cleanAnswer = result.text.replace(/```[\s\S]*?```/g, '[Code omitted — use 1. Normal Preview mode to generate code]').trim();

            qaHistory.push({ role: 'user', parts: [{ text: question }] });
            qaHistory.push({ role: 'model', parts: [{ text: cleanAnswer }] });
            if (qaHistory.length > MAX_HISTORY_TURNS * 2) qaHistory.splice(0, qaHistory.length - MAX_HISTORY_TURNS * 2);

            appendQaMessage(cleanAnswer, 'ai');
        } catch (err) {
            thinkingEl?.remove();
            appendQaMessage(err.name === 'AbortError' ? 'Question cancelled.' : `Error: ${err.message}`, 'ai');
        } finally {
            setQaBusy(false);
        }
    }

    qaSendBtn?.addEventListener('click', () => (qaAbortCtrl ? qaAbortCtrl.abort() : sendQaQuestion()));
    qaChatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !qaAbortCtrl) {
            e.preventDefault();
            sendQaQuestion();
        }
    });

    // Initialize initial agent state
    switchAgent('architect');
});