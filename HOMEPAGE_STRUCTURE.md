# Homepage Structure Outline

## Current Layout
```
Homepage Header (Welcome to Clastone)
├── Hero Section (Track, Rate, Organize)
├── Features Section (existing)
├── Quick Start Section (existing)
└── Homepage Footer
```

## Proposed New Layout
```
Homepage Header (Welcome to Clastone)
├── Hero Section (Track, Rate, Organize)
├── Guide Section (NEW - Page descriptions & features)
├── Recommendation System Section (NEW - How to use app fully)
├── New & Upcoming Features Section (NEW - Expandable sections)
├── Total Stats Section (NEW - Global Clastone statistics)
├── Example Profile Section (NEW - @cimmerial profile showcase)
├── Features Section (existing - can be simplified/merged)
└── Quick Start Section (existing - can be simplified/merged)
```

## Section Details & Placement

### 1. Guide Section
**Placement:** After Hero Section
**Purpose:** Explain what each page does and key features
**Content:**
- Movies Page: Track/rate movies, custom classes, rankings
- TV Shows Page: Track/rate shows, seasons management
- Actors/Directors: Filmographies, custom classifications
- Friends Page: Social features, sharing, comparisons
- Settings: Customization, preferences, data management

### 2. Recommendation System Section  
**Placement:** After Guide Section
**Purpose:** Teach users how to maximize app usage
**Content:**
- Getting started workflow
- Advanced features discovery
- Best practices for organization
- Tips for efficient tracking

### 3. New & Upcoming Features Section
**Placement:** After Recommendation System
**Purpose:** Showcase recent additions and future roadmap
**Content:**
- Recently added features (minimal text, expandable)
- Coming soon items (minimal text, expandable)
- Version history highlights

### 4. Total Stats Section
**Placement:** After New Features
**Purpose:** Show global Clastone usage statistics
**Content:**
- Total ranked movies across all users
- Total ranked TV shows across all users
- Total active users
- Most popular categories/classes

### 5. Example Profile Section
**Placement:** After Stats Section
**Purpose:** Showcase example profile (@cimmerial@clastone.local)
**Content:**
- Profile preview card
- Link to view full example profile
- Brief description of profile features

### 6. Existing Sections (Simplified)
**Features Section:** Can be merged with Guide Section or simplified to key highlights only
**Quick Start Section:** Can be simplified to just navigation buttons

## Design Considerations
- All new sections should be collapsible/expandable
- Minimal initial text with "Read more" functionality
- Consistent styling with existing dark theme
- Mobile-responsive layout
- Interactive elements where appropriate

## File Structure Changes
- HomePage.tsx: Add new section components
- HomePage.css: Add styles for new sections
- Consider extracting sections into separate components for maintainability

Would you like me to proceed with implementing this structure? Any specific details for each section?
