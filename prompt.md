You are a professional front-end developer.

Generate a complete, well-structured web app using:
- HTML
- CSS
- Vanilla JavaScript (no frameworks unless specified)

IMPORTANT:
- Do NOT invent themes, story, text content, or design ideas.
- Use neutral placeholders wherever content is required.
- Focus on clean structure, modularity, and reusability.

========================
PROJECT SPECIFICATION
========================

Wiadukt

Game Description:
this is a 2 player game in which, in order to win, a player must chose the winning side of the viaduct (the side from which the train will come) and therefore recieve a point(s).

Core Mechanics:
the sides are allocated to the players by the player (player 1) that did not chose in the previous round, drawing one of the two sides - of which the default names are left and right but can be edited by the user to be called something different - then the other player (player 2) recieving the side which was not chosen. this will reset after each round and in the next round, player 2 would be drawing a side. this process must happen before they enter the area close to the viaduct and before any points are rewarded. if the winning player is on the viaduct when the train passes underneath, they will recieve 1 point. if the winning player is not on the viaduct but 10 seconds away from crossing (either before or after) the viaduct, they recieve 0.5 points. points are only awarded to the winning player during the round, all other trains that pass in the round have no impact on the points. rounds are ended automatically at midnight each day or manually by pressing a button - "new round". the points should accumulate both weekly, monthly and yearly so the user can view statistics about who won in the given time period. the user should be able to edit the names of the players. 


Features Required:
-scoring system
-home button (on each page)
-new round button (on home page which begins the round)
-statistics button (allows user to view past results, on home page)
-settings button (where user can change edit the player's names and the side names, on home page)


Target Platform:
mobile first website

Additional Requirements:
-scores must be documented and remebered even if the user leaves the website


========================
OUTPUT REQUIREMENTS
========================

1. Provide separate sections for:
   - index.html
   - styles.css
   - script.js

2. Code must include:
   - Clear comments marking where I should customize content
   - Placeholder text like:
     "/* INSERT GAME LOGIC HERE */"
     "/* REPLACE WITH YOUR UI */"

3. HTML:
   - Semantic structure
   - Clearly labeled sections for:
     - Game container
     - UI elements (score, controls, etc.)
   - Comments indicating where to modify layout

4. CSS:
   - Organized and modular
   - Use variables where possible
   - Include clear sections:
     - Layout
     - Components
     - Utilities
   - Comment where to change styling

5. JavaScript:
   - Modular, readable structure
   - Use functions or classes where appropriate
   - Include clear sections:
     - Initialization
     - Game loop (if applicable)
     - Event handling
     - State management
   - Comment placeholders for:
     - Game logic
     - Rendering
     - User input

6. Reusability:
   - Code should be easy to adapt for different games or apps
   - Avoid hardcoding specific content
   - Use configurable variables where possible

7. Do NOT:
   - Add story, theme, or creative flavor
   - Add unnecessary styling or branding
   - Make assumptions beyond the provided specification

========================
CLARITY REQUIREMENT
========================

Use clear comment markers like:

// === CUSTOMIZE BELOW ===
// === END CUSTOM SECTION ===

so I can easily identify where to insert my own game details.

========================
END
========================