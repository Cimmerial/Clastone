# Friends Feature Setup

This document explains how to set up the friends feature in Clastone with Firebase.

## Overview

The friends feature allows users to:
- Search for other users by username (fuzzy search)
- Send friend requests
- Accept/reject friend requests
- View friends' profiles (read-only)
- Browse friends' movie/TV/actor/director rankings with search and filters

## Firebase Setup

### 1. Deploy Firestore Rules

1. Open the Firebase Console
2. Go to your project
3. Navigate to Firestore Database → Rules
4. Replace the existing rules with the content from `firestore.rules`
5. Click "Publish"

### 2. Required Collections

The friends feature uses these Firestore collections:

#### `users`
- **Purpose**: Store user profile information including username
- **Fields**:
  - `username` (string): Unique username for search
  - `email` (string): User's email
  - `createdAt` (string): Account creation timestamp

#### `friends`
- **Purpose**: Bidirectional friendship relationships
- **Fields**:
  - `userId` (string): Current user's UID
  - `friendUid` (string): Friend's UID
  - `friendUsername` (string): Friend's username
  - `friendEmail` (string): Friend's email
  - `addedAt` (string): When friendship was established

#### `friendRequests`
- **Purpose**: Pending friend requests
- **Fields**:
  - `from` (string): Sender's UID
  - `to` (string): Recipient's UID
  - `fromUsername` (string): Sender's username
  - `createdAt` (string): When request was sent

### 3. Indexes for Performance

Create these composite indexes in Firebase Console → Firestore Database → Indexes:

#### `friendRequests` Collection
- **Fields**: `to` (Ascending), `createdAt` (Descending)
- **Collection Group**: No
- **Query Scope**: Collection

#### `friendRequests` Collection
- **Fields**: `from` (Ascending), `createdAt` (Descending)
- **Collection Group**: No
- **Query Scope**: Collection

#### `friends` Collection
- **Fields**: `userId` (Ascending), `addedAt` (Descending)
- **Collection Group**: No
- **Query Scope**: Collection

#### `users` Collection
- **Fields**: `username` (Ascending)
- **Collection Group**: No
- **Query Scope**: Collection

## Authentication Changes

### Username Requirement

The app now requires a username for all users:

1. **New Email Signups**: Username is required during registration
2. **Google Sign-in**: Users are prompted to set a username after first login
3. **Existing Users**: Will be prompted to set username on next login

### Username Rules
- 3-20 characters
- Letters, numbers, and underscores only
- Must be unique
- Case-insensitive search

## Security Rules Summary

The Firestore rules ensure:

1. **User Profiles**: Users can only edit their own profile, but anyone can read for search
2. **Friend Requests**: 
   - Can only send requests from your account
   - Can only read requests sent to you or by you
   - Can delete requests you sent or received
3. **Friends List**: Can only read/write friendship records involving you
4. **Rankings Data**: Users can only access their own rankings data
5. **Friend Profile Viewing**: Handled at the app level by checking friendship status first

## UI Features

### Navigation Changes
- Profile button replaced with Home icon (links to `/profile`)
- New Friends button with Users icon (links to `/friends`)

### Friends Page (`/friends`)
- Search users by username (fuzzy search)
- View pending friend requests at top
- Send friend requests (one per person)
- View current friends grid
- Click friends to view their profiles

### Friend Profile Page (`/friends/:friendId`)
- Only accessible for confirmed friends
- View friend's statistics and rankings
- Search/filter their content
- Read-only access (no editing)

### Username Setup Flow
- New users see username setup screen after login
- Clean, modern UI with validation
- Required before accessing main app

## Testing the Feature

1. **Create Test Accounts**: Create 2-3 accounts with different usernames
2. **Send Friend Requests**: Use one account to send requests to others
3. **Accept Requests**: Log into other accounts to accept/reject requests
4. **View Profiles**: Browse friends' rankings and test search/filters
5. **Test Security**: Try accessing non-friend profiles (should be blocked)

## Troubleshooting

### Common Issues

1. **"Friend not found" error**: Check that users are actually friends in the `friends` collection
2. **Search not working**: Verify the `users` collection indexes are created
3. **Permission denied**: Ensure Firestore rules are properly deployed
4. **Username conflicts**: Check for existing usernames in `users` collection

### Debug Steps

1. Check Firebase Console for data in collections
2. Verify Firestore rules are published
3. Check browser console for permission errors
4. Test with different user accounts

## Future Enhancements

Potential improvements for the friends feature:

- Friend activity feed
- Shared watchlists
- Movie recommendations from friends
- Group chats/discussions
- Friend ranking comparisons
- Social notifications
