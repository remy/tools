A look that lets me fix rotation issues in Immich images en mass. The user is presented with a wall of thumbnails which she selects and once the selection is done, clicks a button and all those images are rotated (left or right) and sent the Immich API (plus updating in the UI).

The UI accepts the host, API key and a year. The year is used to filter the images selected.

The API accepted `x-api-key` in the header, and expects JSON content type.

When the assets are returned for the year filter they come back in pages of 250. The user should also be able to select each page (allowing them to work on 250 assets at a time).

When the user selects an image, it should clearly show it's selected (using similar effects to google photos select).

The user is offered two rotation tools (icons svg) rotate clockwise or anticlockwise (also with shortcuts: R and shift+R respectively).

Upon the rotate, the API request is sent has this profile:

```
// clockwise edit example where asset.id is f7356adb-b4ab-4bd5-a778-46799548874e in this example
PUT /assets/f7356adb-b4ab-4bd5-a778-46799548874e/edits
{
  "assetId": "f7356adb-b4ab-4bd5-a778-46799548874e",
  "edits": [{ "action": "rotate", "parameters": { "angle": 90 } }]
}
```

The wall of images should use this API endpoint to get the images:

```
/assets/${asset.id}/thumbnail?edited=true&apiKey=${API_KEY}
```

