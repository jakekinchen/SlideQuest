# Implementation Plan: Google Search, Resolution, and Rate Limiting

## Overview

This plan addresses three enhancements:
1. Add Google Search grounding to exploratory/audience channel text generation
2. Ensure slides are generated at 1K resolution (1024x576 for 16:9)
3. Rate-limit exploratory slide generation to max 1 per 20 seconds with context accumulation

---

## 1. Google Search Grounding for Text Models

### Current State Analysis

| Route | Model | Has Google Search? |
|-------|-------|-------------------|
| `/api/slide-gate` | gemini-2.0-flash | ✅ Yes (googleSearchRetrieval) |
| `/api/slide-followups` | gemini-2.0-flash | ❌ No |
| `/api/audience-question-followups` | gemini-2.0-flash | ❌ No |
| `/api/exploratory-input` | gemini-2.0-flash | ❌ No |
| `/api/answer-question` | gemini-2.0-flash | ❌ No |
| `/api/gemini` (image) | gemini-3-pro-image-preview | N/A (image model) |

### Decision: Where to Add Google Search

**Recommended: Add to `/api/exploratory-input`**

Reasoning:
- This route generates exploratory slides from presenter prompts
- Most likely to benefit from real-time factual grounding (presenter might ask about current events, recent tech, etc.)
- The slide-gate already has search grounding for live transcript analysis
- Adding to ALL routes would increase API costs significantly (billed per search query for Gemini 3)

**Secondary: Add to `/api/slide-followups`**
- Generates follow-up suggestions when slides are accepted
- Could benefit from grounding to suggest factual, timely content

**Skip for now:**
- `/api/audience-question-followups` - focuses on deepening existing Q&A, less need for web search
- `/api/answer-question` - answers should be grounded in presentation context, not web

### Implementation Steps

#### 1.1 Update `/api/exploratory-input/route.ts`

```typescript
// Add import
import { DynamicRetrievalMode } from "@google/generative-ai";

// Update model configuration (line 47-52)
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    responseMimeType: "application/json",
  },
  tools: [
    {
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: DynamicRetrievalMode.MODE_DYNAMIC,
        },
      },
    },
  ],
});
```

#### 1.2 Update `/api/slide-followups/route.ts`

Same pattern as above - add googleSearchRetrieval with MODE_DYNAMIC.

---

## 2. 1K Resolution for Exploratory and Audience Slides

### Current State

The `/api/gemini/route.ts` currently only specifies "16:9 aspect ratio" without explicit resolution:
- Line 85: `"16:9 aspect ratio suitable for presentations"`
- Line 95: `"16:9 aspect ratio suitable for presentations."`

### Target Resolution

For "1K resolution" with 16:9 aspect ratio:
- **1024x576** (1K width) - More reasonable for AI image generation
- Alternative: 1920x1080 (Full HD) - May be too large for fast generation

**Recommendation: Use 1024x576** - balances quality with generation speed.

### Implementation Steps

#### 2.1 Update `/api/gemini/route.ts`

Update the prompt to include explicit resolution:

**Line 80-85 (structured content prompt):**
```typescript
Design requirements:
- Clean, modern presentation aesthetic
- Clear visual hierarchy with the headline prominent
- Professional color scheme appropriate for the content
- Any supporting visuals should reinforce the message
- Resolution: 1024x576 pixels (16:9 aspect ratio)
```

**Line 93-95 (fallback prompt):**
```typescript
The image should be a professional, modern presentation slide. It should include the title and visual elements that explain the content.
Resolution: 1024x576 pixels (16:9 aspect ratio).
```

---

## 3. Rate Limiting for Exploratory Slide Generation

### Current State

Exploratory slides are generated from three sources in `useRealtimeAPI.ts`:

1. **`generateSlideFollowups(slide)`** - Called when ANY slide is accepted (line 506)
2. **`generateAudienceFollowups(slide)`** - Called when audience Q slide is accepted (line 501)
3. **`createExploratoryFromPrompt(prompt, currentSlide)`** - Called when presenter types a prompt

**Problem:** No rate limiting - slides can be generated in rapid succession.

### Proposed Solution

Implement a **debounced generation system** with:
- 20-second minimum interval between exploratory generations
- Context accumulation (instead of queueing, accumulate triggers and include all context in next generation)
- Single generation after interval with aggregated context

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Exploratory Generation Gate                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Trigger Sources:                                          │
│   ├── Slide accepted → accumulate slide info                │
│   ├── Audience Q accepted → accumulate question info        │
│   └── Presenter prompt → accumulate prompt                  │
│                                                             │
│   Gate Logic:                                               │
│   ├── If <20s since last generation: accumulate only        │
│   ├── If ≥20s: generate with ALL accumulated context        │
│   └── Clear accumulated context after generation            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

#### 3.1 Add rate limiting refs in `useRealtimeAPI.ts`

After line 80 (existing refs), add:

```typescript
// Rate limiting for exploratory slide generation
const lastExploratoryGenerationRef = useRef<number>(0);
const pendingExploratoryContextRef = useRef<{
  acceptedSlides: SlideData[];
  audienceQuestions: SlideData[];
  presenterPrompts: string[];
}>({
  acceptedSlides: [],
  audienceQuestions: [],
  presenterPrompts: [],
});
const exploratoryGenerationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const EXPLORATORY_INTERVAL_MS = 20000; // 20 seconds
```

#### 3.2 Create a unified exploratory generation function

```typescript
const triggerExploratoryGeneration = useCallback(
  async (forceNow = false) => {
    const now = Date.now();
    const timeSinceLast = now - lastExploratoryGenerationRef.current;
    const pendingContext = pendingExploratoryContextRef.current;

    // Check if we have any pending context to process
    const hasPendingContext =
      pendingContext.acceptedSlides.length > 0 ||
      pendingContext.audienceQuestions.length > 0 ||
      pendingContext.presenterPrompts.length > 0;

    if (!hasPendingContext) return;

    // If not enough time has passed and not forced, schedule for later
    if (timeSinceLast < EXPLORATORY_INTERVAL_MS && !forceNow) {
      // Clear any existing timeout
      if (exploratoryGenerationTimeoutRef.current) {
        clearTimeout(exploratoryGenerationTimeoutRef.current);
      }
      // Schedule generation for when interval elapses
      const delay = EXPLORATORY_INTERVAL_MS - timeSinceLast;
      exploratoryGenerationTimeoutRef.current = setTimeout(() => {
        void triggerExploratoryGeneration(true);
      }, delay);
      return;
    }

    // Time to generate! Mark the timestamp
    lastExploratoryGenerationRef.current = now;

    // Collect all accumulated context
    const slides = [...pendingContext.acceptedSlides];
    const questions = [...pendingContext.audienceQuestions];
    const prompts = [...pendingContext.presenterPrompts];

    // Clear pending context
    pendingExploratoryContextRef.current = {
      acceptedSlides: [],
      audienceQuestions: [],
      presenterPrompts: [],
    };

    // Build a comprehensive prompt combining all context
    const combinedPrompt = buildCombinedExploratoryPrompt(slides, questions, prompts);

    // Generate exploratory slides with the combined context
    // Use the existing createExploratoryFromPrompt or a new unified endpoint
    // ...
  },
  [/* dependencies */]
);
```

#### 3.3 Update trigger points to accumulate instead of generate directly

**Replace `generateSlideFollowups` call (line 506):**
```typescript
// OLD:
void generateSlideFollowups(slide);

// NEW:
pendingExploratoryContextRef.current.acceptedSlides.push(slide);
void triggerExploratoryGeneration();
```

**Replace `generateAudienceFollowups` call (line 501):**
```typescript
// OLD:
void generateAudienceFollowups(slide);

// NEW:
pendingExploratoryContextRef.current.audienceQuestions.push(slide);
void triggerExploratoryGeneration();
```

**Update `createExploratoryFromPrompt` to use the gate:**
```typescript
// Instead of generating immediately, accumulate and trigger
pendingExploratoryContextRef.current.presenterPrompts.push(prompt);
void triggerExploratoryGeneration();
```

#### 3.4 Create unified API endpoint (optional optimization)

Create `/api/exploratory-unified/route.ts` that accepts:
- Multiple accepted slides
- Multiple audience questions
- Multiple presenter prompts

And generates 1-2 slides that address all the accumulated context.

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/app/api/exploratory-input/route.ts` | Add googleSearchRetrieval tool |
| `src/app/api/slide-followups/route.ts` | Add googleSearchRetrieval tool |
| `src/app/api/gemini/route.ts` | Update prompts to specify 1024x576 resolution |
| `src/hooks/useRealtimeAPI.ts` | Add rate limiting logic with context accumulation |

---

## Testing Plan

1. **Google Search Grounding:**
   - Test exploratory prompt with current events topic
   - Verify search grounding metadata in response
   - Check that factual content is included in suggestions

2. **Resolution:**
   - Generate slides and verify image dimensions
   - Compare visual quality before/after

3. **Rate Limiting:**
   - Rapidly accept multiple slides
   - Verify only 1 exploratory generation per 20 seconds
   - Verify accumulated context is included in generation

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Google Search increases API costs | Use MODE_DYNAMIC so model decides when to search |
| Higher resolution may slow generation | 1024x576 is a reasonable balance |
| Rate limiting may feel unresponsive | 20s interval is short enough; accumulated context makes output more valuable |
| Complex accumulated context confuses model | Carefully structure the combined prompt |

---

## Questions for Clarification

1. **Resolution preference:** Is 1024x576 (1K width) acceptable, or do you want 1920x1080 (Full HD)?

2. **Rate limit interval:** Is 20 seconds the right interval, or would you prefer longer/shorter?

3. **Presenter prompts:** Should presenter prompts also be rate-limited, or should they always generate immediately (as the presenter is explicitly requesting)?
