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
                // Export as compact JPEG
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
    if (v >= 9.0) return '#c87941';
    if (v >= 8.0) return '#4a9d9c';
    if (v >= 7.0) return '#4a7a9d';
    if (v >= 6.0) return '#6a6a6a';
    if (v >= 4.5) return '#3a3a3a';
    return '#c84a4a';
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
    const loc = document.getElementById('inp-loc').value.trim();
    const cuisine = document.getElementById('inp-cuisine').value.trim();
    const author = document.getElementById('inp-author').value.trim();
    const text = document.getElementById('inp-review').value.trim();
    const rating = parseFloat(slider.value);
    const imgFile = document.getElementById('inp-img').files[0];

    if (!name || !cuisine || !author) return showToast('Fill in the basics!');

    let finalImg = "";
    if (imgFile) {
        showToast('Compressing photo...');
        finalImg = await resizeImage(imgFile);
    }

    const newReview = { 
        name, loc, cuisine, author, rating, text, 
        img: finalImg, 
        date: new Date().toISOString() 
    };

    try {
        await db.collection('reviews').add(newReview);
        showToast('Review posted!');
        
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-loc').value = '';
        document.getElementById('inp-cuisine').value = '';
        document.getElementById('inp-review').value = '';
        document.getElementById('inp-img').value = '';
        
        showPage('reviews');
    } catch (e) {
        showToast('Upload failed!');
        console.error(e);
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
        // Handle both old single-image data and new array data
        const images = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
        
        return `
        <div class="rest-card">
            <div class="card-actions">
                <button class="action-icon edit-icon" onclick="openEditModal('${r.id}')">✏️</button>
            </div>
            <div class="tag">${r.cuisine}</div>
            <h3>${r.name}</h3>
            <div class="location">📍 ${r.loc}</div>
            <div class="rating-val" style="color:${getTierColor(r.rating)}">
                ${r.rating.toFixed(1)} <span class="review-count">by ${r.author}</span>
            </div>
            <div class="snippet">${r.text}</div>
            
            <div class="image-gallery">
                ${images.map(imgSrc => `
                    <img src="${imgSrc}" 
                         class="review-img-thumb" 
                         onclick="openImageViewer('${imgSrc}')">
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
    // Point confirm button to wheel logic
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

function showToast(m) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = m; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

// --- 9. Global Init ---
window.onload = () => {
    syncWithFirebase();
    renderWheel();
};

let currentEditId = null;

// --- Delete Review ---
async function promptDeleteReview(id) {
    if (confirm("Permanently delete this review from the cloud?")) {
        try {
            await db.collection('reviews').doc(id).delete();
            showToast('Review deleted');
        } catch (e) {
            showToast('Delete failed');
        }
    }
}

// --- Edit Functions ---
function openEditModal(id) {
    currentEditId = id;
    const r = reviews.find(review => review.id === id);
    
    // Fill text fields
    document.getElementById('edit-name').value = r.name;
    document.getElementById('edit-loc').value = r.loc;
    document.getElementById('edit-cuisine').value = r.cuisine;
    document.getElementById('edit-review').value = r.text;

    // Handle Image Previews
    const container = document.getElementById('edit-image-preview-container');
    container.innerHTML = '';
    
    // Normalize images to an array (handles legacy single-string data)
    const images = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
    
    images.forEach((imgSrc, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'edit-img-wrapper';
        wrapper.innerHTML = `
            <img src="${imgSrc}">
            <button class="remove-img-btn" onclick="removeImageFromEdit(${index})">✕</button>
        `;
        container.appendChild(wrapper);
    });

    // Store the current images temporarily for editing
    window.tempEditImages = [...images];
    
    document.getElementById('editModal').classList.add('show');
}

// Function to remove a specific image from the preview list
function removeImageFromEdit(index) {
    window.tempEditImages.splice(index, 1);
    // Refresh the preview
    const container = document.getElementById('edit-image-preview-container');
    const wrappers = container.querySelectorAll('.edit-img-wrapper');
    if (wrappers[index]) wrappers[index].remove();
    
    // Re-render to ensure indices stay synced
    const images = [...window.tempEditImages];
    container.innerHTML = '';
    images.forEach((imgSrc, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'edit-img-wrapper';
        wrapper.innerHTML = `
            <img src="${imgSrc}">
            <button class="remove-img-btn" onclick="removeImageFromEdit(${i})">✕</button>
        `;
        container.appendChild(wrapper);
    });
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

async function saveEdit() {
    showToast('Saving changes...');
    
    const newFiles = document.getElementById('edit-img-input').files;
    let uploadedImages = [];

    // Process new images if any
    if (newFiles.length > 0) {
        for (let file of newFiles) {
            const compressed = await resizeImage(file);
            uploadedImages.push(compressed);
        }
    }

    // Merge kept images + new uploads
    const finalImages = [...window.tempEditImages, ...uploadedImages];

    const update = {
        name: document.getElementById('edit-name').value,
        loc: document.getElementById('edit-loc').value,
        cuisine: document.getElementById('edit-cuisine').value,
        text: document.getElementById('edit-review').value,
        img: finalImages // Update the image field with the new array
    };

    try {
        await db.collection('reviews').doc(currentEditId).update(update);
        showToast('Updated successfully');
        document.getElementById('edit-img-input').value = ''; // Clear input
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
    fullImg.src = src;
    modal.classList.add('show');
}

function closeImageViewer() {
    document.getElementById('imageViewerModal').classList.remove('show');
}
