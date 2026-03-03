# Clastone

## Plan
- UI with mocked data (lists, entry rows, drag, classes, nav)
- TMDb integration (real posters/headshots start flowing in)
- Firebase data layer (persist lists, structure the schema)
- Auth (headshot password grid, account creation)
- Profile + Settings pages last

## Tech Stack
- **Frontend:** React (Vite), hosted on Vercel, auto-deploys from GitHub main
- **Backend/DB:** Firebase (Firestore for data, Auth for accounts)
- **API:** TMDb, images and metadata, cached to Firebase to minimize calls
- **Expected users:** 5-10

---

## Navigation
- Top-left "CLASTONE" logo, hover to reveal dropdown
  - Left group: Movies | TV Shows | Actors | Directors | Search
  - Right group: Profile | Settings

---

## Accounts & Auth

### Account Creation
- Choose a username
- Search for and select 4 actor/actress headshots as your password

### Login
- Presented with a 10x3 grid of 30 headshots
  - 4 are your password actors
  - 26 are decoys: mix of actors from things you've watched + random TMDb popular
- Select your 4 correct headshots in any order (order does not matter)

### Admin Override
- If a user forgets their password, admin can look up password directly in Firebase

---

## Lists
Each account has 4 independent lists, each with its own rankings:
1. Movies
2. TV Shows
3. Actors
4. Directors

---

## Classes

### Movies & TV Shows - Default Classes
| Class             | Alt Name          |
|-------------------|-------------------|
| S                 | OLYMPUS           |
| A                 | DAMN_GOOD         |
| B                 | GOOD              |
| C                 | ALRIGHT           |
| D                 | MEH               |
| F                 | BAD               |
| BABY              | BABY              |
| UNRANKED          | UNRANKED          |
| DELICIOUS_GARBAGE | DELICIOUS_GARBAGE |

- BABY: Content ranked separately for a young child, irrelevant to personal rankings
- UNRANKED: Default class for all newly added entries, not yet ranked
- DELICIOUS_GARBAGE: So bad it's good, excluded from main rankings
- BABY, UNRANKED, DELICIOUS_GARBAGE are excluded from percentile and absolute rankings
  - Their rank displays as [CLASS NAME] #[RANK IN CLASS] e.g. "BABY #4"

### Actors & Directors - Default Classes
- ABSOLUTE FAVORITE
- MARVELOUS
- AWESOME
- GREAT
- UNRANKED
- DELICIOUS_GARBAGE

### Custom Classes
- Can add new classes, rename any existing class
- Classes are fluid: easy to split, reorder, or restructure at any time

---

## Ranking System

### Movies & TV Shows
| Field          | Description                                                                 |
|----------------|-----------------------------------------------------------------------------|
| Percentile     | Better than X% of what you've seen in this category. e.g. #3/50 = 94%      |
| Absolute Rank  | X / Y (e.g. 3 / 50)                                                         |
| Number Ranking | Optional manual score, X / 10.0                                             |
| Rank in Class  | Position within the entry's class (e.g. #2 in S)                           |

- BABY, UNRANKED, DELICIOUS_GARBAGE show [CLASS] #[rank in class] instead of percentile/absolute

### Actors & Directors
| Field         | Description    |
|---------------|----------------|
| Absolute Rank | X / Y          |
| Rank in Class | Position within class |

- No percentile for actors/directors (these are favorites/saved, not exhaustive)

---

## Placement System

### Adding an Entry
- Search for a movie/show/person via TMDb
- Add watch dates: start date + end date, supports multiple watches
- Each watch can be ranked separately
- On ranking: select class first, then drag to position within that class

### Reordering Entries
- Drag entries up or down to reorder within a class or across the full list
- While dragging, entries minimize to name-only so placement is easier
- Can always change placement later

---

## TV Shows - Season Handling
- Each season is its own separate entry in the TV Shows list
  - e.g. "Game of Thrones S1", "Game of Thrones S2"
- Cross-links on each season entry scroll to and highlight related seasons

---

## Entry Data

### Movies & TV Shows
- PERCENTILE_RANK: better than X% in category
- ABSOLUTE_RANKING: X / Y
- NUMBER_RANKING: optional X / 10.0
- #_RNK_IN_CLASS: rank within class
- ENTRY_PIC: poster/thumbnail from TMDb
- TV_SHOW/MOVIE_NAME
- VIEWING_DATES: all watch periods (start to end)
- TOP_CAST_PICS: favorites shown first
- TOP_CAST_NAMES: favorites shown first
- CONFIG/SETTINGS_COG: entry settings
- QUICK_MOVEMENT_ARROWS: move up/down quickly
- TOTAL_WATCHTIME
- STICKER_TAGS: predefined + custom (e.g. BEST_MYSTERY, BEST_COMEDY, BEST_ANTHOLOGY)
- PERCENT_COMPLETED: 0 to infinity% (increments with each rewatch)

### Actors & Directors
- ABSOLUTE_RANKING: X / Y
- #_RNK_IN_CLASS
- PIC: headshot from TMDb
- PERSON_NAME
- BIRTHDAY
- TOP_PERFORMANCES_PICS: seen entries shown first
- TOP_PERFORMANCES_NAMES: seen entries shown first
- CONFIG/SETTINGS_COG
- QUICK_MOVEMENT_ARROWS

---

## Entry UI Layout

### Movies & TV Shows Row
```
| PERCENTILE_RANK  | NUMBER_RANKING | ENTRY_PIC | MOVIE/SHOW_NAME | TOP_CAST_PICS   | CONFIG_COG      |
| ABSOLUTE_RANKING | #_RNK_IN_CLASS | ENTRY_PIC | VIEWING_DATES   | TOP_CAST_NAMES  | MOVEMENT_ARROWS |
| STICKER_TAGS     | PERCENT_COMPLETED                                                                 |
```

### Actors & Directors Row
```
| ABSOLUTE_RANKING | (empty) | PIC | PERSON_NAME | TOP_PERFORMANCES_PICS   | CONFIG_COG      |
| #_RNK_IN_CLASS   | (empty) | PIC | BIRTHDAY    | TOP_PERFORMANCES_NAMES  | MOVEMENT_ARROWS |
```

---

## Pages

### Movies / TV Shows Page
- Full ranked list of entries, grouped by class
- Drag-to-reorder within and across classes

### Actors / Directors Page
- Full ranked list, grouped by class
- Same drag-to-reorder

### Search Page
- Search TMDb for movies, shows, people to add to lists

### Profile Page
- Top 5 Movies + Top 5 Shows
- 5 Most Recently Watched
- Pinned specific entries with custom predefined taglines

### Settings Page
- Rename classes
- Add/remove custom classes
- Manage sticker tags
- Account settings

---

## Data & Storage

### Firebase
- Account data (username, password actor IDs)
- All list data per user
- Cached TMDb images and metadata
- Autosave: throttled, roughly every 5 seconds

### TMDb API
- Fetch posters, headshots, cast info, metadata
- Cache results in Firebase to minimize repeat API calls