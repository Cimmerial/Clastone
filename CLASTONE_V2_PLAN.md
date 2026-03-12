
## The Plan
### Changes Soon To Be Made

#### Design Questions:
- Should we allow for not recording watch date or any watches but still ranking the movie? If people dont want to do that? I think we should.

#### Ranking Modal REWORK 
- Universalize it:
    - ONE EDITING MODAL (for tv and movies):
        - Watch History
            - MATRIX opposed to ITEM LIST
                - Matrix columns
                    - Watch Type
                        - SINGLE DATE
                        - DATE RANGE
                        - LONG AGO
                    - Watch Time
                        - Changes based on WATCH TYPE
                    - Watch Amount
                        - Slider
                        - Displays WATCHTIME (1h 34m) for movies and WATCHPLACE (S3 E4) for shows.
                    - Watch Details
                        - Moving slider anywhere but 100 changes WATCH DETAILS to have a toggle option between CURRENTLY WATCHING and DNF
                - Examples:
                    - WATCH TYPE  | WATCH TIME      | WATCH AMOUNT | WATCH DETAILS
                    - SINGLE DATE | -/-/-         0 | XXX =======0 |      -
                    - SINGLE DATE | -/-/-         0 | XXX ==0----- | WATCHING/DNF
                    - DATE RANGE  | -/-/- > -/-/- 0 | XXX =======0 |      -
                    - DATE RANGE  | -/-/- > -/-/- 0 | XXX ===0---- | WATCHING/DNF
                    - LONG AGO    |       -       0 | XXX =======0 |      -
                    - LONG AGO    |       -       0 | XXX ====0--- | WATCHING/DNF
                - Sorted by date always, newest at the bottom.
                - When making new watch, default to SINGLE DATE -/-/- 100% watched
        - Rank editing
            - Allow for having optional RANK OVERRIDE where you can RECHOOSE the general class rank of the given entry.
        - Watchlist
            - Allow for clicking 'ADD TO WATCHLIST', if not on it, and if on it have options for 'GOTO WATCHLIST ENTRY', 'REMOVE FROM WATCHLIST'
        - Tagging
            - TODO AT LATER DATE
        - Remove
            - Double click REMOVE to remove entry entirely
        - Exiting
            - Have a 'SAVE AND EXIT' button always, a 'SAVE AND GO TO' button always as well. Also an 'ADD AS UNRANKED & EXIT' button.
                - Only is there if never ranked: 'ADD AS UNRANKED & EXIT'
        - Places where used:
            - Anywhere, it will almost always be the same.
    - ONE RANKING MODAL (people):
        - Very simple, just has the class placement system that tv/movies use, and if already ranked, then show next to nothing with a 'class override' option
        - Exiting
            - Have a 'SAVE AND EXIT' button always, a 'SAVE AND GO TO' button always as well. Also an 'ADD AS UNRANKED & EXIT' button.
                - Only is there if never ranked: 'ADD AS UNRANKED & EXIT'


#### The List Rankings++
- Dragging Between Sections
- Removing the movement arrows (as we have dragging and the rank change override within the new modal)
- Bigger creator/director/actor portaits in detailed view due to button removal
- Move EDIT WATCHES modal access button
- Add filtering back
- Class splitting, Class combining

#### Profile Viewer++
- Being able to scroll through ALL of a users ranked items, and having a quick access to RANK or ADD UNRANKED buttons to easily save based on another users lists.
    - Added as simple scrollable for their top 10 lists.
- Top 10 actors, Top 10 directors

#### Search++
- Alter search options: 
    - Toggles:
        - Query Toggles:
            - MOVIES/TVSHOWS/PEOPLE
        - Search Depth Toggles:
            - SIMPLE/EXTENSIVE
                - SIMPLE means just pull up the name and image and release year/age
                - EXTENSIVE means have their first 12 subentries (actors/directors/creators for tv/movies) and (tv/movies for actors/directors/creators)
- Search Results:
    - TV SHOW / MOVIE
        - RANK (green) / EDIT WATCHES (blue)
            - Both open same modal, edit watches is visual indicator that you have had one before, but show 'RANK' if entry is in unranked class UNRANKED
        - ADD UNRANKED (dim/washed out green) / REMOVE UNRANKED (red)
            - Remove requires double clicks 
        - ADD WATCHLIST (dim yellow) / REMOVE WATCHLIST (red)
            - Remove requires double clicks 
    - PERSON
        - Actor Section
            - ADD (green) / MOVE (blue)
            - ADD UNRANKED (dim/washed out green) / REMOVE UNRANKED (red)
                - Remove requires double clicks
        - Director Section
            - ADD (green) / MOVE (blue)
            - ADD UNRANKED (dim/washed out green) / REMOVE UNRANKED (red)
                - Remove requires double clicks 
- *Issue:* Some users cannot remember all they've seen off the top of their head, so this is to make it easier to find them.
- *Solution* Within search page there will be a browse tab where you can look at top ranked shows and movies, and scroll through them at great speed clicking add to unranked. 
- Searching MOVIES/TV based off of ACTORS/DIRECTORS saved and vice versa.

#### Database++
- Reduce total reads and writes
    - slightly longer batch waits
    - not storing runtime data and other data like it within the actor data structs

#### Movie Club NEW
- Movies clubs are groups you can join with friends, where you can have your [MOVIE_CLUB_NAME] homepage which shows top watchlists of members as well as top intersecting watchlist items of members.
- Features:
    - Watchlist Display
        - Watchlist overlaps
    - Viewing recent watches
    - Viewing current watches and progress (progress changes too)
    - Suggesting movies to others
        - Give them suggestion(s) based on movie(s) you have seen which are perhaps similar or send whats called a BLIND SUGGESTION
    - Comments (trash talk)
        - View their rankings, mark entry(s) that are too high and entry(s) which are too low and leave a comment.

#### Inbox NEW
- Updates from movie clubs come here, as well as any official Clastone patchnotes/updates.

#### Statistics Page (Profile Page++)
- We need to add more statistics here

