import os
import json
import io
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import imagecodecs

app = FastAPI()

allowed_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB per file

def to_uint8(img):
    if img.dtype == np.uint8:
        return img
    elif img.dtype == np.uint16:
        return (img / 257.0).astype(np.uint8)
    elif img.dtype in (np.float32, np.float64):
        # Some JXL floats might be 0-255 or 0-1, safely check max
        if img.max() > 1.0:
            return np.clip(img, 0, 255).astype(np.uint8)
        return (np.clip(img, 0.0, 1.0) * 255).astype(np.uint8)
    return img.astype(np.uint8)

def decode_image(contents: bytes, filename: str = "") -> np.ndarray:
    """Decode image bytes to a BGR uint8 numpy array.
    
    Tries cv2.imdecode first, then imagecodecs (for JXL and other formats
    cv2 can't handle), then PIL as a final fallback.
    Raises HTTPException(400) on failure.
    """
    nparr = np.frombuffer(contents, np.uint8)
    img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img_cv is not None:
        return to_uint8(img_cv)
    
    try:
        # imagecodecs.imread accepts bytes and detects the codec internally
        img_decoded = imagecodecs.imread(contents)
        img_decoded = to_uint8(img_decoded)
        if len(img_decoded.shape) == 3 and img_decoded.shape[2] == 3:
            return cv2.cvtColor(img_decoded, cv2.COLOR_RGB2BGR)
        elif len(img_decoded.shape) == 3 and img_decoded.shape[2] == 4:
            return cv2.cvtColor(img_decoded, cv2.COLOR_RGBA2BGR)
        elif len(img_decoded.shape) == 2:
            return cv2.cvtColor(img_decoded, cv2.COLOR_GRAY2BGR)
        return img_decoded
    except Exception:
        pass
    
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert('RGB')
        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Failed to decode image {filename}")

def remove_black_bars(img_cv):
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 1, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img_cv
    
    # Get the bounding rect of the largest contour
    cnt = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(cnt)
    
    # Crop
    return img_cv[y:y+h, x:x+w]

@app.post("/api/thumbnail")
async def get_thumbnail(file: UploadFile = File(...)):
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    
    img_cv = decode_image(contents, file.filename or "")
                
    _, buffer = cv2.imencode('.webp', img_cv, [cv2.IMWRITE_WEBP_QUALITY, 85])
    return Response(content=buffer.tobytes(), media_type="image/webp")

@app.post("/api/merge")
async def merge_images(
    files: list[UploadFile] = File(...),
    crop_data: str = Form("{}"),
    auto_remove_black_bars: str = Form("false"),
    direction: str = Form("vertical"),
    output_format: str = Form("jxl"),
    quality: int = Form(99)
):
    auto_remove = (auto_remove_black_bars.lower() == "true")
    
    try:
        crop_dict = json.loads(crop_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid crop_data JSON")
    
    processed_images = []
    
    for file in files:
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large: {file.filename}")
        
        img_cv = decode_image(contents, file.filename or "")
        
        # Apply crop if present, with bounds validation
        if file.filename in crop_dict:
            c = crop_dict[file.filename]
            img_h, img_w = img_cv.shape[:2]
            x = max(0, int(c['x']))
            y = max(0, int(c['y']))
            w = int(c['width'])
            h = int(c['height'])
            # Clamp to image bounds
            x = min(x, img_w - 1)
            y = min(y, img_h - 1)
            w = max(1, min(w, img_w - x))
            h = max(1, min(h, img_h - y))
            img_cv = img_cv[y:y+h, x:x+w]
            
        if auto_remove:
            img_cv = remove_black_bars(img_cv)
            
        # Convert to RGB for merging
        img_rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)
        processed_images.append(img_rgb)
        
    if not processed_images:
        raise HTTPException(status_code=400, detail="No images processed")
        
    # Merge images
    if len(processed_images) == 1:
        merged = processed_images[0]
    else:
        if direction == "horizontal":
            # Match heights
            max_height = max(img.shape[0] for img in processed_images)
            resized_images = []
            for img in processed_images:
                h, w, c = img.shape
                if h != max_height:
                    new_w = int(w * (max_height / h))
                    img = cv2.resize(img, (new_w, max_height), interpolation=cv2.INTER_LANCZOS4)
                resized_images.append(img)
            merged = np.concatenate(resized_images, axis=1)
        else:
            # Match widths
            max_width = max(img.shape[1] for img in processed_images)
            resized_images = []
            for img in processed_images:
                h, w, c = img.shape
                if w != max_width:
                    new_h = int(h * (max_width / w))
                    img = cv2.resize(img, (max_width, new_h), interpolation=cv2.INTER_LANCZOS4)
                resized_images.append(img)
            merged = np.concatenate(resized_images, axis=0)
            
    # Encode image
    if output_format == "png":
        _, buffer = cv2.imencode('.png', cv2.cvtColor(merged, cv2.COLOR_RGB2BGR))
        data = buffer.tobytes()
        media_type = "image/png"
        ext = "png"
    elif output_format == "jpg":
        _, buffer = cv2.imencode('.jpg', cv2.cvtColor(merged, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, quality])
        data = buffer.tobytes()
        media_type = "image/jpeg"
        ext = "jpg"
    elif output_format == "webp":
        img_pil = Image.fromarray(merged)
        buf = io.BytesIO()
        if quality == 100:
            img_pil.save(buf, format="WEBP", lossless=True)
        else:
            img_pil.save(buf, format="WEBP", quality=quality)
        data = buf.getvalue()
        media_type = "image/webp"
        ext = "webp"
    else:
        if quality == 100:
            data = imagecodecs.jpegxl_encode(merged, lossless=True)
        else:
            dist = max(0.01, (100 - quality) / 10.0)
            data = imagecodecs.jpegxl_encode(merged, lossless=False, distance=dist)
        media_type = "image/jxl"
        ext = "jxl"
    
    return Response(content=data, media_type=media_type, headers={"Content-Disposition": f"attachment; filename=merged.{ext}"})

app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
