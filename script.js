const API_URL = "https://api.groq.com/openai/v1/chat/completions";

let characters = JSON.parse(localStorage.getItem('real_chats_app')) || [
    { id: '1', name: 'Ike', traits: 'Sarcastic, deeply cares but acts distant, uses lowercase.' }
];

let activeChatId = null;
let editingCharId = null;
let pendingNotifChatId = null;

let silenceTimer = null;
let aiResponseDebounceTimer = null;
let activeTimeouts = [];

function updateStatusBarTime() {
    const now = new Date();
    document.getElementById('statusBarTime').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateStatusBarTime, 1000);
updateStatusBarTime();

function getCurrentRealTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function saveData() {
    localStorage.setItem('real_chats_app', JSON.stringify(characters));
}

function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (type === 'sent') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } else if (type === 'received') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }
    } catch (e) { console.error(e); }
}

function triggerNotification(charId, name, text) {
    pendingNotifChatId = charId;
    document.getElementById('notifTitle').textContent = name;
    document.getElementById('notifText').textContent = text;

    const banner = document.getElementById('notifBanner');
    banner.classList.add('show');
    playSound('received');

    setTimeout(() => { banner.classList.remove('show'); }, 4000);
}

function clickNotif() {
    if (pendingNotifChatId) {
        document.getElementById('notifBanner').classList.remove('show');
        openChatRoom(pendingNotifChatId);
    }
}

function renderChatList() {
    const list = document.getElementById('chatList');
    list.innerHTML = '';

    characters.forEach(c => {
        const item = document.createElement('div');
        item.className = 'chat-card';
        item.innerHTML = `
          <div onclick="openChatRoom('${c.id}')" style="flex:1;">
            <h4 style="font-size:1rem; margin-bottom:4px;">${c.name}</h4>
            <p style="font-size:0.8rem; color:#a0a0b0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:240px;">${c.traits || 'Click to text'}</p>
          </div>
          <button style="background:none; border:none; color:#a0a0b0; font-size:1rem; cursor:pointer;" onclick="openModal('${c.id}')">✏️</button>
        `;
        list.appendChild(item);
    });
}

function openModal(id = null) {
    editingCharId = id;
    if (id) {
        const c = characters.find(ch => ch.id === id);
        document.getElementById('cName').value = c.name;
        document.getElementById('cTraits').value = c.traits || '';
    } else {
        document.getElementById('cName').value = '';
        document.getElementById('cTraits').value = '';
    }
    document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    editingCharId = null;
}

function saveCharacter() {
    const name = document.getElementById('cName').value.trim();
    const traits = document.getElementById('cTraits').value.trim();
    if (!name) return alert('Name required');

    if (editingCharId) {
        const c = characters.find(ch => ch.id === editingCharId);
        c.name = name;
        c.traits = traits;
    } else {
        characters.push({ id: Date.now().toString(), name, traits, history: [] });
    }

    saveData();
    closeModal();
    renderChatList();
}

function showHomeScreen() {
    document.getElementById('chatScreen').classList.remove('active');
    document.getElementById('homeScreen').classList.add('active');
    activeChatId = null;
}

function openChatRoom(id) {
    activeChatId = id;
    const c = characters.find(ch => ch.id === id);
    document.getElementById('chatTitle').textContent = c.name;

    document.getElementById('homeScreen').classList.remove('active');
    document.getElementById('chatScreen').classList.add('active');

    renderMessages();
}

function renderMessages() {
    const c = characters.find(ch => ch.id === activeChatId);
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    if (!c.history) c.history = [];

    c.history.forEach(m => {
        const timeStr = m.time || getCurrentRealTime();
        if (m.role === 'user') {
            addMessageUI(m.content, 'sent', false, timeStr);
        } else {
            const subBubbles = m.content.split('||').map(b => b.trim()).filter(b => b.length > 0);
            subBubbles.forEach(bText => {
                addMessageUI(bText, 'received', false, timeStr);
            });
        }
    });
    container.scrollTop = container.scrollHeight;
}

async function sendMessage(userMessage) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: 'user', content: userMessage }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        const botReply = data.choices[0].message.content;
        return botReply;

    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

function addMessageUI(text, sender, isNew = true, timeStr = null) {
    const container = document.getElementById('chatMessages');
    const group = document.createElement('div');
    group.className = `msg-group ${sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    group.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const timeSpan = document.createElement('span');
    timeSpan.textContent = timeStr || getCurrentRealTime();
    meta.appendChild(timeSpan);

    if (sender === 'sent') {
        const statusSpan = document.createElement('span');
        statusSpan.textContent = isNew ? '• Sent' : '• Read';
        meta.appendChild(statusSpan);

        if (isNew) {
            setTimeout(() => { statusSpan.textContent = '• Read'; }, 1000 + Math.random() * 1000);
        }
    }

    group.appendChild(meta);
    container.appendChild(group);
    container.scrollTop = container.scrollHeight;

    if (isNew) {
        if (sender === 'sent') playSound('sent');
        else if (sender === 'received') playSound('received');
    }

    return group;
}

function clearHistory() {
    const c = characters.find(ch => ch.id === activeChatId);
    if (confirm(`Clear chat with ${c.name}?`)) {
        c.history = [];
        saveData();
        renderMessages();
    }
}

function clearPendingTimeouts() {
    activeTimeouts.forEach(t => clearTimeout(t));
    activeTimeouts = [];
}

function resetSilenceTimer(charId) {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
        triggerAutoFollowUp(charId);
    }, 25000);
}

async function triggerAutoFollowUp(charId) {
    const c = characters.find(ch => ch.id === charId);
    if (!c || !c.history || c.history.length === 0) return;

    const followUpPrompt = `You are roleplaying as ${c.name}.
PERSONALITY: ${c.traits || 'Casual'}

SITUATION: The user suddenly stopped replying.
INSTRUCTION: Send 2 to 3 short texts checking on them or apologizing.
CRITICAL FORMAT RULE: Separate EVERY short sentence with " || ". Never write a long paragraph.`;

    fetchAiResponse(c, followUpPrompt);
}

function scheduleAiResponse(charId) {
    if (aiResponseDebounceTimer) clearTimeout(aiResponseDebounceTimer);
    clearPendingTimeouts();

    aiResponseDebounceTimer = setTimeout(() => {
        const c = characters.find(ch => ch.id === charId);
        if (!c) return;

        const typingEl = document.getElementById('typingIndicator');
        if (activeChatId === charId) typingEl.style.display = 'block';

        const systemPrompt = `You are roleplaying as ${c.name} in a realistic mobile chat app.
PERSONALITY & CHARACTER TRAITS:
${c.traits || 'Casual texting style.'}

CRITICAL TEXTING FORMAT RULES:
1. NEVER send a single long paragraph or long sentence.
2. BREAK your thoughts into 2 to 4 SHORT separate text messages.
3. ALWAYS separate each short text message using " || ".
4. Example format:
what are u talking about? || i don't know what u mean || what girl? || i'm right here texting u
5. NO asterisks, NO quotation marks. Just short text messages.`;

        const typingDuration = 2000 + Math.random() * 1500;

        const t = setTimeout(() => {
            fetchAiResponse(c, systemPrompt);
        }, typingDuration);

        activeTimeouts.push(t);
    }, 2500);
}

/* 🛠️ HELPER AUTO-SPLITTER: สปลิตประโยคอัตโนมัติถ้า AI ลืมใส่ || */
function smartSplitText(rawText) {
    if (rawText.includes('||')) {
        return rawText.split('||').map(b => b.trim()).filter(b => b.length > 0);
    }

    // ถ้า AI ลืมใส่ || ให้ใช้เครื่องหมาย ?, !, . หรือคำเชื่อมหั่นประโยคให้อัตโนมัติ
    const autoChunks = rawText.match(/[^.!?]+[.!?]+/g) || [rawText];
    if (autoChunks.length > 1) {
        return autoChunks.map(b => b.trim()).filter(b => b.length > 0);
    }

    // ถ้าสั้นอยู่แล้วก็ส่งกลับเป็น 1 บับเบิ้ล
    return [rawText];
}

async function fetchAiResponse(character, systemPrompt) {
    const typingEl = document.getElementById('typingIndicator');

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...character.history.map(m => ({ role: m.role, content: m.content })).slice(-12)
                ],
                temperature: 0.95
            })
        });

        const data = await res.json();
        typingEl.style.display = 'none';

        if (data.choices && data.choices[0] && data.choices[0].message.content) {
            const rawReply = data.choices[0].message.content.trim();

            // 🛠️ ใช้อย่างแม่นยำด้วย Smart Splitter
            const bubbles = smartSplitText(rawReply);
            const replyTime = getCurrentRealTime();

            bubbles.forEach(bText => {
                character.history.push({ role: 'assistant', content: bText, time: replyTime });
            });
            saveData();

            // ทยอยส่งทีละบับเบิ้ลโดยเว้นช่วงสั้นๆ 1.2 - 2.5 วินาที
            let accumulatedDelay = 0;
            bubbles.forEach((bText) => {
                accumulatedDelay += 1200 + Math.random() * 1300;

                const t = setTimeout(() => {
                    if (activeChatId !== character.id) {
                        triggerNotification(character.id, character.name, bText);
                    } else {
                        addMessageUI(bText, 'received', true, replyTime);
                    }
                }, accumulatedDelay);

                activeTimeouts.push(t);
            });

            resetSilenceTimer(character.id);
        }
    } catch (err) {
        typingEl.style.display = 'none';
        console.error("❌ AI ERROR:", err);
        alert("AI Error: " + err.message);
    }
}

document.getElementById('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('userInput');
    const text = input.value.trim();
    if (!text || !activeChatId) return;

    const c = characters.find(ch => ch.id === activeChatId);
    if (!c.history) c.history = [];

    const timeNow = getCurrentRealTime();
    addMessageUI(text, 'sent', true, timeNow);
    c.history.push({ role: 'user', content: text, time: timeNow });
    input.value = '';
    saveData();

    scheduleAiResponse(c.id);
    renderChatList();
});