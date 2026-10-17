# Support — UI plan

Add **Support** after Reliability in `Sidebar.tsx` → `/support`.

**Phase 1:** Case list, create, detail, conversation read with audit gate. **Phase 2:** assignee, filters by openedBy, export case PDF.

Components: `@chatlogix/ui` Card, Badge, Button; Vendors 12-col split; Billing badge variants (`info`, `warning`, `success`).

---

## Routes

| Screen | Route |
|---|---|
| Case list | `/support` |
| New case | `/support/new` |
| Case detail | `/support/:caseId` |
| Conversation | `/support/conversations/:conversationId?caseId=` |

---

## Case list (`/support`)

**User goal:** See open work; start new case.

```
Support                                    [ New case ]
Staff follow-up on a shop. Shop owners do not see this list.

Status [ Open ▼ ]    Shop [ search................ ]

Subject                      Shop            Status    Updated
Wallet not refilling         Annapoorna      Open      17 Oct 14:00
```

| Column | Source |
|---|---|
| Subject | `StaffCase.subject` |
| Shop | `Vendor.businessName` |
| Status | badge from `status` |
| Updated | `updatedAt` |

**Default filter:** `open`. **Sort:** `updatedAt` DESC. **Page size:** 25.

**Row click:** → `/support/:caseId`.

**States:** per overview — loading, empty, filter empty, error.

**Narrow:** stacked cards with subject + badge.

**A11y:** `New case` button `aria-label` "Create a new support case".

---

## New case (`/support/new`)

```
New case
Shop      [ search — or locked from link ]
Subject   [ ................................ ]
Chat id   [ optional UUID                    ]

[ Create case ]  [ Cancel ]
```

| Field | Validation |
|---|---|
| Shop | required |
| Subject | 3–140, disabled Create until met |
| Chat id | optional UUID; pre-filled from Reliability |

**Query:** `?vendorId=&conversationId=` — lock shop when from failure row.

**Cancel:** → `/support`.

---

## Case detail (`/support/:caseId`)

**Layout:** notes 7/12, context 5/12; stack on narrow.

```
← Cases
Wallet not refilling                         [ Open ▼ status actions ]
Annapoorna

┌─ Notes ──────────────────────┐  ┌─ Context ─────────────────────┐
│ 17 Oct  Staff                │  │ WALLET      ₹12.40            │
│ Called owner.                │  │ MARKUP      50%               │
│ [ textarea................ ] │  │ WHATSAPP    live              │
│ [ Add note ]                 │  │ LAST FAIL   Graph 500 @ …     │
│                              │  │ OPEN QUESTIONS (3)            │
│ [ Mark waiting ] [ Resolve ] │  │ • Do you deliver?             │
└──────────────────────────────┘  │ [ Adjust wallet ]             │
                                  │ [ Read conversation ]         │
                                  └───────────────────────────────┘
```

**Status buttons** — only allowed transitions (see instructions).

**Context labels:** uppercase micro-labels like `VendorDetailPanel` dl.

**Primary:** Add note (on submit); Resolve when closing.

**Destructive:** none unless Reject-style not applicable.

---

## Conversation read

```
← Case
Annapoorna · +91 98xxxx xxxx

┌ Customer  10:01 ─────────────────┐
│ Do you have the 1kg tin?         │
└──────────────────────────────────┘
                    ┌ Assistant  10:01  failed ─┐
                    │ We're unable to send…     │
                    │ (English: …)              │
                    └───────────────────────────┘
```

No composer. `contentEn` grey below when different from `content`.

**Loading:** "Loading the conversation…"

**Audit failure:** block UI — full sentence in instructions.

**A11y:** messages in `list` / `listitem`; sender in `aria-label`.

---

## Integration

| From | Element |
|---|---|
| Reliability | Open case CTA |
| Vendors | Optional "Open support case" secondary (**proposed**) |
| Context | Adjust wallet → `/vendors/:id` |
