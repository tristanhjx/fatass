// --- 1. Photo Optimization Helper ---
async function resizeImage(file, maxWidth = 1024) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            };
        };
    });
}

// --- 2. Constants & State ---
const WHEEL_CUISINES_KEY = 'fatass_wheel_cuisines_v3';
const HISTORY_KEY = 'fatass_history_v3';

let reviews = []; 
let tierData = {S:[], A:[], B:[], C:[], D:[], F:[]};
let spinHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];

let spinning = false;
let currentAngle = 0;
let pendingRemove = null;
let editMode = false;
let currentEditId = null;

const PALETTE = ['#c87941', '#4a9d9c', '#b05070', '#c8a041', '#8a6cc8', '#41a06c', '#6c8ac8', '#c85a5a', '#5a9ec8', '#9d7a4a'];
let wheelCuisines = JSON.parse(localStorage.getItem(WHEEL_CUISINES_KEY)) || [
    {label:'Hawker', color:'#c87941'}, {label:'Japanese', color:'#4a9d9c'}, {label:'Korean', color:'#b05070'},
    {label:'Chinese', color:'#c8a041'}, {label:'Indian', color:'#8a6cc8'}, {label:'Thai', color:'#41a06c'},
    {label:'Western', color:'#6c8ac8'}, {label:'Italian', color:'#c85a5a'}
];

// --- 3. UI & Color Logic ---
const slider = document.getElementById('ratingSlider');
const display = document.getElementById('ratingValueDisplay');

function getDynamicColor(value) {
    const v = parseFloat(value);
    let r, g, b;
    if (v <= 5) {
        const ratio = v / 5;
        r = 230 + (255 - 230) * ratio; g = 50 + (180 - 50) * ratio; b = 50 + (50 - 50) * ratio;
    } else {
        const ratio = (v - 5) / 5;
        r = 255 + (74 - 255) * ratio; g = 180 + (157 - 180) * ratio; b = 50 + (156 - 50) * ratio;
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function getTierColor(v) {
    return getDynamicColor(v);
}

if (slider) {
    const updateSlider = () => {
        const v = parseFloat(slider.value).toFixed(1);
        const newColor = getDynamicColor(v);
        display.textContent = v;
        display.style.color = newColor;
        slider.style.accentColor = newColor;
    };
    slider.addEventListener('input', updateSlider);
    updateSlider();
}

// --- 4. Navigation & Firebase Sync ---
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    
    const navMap = { 'reviews': 0, 'spin': 1, 'tier': 2, 'add': 3 };
    if (id in navMap) document.querySelectorAll('.nav-btn')[navMap[id]].classList.add('active');

    if (id === 'spin') { renderWheel(); renderHistory(); renderCuisineView(); renderCuisineEditList(); }
}

function syncWithFirebase() {
    db.collection('reviews').orderBy('date', 'desc').onSnapshot(snapshot => {
        reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tierData = {S:[], A:[], B:[], C:[], D:[], F:[]};
        reviews.forEach(r => autoMapToTier(r));
        renderReviews();
        renderTierBoard();
    });
}

// --- 5. Review Logic ---
async function submitReview() {
    const name = document.getElementById('inp-name').value.trim();
    const region = document.getElementById('inp-region').value;
    const town = document.getElementById('inp-town').value.trim();
    const link = document.getElementById('inp-link').value.trim();
    const cuisine = document.getElementById('inp-cuisine').value.trim();
    const author = document.getElementById('inp-author').value.trim();
    const text = document.getElementById('inp-review').value.trim();
    const rating = parseFloat(slider.value);
    const imgFile = document.getElementById('inp-img').files[0];

    if (!name || !region || !town || !cuisine || !author) return showToast('Fill in all required fields!');

    let finalImg = "";
    if (imgFile) {
        showToast('Compressing photo...');
        finalImg = await resizeImage(imgFile);
    }

    const loc = `${town} (${region})${link ? ' — ' + link : ''}`;

    const newReview = { 
        name, loc, cuisine, author, rating, text, 
        img: finalImg ? [finalImg] : [], 
        date: new Date().toISOString() 
    };

    try {
        await db.collection('reviews').add(newReview);
        showToast('Review posted!');
        
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-region').value = '';
        document.getElementById('inp-town').value = '';
        document.getElementById('inp-link').value = '';
        document.getElementById('inp-cuisine').value = '';
        document.getElementById('inp-review').value = '';
        document.getElementById('inp-img').value = '';
        
        showPage('reviews');
    } catch (e) {
        showToast('Upload failed!');
    }
}

function renderReviews() {
    const grid = document.getElementById('restGrid');
    if (!grid) return;
    if (reviews.length === 0) {
        grid.innerHTML = '<p class="history-empty">No reviews yet.</p>';
        return;
    }
    grid.innerHTML = reviews.map(r => {
        const images = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
        let displayLoc = r.loc || "";
        if (displayLoc.includes(' — ')) {
            const parts = displayLoc.split(' — ');
            displayLoc = `${parts[0]} • <a href="${parts[1]}" target="_blank" style="color:var(--teal); text-decoration:underline;">Map</a>`;
        }

        return `
        <div class="rest-card">
            <div class="card-actions">
                <button class="action-icon edit-icon" onclick="openEditModal('${r.id}')">✏️</button>
            </div>
            <div class="tag">${r.cuisine}</div>
            <h3>${r.name}</h3>
            <div class="location">📍 ${displayLoc}</div>
            <div class="rating-val" style="color:${getTierColor(r.rating)}">
                ${r.rating.toFixed(1)} <span class="review-count">by ${r.author}</span>
            </div>
            <div class="snippet">${r.text}</div>
            <div class="image-gallery">
                ${images.map(imgSrc => `
                    <img src="${imgSrc}" class="review-img-thumb" onclick="openImageViewer('${imgSrc}')">
                `).join('')}
            </div>
            <button class="action-icon delete-btn" onclick="promptDeleteReview('${r.id}')">🗑️</button>
        </div>`;
    }).join('');
}

// --- 6. Tier List Logic ---
function autoMapToTier(review) {
    let tier = 'F';
    const v = review.rating;
    if (v >= 9.0) tier = 'S';
    else if (v >= 8.0) tier = 'A';
    else if (v >= 7.0) tier = 'B';
    else if (v >= 6.0) tier = 'C';
    else if (v >= 4.5) tier = 'D';

    if (!tierData[tier].some(x => x.name === review.name)) {
        tierData[tier].push({ name: review.name });
    }
}

function renderTierBoard() {
    ['S', 'A', 'B', 'C', 'D', 'F'].forEach(t => {
        const el = document.getElementById('tier-' + t);
        if (!el) return;
        el.innerHTML = tierData[t].length 
            ? tierData[t].map(x => `<div class="tier-chip">${x.name}</div>`).join('')
            : '<span class="history-empty">empty</span>';
    });
}

// --- 7. Spin the Wheel Logic ---
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
        ctx.fillStyle = c.color; ctx.fill(); ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(start + arc / 2); ctx.textAlign = 'right';
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Monaco,monospace'; ctx.fillText(c.label, r - 10, 4);
        ctx.restore();
    });
}

function spinWheel() {
    if (spinning || !wheelCuisines.length) return;
    spinning = true;
    document.getElementById('spinBtn').disabled = true;
    const duration = 4000;
    const start = performance.now();
    const totalRotation = 15 + Math.random() * 10;

    function animate(time) {
        let elapsed = time - start;
        let progress = Math.min(elapsed / duration, 1);
        let ease = 1 - Math.pow(1 - progress, 3);
        currentAngle = ease * totalRotation * 2 * Math.PI;
        renderWheel();
        if (progress < 1) requestAnimationFrame(animate);
        else finishSpin();
    }
    requestAnimationFrame(animate);
}

function finishSpin() {
    spinning = false;
    document.getElementById('spinBtn').disabled = false;
    const n = wheelCuisines.length;
    const normalized = (currentAngle % (2 * Math.PI));
    const segment = (2 * Math.PI - normalized) % (2 * Math.PI);
    const index = Math.floor(segment / (2 * Math.PI / n));
    const result = wheelCuisines[index];
    
    document.getElementById('wheelResult').innerHTML = `
        <div class="cuisine-name" style="color:${result.color}">${result.label}</div>
        <div class="cuisine-sub">sounds like a plan</div>
    `;
    
    spinHistory.unshift({ label: result.label, color: result.color, date: new Date().toLocaleTimeString() });
    if (spinHistory.length > 20) spinHistory.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = spinHistory.length 
        ? spinHistory.map(h => `<div class="history-item"><span class="h-dot" style="background:${h.color}"></span><b>${h.label}</b> <span style="float:right; opacity:0.5">${h.date}</span></div>`).join('')
        : '<span class="history-empty">no spins yet</span>';
}

function clearHistory() { spinHistory = []; localStorage.setItem(HISTORY_KEY, '[]'); renderHistory(); }

function toggleEdit() {
    const editPanel = document.getElementById('cuisineEditPanel');
    const viewList = document.getElementById('cuisineViewList');
    editMode = !editMode;
    editPanel.style.display = editMode ? 'block' : 'none';
    viewList.style.display = editMode ? 'none' : 'block';
}

function renderCuisineView() {
    const list = document.getElementById('cuisineViewList');
    if (list) list.innerHTML = wheelCuisines.map(c => `<div class="cuisine-chip" style="border-left:4px solid ${c.color}">${c.label}</div>`).join('');
}

function renderCuisineEditList() {
    const list = document.getElementById('cuisineEditList');
    if (list) list.innerHTML = wheelCuisines.map((c, i) => `
        <div class="cuisine-edit-item">
            <span>${c.label}</span>
            <button onclick="removeCuisine(${i})">×</button>
        </div>`).join('');
}

function addCuisine() {
    const input = document.getElementById('newCuisineInput');
    const val = input.value.trim();
    if (val && wheelCuisines.length < 15) {
        const color = PALETTE[wheelCuisines.length % PALETTE.length];
        wheelCuisines.push({ label: val, color });
        localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
        input.value = '';
        renderCuisineEditList(); renderWheel(); renderCuisineView();
    }
}

function removeCuisine(i) {
    wheelCuisines.splice(i, 1);
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
    renderCuisineEditList(); renderWheel(); renderCuisineView();
}

// --- 8. Edit & Image Viewer Logic ---
function openEditModal(id) {
    const r = reviews.find(x => x.id === id);
    if (!r) return;
    currentEditId = id;
    document.getElementById('edit-name').value = r.name;
    document.getElementById('edit-cuisine').value = r.cuisine;
    document.getElementById('edit-review').value = r.text;
    document.getElementById('edit-rating-slider').value = r.rating;
    
    let region = "", town = "", link = "";
    if (r.loc.includes(' — ')) {
        const parts = r.loc.split(' — ');
        link = parts[1];
        const locParts = parts[0].split(' (');
        town = locParts[0];
        region = locParts[1].replace(')', '');
    } else {
        const locParts = r.loc.split(' (');
        town = locParts[0];
        region = locParts[1].replace(')', '');
    }
    
    document.getElementById('edit-region').value = region;
    document.getElementById('edit-town').value = town;
    document.getElementById('edit-link').value = link;
    
    document.getElementById('editModal').classList.add('show');
}

function closeEditModal() { document.getElementById('editModal').classList.remove('show'); }

async function saveEdit() {
    const region = document.getElementById('edit-region').value;
    const town = document.getElementById('edit-town').value;
    const link = document.getElementById('edit-link').value;
    const loc = `${town} (${region})${link ? ' — ' + link : ''}`;

    const update = {
        name: document.getElementById('edit-name').value.trim(),
        loc: loc,
        cuisine: document.getElementById('edit-cuisine').value.trim(),
        text: document.getElementById('edit-review').value.trim(),
        rating: parseFloat(document.getElementById('edit-rating-slider').value)
    };

    await db.collection('reviews').doc(currentEditId).update(update);
    showToast('Updated successfully');
    closeEditModal();
}

function openImageViewer(src) {
    const modal = document.getElementById('imageViewerModal');
    const fullImg = document.getElementById('fullSizeImage');
    if (modal && fullImg) {
        fullImg.src = src;
        modal.classList.add('show');
    }
}

function closeImageViewer() { document.getElementById('imageViewerModal').classList.remove('show'); }

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast show';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}

// Start Sync
syncWithFirebase();
}
