-- Restore the six agent-approved proposals to human review (ADR 0019).
-- Target: Eddy production ilefwfpvphadsbptiaur; exact original approval/update stamps.
-- Idempotent: does not touch records edited or reviewed after the original write.
UPDATE public.lake_launches
SET approved=false, approved_at=null, launch_methods=ARRAY[]::text[],
    review_note='Pending human review. Proposed launch method: trailer. The following agent research is supporting evidence, not approval: ' || review_note,
    updated_at=now()
WHERE id IN ('70fd6828-2989-4ee8-a46a-68a2aaced37b','34ba4064-d390-4564-a314-ad9ebbe66d2a','92467ef6-2bf4-4a76-a1a3-ac8214189ee1','06fdf5fc-e6cd-42cd-bbf4-9fe6bc52ed76','99638840-def3-4069-937f-040295570761','54afadb9-ef27-4fa3-8439-b6bff935baea')
  AND approved=true
  AND approved_at='2026-11-09 23:01:56.540424+00'::timestamptz
  AND updated_at='2026-11-09 23:01:56.540424+00'::timestamptz
  AND review_note LIKE 'Source and imagery review by Codex on 2026-11-09;%'
RETURNING id,lake_slug,slug,approved,approved_at,launch_methods;
