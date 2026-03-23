# Workout Tool - AI Update Guide

This directory contains a data-driven workout tracker. The app's content is dynamically generated from `workouts.json`.

## Task: Updating Workouts
When asked to update the workout plan or add a new split, you must modify `workouts.json`. **Do not modify `index.html`, `style.css`, or `script.js`** unless specifically instructed to change the application logic or styling.

## Data Structure (`workouts.json`)
The JSON file must follow this schema to ensure the app renders correctly:

```json
{
  "workouts": [
    {
      "id": "A",             // Short identifier (usually A, B, C...) used in the tab
      "label": "Push",       // Descriptive label for the tab (e.g., Push, Pull, Legs)
      "focus": "PUSH + CORE", // Header text shown in the focus bar
      "exercises": [
        {
          "name": "Exercise Name",
          "sets": "3",       // String representing number of sets
          "reps": "10-12"    // String representing rep range or duration
        }
      ],
      "cardio": {
        "icon": "🚴",        // Emoji icon for the cardio block
        "title": "CARDIO",    // Title for the cardio block
        "description": "..."  // Detailed description of the cardio activity
      }
    }
  ]
}
```

## JSON Schema
For validation and strict structure adherence:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["workouts"],
  "properties": {
    "workouts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "label", "focus", "exercises", "cardio"],
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "focus": { "type": "string" },
          "exercises": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "sets", "reps"],
              "properties": {
                "name": { "type": "string" },
                "sets": { "type": "string" },
                "reps": { "type": "string" }
              }
            }
          },
          "cardio": {
            "type": "object",
            "required": ["icon", "title", "description"],
            "properties": {
              "icon": { "type": "string" },
              "title": { "type": "string" },
              "description": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

## Guidelines for New Workouts
1. **Consistency**: Keep the `id` short (1-2 characters) as it's the primary text in the tab.
2. **Visuals**: Use appropriate emojis for the `cardio.icon`.
3. **Validation**: Ensure all strings are present; the UI depends on these fields for rendering.
4. **Order**: The order in the `workouts` array determines the order of the tabs and panels.
