const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const gallery = document.getElementById('gallery');
const mergeBtn = document.getElementById('merge-btn');
const autoRemoveCheck = document.getElementById('auto-remove-black-bars');
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const settingsPanel = document.getElementById('settings-panel');

menuToggleBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
});

const outputFormatSelect = document.getElementById('output-format');
const qualityGroup = document.getElementById('quality-group');
const qualitySlider = document.getElementById('quality-slider');
const qualityValue = document.getElementById('quality-value');

function updateQualityDisplay() {
    const format = outputFormatSelect.value;
    const val = parseInt(qualitySlider.value, 10);

    if (format === 'png') {
        qualityGroup.style.display = 'none';
    } else {
        qualityGroup.style.display = 'flex';
        if (val === 100 && (format === 'webp' || format === 'jxl')) {
            qualityValue.textContent = '100 (Lossless)';
        } else {
            qualityValue.textContent = val;
        }
    }
}

outputFormatSelect.addEventListener('change', updateQualityDisplay);
qualitySlider.addEventListener('input', updateQualityDisplay);
updateQualityDisplay(); // Initialize state

const cropModal = document.getElementById('crop-modal');
const cropImage = document.getElementById('crop-image');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const saveCropBtn = document.getElementById('save-crop-btn');
const removeAllBtn = document.getElementById('remove-all-btn');

const cropTop = document.getElementById('crop-top');
const cropBottom = document.getElementById('crop-bottom');
const cropLeft = document.getElementById('crop-left');
const cropRight = document.getElementById('crop-right');

let filesMap = new Map(); // filename -> File object
let cropDataMap = new Map(); // filename -> crop data object
let currentCropFilename = null;
let cropper = null;

// Initialize Sortable
new Sortable(gallery, {
    animation: 150,
    ghostClass: 'sortable-ghost'
});

// Drag & Drop Handlers
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
});

fileInput.addEventListener('change', function () {
    handleFiles(this.files);
});

async function handleFiles(files) {
    for (const file of [...files]) {
        if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.jxl')) {
            // Generate unique name if collision
            let name = file.name;
            let counter = 1;
            while (filesMap.has(name)) {
                name = `${counter}_${file.name}`;
                counter++;
            }
            filesMap.set(name, file);
            await renderGalleryItem(name, file);
        }
    }
    updateMergeButton();
}

async function renderGalleryItem(filename, file) {
    let src = '';

    if (file.name.toLowerCase().endsWith('.jxl')) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/thumbnail', { method: 'POST', body: formData });
            if (res.ok) {
                const blob = await res.blob();
                src = URL.createObjectURL(blob);
            }
        } catch (e) {
            console.error('Failed to get JXL thumbnail:', e);
        }
    }

    if (!src) {
        src = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.dataset.filename = filename;

    const img = document.createElement('img');
    img.src = src;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'item-actions';

    const cropBtn = document.createElement('button');
    cropBtn.className = 'btn-icon';
    cropBtn.textContent = 'Crop';
    cropBtn.onclick = () => openCropModal(filename, src);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon delete';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = () => {
        filesMap.delete(filename);
        cropDataMap.delete(filename);
        div.remove();
        updateMergeButton();
    };

    actionsDiv.appendChild(cropBtn);
    actionsDiv.appendChild(deleteBtn);

    div.appendChild(img);
    div.appendChild(actionsDiv);
    gallery.appendChild(div);
}

function updateMergeButton() {
    const disabled = filesMap.size === 0;
    mergeBtn.disabled = disabled;
    if (removeAllBtn) removeAllBtn.disabled = disabled;
}

if (removeAllBtn) {
    removeAllBtn.addEventListener('click', () => {
        filesMap.clear();
        cropDataMap.clear();
        gallery.innerHTML = '';
        updateMergeButton();
    });
}

let currentZoomPercent = 100;
let minZoomPercent = 100;
let imgNaturalWidth = 0;
let imgNaturalHeight = 0;

let cropData = { x: 0, y: 0, width: 0, height: 0 };
let interactionState = 'IDLE'; // IDLE, MOVE_BOX, RESIZE_BOX, RIGHT_CLICK_DOWN
let interactionStartPointer = { x: 0, y: 0 };
let interactionStartCropData = null;
let resizeDirection = null; // 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
let lastPointerEvent = null;

const cropWrapper = document.getElementById('crop-wrapper');
const cropWorkspace = document.getElementById('crop-workspace');
const customCropBox = document.getElementById('custom-crop-box');
const overlayTop = document.getElementById('overlay-top');
const overlayBottom = document.getElementById('overlay-bottom');
const overlayLeft = document.getElementById('overlay-left');
const overlayRight = document.getElementById('overlay-right');

function updateCropVisuals() {
    const scale = currentZoomPercent / 100;
    const sX = cropData.x * scale;
    const sY = cropData.y * scale;
    const sW = cropData.width * scale;
    const sH = cropData.height * scale;

    customCropBox.style.left = `${sX}px`;
    customCropBox.style.top = `${sY}px`;
    customCropBox.style.width = `${sW}px`;
    customCropBox.style.height = `${sH}px`;

    const totalW = imgNaturalWidth * scale;
    const totalH = imgNaturalHeight * scale;

    overlayTop.style.top = '0';
    overlayTop.style.left = '0';
    overlayTop.style.width = `${totalW}px`;
    overlayTop.style.height = `${sY}px`;

    overlayBottom.style.top = `${sY + sH}px`;
    overlayBottom.style.left = '0';
    overlayBottom.style.width = `${totalW}px`;
    overlayBottom.style.height = `${totalH - (sY + sH)}px`;

    overlayLeft.style.top = `${sY}px`;
    overlayLeft.style.left = '0';
    overlayLeft.style.width = `${sX}px`;
    overlayLeft.style.height = `${sH}px`;

    overlayRight.style.top = `${sY}px`;
    overlayRight.style.left = `${sX + sW}px`;
    overlayRight.style.width = `${totalW - (sX + sW)}px`;
    overlayRight.style.height = `${sH}px`;

    cropTop.value = Math.round(cropData.y);
    cropBottom.value = Math.round(imgNaturalHeight - cropData.y - cropData.height);
    cropLeft.value = Math.round(cropData.x);
    cropRight.value = Math.round(imgNaturalWidth - cropData.x - cropData.width);
}

function updateCropFromInteraction(e) {
    if (interactionState === 'IDLE' || !interactionStartCropData) return;

    const scale = currentZoomPercent / 100;
    const deltaX = (e.clientX - interactionStartPointer.x) / scale;
    const deltaY = (e.clientY - interactionStartPointer.y) / scale;

    let newD = { ...interactionStartCropData };

    if (interactionState === 'MOVE_BOX') {
        newD.x += deltaX;
        newD.y += deltaY;
    } else if (interactionState === 'RESIZE_BOX') {
        if (resizeDirection.includes('n')) {
            newD.y += deltaY;
            newD.height -= deltaY;
        }
        if (resizeDirection.includes('s')) {
            newD.height += deltaY;
        }
        if (resizeDirection.includes('w')) {
            newD.x += deltaX;
            newD.width -= deltaX;
        }
        if (resizeDirection.includes('e')) {
            newD.width += deltaX;
        }

        if (e.shiftKey) {
            if (resizeDirection === 'n' || resizeDirection === 's') {
                newD.width = Math.abs(newD.height);
            } else if (resizeDirection === 'e' || resizeDirection === 'w') {
                newD.height = Math.abs(newD.width);
            } else {
                const maxDim = Math.max(Math.abs(newD.width), Math.abs(newD.height));
                newD.width = maxDim;
                newD.height = maxDim;
                if (resizeDirection.includes('n')) {
                    newD.y = interactionStartCropData.y + interactionStartCropData.height - maxDim;
                }
                if (resizeDirection.includes('w')) {
                    newD.x = interactionStartCropData.x + interactionStartCropData.width - maxDim;
                }
            }
        }
    }

    // 1. Enforce minimum dimensions (1x1)
    if (newD.width < 1) {
        if (interactionState === 'RESIZE_BOX' && resizeDirection.includes('w')) {
            newD.x -= (1 - newD.width);
        }
        newD.width = 1;
    }
    if (newD.height < 1) {
        if (interactionState === 'RESIZE_BOX' && resizeDirection.includes('n')) {
            newD.y -= (1 - newD.height);
        }
        newD.height = 1;
    }

    // 2. Enforce boundaries
    if (newD.x < 0) {
        if (interactionState === 'RESIZE_BOX' && resizeDirection.includes('w')) {
            newD.width += newD.x;
        }
        newD.x = 0;
    }
    if (newD.y < 0) {
        if (interactionState === 'RESIZE_BOX' && resizeDirection.includes('n')) {
            newD.height += newD.y;
        }
        newD.y = 0;
    }
    if (newD.x + newD.width > imgNaturalWidth) {
        if (interactionState === 'MOVE_BOX') newD.x = imgNaturalWidth - newD.width;
        else newD.width = imgNaturalWidth - newD.x;
    }
    if (newD.y + newD.height > imgNaturalHeight) {
        if (interactionState === 'MOVE_BOX') newD.y = imgNaturalHeight - newD.height;
        else newD.height = imgNaturalHeight - newD.y;
    }

    // 3. Re-enforce square if shiftKey during resize
    if (interactionState === 'RESIZE_BOX' && e.shiftKey) {
        const minDim = Math.min(newD.width, newD.height);
        if (resizeDirection.includes('n')) newD.y += (newD.height - minDim);
        if (resizeDirection.includes('w')) newD.x += (newD.width - minDim);
        newD.width = minDim;
        newD.height = minDim;
    }

    cropData = newD;
    updateCropVisuals();
}

// Global Interaction Events
window.addEventListener('pointermove', (e) => {
    if (e.buttons === 0) {
        interactionState = 'IDLE';
        if (autoScrollInterval) { clearInterval(autoScrollInterval); autoScrollInterval = null; }
        return;
    }
    lastPointerEvent = e;

    if (interactionState === 'RIGHT_CLICK_DOWN') {
        const deltaX = e.clientX - interactionStartPointer.x;
        const deltaY = e.clientY - interactionStartPointer.y;
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            interactionState = 'RESIZE_BOX';
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                resizeDirection = deltaY > 0 ? 'n' : 's';
            } else {
                resizeDirection = deltaX > 0 ? 'w' : 'e';
            }
            interactionStartPointer = { x: e.clientX, y: e.clientY };
            interactionStartCropData = { ...cropData };
        }
    }

    if (interactionState !== 'IDLE' && interactionState !== 'RIGHT_CLICK_DOWN') {
        updateCropFromInteraction(e);
    }

    // Auto-scroll when dragging near edges
    if (interactionState !== 'IDLE') {
        const rect = cropWrapper.getBoundingClientRect();
        const scrollZone = 50;
        let scrollSpeed = 0;
        if (e.clientY < rect.top + scrollZone) scrollSpeed = -15;
        else if (e.clientY > rect.bottom - scrollZone) scrollSpeed = 15;

        if (scrollSpeed !== 0) {
            if (!autoScrollInterval) {
                autoScrollInterval = setInterval(() => { cropWrapper.scrollTop += scrollSpeed; }, 16);
            }
        } else if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }
});

let autoScrollInterval = null;

window.addEventListener('pointerup', () => {
    interactionState = 'IDLE';
    if (autoScrollInterval) { clearInterval(autoScrollInterval); autoScrollInterval = null; }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && interactionState === 'RESIZE_BOX' && lastPointerEvent) {
        updateCropFromInteraction(lastPointerEvent);
    }
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && interactionState === 'RESIZE_BOX' && lastPointerEvent) {
        updateCropFromInteraction(lastPointerEvent);
    }
});

cropWrapper.addEventListener('contextmenu', (e) => e.preventDefault());

cropWorkspace.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
        if (e.target.classList.contains('custom-crop-handle')) {
            interactionState = 'RESIZE_BOX';
            resizeDirection = e.target.dataset.dir;
            e.preventDefault();
        } else if (e.target.id === 'custom-crop-box') {
            interactionState = 'MOVE_BOX';
            e.preventDefault();
        }
    } else if (e.button === 2) {
        interactionState = 'RIGHT_CLICK_DOWN';
        e.preventDefault();
    }

    if (interactionState !== 'IDLE') {
        interactionStartPointer = { x: e.clientX, y: e.clientY };
        interactionStartCropData = { ...cropData };
        lastPointerEvent = e;
    }
});

cropWrapper.addEventListener('wheel', (e) => {
    if (!currentCropFilename) return;
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    const oldZoomPercent = currentZoomPercent;

    let zoomStep = currentZoomPercent > 50 ? 10 : 2;
    if (currentZoomPercent < 10) zoomStep = 0.5;
    if (e.deltaY > 0) {
        currentZoomPercent = Math.max(minZoomPercent, currentZoomPercent - zoomStep);
    } else {
        currentZoomPercent = Math.min(2000, currentZoomPercent + zoomStep);
    }

    if (oldZoomPercent === currentZoomPercent) return;

    const wrapperRect = cropWrapper.getBoundingClientRect();
    const pointerY = e.clientY - wrapperRect.top;
    const pointerX = e.clientX - wrapperRect.left;

    const pixelY = cropWrapper.scrollTop + pointerY;
    const pixelX = cropWrapper.scrollLeft + pointerX;

    const naturalY = pixelY / (oldZoomPercent / 100);
    const naturalX = pixelX / (oldZoomPercent / 100);

    const newPixelY = naturalY * (currentZoomPercent / 100);
    const newPixelX = naturalX * (currentZoomPercent / 100);

    cropWorkspace.style.width = `${imgNaturalWidth * (currentZoomPercent / 100)}px`;
    cropWorkspace.style.height = `${imgNaturalHeight * (currentZoomPercent / 100)}px`;

    updateCropVisuals();

    cropWrapper.scrollTop = newPixelY - pointerY;
    cropWrapper.scrollLeft = newPixelX - pointerX;
}, { passive: false, capture: true });

function openCropModal(filename, src) {
    currentCropFilename = filename;
    cropImage.src = src;
    cropModal.classList.remove('hidden');

    const initCropper = () => {
        imgNaturalWidth = cropImage.naturalWidth;
        imgNaturalHeight = cropImage.naturalHeight;

        const wrapperRect = cropWrapper.getBoundingClientRect();
        const scaleX = (wrapperRect.width - 40) / imgNaturalWidth;
        const scaleY = (wrapperRect.height - 40) / imgNaturalHeight;
        const fitPercent = Math.min(scaleX, scaleY, 1) * 100;

        currentZoomPercent = fitPercent;
        minZoomPercent = fitPercent;

        cropWorkspace.style.width = `${imgNaturalWidth * (currentZoomPercent / 100)}px`;
        cropWorkspace.style.height = `${imgNaturalHeight * (currentZoomPercent / 100)}px`;

        if (cropDataMap.has(filename)) {
            cropData = { ...cropDataMap.get(filename) };
        } else {
            cropData = { x: 0, y: 0, width: imgNaturalWidth, height: imgNaturalHeight };
        }

        updateCropVisuals();
    };

    if (cropImage.complete) initCropper();
    else cropImage.onload = initCropper;
}

[cropTop, cropBottom, cropLeft, cropRight].forEach(input => {
    input.addEventListener('change', () => {
        if (!currentCropFilename) return;
        const top = parseFloat(cropTop.value) || 0;
        const bottom = parseFloat(cropBottom.value) || 0;
        const left = parseFloat(cropLeft.value) || 0;
        const right = parseFloat(cropRight.value) || 0;

        cropData.x = left;
        cropData.y = top;
        cropData.width = imgNaturalWidth - left - right;
        cropData.height = imgNaturalHeight - top - bottom;

        if (cropData.width < 1) cropData.width = 1;
        if (cropData.height < 1) cropData.height = 1;

        updateCropVisuals();
    });
});

cancelCropBtn.addEventListener('click', () => {
    cropModal.classList.add('hidden');
    currentCropFilename = null;
});

saveCropBtn.addEventListener('click', () => {
    if (currentCropFilename) {
        cropDataMap.set(currentCropFilename, { ...cropData });

        const item = gallery.querySelector(`[data-filename="${currentCropFilename}"] img`);
        if (item) {
            const canvas = document.createElement('canvas');
            canvas.width = cropData.width;
            canvas.height = cropData.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(
                cropImage,
                cropData.x, cropData.y, cropData.width, cropData.height,
                0, 0, cropData.width, cropData.height
            );
            item.src = canvas.toDataURL();
        }

        cropModal.classList.add('hidden');
        currentCropFilename = null;
    }
});

function generateRandomName() {
    const chars = 'abcdefghijklmnopqrstuvwxyz123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Merge
mergeBtn.addEventListener('click', async () => {
    if (filesMap.size === 0) return;

    mergeBtn.disabled = true;
    const originalText = mergeBtn.textContent;
    mergeBtn.textContent = 'Processing...';

    const formData = new FormData();

    // Get ordered filenames from the DOM
    const items = gallery.querySelectorAll('.gallery-item');
    items.forEach(item => {
        const filename = item.dataset.filename;
        const file = filesMap.get(filename);
        if (file) {
            formData.append('files', file, filename);
        }
    });

    formData.append('crop_data', JSON.stringify(Object.fromEntries(cropDataMap)));
    formData.append('auto_remove_black_bars', autoRemoveCheck.checked);

    const direction = document.querySelector('input[name="direction"]:checked').value;
    formData.append('direction', direction);

    const outputFormat = document.getElementById('output-format').value;
    formData.append('output_format', outputFormat);
    formData.append('quality', qualitySlider.value);

    try {
        const response = await fetch('/api/merge', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${generateRandomName()}.${outputFormat}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error(error);
        alert('An error occurred during merging.');
    } finally {
        mergeBtn.disabled = false;
        mergeBtn.textContent = originalText;
    }
});
