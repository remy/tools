# Immich Mass Rotate Implementation Transcript

## Initial Specification

A tool that lets users fix rotation issues in Immich images en mass. The user is presented with a wall of thumbnails which they select and once the selection is done, clicks a button and all those images are rotated (left or right) and sent to the Immich API (plus updating in the UI).

### Requirements

- The UI accepts the host, API key and a year
- The year is used to filter the images selected
- The API accepts `x-api-key` in the header, and expects JSON content type
- When the assets are returned for the year filter they come back in pages of 250
- The user should be able to select each page (allowing them to work on 250 assets at a time)
- When the user selects an image, it should clearly show it's selected (using similar effects to Google Photos select)
- The user is offered two rotation tools (icons svg) rotate clockwise or anticlockwise
- Shortcuts: R for clockwise and Shift+R for counter-clockwise
- API request profile for rotation:

```
PUT /assets/f7356adb-b4ab-4bd5-a778-46799548874e/edits
{
  "assetId": "f7356adb-b4ab-4bd5-a778-46799548874e",
  "edits": [{ "action": "rotate", "parameters": { "angle": 90 } }]
}
```

- Thumbnail endpoint: `/assets/${asset.id}/thumbnail?edited=true&apiKey=${API_KEY}`

## Implementation

### Files Created

1. **index.html** - Main HTML interface
   - Form inputs for Immich host, API key, and year filter
   - Image gallery grid display
   - Rotation buttons with SVG icons
   - Pagination controls (Previous/Next)
   - Status display area
   - Keyboard shortcut reference

2. **styles.css** - Complete styling
   - Two-column layout: sidebar (300px) + main content area
   - Google Photos-style selection with blue borders and checkmarks
   - Responsive image grid
   - Smooth transitions and hover effects
   - Loading animations
   - Disabled states for buttons

3. **app.js** - Full application logic
   - ImmichMassRotate class that handles all functionality
   - Image loading from Immich API with year filtering
   - Pagination support (250 images per page)
   - Click-to-select/deselect with visual feedback
   - Keyboard shortcuts (R and Shift+R)
   - Batch rotation API calls
   - Error handling and user feedback
   - Status messages throughout the workflow

### Key Features

- **Image Loading**: Fetches all assets for specified year using Immich metadata search API
- **Pagination**: Displays 250 images per page with navigation
- **Selection UI**: Google Photos-style selection with checkmarks and blue highlights
- **Keyboard Shortcuts**:
  - `R` - Rotate clockwise (90°)
  - `Shift+R` - Rotate counter-clockwise (-90°)
- **Batch Operations**: Rotate multiple selected images in sequence
- **Responsive Design**: Sidebar for controls, main area for gallery
- **Error Handling**: User-friendly error messages and validation

### How to Use

1. Open `index.html` in a web browser
2. Enter your Immich host URL (e.g., `http://localhost:3001`)
3. Enter your API key
4. Enter the year to filter images
5. Click "Load Images" button
6. Click on thumbnails to select/deselect images
7. Use rotation buttons or keyboard shortcuts to rotate selected images
8. Navigate between pages using Previous/Next buttons

## Status

✅ Complete - All features implemented according to specification
