# Graph Report - Mirabel  (2026-08-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 395 nodes · 628 edges · 41 communities (28 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cddb6f78`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25

## God Nodes (most connected - your core abstractions)
1. `ProviderError` - 27 edges
2. `ChatConsumer` - 20 edges
3. `get_api_key()` - 17 edges
4. `Provider` - 14 edges
5. `Mirabel — Project Guide for Claude Code` - 13 edges
6. `Message` - 12 edges
7. `ProviderCredential` - 11 edges
8. `ModelPreference` - 10 edges
9. `generate_reply()` - 10 edges
10. `calculate_salience()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `chat()` --uses--> `Conversation`  [INFERRED]
  backend/core/views.py → backend/core/models.py
- `ChatConsumer` --uses--> `Conversation`  [INFERRED]
  backend/voice/consumers.py → backend/core/models.py
- `chat()` --uses--> `Message`  [INFERRED]
  backend/core/views.py → backend/core/models.py
- `ChatConsumer` --uses--> `Message`  [INFERRED]
  backend/voice/consumers.py → backend/core/models.py
- `model_preference()` --uses--> `ModelPreference`  [INFERRED]
  backend/core/views.py → backend/core/models.py

## Import Cycles
- None detected.

## Communities (41 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (35): AsyncWebsocketConsumer, ModelPreference, Singleton row (pk=1) holding the currently selected LLM provider/model. No…, generate_reply(), Any, Call the configured LLM provider with RAG-augmented system prompt. Returns a…, get_provider(), format_memories_for_prompt() (+27 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (35): ChatInput(), handleKeyDown(), submit(), ChatScreen(), handleSend(), nextId(), PROMPTS, CozyHeader() (+27 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (20): Anthropic, AnthropicProvider, retry, Provider, ProviderError, Yields text deltas. Used by the voice/WebSocket pipeline., Raised when a provider cannot fulfil a text-generation request., get_api_key() (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (29): Conversation, Message, Meta, Role, MemorySummaryAdmin, MemorySummary, Meta, Periodic emotional rollup written by the weekly Celery beat task. Lives in… (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (26): axios, clsx, framer-motion, dependencies, axios, clsx, framer-motion, lucide-react (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (12): App(), CozyBackdrop(), useDust(), draw(), fit(), CozyFlow(), HomeLayout(), HomeNavbar() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.19
Nodes (13): api_view, _fernet(), ProviderCredential, API key for one provider, editable from the frontend. Takes priority over the…, chat(), _credential_status(), health(), model_preference() (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): autoprefixer, eslint, eslint-plugin-react, eslint-plugin-react-hooks, devDependencies, autoprefixer, eslint, eslint-plugin-react (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (9): calculate_salience(), Salience scoring — explainable, tunable, no ML. Two public functions:…, Returns a salience score in [0.0, 1.0]. Higher = more worth remembering.…, Combined retrieval score for re-ranking Chroma similarity hits. similarity :…, score_for_retrieval(), High-similarity-but-old should still be competitive against low-similarity-but-…, RetrievalScoringOrderTests, SalienceCalculationTests (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (15): Coding conventions, Error handling conventions, graphify, Hard rules (do not violate), Known gaps (tracked, not oversights), Mirabel — Project Guide for Claude Code, Monorepo layout, Phase 2 rules (memory) (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (8): Before writing any code, Error handling, Every change must survive this checklist, Known, intentional gaps — do not "fix" these as a side effect, Mirabel — Agent Instructions, Phase status, Providers (`core/services/providers/*_provider.py`), Voice pipeline

### Community 12 - "Community 12"
Cohesion: 0.47
Nodes (5): CozyWave(), draw(), fit(), LAYERS, readLevel()

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (3): Mirabel — Tsundere Voice Assistant, Monorepo layout, Quick start (Phase 1)

## Knowledge Gaps
- **63 isolated node(s):** `Migration`, `Migration`, `Migration`, `Migration`, `Role` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ProviderError` connect `Community 2` to `Community 0`, `Community 6`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `ChatConsumer` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `calculate_salience()` connect `Community 8` to `Community 3`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `ProviderError` (e.g. with `AnthropicProvider` and `GeminiProvider`) actually correct?**
  _`ProviderError` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `ChatConsumer` (e.g. with `Conversation` and `Message`) actually correct?**
  _`ChatConsumer` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `get_api_key()` (e.g. with `.stream_text()` and `ProviderCredential`) actually correct?**
  _`get_api_key()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Migration`, `Migration`, `Migration` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._