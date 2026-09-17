# Training Dataset Full Regeneration Report

Generated at: **2026-09-15T11:37:15.316Z**
Quality Gate Status: **PASSED (100%)**

## 1. Executive Summary

| Metric | Before (Archive) | After (Regenerated) |
|---|---|---|
| Total Active Records | 185 | 185 |
| Exact Duplicate Summaries | 16 | 0 |
| Hallucinated Claims Rate | High (17+ categories) | 0% (Strictly Grounded) |
| Schema Compliance | Variable | 100% Valid |

## 2. Category Comparison Table

| Category | Records | Old Unique Openers | New Unique Openers | Old Opener Reuse | New Opener Reuse | Status |
|---|---|---|---|---|---|---|
| **Bedroom Storage** | 35 | 5 | 35 | 85.7% | 0.0% | ✔ PASS |
| **Beds** | 50 | 5 | 50 | 90.0% | 0.0% | ✔ PASS |
| **Kids Room** | 26 | 5 | 26 | 80.8% | 0.0% | ✔ PASS |
| **Mattresses** | 44 | 5 | 44 | 88.6% | 0.0% | ✔ PASS |
| **Pet Furniture** | 0 | 0 | 0 | 0% | 0% | ✔ PASS |
| **Wardrobes** | 30 | 30 | 30 | 0.0% | 0.0% | ✔ PASS |

## 3. Root Cause Analysis of Historical Archive Failures

1. **Static Fallback Generator**: The historical pipeline used 3-4 fixed paragraph templates that slot-filled material names onto identical sentence skeletons.
2. **Deterministic Modulo Rotation**: `hash % 5` rotation created predictable repetition cycles across similar catalog items.
3. **Ungrounded Marketing Assertions**: Assertions like *"smooth non-porous surfaces"*, *"traditional joinery"*, *"kiln-dried"*, and *"corner bracing"* were inserted indiscriminately without source validation.
4. **Rigid Rhetorical Skeleton**: Every summary was forced into an identical 5-part cadence regardless of product attributes.

## 4. Multi-Agent Solution Architecture

- **Fact Inventory Extraction**: Extracts only verifiable attributes from raw inputs.
- **Category Orchestrator**: Routes products to category-specific agents (`bedroom-storage`, `beds`, `mattresses`, `kids-room`, `wardrobes`, `pet-furniture`).
- **Grounding Auditor**: Audits every factual statement and bans ungrounded joinery/mechanical/ergonomic claims.
- **Repetition Auditor**: Multi-level check (Exact, Near-Duplicate, Structural, Semantic, Template Signature).
- **Cross-Product Category Memory**: Tracks accepted items to balance angles and prevent formula reuse.
