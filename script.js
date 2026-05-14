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

const PALETTE = ['#c87941','#4a9d9c','#4a7a9d','#6a6a6a','#c84a4a','#8b5e3c','#2d5a59'];
let wheelCuisines = JSON.parse(localStorage.getItem(WHEEL_CUISINES_KEY)) || 
    ["Burgers","Sushi","Pasta","Tacos","Ramen","Steak","Pizza","Thai"];

// --- 3. Firebase Sync ---
function syncWithFirebase() {
    db.collection('reviews').orderBy('date', 'desc').onSnapshot(snapshot => {
        reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tierData = {S:[], A:[], B:[], C:[], D:[], F:[]};
        reviews.forEach(r => autoMapToTier(r));
        renderReviews();
        renderTierBoard();
        updateCuisineDatalist();
        updateAuthorDropdowns(); // Update dropdowns when data changes
    });
}

// --- NEW: Populate Author Dropdowns ---
function updateAuthorDropdowns() {
    // Extract unique names from existing reviews
    const uniqueAuthors = [...new Set(reviews.map(r => r.author).filter(Boolean))].sort();
    
    const addSelect = document.getElementById('inp-author');
    const editSelect = document.getElementById('edit-author');

    const generateOptions = (currentVal) => {
        let html = `<option value="" disabled ${!currentVal ? 'selected' : ''}>Select Name</option>`;
        uniqueAuthors.forEach(name => {
            html += `<option value="${name}">${name}</option>`;
        });
        return html;
    };

    if (addSelect) {
        const currentAddVal = addSelect.value;
        addSelect.innerHTML = generateOptions(currentAddVal);
        if (currentAddVal) addSelect.value = currentAddVal;
    }
    if (editSelect) {
        const currentEditVal = editSelect.value;
        editSelect.innerHTML = generateOptions(currentEditVal);
        if (currentEditVal) editSelect.value = currentEditVal;
    }
}

function updateCuisineDatalist() {
    const dl = document.getElementById('list-cuisines');
    if(!dl) return;
    const unique = [...new Set(reviews.map(r => r.cuisine).filter(Boolean))].sort();
    dl.innerHTML = unique.map(c => `<option value="${c}">`).join('');
}

// --- 4. Navigation ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    window.scrollTo(0,0);
    if(pageId === 'spin') setTimeout(drawWheel, 100);
}

// --- 5. Tier List Logic ---
function autoMapToTier(r) {
    const s = r.rating;
    if (s >= 9.0) tierData.S.push(r);
    else if (s >= 8.0) tierData.A.push(r);
    else if (s >= 7.0) tierData.B.push(r);
    else if (s >= 6.0) tierData.C.push(r);
    else if (s >= 4.5) tierData.D.push(r);
    else tierData.F.push(r);
}

function renderTierBoard() {
    Object.keys(tierData).forEach(t => {
        const container = document.getElementById(`tier-${t}`);
        if(!container) return;
        container.innerHTML = '';
        tierData[t].sort((a,b) => b.rating - a.rating).forEach(r => {
            const item = document.createElement('div');
            item.className = 'tier-item';
            item.innerHTML = `
                <div class="tier-item-name">${r.name}</div>
                <div class="tier-item-score">${r.rating.toFixed(1)}</div>
            `;
            item.onclick = () => { showPage('reviews'); setTimeout(() => {
                const el = document.getElementById(`rev-${r.id}`);
                if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
            }, 100);};
            container.appendChild(item);
        });
    });
}

// --- 6. Review Rendering ---
function renderReviews() {
    const grid = document.getElementById('restGrid');
    if(!grid) return;
    grid.innerHTML = reviews.map(r => {
        const dateStr = r.date ? new Date(r.date.seconds * 1000).toLocaleDateString() : '';
        const imgs = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
        
        return `
            <div class="rest-card" id="rev-${r.id}">
                <div class="card-header">
                    <div>
                        <div class="card-title">${r.name}</div>
                        <div class="card-meta">${r.cuisine} • ${r.loc || 'Unknown'}</div>
                    </div>
                    <div class="card-actions">
                        <button class="action-btn" onclick="openEditModal('${r.id}')">Edit</button>
                        <button class="action-btn" onclick="deleteReview('${r.id}')">Delete</button>
                    </div>
                </div>

                <div class="rating-val">
                    ${r.rating.toFixed(1)}<span class="rating-max">/10</span>
                </div>

                <div class="card-review">"${r.text}"</div>
                
                <div class="card-footer">
                    <span>By ${r.author}</span>
                    <span>${dateStr}</span>
                </div>

                ${imgs.length > 0 ? `
                    <div class="card-imgs">
                        ${imgs.map(src => `<img src="${src}" class="review-img-thumb" onclick="openImageViewer('${src}')">`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// --- 7. Form Logic ---
const ratingSlider = document.getElementById('ratingSlider');
const ratingDisplay = document.getElementById('ratingValueDisplay');
if(ratingSlider) {
    ratingSlider.oninput = function() { ratingDisplay.textContent = parseFloat(this.value).toFixed(1); };
}

async function submitReview() {
    const name = document.getElementById('inp-name').value.trim();
    const region = document.getElementById('inp-region').value;
    const town = document.getElementById('inp-town').value.trim();
    const link = document.getElementById('inp-link').value.trim();
    const cuisine = document.getElementById('inp-cuisine').value.trim();
    const author = document.getElementById('inp-author').value; // Get from select
    const rating = parseFloat(document.getElementById('ratingSlider').value);
    const text = document.getElementById('inp-review').value.trim();
    const fileInput = document.getElementById('inp-img');

    if(!name || !cuisine || !author) {
        showToast('Name, Cuisine, and Author are required');
        return;
    }

    const loc = `${town} (${region})${link ? ' — ' + link : ''}`;
    let imgData = [];

    try {
        if(fileInput.files.length > 0) {
            const compressed = await resizeImage(fileInput.files[0]);
            imgData.push(compressed);
        }

        await db.collection('reviews').add({
            name, cuisine, author, rating, text, loc,
            img: imgData,
            date: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast('Review posted!');
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-town').value = '';
        document.getElementById('inp-link').value = '';
        document.getElementById('inp-cuisine').value = '';
        document.getElementById('inp-review').value = '';
        fileInput.value = '';
        showPage('reviews');
    } catch(e) {
        showToast('Error posting review');
    }
}

async function deleteReview(id) {
    if(confirm('Delete this review?')) {
        await db.collection('reviews').doc(id).delete();
        showToast('Review deleted');
    }
}

// --- 8. Edit Modal Logic ---
function openEditModal(id) {
    const r = reviews.find(x => x.id === id);
    if(!r) return;
    currentEditId = id;
    
    document.getElementById('edit-name').value = r.name;
    document.getElementById('edit-cuisine').value = r.cuisine;
    document.getElementById('edit-author').value = r.author || ""; // Set select value
    document.getElementById('edit-review').value = r.text;
    document.getElementById('edit-rating-slider').value = r.rating;
    document.getElementById('edit-rating-display').innerText = r.rating.toFixed(1);

    const locParts = r.loc ? r.loc.match(/^(.*?) \((.*?)\)( — (.*))?$/) : null;
    if (locParts) {
        document.getElementById('edit-town').value = locParts[1] || "";
        document.getElementById('edit-region').value = locParts[2] || "Central";
        document.getElementById('edit-link').value = locParts[4] || "";
    }

    window.tempEditImages = Array.isArray(r.img) ? [...r.img] : (r.img ? [r.img] : []);
    renderEditImagePreviews();
    
    document.getElementById('editModal').classList.add('show');
}

function renderEditImagePreviews() {
    const container = document.getElementById('edit-image-preview-container');
    container.innerHTML = window.tempEditImages.map((src, idx) => `
        <div style="position:relative;">
            <img src="${src}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;">
            <button onclick="removeEditImage(${idx})" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px;">×</button>
        </div>
    `).join('');
}

function removeEditImage(idx) {
    window.tempEditImages.splice(idx, 1);
    renderEditImagePreviews();
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    currentEditId = null;
}

async function saveEdit() {
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

        const update = {
            name: document.getElementById('edit-name').value.trim(),
            author: document.getElementById('edit-author').value, // Get from select
            loc: loc,
            cuisine: document.getElementById('edit-cuisine').value.trim(),
            text: document.getElementById('edit-review').value.trim(),
            rating: parseFloat(document.getElementById('edit-rating-slider').value),
            img: [...(window.tempEditImages || []), ...uploadedImages]
        };

        await db.collection('reviews').doc(currentEditId).update(update);
        showToast('Updated successfully');
        closeEditModal();
    } catch (e) {
        showToast('Update failed');
    }
}

// --- 9. Wheel Logic ---
function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width/2;
    const centerY = canvas.height/2;
    const radius = 160;

    ctx.clearRect(0,0,canvas.width,canvas.height);

    const sliceAngle = (Math.PI * 2) / wheelCuisines.length;
    wheelCuisines.forEach((c, i) => {
        const start = currentAngle + i * sliceAngle;
        ctx.beginPath();
        ctx.fillStyle = PALETTE[i % PALETTE.length];
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, start, start + sliceAngle);
        ctx.fill();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(start + sliceAngle/2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Monaco";
        ctx.fillText(c.toUpperCase(), radius - 15, 5);
        ctx.restore();
    });

    // Pointer
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(centerX + radius + 5, centerY);
    ctx.lineTo(centerX + radius + 20, centerY - 10);
    ctx.lineTo(centerX + radius + 20, centerY + 10);
    ctx.fill();
}

function spinWheel() {
    if(spinning) return;
    spinning = true;
    const btn = document.getElementById('spinBtn');
    btn.disabled = true;
    btn.innerText = "SPINNING...";

    const spins = 5 + Math.random() * 5;
    const duration = 3000;
    const start = performance.now();
    const initialAngle = currentAngle;

    function animate(time) {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        currentAngle = initialAngle + (spins * Math.PI * 2 * easeOut);
        drawWheel();

        if(progress < 1) {
            requestAnimationFrame(animate);
        } else {
            spinning = false;
            btn.disabled = false;
            btn.innerText = "SPIN AGAIN";
            finalizeSpin();
        }
    }
    requestAnimationFrame(animate);
}

function finalizeSpin() {
    const sliceAngle = (Math.PI * 2) / wheelCuisines.length;
    const normalizedAngle = (Math.PI * 2 - (currentAngle % (Math.PI * 2))) % (Math.PI * 2);
    const index = Math.floor(normalizedAngle / sliceAngle);
    const result = wheelCuisines[index];

    const display = document.getElementById('wheelResult');
    display.innerHTML = `
        <div class="cuisine-main">${result}</div>
        <div class="cuisine-sub">sounds like a plan.</div>
    `;

    const actions = document.getElementById('resultActions');
    actions.innerHTML = `
        <button class="btn btn-ghost" onclick="confirmRemove('${result}')">Remove ${result} from wheel?</button>
    `;

    spinHistory.unshift({name: result, date: new Date().toLocaleTimeString()});
    if(spinHistory.length > 10) spinHistory.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory));
    renderHistory();
}

// --- 10. Wheel Management ---
function renderCuisines() {
    const viewList = document.getElementById('cuisineViewList');
    const editList = document.getElementById('cuisineEditList');
    if(!viewList) return;

    viewList.innerHTML = wheelCuisines.map(c => `<span class="cuisine-tag">${c}</span>`).join('');
    editList.innerHTML = wheelCuisines.map((c, i) => `
        <div class="cuisine-edit-item">
            <span>${c}</span>
            <button onclick="removeCuisine(${i})">×</button>
        </div>
    `).join('');
}

function toggleEdit() {
    editMode = !editMode;
    document.getElementById('cuisineViewList').style.display = editMode ? 'none' : 'flex';
    document.getElementById('cuisineEditPanel').style.display = editMode ? 'block' : 'none';
}

function addCuisine() {
    const inp = document.getElementById('newCuisineInput');
    const val = inp.value.trim();
    if(val && !wheelCuisines.includes(val)) {
        wheelCuisines.push(val);
        saveCuisines();
        inp.value = '';
    }
}

function removeCuisine(index) {
    if(wheelCuisines.length <= 2) return showToast("Need at least 2 options");
    wheelCuisines.splice(index, 1);
    saveCuisines();
}

function confirmRemove(name) {
    pendingRemove = name;
    document.getElementById('removeModalText').innerText = `Take "${name}" out of the rotation for now?`;
    document.getElementById('removeModal').classList.add('show');
    document.getElementById('confirmWheelBtn').onclick = () => {
        const idx = wheelCuisines.indexOf(pendingRemove);
        if(idx > -1) {
            wheelCuisines.splice(idx, 1);
            saveCuisines();
            document.getElementById('wheelResult').innerHTML = '<div class="cuisine-sub">removed. spin again?</div>';
            document.getElementById('resultActions').innerHTML = '';
        }
        closeModal();
    };
}

function saveCuisines() {
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines));
    renderCuisines();
    drawWheel();
}

// --- 11. UI Helpers ---
function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function closeModal() {
    document.getElementById('removeModal').classList.remove('show');
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if(!list) return;
    if(spinHistory.length === 0) {
        list.innerHTML = '<span class="history-empty">no spins yet</span>';
        return;
    }
    list.innerHTML = spinHistory.map(h => `
        <div class="history-item">
            <strong>${h.name}</strong>
            <span>${h.date}</span>
        </div>
    `).join('');
}

function clearHistory() {
    spinHistory = [];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory));
    renderHistory();
}

// --- 12. Init ---
renderCuisines();
renderHistory();
syncWithFirebase();

const editRatingSlider = document.getElementById('edit-rating-slider');
const editRatingDisplay = document.getElementById('edit-rating-display');
if(editRatingSlider) {
    editRatingSlider.oninput = function() {
        editRatingDisplay.textContent = parseFloat(this.value).toFixed(1);
    };
}

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
