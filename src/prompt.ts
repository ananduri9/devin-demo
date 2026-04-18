export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string };
  labels: Array<{ name: string }>;
}

export function buildDevinPrompt(issue: GitHubIssue, repo: string): string {
  const labels = issue.labels.map((l) => l.name).join(', ') || 'none';
  const body = issue.body?.trim() || '(No description provided. Infer the problem from the title and any surrounding context in the codebase.)';

  return `You are acting as an autonomous principal software engineer. Your task is to resolve a GitHub issue, implement a fix, write regression tests, and open a pull request for human review.

## The Issue

- Repository: ${repo}
- Issue Number: #${issue.number}
- Title: ${issue.title}
- URL: ${issue.html_url}
- Opened by: @${issue.user.login}
- Labels: ${labels}

### Issue Description

${body}

## Your Instructions

### Step 1 — Understand Before You Change

1. Read the issue description carefully. If anything is ambiguous, examine the codebase for context before making assumptions.
2. Locate the files most likely responsible for the described behavior. Use search tools to trace the relevant code path.
3. Reproduce the problem mentally (or via a test run if the repo has a test command) before writing a single line of fix code.
4. Identify the root cause. Do not treat symptoms — fix the underlying problem.

### Step 2 — Implement the Fix

1. Make the smallest change that correctly fixes the root cause. Prefer surgical edits over large refactors.
2. Do not change unrelated code. Do not "clean up" files that are not part of this fix — that belongs in a separate PR.
3. If the fix requires touching a shared utility, interface, or type, update all call sites — do not leave partial changes that break the build.
4. Make sure the code compiles and passes linting before moving on. Run the project's build or typecheck command if one exists.

### Step 3 — Write Regression Tests

1. Add at least one automated test that directly exercises the bug scenario and would have caught this issue before it was filed.
2. Place the test in the appropriate test file or create a new one following the existing naming conventions of the repo.
3. The test must fail on the unfixed codebase and pass after your fix. If you cannot verify this, state it explicitly in the PR body.
4. Do not delete or weaken any existing tests.
5. If the repo has no test suite, or it's too difficult to find the right place to add a test, do not create a test but make a note of it in your PR.

### Step 4 — Open a Pull Request

1. Commit your changes with a clear, imperative commit message (e.g., "fix: handle null user in session parser").
2. Push to a new branch named: fix/issue-${issue.number}
3. Open a pull request with:
   - Title: "fix: ${issue.title} (#${issue.number})"
   - Body using this template exactly:

---
## Summary

Closes #${issue.number}

<!-- One paragraph: what was the root cause, and how does the fix address it? -->

## Changes

<!-- Bullet list of files changed and why -->

## Testing

<!-- How to run the regression test(s) you added. Include the exact command. -->

## Notes for Reviewer

<!-- Anything the human reviewer should pay special attention to, potential edge cases, or follow-up work that is explicitly out of scope for this PR. -->
---

4. Do NOT merge the PR. Leave it open for human review.
5. Do NOT close the original issue — it will auto-close when the PR is merged.
6. Request a review from @${issue.user.login} if the repo settings permit it.
7. Do NOT wait for CI checks to pass. Mark your work complete as soon as the PR is open.

## Quality Checklist

Before marking your work complete, verify:
- [ ] The fix addresses the root cause described in the issue, not a symptom
- [ ] The code compiles and lints without errors
- [ ] At least one regression test exists and passes
- [ ] No unrelated files were modified
- [ ] The PR body is filled out (not left as template placeholders)
- [ ] The branch name is fix/issue-${issue.number}
- [ ] The PR references "Closes #${issue.number}"
- [ ] The PR is open and unmerged

If you discover that the issue is already fixed, unclear, or requires a design decision beyond your authority, open the PR with your analysis and mark it as a draft. Add a comment explaining what clarification is needed.`;
}
