# Drive Planner Dashboard

## Overview
Drive Planner Dashboard is a city-first, forward-looking planning dashboard designed to help users understand **relative opportunity across days**, based on public event activity.

The product is intentionally **observational, not prescriptive**. It does not recommend actions or predict outcomes. Instead, it provides a calm, structured view of upcoming event density so users can plan their time more effectively.

This repository contains the **static frontend dashboard** for Drive Planner Pro.

---

## Product Principles
Baseline v1 is built around the following principles:

- **Inform, don’t prescribe**  
  The dashboard surfaces patterns and relative intensity without telling users what to do.

- **Relative intensity over absolute numbers**  
  Visual emphasis is used to compare days, not to rank or score them.

- **City-first identity**  
  This is not a generic dashboard. It is designed for a specific city and metro area.

- **Low-glare, calm UI**  
  The interface prioritizes readability and sustained use over visual novelty.

---

## Views

### Extended Outlook (Month)
- Rolling **next 30 days**
- Calendar-aligned, Monday–Sunday layout
- Displays:
  - Event count (`ec`)
  - Estimated attendance (`ae`)
- Intensity is represented via **tile background shading**
- Clicking a day navigates to Week view

### On the Horizon (Week)
- Rolling **7-day window starting today**
- Displays:
  - Event count per day
  - Estimated attendance per day
- Header intensity reflects the **maximum day intensity** in the week
- Clicking a day navigates to Day view

### Day View
- Displays one or more consecutive days
- Each day includes:
  - Date header
  - Event count
  - Estimated attendance
  - Full event cards (when available)
- Visual emphasis:
  - **Left-edge intensity indicator per day**
  - No full-background shading to preserve readability
- Empty days display a calm, intentional empty state

---

## Data & Intensity Model

- Event attendance values are **estimates**, based on publicly available information
- Attendance and event count are combined into a **normalized intensity value**
- Intensity is used differently by view:
  - Month view → background shading (grid context)
  - Week view → header emphasis
  - Day view → edge-based emphasis only

> Attendance estimates are provided for planning context, not prediction.

---

## What This Is Not (v1 Scope)
Baseline v1 intentionally does **not** include:

- Recommendations or rankings
- Predictive demand modeling
- End-time inference
- Personalization or preferences
- Filters or sorting
- Monetization logic

These are conscious exclusions to preserve clarity and trust.

---

## Technical Architecture

- Static HTML / CSS / JavaScript frontend
- Event data served as cached JSON via Netlify Functions
- No client-side persistence
- Single render path per view
- Explicit state management for:
  - Current view
  - Selected day
  - Week overrides

---

## Baseline Status

**Baseline v1 is locked.**

All core views, visual semantics, and interaction models are considered stable.  
Future work should be additive, scoped, and must not reintroduce glare, noise, or prescriptive language.

City-themed identity elements (e.g., subtle header imagery) are documented as a **future enhancement** and are not part of v1.
