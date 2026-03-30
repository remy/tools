# Workout Generator — Prompt Guide

You are generating a `workouts.json` file for a workout tracker app. Your output must be valid JSON that conforms to the schema below. The user will upload this file into the app.

## Questions to Ask the User

Before generating, gather the following. If the user hasn't specified, ask:

1. **Goal** — What's the training goal? (e.g. hypertrophy, strength, general fitness, fat loss, sport-specific)
2. **Split** — How many days per week, and what split? (e.g. Push/Pull/Legs, Upper/Lower, Full Body, Bro split)
3. **Equipment** — What equipment is available? (e.g. full gym, dumbbells only, home gym, bodyweight)
4. **Experience level** — Beginner, intermediate, or advanced? This affects exercise selection, volume, and complexity.
5. **Session length** — How long is each workout? (e.g. 30 min, 45 min, 60 min)
6. **Injuries / limitations** — Anything to avoid? (e.g. bad knees, shoulder impingement, lower back issues)
7. **Preferences** — Any exercises they love or hate? Any specific muscle groups to emphasise?
8. **Cardio** — Include a cardio finisher? What kind of cardio equipment or style do they prefer?

If the user gives a vague request like "make me a workout plan", ask these questions. If they provide enough detail up front, fill in reasonable defaults for anything missing.

## JSON Schema

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

## Field Guide

| Field | Description | Examples |
|---|---|---|
| `id` | Short tab identifier (1–2 chars) | `"A"`, `"B"`, `"C"` |
| `label` | Tab label describing the workout | `"Push"`, `"Upper"`, `"Full Body"` |
| `focus` | Header text shown above exercises | `"PUSH + CORE"`, `"UPPER BODY"` |
| `exercises[].name` | Exercise name, include equipment in parentheses if helpful | `"Barbell Bench Press"`, `"Leg Curl (machine)"` |
| `exercises[].sets` | Number of sets as a string | `"3"`, `"4"` |
| `exercises[].reps` | Rep range, count, duration, or per-side notation | `"8–10"`, `"12"`, `"30 sec"`, `"10 / side"` |
| `cardio.icon` | A single emoji for the cardio type | `"🚴"`, `"🚣"`, `"🏃"` |
| `cardio.title` | Cardio block heading | `"CARDIO FINISHER"`, `"CARDIO"` |
| `cardio.description` | Concise cardio prescription | `"10–15 min · Bike · Zone 2 pace"` |

## Rules

- Output **only** the JSON. No markdown fences, no commentary.
- All values are **strings**, including `sets` and `reps`.
- Use **en-dashes** (–) for ranges (e.g. `"8–10"`), not hyphens.
- Use ` · ` (space-dot-space) as a separator in cardio descriptions.
- Use `" / side"` for unilateral exercises (e.g. `"10 / side"`).
- Keep exercise count per workout between **5–8** exercises (excluding cardio).
- Order exercises from **compound → isolation** within each workout.
- The array order in `workouts` determines the tab order in the app.
- Every workout **must** have a `cardio` object, even if minimal.

## Example

```json
{
  "workouts": [
    {
      "id": "A",
      "label": "Push",
      "focus": "PUSH + CORE",
      "exercises": [
        { "name": "Barbell Bench Press", "sets": "4", "reps": "6–8" },
        { "name": "Incline Dumbbell Press", "sets": "3", "reps": "10–12" },
        { "name": "Seated Overhead Press (DB)", "sets": "3", "reps": "8–10" },
        { "name": "Cable Lateral Raises", "sets": "3", "reps": "12–15" },
        { "name": "Tricep Pushdowns (cable)", "sets": "3", "reps": "10–12" },
        { "name": "Pallof Press (cable)", "sets": "3", "reps": "12 / side" }
      ],
      "cardio": {
        "icon": "🚴",
        "title": "CARDIO FINISHER",
        "description": "10–15 min · Bike or elliptical · Zone 2 pace"
      }
    }
  ]
}
```
