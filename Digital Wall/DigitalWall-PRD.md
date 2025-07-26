# Product Requirements Document (PRD)
## Digital Wall: Technical Architecture & Feature Specifications

### System Architecture

```
User Device → Native Share → Our PWA/App → API Gateway → Core Services
                     ↓
                Platform DMs → Automation Bot → Premium Upload Service
```

### Technical Stack
- **Frontend**: Next.js 14 PWA (installable for share menu integration)
- **Mobile Apps**: React Native (iOS/Android share extensions)
- **Backend**: FastAPI + PostgreSQL + Redis
- **Storage**: Cloudflare R2 (S3-compatible, no egress fees)
- **AI Layer**: Claude Sonnet 4 for content understanding
- **Queue**: BullMQ for async processing
- **CDN**: Cloudflare (global edge caching)

### Core Features - P0 (MVP)

#### 1. Native Share Integration
```typescript
// Share Extension Handler
interface ShareData {
  url?: string;
  text?: string;
  title?: string;
  files?: File[];
}

async function handleShare(data: ShareData) {
  const wallItem = await processSharedContent(data);
  await uploadToUserWall(wallItem);
  return showSuccessToast("Added to your wall!");
}
```

**Specifications:**
- iOS Share Extension (Action Extension)
- Android Share Target (Web Share API + Native)
- PWA Installation flow with share capability
- Fallback: Copy/paste URL support

#### 2. Wall Management System
- **Anonymous Walls**: No signup required, cookie-based
- **Registered Walls**: Account system for persistence
- **Wall Privacy**: Public/Private/Unlisted options
- **Item Limit**: 100 for free, unlimited for premium

#### 3. Content Processing Pipeline
```python
async def process_shared_content(content):
    # Extract metadata
    metadata = await ai_extract_context(content)
    
    # Generate preview
    preview = await generate_visual_preview(content)
    
    # Store with optimization
    stored_item = await store_with_cdn_optimization(preview, metadata)
    
    return stored_item
```

### P1 Features - Enhanced Experience

#### 1. DM-to-Wall Automation (Premium)
- Platform-specific bot accounts
- OAuth flow for user authorization
- Queue system for DM processing
- Auto-categorization via AI

#### 2. Taste Graph Algorithm
```python
# Simplified taste vector calculation
def calculate_wall_vibe(wall_items):
    embeddings = [get_embedding(item) for item in wall_items]
    wall_vector = np.mean(embeddings, axis=0)
    return {
        'vector': wall_vector,
        'diversity_score': calculate_diversity(embeddings),
        'primary_themes': extract_themes(embeddings)
    }
```

#### 3. Discovery Engine
- Similar walls recommendation
- Trending items (privacy-respecting)
- Daily/Weekly digest emails
- Anonymous browsing mode

### P2 Features - Growth Phase

1. **Collaborative Walls**
   - Multi-user curation
   - Permission management
   - Activity feed

2. **Export Capabilities**
   - PDF mood boards
   - JSON data export
   - Pinterest migration tool

3. **Analytics Dashboard**
   - View sources breakdown
   - Engagement metrics
   - Taste evolution over time

### Technical Specifications

#### API Design
```yaml
POST /api/walls/{wall_id}/items
  - Auth: Optional (anonymous allowed)
  - Body: ShareData object
  - Returns: WallItem with preview URL

GET /api/walls/{wall_id}
  - Public walls accessible without auth
  - Returns: Wall metadata + paginated items

POST /api/auth/link-platform
  - Links external platform for DM automation
  - OAuth flow initiation
```

#### Database Schema (Simplified)
```sql
-- Core tables
walls (id, owner_id?, privacy, created_at)
wall_items (id, wall_id, content_type, preview_url, metadata)
users (id, email?, premium_tier)

-- Taste graph tables  
item_embeddings (item_id, vector)
wall_similarities (wall_a, wall_b, similarity_score)
```

#### Performance Requirements
- Wall load time: <1.5s (2025 standards)
- Share-to-wall: <3s end-to-end
- 99.9% uptime SLA
- Mobile-first responsive design

### Security & Privacy
- End-to-end encryption for private walls
- No tracking pixels in shared content
- GDPR-compliant data handling
- Anonymous usage option always available

### Content Moderation
- AI-powered NSFW detection
- Community reporting system
- Three-strike policy for violations
- Appeals process for false positives