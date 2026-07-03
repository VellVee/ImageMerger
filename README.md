# Image Merger

A simple, fast web application for merging images with cropping support.

## Features

- **Drag and Drop Interface:** Easily upload and reorder images.
- **Custom Cropping Engine:** A lightweight, native cropping tool optimized for very large images. Includes smooth pointer zooming, right-click flick dragging, and aspect-ratio locking.
- **Merge Options:** Stitch images together vertically or horizontally.
- **Auto Black Bar Removal:** Automatically detects and trims black borders from images.
- **Multiple Output Formats:** Export your merged images to JXL, WebP, or PNG.

## Requirements

- Python 3.8+
- [imageio](https://imageio.readthedocs.io/)
- [OpenCV](https://opencv.org/)
- [Pillow (PIL)](https://python-pillow.org/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Uvicorn](https://www.uvicorn.org/)

## Setup and Usage

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ImageMerger
   ```

2. **Set up a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the server**
   ```bash
   uvicorn main:app --reload
   ```

5. **Open the app**
   Navigate to `http://localhost:8000` in your browser.
