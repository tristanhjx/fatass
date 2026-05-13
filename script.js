// --- Constants & State ---
const STORAGE_KEY = 'fatass_reviews_v3';
const CUISINE_LIST_KEY = 'fatass_cuisines_list_v3';
const AUTHOR_LIST_KEY = 'fatass_authors_v3';
const WHEEL_CUISINES_KEY = 'fatass_wheel_cuisines_v3';
const HISTORY_KEY = 'fatass_history_v3';
const TIER_KEY = 'fatass_tiers_v1';

let reviews = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let cuisineList = JSON.parse(localStorage.getItem(CUISINE_LIST_KEY)) || ["Hawker / Local", "Japanese", "Italian", "Thai", "Western", "Chinese", "Korean", "Indian"];
let authorList = JSON.parse(localStorage.getItem(AUTHOR_LIST_KEY)) || [];
let spinHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
let tierData = JSON.parse(localStorage.getItem(TIER_KEY)) || {S:[], A:[], B:[], C:[], D:[], F:[]};

let spinning = false;
let currentAngle = 0;
let pendingRemove = null;
let editMode = false;

const PALETTE = ['#c87941', '#4a9d9c', '#b05070', '#c8a041', '#8a6cc8', '#41a06c', '#6c8ac8', '#c85a5a', '#5a9ec8', '#9d7a4a'];
let wheelCuisines = JSON.parse(localStorage.getItem(WHEEL_CUISINES_KEY)) || [
    {label:'Hawker', color:'#c87941'}, {label:'Japanese', color:'#4a9d9c'}, {label:'Korean', color:'#b05070'},
    {label:'Chinese', color:'#c8a041'}, {label:'Indian', color:'#8a6cc8'}, {label:'Thai', color:'#41a06c'},
    {label:'Western', color:'#6c8ac8'}, {label:'Italian', color:'#c85a5a'}
];

// --- Slider & Color Logic ---
const slider = document.getElementById('ratingSlider');
const display = document.getElementById('ratingValueDisplay');

function getTierColor(v) {
    if (v >= 9.0) return '#c87941';
    if (v >= 8.0) return '#4a9d9c';
    if (v >= 7.0) return '#4a7a9d';
    if (v >= 6.0) return '#6a6a6a';
    if (v >= 4.5) return '#3a3a3a';
    return '#c84a4a';
}

function getRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function getInvertedColor(hex) {
    const { r, g, b } = getRGB(hex);
    const invR = (255 - r).toString(16).padStart(2, '0');
    const invG = (255 - g).toString(16).padStart(2, '0');
    const invB = (255 - b).toString(16).padStart(2, '0');
    return `#${invR}${invG}${invB}`;
}

if (slider) {
    slider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value).toFixed(1);
        const currentColor = getTierColor(v);
        const invertedColor = getInvertedColor(currentColor);

        display.textContent = v;
        display.style.color = currentColor;
        display.style.backgroundColor = invertedColor;
        slider.style.accentColor = currentColor;
    });
}

// --- Navigation ---
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    
    // Add active class to nav buttons
    const navMap = { 'reviews': 0, 'spin': 1, 'tier': 2, 'add': 3 };
    if (id in navMap) document.querySelectorAll('.nav-btn')[navMap[id]].classList.add('active');

    if (id === 'reviews') renderReviews();
    if (id === 'tier') { renderTierBoard(); populateTierSelect(); }
    if (id === 'spin') { renderWheel(); renderHistory(); renderCuisineView(); renderCuisineEditList(); }
}

// --- Review Logic ---
async function submitReview() {
    const name = document.getElementById('inp-name').value.trim();
    const loc = document.getElementById('inp-loc').value.trim();
    const cuisine = document.getElementById('inp-cuisine').value;
    const author = document.getElementById('inp-author').value.trim();
    const text = document.getElementById('inp-review').value.trim();
    const rating = parseFloat(slider.value);
    const imgFile = document.getElementById('inp-img').files[0];

    if (!name || !cuisine || !author) return showToast('Fill in the basics!');

    let imgBase64 = "";
    if (imgFile) {
        imgBase64 = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(imgFile);
        });
    }

    reviews.push({ id: Date.now(), name, loc, cuisine, author, rating, text, img: imgBase64, date: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
    
    showToast('Review posted!');
    showPage('reviews');
}

function renderReviews() {
    const grid = document.getElementById('restGrid');
    grid.innerHTML = [...reviews].sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => `
        <div class="rest-card">
            <div class="tag">${r.cuisine}</div>
            <h3>${r.name}</h3>
            <div class="location">📍 ${r.loc}</div>
            <div class="rating-val" style="color:${getTierColor(r.rating)}">
                ${r.rating.toFixed(1)} <span class="review-count">by ${r.author}</span>
            </div>
            <div class="snippet">${r.text}</div>
            ${r.img ? `<img src="${r.img}" class="review-img">` : ''}
        </div>`).join('');
}

// --- Tier List Logic ---
function populateTierSelect() {
    const sel = document.getElementById('tier-select-rest');
    sel.innerHTML = '<option value="">— pick a restaurant —</option>';
    reviews.forEach(r => sel.innerHTML += `<option value="${r.id}">${r.name}</option>`);
}

function addToTier() {
    const restId = parseInt(document.getElementById('tier-select-rest').value);
    const tier = document.getElementById('tier-select-tier').value;
    if (!restId) return showToast('Pick a restaurant first!');

    const rest = reviews.find(r => r.id === restId);
    ['S', 'A', 'B', 'C', 'D', 'F'].forEach(t => { tierData[t] = tierData[t].filter(x => x.id !== restId); });
    tierData[tier].push({ id: restId, name: rest.name });
    
    localStorage.setItem(TIER_KEY, JSON.stringify(tierData));
    renderTierBoard();
    showToast(`${rest.name} ranked!`);
}

function renderTierBoard() {
    ['S', 'A', 'B', 'C', 'D', 'F'].forEach(t => {
        const el = document.getElementById('tier-' + t);
        if (!tierData[t] || !tierData[t].length) {
            el.innerHTML = '<span class="history-empty">empty</span>';
            return;
        }
        el.innerHTML = tierData[t].map(x => `<div class="tier-chip">${x.name}</div>`).join('');
    });
}

// --- Spin the Wheel Logic ---
function renderWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (canvas) drawWheel(canvas.getContext('2d'), currentAngle);
}

function drawWheel(ctx, angle) {
    const cx = 170, cy = 170, r = 155, n = wheelCuisines.length;
    if (!n) return;
    const arc = 2 * Math.PI / n;
    ctx.clearRect(0, 0, 340, 340);
    wheelCuisines.forEach((c, i) => {
        const start = angle + i * arc, end = start + arc;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, end); ctx.closePath();
        ctx.fillStyle = c.color; ctx.fill();
        ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(start + arc / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Monaco,monospace';
        ctx.fillText(c.label, r - 10, 4); ctx.restore();
    });
    // Center pin
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 2 * Math.PI); ctx.fillStyle = '#1e1e1e'; ctx.fill();
    ctx.strokeStyle = '#c87941'; ctx.lineWidth = 2; ctx.stroke();
    // Indicator
    ctx.beginPath(); ctx.moveTo(cx, cy - r - 5); ctx.lineTo(cx - 10, cy - r + 14); ctx.lineTo(cx + 10, cy - r + 14);
    ctx.closePath(); ctx.fillStyle = '#e8e4dc'; ctx.fill();
}

function spinWheel() {
    if (spinning || !wheelCuisines.length) return;
    spinning = true;
    document.getElementById('spinBtn').disabled = true;
    const canvas = document.getElementById('wheelCanvas'), ctx = canvas.getContext('2d');
    const extraSpins = 10 + Math.random() * 5, totalRot = Math.PI * 2 * extraSpins, duration = 6500, start = performance.now(), startAngle = currentAngle;

    function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        currentAngle = startAngle + totalRot * (1 - Math.pow(1 - t, 4));
        drawWheel(ctx, currentAngle);
        if (t < 1) requestAnimationFrame(frame);
        else {
            spinning = false;
            document.getElementById('spinBtn').disabled = false;
            const arc = 2 * Math.PI / wheelCuisines.length;
            const adjusted = (((-Math.PI / 2) - currentAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const idx = Math.floor(adjusted / arc) % wheelCuisines.length;
            showSpinResult(wheelCuisines[idx], idx);
        }
    }
    document.getElementById('wheelResult').innerHTML = '<div class="cuisine-sub">spinning...</div>';
    requestAnimationFrame(frame);
}

function showSpinResult(c, idx) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
    spinHistory.unshift({ label: c.label, color: c.color, time: timeStr });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory.slice(0, 20)));
    renderHistory();
    document.getElementById('wheelResult').innerHTML = `<div class="cuisine-name" style="color:${c.color}">${c.label}</div><div class="cuisine-sub">fate has spoken</div>`;
    document.getElementById('resultActions').innerHTML = `<button class="btn btn-danger" style="font-size:10px;padding:5px 10px;" onclick="promptRemove(${idx})">Remove from wheel</button>`;
}

// --- History & Cuisine Management ---
function renderHistory() {
    document.getElementById('historyList').innerHTML = spinHistory.map(h => `
        <div class="history-item"><span style="color:${h.color}">${h.label}</span><span class="history-time">${h.time}</span></div>
    `).join('') || '<span class="history-empty">no spins</span>';
}

function clearHistory() { spinHistory = []; localStorage.removeItem(HISTORY_KEY); renderHistory(); }

function toggleEdit() {
    editMode = !editMode;
    document.getElementById('cuisineViewList').style.display = editMode ? 'none' : 'block';
    document.getElementById('cuisineEditPanel').style.display = editMode ? 'block' : 'none';
}

function renderCuisineView() {
    document.getElementById('cuisineViewList').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;">` +
        wheelCuisines.map(c => `<span style="border:1px solid ${c.color};color:${c.color};font-size:10px;padding:2px 5px;">${c.label}</span>`).join('') + `</div>`;
}

function renderCuisineEditList() {
    document.getElementById('cuisineEditList').innerHTML = wheelCuisines.map((c, i) => `
        <div class="cuisine-edit-item"><div class="cuisine-color-dot" style="background:${c.color}"></div><span>${c.label}</span><button onclick="removeCuisine(${i})">✕</button></div>
    `).join('');
}

function addCuisine() {
    const i = document.getElementById('newCuisineInput'), l = i.value.trim();
    if (!l) return;
    wheelCuisines.push({ label: l, color: PALETTE[wheelCuisines.length % PALETTE.length] });
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
    i.value = ''; renderWheel(); renderCuisineView(); renderCuisineEditList();
}

function removeCuisine(i) {
    wheelCuisines.splice(i, 1);
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
    renderWheel(); renderCuisineView(); renderCuisineEditList();
}

// --- Modal & Toast ---
function promptRemove(i) {
    pendingRemove = i;
    document.getElementById('removeModalText').textContent = `Remove ${wheelCuisines[i].label}?`;
    document.getElementById('removeModal').classList.add('show');
}

function confirmRemove() {
    wheelCuisines.splice(pendingRemove, 1);
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
    closeModal(); renderWheel();
    document.getElementById('wheelResult').innerHTML = '<div class="cuisine-sub">removed</div>';
}

function closeModal() { document.getElementById('removeModal').classList.remove('show'); }

function showToast(m) {
    const t = document.getElementById('toast');
    t.textContent = m; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

// --- Global Initialization ---
window.onload = () => {
    renderReviews();
    renderWheel();
    renderTierBoard();
};
