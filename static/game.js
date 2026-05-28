/* ==========================================================================
   RETRO TERMINAL GAME CORE ENGINE (game.js)
   ========================================================================== */

// Helper sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function escapeHtml(text) {
    if (typeof text !== "string") return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function applyUvHighlight(text) {
    if (typeof text !== "string") return text;
    const escaped = escapeHtml(text);
    return escaped.replace(/\b(fall|fell|emptiness|colour)\b/gi, '<span class="uv-highlight">$1</span>');
}

// ==========================================================================
// AUDIO MANAGER
// ==========================================================================
const AudioManager = {
    bgmAudio: null,
    bgmVolume: 0.6,
    isMuted: false,
    arcadeLayers: [],
    
    init() {
        this.bgmAudio = new Audio();
    },
    
    playBgm(trackPath, loop = true) {
        if (!this.bgmAudio) {
            this.init();
        }
        
        const path = trackPath.startsWith("static/music/") ? trackPath : "static/music/" + trackPath;
        
        // If the track is already loaded and playing, just ignore or resume it
        if (this.bgmAudio.src && this.bgmAudio.src.endsWith(path)) {
            if (this.bgmAudio.paused) {
                this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
                this.bgmAudio.play().catch(e => console.log("BGM resume failed:", e));
            }
            return;
        }
        
        this.bgmAudio.pause();
        this.bgmAudio.src = path;
        this.bgmAudio.loop = loop;
        this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
        
        this.bgmAudio.play().catch(e => console.log("BGM play failed:", e));
    },
    
    stopBgm() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
        }
    },
    
    setBgmVolume(vol) {
        this.bgmVolume = vol;
        if (this.bgmAudio && !this.isMuted) {
            this.bgmAudio.volume = vol;
        }
    },
    
    playBgmUntilEnd(trackPath) {
        return new Promise(resolve => {
            this.playBgm(trackPath, false);
            const onEnded = () => {
                this.bgmAudio.removeEventListener("ended", onEnded);
                resolve();
            };
            this.bgmAudio.addEventListener("ended", onEnded);
        });
    },
    
    playSfx(sfxPath, volume = 0.8) {
        const path = sfxPath.startsWith("static/music/") ? sfxPath : "static/music/" + sfxPath;
        const audio = new Audio(path);
        audio.volume = this.isMuted ? 0 : volume;
        audio.play().catch(e => console.log("SFX play failed:", e));
    },
    
    playSfxUntilEnd(sfxPath, volume = 0.8) {
        return new Promise(resolve => {
            const path = sfxPath.startsWith("static/music/") ? sfxPath : "static/music/" + sfxPath;
            const audio = new Audio(path);
            audio.volume = this.isMuted ? 0 : volume;
            const onEnded = () => {
                audio.removeEventListener("ended", onEnded);
                resolve();
            };
            audio.addEventListener("ended", onEnded);
            audio.play().catch(e => {
                console.log("SFX play failed:", e);
                resolve(); // Resolve immediately on error to prevent freezing!
            });
        });
    },
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
        }
        this.arcadeLayers.forEach(layer => {
            layer.audio.volume = (this.isMuted || !layer.active) ? 0 : 0.4;
        });
        
        // Update header volume button UI
        const btn = document.getElementById("mute-btn");
        if (btn) {
            btn.textContent = this.isMuted ? "🔇 VOL: MUTED" : "🔊 VOL: 100%";
        }
        return this.isMuted;
    },
    
    startArcadeMusic() {
        this.stopBgm();
        this.arcadeLayers = [];
        
        const layers = [
            "music/base_arcade.wav",
            "music/layer1.wav",
            "music/layer2.wav",
            "music/layer3.wav",
            "music/layer4.wav",
            "music/layer5.wav"
        ];
        
        layers.forEach((track, index) => {
            const audio = new Audio("static/music/" + track);
            audio.loop = true;
            audio.volume = 0; // muted initially
            audio.play().catch(e => console.log("Arcade layer play failed:", e));
            this.arcadeLayers.push({
                audio: audio,
                active: false
            });
        });
        
        // Base layer is active
        this.arcadeLayers[0].active = true;
        this.arcadeLayers[0].audio.volume = this.isMuted ? 0 : 0.4;
        
        // Sync active layers to base layer to prevent drifting and ensure clean looping
        this.arcadeLayers[0].audio.addEventListener("timeupdate", () => {
            if (this.arcadeLayers.length === 0 || !this.arcadeLayers[0].active) return;
            const baseTime = this.arcadeLayers[0].audio.currentTime;
            this.arcadeLayers.forEach((layer, idx) => {
                if (idx > 0 && layer.active) {
                    if (Math.abs(layer.audio.currentTime - baseTime) > 0.05) {
                        layer.audio.currentTime = baseTime;
                    }
                }
            });
        });
    },
    
    updateArcadeLayers(score) {
        const targetLayer = Math.min(Math.floor(score / 100), this.arcadeLayers.length - 1);
        for (let i = 0; i <= targetLayer; i++) {
            if (this.arcadeLayers[i] && !this.arcadeLayers[i].active) {
                this.arcadeLayers[i].active = true;
                this.arcadeLayers[i].audio.volume = this.isMuted ? 0 : 0.4;
                // Sync playback time to base layer
                this.arcadeLayers[i].audio.currentTime = this.arcadeLayers[0].audio.currentTime;
            }
        }
    },
    
    stopArcadeMusic() {
        this.arcadeLayers.forEach(layer => {
            layer.audio.pause();
        });
        this.arcadeLayers = [];
    }
};

// ==========================================================================
// TERMINAL MANAGER
// ==========================================================================
const Terminal = {
    screen: document.getElementById("terminal-screen"),
    outputLog: document.getElementById("output-log"),
    inputLine: document.getElementById("input-line"),
    inputEl: document.getElementById("terminal-input"),
    promptLabel: document.getElementById("prompt-label"),
    
    currentResolver: null,
    isTypewriting: false,
    skipTypewriter: false,
    
    init() {
        // Handle input events
        this.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const text = this.inputEl.value;
                this.inputEl.value = "";
                this.echoInput(text);
                if (this.currentResolver) {
                    const resolve = this.currentResolver;
                    this.currentResolver = null;
                    resolve(text);
                }
            }
        });
        
        // Focus input on click anywhere on terminal screen
        this.screen.addEventListener("click", () => {
            if (this.isTypewriting) {
                this.skipTypewriter = true;
            } else {
                this.inputEl.focus();
            }
        });
        
        // Mirror input value to custom caret text
        this.inputEl.addEventListener("input", () => {
            this.updateVirtualInput();
        });
    },

    updateVirtualInput() {
        const text = this.inputEl.value;
        const wrapper = this.inputEl.parentElement;
        let virtualText = wrapper.querySelector(".virtual-input-text");
        if (!virtualText) {
            virtualText = document.createElement("span");
            virtualText.className = "virtual-input-text";
            wrapper.insertBefore(virtualText, wrapper.firstChild);
        }
        virtualText.textContent = text;
    },
    
    echoInput(text) {
        const line = document.createElement("div");
        line.className = "log-line user-echo";
        line.textContent = "> " + text;
        this.outputLog.appendChild(line);
        this.scrollToBottom();
    },
    
    scrollToBottom() {
        this.screen.scrollTop = this.screen.scrollHeight;
    },
    
    write(text, type = "") {
        const line = document.createElement("div");
        line.className = "log-line";
        if (type) line.classList.add(type);
        if (GameState.inventory.includes("uv_light") && type === "lion-speech") {
            line.innerHTML = applyUvHighlight(text);
        } else if (GameState.inventory.includes("uv_light") && text.includes("Der wanderer")) {
            const escaped = escapeHtml(text);
            line.innerHTML = escaped.replace(/\b(der)\b/gi, '<span class="uv-highlight">$1</span>');
        } else {
            line.textContent = text;
        }
        this.outputLog.appendChild(line);
        this.scrollToBottom();
    },

    writeHtml(html) {
        const container = document.createElement("div");
        container.innerHTML = html;
        this.outputLog.appendChild(container);
        this.scrollToBottom();
    },
    
    async print(text, type = "", delay = 15) {
        this.inputLine.classList.add("hidden");
        this.isTypewriting = true;
        this.skipTypewriter = false;
        
        const line = document.createElement("div");
        line.className = "log-line";
        if (type) line.classList.add(type);
        this.outputLog.appendChild(line);
        
        if (text.length > 200) {
            delay = 5;
        }

        for (let i = 0; i < text.length; i++) {
            if (this.skipTypewriter) {
                line.textContent = text;
                break;
            }
            line.textContent += text[i];
            this.scrollToBottom();
            await new Promise(r => setTimeout(r, delay));
        }
        
        if (GameState.inventory.includes("uv_light") && type === "lion-speech") {
            line.innerHTML = applyUvHighlight(line.textContent);
        }
        
        this.isTypewriting = false;
        this.skipTypewriter = false;
        this.scrollToBottom();
    },
    
    async input(prompt = "> ") {
        this.promptLabel.textContent = prompt;
        this.inputLine.classList.remove("hidden");
        this.inputEl.focus();
        this.updateVirtualInput();
        
        return new Promise(resolve => {
            this.currentResolver = resolve;
        });
    },
    
    clear() {
        this.outputLog.innerHTML = "";
    }
};

// ==========================================================================
// GAME STATE DEFINITIONS
// ==========================================================================
const GameState = {
    roomsUnlocked: {
        painting_room: false,
        storage_room: false,
        hidden_room: false,
        enddoor_room: false
    },
    roomVisits: 0,
    redShelfUnlocked: false,
    shelfSequence: [],
    correctSequence: ["green", "blue", "red"],
    ghostEventTriggered: false,
    potionCollected: false,
    clockUnlocked: false,
    difficulty: "medium",
    
    // Health system
    health: 100,
    maxHealth: 100,
    legOkay: false,
    
    // Time system
    timeSetAt: null,
    baseGameTime: null,
    timeFrozen: false,
    midnightTriggered: false,
    
    // Inventory
    inventory: [],

    // State helper methods
    setHealth(val) {
        this.health = Math.min(Math.max(val, 0), this.maxHealth);
        updateSidebar();
    },
    addInventory(item) {
        if (!this.inventory.includes(item)) {
            this.inventory.push(item);
            updateSidebar();
        }
    },
    removeInventory(item) {
        this.inventory = this.inventory.filter(i => i !== item);
        updateSidebar();
    },
    setLegOkay(val) {
        this.legOkay = val;
        updateSidebar();
    }
};

function updateSidebar() {
    const healthEl = document.getElementById("sidebar-health");
    const healthBarEl = document.getElementById("sidebar-health-bar");
    const legEl = document.getElementById("sidebar-leg");
    const inventoryEl = document.getElementById("sidebar-inventory");
    
    if (healthEl) {
        healthEl.textContent = `${GameState.health}/${GameState.maxHealth}`;
    }
    if (healthBarEl) {
        const pct = (GameState.health / GameState.maxHealth) * 100;
        healthBarEl.style.width = `${pct}%`;
        if (GameState.health <= 20) {
            healthBarEl.style.backgroundColor = "#ff3333";
            healthBarEl.style.boxShadow = "0 0 8px #ff3333";
        } else {
            healthBarEl.style.backgroundColor = "var(--terminal-green)";
            healthBarEl.style.boxShadow = "0 0 8px var(--terminal-green)";
        }
    }
    
    if (legEl) {
        if (GameState.legOkay) {
            legEl.textContent = "HEALTHY";
            legEl.className = "system-success";
        } else {
            legEl.textContent = "BROKEN";
            legEl.className = "system-alert";
        }
    }
    
    if (inventoryEl) {
        inventoryEl.innerHTML = "";
        if (GameState.inventory.length === 0) {
            const li = document.createElement("li");
            li.className = "empty-item";
            li.textContent = "- EMPTY -";
            inventoryEl.appendChild(li);
        } else {
            GameState.inventory.forEach(item => {
                const li = document.createElement("li");
                
                // Format name: e.g. "wooden_plank" -> "Wooden Plank"
                let name = item.replace(/[-_]+/g, " ");
                name = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                
                if (item === "uv_light") {
                    name = "UV Light";
                    li.className = "uv-highlight";
                }
                
                li.textContent = name;
                inventoryEl.appendChild(li);
            });
        }
    }
}

const DIFFICULTY_MULTIPLIERS = {
    easy: 1.35,
    medium: 1.0,
    hard: 0.65
};

// Time system functions
function getGameCurrentTime() {
    if (GameState.timeFrozen) {
        return GameState.baseGameTime;
    }
    const elapsed = Date.now() - GameState.timeSetAt;
    return new Date(GameState.baseGameTime.getTime() + elapsed);
}

// Format date to HH:MM
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Cangas gasoline (tripping mechanic)
async function tryInitiateCangas() {
    const chance = GameState.legOkay ? 100 : 50;
    if (Math.floor(Math.random() * chance) === 0) {
        await initiateCangas();
    }
}

async function initiateCangas() {
    Terminal.write("\nOh no! You trip over some stuff on the ground!", "system-alert");
    AudioManager.playSfx("overall/tripping.mp3");
    
    if (GameState.inventory.includes("candle")) {
        Terminal.write("Your candle falls on the ground. To your horror, you realize the strong smelling liquid has been gasoline.", "system-alert");
        await sleep(1000);
        AudioManager.playSfx("overall/fire.mp3");
        Terminal.write("The room gets filled with flames. You caught fire.", "system-alert");
        GameState.setHealth(GameState.health - 100);
        await checkDeath();
    } else {
        await sleep(1000);
        if (!GameState.inventory.includes("wooden_plank")) {
            Terminal.write("Luckily you catch yourself, and you don't get hurt.");
            Terminal.write("\nHey there was a wooden plank sticking out of the ground.\n");
            GameState.addInventory("wooden_plank");
            Terminal.write("You pick it up, it might be useful later.\n", "system-success");
        } else {
            Terminal.write("Luckily you catch yourself, and you don't get hurt.");
        }
    }
}

// Leg check
function checkLegHealth() {
    AudioManager.playSfx("health/check_leg.mp3");
    if (GameState.legOkay) {
        Terminal.write("Your leg still hurts, but you are able to soldier through.\n");
    } else {
        Terminal.write("You touch your leg and you feel that it's warm and wet from the blood.\nIt seems you got stabbed by something. Walking is doable, but jumping or climbing feels impossible.\n");
    }
}

async function checkDeath() {
    if (GameState.health <= 0) {
        AudioManager.stopBgm();
        AudioManager.playSfx("health/death.mp3");
        
        await Terminal.print("The pain is no longer tolerable, you feel pain in each and every part of your body.", "system-alert", 30);
        await sleep(1000);
        await Terminal.print("You fall down on your knees, a tear falls down your face. Now that you have given up, you feel a certain pressure lifting off of your body.", "system-alert", 30);
        await sleep(1000);
        await Terminal.print("Now I can rest, you say.", "system-info", 30);
        await sleep(1000);
        Terminal.write("\n========================================", "system-alert");
        Terminal.write("                GAME OVER               ", "system-alert");
        Terminal.write("========================================\n", "system-alert");
        Terminal.write("Press Enter to reboot the system...");
        
        await Terminal.input();
        window.location.reload();
    }
}

// ==========================================================================
// ROOMS & PUZZLES IMPLEMENTATION
// ==========================================================================

async function startGame() {
    Terminal.clear();
    await Terminal.print("Welcome to my chat-based game. In this game you will have to solve puzzles to escape the room in which you are stuck. ");
    await sleep(300);
    await Terminal.print("This game works by typing the number associated with the option you want to select. ");
    await sleep(300);
    await Terminal.print("You start with 100 hp out of 100.");
    await sleep(300);
    await Terminal.print("You can click anywhere on the screen to fast forward the text.\n");

    while (true) {
        Terminal.write("Do you want to start the game?\n1 - Yes!\n2 - No, thank you\n");
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            while (true) {
                Terminal.write("Choose difficulty (easy / medium / hard) [medium]:");
                let diff = (await Terminal.input()).trim().toLowerCase();
                if (diff === "") diff = "medium";
                
                if (diff === "easy" || diff === "medium" || diff === "hard") {
                    GameState.difficulty = diff;
                    await Terminal.print(`Difficulty set to ${diff}. Starting game..\n`, "system-success");
                    break;
                } else {
                    await Terminal.print("Invalid difficulty, please type easy, medium or hard.\n", "system-alert");
                }
            }
            
            // Set up game clock
            GameState.timeSetAt = Date.now();
            GameState.baseGameTime = new Date();
            
            // Go to Main Room
            await mainRoom();
            break;
        } else if (selection === "2") {
            await Terminal.print("Bye!");
            window.location.href = "index.html";
            break;
        } else {
            await Terminal.print("Error, try to type the number associated with the option!\n", "system-alert");
        }
    }
}

async function mainRoom() {
    AudioManager.playBgm("music/theme_song.wav");
    
    await Terminal.print(`You wake up, your eyes are still heavy, and you feel a sharp pain in your leg.
You find yourself on a hard cold floor soaked in a strong smelling liquid. It's almost completely dark. Below you are some stairs leading downwards.
In the distance you see a couple of dimly lit candles standing on an antique table, next to it, on the wall, is a painting of a man on a dark empty road.
Behind you, to the left, a hallway filled with light.
You can't see more details on the painting.\n`);
    await sleep(500);
    await Terminal.print("You also see a door to the left.\n");
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Walk towards the candles.\n" +
            "3 - Walk towards the door.\n" +
            "4 - Walk towards the hallway.\n" +
            "5 - Go downstairs.\n";
            
        if (GameState.inventory.includes("candle") || GameState.inventory.includes("flashlight")) {
            menu += "6 - Explore the room to the south-west.\n";
            menu += "7 - Explore the room to the south-east.\n";
        }
        
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await candleRoom();
            }
        } else if (selection === "3") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await storageDoor();
            }
        } else if (selection === "4") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await hallway();
            }
        } else if (selection === "5") {
            if (GameState.inventory.includes("candle") || GameState.inventory.includes("flashlight")) {
                await tryInitiateCangas();
                if (GameState.health > 0) {
                    AudioManager.playSfx("overall/lopen.wav");
                    await basement();
                }
            } else {
                await Terminal.print("\nIt's too dark to go down the stairs safely. You should find some light first.\n");
            }
        } else if (selection === "6" && (GameState.inventory.includes("candle") || GameState.inventory.includes("flashlight"))) {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await lionstatue();
            }
        } else if (selection === "7" && (GameState.inventory.includes("candle") || GameState.inventory.includes("flashlight"))) {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await beforeEnddoor();
            }
        } else {
            await Terminal.print("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        
        await checkDeath();
    }
}

// CANDLE ROOM
async function candleRoom() {
    await Terminal.print(`You feel sick and tired, but you still try to walk towards the candles.
You try to ignore the pain in your leg. Slowly you make your way towards the candles and you feel a certain fear upon you.\n`);
    await sleep(500);
    await Terminal.print(`You feel the warmth of the candles as you stand next to them.
Now that you are closer, you see that the table contains more than just candles.\n`);
    
    while (true) {
        const option5Text = GameState.roomsUnlocked.painting_room ? "Enter painting room" : "Check the painting";
        
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Check the table.\n" +
            "3 - Pick up one of the candles.\n" +
            `4 - ${option5Text}.\n` +
            "5 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim().toUpperCase();
        
        // Secret code to find hidden flashlight
        if (selection === "H") {
            if (!GameState.inventory.includes("flashlight")) {
                GameState.addInventory("flashlight");
                await Terminal.print("\nYou found the hidden flashlight! You can use it now.\n", "system-success");
            } else {
                await Terminal.print("\nYou already have a flashlight.\n");
            }
            continue;
        }
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            await Terminal.print(`\nOn the table before you lays a deck of cards, a chessboard, a box with a button, and a frame with a picture of a nice couple.
Looking at the couple, you feel a certain jealousy. They are smiling......\n`);
            await sleep(500);
            await Terminal.print("Whilst you are not.\n");
            await optionMenuCandletable();
        } else if (selection === "3") {
            if (!GameState.inventory.includes("candle")) {
                GameState.addInventory("candle");
                await Terminal.print("You picked up a candle! You can now use it.\n", "system-success");
            } else {
                await Terminal.print("It seems you already have a candle..\n");
            }
        } else if (selection === "4") {
            if (GameState.roomsUnlocked.painting_room && GameState.legOkay && !GameState.roomsUnlocked.hidden_room) {
                await enterPaintingRoom();
            } else if (GameState.roomsUnlocked.painting_room && !GameState.legOkay && !GameState.roomsUnlocked.hidden_room) {
                await Terminal.print("Your leg is too hurt to climb into the space behind the painting.\n", "system-alert");
            } else if (GameState.roomsUnlocked.painting_room && GameState.roomsUnlocked.hidden_room) {
                await Terminal.print("You don't dare go in the oven again..\n");
            } else if (GameState.inventory.includes("candle") || GameState.inventory.includes("flashlight")) {
                await Terminal.print("With your light, you can see the details of the painting.\n");
                await tryInitiateCangas();
                if (GameState.health > 0) {
                    await paintingPuzzle();
                }
            } else {
                await Terminal.print("It's too dark to see the painting clearly, maybe check on it another time.\n");
            }
        } else if (selection === "5") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            await Terminal.print("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function optionMenuCandletable() {
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Draw a card.\n" +
            "2 - Press the button on the box.\n" +
            "3 - Inspect the photo.\n" +
            "4 - Play the chessboard.\n" +
            "5 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            AudioManager.playSfx("draw_card/draw_card.mp3");
            await drawCard();
        } else if (selection === "2") {
            AudioManager.playSfx("draw_card/button.mp3");
            await buttonBox();
        } else if (selection === "3") {
            await Terminal.print("\nThe woman in the photo suddenly begins talking to you.\n");
            await sleep(500);
            
            // Temporarily lower theme music volume
            AudioManager.setBgmVolume(0.15);
            
            // Start voice actor sound playing as promise
            const voicePromise = AudioManager.playSfxUntilEnd("voices/photoghost.wav");
            
            await sleep(1000);
            await Terminal.print('"BOO! Did I scare you? Hahaha!"\n');
            await Terminal.print('"Don\'t be scared, ghosts come in all shapes and sizes. Like me and the lion!"\n');
            await sleep(1000);
            await Terminal.print('"Have you noticed the lion always says something different when you visit him?"\n');
            await sleep(1000);
            await Terminal.print('"Well, goodbye dear, my husband is getting jealous."');
            
            // Await voice to finish speaking
            await voicePromise;
            AudioManager.setBgmVolume(0.6);
            
            if (!GameState.potionCollected) {
                GameState.potionCollected = true;
                await Terminal.print("\n\nHey there is something strapped to the back!\n");
                await sleep(500);
                await Terminal.print("You picked up a potion.\n", "system-success");
                GameState.addInventory("potion");
            } else {
                await Terminal.print("Nope nothing here..\n");
            }
        } else if (selection === "4") {
            await playChess();
        } else if (selection === "5") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            await Terminal.print("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function drawCard() {
    const roll = Math.floor(Math.random() * 100) + 1;
    
    if (roll >= 1 && roll <= 30) {
        await Terminal.print("You drew the Laughing Clown! You heal 20 HP.\n", "system-success");
        AudioManager.playSfx("draw_card/clown.mp3");
        GameState.setHealth(GameState.health + 20);
    } else if (roll >= 31 && roll <= 60) {
        await Terminal.print("You drew the Demon! You lose 10 HP.\n", "system-alert");
        AudioManager.playSfx("draw_card/demon.mp3");
        GameState.setHealth(GameState.health - 10);
    } else if (roll >= 61 && roll <= 75) {
        AudioManager.playSfx("draw_card/earthquake.mp3");
        if (Math.random() < 0.5) {
            await Terminal.print(`You drew The Earthquake! You feel the earth trembling and shaking.
Looking up you see something falling towards you, it hits you directly in your face.
Unfortunately, it was a ceiling tile.\n`);
            await sleep(500);
            Terminal.write("You lose 20 HP.", "system-alert");
            GameState.setHealth(GameState.health - 20);
        } else {
            await Terminal.print(`You drew The Earthquake! You feel the earth trembling and shaking.
Looking up you see something falling towards you, it hits you directly in your face.
Fortunately, it was just some dust
The shaking actually felt kinda nice. You feel as if the quake massaged your every muscle.\n`);
            await sleep(500);
            Terminal.write("You heal 20 hp.", "system-success");
            GameState.setHealth(GameState.health + 20);
        }
    } else if (roll >= 76 && roll <= 90) {
        await Terminal.print("You drew the Music Box! Music starts playing...\n");
        await AudioManager.playBgmUntilEnd("draw_card/music_box.wav");
        AudioManager.playBgm("music/theme_song.wav");
    } else if (roll >= 91 && roll <= 95) {
        AudioManager.playSfx("draw_card/hades.mp3");
        await Terminal.print("You drew Hades! You lose all HP!\n", "system-alert");
        GameState.setHealth(0);
    } else if (roll >= 96 && roll <= 100) {
        AudioManager.playSfx("draw_card/god.mp3");
        await Terminal.print("You drew God! You are fully healed!\n", "system-success");
        GameState.setHealth(GameState.maxHealth);
    }
    
    Terminal.write(`Your current health: ${GameState.health}/${GameState.maxHealth}\n`);
    await checkDeath();
}

async function buttonBox() {
    Terminal.write("You try pressing the button on the box.\n");
    await sleep(500);
    Terminal.write("It seems stuck..");
    
    if (GameState.inventory.includes("wd-40")) {
        await sleep(500);
        Terminal.write("You apply some wd-40 to the button and try pressing it again.");
        if (!GameState.inventory.includes("ammo")) {
            GameState.addInventory("ammo");
            Terminal.write("Pistol ammo rolled out of the box! Without a gun it seems useless.\n", "system-success");
        } else {
            Terminal.write("You waited for the box to do something, but it seems it doesn't work twice..\n");
        }
    }
}

// ==========================================================================
// CHESS MINI-GAME IMPLEMENTATION
// ==========================================================================

const pieceValues = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
};

function evaluateBoard(chessObj) {
    if (chessObj.in_checkmate()) {
        return chessObj.turn() === 'w' ? -99999 : 99999;
    }
    if (chessObj.in_stalemate() || chessObj.in_draw()) {
        return 0;
    }

    let score = 0;
    const board = chessObj.board(); // 8x8 array

    // Material
    for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
            const square = board[r][f];
            if (square) {
                const val = pieceValues[square.type];
                if (square.color === 'w') {
                    score += val;
                } else {
                    score -= val;
                }
            }
        }
    }

    // Center control
    const centerSquares = [
        {r: 3, f: 3}, {r: 3, f: 4}, {r: 4, f: 3}, {r: 4, f: 4}
    ];
    centerSquares.forEach(sq => {
        const piece = board[sq.r][sq.f];
        if (piece) {
            if (piece.color === 'w') score += 20;
            else score -= 20;
        }
    });

    // Development
    const moves = chessObj.history().length;
    const fullmoveNumber = Math.floor(moves / 2) + 1;
    if (fullmoveNumber <= 10) {
        const whiteBackRank = board[7];
        const blackBackRank = board[0];
        [1, 2, 5, 6].forEach(col => {
            const wp = whiteBackRank[col];
            if (wp && (wp.type === 'b' || wp.type === 'n')) {
                score -= 15;
            }
            const bp = blackBackRank[col];
            if (bp && (bp.type === 'b' || bp.type === 'n')) {
                score += 15;
            }
        });
    }

    return score;
}

function minimax(chessObj, depth, alpha, beta, maximizing) {
    if (depth === 0 || chessObj.game_over()) {
        return evaluateBoard(chessObj);
    }

    const moves = chessObj.moves({ verbose: true });

    if (maximizing) {
        let maxEval = -999999;
        for (let i = 0; i < moves.length; i++) {
            chessObj.move(moves[i]);
            let evalScore = minimax(chessObj, depth - 1, alpha, beta, false);
            chessObj.undo();
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = 999999;
        for (let i = 0; i < moves.length; i++) {
            chessObj.move(moves[i]);
            let evalScore = minimax(chessObj, depth - 1, alpha, beta, true);
            chessObj.undo();
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function getAIMove(chessObj) {
    const moves = chessObj.moves({ verbose: true });
    if (moves.length === 0) return null;

    const historyLength = chessObj.history().length;
    if (historyLength <= 6) {
        const openingBook = ["e2e4", "d2d4", "c2c4", "g1f3", "b1c3", "f2f4", "e2e3", "d2d3"];
        const bookMoves = moves.filter(m => {
            const uci = m.from + m.to;
            return openingBook.includes(uci);
        });
        if (bookMoves.length > 0) {
            return bookMoves[Math.floor(Math.random() * bookMoves.length)];
        }
    }

    let bestMove = null;
    let bestValue = 999999;

    const history = chessObj.history({ verbose: true });
    const recentUci = history.slice(-4).map(m => m.from + m.to);

    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const uci = move.from + move.to;
        let penalty = recentUci.includes(uci) ? 30 : 0;

        chessObj.move(move);
        let value = minimax(chessObj, 2, -999999, 999999, true);
        chessObj.undo();

        value += penalty;

        if (value < bestValue) {
            bestValue = value;
            bestMove = move;
        }
    }

    return bestMove || moves[Math.floor(Math.random() * moves.length)];
}

const GHOST_TAUNTS = {
    winning: [
        '"Your pieces tremble…"',
        '"I can already see your king falling."',
        '"You should have stayed in the dark."',
        '"Your position is collapsing…"',
        '"Every move you make is a mistake."'
    ],
    losing: [
        '"No… that move was not supposed to happen."',
        '"You are stronger than I thought…"',
        '"The board is turning against me."',
        '"This is… inconvenient."',
        '"I don\'t like where this is going…"'
    ],
    even: [
        '"Interesting…"',
        '"You are holding up well."',
        '"Let us see who breaks first."',
        '"The tension is delicious…"',
        '"Neither of us dares blink."'
    ]
};

function ghostTalk(chessObj) {
    const score = evaluateBoard(chessObj);
    let mood = "even";
    if (score < -200) mood = "winning";
    else if (score > 200) mood = "losing";
    
    const lines = GHOST_TAUNTS[mood];
    const taunt = lines[Math.floor(Math.random() * lines.length)];
    Terminal.write(`\n${taunt}\n`, "system-alert");
}

function drawBoardHtml(chessObj) {
    const board = chessObj.board(); // 8x8 array
    const history = chessObj.history({ verbose: true });
    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    let html = "<div class='chess-container'>";
    html += "<table class='chess-table'>";
    
    // Header row (letters)
    html += "<tr><th></th>";
    for (let f = 0; f < 8; f++) {
        html += `<th>${String.fromCharCode(97 + f)}</th>`;
    }
    html += "<th></th></tr>";

    const pieceSymbols = {
        p: { w: "♙", b: "♟" },
        r: { w: "♖", b: "♜" },
        n: { w: "♘", b: "♞" },
        b: { w: "♗", b: "♝" },
        q: { w: "♕", b: "♛" },
        k: { w: "♔", b: "♚" }
    };

    for (let r = 0; r < 8; r++) {
        const rankNum = 8 - r;
        html += `<tr><td class='chess-label'>${rankNum}</td>`;

        for (let f = 0; f < 8; f++) {
            const squareObj = board[r][f];
            const fileChar = String.fromCharCode(97 + f);
            const rankChar = String.fromCharCode(56 - r);
            const squareName = fileChar + rankChar;
            
            const isLightSquare = (r + f) % 2 === 0;
            const squareClass = isLightSquare ? "light-square" : "dark-square";
            
            const isHighlighted = lastMove && (lastMove.from === squareName || lastMove.to === squareName);
            const highlightClass = isHighlighted ? "highlighted-square" : "";

            let symbol = "";
            if (squareObj) {
                const syms = pieceSymbols[squareObj.type];
                symbol = syms ? syms[squareObj.color] : "";
            }

            html += `<td class='chess-cell ${squareClass} ${highlightClass}'>${symbol}</td>`;
        }

        html += `<td class='chess-label'>${rankNum}</td></tr>`;
    }

    // Footer row (letters)
    html += "<tr><th></th>";
    for (let f = 0; f < 8; f++) {
        html += `<th>${String.fromCharCode(97 + f)}</th>`;
    }
    html += "<th></th></tr>";
    html += "</table></div>";

    return html;
}

async function playChess() {
    const game = new Chess();
    
    await Terminal.print("The moment you touch the chessboard, you are drawn to it...\n");
    await Terminal.print("A ghostly opponent materializes across from you, challenging you to a game of chess.\n");
    await sleep(500);
    await Terminal.print('"If you can defeat me, I shall give you a precious item," the ghost whispers.\n');
    await sleep(500);
    
    Terminal.write("To play chess, enter moves like: e2e4 or g1f3.");
    Terminal.write("To promote a pawn, append the piece letter: e7e8q. (q, r, b, n).");
    Terminal.write("Castling is done by moving the king 2 squares.");
    Terminal.write("Type 'quit' to leave the board.\n");
    
    while (!game.game_over()) {
        Terminal.writeHtml(drawBoardHtml(game));
        
        Terminal.write("\nYour move:");
        const moveStr = (await Terminal.input()).trim().toLowerCase();
        
        if (moveStr === "quit") {
            await Terminal.print("You step away from the chessboard...\n");
            return;
        }
        
        // Parse UCI (e.g. e2e4)
        if (moveStr.length < 4) {
            Terminal.write("Invalid move format. Use format like 'e2e4'.\n", "system-alert");
            continue;
        }
        
        const from = moveStr.substring(0, 2);
        const to = moveStr.substring(2, 4);
        const promotion = moveStr.length > 4 ? moveStr.charAt(4) : undefined;
        
        const result = game.move({ from, to, promotion });
        if (result === null) {
            Terminal.write("That move is not allowed.\n", "system-alert");
            continue;
        }
        
        // Check if player won
        if (game.in_checkmate()) {
            Terminal.writeHtml(drawBoardHtml(game));
            await Terminal.print("\nThe ghost stares in disbelief...");
            await Terminal.print("You won the game.\n", "system-success");
            
            if (!GameState.inventory.includes("pistol")) {
                await Terminal.print('"Congratulations, brave soul," the ghost says softly.');
                await Terminal.print('"Take this pistol as a reward for your victory."');
                await Terminal.print("The ghost hands you a pistol before vanishing.\n", "system-success");
                GameState.addInventory("pistol");
            } else {
                await Terminal.print('"You have already claimed your reward," the ghost murmurs before fading away.\n');
            }
            Terminal.write("The chessboard fades into dust...\n");
            return;
        }
        
        // AI move
        Terminal.write("The ghost is thinking...\n");
        await sleep(800);
        
        const aiMove = getAIMove(game);
        if (aiMove) {
            game.move(aiMove);
            Terminal.write(`\nThe ghost moves: ${aiMove.from}${aiMove.to}\n`, "system-alert");
            ghostTalk(game);
        }
        
        if (game.in_checkmate()) {
            Terminal.writeHtml(drawBoardHtml(game));
            await Terminal.print("\nThe ghost lets out a hollow laugh...");
            await Terminal.print("You have been defeated.\n", "system-alert");
            Terminal.write("The chessboard vanishes.\n");
            return;
        }
    }
}

// STORAGE DOOR
async function storageDoor() {
    Terminal.write("You walk towards the door.\n");
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Try to open the door.\n" +
            "3 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            if (GameState.roomsUnlocked.storage_room) {
                Terminal.write("The door creaks open...");
                await tryInitiateCangas();
                if (GameState.health > 0) {
                    AudioManager.playSfx("overall/lopen.wav");
                    await storageRoom();
                }
            } else {
                Terminal.write("It seems the door is locked.\n", "system-alert");
            }
        } else if (selection === "3") {
            AudioManager.playSfx("overall/lopen.wav");
            break;
        } else {
            Terminal.write("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function storageRoom() {
    await Terminal.print("You step into the storage room. It's very small but there are a couple of shelves with items on them.\n");
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Inspect shelves.\n" +
            "3 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            if (GameState.inventory.includes("candle") || GameState.inventory.includes("flashlight")) {
                await storageItems();
            } else {
                Terminal.write("It's too dark to see anything.\n");
            }
        } else if (selection === "3") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            Terminal.write("Error, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function updateShelfSequence(color) {
    GameState.shelfSequence.push(color);
    if (GameState.shelfSequence.length > GameState.correctSequence.length) {
        GameState.shelfSequence.shift();
    }
    
    const matched = GameState.shelfSequence.every((val, idx) => val === GameState.correctSequence[idx]);
    if (matched && !GameState.ghostEventTriggered && GameState.shelfSequence.length === GameState.correctSequence.length) {
        GameState.ghostEventTriggered = true;
        await friendlyGhostEvent();
    }
}

const GHOST_ASCII_ART = `      .-.                          
    .'   \`.                        
    :g g   :                       
    : o    \`.                      
   :         \`\`.                   
  :             \`.                 
 :  :         .   \`.               
 :   :          \` . \`.             
  \`.. :            \`. \`\`;          
     \`:;             \`:'           
       :              \`.           
         \`.              \`.     .  
           \`'\`'\`'\`---..,___\`;.-'   `;

async function friendlyGhostEvent() {
    await sleep(3000);
    Terminal.write("The air suddenly grows cold.\n", "system-alert");
    await sleep(1000);
    Terminal.write("The candles flicker violently.\n", "system-alert");
    await sleep(1000);
    Terminal.write("A ghost appears in front of you:\n\n", "system-alert");
    await sleep(1000);
    
    // Draw ghost typewriter line by line
    const lines = GHOST_ASCII_ART.split("\n");
    AudioManager.setBgmVolume(0.15);
    
    for (let i = 0; i < lines.length; i++) {
        Terminal.write(lines[i], "ascii-line");
        await sleep(150);
    }
    await sleep(1000);
    
    const voicePromise = AudioManager.playSfxUntilEnd("voices/friendly_ghost.wav");
    
    await Terminal.print(`
The ghost whispers:
"Hello there, I am actually a chill dude. I won't hurt you."
"The last thing I remember when I was alive is that a shelf fell on me. What a fucking embarrassing death."

"Listen, I was also trying to escape this place in which you are now trapped."
"The host of this place is now giving me the privilege to help people here."

"I see your leg is pretty messed up. Let me help you."

"Oh yeah, by the way man. When someone is killed in this place, he or she turns into a ghost."
"They are haunted to attack the people trying to escape."
"Anyways.. Try to use the right move when you encounter a ghost."
"Bye man… avenge me."

`);
    await voicePromise;
    AudioManager.setBgmVolume(0.6);
    
    await sleep(1000);
    Terminal.write("And just like that, he vanishes.\n\n");
    await sleep(1000);
    
    // Fix leg health
    GameState.setLegOkay(true);
    AudioManager.playSfx("health/fix_leg.mp3");
    await Terminal.print(`You feel much better and moving goes relatively smoothly.
You feel as though you are now able to jump and climb.\n`, "system-success");
}

async function storageItems() {
    Terminal.write("There are three shelves.");
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Inspect red shelf.\n" +
            "2 - Inspect green shelf.\n" +
            "3 - Inspect blue shelf.\n" +
            "4 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            if (!GameState.redShelfUnlocked) {
                Terminal.write('On the red shelf lies a glass box. You can see some writing equipment in there. Scratched on the side of the box are the words: "Colour" and "Carpet"');
                Terminal.write("What's the password?");
                const password = (await Terminal.input()).trim().toLowerCase().replace(/\s+/g, "");
                
                if (password === "white") {
                    GameState.redShelfUnlocked = true;
                    Terminal.write("You hear a soft click. The glass box unlocks.\n", "system-success");
                    
                    if (!GameState.inventory.includes("pencil")) {
                        GameState.addInventory("pencil");
                        await Terminal.print("You cracked the password! There are a lot of items, but your mother taught you to be humble.\nYou only pick up one pencil.\n", "system-success");
                    }
                } else {
                    Terminal.write("You shake the lock and try to force it to open. It seems nothing works, I guess you really do need the password.");
                }
            } else {
                Terminal.write("The glass box on the red shelf stands open. There is nothing else of interest here.\n");
            }
            await updateShelfSequence("red");
        } else if (selection === "2") {
            Terminal.write("Oh no! The shelf fell over!", "system-alert");
            await sleep(1000);
            Terminal.write("You lost 20 hp.", "system-alert");
            
            GameState.setHealth(GameState.health - 20);
            Terminal.write(`Your current health: ${GameState.health}/${GameState.maxHealth}\n`);
            
            await updateShelfSequence("green");
            await checkDeath();
        } else if (selection === "3") {
            Terminal.write("Hmm, it seems this shelf is empty.");
            await updateShelfSequence("blue");
        } else if (selection === "4") {
            break;
        } else {
            Terminal.write("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

// BASEMENT
async function basement() {
    await Terminal.print("You carefully walk down the creaky stairs into the basement. The air is damp and musty.\n");
    await sleep(500);
    await Terminal.print("As you step further in, you see a room that is best described as someone's private study. In the center of the room, a couch is placed in front of a tv.\n");
    await Terminal.print("The floor is riddled with old scrambled up pieces of paper. The walls are lined with old bookshelves filled with dusty tomes.\n");
    await Terminal.print("On the side of the couch, there is a tv-remote. A note is taped on the remote that reads: 'Inglorious Basterds'.\n");
    await sleep(500);
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Turn on TV.\n" +
            "3 - Check the bookshelves.\n" +
            "4 - Go back upstairs.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection.toLowerCase() === "tv") {
            if (!GameState.inventory.includes("uv_light")) {
                GameState.addInventory("uv_light");
                await Terminal.print("\nYou type 'tv'... Suddenly, the TV screen emits a purple glow. A secret drawer under the TV screen clicks open. You found the UV Light!\n", "system-success");
            } else {
                await Terminal.print("\nYou already have the UV Light.\n");
            }
            continue;
        }
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            await tv();
        } else if (selection === "3") {
            await bookshelves();
        } else if (selection === "4") {
            await Terminal.print("You decide to leave the basement and head back upstairs.\n");
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            Terminal.write("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function tv() {
    await Terminal.print("You pick up the remote and press the power button. The TV flickers to life, displaying a static-filled screen.\n");
    await sleep(1000);
    await Terminal.print("Suddenly, a distorted figure appears on the screen, speaking in a garbled voice.\n");
    await sleep(1000);
    await Terminal.print("'Welcome to my basement' the figure says.'\n");
    await sleep(1000);
    await Terminal.print("The riddle echoes through the room: 'I am a minor being, with major disease. My name is tricky for those with dyslexia. What am I?'\n");
    
    Terminal.write("Your answer:");
    const answer = (await Terminal.input()).trim().toLowerCase();
    
    if (answer === "emmanuelle mimieux") {
        await Terminal.print("The TV screen flickers and then goes black. A hidden compartment opens in the wall, revealing a small key inside.\n", "system-success");
        await Terminal.print("You take the key and add it to your inventory.\n", "system-success");
        GameState.addInventory("small_key");
    } else if (answer === "tv") {
        if (!GameState.inventory.includes("uv_light")) {
            GameState.addInventory("uv_light");
            await Terminal.print("\nSuddenly, the TV screen emits a purple glow. A secret drawer under the TV screen clicks open. You found the UV Light!\n", "system-success");
        } else {
            await Terminal.print("\nYou already have the UV Light.\n");
        }
    } else {
        await Terminal.print("The figure on the screen shakes its head. 'Incorrect. Try again when you're ready.' The TV goes back to static.\n", "system-alert");
    }
}

async function bookshelves() {
    await Terminal.print("You walk over to the bookshelves and start browsing through the dusty old books.\n");
    await sleep(500);
    await Terminal.print("Most of the books are too old and fragile to read, but a couple of books are readable. They are titles as followed:\n");
    await sleep(500);
    
    const titles = [
        "Write to Survive",
        "TV distracts young children",
        "To the future",
        "Get Back to Life",
        "UV Light for Dummies"
    ];
    
    for (let i = 0; i < titles.length; i++) {
        const parts = titles[i].split(" ");
        const first = parts.shift();
        const rest = parts.join(" ");
        Terminal.writeHtml(`- '<span class="bold-word">${first}</span> ${rest}'`);
        await sleep(300);
    }
}

// HALLWAY
const ASCII_DRAWINGS = {
    3: `    /\\           /\\           /\\
   //\\\\         //\\\\         //\\\\
   \\\\//         \\\\//         \\\\//
    ><           ><           ><
  .._||_..      ._||..       ._||..
  :/  !! :     |     \\:     :/    :;
  |:  :| |     |  ::  |     |  :: ;|
  |:  :; |     |  :;  |     |  :: :|
  |;   : |     | : :  |     |  :: :|
  |      |     |      |     |     ,|
  |_._.__|     |__.__.|     |._._._|
 |        |   |        |   |        |
 |        |   |        |   |        |
  \\_.. ._/     \\_. .._/     \\_.. ._/
   |    |       |    |       |    |
   |    |       |    |       |    |
   |    \\._____./    \\._____./    |
   \\                              /
     \`-.______.  . ..   ._______.-'
               \\  ..   /
                |     |
                |     |
                |     |
                |     |
                |     |
                |... .|
           ____/.. . ..\\____
      _. -'                  '-._
     /___________________________\\`,
     
    4: `    .--.              .--.
   : (\\ ". _.b=n.._ ." /) :
    '.    \`        \`    .'
     /'   _        _   \`\\
    /     0}      {0     \\
   |       /      \\       |
   |     /'        \`\\     |
    \\   | .  .==.  . |   /
     '._ \\.' \\__/ './ _.'
     /  \`\`'._-''-_.'\`\`  \\`,
     
    5: `            .~\~\~\~\`\\~\~\\
            ;       ~~ \\
            |           ;
        ,----at--,______|---.
        /          \\-----\`    \\
        \`.__________\`-_______-'`,
        
    6: `                 /| |\\
                ( \\./ )
                 \\ : /
                 ) : (
                /  :  \\
                |_d=p_|`
};

async function hallway() {
    const hiddenUnlocked = GameState.roomsUnlocked.hidden_room;
    
    if (hiddenUnlocked) {
        await Terminal.print("Intrigued by the bright lights, you walk towards the hallway.\nAs you step inside, you notice something is different.\nWhere once there was only a blank wall, a passage has appeared.\n");
    } else {
        await Terminal.print("Intrigued by the bright lights, you walk towards the hallway.");
        await sleep(500);
        await Terminal.print('As you step inside it, you notice that it leads to an empty wall with the word "backwards" scratched into it.');
        await Terminal.print("Although the end doesn't seem too interesting, there are several interesting drawings on the walls of the hallway.");
    }
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Check out drawing #1.\n" +
            "3 - Check out drawing #2.\n" +
            "4 - Check out drawing #3.\n" +
            "5 - Check out drawing #4.\n";
            
        if (hiddenUnlocked) {
            menu += "6 - Enter the hidden room.\n7 - Go back.\n";
        } else {
            menu += "6 - Go back.\n";
        }
        
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            Terminal.write(ASCII_DRAWINGS[3], "ascii-line");
        } else if (selection === "3") {
            Terminal.write(ASCII_DRAWINGS[4], "ascii-line");
        } else if (selection === "4") {
            Terminal.write(ASCII_DRAWINGS[5], "ascii-line");
        } else if (selection === "5") {
            Terminal.write(ASCII_DRAWINGS[6], "ascii-line");
        } else if (hiddenUnlocked && selection === "6") {
            await Terminal.print("You step through the narrow opening, leaving the hallway behind...\n");
            await hiddenRoom();
            break;
        } else if (hiddenUnlocked && selection === "7") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else if (!hiddenUnlocked && selection === "6") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            Terminal.write("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

// HIDDEN ROOM
async function hiddenRoom() {
    await Terminal.print("You enter through the hidden door. Before you lies a dimly lit room with a pedestal in the middle. On top of which sits an old arcade game.");
    await sleep(500);
    await Terminal.print("This room doesn't feel scary at all. As if there is no ghostly presence here.\n");
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Play the arcade game.\n" +
            "2 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            await playArcadeGame();
            break;
        } else if (selection === "2") {
            await Terminal.print("You decide to leave the hidden room and return to the previous area.\n");
            break;
        }
    }
}

// ARCADE RUNNER
function playArcadeGame() {
    return new Promise(async (resolve) => {
        AudioManager.startArcadeMusic();
        
        Terminal.clear();
        for (let c = 3; c > 0; c--) {
            Terminal.clear();
            Terminal.write(`\n\n\n\n\n\n\n      ${c}`, "system-info");
            await sleep(1000);
        }
        
        Terminal.clear();
        
        let obstacles = []; // { lane, y }
        let score = 0;
        let level = 1;
        let frameDelay = 150;
        let waveSpacing = 3;
        let waveCounter = waveSpacing;
        let playerLane = 1;
        let active = true;
        
        const boardContainer = document.createElement("div");
        boardContainer.className = "arcade-board-container";
        
        const screenEl = document.createElement("div");
        screenEl.className = "arcade-screen";
        boardContainer.appendChild(screenEl);
        
        const controlsEl = document.createElement("div");
        controlsEl.className = "arcade-controls";
        controlsEl.innerHTML = "A / D or ← / → to Move<br>Q to Exit";
        boardContainer.appendChild(controlsEl);
        
        Terminal.outputLog.appendChild(boardContainer);
        Terminal.scrollToBottom();
        
        function generateWave(lvl) {
            const wave = [0, 0, 0];
            const numObstacles = lvl < 3 ? 1 : (Math.random() < 0.5 ? 1 : 2);
            const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
            let placed = 0;
            
            for (let i = 0; i < lanes.length; i++) {
                const lane = lanes[i];
                if (lane > 0 && wave[lane - 1] === 1) continue;
                if (lane < 2 && wave[lane + 1] === 1) continue;
                wave[lane] = 1;
                placed++;
                if (placed === numObstacles) break;
            }
            return wave;
        }
        
        const keyHandler = (e) => {
            if (!active) return;
            const key = e.key.toLowerCase();
            if ((key === "a" || e.key === "ArrowLeft") && playerLane > 0) {
                playerLane--;
                render();
            } else if ((key === "d" || e.key === "ArrowRight") && playerLane < 2) {
                playerLane++;
                render();
            } else if (key === "q") {
                active = false;
            }
        };
        window.addEventListener("keydown", keyHandler);
        
        function render() {
            let screenText = "  1   2   3\n";
            for (let y = 0; y < 15; y++) {
                let line = "  ";
                for (let l = 0; l < 3; l++) {
                    let char = ".";
                    if (obstacles.some(ob => ob.lane === l && ob.y === y)) {
                        char = "#";
                    }
                    if (playerLane === l && y === 14) {
                        char = "A";
                    }
                    line += char + "   ";
                }
                screenText += line.trimEnd() + "\n";
            }
            screenText += "=============\n";
            screenText += `Score: ${score}  Lvl: ${level}`;
            screenEl.textContent = screenText;
        }
        
        async function tick() {
            if (!active) {
                await cleanup();
                return;
            }
            
            if (waveCounter >= waveSpacing) {
                const wave = generateWave(level);
                wave.forEach((val, idx) => {
                    if (val) obstacles.push({ lane: idx, y: 0 });
                });
                waveCounter = 0;
            } else {
                waveCounter++;
            }
            
            obstacles.forEach(ob => ob.y++);
            obstacles = obstacles.filter(ob => ob.y < 15);
            
            const collision = obstacles.some(ob => ob.lane === playerLane && ob.y === 14);
            if (collision) {
                active = false;
                await cleanup(true);
                return;
            }
            
            score += 1;
            const newLevel = Math.floor(score / 100) + 1;
            if (newLevel > level) {
                level = newLevel;
                frameDelay = Math.max(30, 150 * Math.pow(0.9, level - 1));
                waveSpacing = Math.max(1, 3 - Math.floor(level / 2));
            }
            
            AudioManager.updateArcadeLayers(score);
            render();
            
            setTimeout(tick, frameDelay);
        }
        
        async function cleanup(gameOver = false) {
            window.removeEventListener("keydown", keyHandler);
            AudioManager.stopArcadeMusic();
            AudioManager.playBgm("music/theme_song.wav");
            
            if (gameOver) {
                screenEl.textContent += "\n\nGAME OVER!\nPress Enter to Exit";
                await Terminal.input();
                boardContainer.remove();
                resolve();
            } else {
                boardContainer.remove();
                resolve();
            }
        }
        
        render();
        tick();
    });
}

// LION STATUE
const MIDNIGHT_DIALOGUE = [
    '"Mischief, if only just a little, is all what was needed for him to fall into the deep depths. Was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"',
    '"In the moment he committed his crime, he recognized the fall into the depths. Was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"',
    '"Darkness filled his life, when he fell into the depths, was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"',
    '"Now, he is forever trapped in the depths. The moment he fell was the last moment he recognized joy. Is he fated to remain there in solitude, carrying an emptiness that no echo can answer?"',
    '"Inside the depths he fell, where no one could hear him, was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"',
    '"Grimly he looked. The boundary he surpassed let him fall into the depths. Was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"',
    '"Haunting sounds he heard in the depths, when he fell. Was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"',
    '"Trembling grounds below his feet, deep inside the depths where he fell. Was he fated to remain there in solitude, carrying an emptiness that no echo could answer?"'
];

async function lionstatue() {
    await Terminal.print("As you walk to the south-west side of the room, you come before a large lion head.");
    await sleep(500);
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Interact with the lion.\n" +
            "3 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            GameState.roomVisits++;
            const dialogueLine = MIDNIGHT_DIALOGUE[(GameState.roomVisits - 1) % MIDNIGHT_DIALOGUE.length];
            
            await Terminal.print("The lion moves its mouth slowly, and speaks to you in a vague low voice.");
            await sleep(500);
            await Terminal.print(dialogueLine, "lion-speech");
            await sleep(500);
            await Terminal.print('"Or would he one day find the light, drawn by courage or by chance, and in that company turn his silent world into one rich with colour and life?"', "lion-speech");
            await sleep(500);
            Terminal.write("The lion closes its mouth.");
        } else if (selection === "3") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            Terminal.write("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

// BEFORE ENDDOOR
async function beforeEnddoor() {
    await Terminal.print("As you walk to the south-east side of the room you stumble upon a golden door. Sadly it's locked.\nBefore the door lies a white carpet. The carpet feels and smells very dirty with the strong smelling liquid on it.\nA little further you see a clock hanging on the wall.\n");
    
    const currTime = formatTime(getGameCurrentTime());
    await Terminal.print(`\nThe clock reads ${currTime}.\n`);
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Try to open the golden door.\n" +
            "3 - Walk towards the clock.\n" +
            "4 - Walk towards the desk.\n" +
            "5 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await endDoor();
            }
        } else if (selection === "3") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await clockPuzzle();
            }
        } else if (selection === "4") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                await deskPuzzle();
            }
        } else if (selection === "5") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            Terminal.write("\nError, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

// ENDDOOR PUZZLE
async function endDoor() {
    if (GameState.roomsUnlocked.enddoor_room) {
        await tryInitiateCangas();
        if (GameState.health > 0) {
            await endGame();
        }
    } else {
        Terminal.write("You shake the lock and try to force it to open.\nIt seems nothing works, perhaps you need to explore more first.\n");
        await ghostEncounter();
    }
}

async function endGame() {
    await Terminal.print("A magic key appears in the lock. You hear a loud noise of the door moving.\nYou notice the door being very thick. It seems more like a vault.\nYou enter the room.\nIt surprises you that you are on a beautiful field, full of flowers and green long grass.\nFunny, how you have found das Glück, the luck der Wanderer could not find.\n", "system-success");
    await sleep(2000);
    Terminal.write("\n========================================", "system-success");
    Terminal.write("                YOU WIN!!!              ", "system-success");
    Terminal.write("========================================\n", "system-success");
    
    // Hall of Fame name prompt
    Terminal.write("please enter your name to enter hall of fame:");
    const name = (await Terminal.input()).trim();
    if (name) {
        Terminal.write("\nSaving your name to the Hall of Fame...", "system-info");
        try {
            // 1. Fetch current leaderboard (using cache-busting to prevent stale data overwrites)
            const res = await fetch("https://kvdb.io/Fo7oihsgjUj97nLNkW5SHL/leaderboard?_ts=" + Date.now(), { cache: "no-store" });
            let leaderboard = [];
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    leaderboard = data;
                }
            } else if (res.status !== 404) {
                throw new Error(`Database returned status ${res.status}`);
            }
            // 2. Add name (using a standard DD-MM-YYYY date format)
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const dateStr = `${day}-${month}-${year}`;
            
            leaderboard.push({ name: name, date: dateStr });
            
            // 3. Save leaderboard back
            const saveRes = await fetch("https://kvdb.io/Fo7oihsgjUj97nLNkW5SHL/leaderboard", {
                method: "POST",
                body: JSON.stringify(leaderboard)
            });
            if (saveRes.ok) {
                Terminal.write("Your name has been successfully added to the Hall of Fame!\n", "system-success");
            } else {
                Terminal.write("Failed to save your name to the Hall of Fame.\n", "system-alert");
            }
        } catch (e) {
            console.error("Error saving leaderboard:", e);
            Terminal.write("Failed to save your name to the Hall of Fame.\n", "system-alert");
        }
        await sleep(1500);
    }
    
    Terminal.write("Press Enter to return to website...");
    await Terminal.input();
    window.location.href = "index.html";
}

// CLOCK PUZZLE
async function clockPuzzle() {
    await Terminal.print("You walk towards the clock, it is an old pendulum clock and you hear the ticking now that you are closer.\n");
    
    if (!GameState.clockUnlocked && GameState.inventory.includes("small_key")) {
        await Terminal.print("You notice a small keyhole on the side of the clock. You have a small key in your inventory.\nDo you want to use the small key to unlock the clock?\n1 - Yes\n2 - No\n");
        const answer = (await Terminal.input()).trim();
        if (answer === "1") {
            GameState.clockUnlocked = true;
            GameState.removeInventory("small_key");
            await Terminal.print("You insert the small key and turn it. The clock casing clicks open.\n", "system-success");
            await sleep(500);
            await Terminal.print("Inside, you find a small letter. It reads:\n", "system-success");
            await sleep(500);
            await Terminal.print(`"All that puzzle solving just to find this letter, is there anything usefull on it you wonder..? \n\nMet vriendelijke groeten,\n\nEtienne\n\nPS. love the griep kinderen"\n`, "system-info");
            await sleep(1500);
        }
    }
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n";
        if (GameState.clockUnlocked) {
            menu += "2 - Change the time.\n";
        } else {
            menu += "2 - Change the time (Locked).\n";
        }
        menu += "3 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            if (!GameState.clockUnlocked) {
                await Terminal.print("The clock is locked. You need a small key to open it.\n", "system-alert");
            } else {
                await tryInitiateCangas();
                if (GameState.health > 0) {
                    await changeTime();
                }
            }
        } else if (selection === "3") {
            await tryInitiateCangas();
            if (GameState.health > 0) {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else {
            Terminal.write("Error, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function changeTime() {
    Terminal.write("You move closer to the clock and adjust the hands.\n");
    Terminal.write("Set the time (HH:MM):");
    const newTime = (await Terminal.input()).trim();
    
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (timeRegex.test(newTime)) {
        const [hours, minutes] = newTime.split(":").map(Number);
        const now = new Date();
        now.setHours(hours, minutes, 0, 0);
        
        GameState.baseGameTime = now;
        GameState.timeSetAt = Date.now();
        
        if (hours === 0 && minutes === 0) {
            GameState.timeFrozen = true;
        } else {
            GameState.timeFrozen = false;
        }
        
        Terminal.write(`You set the clock to ${newTime}.\n`, "system-success");
        
        if (hours === 0 && minutes === 0 && !GameState.midnightTriggered) {
            GameState.midnightTriggered = true;
            await triggerMidnightEvent();
        }
    } else {
        Terminal.write("That doesn't seem to be a valid time.\n", "system-alert");
        await ghostEncounter();
    }
}

async function triggerMidnightEvent() {
    await Terminal.print("You hear very distorted creepy sounds, the clock is no longer moving and you feel the ground trembling below you. ");
    await sleep(1000);
    await Terminal.print("Suddenly you hear a clicking noise.");
    await sleep(2000);
    await Terminal.print("It seems you triggered something..\n");
    
    GameState.roomsUnlocked.storage_room = true;
}

// DESK PUZZLE
let deskExtraMenuOption = false;

async function deskPuzzle() {
    await Terminal.print("You approach the desk and notice it's covered in dust and old newspapers.\nBelow the desk, you find a chest.\nNext to the desk, on a separate table there is a gramophone with a record on it.\nAs you sift through the newspapers, you find an article about mysterious disappearances in the house.\nOne headline catches your eye: 'Mysterious disappearances in abandoned house. Authorities baffled as more people go missing without a trace.'\nYou flip through the newspaper and see a small article about a man who was once killed in the house. Since then the place has been haunted.\n");
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Check your leg, see if it's okay.\n" +
            "2 - Play the record.\n" +
            "3 - Open chest.\n";
            
        if (deskExtraMenuOption) {
            menu += "4 - Look at files.\n5 - Go back.\n";
        } else {
            menu += "4 - Go back.\n";
        }
        
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1") {
            checkLegHealth();
        } else if (selection === "2") {
            Terminal.write("You carefully place the needle on the record. The gramophone crackles to life, filling the room with eerie music.\n");
            await playGramophone();
        } else if (selection === "3") {
            await openChest();
        } else if (selection === "4") {
            if (deskExtraMenuOption) {
                await viewFiles();
            } else {
                AudioManager.playSfx("overall/lopen.wav");
                break;
            }
        } else if (selection === "5" && deskExtraMenuOption) {
            AudioManager.playSfx("overall/lopen.wav");
            break;
        } else {
            Terminal.write("Error, try to type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

async function playGramophone() {
    AudioManager.stopBgm();
    AudioManager.playBgm("music/gramaphone.wav");
    
    Terminal.write("The gramophone crackles to life...\n");
    Terminal.write("Type 'stop' to turn it off.\n");
    
    while (true) {
        const cmd = (await Terminal.input()).trim().toLowerCase();
        if (cmd === "stop") {
            AudioManager.stopBgm();
            Terminal.write("The gramophone slowly winds down.\n");
            AudioManager.playBgm("music/theme_song.wav");
            await sleep(2000);
            
            Terminal.write("You see some files in a drawer under the gramophone..\n", "system-success");
            deskExtraMenuOption = true;
            break;
        }
    }
}

async function openChest() {
    Terminal.write("You open the chest to find there are 3 compartments.\nSomeone wrote some information on each compartment:");
    Terminal.write(`
+---------+    +---------+    +---------+
|         |    |         |    |  3%^^*  |
|  WD-40  |    | letter  |    |   -+=-  |
|         |    |         |    |  z-0pr  |
+---------+    +---------+    +---------+
`, "ascii-line");
    Terminal.write("It seems the third one is unreadable.");
    
    let compartmentOpened = false;
    
    while (true) {
        let menu = "What will you do?\n\n" +
            "1 - Open the one with WD-40.\n" +
            '2 - Open the one that says "letter".\n' +
            "3 - Open the unreadable one.\n" +
            "4 - Go back.\n";
            
        Terminal.write(menu);
        const selection = (await Terminal.input()).trim();
        
        if (selection === "1" || selection === "2" || selection === "3") {
            if (compartmentOpened) {
                Terminal.write("Huh, the compartments are locked now..\n", "system-alert");
                continue;
            } else {
                compartmentOpened = true;
            }
        }
        
        if (selection === "1") {
            if (!GameState.inventory.includes("wd-40")) {
                Terminal.write("Hey there actually was a bottle of WD-40 here!\n", "system-success");
                GameState.addInventory("wd-40");
            } else {
                Terminal.write("Hey you shouldn't be able to look twice!\n");
            }
        } else if (selection === "2") {
            Terminal.write("Inside the compartment is a small folded letter.");
            await sleep(1000);
            Terminal.write('It reads: "For all non german speakers. There, where the wanderer is not, is happiness!"\n', "system-info");
        } else if (selection === "3") {
            Terminal.write("You open the unreadable compartment.");
            await ghostEncounter();
        } else if (selection === "4") {
            break;
        } else {
            Terminal.write("Error, type the number associated with the option!\n", "system-alert");
        }
        await checkDeath();
    }
}

// 100 Medical files data (abbreviated/exact mapping)
const medicalFiles = [
    {name: "Margaret Hayes", age: 34, weight: "145 lbs", height: "5'6\"", disease: "Type 2 Diabetes", health_info: "Wears glasses, takes daily insulin injections, regular blood pressure monitoring"},
    {name: "David Coleman", age: 45, weight: "185 lbs", height: "6'1\"", disease: "Hypertension", health_info: "Takes blood pressure medication, overweight, occasional chest discomfort"},
    {name: "Sarah Mitchell", age: 23, weight: "140 lbs", height: "5'5\"", disease: "Lymphoma", health_info: "Experiences visual hallucinations, wears prescription glasses, otherwise physically healthy"},
    {name: "James Peterson", age: 38, weight: "165 lbs", height: "5'9\"", disease: "Asthma", health_info: "Uses inhaler regularly, allergic to pollen and dust, prone to respiratory infections"},
    {name: "Patricia Thompson", age: 41, weight: "155 lbs", height: "5'5\"", disease: "Rheumatoid Arthritis", health_info: "Joint pain in hands and knees, takes anti-inflammatory medication, mobility issues in mornings"},
    {name: "Robert Wells", age: 52, weight: "210 lbs", height: "6'2\"", disease: "Coronary Artery Disease", health_info: "History of heart attacks, takes multiple cardiac medications, limited physical activity"},
    {name: "Emma Rodriguez", age: 28, weight: "130 lbs", height: "5'4\"", disease: "Celiac Disease", health_info: "Strict gluten-free diet required, history of malnutrition, digestive complications"},
    {name: "Christopher Blake", age: 35, weight: "175 lbs", height: "5'11\"", disease:"Epilepsy","health_info":"Seizure disorder, takes anticonvulsant medications, carries medical alert bracelet"},
    {name: "Linda Morrison", age: 44, weight: "165 lbs", height: "5'7\"", disease: "Hypothyroidism", health_info: "Takes levothyroxine daily, fatigue and weight gain, requires regular TSH monitoring"},
    {name: "Michael Chang", age: 16, weight: "140 lbs", height: "5'8\"", disease: "Charles Bonnet Syndrome", health_info: "Experiences complex visual hallucinations, wears contact lenses, normal vision otherwise"},
    {name: "Jennifer White", age: 33, weight: "150 lbs", height: "5'6\"", disease: "Crohn's Disease", health_info: "Inflammatory bowel disease, chronic abdominal pain, frequent digestive issues"},
    {name: "William Anderson", age: 39, weight: "190 lbs", height: "6'0\"", disease: "Sleep Apnea", health_info: "Uses CPAP machine at night, daytime fatigue, snoring, interrupted sleep patterns"},
    {name: "Rachel Green", age: 26, weight: "125 lbs", height: "5'3\"", disease: "Migraine Disorder", health_info: "Chronic migraines with aura, light sensitive, takes preventative medication"},
    {name: "Paul Fisher", age: 42, weight: "205 lbs", height: "6'3\"", disease: "Peripheral Neuropathy", health_info: "Nerve damage in feet and hands, chronic pain, limited dexterity"},
    {name: "Elizabeth Murphy", age: 37, weight: "138 lbs", height: "5'5\"", disease: "Lupus", health_info: "Autoimmune disorder, joint pain, photosensitivity, requires immunosuppressive therapy"},
    {name: "Thomas Harrison", age: 30, weight: "170 lbs", height: "5'10\"", disease: "Cystic Fibrosis", health_info: "Respiratory complications, requires daily treatments, pancreatic insufficiency"},
    {name: "Karen Davis", age: 40, weight: "160 lbs", height: "5'6\"", disease: "Osteoporosis", health_info: "Low bone density, prone to fractures, takes calcium and vitamin D supplements"},
    {name: "Steven Clark", age: 43, weight: "195 lbs", height: "6'1\"", disease: "Chronic Obstructive Pulmonary Disease", health_info: "Former smoker, difficulty breathing, uses oxygen therapy, frequent respiratory infections"},
    {name: "Amanda Foster", age: 25, weight: "120 lbs", height: "5'2\"", disease: "Anemia", health_info: "Iron deficiency, constant fatigue, pale complexion, requires iron supplements"},
    {name: "Nicholas Wright", age: 36, weight: "180 lbs", height: "5'11\"", disease: "Polycystic Kidney Disease", health_info: "Cysts on kidneys, high blood pressure, kidney function declining, requires monitoring"},
    {name: "Victoria Santos", age: 29, weight: "135 lbs", height: "5'5\"", disease: "Fibromyalgia", health_info: "Widespread muscle pain, chronic fatigue, sleep disturbances, takes pain management medication"},
    {name: "Marcus Johnson", age: 41, weight: "200 lbs", height: "6'2\"", disease: "Type 1 Diabetes", health_info: "Autoimmune condition, requires insulin pump, frequent glucose monitoring"},
    {name: "Rebecca Turner", age: 31, weight: "145 lbs", height: "5'6\"", disease: "Psoriasis", health_info: "Skin condition with plaques, requires topical and systemic treatments, sun therapy"},
    {name: "Daniel Martinez", age: 44, weight: "175 lbs", height: "5'10\"", disease: "Parkinson's Disease", health_info: "Progressive neurological disorder, tremors in hands, takes dopamine medication, mobility issues"},
    {name: "Sophia Adams", age: 17, weight: "109 lbs", height: "5'2\"", disease: "Generalized Anxiety Disorder", health_info: "Chronic anxiety, takes SSRI medication, frequent panic attacks, avoids crowded spaces"},
    {name: "Benjamin Scott", age: 38, weight: "182 lbs", height: "5'11\"", disease: "Ulcerative Colitis", health_info: "Inflammatory bowel disease, recurrent abdominal pain, bloody stools, requires immunosuppression"},
    {name: "Charlotte Evans", age: 27, weight: "128 lbs", height: "5'4\"", disease: "Scleroderma", health_info: "Connective tissue disorder, skin hardening, limited joint mobility, takes immune therapy"},
    {name: "Alexander Hall", age: 43, weight: "188 lbs", height: "6'0\"", disease: "Atrial Fibrillation", health_info: "Heart rhythm disorder, takes anticoagulant medication, regular cardiology monitoring"},
    {name: "Isabella Moore", age: 35, weight: "142 lbs", height: "5'5\"", disease: "Hashimoto's Thyroiditis", health_info: "Autoimmune thyroid disease, takes levothyroxine, fatigue, weight sensitivity"},
    {name: "Joseph Brown", age: 40, weight: "192 lbs", height: "6'1\"", disease: "Gout", health_info: "Recurrent joint inflammation, primarily affects feet, takes allopurinol, dietary restrictions"},
    {name: "Olivia Cooper", age: 24, weight: "122 lbs", height: "5'2\"", disease: "Bipolar Disorder", health_info: "Mood cycling between episodes, takes mood stabilizers, requires psychiatric monitoring"},
    {name: "Ethan Phillips", age: 37, weight: "178 lbs", height: "5'10\"", disease: "Inflammatory Bowel Syndrome", health_info: "Chronic digestive symptoms, bloating and cramping, dietary management required"},
    {name: "Ava Jackson", age: 26, weight: "132 lbs", height: "5'4\"", disease: "Sjögren's Syndrome", health_info: "Autoimmune disorder affecting moisture glands, dry eyes and mouth, takes hydroxychloroquine"},
    {name: "Lucas Martin", age: 42, weight: "198 lbs", height: "6'2\"", disease: "Gastroesophageal Reflux Disease", health_info: "Chronic heartburn, takes proton pump inhibitors, dietary modifications needed"},
    {name: "Mia Taylor", age: 28, weight: "125 lbs", height: "5'3\"", disease: "Borderline Personality Disorder", health_info: "Emotional dysregulation, unstable relationships, takes antidepressants"},
    {name: "Noah Garcia", age: 39, weight: "185 lbs", height: "5'11\"", disease: "Chronic Venous Insufficiency", health_info: "Leg swelling and pain, skin discoloration, wears compression stockings"},
    {name: "Emma Wilson", age: 30, weight: "138 lbs", height: "5'5\"", disease: "Dysmenorrhea", health_info: "Severe menstrual cramps, takes NSAIDs, limited activity during periods"},
    {name: "Oliver Lee", age: 41, weight: "190 lbs", height: "6'0\"", disease: "Prostate Hyperplasia", health_info: "Enlarged prostate, frequent urination, takes alpha blockers"},
    {name: "Ava Harris", age: 25, weight: "124 lbs", height: "5'2\"", disease: "Social Anxiety Disorder", health_info: "Severe social withdrawal, takes SSRIs, limited social interaction"},
    {name: "Liam Young", age: 43, weight: "202 lbs", height: "6'3\"", disease: "Metabolic Syndrome", health_info: "Cluster of conditions, overweight, high blood pressure, insulin resistance"},
    {name: "Sophie Allen", age: 32, weight: "148 lbs", height: "5'6\"", disease: "Endometriosis", health_info: "Tissue growth outside uterus, chronic pelvic pain, takes hormonal therapy"},
    {name: "James King", age: 44, weight: "196 lbs", height: "6'1\"", disease: "Polycystic Ovary Syndrome", health_info: "Hormonal disorder, irregular periods, insulin resistance, takes metformin"},
    {name: "Isabella Wright", age: 27, weight: "130 lbs", height: "5'4\"", disease: "Dermatitis Herpetiformis", health_info: "Skin rash related to celiac disease, itching and blistering, requires gluten-free diet"},
    {name: "Mason Lopez", age: 38, weight: "175 lbs", height: "5'9\"", disease: "Chronic Kidney Disease", health_info: "Progressive kidney function decline, requires dialysis monitoring, dietary restrictions"},
    {name: "Charlotte Ross", age: 29, weight: "133 lbs", height: "5'5\"", disease: "Restless Leg Syndrome", health_info: "Uncomfortable leg sensations at night, affects sleep quality, takes dopamine agonists"},
    {name: "Logan Nelson", age: 40, weight: "188 lbs", height: "5'11\"", disease: "Hyperlipidemia", health_info: "High cholesterol levels, takes statins, requires dietary modifications"},
    {name: "Mia Carter", age: 26, weight: "128 lbs", height: "5'3\"", disease: "Seasonal Affective Disorder", health_info: "Winter depression, light therapy, mood improves with seasons"},
    {name: "Aiden Mitchell", age: 42, weight: "194 lbs", height: "6'1\"", disease: "Benign Prostatic Hyperplasia", health_info: "Urinary symptoms, nocturia, takes medication for symptom relief"},
    {name: "Harper Perez", age: 31, weight: "142 lbs", height: "5'5\"", disease: "Menopausal Syndrome", health_info: "Hot flashes and mood changes, takes hormone replacement therapy"},
    {name: "Ethan Roberts", age: 39, weight: "181 lbs", height: "5'10\"", disease: "Erectile Dysfunction", health_info: "Cardiovascular related, takes phosphodiesterase inhibitors"},
    {name: "Ava Garcia", age: 25, weight: "120 lbs", height: "5'2\"", disease: "Alopecia Areata", health_info: "Autoimmune hair loss, takes immunosuppressants, cosmetic management"},
    {name: "Mason Thompson", age: 41, weight: "199 lbs", height: "6'2\"", disease: "Fatty Liver Disease", health_info: "Non-alcoholic liver disease, overweight, requires lifestyle modifications"},
    {name: "Olivia Martinez", age: 12, weight: "105 lbs", height: "5'0\"", disease: "Vulvodynia", health_info: "Chronic pelvic pain, takes topical medications, limited physical activity"},
    {name: "Lucas Anderson", age: 43, weight: "192 lbs", height: "6'0\"", disease: "Varicose Veins", health_info: "Enlarged veins in legs, pain and swelling, wears compression stockings"},
    {name: "Emma Taylor", age: 30, weight: "140 lbs", height: "5'5\"", disease: "Polycystic Kidney Disease", health_info: "Multiple kidney cysts, high blood pressure, requires close monitoring"},
    {name: "Oliver White", age: 38, weight: "179 lbs", height: "5'10\"", disease: "Tension Headaches", health_info: "Chronic headaches, muscle tightness, takes preventative medication"},
    {name: "Sophie Jackson", age: 26, weight: "126 lbs", height: "5'3\"", disease: "Pelvic Inflammatory Disease", health_info: "Recurrent infection history, chronic pelvic pain, requires antibiotic therapy"},
    {name: "Liam Harris", age: 42, weight: "197 lbs", height: "6'1\"", disease: "Enlarged Prostate", health_info: "Urinary dysfunction, nocturia, takes medicinal treatment"},
    {name: "Ava Brown", age: 27, weight: "131 lbs", height: "5'4\"", disease: "Vitamin Deficiency", health_info: "B12 and D deficiency, requires supplementation, fatigue symptoms"},
    {name: "Noah Wilson", age: 40, weight: "186 lbs", height: "5'11\"", disease: "Plantar Fasciitis", health_info: "Heel pain, worse in mornings, wears orthopedic insoles"},
    {name: "Isabella Lee", age: 29, weight: "136 lbs", height: "5'5\"", disease: "Interstitial Cystitis", health_info: "Chronic bladder pain, frequent urination, takes pain management"},
    {name: "Ethan Davis", age: 44, weight: "200 lbs", height: "6'2\"", disease: "Obstructive Sleep Apnea", health_info: "Breathing interruptions during sleep, uses CPAP, daytime sleepiness"},
    {name: "Charlotte King", age: 25, weight: "122 lbs", height: "5'2\"", disease: "Postural Orthostatic Tachycardia Syndrome", "health_info": "Heart rate increases with position changes, takes beta blockers, dizziness"},
    {name: "Mason Young", age: 37, weight: "174 lbs", height: "5'9\"", disease: "Chronic Pancreatitis", "health_info": "Pancreatic inflammation, pain, takes digestive enzymes"},
    {name: "Mia Evans", age: 31, weight: "144 lbs", height: "5'5\"", disease: "Lichen Planus", "health_info": "Inflammatory skin condition, purple papules, requires topical steroids"},
    {name: "Logan Scott", age: 39, weight: "183 lbs", height: "5'10\"", disease: "Bursitis", "health_info": "Joint inflammation, shoulder pain, takes NSAIDs and physical therapy"},
    {name: "Harper Adams", age: 26, weight: "127 lbs", height: "5'3\"", disease: "Dysthymia", "health_info": "Persistent depressive disorder, takes antidepressants long-term"},
    {name: "Aiden Robinson", age: 42, weight: "195 lbs", height: "6'1\"", disease: "Diabetic Neuropathy", "health_info": "Nerve damage from diabetes, foot pain and numbness, requires monitoring"},
    {name: "Sophie Moore", age: 28, weight: "132 lbs", height: "5'4\"", disease: "Recurrent Urinary Tract Infections", "health_info": "Multiple UTI episodes yearly, takes prophylactic antibiotics"},
    {name: "Oliver Murphy", age: 41, weight: "189 lbs", height: "6'0\"", disease: "Pericarditis", "health_info": "Heart membrane inflammation, chest pain, takes anti-inflammatory medication"},
    {name: "Emma Clark", age: 24, weight: "121 lbs", height: "5'1\"", disease: "Hyperthyroidism", "health_info": "Overactive thyroid, takes antithyroid medication, weight loss and tremors"},
    {name: "Lucas Garcia", age: 43, weight: "203 lbs", height: "6'3\"", disease: "Hemophilia", "health_info": "Blood clotting disorder, requires factor replacement therapy, bruising easily"},
    {name: "Ava Phillips", age: 30, weight: "139 lbs", height: "5'5\"", disease: "Amenorrhea", "health_info": "Absent menstrual periods, hormonal imbalance, requires medical investigation"},
    {name: "Noah Harris", age: 38, weight: "177 lbs", height: "5'10\"", disease: "Achilles Tendinitis", "health_info": "Tendon inflammation, ankle pain, requires rest and physical therapy"},
    {name: "Emmanuelle Mimieux", age: 16, weight: "129 lbs", height: "5'4\"", disease: "Cyclic Vomiting Syndrome", "health_info": "The wanderer has recurrent vomiting episodes, he takes preventative medication."},
    {name: "Liam Taylor", age: 40, weight: "191 lbs", height: "6'1\"", disease: "Spondylitis", "health_info": "Spinal inflammation and stiffness, takes TNF inhibitors"},
    {name: "Isabella Carter", age: 29, weight: "137 lbs", height: "5'5\"", disease: "Metatarsalgia", "health_info": "Ball of foot pain, wears specialized footwear, takes pain medication"},
    {name: "Mason Ross", age: 44, weight: "198 lbs", height: "6'1\"", disease: "Hyperparathyroidism", "health_info": "Calcium imbalance, bone pain, requires surgical intervention"},
    {name: "Mia Allen", age: 26, weight: "125 lbs", height: "5'3\"", disease: "Henoch-Schönlein Purpura", "health_info": "Vasculitis disorder, rash and joint pain, takes immunosuppressants"},
    {name: "Oliver Jackson", age: 42, weight: "193 lbs", height: "6'1\"", disease: "Myocardial Infarction History", "health_info": "Previous heart attack, takes multiple cardiac medications, cardiac rehabilitation"},
    {name: "Sophie King", age: 31, weight: "146 lbs", height: "5'6\"", disease: "Hyperemesis Gravidarum", "health_info": "Severe pregnancy nausea, requires medication and IV hydration"},
    {name: "Ethan Brown", age: 37, weight: "180 lbs", height: "5'10\"", disease: "Spontaneous Pneumothorax", "health_info": "Lung collapse history, requires monitoring for recurrence"},
    {name: "Harper Wilson", age: 25, weight: "123 lbs", height: "5'2\"", disease: "Premature Ovarian Failure", "health_info": "Early menopause, takes hormone replacement therapy"},
    {name: "Logan Mitchell", age: 39, weight: "184 lbs", height: "5'11\"", disease: "Tinnitus", "health_info": "Ringing in ears, hearing aids fitted, takes sound therapy"},
    {name: "Ava Davis", age: 28, weight: "134 lbs", height: "5'4\"", disease: "Temporomandibular Joint Disorder", "health_info": "Jaw pain and clicking, wears bite guard, takes muscle relaxants"},
    {name: "Lucas Evans", age: 41, weight: "196 lbs", height: "6'1\"", disease: "Mastoiditis", "health_info": "Ear bone infection history, takes antibiotics, hearing affected"},
    {name: "Emma Robinson", age: 30, weight: "141 lbs", height: "5'5\"", disease: "Steatorrhea", "health_info": "Fatty stools from malabsorption, requires pancreatic enzyme therapy"},
    {name: "Oliver Scott", age: 36, weight: "176 lbs", height: "5'10\"", disease: "Reactive Arthritis", "health_info": "Post-infection joint inflammation, takes NSAIDs and immunosuppressants"}
];

async function viewFiles() {
    Terminal.write("Very odd files lay here, information about people's medical history.\n");
    await sleep(500);
    
    const uvNames = ["Emmanuelle Mimieux", "Michael Chang", "Sarah Mitchell", "Rachel Green", "Sophia Adams", "Charlotte Evans", "Alexander Hall", "Joseph Brown", "Ava Harris", "Liam Young"];
    const hasUv = GameState.inventory.includes("uv_light");
    
    while (true) {
        let html = "<div class='ascii-line'>";
        html += "\n" + "=".repeat(60) + "\nMedical Files Directory:\n\n";
        html += `${'#'.padEnd(4)} ${'Name'.padEnd(25)} ${'Age'.padEnd(6)} ${'Disease'.padEnd(20)}\n`;
        html += "-".repeat(60) + "\n";
        
        medicalFiles.forEach((person, idx) => {
            const numStr = String(idx + 1).padEnd(4);
            const ageStr = String(person.age).padEnd(6);
            const diseaseStr = person.disease.padEnd(20);
            
            if (hasUv && uvNames.includes(person.name)) {
                const paddingCount = Math.max(0, 25 - person.name.length);
                const padding = " ".repeat(paddingCount);
                html += `${numStr} <span class="uv-highlight">${person.name}</span>${padding} ${ageStr} ${diseaseStr}\n`;
            } else {
                html += `${numStr} ${person.name.padEnd(25)} ${ageStr} ${diseaseStr}\n`;
            }
        });
        
        html += "-".repeat(60) + "\n";
        html += `${medicalFiles.length + 1} - Go back\n`;
        html += "</div>";
        
        Terminal.writeHtml(html);
        
        Terminal.write("\nSelect a file to view details (or go back):");
        const choice = (await Terminal.input()).trim();
        
        const choiceNum = parseInt(choice);
        if (choiceNum === medicalFiles.length + 1) {
            break;
        } else if (choiceNum >= 1 && choiceNum <= medicalFiles.length) {
            const p = medicalFiles[choiceNum - 1];
            let details = "\n" + "=".repeat(60) + "\n";
            details += `Medical File - ${p.name}\n`;
            details += "=".repeat(60) + "\n";
            details += `Name:           ${p.name}\n`;
            details += `Age:            ${p.age}\n`;
            details += `Height:         ${p.height}\n`;
            details += `Weight:         ${p.weight}\n`;
            details += `Diagnosed:      ${p.disease}\n`;
            let healthInfo = p.health_info;
            if (p.name === "Emmanuelle Mimieux" && GameState.inventory.includes("uv_light")) {
                healthInfo = "Der wanderer has recurrent vomiting episodes, he takes preventative medication";
            }
            details += `Health Notes:   ${healthInfo}\n`;
            details += "=".repeat(60) + "\n";
            
            Terminal.write(details, "ascii-line");
            Terminal.write("Press Enter to return to file list...");
            await Terminal.input();
        } else {
            Terminal.write("Invalid selection. Please try again.\n", "system-alert");
        }
    }
}

// PAINTING PUZZLE
async function paintingPuzzle() {
    if (GameState.roomsUnlocked.painting_room) {
        Terminal.write("The painting has already moved, revealing the hidden room.\n");
        return;
    }
    
    await Terminal.print(`The look on the man's face, makes it seem as if the man is chasing something.
He has beautiful hair waving in the wind, he wears an elegant brown suit and nice leather shoes.\n`);
    await sleep(500);
    await Terminal.print(`On the other side of the painting is a gorgeous field of long green grass.
The paint in that section seems warmer in colour and you get a happy feeling from it.
It seems as though the man is chasing that feeling.\n`);
    await sleep(500);
    await Terminal.print("Above the painting, someone wrote something in German.\n");
    await sleep(500);
    await Terminal.print(`[Ich wandle still, bin wenig froh,
Und immer fragt der Seufzer, wo?
Im Geisterhauch tönt's mir zurück,
"Dort, wo du nicht bist, dort ist das Glück."]\n`, "system-info");
    await Terminal.print("You notice warmth coming from the painting, you feel weird.\nBeneath the painting, on the wall, are scratch marks.\nYou also notice a certain space meant for something to write on.\n");
    
    if (GameState.inventory.includes("pencil")) {
        Terminal.write("Luckily you have a pencil.\n", "system-success");
        Terminal.write("What will you write down?");
        const answer = (await Terminal.input()).trim().toLowerCase().replace(/\s+/g, "");
        
        if (answer === "derwanderer") {
            Terminal.write("The painting moves out of the way!\n", "system-success");
            GameState.roomsUnlocked.painting_room = true;
        } else {
            Terminal.write("Nothing happens. The painting remains in place.\n", "system-alert");
            await ghostEncounter();
        }
    } else {
        Terminal.write("Too bad you don't have anything to write with.\n", "system-alert");
    }
}

// ENTER PAINTING ROOM
async function enterPaintingRoom() {
    let allCorrect = true;
    
    await Terminal.print("You climb into the tight space behind the painting.");
    await sleep(500);
    await Terminal.print("It is a very tight space and you are crawling. You feel heat coming from the end.\nBehind you the painting closes.\nAs the heat rises, you begin to think maybe this was not such a good idea after all...\n");
    await sleep(500);
    await Terminal.print("Suddenly, you hear a voice echoing around you: 'Welcome, normally I bake my sourdough here, but I guess you will do.'\nIf you can correctly answer my questions, I will let you go.\n", "system-alert");
    await sleep(500);
    
    await Terminal.print("'Which animal is on the wall in the main room?'\n");
    const ans1 = (await Terminal.input()).trim().toLowerCase().replace(/\s+/g, "");
    
    if (ans1 === "lion") {
        Terminal.write("'Correct! Now for the next question.'\n", "system-success");
    } else {
        allCorrect = false;
        Terminal.write("'Wrong! I guess for you to turn golden brown I need a little more heat..'\n", "system-alert");
        GameState.setHealth(GameState.health - 25);
        Terminal.write("You lost 25 hp.\n", "system-alert");
        await checkDeath();
        Terminal.write("'Let's continue.'\n");
    }
    
    await sleep(500);
    await Terminal.print("'What lies on the desk?'\n");
    const ans2 = (await Terminal.input()).trim().toLowerCase().replace(/\s+/g, "");
    
    if (ans2 === "newspapers" || ans2 === "oldnewspapers") {
        Terminal.write("'Correct again! You are quite clever.'\n", "system-success");
    } else {
        allCorrect = false;
        Terminal.write("'Wrong! You seem to love saunas!'\n", "system-alert");
        GameState.setHealth(GameState.health - 25);
        Terminal.write("You lost 25 hp.\n", "system-alert");
        await checkDeath();
        Terminal.write("'Let's continue.'\n");
    }
    
    await sleep(500);
    await Terminal.print("'Final question: From which material is the door made where a carpet lies?'\n");
    const ans3 = (await Terminal.input()).trim().toLowerCase().replace(/\s+/g, "");
    
    if (ans3 === "gold") {
        await Terminal.print("'Impressive! You may leave now, next time think twice before you wander through uncharted territories.'\n", "system-success");
        await sleep(500);
        Terminal.write("You crawl back out from behind the painting, relieved to be out of the heat.\n");
    } else {
        allCorrect = false;
        Terminal.write("'Wrong! I guess you will be my sourdough after all!'\n", "system-alert");
        GameState.setHealth(GameState.health - 25);
        Terminal.write("You lost 25 hp.\n", "system-alert");
        await checkDeath();
        await sleep(500);
        Terminal.write("You crawl back out from behind the painting, feeling quite weak from the heat.\n");
    }
    
    if (allCorrect) {
        GameState.roomsUnlocked.hidden_room = true;
        GameState.roomsUnlocked.enddoor_room = true;
        Terminal.write("You hear a faint noise.\n", "system-success");
    }
}

// ==========================================================================
// GHOST ENCOUNTER COMBAT ENGINE
// ==========================================================================
async function ghostEncounter() {
    AudioManager.stopBgm();
    AudioManager.playBgm("music/battle_music.wav");
    
    let ghostHp = 5;
    let lowHealthPlaying = false;
    let lowHealthAudio = null;
    
    AudioManager.playSfx("ghost_encounter/ghost_entry.wav");
    await sleep(500);
    
    await Terminal.print("\nThe air grows cold...\n", "system-alert");
    await sleep(1000);
    await Terminal.print("A ghost emerges from the darkness.\n\n", "system-alert");
    
    while (ghostHp > 0) {
        const attackTypes = ["scare", "attack", "charge"];
        const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
        
        if (attackType === "scare") {
            AudioManager.playSfx("ghost_encounter/scare.mp3");
            await Terminal.print("The ghost tries to scare you with haunting sounds.\n");
        } else if (attackType === "attack") {
            AudioManager.playSfx("ghost_encounter/fast_attack.wav");
            await Terminal.print("The ghost raises its arm for a quick attack!\n");
        } else {
            AudioManager.playSfx("ghost_encounter/charge-attack.wav");
            await Terminal.print("The ghost gathers energy... it is charging!\n");
        }
        
        await sleep(1000);
        
        let menu = "What will you do?\n\n1 - Attack\n2 - Dodge\n3 - Block\n";
        if (GameState.inventory.includes("potion")) {
            menu += "4 - Use potion\n";
        }
        
        Terminal.write(menu);
        const choice = (await Terminal.input()).trim();
        
        if (choice === "1") {
            const weapon = await chooseWeapon();
            const { hitChance, damage } = getWeaponStats(weapon);
            
            if (Math.random() < hitChance) {
                playWeaponSound(weapon);
                AudioManager.playSfx("ghost_encounter/ghost_hurt.mp3");
                Terminal.write(`Your ${weapon} hits the ghost!\n`, "system-success");
                ghostHp -= damage;
            } else {
                AudioManager.playSfx("ghost_encounter/damaged_player.mp3");
                Terminal.write("You miss and the ghost hits you!\n", "system-alert");
                GameState.setHealth(GameState.health - 15);
            }
        } else if (choice === "2") {
            const dodgeChance = 1.0 - (!GameState.legOkay ? 0.5 : 0);
            if (Math.random() < dodgeChance) {
                AudioManager.playSfx("ghost_encounter/dodge.mp3");
                Terminal.write("You dodge successfully!\n", "system-success");
                
                if (attackType === "charge") {
                    AudioManager.playSfx("ghost_encounter/fists.wav");
                    AudioManager.playSfx("ghost_encounter/ghost_hurt.mp3");
                    Terminal.write("You counterattack while the ghost is off balance!\n", "system-success");
                    ghostHp -= 1;
                }
            } else {
                Terminal.write("You fail to dodge!\n", "system-alert");
                AudioManager.playSfx("ghost_encounter/damaged_player.mp3");
                GameState.setHealth(GameState.health - 15);
            }
        } else if (choice === "3") {
            if (attackType === "attack") {
                AudioManager.playSfx("ghost_encounter/block.mp3");
                AudioManager.playSfx("ghost_encounter/ghost_hurt.mp3");
                Terminal.write("You block the attack and hurt the ghost!\n", "system-success");
                ghostHp -= 1;
            } else {
                Terminal.write("The attack breaks through your block!\n", "system-alert");
                AudioManager.playSfx("ghost_encounter/damaged_player.mp3");
                GameState.setHealth(GameState.health - 10);
            }
        } else if (choice === "4" && GameState.inventory.includes("potion")) {
            AudioManager.playSfx("ghost_encounter/potion.mp3");
            GameState.removeInventory("potion");
            GameState.setHealth(GameState.health + 50);
            Terminal.write("You healed 50 HP.\n", "system-success");
        } else {
            Terminal.write("You freeze up!\n", "system-alert");
            GameState.setHealth(GameState.health - 5);
        }
        
        await checkDeath();
        
        // Low health loop
        if (GameState.health > 0 && GameState.health <= 20) {
            if (!lowHealthPlaying) {
                lowHealthPlaying = true;
                lowHealthAudio = new Audio("static/music/health/health_low.mp3");
                lowHealthAudio.loop = true;
                lowHealthAudio.volume = AudioManager.isMuted ? 0 : 0.8;
                lowHealthAudio.play().catch(e => console.log("Low health sound failed:", e));
            }
        } else {
            if (lowHealthPlaying) {
                lowHealthPlaying = false;
                if (lowHealthAudio) {
                    lowHealthAudio.pause();
                    lowHealthAudio = null;
                }
            }
        }
        
        Terminal.write(`Your health: ${GameState.health}/${GameState.maxHealth} | Ghost HP: ${Math.max(0, Math.ceil(ghostHp))}\n`);
    }
    
    if (lowHealthPlaying && lowHealthAudio) {
        lowHealthAudio.pause();
    }
    
    AudioManager.playSfx("ghost_encounter/ghost_death.mp3");
    await Terminal.print("\nThe ghost screams and dissolves into mist...\n", "system-success");
    Terminal.write("You are alone again.\n\n");
    
    AudioManager.playBgm("music/theme_song.wav");
}

async function chooseWeapon() {
    let weapons = ["fists"];
    if (GameState.inventory.includes("wooden_plank")) {
        weapons.push("wooden plank");
    }
    if (GameState.inventory.includes("pistol") && GameState.inventory.includes("ammo")) {
        weapons.push("pistol");
    }
    
    if (weapons.length === 1) return "fists";
    
    Terminal.write("\nChoose your weapon:\n");
    for (let i = 0; i < weapons.length; i++) {
        Terminal.write(`${i + 1} - ${weapons[i]}`);
    }
    
    const choice = (await Terminal.input()).trim();
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < weapons.length) {
        return weapons[idx];
    }
    return "fists";
}

function getWeaponStats(weapon) {
    let base = [0.7, 1.0];
    if (weapon === "pistol") base = [0.8, 2.5];
    else if (weapon === "wooden plank") base = [0.95, 1.5];
    
    const mult = DIFFICULTY_MULTIPLIERS[GameState.difficulty] || 1.0;
    return {
        hitChance: base[0],
        damage: base[1] * mult
    };
}

function playWeaponSound(weapon) {
    const sounds = {
        "fists": "ghost_encounter/fists.wav",
        "pistol": "ghost_encounter/pistol.mp3",
        "wooden plank": "ghost_encounter/wooden_plank_attack.mp3"
    };
    if (sounds[weapon]) {
        AudioManager.playSfx(sounds[weapon]);
    }
}

// ==========================================================================
// SYSTEM INITIALIZATION
// ==========================================================================
window.addEventListener("DOMContentLoaded", () => {
    // Initialize terminal structures
    Terminal.init();
    
    // Initialize sidebar status and inventory
    updateSidebar();
    
    // Mute button logic
    const muteBtn = document.getElementById("mute-btn");
    if (muteBtn) {
        muteBtn.addEventListener("click", () => {
            AudioManager.toggleMute();
        });
    }
    
    // Boot Overlay click
    const bootBtn = document.getElementById("boot-btn");
    const overlay = document.getElementById("boot-overlay");
    if (bootBtn && overlay) {
        bootBtn.addEventListener("click", () => {
            overlay.classList.add("hidden");
            // Warm up audio contexts on button click
            AudioManager.playBgm("music/theme_song.wav");
            startGame();
        });
    }
});
