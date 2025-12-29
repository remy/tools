#!/bin/bash

# Path to your file
FILE="./extra.json"

# Get the length of the array
length=$(jq 'length' "$FILE")

# Loop through each index
for ((i=0; i<$length; i++)); do
  # 1. Extract the title for the current index
  title=$(jq -r ".[$i].title" "$FILE")

  # 2. Get the URL using your existing script
  # We echo the title and pipe it to find_movie
  url=$(echo "$title" | find_movie)

  # 3. Update the JSON file in-place with the new url field
  # We use --arg to safely pass the shell variable into jq
  updated_json=$(jq ".[$i].url = \"$url\"" "$FILE")
  echo "$updated_json" > "$FILE"
done
