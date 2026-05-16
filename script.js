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
        populateFilterDropdowns();
        filterAndRender();
        renderTierBoard();
        populateAuthorDropdowns();
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
    const tags = (document.getElementById('inp-tags').value || '').split(',').map(t=>t.trim()).filter(Boolean);

    // Validation update: Ensure name, region, town, cuisine, and author are present
    if (!name || !region || !town || !cuisine || !author) return showToast('Fill in all required fields!');

    let finalImg = "";
    if (imgFile) {
        showToast('Compressing photo...');
        finalImg = await resizeImage(imgFile);
    }

    // Combine manual fields into a single location string for the DB
    const loc = `${town} (${region})${link ? ' — ' + link : ''}`;

    const newReview = { 
        name, loc, cuisine, author, rating, text, tags,
        dishes: getDishesFromContainer('inp-dish-list'),
        img: finalImg ? [finalImg] : [], 
        date: new Date().toISOString() 
    };

    try {
        await db.collection('reviews').add(newReview);
        showToast('Review posted!');
        
        // Reset all fields
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-region').value = '';
        document.getElementById('inp-town').value = '';
        document.getElementById('inp-link').value = '';
        document.getElementById('inp-cuisine').value = '';
        document.getElementById('inp-review').value = '';
        document.getElementById('inp-img').value = '';
        document.getElementById('inp-dish-list').innerHTML = '';
        clearTagsInput('inp-tags-chips', 'inp-tags');
        
        showPage('reviews');
    } catch (e) {
        showToast('Upload failed!');
        console.error(e);
    }
}

// Track which reviewer index is active per card (by review id)
const cardReviewerIndex = {};

function getCardReviewers(r) {
    // Returns array of reviewer objects: [{author, rating, text, dishes, date}, ...]
    const primary = { author: r.author, rating: r.rating, text: r.text, dishes: r.dishes || [], date: r.date };
    const appended = Array.isArray(r.appendedReviews) ? r.appendedReviews : [];
    return [primary, ...appended];
}

function getAverageRating(r) {
    const reviewers = getCardReviewers(r);
    const avg = reviewers.reduce((sum, rv) => sum + parseFloat(rv.rating), 0) / reviewers.length;
    return avg;
}

function renderReviews(filtered) {
    const grid = document.getElementById('restGrid');
    if (!grid) return;
    const list = filtered || reviews;
    if (list.length === 0) {
        grid.innerHTML = '<p class="history-empty">No reviews yet.</p>';
        return;
    }
    grid.innerHTML = list.map(r => {
        const images = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
        const reviewers = getCardReviewers(r);
        const multiReviewer = reviewers.length > 1;
        const avgRating = getAverageRating(r);
        
        // Init index if not set
        if (cardReviewerIndex[r.id] === undefined) cardReviewerIndex[r.id] = 0;
        const idx = cardReviewerIndex[r.id];
        const current = reviewers[idx];

        // Handle Map Link
        let displayLoc = r.loc || "";
        if (displayLoc.includes(' — ')) {
            const parts = displayLoc.split(' — ');
            const textPart = parts[0];
            const urlPart = parts[1];
            displayLoc = `${textPart} • <a href="${urlPart}" target="_blank" style="color:var(--teal); text-decoration:underline;">Map</a>`;
        }

        const avgBadge = multiReviewer 
            ? `<div class="avg-badge">avg <span style="color:${getTierColor(avgRating)}">${avgRating.toFixed(1)}</span> <span class="avg-reviewers">· ${reviewers.length} reviewers</span></div>`
            : '';

        const reviewerNav = multiReviewer ? `
            <div class="reviewer-nav">
                <button class="reviewer-arrow" onclick="shiftReviewer('${r.id}', -1)" ${idx === 0 ? 'disabled' : ''}>←</button>
                <span class="reviewer-nav-label">${idx + 1} / ${reviewers.length}</span>
                <button class="reviewer-arrow" onclick="shiftReviewer('${r.id}', 1)" ${idx === reviewers.length - 1 ? 'disabled' : ''}>→</button>
            </div>` : '';

        return `
        <div class="rest-card" id="card-${r.id}">
            <div class="card-actions">
                <button class="action-icon edit-icon" onclick="openEditModal('${r.id}')">✏️</button>
            </div>
            <div class="tag">${r.cuisine}</div>
            <h3>${r.name}</h3>
            <div class="location">📍 ${displayLoc}</div>
            ${avgBadge}
            <div class="rating-val" style="color:${getTierColor(current.rating)}">
                ${parseFloat(current.rating).toFixed(1)} <span class="review-count">by ${current.author}</span>
            </div>
            ${current.date ? `<div class="review-timestamp">${formatReviewDate(current.date)}</div>` : ''}
            ${reviewerNav}
            <div class="snippet">${current.text}</div>
            ${Array.isArray(r.tags) && r.tags.length ? `<div class="card-tags">${r.tags.map(t=>`<span class="card-tag">${t}</span>`).join('')}</div>` : ''}
            
            ${Array.isArray(current.dishes) && current.dishes.length ? `
            <div class="dish-ratings">
                ${current.dishes.map(d => `
                <div class="dish-rating-row">
                    <span class="dish-rating-name">${d.name}</span>
                    <span class="dish-rating-dots"></span>
                    <span class="dish-rating-score" style="color:${getTierColor(d.rating)}">${parseFloat(d.rating).toFixed(1)}</span>
                </div>`).join('')}
            </div>` : ''}
            
            <div class="image-gallery">
                ${images.map(imgSrc => `
                    <img src="${imgSrc}" 
                         class="review-img-thumb" 
                         onclick="openImageViewer('${imgSrc}')">
                `).join('')}
            </div>
            
            <div class="card-footer-actions">
                <button class="btn btn-ghost append-btn" onclick="openAppendModal('${r.id}')">+ Add Your Review</button>
                <button class="action-icon delete-btn-inline" onclick="promptDeleteReview('${r.id}')">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function shiftReviewer(id, delta) {
    const r = reviews.find(x => x.id === id);
    if (!r) return;
    const reviewers = getCardReviewers(r);
    const current = (cardReviewerIndex[id] || 0) + delta;
    cardReviewerIndex[id] = Math.max(0, Math.min(reviewers.length - 1, current));
    // Re-render only the affected list
    filterAndRender();
}

// --- Append Review Logic ---
let currentAppendId = null;

function openAppendModal(id) {
    currentAppendId = id;
    const r = reviews.find(x => x.id === id);
    if (!r) return;

    document.getElementById('appendModalSubtitle').textContent = `// ${r.name} · ${r.cuisine}`;

    populateAuthorDropdowns('append-author');
    document.getElementById('append-author').value = '';

    const slider = document.getElementById('append-rating-slider');
    const display = document.getElementById('append-rating-display');
    slider.value = 7.0;
    display.textContent = '7.0';
    display.style.color = getDynamicColor(7.0);
    slider.style.accentColor = getDynamicColor(7.0);
    slider.oninput = () => {
        const v = parseFloat(slider.value).toFixed(1);
        display.textContent = v;
        display.style.color = getDynamicColor(v);
        slider.style.accentColor = getDynamicColor(v);
    };

    document.getElementById('append-review').value = '';
    document.getElementById('append-dish-list').innerHTML = '';

    document.getElementById('appendModal').classList.add('show');
}

function closeAppendModal() {
    document.getElementById('appendModal').classList.remove('show');
    currentAppendId = null;
}

async function saveAppendedReview() {
    if (!currentAppendId) return;
    const author = document.getElementById('append-author').value;
    const rating = parseFloat(document.getElementById('append-rating-slider').value);
    const text = document.getElementById('append-review').value.trim();
    const dishes = getDishesFromContainer('append-dish-list');

    if (!author) return showToast('Please select your name!');

    const r = reviews.find(x => x.id === currentAppendId);
    if (!r) return;

    // Check if this author already reviewed
    const existing = getCardReviewers(r);
    if (existing.some(rv => rv.author === author)) {
        return showToast(`${author} already reviewed this!`);
    }

    const newEntry = { author, rating, text, dishes, date: new Date().toISOString() };
    const appended = Array.isArray(r.appendedReviews) ? [...r.appendedReviews, newEntry] : [newEntry];

    try {
        await db.collection('reviews').doc(currentAppendId).update({ appendedReviews: appended });
        // Jump to the new reviewer's slot after save
        cardReviewerIndex[currentAppendId] = appended.length; // primary + appended index
        showToast('Review added!');
        closeAppendModal();
    } catch (e) {
        showToast('Failed to save.');
        console.error(e);
    }
}
// --- 6. Tier List Logic ---
function autoMapToTier(review) {
    let tier = 'F';
    const v = getAverageRating(review);
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
        ctx.fillStyle = c.color; ctx.fill();
        ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(start + arc / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Monaco,monospace';
        ctx.fillText(c.label, r - 10, 4); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 2 * Math.PI); ctx.fillStyle = '#1e1e1e'; ctx.fill();
    ctx.strokeStyle = '#c87941'; ctx.lineWidth = 2; ctx.stroke();
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
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
    const fullStamp = `${dateStr}, ${timeStr}`;

    spinHistory.unshift({ label: c.label, color: c.color, time: fullStamp });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory.slice(0, 20)));
    renderHistory();
    document.getElementById('wheelResult').innerHTML = `<div class="cuisine-name" style="color:${c.color}">${c.label}</div><div class="cuisine-sub">fate has spoken</div>`;
    document.getElementById('resultActions').innerHTML = `<button class="btn btn-danger" style="font-size:10px;padding:5px 10px;" onclick="promptRemove(${idx})">Remove from wheel</button>`;
}

// --- 8. Management & Modals ---
function renderHistory() {
    const el = document.getElementById('historyList');
    if(el) el.innerHTML = spinHistory.map(h => `
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
    const el = document.getElementById('cuisineViewList');
    if(el) el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;">` +
        wheelCuisines.map(c => `<span style="border:1px solid ${c.color};color:${c.color};font-size:10px;padding:2px 5px;">${c.label}</span>`).join('') + `</div>`;
}

function renderCuisineEditList() {
    const el = document.getElementById('cuisineEditList');
    if(el) el.innerHTML = wheelCuisines.map((c, i) => `
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

function promptRemove(i) {
    pendingRemove = i;
    document.getElementById('removeModalText').textContent = `Remove ${wheelCuisines[i].label}?`;
    document.getElementById('removeModal').classList.add('show');
    const confirmBtn = document.querySelector('#removeModal .btn-danger');
    confirmBtn.onclick = confirmRemove;
}

function confirmRemove() {
    wheelCuisines.splice(pendingRemove, 1);
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
    closeModal(); renderWheel();
    document.getElementById('wheelResult').innerHTML = '<div class="cuisine-sub">removed</div>';
}

function closeModal() { document.getElementById('removeModal').classList.remove('show'); }

// --- Author Management ---
const AUTHORS_KEY = 'fatass_authors_v1';

function getSavedAuthors() {
    try { return JSON.parse(localStorage.getItem(AUTHORS_KEY)) || []; } catch(e) { return []; }
}

function saveAuthors(list) {
    localStorage.setItem(AUTHORS_KEY, JSON.stringify(list));
}

function populateAuthorDropdowns(selectId = null) {
    // Merge Firebase authors with locally saved ones
    const firebaseAuthors = reviews.map(r => r.author).filter(Boolean);
    const saved = getSavedAuthors();
    const all = [...new Set([...saved, ...firebaseAuthors])].sort();

    const base = `<option value="" disabled>Select name...</option>`;
    const targets = selectId ? [selectId] : ['inp-author', 'edit-author'];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = base + all.map(a => `<option value="${a}">${a}</option>`).join('');
        if (current) el.value = current;
    });
}

function promptAddAuthor(selectId) {
    const name = prompt('Enter new name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const saved = getSavedAuthors();
    if (!saved.includes(trimmed)) {
        saved.push(trimmed);
        saveAuthors(saved);
    }
    populateAuthorDropdowns();
    // Select the new name in the triggering dropdown
    const el = document.getElementById(selectId);
    if (el) el.value = trimmed;
}
function addDishRow(containerId, name = '', rating = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'dish-input-row';
    row.innerHTML = `
        <input type="text" placeholder="Dish name" value="${name}" />
        <input type="number" placeholder="Score" min="0" max="10" step="0.1" value="${rating}" />
        <button type="button" class="dish-remove-btn" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(row);
}

function getDishesFromContainer(containerId) {
    const rows = document.querySelectorAll(`#${containerId} .dish-input-row`);
    const dishes = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const name = inputs[0].value.trim();
        const rating = parseFloat(inputs[1].value);
        if (name && !isNaN(rating)) dishes.push({ name, rating });
    });
    return dishes;
}

function loadDishesIntoContainer(containerId, dishes) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    (dishes || []).forEach(d => addDishRow(containerId, d.name, d.rating));
}

function showToast(m) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = m; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

// --- Changelog Logic ---
const CHANGELOG_KEY = 'fatass_changelog_v1';

function loadChangelog() {
    try { return JSON.parse(localStorage.getItem(CHANGELOG_KEY)) || []; } catch(e) { return []; }
}

function saveChangelog(entries) {
    localStorage.setItem(CHANGELOG_KEY, JSON.stringify(entries));
}

function renderChangelog() {
    const list = document.getElementById('changelogList');
    if (!list) return;
    const entries = loadChangelog();
    list.innerHTML = '';
    entries.forEach((text, i) => {
        const row = document.createElement('div');
        row.className = 'changelog-entry';
        row.innerHTML = `
            <span class="changelog-bullet">—</span>
            <textarea class="changelog-text" rows="1" placeholder="what changed...">${text}</textarea>
            <button class="changelog-delete" onclick="deleteChangelogEntry(${i})" title="delete">✕</button>
        `;
        const ta = row.querySelector('textarea');
        // Auto-resize
        const resize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
        ta.addEventListener('input', () => { resize(); updateChangelogEntry(i, ta.value); });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addChangelogEntry(i + 1); // insert after current
            }
        });
        setTimeout(resize, 0);
        list.appendChild(row);
    });
}

function addChangelogEntry(atIndex) {
    const entries = loadChangelog();
    if (atIndex !== undefined) {
        entries.splice(atIndex, 0, '');
    } else {
        entries.push('');
    }
    saveChangelog(entries);
    renderChangelog();
    // Focus the new entry
    const rows = document.querySelectorAll('.changelog-text');
    const idx = atIndex !== undefined ? atIndex : entries.length - 1;
    if (rows[idx]) rows[idx].focus();
}

function updateChangelogEntry(index, value) {
    const entries = loadChangelog();
    entries[index] = value;
    saveChangelog(entries);
}

function deleteChangelogEntry(index) {
    const entries = loadChangelog();
    entries.splice(index, 1);
    saveChangelog(entries);
    renderChangelog();
}

// --- 9. Global Init ---
window.onload = () => {
    syncWithFirebase();
    renderWheel();
    renderChangelog();
};

// --- Delete Review ---
async function promptDeleteReview(id) {
    const r = reviews.find(x => x.id === id);
    if (!r) return;

    const reviewers = getCardReviewers(r);
    const idx = cardReviewerIndex[id] || 0;
    const slot = reviewers[idx];
    const isSolo = reviewers.length === 1;

    const confirmMsg = isSolo
        ? `Delete ${slot.author}'s review of ${r.name}? This will remove the card entirely.`
        : `Delete ${slot.author}'s review of ${r.name}?`;

    if (!confirm(confirmMsg)) return;

    try {
        if (isSolo) {
            // Only one reviewer left — delete the whole document
            await db.collection('reviews').doc(id).delete();
            showToast('Review deleted');
        } else if (idx === 0) {
            // Deleting the primary reviewer — promote first appended to primary
            const appended = Array.isArray(r.appendedReviews) ? [...r.appendedReviews] : [];
            const newPrimary = appended.shift(); // remove first appended, it becomes primary
            await db.collection('reviews').doc(id).update({
                author: newPrimary.author,
                rating: newPrimary.rating,
                text: newPrimary.text,
                dishes: newPrimary.dishes || [],
                date: newPrimary.date,
                appendedReviews: appended
            });
            cardReviewerIndex[id] = 0;
            showToast('Review removed');
        } else {
            // Deleting an appended reviewer — splice it out
            const appended = Array.isArray(r.appendedReviews) ? [...r.appendedReviews] : [];
            const appendedIdx = idx - 1;
            appended.splice(appendedIdx, 1);
            await db.collection('reviews').doc(id).update({ appendedReviews: appended });
            // Shift index back if we were at the last slot
            cardReviewerIndex[id] = Math.max(0, idx - 1);
            showToast('Review removed');
        }
    } catch (e) {
        showToast('Delete failed');
        console.error(e);
    }
}

// --- Edit Functions ---
// Tracks which reviewer slot the edit modal is targeting (0 = primary, 1+ = appended index)
let currentEditReviewerIdx = 0;

function openEditModal(id) {
    currentEditId = id;
    const r = reviews.find(review => review.id === id);
    if (!r) return;

    // Determine which reviewer is currently displayed
    currentEditReviewerIdx = cardReviewerIndex[id] || 0;
    const reviewers = getCardReviewers(r);
    const slot = reviewers[currentEditReviewerIdx];

    // Shared fields always come from the top-level doc
    document.getElementById('edit-name').value = r.name || "";
    document.getElementById('edit-cuisine').value = r.cuisine || "";

    // Reviewer-specific fields come from the active slot
    document.getElementById('edit-review').value = slot.text || "";

    populateAuthorDropdowns('edit-author');
    document.getElementById('edit-author').value = slot.author || "";

    // Parse the stored location string back into parts for the modal
    const locString = r.loc || "";
    let town = "", region = "Central", link = "";
    if (locString.includes(' (')) {
        town = locString.split(' (')[0];
        const remainder = locString.split(' (')[1];
        region = remainder.split(')')[0];
        if (remainder.includes(' — ')) link = remainder.split(' — ')[1];
    } else {
        town = locString;
    }
    document.getElementById('edit-town').value = town;
    document.getElementById('edit-region').value = region;
    document.getElementById('edit-link').value = link;

    const rating = slot.rating ?? 7.0;
    const editSlider = document.getElementById('edit-rating-slider');
    const editDisplay = document.getElementById('edit-rating-display');
    if (editSlider && editDisplay) {
        editSlider.value = rating;
        editSlider.oninput = () => {
            const v = parseFloat(editSlider.value).toFixed(1);
            const newColor = getDynamicColor(v);
            editDisplay.textContent = v;
            editDisplay.style.color = newColor;
            editSlider.style.accentColor = newColor;
        };
        editSlider.oninput();
    }

    // Images are shared (top-level doc)
    const images = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
    window.tempEditImages = [...images];
    renderEditImages();

    loadDishesIntoContainer('edit-dish-list', slot.dishes || []);
    loadTagsIntoInput(r.tags || [], 'edit-tags-chips', 'edit-tags');

    document.getElementById('editModal').classList.add('show');
}

function renderEditImages() {
    const container = document.getElementById('edit-image-preview-container');
    if (!container) return;
    container.innerHTML = '';
    
    window.tempEditImages.forEach((imgSrc, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'edit-img-wrapper';
        wrapper.innerHTML = `
            <img src="${imgSrc}">
            <button type="button" class="remove-img-btn" onclick="removeImageFromEdit(${i})">✕</button>
        `;
        container.appendChild(wrapper);
    });
}

function removeImageFromEdit(index) {
    window.tempEditImages.splice(index, 1);
    renderEditImages();
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

async function saveEdit() {
    if (!currentEditId) return;
    showToast('Saving...');
    
    const region = document.getElementById('edit-region').value;
    const town = document.getElementById('edit-town').value.trim();
    const link = document.getElementById('edit-link').value.trim();
    const loc = `${town} (${region})${link ? ' — ' + link : ''}`;

    const fileInput = document.getElementById('edit-img-input');
    const newFiles = fileInput ? fileInput.files : [];
    let uploadedImages = [];

    try {
        if (newFiles.length > 0) {
            for (let file of newFiles) {
                const compressed = await resizeImage(file);
                uploadedImages.push(compressed);
            }
        }

        // Shared fields always update the top-level doc
        const sharedUpdate = {
            name: document.getElementById('edit-name').value.trim(),
            loc,
            cuisine: document.getElementById('edit-cuisine').value.trim(),
            img: [...(window.tempEditImages || []), ...uploadedImages],
            tags: (document.getElementById('edit-tags').value || '').split(',').map(t=>t.trim()).filter(Boolean)
        };

        // Reviewer-specific fields go to the right slot
        const reviewerSpecific = {
            author: document.getElementById('edit-author').value,
            text: document.getElementById('edit-review').value.trim(),
            rating: parseFloat(document.getElementById('edit-rating-slider').value),
            dishes: getDishesFromContainer('edit-dish-list'),
        };

        const r = reviews.find(rv => rv.id === currentEditId);

        if (currentEditReviewerIdx === 0) {
            // Primary reviewer — write directly to top-level doc fields
            await db.collection('reviews').doc(currentEditId).update({
                ...sharedUpdate,
                ...reviewerSpecific
            });
        } else {
            // Appended reviewer — splice the updated entry into appendedReviews
            const appended = Array.isArray(r.appendedReviews) ? [...r.appendedReviews] : [];
            const appendedIdx = currentEditReviewerIdx - 1;
            if (appended[appendedIdx]) {
                appended[appendedIdx] = { ...appended[appendedIdx], ...reviewerSpecific };
            }
            await db.collection('reviews').doc(currentEditId).update({
                ...sharedUpdate,
                appendedReviews: appended
            });
        }

        showToast('Updated successfully');
        closeEditModal();
    } catch (e) {
        showToast('Update failed');
        console.error(e);
    }
}

// --- Image Viewer Logic ---
function openImageViewer(src) {
    const modal = document.getElementById('imageViewerModal');
    const fullImg = document.getElementById('fullSizeImage');
    if (modal && fullImg) {
        fullImg.src = src;
        modal.classList.add('show');
    }
}

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) modal.classList.remove('show');
}

// --- Tags Input Logic ---
function initTagsInput(chipsId, hiddenId, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('keydown', function(e) {
        if (e.key === ',' || e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim().replace(/,+$/, '');
            if (val) addTag(val, chipsId, hiddenId);
            input.value = '';
        } else if (e.key === 'Backspace' && input.value === '') {
            const chips = document.getElementById(chipsId);
            const last = chips ? chips.lastElementChild : null;
            if (last) last.remove();
            updateHiddenTags(chipsId, hiddenId);
        }
    });

    // Also handle paste with commas
    input.addEventListener('input', function() {
        if (input.value.includes(',')) {
            const parts = input.value.split(',');
            parts.slice(0, -1).forEach(p => { if (p.trim()) addTag(p.trim(), chipsId, hiddenId); });
            input.value = parts[parts.length - 1];
        }
    });
}

function addTag(label, chipsId, hiddenId) {
    const chips = document.getElementById(chipsId);
    if (!chips) return;
    // Prevent duplicates
    const existing = Array.from(chips.querySelectorAll('.tag-chip span')).map(s => s.textContent.toLowerCase());
    if (existing.includes(label.toLowerCase())) return;

    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span>${label}</span><button type="button" onclick="this.parentElement.remove(); updateHiddenTags('${chipsId}', '${hiddenId}')">✕</button>`;
    chips.appendChild(chip);
    updateHiddenTags(chipsId, hiddenId);
}

function updateHiddenTags(chipsId, hiddenId) {
    const chips = document.getElementById(chipsId);
    const hidden = document.getElementById(hiddenId);
    if (!chips || !hidden) return;
    hidden.value = Array.from(chips.querySelectorAll('.tag-chip span')).map(s => s.textContent).join(',');
}

function clearTagsInput(chipsId, hiddenId) {
    const chips = document.getElementById(chipsId);
    if (chips) chips.innerHTML = '';
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = '';
}

function loadTagsIntoInput(tagsArray, chipsId, hiddenId) {
    clearTagsInput(chipsId, hiddenId);
    (tagsArray || []).forEach(t => addTag(t, chipsId, hiddenId));
}

// --- Date Formatting ---
function formatReviewDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
}

// --- Filter Dropdowns Population ---
function populateFilterDropdowns() {
    const cuisines = [...new Set(reviews.map(r => r.cuisine).filter(Boolean))].sort();
    const authors  = [...new Set(reviews.map(r => r.author).filter(Boolean))].sort();

    // Extract towns from loc string "Town (Region)"
    const towns = [...new Set(reviews.map(r => {
        if (!r.loc) return null;
        return r.loc.includes(' (') ? r.loc.split(' (')[0].trim() : null;
    }).filter(Boolean))].sort();

    const fillSelect = (id, values) => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = '<option value="">All</option>' + values.map(v => `<option value="${v}">${v}</option>`).join('');
        if (current && values.includes(current)) el.value = current;
    };

    fillSelect('filter-cuisine', cuisines);
    fillSelect('filter-town', towns);
    fillSelect('filter-author', authors);
}

// --- Search & Filter Logic ---
function filterAndRender() {
    const query   = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const mode    = document.getElementById('search-filter')?.value || 'name';
    const cuisine = document.getElementById('filter-cuisine')?.value || '';
    const region  = document.getElementById('filter-region')?.value || '';
    const town    = document.getElementById('filter-town')?.value || '';
    const author  = document.getElementById('filter-author')?.value || '';
    const sort    = document.getElementById('filter-sort')?.value || 'date-desc';

    let list = reviews.filter(r => {
        // Search bar
        if (query) {
            if (mode === 'name' && !r.name.toLowerCase().includes(query)) return false;
            if (mode === 'tags' && !(Array.isArray(r.tags) && r.tags.some(t => t.toLowerCase().includes(query)))) return false;
        }
        // Filter dropdowns
        if (cuisine && r.cuisine !== cuisine) return false;
        if (region) {
            const locRegion = r.loc && r.loc.includes('(') ? r.loc.split('(')[1]?.split(')')[0] : '';
            if (locRegion !== region) return false;
        }
        if (town) {
            const locTown = r.loc && r.loc.includes(' (') ? r.loc.split(' (')[0].trim() : '';
            if (locTown !== town) return false;
        }
        if (author && r.author !== author) return false;
        return true;
    });

    // Sort
    list = [...list].sort((a, b) => {
        if (sort === 'date-desc') return new Date(b.date) - new Date(a.date);
        if (sort === 'date-asc')  return new Date(a.date) - new Date(b.date);
        if (sort === 'rating-desc') return getAverageRating(b) - getAverageRating(a);
        if (sort === 'rating-asc')  return getAverageRating(a) - getAverageRating(b);
        return 0;
    });

    renderReviews(list);
}

function resetFilters() {
    ['filter-cuisine','filter-region','filter-town','filter-author'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const sort = document.getElementById('filter-sort');
    if (sort) sort.value = 'date-desc';
    const search = document.getElementById('search-input');
    if (search) search.value = '';
    filterAndRender();
}

// Wire up inputs
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchFilter = document.getElementById('search-filter');
    if (searchInput) searchInput.addEventListener('input', filterAndRender);
    if (searchFilter) searchFilter.addEventListener('change', filterAndRender);

    // Init tags inputs
    initTagsInput('inp-tags-chips', 'inp-tags', 'inp-tags-input');
    initTagsInput('edit-tags-chips', 'edit-tags', 'edit-tags-input');
});
