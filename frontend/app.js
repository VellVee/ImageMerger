const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const gallery = document.getElementById('gallery');
const mergeBtn = document.getElementById('merge-btn');
const autoRemoveCheck = document.getElementById('auto-remove-black-bars');
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const settingsMenu = document.getElementById('settings-menu');

menuToggleBtn.addEventListener('click', () => {
    settingsMenu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!settingsMenu.contains(e.target) && !menuToggleBtn.contains(e.target)) {
        settingsMenu.classList.add('hidden');
    }
});

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

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    [...files].forEach(file => {
        if (file.type.startsWith('image/')) {
            // Generate unique name if collision
            let name = file.name;
            let counter = 1;
            while(filesMap.has(name)) {
                name = `${counter}_${file.name}`;
                counter++;
            }
            filesMap.set(name, file);
            renderGalleryItem(name, file);
        }
    });
    updateMergeButton();
}

function renderGalleryItem(filename, file) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.dataset.filename = filename;

        const img = document.createElement('img');
        img.src = reader.result;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        const cropBtn = document.createElement('button');
        cropBtn.className = 'btn-icon';
        cropBtn.textContent = 'Crop';
        cropBtn.onclick = () => openCropModal(filename, reader.result);

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
    };
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
let minZoomPercent = 1;
let imgNaturalWidth = 0;
let imgNaturalHeight = 0;

// Cropping
function openCropModal(filename, src) {
    currentCropFilename = filename;
    cropImage.src = src;
    cropModal.classList.remove('hidden');

    if (cropper) {
        cropper.destroy();
    }

    const initCropper = () => {
        imgNaturalWidth = cropImage.naturalWidth;
        imgNaturalHeight = cropImage.naturalHeight;
        
        // Calculate initial zoom to fit within wrapper
        const wrapperRect = cropWrapper.getBoundingClientRect();
        // Add some padding to initial fit
        const scaleX = (wrapperRect.width - 40) / imgNaturalWidth;
        const scaleY = (wrapperRect.height - 40) / imgNaturalHeight;
        currentZoomPercent = Math.min(scaleX, scaleY, 1) * 100;
        minZoomPercent = Math.min(1, currentZoomPercent / 2); // Allow zooming out even more than initial fit

        cropContainer.style.width = `${imgNaturalWidth * (currentZoomPercent / 100)}px`;
        cropContainer.style.height = `${imgNaturalHeight * (currentZoomPercent / 100)}px`;

        cropper = new Cropper(cropImage, {
            viewMode: 1,
            autoCropArea: 1,
            zoomable: false,
            crop(event) {
                const data = event.detail;
                cropTop.value = Math.round(data.y);
                cropBottom.value = Math.round(imgNaturalHeight - data.y - data.height);
                cropLeft.value = Math.round(data.x);
                cropRight.value = Math.round(imgNaturalWidth - data.x - data.width);
            }
        });
    };

    if (cropImage.complete) {
        initCropper();
    } else {
        cropImage.onload = initCropper;
    }
}

[cropTop, cropBottom, cropLeft, cropRight].forEach(input => {
    input.addEventListener('change', () => {
        if (!cropper) return;
        const top = parseFloat(cropTop.value) || 0;
        const bottom = parseFloat(cropBottom.value) || 0;
        const left = parseFloat(cropLeft.value) || 0;
        const right = parseFloat(cropRight.value) || 0;
        
        cropper.setData({
            x: left,
            y: top,
            width: imgNaturalWidth - left - right,
            height: imgNaturalHeight - top - bottom
        });
    });
});

cancelCropBtn.addEventListener('click', () => {
    cropModal.classList.add('hidden');
    if (cropper) cropper.destroy();
});

saveCropBtn.addEventListener('click', () => {
    if (cropper) {
        const data = cropper.getData(true); // true = rounded
        cropDataMap.set(currentCropFilename, data);
        
        // Update thumbnail to show cropped version
        const canvas = cropper.getCroppedCanvas();
        const item = gallery.querySelector(`[data-filename="${currentCropFilename}"] img`);
        if (item) {
            item.src = canvas.toDataURL();
        }

        cropModal.classList.add('hidden');
        cropper.destroy();
    }
});

const cropWrapper = document.getElementById('crop-wrapper');
const cropContainer = document.getElementById('crop-container');

cropWrapper.addEventListener('wheel', (e) => {
    if (!cropper) return;
    
    e.preventDefault();
    
    const oldData = cropper.getData();
    
    // Zoom factor
    let zoomStep = currentZoomPercent > 50 ? 10 : 2;
    if (currentZoomPercent < 10) zoomStep = 0.5;

    if (e.deltaY > 0) {
        currentZoomPercent = Math.max(minZoomPercent, currentZoomPercent - zoomStep);
    } else {
        currentZoomPercent = Math.min(2000, currentZoomPercent + zoomStep);
    }
    
    cropContainer.style.width = `${imgNaturalWidth * (currentZoomPercent / 100)}px`;
    cropContainer.style.height = `${imgNaturalHeight * (currentZoomPercent / 100)}px`;
    
    cropper.resize();
    cropper.setData(oldData);
}, { passive: false });

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
