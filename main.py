import os
import json
import io
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import imagecodecs

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
os.makedirs(frontend_dir, exist_ok=True)

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
    crop_dict = json.loads(crop_data)
    
    processed_images = []
    
    for file in files:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Apply crop if present
        if file.filename in crop_dict:
            c = crop_dict[file.filename]
            x, y, w, h = int(c['x']), int(c['y']), int(c['width']), int(c['height'])
            img_cv = img_cv[y:y+h, x:x+w]
            
        if auto_remove:
            img_cv = remove_black_bars(img_cv)
            
        # Convert to PIL Image for easier concatenation later, or keep as numpy
        # Let's keep as numpy for now, but ensure it's RGB
        img_rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)
        processed_images.append(img_rgb)
        
    if not processed_images:
        return Response(status_code=400, content="No images processed")
        
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
