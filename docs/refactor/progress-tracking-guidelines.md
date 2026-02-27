# Progress Tracking Guidelines (No Excuses Version)

Date: 2026-02-27  
Status: Draft

## Purpose
This document forces strict, verifiable progress. If any requirement is missing or unclear, the step is rejected.

## Audience
This is written for someone who needs explicit instructions. Follow it exactly.

## Hard Rules
1. No step is complete without all required evidence.
2. Missing evidence means FAIL, even if the code works.
3. If any passing criterion is not proven, the step is FAIL.
4. If scope drifts beyond the step definition, the step is FAIL.
5. If you are unsure, STOP and mark the step as INCOMPLETE.

## What You Must Submit for Every Step
You must include every section below. Use the exact section titles.

### Step Header
Provide the exact step id and name.
Example: "Phase 3, Step 3.2 - Legacy Drag Adapters (No Math Changes)"

### Goal Alignment (Required Format)
You must use this exact structure. If any part is missing or unclear, the step is FAIL.

1. Step Goal
   - Restate the problem the step is solving in one sentence.
2. Solution
   - Describe the intended solution in plain language.
3. Code Implementation
   - Summarize the concrete code changes (files + functions).
4. Why This Solves the Problem
   - Explain how the code changes actually solve the stated problem.
   - If the explanation does not clearly connect the code to the goal, the step is FAIL.

### Passing Criteria (Required)
List every passing criterion for this step exactly as written in the plan.
For each criterion, write PASS or FAIL and prove it.

Format:
Criterion: <exact text from plan>  
Result: PASS or FAIL  
Evidence: <file path + line numbers OR manual test notes>

If any criterion is FAIL, the step is FAIL. Stop and report.

### Scope Boundary (Required)
State what did NOT change. Use full sentences.
Include both statements below:
1. "I did not change behavior outside this step."
2. "I did not add new math unless the step explicitly allows it."

If either statement is false, the step is FAIL.

### Code Evidence (Required)
For every changed file, list:
1. Absolute file path.
2. Exact function names.
3. Exact line numbers (1-based).
4. A short snippet (5 to 10 lines).

If any changed file is missing from this list, the step is FAIL.

### Matrix Evidence (Required for Drag/Nudge Steps)
If the step touches drag or nudge, you must include this section.
If not, write: "Not applicable."

For each Yes or Specificity cell you touched:
1. Matrix row id (R#).
2. Matrix column id (C#).
3. Plain language behavior.
4. Evidence: file path + function + line numbers.
5. Result: PASS or FAIL.

If any Yes/Specificity cell is missing, the step is FAIL.

### Undo/Redo Evidence (Required for Drag/Nudge Steps)
If the step touches drag or nudge, you must include this section.
If not, write: "Not applicable."

You must state:
1. The rollback shape (forward/rollback structure).
2. Where it is created (file + function + line numbers).

If rollback is missing or unclear, the step is FAIL.

## Submission Template (Copy This)
Step: <Phase X, Step X.Y - name>

Goal Alignment:
1. Step Goal: <one sentence>
2. Solution: <plain language>
3. Code Implementation: <files + functions>
4. Why This Solves the Problem: <clear causal explanation>

Passing Criteria:
Criterion: <exact text from plan>  
Result: PASS/FAIL  
Evidence: <file path + line numbers OR manual test notes>

Scope Boundary:
I did not change behavior outside this step. PASS/FAIL  
I did not add new math unless the step explicitly allows it. PASS/FAIL

Code Evidence:
File: <absolute path>  
Function(s): <name>  
Lines: <start>-<end>  
Snippet:
```js
// 5 to 10 lines
```

Matrix Evidence:
Not applicable OR list entries:
Row: R#  
Column: C#  
Behavior: <plain language>  
Evidence: <file + function + line numbers>  
Result: PASS/FAIL

Undo/Redo Evidence:
Not applicable OR list entries:
Rollback shape: <describe>  
Source: <file + function + line numbers>

## Reviewer Checklist (User Verification)
The reviewer rejects the step if any item is missing or unclear.

1. Step id and name match the plan.
2. Every passing criterion has PASS and evidence.
3. All changed files are listed with line numbers and snippets.
4. Matrix evidence exists for drag/nudge steps.
5. Undo/redo evidence exists for drag/nudge steps.
6. Scope boundary statements are present and true.
7. No extra changes outside the step.
